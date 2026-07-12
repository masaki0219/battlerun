import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
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
  const valid: RoutePoint[] = [];
  for (const point of route) {
    const prev = valid[valid.length - 1];
    if (!prev) {
      valid.push(point);
      continue;
    }
    const distKm = haversine(prev, point);
    const timeSec = (point.timestamp - prev.timestamp) / 1000;
    if (timeSec > 0 && (distKm / timeSec) * 3600 <= MAX_SPEED_KMH) valid.push(point);
  }
  return valid;
}

const RECORDING_SESSION_KEY = '@battlerun_recording_session_v1';
const PENDING_ACTIVITIES_KEY = '@battlerun_pending_activities_v1';

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
  // GPSウォッチドッグが「静かな停止」を検知している間 true。位置更新が再開すると false に戻る
  gpsWarning: boolean;
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
  gpsWarning: false,

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
      gpsWarning: false,
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
      gpsWarning: false,
    }),
}));

type PersistedSession = Pick<RecordState,
  'isRecording' | 'measurementType' | 'distanceKm' | 'steps' | 'durationSeconds' |
  'route' | 'startedAt' | 'locationMode' | 'gpsWarning'>;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydrating = false;

function persistRecordingSoon() {
  if (hydrating) return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const latest = useRecordStore.getState();
    if (!latest.isRecording) {
      void AsyncStorage.removeItem(RECORDING_SESSION_KEY);
      return;
    }
    const persisted: PersistedSession = {
      isRecording: latest.isRecording,
      measurementType: latest.measurementType,
      distanceKm: latest.distanceKm,
      steps: latest.steps,
      durationSeconds: latest.durationSeconds,
      route: latest.route,
      startedAt: latest.startedAt,
      locationMode: 'idle',
      gpsWarning: false,
    };
    void AsyncStorage.setItem(RECORDING_SESSION_KEY, JSON.stringify(persisted));
  }, 5000);
}

useRecordStore.subscribe(() => persistRecordingSoon());

/** アプリ再起動後に、保存済みの記録中セッションを復旧する。 */
export async function hydrateRecordingSession(): Promise<void> {
  hydrating = true;
  try {
    const raw = await AsyncStorage.getItem(RECORDING_SESSION_KEY);
    if (!raw || useRecordStore.getState().isRecording) return;
    const saved = JSON.parse(raw) as Partial<PersistedSession>;
    if (!saved.isRecording || !saved.startedAt || !Array.isArray(saved.route)) return;
    useRecordStore.setState({
      isRecording: true,
      measurementType: saved.measurementType === 'steps' ? 'steps' : 'gps',
      distanceKm: typeof saved.distanceKm === 'number' ? saved.distanceKm : 0,
      steps: typeof saved.steps === 'number' ? saved.steps : 0,
      durationSeconds: 0,
      route: saved.route,
      startedAt: saved.startedAt,
      locationMode: 'idle',
      gpsWarning: false,
    });
  } catch {
    await AsyncStorage.removeItem(RECORDING_SESSION_KEY);
  } finally {
    hydrating = false;
  }
}

interface PendingActivity {
  localId: string;
  activity: Activity;
}

async function readPendingActivities(): Promise<PendingActivity[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ACTIVITIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePendingActivities(items: PendingActivity[]): Promise<void> {
  if (items.length === 0) await AsyncStorage.removeItem(PENDING_ACTIVITIES_KEY);
  else await AsyncStorage.setItem(PENDING_ACTIVITIES_KEY, JSON.stringify(items));
}

async function submitPending(item: PendingActivity): Promise<{
  activityId: string;
  distanceKm: number;
  durationSeconds: number;
  steps: number;
}> {
  const submit = httpsCallable(functions, 'submitActivity');
  const result = await submit({
    measurementType: item.activity.measurementType,
    steps: item.activity.steps ?? 0,
    startedAtMs: new Date(item.activity.startedAt).getTime(),
    endedAtMs: new Date(item.activity.endedAt).getTime(),
    route: item.activity.route ?? [],
  });
  return result.data as {
    activityId: string;
    distanceKm: number;
    durationSeconds: number;
    steps: number;
  };
}

/** ローカルに残っている未送信記録を順番に再送する。 */
export async function flushPendingActivities(): Promise<number> {
  const pending = await readPendingActivities();
  const remaining: PendingActivity[] = [];
  let sent = 0;
  for (const item of pending) {
    try {
      await submitPending(item);
      sent += 1;
    } catch {
      remaining.push(item);
    }
  }
  await writePendingActivities(remaining);
  return sent;
}

// 検証済みCallableへのアクティビティ送信。ユーザー・表示名・反映先はサーバーで確定する。
export async function saveActivityToFirestore(params: {
  activity: Activity;
}): Promise<{ activityId: string; distanceKm: number; durationSeconds: number; steps: number } | null> {
  const { activity } = params;

  if (activity.distanceKm <= 0) return null;

  const pending: PendingActivity = {
    localId: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    activity,
  };
  const queue = await readPendingActivities();
  await writePendingActivities([...queue, pending]);

  const submitted = await submitPending(pending);
  const latestQueue = await readPendingActivities();
  await writePendingActivities(latestQueue.filter((item) => item.localId !== pending.localId));
  return submitted;
}
