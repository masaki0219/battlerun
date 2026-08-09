import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';
import type {
  RecordStore,
  Activity,
  MeasurementType,
  PauseKind,
  RoutePoint,
  RunGoal,
  GpsPointSource,
  GpsWarmupSeed,
} from '../types';
import {
  emptyAutoPauseDetector,
  evaluateAutoPause,
  type AutoPauseDetectorState,
} from '../utils/autoPause';
import { completeDeclarationsForActivity } from '../lib/declarations';
import { deviceTimeZone } from '../utils/declarations';
import {
  DEFAULT_GPS_PROCESSING_CONFIG,
  DISTANCE_MAX_ACCURACY_M,
  GPS_PROCESSING_VERSION,
  GPS_QUALITY_ACCURACY_SAMPLE_LIMIT,
  WARMUP_POINT_MAX_AGE_MS,
  createInitialGpsProcessingState,
  emptyGpsRuntimeQualityMetrics,
  finalizeGpsProcessing,
  gpsDebugSample,
  gpsQualitySummary,
  processGpsPoint,
  requestGpsProcessingSegmentBreak,
  type GpsDebugSample,
  type GpsInputPoint,
  type GpsProcessingState,
  type GpsRuntimeQualityMetrics,
} from '../utils/gpsProcessing';
import {
  hasUsableAutoPauseAccuracy,
} from '../utils/gpsQuality';
import {
  GPS_DEBUG_EXPORT_ENABLED,
  saveLatestGpsDebugExport,
} from '../lib/gpsDebug';

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
  /** 記録開始時点の端末IANAタイムゾーン。終了時に端末設定が変わっても開始日判定へ使う。 */
  recordingTimezone: string;
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
  gpsProcessingState: GpsProcessingState;
  gpsRuntimeQuality: GpsRuntimeQualityMetrics;
  gpsDebugSamples: GpsDebugSample[];
  /** 更新中だった旧セッションは、当時の互換入口で再生して保存不能になることを防ぐ。 */
  submissionGpsProcessingVersion: 1 | 2 | typeof GPS_PROCESSING_VERSION;
  /** GPS点の追加。手動停止中は捨て、自動停止中は再開判定だけを続ける */
  appendRoutePoint: (point: GpsInputPoint, source: Exclude<GpsPointSource, 'warmup'>) => void;
  /** バックグラウンド追跡から前景監視へ切り替えた回数を品質集計へ残す。 */
  noteForegroundFallback: () => void;
  /** 手動停止・復旧・ウォッチドッグ後の次の良好点を新セグメントにする。 */
  requestGpsSegmentBreak: () => void;
}

/** 一時停止分を除いた実走行時間（秒） */
export function activeDurationSeconds(state: Pick<RecordState, 'startedAt' | 'pausedAt' | 'pausedTotalMs'>, nowMs = Date.now()): number {
  if (!state.startedAt) return 0;
  const startMs = new Date(state.startedAt).getTime();
  const endMs = state.pausedAt ? new Date(state.pausedAt).getTime() : nowMs;
  return Math.max(0, Math.floor((endMs - startMs - state.pausedTotalMs) / 1000));
}

function routePointForAutoPause(input: GpsInputPoint): RoutePoint | null {
  if (
    typeof input.lat !== 'number' || !Number.isFinite(input.lat)
    || typeof input.lng !== 'number' || !Number.isFinite(input.lng)
    || typeof input.timestamp !== 'number' || !Number.isFinite(input.timestamp)
  ) return null;
  const point: RoutePoint = { lat: input.lat, lng: input.lng, timestamp: input.timestamp };
  if (typeof input.accuracy === 'number' && Number.isFinite(input.accuracy)) point.accuracy = input.accuracy;
  return point;
}

function observedSpeed(input: GpsInputPoint): number | null {
  return typeof input.speed === 'number' && Number.isFinite(input.speed) && input.speed >= 0
    ? input.speed
    : null;
}

