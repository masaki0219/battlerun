/**
 * ZELIO の水平距離計算でクライアントと Functions が共有する純粋関数。
 *
 * このファイルは React Native / Firebase の API を import しない。アプリ側は
 * `utils/gpsProcessing.ts` の re-export 経由で同じ実装を利用する。
 * しきい値は実走ログで調整する暫定値であり、OS が保証する精度ではない。
 */

export const GPS_PROCESSING_VERSION = 2;

/** 通常開始の目安。25m以内が3点連続すると ready。暫定値。 */
export const START_READY_ACCURACY_M = 25;
/** 注意表示つきで開始を許可する上限。暫定値。 */
export const START_ACCEPTABLE_ACCURACY_M = 35;
/** 正式距離へ使う水平精度の上限。暫定値。 */
export const DISTANCE_MAX_ACCURACY_M = 35;
/** ランニングとして許容する点間速度の上限。暫定値。 */
export const MAX_RUNNING_SPEED_MPS = 7.0;
/** この時間以上GPS点が空いた場合、前後を直線接続しない。暫定値。 */
export const GPS_GAP_SEGMENT_MS = 15_000;
/** commitAnchorからこの距離に達するまで正式距離へ加算しない。暫定値。 */
export const MIN_COMMIT_DISTANCE_M = 3;
/** ready とする連続良好点数。暫定値。 */
export const WARMUP_GOOD_POINT_COUNT = 3;
/** 記録開始点へ引き継げるウォームアップ点の最大経過時間。暫定値。 */
export const WARMUP_POINT_MAX_AGE_MS = 5_000;
/** OSからの通知は全点受け、距離フィルタは別層で実行する。暫定値。 */
export const GPS_DISTANCE_INTERVAL_M = 0;
/** expo-location 19でAndroidだけに指定する更新間隔。iOSはこの値に依存しない。 */
export const GPS_ANDROID_TIME_INTERVAL_MS = 1_000;
/** 長時間記録で端末メモリを増やさない精度統計の最大サンプル数。 */
export const GPS_QUALITY_ACCURACY_SAMPLE_LIMIT = 2_048;

export interface GpsProcessingConfig {
  distanceMaxAccuracyM: number;
  maxRunningSpeedMps: number;
  gapSegmentMs: number;
  minCommitDistanceM: number;
}

export const DEFAULT_GPS_PROCESSING_CONFIG: Readonly<GpsProcessingConfig> = Object.freeze({
  distanceMaxAccuracyM: DISTANCE_MAX_ACCURACY_M,
  maxRunningSpeedMps: MAX_RUNNING_SPEED_MPS,
  gapSegmentMs: GPS_GAP_SEGMENT_MS,
  minCommitDistanceM: MIN_COMMIT_DISTANCE_M,
});

/** API・JSON入力用。unknown を純関数内で検証し、型キャストで無効値を隠さない。 */
export interface GpsInputPoint {
  lat: unknown;
  lng: unknown;
  timestamp: unknown;
  accuracy?: unknown;
  alt?: unknown;
  altitudeAccuracy?: unknown;
  speed?: unknown;
  seg?: unknown;
}

/** 正式ルートへ保存できる、検証済みのGPS点。 */
export interface ProcessedGpsPoint {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number;
  alt?: number;
  altitudeAccuracy?: number;
  seg?: true;
}

export type GpsPointDecisionReason =
  | 'INVALID_COORDINATE'
  | 'INVALID_ACCURACY'
  | 'POOR_ACCURACY'
  | 'DUPLICATE'
  | 'NON_MONOTONIC_TIMESTAMP'
  | 'GPS_GAP'
  | 'SEGMENT_BREAK'
  | 'IMPOSSIBLE_SPEED'
  | 'MICRO_JITTER'
  | 'PAUSED'
  | 'ACCEPTED';

