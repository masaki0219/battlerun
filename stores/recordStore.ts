import { create } from 'zustand';
import {
  addDoc, collection, doc, updateDoc, increment, serverTimestamp, getDoc,
} from 'firebase/firestore';
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

interface RecordState extends RecordStore {
  startedAt: string | null;
}

export const useRecordStore = create<RecordState>((set, get) => ({
  isRecording: false,
  measurementType: 'gps',
  distanceKm: 0,
  steps: 0,
  durationSeconds: 0,
  route: [],
  startedAt: null,

  startRecording: (type: MeasurementType) => {
    set({
      isRecording: true,
      measurementType: type,
      distanceKm: 0,
      steps: 0,
      durationSeconds: 0,
      route: [],
      startedAt: new Date().toISOString(),
    });
  },

  stopRecording: async () => {
    const state = get();
    const endedAt = new Date().toISOString();
    const validRoute = filterInvalidPoints(state.route);

    // チート防止済みの距離を再計算
    const distanceKm = validRoute.reduce((sum, pt, i) => {
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
      teamId: '',
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
    }),
}));

// Firestore へのアクティビティ保存 + チーム距離更新 + 参加中の全アクティブバトルに距離加算
export async function saveActivityToFirestore(params: {
  userId: string;
  activity: Activity;
  teamId?: string;             // 所属チームID（省略時はチーム距離更新をスキップ）
  activeBattleIds?: string[];  // 省略時は空配列扱い
}): Promise<void> {
  const { userId, activity, teamId, activeBattleIds = [] } = params;

  // 1. activities コレクションに保存
  await addDoc(collection(db, 'activities'), {
    userId,
    teamId: teamId ?? null,
    distanceKm: activity.distanceKm,
    steps: activity.steps ?? null,
    durationSeconds: activity.durationSeconds,
    measurementType: activity.measurementType,
    route: activity.route ?? [],
    startedAt: serverTimestamp(),
    endedAt: serverTimestamp(),
  });

  if (activity.distanceKm <= 0) return;

  // 2. チームの合計距離とメンバーの個人距離を更新
  if (teamId) {
    await Promise.all([
      updateDoc(doc(db, 'teams', teamId), {
        totalDistanceKm: increment(activity.distanceKm),
      }),
      updateDoc(doc(db, 'teams', teamId, 'members', userId), {
        totalDistanceKm: increment(activity.distanceKm),
      }),
    ]);
  }

  // 3. 参加中の全アクティブバトルに距離を加算
  await Promise.all(
    activeBattleIds.map(async (battleId) => {
      const memberSnap = await getDoc(doc(db, 'battles', battleId, 'members', userId));
      if (!memberSnap.exists()) return;

      const battleTeamId = memberSnap.data()['teamId'] as string;
      const statsId = `${battleId}_${battleTeamId}`;

      // totalDistanceKm をアトミックに加算
      await updateDoc(doc(db, 'battle_stats', statsId), {
        totalDistanceKm: increment(activity.distanceKm),
      });

      // avgDistanceKm を再計算（totalDistanceKm / memberCount）
      const statsSnap = await getDoc(doc(db, 'battle_stats', statsId));
      if (statsSnap.exists()) {
        const { totalDistanceKm, memberCount } = statsSnap.data() as {
          totalDistanceKm: number;
          memberCount: number;
        };
        await updateDoc(doc(db, 'battle_stats', statsId), {
          avgDistanceKm: totalDistanceKm / Math.max(memberCount, 1),
        });
      }
    })
  );
}
