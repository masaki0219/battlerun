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

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[LocationTask] error:', error.message);
    return;
  }
  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length) return;

  await hydrateRecordingSession();
  const state = useRecordStore.getState();
  if (!state.isRecording || state.isPaused || state.measurementType !== 'gps') return;

  for (const loc of locations) {
    const newPoint: RoutePoint = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      timestamp: loc.timestamp,
    };
    if (typeof loc.coords.altitude === 'number' && Number.isFinite(loc.coords.altitude)) {
      newPoint.alt = loc.coords.altitude;
    }
    useRecordStore.getState().appendRoutePoint(newPoint);
  }
});