function restoreGpsProcessingState(route: RoutePoint[], distanceKm: number): GpsProcessingState {
  const restored = createInitialGpsProcessingState();
  const last = route[route.length - 1];
  if (!last) return restored;
  const anchor = {
    lat: last.lat,
    lng: last.lng,
    timestamp: last.timestamp,
    accuracy: typeof last.accuracy === 'number' && Number.isFinite(last.accuracy) && last.accuracy > 0
      ? last.accuracy
      : DISTANCE_MAX_ACCURACY_M,
    ...(typeof last.alt === 'number' && Number.isFinite(last.alt) ? { alt: last.alt } : {}),
    ...(typeof last.altitudeAccuracy === 'number' && Number.isFinite(last.altitudeAccuracy)
      ? { altitudeAccuracy: last.altitudeAccuracy }
      : {}),
  };
  return {
    ...restored,
    lastObservedPoint: anchor,
    lastUsablePoint: anchor,
    rawAnchor: anchor,
    commitAnchor: anchor,
    acceptedPointCount: route.length,
    receivedPointCount: route.length,
    rawDistanceM: Math.max(0, distanceKm * 1_000),
    filteredDistanceM: Math.max(0, distanceKm * 1_000),
    accuracySamplesM: route.flatMap((point) => (
      typeof point.accuracy === 'number' && Number.isFinite(point.accuracy) && point.accuracy > 0
        ? [point.accuracy]
        : []
    )).slice(-GPS_QUALITY_ACCURACY_SAMPLE_LIMIT),
  };
}

