import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';
import type { RecordStore, Activity, MeasurementType, PauseKind, RoutePoint, RunGoal } from '../types';
import { MAX_SPEED_KMH } from '../lib/constants';
import {
  emptyAutoPauseDetector,
  evaluateAutoPause,
  type AutoPauseDetectorState,
} from '../utils/autoPause';
import { completeDeclarationsForActivity } from '../lib/declarations';
import {
  hasStableStartAccuracy,
  hasUsableAutoPauseAccuracy,
  hasUsableDistanceAccuracy,
} from '../utils/gpsQuality';

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
    if (!hasUsableDistanceAccuracy(point)) continue;
    const prev = valid[valid.length - 1];
    // セグメント先頭（一時停止からの再開点）は前の点との速度検査をしない
    if (!prev || point.seg) {
      valid.push(point);
      continue;
    }
    const distKm = haversine(prev, point);
    const timeSec = (point.timestamp - prev.timestamp) / 1000;
    if (timeSec > 0 && (distKm / timeSec) * 3600 <= MAX_SPEED_KMH) valid.push(point);
  }
  return valid;
}

/** セグメント境界（一時停止区間）を跨ぐペアを除いた合計距離 */
export function routeDistanceKm(route: RoutePoint[]): number {
  return route.reduce((sum, pt, i) => {
    if (i === 0 || pt.seg) return sum;
    return sum + haversine(route[i - 1], pt);
  }, 0);
}

const RECORDING_SESSION_KEY = '@battlerun_recording_session_v1';
const PENDING_ACTIVITIES_KEY = '@battlerun_pending_activities_v1';
const AUTO_PAUSE_ENABLED_KEY = '@battlerun_auto_pause_enabled_v1';

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
  // 一時停止した時刻（ISO）。停止中でなければ null
  pausedAt: string | null;
  // これまでに一時停止していた合計時間（ms）。現在停止中の分は含まない
  pausedTotalMs: number;
  pauseKind: PauseKind;
  // 再開直後: 次に追加する点をセグメント先頭として扱う
  segmentPending: boolean;
  autoPauseDetector: AutoPauseDetectorState;
  lastLocationAt: number | null;
  /** GPS点の追加。手動停止中は捨て、自動停止中は再開判定だけを続ける */
  appendRoutePoint: (point: RoutePoint, observedSpeedMps?: number | null) => void;
}

function appendAcceptedPoints(
  state: Pick<RecordState, 'route' | 'distanceKm' | 'segmentPending'>,
  points: RoutePoint[],
): Pick<RecordState, 'route' | 'distanceKm' | 'segmentPending'> {
  let route = state.route;
  let distanceKm = state.distanceKm;
  let segmentPending = state.segmentPending;

  for (const point of points) {
    const marked: RoutePoint = segmentPending && route.length > 0 ? { ...point, seg: true } : point;
    const prev = route[route.length - 1];
    let added = 0;
    if (prev && !marked.seg) {
      const timeSec = (marked.timestamp - prev.timestamp) / 1000;
      const distKm = haversine(prev, marked);
      if (timeSec <= 0 || (distKm / timeSec) * 3600 > MAX_SPEED_KMH) continue;
      added = distKm;
    }
    route = [...route, marked];
    distanceKm += added;
    segmentPending = false;
  }

  return { route, distanceKm, segmentPending };
}

/** 一時停止分を除いた実走行時間（秒） */
export function activeDurationSeconds(state: Pick<RecordState, 'startedAt' | 'pausedAt' | 'pausedTotalMs'>, nowMs = Date.now()): number {
  if (!state.startedAt) return 0;
  const startMs = new Date(state.startedAt).getTime();
  const endMs = state.pausedAt ? new Date(state.pausedAt).getTime() : nowMs;
  return Math.max(0, Math.floor((endMs - startMs - state.pausedTotalMs) / 1000));
}

