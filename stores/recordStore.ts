import { create } from 'zustand';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { RecordStore, Activity, MeasurementType, RoutePoint } from '../types';
import { MAX_SPEED_KMH } from '../lib/constants';

function haversine(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(sin2));
}

function filterInvalidPoints(route: RoutePoint[]): RoutePoint[] {
  return route.filter((point, i) => {
    if (i === 0) return true;
    const prev = route[i - 1];
    const distKm = haversine(prev, point);
    const timeSec = (point.timestamp - prev.timestamp) / 1000;
    if (timeSec <= 0) return false;
    return (distKm / timeSec) * 3600 <= MAX_SPEED_KMH;
  });
}

/**
 * GPS追跡経路の状態。
 * - 'background': バックグラウンド位置情報タスクが追跡中
 * - 'foreground': フォアグラウンド監視のみで追跡中（バックグラウンドに移動すると停止する可能性あり）
 * - 'denied': 位置情報の権限がなく追跡できていない
 * - 'idle': GPS追跡を開始していない（歩数モード時・記録前など）
 */
export type LocationMode = 'background' | 'foreground' | 'denied' | 'idle';

interface RecordState extends RecordStore {
  startedAt: string | null;
  locationMode: LocationMode;
}

export const useRecordStore = create<RecordState>((set, get) => ({
  isRecording: false,
  measurementType: 'gps',
  distanceKm: 0,
  steps: 0,
  durationSeconds: 0,
  route: [],
  startedAt: null,
  locationMode: 'idle',

  startRecording: (type: MeasurementType) => {
    set({
      isRecording: true,
      measurementType: type,
      distanceKm: 0,
      steps: 0,
      durationSeconds: 0,
      route: [],
      startedAt: new Date().toISOString(),
      locationMode: 'idle',
    });
  },

  stopRecording: async () => {
    const state = get();
    const endedAt = new Date().toISOString();

    // 歩数モード: route は空なので store に累積した distanceKm をそのまま使う
    // GPS モード: チート防止済みの距離を route から再計算
    const validRoute = state.measurementType === 'gps' ? filterInvalidPoints(state.route) : [];
    const distanceKm = state.measurementType === 'steps'
      ? state.distanceKm
      : validRoute.reduce((sum, pt, i) => {
          if (i === 0) return sum;
          return sum + haversine(validRoute[i - 1], pt);
        }, 0);

    // setInterval ではなく開始時刻からの差分で計算
    // バックグラウンドから戻った後も正確な経過時間が得られる
    const durationSeconds = state.startedAt
      ? Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000)
      : 0;

    const activity: Activity = {
      id: '',
      userId: '',
      distanceKm,
      steps: state.steps,
      durationSeconds,
      measurementType: state.measurementType,
      route: validRoute,
      startedAt: state.startedAt ?? endedAt,
      endedAt,
    };

    set({ isRecording: false });
    return activity;
  },

  reset: () =>
    set({
      isRecording: false,
      distanceKm: 0,
      steps: 0,
      durationSeconds: 0,
      route: [],
      startedAt: null,
      locationMode: 'idle',
    }),
}));

// Firestore へのアクティビティ保存
// 参加中バトルへの距離加算（participants/category_stats）はCloud Functions側で集計する
export async function saveActivityToFirestore(params: {
  userId: string;
  displayName: string;         // 通知・活動履歴表示用
  activity: Activity;
  activeBattleIds?: string[];  // 省略時は空配列扱い
}): Promise<string | null> {
  const { userId, displayName, activity, activeBattleIds = [] } = params;

  if (activity.distanceKm <= 0) return null;

  // 1. activities コレクションに保存（battleId は先頭のアクティブバトルを代表として保持）
  const primaryBattleId = activeBattleIds[0] ?? null;
  const actRef = await addDoc(collection(db, 'activities'), {
    userId,
    displayName,
    battleId: primaryBattleId,   // 後方互換
    battleIds: activeBattleIds,  // 全参加バトルへの加算
    distanceKm: activity.distanceKm,
    steps: activity.steps ?? null,
    durationSeconds: activity.durationSeconds,
    measurementType: activity.measurementType,
    route: activity.route ?? [],
    startedAt: Timestamp.fromDate(new Date(activity.startedAt)),
    endedAt: Timestamp.fromDate(new Date(activity.endedAt)),
  });

  return actRef.id;
}