function normalizePersistedGpsProcessingState(
  value: unknown,
  route: RoutePoint[],
  distanceKm: number,
): GpsProcessingState {
  if (!value || typeof value !== 'object') return restoreGpsProcessingState(route, distanceKm);
  const saved = value as Partial<GpsProcessingState>;
  if (saved.processingVersion !== GPS_PROCESSING_VERSION) {
    // v2記録中セッションには保留点・v3カウンタが無い。正式routeと表示距離だけを引き継ぎ、
    // 復旧後の点は既存のsegmentPendingで新しいセグメントから開始する。
    return restoreGpsProcessingState(route, distanceKm);
  }
  const initial = createInitialGpsProcessingState();
  return {
    ...initial,
    ...saved,
    processingVersion: GPS_PROCESSING_VERSION,
    accuracySamplesM: Array.isArray(saved.accuracySamplesM) ? saved.accuracySamplesM : [],
    decisionCounts: saved.decisionCounts && typeof saved.decisionCounts === 'object'
      ? saved.decisionCounts
      : {},
  };
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
  displayRoute: [],
  goal: null,
  startedAt: null,
  recordingTimezone: deviceTimeZone(),
  locationMode: 'idle',
  gpsWarning: false,
  pausedAt: null,
  pausedTotalMs: 0,
  segmentPending: false,
  autoPauseDetector: emptyAutoPauseDetector(),
  lastLocationAt: null,
  gpsProcessingState: createInitialGpsProcessingState(),
  gpsRuntimeQuality: emptyGpsRuntimeQualityMetrics(),
  gpsDebugSamples: [],
  submissionGpsProcessingVersion: GPS_PROCESSING_VERSION,

  startRecording: (
    type: MeasurementType,
    goal: RunGoal | null = null,
    warmupSeed: GpsWarmupSeed | null = null,
  ) => {
    const nowMs = Date.now();
    let gpsProcessingState = createInitialGpsProcessingState();
    let route: RoutePoint[] = [];
    let displayRoute: RoutePoint[] = [];
    let gpsDebugSamples: GpsDebugSample[] = [];
    const gpsRuntimeQuality = emptyGpsRuntimeQualityMetrics();

    if (
      type === 'gps'
      && warmupSeed
      && nowMs - warmupSeed.point.timestamp >= 0
      && nowMs - warmupSeed.point.timestamp <= WARMUP_POINT_MAX_AGE_MS
    ) {
      const input: GpsInputPoint = { ...warmupSeed.point };
      const outcome = processGpsPoint(gpsProcessingState, input);
      gpsProcessingState = outcome.nextState;
      if (outcome.acceptedPoints.length > 0) route = [...outcome.acceptedPoints];
      if (outcome.displayPoint) displayRoute = [outcome.displayPoint];
      if (GPS_DEBUG_EXPORT_ENABLED) gpsDebugSamples = [gpsDebugSample(input, outcome)];
      gpsRuntimeQuality.warmupDurationMs = Math.max(0, warmupSeed.warmupDurationMs);
      gpsRuntimeQuality.warmupReadyAccuracyM = warmupSeed.readyAccuracyM;
      gpsRuntimeQuality.foregroundPointCount = 1;
    }

    set({
      isRecording: true,
      isPaused: false,
      pauseKind: null,
      measurementType: type,
      distanceKm: gpsProcessingState.filteredDistanceM / 1_000,
      steps: 0,
      durationSeconds: 0,
      route,
      displayRoute,
      goal,
      startedAt: new Date(nowMs).toISOString(),
      recordingTimezone: deviceTimeZone(),
      locationMode: 'idle',
      gpsWarning: false,
      pausedAt: null,
      pausedTotalMs: 0,
      segmentPending: false,
      autoPauseDetector: emptyAutoPauseDetector(),
      lastLocationAt: route[0]?.timestamp ?? null,
      gpsProcessingState,
      gpsRuntimeQuality,
      gpsDebugSamples,
      submissionGpsProcessingVersion: GPS_PROCESSING_VERSION,
    });
  },

  pauseRecording: () => {
    const state = get();
    if (!state.isRecording || state.pauseKind === 'manual') return;
    const boundary = requestGpsProcessingSegmentBreak(
      state.gpsProcessingState,
      DEFAULT_GPS_PROCESSING_CONFIG,
    );
    const displayRoute = boundary.removedTimestamp == null
      ? state.displayRoute
      : state.displayRoute.filter((point) => point.timestamp !== boundary.removedTimestamp);
    if (state.pauseKind === 'auto') {
      // 自動停止中に明示操作された場合は、同じ停止区間を手動停止へ昇格する。
      set({
        pauseKind: 'manual',
        gpsWarning: false,
        segmentPending: true,
        gpsProcessingState: boundary.state,
        displayRoute,
        autoPauseDetector: emptyAutoPauseDetector(),
      });
      return;
    }
    set({
      isPaused: true,
      pauseKind: 'manual',
      pausedAt: new Date().toISOString(),
      gpsWarning: false,
      segmentPending: true,
      gpsProcessingState: boundary.state,
      displayRoute,
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

  appendRoutePoint: (point: GpsInputPoint, source: Exclude<GpsPointSource, 'warmup'>) => {
    const state = get();
    if (!state.isRecording || state.pauseKind === 'manual') return;

    const autoPoint = routePointForAutoPause(point);
    const canEvaluateAutoPause = state.autoPauseEnabled
      && autoPoint !== null
      && hasUsableAutoPauseAccuracy(autoPoint);
    const decision = canEvaluateAutoPause
      ? evaluateAutoPause(
          state.autoPauseDetector,
          autoPoint,
          state.pauseKind === 'auto',
          observedSpeed(point),
        )
      : null;

    const isResuming = state.pauseKind === 'auto' && decision?.type === 'resume';
    const isStartingPause = state.pauseKind !== 'auto' && decision?.type === 'pause';
    const remainsAutoPaused = state.pauseKind === 'auto' && !isResuming;
    const forceNewSegment = state.segmentPending || isResuming;
    const outcome = processGpsPoint(state.gpsProcessingState, point, {
      forceNewSegment,
      paused: remainsAutoPaused || isStartingPause,
    });

    const route = outcome.acceptedPoints.length > 0
      ? [...state.route, ...outcome.acceptedPoints]
      : state.route;
    let displayRoute = outcome.removedDisplayPointTimestamp == null
      ? state.displayRoute
      : state.displayRoute.filter((item) => item.timestamp !== outcome.removedDisplayPointTimestamp);
    if (outcome.displayPoint) {
      const lastDisplayPoint = displayRoute[displayRoute.length - 1];
      if (
        !lastDisplayPoint
        || lastDisplayPoint.timestamp !== outcome.displayPoint.timestamp
        || lastDisplayPoint.lat !== outcome.displayPoint.lat
        || lastDisplayPoint.lng !== outcome.displayPoint.lng
      ) displayRoute = [...displayRoute, outcome.displayPoint];
    }
    const gpsRuntimeQuality = {
      ...state.gpsRuntimeQuality,
      foregroundPointCount: state.gpsRuntimeQuality.foregroundPointCount + (source === 'foreground' ? 1 : 0),
      backgroundPointCount: state.gpsRuntimeQuality.backgroundPointCount + (source === 'background' ? 1 : 0),
    };
    const gpsDebugSamples = GPS_DEBUG_EXPORT_ENABLED
      ? [...state.gpsDebugSamples, gpsDebugSample(point, outcome)]
      : state.gpsDebugSamples;
    const timestamp = typeof point.timestamp === 'number' && Number.isFinite(point.timestamp)
      ? point.timestamp
      : Date.now();

    const patch: Partial<RecordState> = {
      route,
      displayRoute,
      distanceKm: outcome.nextState.filteredDistanceM / 1_000,
      gpsProcessingState: outcome.nextState,
      gpsRuntimeQuality,
      gpsDebugSamples,
      // 低品質点も「位置更新は届いている」ためウォッチドッグには伝える。
      lastLocationAt: timestamp,
      segmentPending: forceNewSegment && outcome.acceptedPoints.length === 0,
      autoPauseDetector: decision?.next ?? emptyAutoPauseDetector(),
    };

    if (isStartingPause && decision?.type === 'pause') {
      const startedAtMs = state.startedAt ? new Date(state.startedAt).getTime() : decision.pausedAtMs;
      const pausedAtMs = Math.max(startedAtMs, decision.pausedAtMs);
      patch.isPaused = true;
      patch.pauseKind = 'auto';
      patch.pausedAt = new Date(pausedAtMs).toISOString();
      patch.segmentPending = true;
      patch.gpsWarning = false;
    } else if (isResuming) {
      const pausedAtMs = state.pausedAt ? new Date(state.pausedAt).getTime() : timestamp;
      patch.isPaused = false;
      patch.pauseKind = null;
      patch.pausedAt = null;
      patch.pausedTotalMs = state.pausedTotalMs + Math.max(0, timestamp - pausedAtMs);
      patch.gpsWarning = false;
    }

    set(patch);
  },

  noteForegroundFallback: () => {
    const state = get();
    set({
      gpsRuntimeQuality: {
        ...state.gpsRuntimeQuality,
        foregroundFallbackCount: state.gpsRuntimeQuality.foregroundFallbackCount + 1,
      },
    });
  },

  requestGpsSegmentBreak: () => {
    const state = get();
    const boundary = requestGpsProcessingSegmentBreak(
      state.gpsProcessingState,
      DEFAULT_GPS_PROCESSING_CONFIG,
    );
    set({
      segmentPending: true,
      gpsProcessingState: boundary.state,
      displayRoute: boundary.removedTimestamp == null
        ? state.displayRoute
        : state.displayRoute.filter((point) => point.timestamp !== boundary.removedTimestamp),
    });
  },

  stopRecording: async () => {
    const state = get();
    if (!state.isRecording) throw new Error('記録はすでに停止しています。');
    const endedAt = new Date().toISOString();

    // v3は最後の1点を保留している。純粋finalizeで正常な移動だけを確定し、
    // 3m未満・accuracy悪化・低速横飛びは終了直前ノイズとして破棄する。
    const finalized = state.measurementType === 'gps'
      ? finalizeGpsProcessing(state.gpsProcessingState)
      : null;
    const finalizedGpsState = finalized?.nextState ?? state.gpsProcessingState;
    const validRoute = state.measurementType === 'gps'
      ? [...state.route, ...(finalized?.acceptedPoints ?? [])]
      : [];
    const distanceKm = state.measurementType === 'steps'
      ? state.distanceKm
      : finalizedGpsState.filteredDistanceM / 1_000;

    // setInterval ではなく開始時刻からの差分で計算
    // バックグラウンドから戻った後も正確な経過時間が得られる。一時停止分は除く
    const endMs = Date.now();
    const currentPauseMs = state.pausedAt ? endMs - new Date(state.pausedAt).getTime() : 0;
    const pausedMs = state.pausedTotalMs + Math.max(0, currentPauseMs);
    const durationSeconds = state.startedAt
      ? Math.max(0, Math.floor((endMs - new Date(state.startedAt).getTime() - pausedMs) / 1000))
      : 0;

    const quality = state.measurementType === 'gps'
      ? {
          ...gpsQualitySummary(finalizedGpsState, state.gpsRuntimeQuality),
          processingVersion: state.submissionGpsProcessingVersion,
        }
      : undefined;
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
      timezone: state.recordingTimezone,
      pausedMs,
      ...(state.measurementType === 'gps' ? {
        gpsProcessingVersion: state.submissionGpsProcessingVersion,
        gpsQuality: quality,
      } : {}),
    };

    if (state.measurementType === 'gps' && quality && GPS_DEBUG_EXPORT_ENABLED) {
      await saveLatestGpsDebugExport({
        schemaVersion: 1,
        startedAt: state.startedAt ?? endedAt,
        endedAt,
        config: DEFAULT_GPS_PROCESSING_CONFIG,
        summary: quality,
        samples: state.gpsDebugSamples,
      }).catch((error) => {
        // デバッグログ保存失敗でユーザーの活動保存を止めない。
        console.warn('[recordStore] GPS debug export failed:', error);
      });
    }

    set({
      isRecording: false,
      isPaused: false,
      pauseKind: null,
      route: validRoute,
      displayRoute: finalized?.removedDisplayPointTimestamp == null
        ? state.displayRoute
        : state.displayRoute.filter((item) => item.timestamp !== finalized.removedDisplayPointTimestamp),
      distanceKm,
      gpsProcessingState: finalizedGpsState,
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
      displayRoute: [],
      goal: null,
      startedAt: null,
      recordingTimezone: deviceTimeZone(),
      locationMode: 'idle',
      gpsWarning: false,
      pausedAt: null,
      pausedTotalMs: 0,
      segmentPending: false,
      autoPauseDetector: emptyAutoPauseDetector(),
      lastLocationAt: null,
      gpsProcessingState: createInitialGpsProcessingState(),
      gpsRuntimeQuality: emptyGpsRuntimeQualityMetrics(),
      gpsDebugSamples: [],
      submissionGpsProcessingVersion: GPS_PROCESSING_VERSION,
    });
  },
}));