export const useRecordStore = create<RecordState>((set, get) => ({
  isRecording: false,
  isPaused: false,
  pauseKind: null,
  autoPauseEnabled: false,
  measurementType: 'gps',
  distanceKm: 0,
  steps: 0,
  durationSeconds: 0,
  route: [],
  goal: null,
  startedAt: null,
  locationMode: 'idle',
  gpsWarning: false,
  pausedAt: null,
  pausedTotalMs: 0,
  segmentPending: false,
  autoPauseDetector: emptyAutoPauseDetector(),
  lastLocationAt: null,

  startRecording: (type: MeasurementType, goal: RunGoal | null = null) => {
    set({
      isRecording: true,
      isPaused: false,
      pauseKind: null,
      measurementType: type,
      distanceKm: 0,
      steps: 0,
      durationSeconds: 0,
      route: [],
      goal,
      startedAt: new Date().toISOString(),
      locationMode: 'idle',
      gpsWarning: false,
      pausedAt: null,
      pausedTotalMs: 0,
      segmentPending: false,
      autoPauseDetector: emptyAutoPauseDetector(),
      lastLocationAt: null,
    });
  },

  pauseRecording: () => {
    const state = get();
    if (!state.isRecording || state.pauseKind === 'manual') return;
    if (state.pauseKind === 'auto') {
      // 自動停止中に明示操作された場合は、同じ停止区間を手動停止へ昇格する。
      set({ pauseKind: 'manual', gpsWarning: false, autoPauseDetector: emptyAutoPauseDetector() });
      return;
    }
    set({
      isPaused: true,
      pauseKind: 'manual',
      pausedAt: new Date().toISOString(),
      gpsWarning: false,
      autoPauseDetector: emptyAutoPauseDetector(),
    });
  },

  resumeRecording: () => {
    const state = get();
    if (!state.isRecording || !state.isPaused) return;
    const pausedMs = state.pausedAt ? Date.now() - new Date(state.pausedAt).getTime() : 0;
    set({
      isPaused: false,
      pauseKind: null,
      pausedAt: null,
      pausedTotalMs: state.pausedTotalMs + Math.max(0, pausedMs),
      segmentPending: true,
      autoPauseDetector: emptyAutoPauseDetector(),
    });
  },

  setAutoPauseEnabled: (enabled: boolean) => {
    const state = get();
    if (!enabled && state.pauseKind === 'auto') state.resumeRecording();
    set({ autoPauseEnabled: enabled, autoPauseDetector: emptyAutoPauseDetector() });
    void AsyncStorage.setItem(AUTO_PAUSE_ENABLED_KEY, enabled ? 'true' : 'false');
  },

  appendRoutePoint: (point: RoutePoint, observedSpeedMps?: number | null) => {
    const state = get();
    if (!state.isRecording || state.pauseKind === 'manual') return;

    // 位置更新自体はウォッチドッグへ伝えつつ、極端な低精度点と開始直後の不安定な点は距離へ入れない。
    if (!hasUsableDistanceAccuracy(point) || (state.route.length === 0 && !hasStableStartAccuracy(point))) {
      set({ lastLocationAt: point.timestamp, autoPauseDetector: emptyAutoPauseDetector() });
      return;
    }

    if (state.measurementType !== 'gps' || !state.autoPauseEnabled) {
      set({
        ...appendAcceptedPoints(state, [point]),
        autoPauseDetector: { ...emptyAutoPauseDetector(), lastPoint: point },
        lastLocationAt: point.timestamp,
      });
      return;
    }

    // 距離には残せる中間精度の点でも、誤停止につながるためオートポーズ判定には使わない。
    if (!hasUsableAutoPauseAccuracy(point)) {
      set({
        ...appendAcceptedPoints(state, [point]),
        // 次の良好な点との速度計算にも低精度点を混ぜない。
        autoPauseDetector: emptyAutoPauseDetector(),
        lastLocationAt: point.timestamp,
      });
      return;
    }

    const decision = evaluateAutoPause(
      state.autoPauseDetector,
      point,
      state.pauseKind === 'auto',
      observedSpeedMps,
    );
    if (decision.type === 'pause') {
      const startedAtMs = state.startedAt ? new Date(state.startedAt).getTime() : decision.pausedAtMs;
      const pausedAtMs = Math.max(startedAtMs, decision.pausedAtMs);
      set({
        isPaused: true,
        pauseKind: 'auto',
        pausedAt: new Date(pausedAtMs).toISOString(),
        segmentPending: true,
        autoPauseDetector: decision.next,
        lastLocationAt: point.timestamp,
        gpsWarning: false,
      });
      return;
    }
    if (decision.type === 'resume') {
      const pausedAtMs = state.pausedAt ? new Date(state.pausedAt).getTime() : point.timestamp;
      const resumed = {
        ...appendAcceptedPoints({ ...state, segmentPending: true }, [point]),
        isPaused: false,
        pauseKind: null as PauseKind,
        pausedAt: null,
        pausedTotalMs: state.pausedTotalMs + Math.max(0, point.timestamp - pausedAtMs),
        autoPauseDetector: decision.next,
        lastLocationAt: point.timestamp,
        gpsWarning: false,
      };
      set(resumed);
      return;
    }
    if (decision.type === 'append') {
      set({
        ...appendAcceptedPoints(state, decision.points),
        autoPauseDetector: decision.next,
        lastLocationAt: point.timestamp,
      });
      return;
    }
    set({ autoPauseDetector: decision.next, lastLocationAt: point.timestamp });
  },

  stopRecording: async () => {
    const state = get();
    if (!state.isRecording) throw new Error('記録はすでに停止しています。');
    const endedAt = new Date().toISOString();

    // 歩数モード: route は空なので store に累積した distanceKm をそのまま使う
    // GPS モード: チート防止済みの距離を route から再計算
    const validRoute = state.measurementType === 'gps' ? filterInvalidPoints(state.route) : [];
    const distanceKm = state.measurementType === 'steps'
      ? state.distanceKm
      : routeDistanceKm(validRoute);

    // setInterval ではなく開始時刻からの差分で計算
    // バックグラウンドから戻った後も正確な経過時間が得られる。一時停止分は除く
    const endMs = Date.now();
    const currentPauseMs = state.pausedAt ? endMs - new Date(state.pausedAt).getTime() : 0;
    const pausedMs = state.pausedTotalMs + Math.max(0, currentPauseMs);
    const durationSeconds = state.startedAt
      ? Math.max(0, Math.floor((endMs - new Date(state.startedAt).getTime() - pausedMs) / 1000))
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
      pausedMs,
    };

    set({
      isRecording: false,
      isPaused: false,
      pauseKind: null,
      pausedAt: null,
      autoPauseDetector: emptyAutoPauseDetector(),
      lastLocationAt: null,
    });
    return activity;
  },

  reset: () => {
    void AsyncStorage.removeItem(RECORDING_SESSION_KEY);
    set({
      isRecording: false,
      isPaused: false,
      pauseKind: null,
      distanceKm: 0,
      steps: 0,
      durationSeconds: 0,
      route: [],
      goal: null,
      startedAt: null,
      locationMode: 'idle',
      gpsWarning: false,
      pausedAt: null,
      pausedTotalMs: 0,
      segmentPending: false,
      autoPauseDetector: emptyAutoPauseDetector(),
      lastLocationAt: null,
    });
  },
}));