export interface GpsProcessingState {
  lastObservedPoint: ProcessedGpsPoint | null;
  /** 精度・速度を通過した最新点。MICRO_JITTERも含み、瞬間速度の補助判定に使う。 */
  lastUsablePoint: ProcessedGpsPoint | null;
  /** デバッグ用の生距離だけに使う基準点。正式距離には使わない。 */
  rawAnchor: ProcessedGpsPoint | null;
  /** 正式距離へ最後に確定した点。MICRO_JITTERでは更新しない。 */
  commitAnchor: ProcessedGpsPoint | null;
  segmentId: number;
  receivedPointCount: number;
  acceptedPointCount: number;
  rejectedPointCount: number;
  rejectedByAccuracyCount: number;
  rejectedBySpeedCount: number;
  rejectedByTimestampCount: number;
  microJitterCount: number;
  segmentBreakCount: number;
  maxGapMs: number;
  rawDistanceM: number;
  filteredDistanceM: number;
  accuracySamplesM: number[];
}

export interface ProcessGpsPointOptions {
  /** 手動/自動停止、セッション復旧、ウォッチドッグ復帰後の次の良好点を分割する。 */
  forceNewSegment?: boolean;
  /** 自動停止成立後の点。品質集計は行うが距離へは入れない。 */
  paused?: boolean;
  /** 正式採用済みルートの再生時はfalse。実受信ストリームでは既定true。 */
  inferGpsGaps?: boolean;
  config?: Readonly<GpsProcessingConfig>;
}

export interface ReplayGpsLogOptions {
  /** 入力がすでにcommit済みで、GPS空白がsegとして明示されている場合にtrue。 */
  segmentsAlreadyMarked?: boolean;
}

export interface ProcessGpsPointResult {
  nextState: GpsProcessingState;
  acceptedPoint: ProcessedGpsPoint | null;
  addedDistanceM: number;
  startedNewSegment: boolean;
  rejectionReason: GpsPointDecisionReason;
  calculatedSegmentDistanceM: number | null;
  calculatedSpeedMps: number | null;
  rawSegmentDistanceM: number;
  segmentId: number;
}

export interface GpsQualitySummary {
  processingVersion: number;
  receivedPointCount: number;
  acceptedPointCount: number;
  rejectedPointCount: number;
  rejectedByAccuracyCount: number;
  rejectedBySpeedCount: number;
  rejectedByTimestampCount: number;
  microJitterCount: number;
  segmentBreakCount: number;
  maxGapMs: number;
  accuracyMedianM: number | null;
  accuracyP95M: number | null;
  rawDistanceM: number;
  filteredDistanceM: number;
  warmupDurationMs: number;
  warmupReadyAccuracyM: number | null;
  foregroundFallbackCount: number;
  backgroundPointCount: number;
  foregroundPointCount: number;
}

export interface GpsRuntimeQualityMetrics {
  warmupDurationMs: number;
  warmupReadyAccuracyM: number | null;
  foregroundFallbackCount: number;
  backgroundPointCount: number;
  foregroundPointCount: number;
}

export interface GpsDebugSample {
  timestamp: unknown;
  latitude: unknown;
  longitude: unknown;
  accuracy: unknown;
  altitude: unknown;
  altitudeAccuracy: unknown;
  speed: unknown;
  calculatedSegmentDistance: number | null;
  calculatedSpeed: number | null;
  accepted: boolean;
  rejectionReason: GpsPointDecisionReason;
  segmentId: number;
  rawCumulativeDistance: number;
  filteredCumulativeDistance: number;
}

export interface GpsReplayResult {
  rawDistanceM: number;
  filteredDistanceM: number;
  differenceM: number;
  acceptedPointCount: number;
  rejectedPointCount: number;
  rejectionCounts: Partial<Record<GpsPointDecisionReason, number>>;
  segmentCount: number;
  accuracyMedianM: number | null;
  accuracyP95M: number | null;
  kilometerSplitDistancesM: number[];
  processedRoute: ProcessedGpsPoint[];
  samples: GpsDebugSample[];
  summary: GpsQualitySummary;
}

export function createInitialGpsProcessingState(): GpsProcessingState {
  return {
    lastObservedPoint: null,
    lastUsablePoint: null,
    rawAnchor: null,
    commitAnchor: null,
    segmentId: 0,
    receivedPointCount: 0,
    acceptedPointCount: 0,
    rejectedPointCount: 0,
    rejectedByAccuracyCount: 0,
    rejectedBySpeedCount: 0,
    rejectedByTimestampCount: 0,
    microJitterCount: 0,
    segmentBreakCount: 0,
    maxGapMs: 0,
    rawDistanceM: 0,
    filteredDistanceM: 0,
    accuracySamplesM: [],
  };
}