type PersistedSession = Pick<RecordState,
  'isRecording' | 'isPaused' | 'pauseKind' | 'measurementType' | 'distanceKm' | 'steps' | 'durationSeconds' |
  'route' | 'goal' | 'startedAt' | 'locationMode' | 'gpsWarning' | 'pausedAt' | 'pausedTotalMs' |
  'gpsProcessingState' | 'gpsRuntimeQuality' | 'recordingTimezone' | 'submissionGpsProcessingVersion'>
  & { gpsDebugSamples?: GpsDebugSample[] };

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
      recordingTimezone: latest.recordingTimezone,
      locationMode: 'idle',
      gpsWarning: false,
      pausedAt: latest.pausedAt,
      pausedTotalMs: latest.pausedTotalMs,
      gpsProcessingState: latest.gpsProcessingState,
      gpsRuntimeQuality: latest.gpsRuntimeQuality,
      submissionGpsProcessingVersion: latest.submissionGpsProcessingVersion,
      // 正確な座標を含むため、明示的な開発フラグ有効時だけ復旧用に保持する。
      ...(GPS_DEBUG_EXPORT_ENABLED ? { gpsDebugSamples: latest.gpsDebugSamples } : {}),
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
    const savedDistanceKm = typeof saved.distanceKm === 'number' ? saved.distanceKm : 0;
    const savedStateExists = saved.gpsProcessingState != null
      && typeof saved.gpsProcessingState === 'object';
    const inferredSubmissionVersion = savedStateExists
      ? saved.gpsProcessingState?.processingVersion === GPS_PROCESSING_VERSION
        ? GPS_PROCESSING_VERSION
        : 2
      : 1;
    const submissionGpsProcessingVersion = (
      saved.submissionGpsProcessingVersion === 1
      || saved.submissionGpsProcessingVersion === 2
      || saved.submissionGpsProcessingVersion === GPS_PROCESSING_VERSION
    ) ? saved.submissionGpsProcessingVersion : inferredSubmissionVersion;
    const restoredGpsProcessingState = normalizePersistedGpsProcessingState(
      saved.gpsProcessingState,
      saved.route,
      savedDistanceKm,
    );
    const gpsProcessingState = requestGpsProcessingSegmentBreak(
      restoredGpsProcessingState,
      DEFAULT_GPS_PROCESSING_CONFIG,
    ).state;
    useRecordStore.setState({
      isRecording: true,
      isPaused,
      pauseKind,
      measurementType: saved.measurementType === 'steps' ? 'steps' : 'gps',
      distanceKm: gpsProcessingState.filteredDistanceM / 1_000,
      steps: typeof saved.steps === 'number' ? saved.steps : 0,
      durationSeconds: 0,
      route: saved.route,
      // 保留中のdisplay点は端末保存へ広げず、復旧時は正式commit点だけから再構成する。
      displayRoute: saved.route,
      goal: saved.goal ?? null,
      startedAt: saved.startedAt,
      recordingTimezone: typeof saved.recordingTimezone === 'string'
        ? saved.recordingTimezone
        : deviceTimeZone(),
      locationMode: 'idle',
      gpsWarning: false,
      pausedAt: isPaused ? saved.pausedAt ?? null : null,
      pausedTotalMs: typeof saved.pausedTotalMs === 'number' ? saved.pausedTotalMs : 0,
      // 追跡が途切れていた可能性があるため、復旧後の最初の点で距離を跨がせない
      segmentPending: true,
      autoPauseDetector: emptyAutoPauseDetector(),
      lastLocationAt: null,
      gpsProcessingState,
      gpsRuntimeQuality: saved.gpsRuntimeQuality && typeof saved.gpsRuntimeQuality === 'object'
        ? saved.gpsRuntimeQuality
        : emptyGpsRuntimeQualityMetrics(),
      submissionGpsProcessingVersion,
      gpsDebugSamples: GPS_DEBUG_EXPORT_ENABLED && Array.isArray(saved.gpsDebugSamples)
        ? saved.gpsDebugSamples
        : [],
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
    gpsProcessingVersion: item.activity.gpsProcessingVersion,
    gpsQuality: item.activity.gpsQuality,
    timezone: item.activity.timezone ?? deviceTimeZone(),
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
  let completionHandledByServer = false;
  try {
    const completeOnServer = httpsCallable(functions, 'completeRunDeclarationsForActivity');
    const completion = await completeOnServer({
      activityId: submitted.activityId,
      timezone: item.activity.timezone ?? deviceTimeZone(),
    });
    declarationAchieved = (completion.data as { declarationAchieved?: boolean }).declarationAchieved === true;
    completionHandledByServer = true;
  } catch (error) {
    // 新Functionの未デプロイ・一時障害時も、旧クライアント互換の本人更新で補完する。
    console.warn('[recordStore] server declaration completion failed:', error);
  }
  const userId = auth.currentUser?.uid;
  if (!completionHandledByServer && userId && battleIds.length > 0) {
    const completedByClient = await completeDeclarationsForActivity({
      battleIds,
      userId,
      startedAt: item.activity.startedAt,
      timezone: item.activity.timezone ?? deviceTimeZone(),
    }).catch((error) => {
      console.warn('[recordStore] declaration completion failed:', error);
      return false;
    });
    declarationAchieved = declarationAchieved || completedByClient;
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
