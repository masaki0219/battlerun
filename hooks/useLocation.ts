import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { useRecordStore } from '../stores/recordStore';
import { LOCATION_TASK_NAME } from '../lib/locationTask';
import type { GpsInputPoint } from '../utils/gpsProcessing';
import {
  GPS_ANDROID_TIME_INTERVAL_MS,
  GPS_DISTANCE_INTERVAL_M,
} from '../utils/gpsProcessing';
import { translate } from '../lib/translate';

// バックグラウンド追跡が登録済みでも位置更新が届かなくなる「静かな停止」を検知するまでの猶予時間
const WATCHDOG_TIMEOUT_MS = 20000;
// ウォッチドッグの監視間隔
const WATCHDOG_CHECK_INTERVAL_MS = 5000;

/**
 * GPS追跡の動作条件:
 *
 * ■ バックグラウンド追跡（EASカスタムビルドのみ）
 *   - `expo-task-manager` と `UIBackgroundModes: ["location"]` が必要
 *   - 前景権限があれば「使用中のみ」でも使用する。画面OFF・他アプリ利用中も計測が続く
 *   - bg権限（常に許可）は、アプリ終了後もOSに計測を再開させたい場合にだけ効く
 *
 * ■ フォアグラウンド監視（フォールバック・Expo Go で動作）
 *   - startLocationUpdatesAsync が失敗した場合に自動フォールバック
 *     （Expo Go では startLocationUpdatesAsync が LocationTaskManagerError を
 *     投げるため、これを捕捉してフォールバックする）
 *   - アプリをバックグラウンドに移動すると追跡が止まる可能性がある
 *     （記録画面の警告バナーで明示する）
 *
 * ■ ウォッチドッグ（「静かな停止」対策）
 *   - startLocationUpdatesAsync 自体は成功しても、OS側の事情で位置更新が
 *     一切届かなくなるケースがある（例外を投げないため try/catch では検知できない）
 *   - WATCHDOG_TIMEOUT_MS の間ルートに新しい点が追加されなければ、
 *     recordStore.gpsWarning を true にして記録画面に警告バナーを表示する。
 *     バックグラウンドタスク稼働中ならフォアグラウンド監視へ自動切替もする
 *   - 位置更新が再開すると gpsWarning は自動的に false に戻る
 *   - フォアグラウンド監視に切り替わった後も監視は続行する（そこでも
 *     途絶しうるため）。記録停止時にのみ監視を止める
 *
 * いずれの場合も、バックグラウンドタスクとフォアグラウンド監視が同時に
 * 有効化されないようガードし、距離の二重加算を防ぐ。
 */