export function emptyGpsRuntimeQualityMetrics(): GpsRuntimeQualityMetrics {
  return {
    warmupDurationMs: 0,
    warmupReadyAccuracyM: null,
    foregroundFallbackCount: 0,
    backgroundPointCount: 0,
    foregroundPointCount: 0,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function appendAccuracySample(
  samples: number[],
  accuracyM: number,
  receivedOrdinal: number,
): number[] {
  const next = [...samples];
  if (next.length < GPS_QUALITY_ACCURACY_SAMPLE_LIMIT) {
    next.push(accuracyM);
    return next;
  }

  // 決定的reservoir sampling。純粋関数性とリプレイ再現性を保ちつつ、
  // 長時間活動でも中央値/P95用データを上限内の概算サンプルにする。
  let hash = receivedOrdinal | 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  const candidate = (hash >>> 0) % Math.max(1, receivedOrdinal);
  if (candidate < GPS_QUALITY_ACCURACY_SAMPLE_LIMIT) next[candidate] = accuracyM;
  return next;
}

function normalizePoint(input: GpsInputPoint):
  | { point: ProcessedGpsPoint; reason: null }
  | { point: null; reason: 'INVALID_COORDINATE' | 'INVALID_ACCURACY' } {
  if (
    !isFiniteNumber(input.lat) || input.lat < -90 || input.lat > 90
    || !isFiniteNumber(input.lng) || input.lng < -180 || input.lng > 180
    || !isFiniteNumber(input.timestamp)
  ) {
    return { point: null, reason: 'INVALID_COORDINATE' };
  }
  if (!isFiniteNumber(input.accuracy) || input.accuracy <= 0) {
    return { point: null, reason: 'INVALID_ACCURACY' };
  }

  const point: ProcessedGpsPoint = {
    lat: input.lat,
    lng: input.lng,
    timestamp: input.timestamp,
    accuracy: input.accuracy,
  };
  if (isFiniteNumber(input.alt)) point.alt = input.alt;
  if (isFiniteNumber(input.altitudeAccuracy) && input.altitudeAccuracy >= 0) {
    point.altitudeAccuracy = input.altitudeAccuracy;
  }
  return { point, reason: null };
}

export function haversineDistanceM(
  a: Pick<ProcessedGpsPoint, 'lat' | 'lng'>,
  b: Pick<ProcessedGpsPoint, 'lat' | 'lng'>,
): number {
  const radiusM = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180)
      * Math.cos((b.lat * Math.PI) / 180)
      * Math.sin(dLng / 2) ** 2;
  return radiusM * 2 * Math.asin(Math.sqrt(sin2));
}

function withRejectedReason(
  state: GpsProcessingState,
  reason: GpsPointDecisionReason,
): GpsProcessingState {
  const next = { ...state, rejectedPointCount: state.rejectedPointCount + 1 };
  if (reason === 'INVALID_ACCURACY' || reason === 'POOR_ACCURACY') {
    next.rejectedByAccuracyCount += 1;
  } else if (reason === 'IMPOSSIBLE_SPEED') {
    next.rejectedBySpeedCount += 1;
  } else if (reason === 'DUPLICATE' || reason === 'NON_MONOTONIC_TIMESTAMP') {
    next.rejectedByTimestampCount += 1;
  } else if (reason === 'MICRO_JITTER') {
    next.microJitterCount += 1;
  }
  return next;
}

function result(
  nextState: GpsProcessingState,
  rejectionReason: GpsPointDecisionReason,
  values: Partial<Omit<ProcessGpsPointResult, 'nextState' | 'rejectionReason'>> = {},
): ProcessGpsPointResult {
  return {
    nextState,
    acceptedPoint: null,
    addedDistanceM: 0,
    startedNewSegment: false,
    rejectionReason,
    calculatedSegmentDistanceM: null,
    calculatedSpeedMps: null,
    rawSegmentDistanceM: 0,
    segmentId: nextState.segmentId,
    ...values,
  };
}

/**
 * GPS点を一件処理する。低品質点・異常点・MICRO_JITTERは commitAnchor を更新しない。
 * したがって単発異常点の次に正常ルートへ戻った点を、最後の正式基準点から再評価できる。
 */
export function processGpsPoint(
  state: GpsProcessingState,
  input: GpsInputPoint,
  options: ProcessGpsPointOptions = {},
): ProcessGpsPointResult {
  const config = options.config ?? DEFAULT_GPS_PROCESSING_CONFIG;
  let next: GpsProcessingState = {
    ...state,
    receivedPointCount: state.receivedPointCount + 1,
    accuracySamplesM: state.accuracySamplesM,
  };

  const normalized = normalizePoint(input);
  if (!normalized.point) {
    return result(withRejectedReason(next, normalized.reason), normalized.reason);
  }
  const point = normalized.point;
  next.accuracySamplesM = appendAccuracySample(
    state.accuracySamplesM,
    point.accuracy,
    next.receivedPointCount,
  );

  const previousObserved = state.lastObservedPoint;
  if (
    previousObserved
    && point.timestamp === previousObserved.timestamp
    && point.lat === previousObserved.lat
    && point.lng === previousObserved.lng
  ) {
    return result(withRejectedReason(next, 'DUPLICATE'), 'DUPLICATE');
  }
  if (previousObserved && point.timestamp <= previousObserved.timestamp) {
    return result(withRejectedReason(next, 'NON_MONOTONIC_TIMESTAMP'), 'NON_MONOTONIC_TIMESTAMP');
  }

  next.lastObservedPoint = point;

  if (options.paused) {
    // 停止中の移動をrawDistanceにも混ぜず、再開時は必ず新しい基準点から始める。
    next.rawAnchor = null;
    return result(withRejectedReason(next, 'PAUSED'), 'PAUSED');
  }

  if (point.accuracy > config.distanceMaxAccuracyM) {
    // 生距離では低精度点の影響も比較できるよう、基本値が有効な点だけは接続する。
    const observedGapMs = previousObserved ? point.timestamp - previousObserved.timestamp : 0;
    let rawSegmentDistanceM = 0;
    if (state.rawAnchor && !options.forceNewSegment && input.seg !== true && observedGapMs < config.gapSegmentMs) {
      rawSegmentDistanceM = haversineDistanceM(state.rawAnchor, point);
      next.rawDistanceM += rawSegmentDistanceM;
    }
    next.rawAnchor = point;
    return result(withRejectedReason(next, 'POOR_ACCURACY'), 'POOR_ACCURACY', { rawSegmentDistanceM });
  }

  const observedGapMs = previousObserved ? point.timestamp - previousObserved.timestamp : 0;
  const explicitSegmentBreak = options.forceNewSegment === true || input.seg === true;
  let rawSegmentDistanceM = 0;
  if (state.rawAnchor && !explicitSegmentBreak && observedGapMs < config.gapSegmentMs) {
    rawSegmentDistanceM = haversineDistanceM(state.rawAnchor, point);
    next.rawDistanceM += rawSegmentDistanceM;
  }
  next.rawAnchor = point;

  // MICRO_JITTERも「良好なGPS受信は続いている」証拠になる。commitAnchorの時刻だけを
  // 使うと静止中を誤ってGPS空白とみなすため、実受信では最後の良好点と比較する。
  const usableGapMs = state.lastUsablePoint ? point.timestamp - state.lastUsablePoint.timestamp : 0;
  const gpsGap = options.inferGpsGaps !== false
    && state.lastUsablePoint !== null
    && usableGapMs >= config.gapSegmentMs;
  if (gpsGap) next.maxGapMs = Math.max(state.maxGapMs, usableGapMs);

  if (!state.commitAnchor || explicitSegmentBreak || gpsGap) {
    const startsNewSegment = state.commitAnchor !== null && (explicitSegmentBreak || gpsGap);
    const segmentId = startsNewSegment ? state.segmentId + 1 : state.segmentId;
    const acceptedPoint: ProcessedGpsPoint = startsNewSegment ? { ...point, seg: true } : point;
    next = {
      ...next,
      commitAnchor: point,
      lastUsablePoint: point,
      segmentId,
      segmentBreakCount: state.segmentBreakCount + (startsNewSegment ? 1 : 0),
      acceptedPointCount: state.acceptedPointCount + 1,
    };
    return result(next, gpsGap ? 'GPS_GAP' : explicitSegmentBreak ? 'SEGMENT_BREAK' : 'ACCEPTED', {
      acceptedPoint,
      startedNewSegment: startsNewSegment,
      rawSegmentDistanceM,
      segmentId,
    });
  }

  const candidateDistanceM = haversineDistanceM(state.commitAnchor, point);
  const elapsedSeconds = (point.timestamp - state.commitAnchor.timestamp) / 1_000;
  const anchorSpeedMps = elapsedSeconds > 0 ? candidateDistanceM / elapsedSeconds : Infinity;
  // commitAnchorがジッター抑制中に古くなると、単発ジャンプの速度が長い経過時間で
  // 薄まる。そこで、距離加算はcommitAnchor間のまま、直前の良好点との瞬間速度も併用する。
  const adjacentElapsedSeconds = state.lastUsablePoint
    ? (point.timestamp - state.lastUsablePoint.timestamp) / 1_000
    : elapsedSeconds;
  const adjacentDistanceM = state.lastUsablePoint
    ? haversineDistanceM(state.lastUsablePoint, point)
    : candidateDistanceM;
  const adjacentSpeedMps = adjacentElapsedSeconds > 0
    ? adjacentDistanceM / adjacentElapsedSeconds
    : Infinity;
  const calculatedSpeedMps = Math.max(anchorSpeedMps, adjacentSpeedMps);
  if (!Number.isFinite(calculatedSpeedMps) || calculatedSpeedMps > config.maxRunningSpeedMps) {
    return result(withRejectedReason(next, 'IMPOSSIBLE_SPEED'), 'IMPOSSIBLE_SPEED', {
      calculatedSegmentDistanceM: candidateDistanceM,
      calculatedSpeedMps,
      rawSegmentDistanceM,
    });
  }

  next.lastUsablePoint = point;
  if (candidateDistanceM < config.minCommitDistanceM) {
    return result(withRejectedReason(next, 'MICRO_JITTER'), 'MICRO_JITTER', {
      calculatedSegmentDistanceM: candidateDistanceM,
      calculatedSpeedMps,
      rawSegmentDistanceM,
    });
  }

  next = {
    ...next,
    commitAnchor: point,
    acceptedPointCount: state.acceptedPointCount + 1,
    filteredDistanceM: state.filteredDistanceM + candidateDistanceM,
  };
  return result(next, 'ACCEPTED', {
    acceptedPoint: point,
    addedDistanceM: candidateDistanceM,
    calculatedSegmentDistanceM: candidateDistanceM,
    calculatedSpeedMps,
    rawSegmentDistanceM,
  });
}

function percentile(sorted: number[], ratio: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.min(index, sorted.length - 1)];
}

