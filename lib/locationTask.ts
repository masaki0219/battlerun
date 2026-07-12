/**
 * バックグラウンド位置情報タスク定義
 * このファイルは app/_layout.tsx でインポートし、アプリ起動時に登録する。
 *
 * ⚠️  Expo Go では動作しない。EAS カスタムビルドが必要。
 *    app.json に "UIBackgroundModes": ["location"] を追加すること。
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { useRecordStore, hydrateRecordingSession } from '../stores/recordStore';
import type { RoutePoint } from '../types';

export const LOCATION_TASK_NAME = 'battlerun-background-location';

function haversine(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(sin2));
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[LocationTask] error:', error.message);
    return;
  }
  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length) return;

  await hydrateRecordingSession();
  const state = useRecordStore.getState();
  if (!state.isRecording || state.measurementType !== 'gps') return;

  for (const loc of locations) {
    const newPoint: RoutePoint = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      timestamp: loc.timestamp,
    };
    useRecordStore.setState((s) => {
      const prev = s.route[s.route.length - 1];
      const added = prev ? haversine(prev, newPoint) : 0;
      return { route: [...s.route, newPoint], distanceKm: s.distanceKm + added };
    });
  }
});