export function useLocation({ enabled }: { enabled: boolean }) {
  const measurementType = useRecordStore((s) => s.measurementType);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || measurementType !== 'gps') return;

    let cancelled = false;

    const stopWatchdog = () => {
      if (watchdogRef.current) {
        clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
    };

    const stopBackgroundTask = async () => {
      const isRegistered = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
      }
    };

    const startForegroundWatch = async (countAsFallback = false) => {
      // バックグラウンドタスクが先に登録されてしまっている場合は停止し、経路を1つに限定する
      // （ウォッチドッグ自体はフォアグラウンド監視中も継続して途絶を検知し続ける）
      await stopBackgroundTask();
      if (cancelled) return;
      watchRef.current?.remove();
      watchRef.current = null;
      if (countAsFallback) useRecordStore.getState().noteForegroundFallback();

      try {
        watchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            // timeInterval は expo-location 19 の型上 Android のみ。iOSの頻度制御には使わない。
            ...(Platform.OS === 'android' ? { timeInterval: GPS_ANDROID_TIME_INTERVAL_MS } : {}),
            // 更新通知条件でありノイズ除去の代用ではない。3m commitAnchor処理は常時別に行う。
            distanceInterval: GPS_DISTANCE_INTERVAL_M,
          },
          (loc) => {
            if (cancelled) return;
            const newPoint: GpsInputPoint = {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              timestamp: loc.timestamp,
              accuracy: loc.coords.accuracy,
              speed: loc.coords.speed,
            };
            if (typeof loc.coords.altitude === 'number' && Number.isFinite(loc.coords.altitude)) {
              newPoint.alt = loc.coords.altitude;
            }
            if (typeof loc.coords.altitudeAccuracy === 'number' && Number.isFinite(loc.coords.altitudeAccuracy)) {
              newPoint.altitudeAccuracy = Math.max(0, loc.coords.altitudeAccuracy);
            }
            useRecordStore.getState().appendRoutePoint(newPoint, 'foreground');
          }
        );
        if (cancelled) { watchRef.current?.remove(); watchRef.current = null; return; }
        useRecordStore.setState({ locationMode: 'foreground' });
        startWatchdog();
      } catch (e) {
        console.warn('[useLocation] watchPositionAsync failed:', e);
        stopWatchdog();
        useRecordStore.setState({ locationMode: 'denied', gpsWarning: false });
      }
    };

    // WATCHDOG_TIMEOUT_MS の間ルートに新しい点が追加されなければ「静かな停止」とみなし、
    // gpsWarning を立てる（バックグラウンド追跡中ならフォアグラウンド監視へも切り替える）。
    // 記録停止までモードを問わず監視を継続し、更新が再開すれば gpsWarning を自動的に戻す。
    const startWatchdog = () => {
      stopWatchdog();
      let lastLocationAt = useRecordStore.getState().lastLocationAt;
      let lastChangeAt = Date.now();
      watchdogRef.current = setInterval(() => {
        if (cancelled) return;
        const state = useRecordStore.getState();
        const currentLocationAt = state.lastLocationAt;
        if (currentLocationAt !== lastLocationAt) {
          lastLocationAt = currentLocationAt;
          lastChangeAt = Date.now();
          if (state.gpsWarning) useRecordStore.setState({ gpsWarning: false });
          return;
        }
        if (Date.now() - lastChangeAt >= WATCHDOG_TIMEOUT_MS) {
          console.warn('[useLocation] watchdog: no location update received for', WATCHDOG_TIMEOUT_MS, 'ms');
          if (!state.gpsWarning) useRecordStore.setState({ gpsWarning: true });
          if (state.locationMode === 'background') {
            // 実際に更新が途絶した復旧なので、次の良好点は前点と接続しない。
            useRecordStore.getState().requestGpsSegmentBreak();
            void startForegroundWatch(true);
          }
          // 次のチェックまでは再トリガーせず、更新再開の検知に専念する
          lastChangeAt = Date.now();
        }
      }, WATCHDOG_CHECK_INTERVAL_MS);
    };

    const start = async () => {
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      if (fgStatus !== 'granted') {
        useRecordStore.setState({ locationMode: 'denied' });
        return;
      }

      // 「常に許可」が無くてもバックグラウンド追跡を試す。
      // expo-location は前景権限だけで startLocationUpdatesAsync を許可する:
      //   iOS   … UIBackgroundModes: ["location"] があればタスク側が
      //           allowsBackgroundLocationUpdates を立てる（画面OFF・他アプリ利用中も継続する）
      //   Android … foregroundService 付きで起動すれば ACCESS_BACKGROUND_LOCATION は不要
      // 「常に許可」が効くのはアプリ終了後もOSに計測を再開させたい場合だけなので、
      // ここで権限を見て経路を分けると「使用中のみ」の利用者だけ他アプリ切替で計測が切れてしまう。
      // ※ Expo Go では startLocationUpdatesAsync が失敗するため、下のフォールバックで前景監視に落ちる
      try {
        const isRegistered = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
        if (!isRegistered) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.BestForNavigation,
            // timeInterval は Android のみ。iOSではCore Locationの更新頻度に依存する。
            ...(Platform.OS === 'android' ? { timeInterval: GPS_ANDROID_TIME_INTERVAL_MS } : {}),
            distanceInterval: GPS_DISTANCE_INTERVAL_M,
            activityType: Location.ActivityType.Fitness,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: translate('run.foregroundServiceTitle'),
              notificationBody: translate('run.foregroundServiceBody'),
            },
          });
        }
        if (cancelled) {
          // 起動処理中に記録が停止された場合、cleanupが登録前に走っていても
          // 高精度バックグラウンドタスクを残さない。
          await stopBackgroundTask();
          return;
        }
        useRecordStore.setState({ locationMode: 'background' });
        startWatchdog();
      } catch (e) {
        console.warn('[useLocation] startLocationUpdatesAsync failed, falling back to foreground watch:', e);
        if (cancelled) return;
        await startForegroundWatch(true);
      }
    };
    start();

    return () => {
      cancelled = true;
      stopWatchdog();
      watchRef.current?.remove();
      watchRef.current = null;
      stopBackgroundTask();
      useRecordStore.setState({ locationMode: 'idle', gpsWarning: false });
    };
  }, [enabled, measurementType]);
}