export function gpsQualitySummary(
  state: GpsProcessingState,
  runtime: Partial<GpsRuntimeQualityMetrics> = {},
): GpsQualitySummary {
  const sortedAccuracy = [...state.accuracySamplesM].sort((a, b) => a - b);
  const middle = Math.floor(sortedAccuracy.length / 2);
  const median = sortedAccuracy.length === 0
    ? null
    : sortedAccuracy.length % 2 === 1
      ? sortedAccuracy[middle]
      : (sortedAccuracy[middle - 1] + sortedAccuracy[middle]) / 2;
  return {
    processingVersion: GPS_PROCESSING_VERSION,
    receivedPointCount: state.receivedPointCount,
    acceptedPointCount: state.acceptedPointCount,
    rejectedPointCount: state.rejectedPointCount,
    rejectedByAccuracyCount: state.rejectedByAccuracyCount,
    rejectedBySpeedCount: state.rejectedBySpeedCount,
    rejectedByTimestampCount: state.rejectedByTimestampCount,
    microJitterCount: state.microJitterCount,
    segmentBreakCount: state.segmentBreakCount,
    maxGapMs: state.maxGapMs,
    accuracyMedianM: median,
    accuracyP95M: percentile(sortedAccuracy, 0.95),
    rawDistanceM: state.rawDistanceM,
    filteredDistanceM: state.filteredDistanceM,
    warmupDurationMs: runtime.warmupDurationMs ?? 0,
    warmupReadyAccuracyM: runtime.warmupReadyAccuracyM ?? null,
    foregroundFallbackCount: runtime.foregroundFallbackCount ?? 0,
    backgroundPointCount: runtime.backgroundPointCount ?? 0,
    foregroundPointCount: runtime.foregroundPointCount ?? 0,
  };
}

