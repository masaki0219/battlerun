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
 *     フォアグラウンド監視へ自動切替し、記録画面に警告バナーを表示する
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
      // ウォッチドッグ経由の切替時に二重発火しないよう先に停止する
      stopWatchdog();
      // バックグラウンドタスクが先に登録されてしまっている場合は停止し、経路を1つに限定する
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
      } catch (e) {
        console.warn('[useLocation] watchPositionAsync failed:', e);
        useRecordStore.setState({ locationMode: 'denied' });
      }
    };

    // バックグラウンド追跡中、WATCHDOG_TIMEOUT_MS の間ルートに新しい点が
    // 追加されなければ「静かな停止」とみなし、フォアグラウンド監視へ切り替える
    const startWatchdog = () => {
      stopWatchdog();
      let lastRouteLen = useRecordStore.getState().route.length;
      let lastChangeAt = Date.now();
      watchdogRef.current = setInterval(() => {
        if (cancelled) return;
        const currentLen = useRecordStore.getState().route.length;
        if (currentLen !== lastRouteLen) {
          lastRouteLen = currentLen;
          lastChangeAt = Date.now();
          return;
        }
        if (Date.now() - lastChangeAt >= WATCHDOG_TIMEOUT_MS) {
          console.warn('[useLocation] watchdog: no location update received, falling back to foreground watch');
          void startForegroundWatch();
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
                notificationBody: 'BattleRun がGPSを追跡しています',
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
      useRecordStore.setState({ locationMode: 'idle' });
    };
  }, [enabled, measurementType]);
}
