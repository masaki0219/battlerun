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

export function useLocation({ enabled }: { enabled: boolean }) {
  const measurementType = useRecordStore((s) => s.measurementType);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled || measurementType !== 'gps') return;

    let cancelled = false;

    const start = async () => {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || fgStatus !== 'granted') return;

      // バックグラウンド権限を要求（EASビルド時のみ有効、Expo Goでは無視）
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

      if (bgStatus === 'granted') {
        // バックグラウンド追跡（EASビルド + UIBackgroundModes が必要）
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
      } else {
        // フォアグラウンドのみ（Expo Go でも動作）
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
        if (cancelled) { watchRef.current?.remove(); watchRef.current = null; }
      }
    };

    start();

    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
      // バックグラウンドタスクを停止
      Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .then((started) => { if (started) Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); })
        .catch(() => {});
    };
  }, [enabled, measurementType]);
}