export function gpsDebugSample(input: GpsInputPoint, outcome: ProcessGpsPointResult): GpsDebugSample {
  return {
    timestamp: input.timestamp,
    latitude: input.lat,
    longitude: input.lng,
    accuracy: input.accuracy ?? null,
    altitude: input.alt ?? null,
    altitudeAccuracy: input.altitudeAccuracy ?? null,
    speed: input.speed ?? null,
    calculatedSegmentDistance: outcome.calculatedSegmentDistanceM,
    calculatedSpeed: outcome.calculatedSpeedMps,
    accepted: outcome.acceptedPoint !== null,
    rejectionReason: outcome.rejectionReason,
    segmentId: outcome.segmentId,
    rawCumulativeDistance: outcome.nextState.rawDistanceM,
    filteredCumulativeDistance: outcome.nextState.filteredDistanceM,
  };
}

function kilometerSplits(outcomes: ProcessGpsPointResult[]): number[] {
  const splits: number[] = [];
  let current = 0;
  for (const outcome of outcomes) {
    let remaining = outcome.addedDistanceM;
    while (remaining > 0) {
      const needed = 1_000 - current;
      if (remaining >= needed) {
        splits.push(1_000);
        remaining -= needed;
        current = 0;
      } else {
        current += remaining;
        remaining = 0;
      }
    }
  }
  if (current > 0) splits.push(current);
  return splits;
}