type PersistedSession = Pick<RecordState,
  'isRecording' | 'isPaused' | 'pauseKind' | 'measurementType' | 'distanceKm' | 'steps' | 'durationSeconds' |
  'route' | 'goal' | 'startedAt' | 'locationMode' | 'gpsWarning' | 'pausedAt' | 'pausedTotalMs'>;

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
      isPaused: latest.isPaused,
      pauseKind: latest.pauseKind,
      measurementType: latest.measurementType,
      distanceKm: latest.distanceKm,
      steps: latest.steps,
      durationSeconds: latest.durationSeconds,
      route: latest.route,
      goal: latest.goal,
      startedAt: latest.startedAt,
      locationMode: 'idle',
      gpsWarning: false,
      pausedAt: latest.pausedAt,
      pausedTotalMs: latest.pausedTotalMs,
    };
    void AsyncStorage.setItem(RECORDING_SESSION_KEY, JSON.stringify(persisted));
  }, 5000);
}

useRecordStore.subscribe(() => persistRecordingSoon());

/** アプリ再起動後に、保存済みの記録中セッションを復旧する。 */
export async function hydrateRecordingSession(): Promise<void> {
  hydrating = true;
  try {
    const [raw, autoPauseRaw] = await Promise.all([
      AsyncStorage.getItem(RECORDING_SESSION_KEY),
      AsyncStorage.getItem(AUTO_PAUSE_ENABLED_KEY),
    ]);
    // 未設定のユーザーは初期OFF。明示的にONへ変更した場合だけ有効化する。
    useRecordStore.setState({ autoPauseEnabled: autoPauseRaw === 'true' });
    if (!raw || useRecordStore.getState().isRecording) return;
    const saved = JSON.parse(raw) as Partial<PersistedSession>;
    if (!saved.isRecording || !saved.startedAt || !Array.isArray(saved.route)) return;
    const isPaused = saved.isPaused === true && typeof saved.pausedAt === 'string';
    const pauseKind: PauseKind = isPaused && saved.pauseKind === 'auto' ? 'auto' : isPaused ? 'manual' : null;
    useRecordStore.setState({
      isRecording: true,
      isPaused,
      pauseKind,
      measurementType: saved.measurementType === 'steps' ? 'steps' : 'gps',
      distanceKm: typeof saved.distanceKm === 'number' ? saved.distanceKm : 0,
      steps: typeof saved.steps === 'number' ? saved.steps : 0,
      durationSeconds: 0,
      route: saved.route,
      goal: saved.goal ?? null,
      startedAt: saved.startedAt,
      locationMode: 'idle',
      gpsWarning: false,
      pausedAt: isPaused ? saved.pausedAt ?? null : null,
      pausedTotalMs: typeof saved.pausedTotalMs === 'number' ? saved.pausedTotalMs : 0,
      // 追跡が途切れていた可能性があるため、復旧後の最初の点で距離を跨がせない
      segmentPending: true,
      autoPauseDetector: emptyAutoPauseDetector(),
      lastLocationAt: null,
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

export interface PendingActivitiesFlushResult {
  sent: number;
  discarded: number;
}

export type ActivitySaveFailureKind = 'queued' | 'rejected' | 'local-storage';

/** 保存失敗時に、記録が再送キューへ残っているかをUIへ伝える。 */
export class ActivitySaveError extends Error {
  constructor(
    public readonly kind: ActivitySaveFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'ActivitySaveError';
  }
}

type DiscardListener = (count: number) => void;
const discardListeners = new Set<DiscardListener>();

/** 再送時に恒久エラーの記録を破棄したことを、画面側で通知するための購読。 */
export function subscribePendingActivityDiscards(listener: DiscardListener): () => void {
  discardListeners.add(listener);
  return () => discardListeners.delete(listener);
}

function emitPendingActivityDiscards(count: number): void {
  if (count <= 0) return;
  discardListeners.forEach((listener) => listener(count));
}

async function readPendingActivities(): Promise<PendingActivity[]> {
  const raw = await AsyncStorage.getItem(PENDING_ACTIVITIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePendingActivities(items: PendingActivity[]): Promise<void> {
  if (items.length === 0) await AsyncStorage.removeItem(PENDING_ACTIVITIES_KEY);
  else await AsyncStorage.setItem(PENDING_ACTIVITIES_KEY, JSON.stringify(items));
}

// AsyncStorageにトランザクションAPIはないため、read-modify-writeだけを直列化する。
// ネットワーク送信中はロックを保持せず、新しい記録をすぐキューへ追加できるようにする。
let pendingQueueTail: Promise<void> = Promise.resolve();

function withPendingQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingQueueTail.then(operation, operation);
  pendingQueueTail = result.then(() => undefined, () => undefined);
  return result;
}

async function pendingSnapshot(): Promise<PendingActivity[]> {
  return withPendingQueueLock(() => readPendingActivities());
}

async function enqueuePending(item: PendingActivity): Promise<void> {
  await withPendingQueueLock(async () => {
    const queue = await readPendingActivities();
    if (queue.some((queued) => queued.localId === item.localId)) return;
    await writePendingActivities([...queue, item]);
  });
}

async function removePending(localId: string): Promise<void> {
  await withPendingQueueLock(async () => {
    const queue = await readPendingActivities();
    await writePendingActivities(queue.filter((item) => item.localId !== localId));
  });
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  const code = String((error as { code?: unknown }).code ?? '');
  return code.startsWith('functions/') ? code.slice('functions/'.length) : code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '記録を送信できませんでした。';
}

function isPermanentSubmissionError(error: unknown): boolean {
  return ['invalid-argument', 'failed-precondition', 'permission-denied'].includes(errorCode(error));
}

interface SubmittedActivityResult {
  activityId: string;
  distanceKm: number;
  durationSeconds: number;
  steps: number;
  battleIds: string[];
  declarationAchieved: boolean;
}

async function submitPending(item: PendingActivity): Promise<SubmittedActivityResult> {
  const submit = httpsCallable(functions, 'submitActivity');
  const result = await submit({
    localId: item.localId,
    measurementType: item.activity.measurementType,
    steps: item.activity.steps ?? 0,
    startedAtMs: new Date(item.activity.startedAt).getTime(),
    endedAtMs: new Date(item.activity.endedAt).getTime(),
    pausedMs: item.activity.pausedMs ?? 0,
    route: item.activity.route ?? [],
  });
  const submitted = result.data as {
    activityId: string;
    distanceKm: number;
    durationSeconds: number;
    steps: number;
    battleIds?: string[];
  };
  const battleIds = Array.isArray(submitted.battleIds) ? submitted.battleIds : [];
  let declarationAchieved = false;
  const userId = auth.currentUser?.uid;
  if (userId && battleIds.length > 0) {
    declarationAchieved = await completeDeclarationsForActivity({
      battleIds,
      userId,
      endedAt: item.activity.endedAt,
    }).catch((error) => {
      console.warn('[recordStore] declaration completion failed:', error);
      return false;
    });
  }
  return { ...submitted, battleIds, declarationAchieved };
}

/** ローカルに残っている未送信記録を順番に再送する。 */
let pendingFlush: Promise<PendingActivitiesFlushResult> | null = null;

export function flushPendingActivities(): Promise<PendingActivitiesFlushResult> {
  if (pendingFlush) return pendingFlush;

  pendingFlush = (async () => {
    const pending = await pendingSnapshot();
    let sent = 0;
    let discarded = 0;
    for (const item of pending) {
      try {
        await submitPending(item);
        await removePending(item.localId);
        sent += 1;
      } catch (error) {
        if (!isPermanentSubmissionError(error)) continue;
        try {
          await removePending(item.localId);
          discarded += 1;
        } catch (storageError) {
          console.error('[recordStore] failed to remove rejected pending activity:', storageError);
        }
      }
    }
    emitPendingActivityDiscards(discarded);
    return { sent, discarded };
  })();

  return pendingFlush.finally(() => {
    pendingFlush = null;
  });
}

// 検証済みCallableへのアクティビティ送信。ユーザー・表示名・反映先はサーバーで確定する。
export async function saveActivityToFirestore(params: {
  activity: Activity;
}): Promise<SubmittedActivityResult | null> {
  const { activity } = params;

  if (!Number.isFinite(activity.distanceKm) || activity.distanceKm <= 0) return null;

  const pending: PendingActivity = {
    localId: `activity_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`,
    activity,
  };

  try {
    await enqueuePending(pending);
  } catch (error) {
    throw new ActivitySaveError('local-storage', errorMessage(error));
  }

  try {
    const submitted = await submitPending(pending);
    try {
      await removePending(pending.localId);
    } catch (error) {
      // サーバー側はlocalIdで冪等化されているため、キューに残って再送されても二重登録されない。
      console.error('[recordStore] activity submitted but queue cleanup failed:', error);
    }
    // 今回の成功をオンライン復帰のシグナルとして、古い未送信記録もバックグラウンド再送する。
    void flushPendingActivities();
    return submitted;
  } catch (error) {
    if (isPermanentSubmissionError(error)) {
      try {
        await removePending(pending.localId);
      } catch (storageError) {
        throw new ActivitySaveError('local-storage', errorMessage(storageError));
      }
      throw new ActivitySaveError('rejected', errorMessage(error));
    }
    throw new ActivitySaveError('queued', errorMessage(error));
  }
}
