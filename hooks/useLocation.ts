import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useRecordStore } from '../stores/recordStore';
import { LOCATION_TASK_NAME } from '../lib/locationTask';
import type { RoutePoint } from '../types';

function haversine(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(sin2));
}

// バックグラウンド追跡が登録済みでも位置更新が届かなくなる「静かな停止」を検知するまでの猶予時間
const WATCHDOG_TIMEOUT_MS = 20000;
// ウォッチドッグの監視間隔
const WATCHDOG_CHECK_INTERVAL_MS = 5000;

/**
 * GPS追跡の動作条件:
 *
 * ■ バックグラウンド追跡（EASカスタムビルドのみ）
 *   - `expo-task-manager` と `UIBackgroundModes: ["location"]` が必要
 *   - bg権限が許可され、startLocationUpdatesAsync が成功した場合に使用
 *
 * ■ フォアグラウンド監視（フォールバック・Expo Go で動作）
 *   - bg権限が無い、または startLocationUpdatesAsync が失敗した場合に自動フォールバック
 *     （Expo Go では bg権限の取得自体は成功するが startLocationUpdatesAsync が
 *     LocationTaskManagerError を投げるため、これを捕捉してフォールバックする）
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

    const startForegroundWatch = async () => {
      // バックグラウンドタスクが先に登録されてしまっている場合は停止し、経路を1つに限定する
      // （ウォッチドッグ自体はフォアグラウンド監視中も継続して途絶を検知し続ける）
      await stopBackgroundTask();
      if (cancelled) return;

      try {
        watchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
          (loc) => {
            if (cancelled) return;
            const newPoint: RoutePoint = {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              timestamp: loc.timestamp,
            };
            useRecordStore.setState((state) => {
              const prevRoute = state.route;
              const added = prevRoute.length > 0 ? haversine(prevRoute[prevRoute.length - 1], newPoint) : 0;
              return { route: [...prevRoute, newPoint], distanceKm: state.distanceKm + added };
            });
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
      let lastRouteLen = useRecordStore.getState().route.length;
      let lastChangeAt = Date.now();
      watchdogRef.current = setInterval(() => {
        if (cancelled) return;
        const state = useRecordStore.getState();
        const currentLen = state.route.length;
        if (currentLen !== lastRouteLen) {
          lastRouteLen = currentLen;
          lastChangeAt = Date.now();
          if (state.gpsWarning) useRecordStore.setState({ gpsWarning: false });
          return;
        }
        if (Date.now() - lastChangeAt >= WATCHDOG_TIMEOUT_MS) {
          console.warn('[useLocation] watchdog: no location update received for', WATCHDOG_TIMEOUT_MS, 'ms');
          if (!state.gpsWarning) useRecordStore.setState({ gpsWarning: true });
          if (state.locationMode === 'background') {
            void startForegroundWatch();
          }
          // 次のチェックまでは再トリガーせず、更新再開の検知に専念する
          lastChangeAt = Date.now();
        }
      }, WATCHDOG_CHECK_INTERVAL_MS);
    };

    const start = async () => {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (fgStatus !== 'granted') {
        useRecordStore.setState({ locationMode: 'denied' });
        return;
      }

      // バックグラウンド権限を要求
      // ※ Expo Go では取得できても startLocationUpdatesAsync は失敗する
      // ※ EASビルド + UIBackgroundModes: ["location"] が必要
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: 'denied' as const }));
      if (cancelled) return;

      if (bgStatus === 'granted') {
        // バックグラウンド追跡を試行。失敗時はフォアグラウンド監視へフォールバックする
        try {
          const isRegistered = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
          if (!isRegistered) {
            await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
              accuracy: Location.Accuracy.BestForNavigation,
              timeInterval: 1000,
              distanceInterval: 2,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: '記録中',
                notificationBody: 'ZELIO がGPSを追跡しています',
              },
            });
          }
          if (cancelled) return;
          useRecordStore.setState({ locationMode: 'background' });
          startWatchdog();
        } catch (e) {
          console.warn('[useLocation] startLocationUpdatesAsync failed, falling back to foreground watch:', e);
          if (cancelled) return;
          await startForegroundWatch();
        }
      } else {
        // bg権限なし: フォアグラウンド監視のみ
        await startForegroundWatch();
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