/** アプリ本体と同じ純粋関数を使い、保存ログをAPI起動なしで再生する。 */
export function replayGpsLog(
  points: GpsInputPoint[],
  config: Readonly<GpsProcessingConfig> = DEFAULT_GPS_PROCESSING_CONFIG,
  options: ReplayGpsLogOptions = {},
): GpsReplayResult {
  let state = createInitialGpsProcessingState();
  let pendingSegmentBreak = false;
  const route: ProcessedGpsPoint[] = [];
  const outcomes: ProcessGpsPointResult[] = [];
  const samples: GpsDebugSample[] = [];
  const rejectionCounts: Partial<Record<GpsPointDecisionReason, number>> = {};

  for (const point of points) {
    if (point.seg === true) pendingSegmentBreak = true;
    const outcome = processGpsPoint(state, point, {
      config,
      forceNewSegment: pendingSegmentBreak,
      // Functionsに送られるのはcommit点だけ。中間のMICRO_JITTERが無いため、
      // 疎なtimestampから空白を再推定せず、クライアントが明示したsegを使う。
      inferGpsGaps: options.segmentsAlreadyMarked !== true,
    });
    state = outcome.nextState;
    if (outcome.acceptedPoint) {
      route.push(outcome.acceptedPoint);
      pendingSegmentBreak = false;
    }
    outcomes.push(outcome);
    samples.push(gpsDebugSample(point, outcome));
    rejectionCounts[outcome.rejectionReason] = (rejectionCounts[outcome.rejectionReason] ?? 0) + 1;
  }

  const summary = gpsQualitySummary(state);
  return {
    rawDistanceM: state.rawDistanceM,
    filteredDistanceM: state.filteredDistanceM,
    differenceM: state.rawDistanceM - state.filteredDistanceM,
    acceptedPointCount: state.acceptedPointCount,
    rejectedPointCount: state.rejectedPointCount,
    rejectionCounts,
    segmentCount: route.length > 0 ? state.segmentId + 1 : 0,
    accuracyMedianM: summary.accuracyMedianM,
    accuracyP95M: summary.accuracyP95M,
    kilometerSplitDistancesM: kilometerSplits(outcomes),
    processedRoute: route,
    samples,
    summary,
  };
}

/** クライアント採用済み点をFunctionsで正式再生する入口。 */
export function replayAcceptedGpsRoute(
  points: GpsInputPoint[],
  config: Readonly<GpsProcessingConfig> = DEFAULT_GPS_PROCESSING_CONFIG,
): GpsReplayResult {
  return replayGpsLog(points, config, { segmentsAlreadyMarked: true });
}
