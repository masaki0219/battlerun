/**
 * ZELIO の水平距離計算でクライアントと Functions が共有する純粋関数。
 *
 * このファイルは React Native / Firebase の API を import しない。アプリ側は
 * `utils/gpsProcessing.ts` の re-export 経由で同じ実装を利用する。
 * しきい値は実走ログで調整する暫定値であり、OS が保証する精度ではない。
 */

export const GPS_PROCESSING_VERSION = 3;

/** 高信頼点。ウォームアップではこの精度が3点連続するとready。暫定値。 */
export const GPS_HIGH_CONFIDENCE_ACCURACY_M = 15;
/** 軌跡整合性を確認してから採用する条件付き点の上限。暫定値。 */
export const GPS_CONDITIONAL_ACCURACY_M = 25;
/** これを超える点は正式距離へ使わない。暫定値。 */
export const GPS_REJECT_ACCURACY_M = 25;
/** 通常開始の目安。15m以内が3点連続すると ready。 */
export const START_READY_ACCURACY_M = GPS_HIGH_CONFIDENCE_ACCURACY_M;
/** 注意表示つきで開始を許可する上限。 */
export const START_ACCEPTABLE_ACCURACY_M = GPS_REJECT_ACCURACY_M;
/** 後方互換のimport名。新規コードはGPS_REJECT_ACCURACY_Mを使う。 */
export const DISTANCE_MAX_ACCURACY_M = GPS_REJECT_ACCURACY_M;
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
/** A-Cの観測窓がこれ以内の場合だけ単発スパイク候補にする。 */
export const GPS_SPIKE_MAX_WINDOW_MS = 4_000;
/** Bの線分A-Cからの横方向偏差。 */
export const GPS_SPIKE_MIN_CROSS_TRACK_M = 8;
/** A-B-C経路がA-C直線より余分に増える距離。 */
export const GPS_SPIKE_MIN_DETOUR_M = 10;
/** Bだけaccuracyが悪いと判断する差。 */
export const GPS_SPIKE_ACCURACY_DIFFERENCE_M = 5;

// 方向・速度の補助判定値。低速時は方向だけで除外しないための保守的な内部定数。
// 実走調整の主対象である公開configとは分けるが、数値はここ以外へ散在させない。
const GPS_LEGITIMATE_TURN_MIN_DEG = 45;
const GPS_LEGITIMATE_INCOMING_MAX_DEG = 55;
const GPS_TRAJECTORY_CONTRADICTION_MIN_DEG = 75;
const GPS_TRAJECTORY_RESUMED_MAX_DEG = 40;
const GPS_DIRECTION_CHECK_MIN_SPEED_MPS = 1.5;
const GPS_ABRUPT_SPEED_MIN_MPS = 2;
const GPS_ABRUPT_SPEED_DELTA_MPS = 2.5;
const GPS_ABRUPT_SPEED_RATIO = 3;
const GPS_SPEED_RATIO_FLOOR_MPS = 0.5;
const GPS_FINALIZE_LOW_SPEED_MPS = 1.2;
const GPS_FINALIZE_LATERAL_TURN_MIN_DEG = 60;
const LOCAL_VECTOR_EPSILON_M = 0.01;

export interface GpsProcessingConfig {
  highConfidenceAccuracyM: number;
  conditionalAccuracyM: number;
  maxAccuracyM: number;
  maxRunningSpeedMps: number;
  minCommitDistanceM: number;
  gpsGapSegmentMs: number;
  spikeMaxWindowMs: number;
  spikeMinCrossTrackM: number;
  spikeMinDetourM: number;
  spikeAccuracyDifferenceM: number;
}

export const DEFAULT_GPS_PROCESSING_CONFIG: Readonly<GpsProcessingConfig> = Object.freeze({
  highConfidenceAccuracyM: GPS_HIGH_CONFIDENCE_ACCURACY_M,
  conditionalAccuracyM: GPS_CONDITIONAL_ACCURACY_M,
  maxAccuracyM: GPS_REJECT_ACCURACY_M,
  maxRunningSpeedMps: MAX_RUNNING_SPEED_MPS,
  minCommitDistanceM: MIN_COMMIT_DISTANCE_M,
  gpsGapSegmentMs: GPS_GAP_SEGMENT_MS,
  spikeMaxWindowMs: GPS_SPIKE_MAX_WINDOW_MS,
  spikeMinCrossTrackM: GPS_SPIKE_MIN_CROSS_TRACK_M,
  spikeMinDetourM: GPS_SPIKE_MIN_DETOUR_M,
  spikeAccuracyDifferenceM: GPS_SPIKE_ACCURACY_DIFFERENCE_M,
});

/** v2クライアントが送ったcommit点を、当時の35m基準で検証するための固定設定。 */
export const LEGACY_V2_GPS_PROCESSING_CONFIG: Readonly<GpsProcessingConfig> = Object.freeze({
  ...DEFAULT_GPS_PROCESSING_CONFIG,
  highConfidenceAccuracyM: 35,
  conditionalAccuracyM: 35,
  maxAccuracyM: 35,
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
  | 'PENDING'
  | 'CONDITIONAL_ACCURACY_REJECTED'
  | 'THREE_POINT_SPIKE'
  | 'END_OF_ACTIVITY_JITTER'
  | 'SEGMENT_PENDING_RESET'
  | 'PAUSED'
  | 'ACCEPTED';

export interface GpsProcessingState {
  processingVersion: number;
  lastObservedPoint: ProcessedGpsPoint | null;
  /** 精度・速度を通過した最新点。MICRO_JITTERも含み、瞬間速度の補助判定に使う。 */
  lastUsablePoint: ProcessedGpsPoint | null;
  /** デバッグ用の生距離だけに使う基準点。正式距離には使わない。 */
  rawAnchor: ProcessedGpsPoint | null;
  /** 正式距離へ最後に確定した点。MICRO_JITTERでは更新しない。 */
  commitAnchor: ProcessedGpsPoint | null;
  /** commitAnchorの一つ前。通常の曲がり角/Uターンと横飛びを区別する補助に使う。 */
  previousCommitAnchor: ProcessedGpsPoint | null;
  /** Cを受信して軌跡整合性を確認するまで正式距離へ入れないB。 */
  pendingPoint: ProcessedGpsPoint | null;
  /** timestamp逆転や停止後、次の良好点を必ず新しいセグメント先頭にする。 */
  requiresNewSegment: boolean;
  segmentId: number;
  receivedPointCount: number;
  acceptedPointCount: number;
  rejectedPointCount: number;
  rejectedByAccuracyCount: number;
  rejectedBySpeedCount: number;
  rejectedByTimestampCount: number;
  microJitterCount: number;
  highConfidencePointCount: number;
  conditionalPointCount: number;
  conditionalAcceptedPointCount: number;
  conditionalRejectedPointCount: number;
  threePointSpikeCount: number;
  endOfActivityDiscardedPointCount: number;
  segmentPendingResetCount: number;
  segmentBreakCount: number;
  maxGapMs: number;
  rawDistanceM: number;
  filteredDistanceM: number;
  accuracySamplesM: number[];
  decisionCounts: Partial<Record<GpsPointDecisionReason, number>>;
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
  acceptedPoints: ProcessedGpsPoint[];
  /** この入力によって判定が確定した保留点。 */
  resolvedPoint: ProcessedGpsPoint | null;
  /** 距離だけでなくdisplayPointsからも除く単発異常点。 */
  removedDisplayPointTimestamp: number | null;
  /** 地図表示候補となる今回の受信点。正式距離への採否とは分離する。 */
  displayPoint: ProcessedGpsPoint | null;
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
  highConfidencePointCount: number;
  conditionalPointCount: number;
  conditionalAcceptedPointCount: number;
  conditionalRejectedPointCount: number;
  threePointSpikeCount: number;
  endOfActivityDiscardedPointCount: number;
  segmentPendingResetCount: number;
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
  resolvedTimestamp: number | null;
  pendingTimestamp: number | null;
  segmentId: number;
  rawCumulativeDistance: number;
  filteredCumulativeDistance: number;
}

export interface GpsReplayResult {
  processingVersion: number;
  rawDistanceM: number;
  filteredDistanceM: number;
  differenceM: number;
  v2FilteredDistanceM: number | null;
  differenceFromV2M: number | null;
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
    processingVersion: GPS_PROCESSING_VERSION,
    lastObservedPoint: null,
    lastUsablePoint: null,
    rawAnchor: null,
    commitAnchor: null,
    previousCommitAnchor: null,
    pendingPoint: null,
    requiresNewSegment: false,
    segmentId: 0,
    receivedPointCount: 0,
    acceptedPointCount: 0,
    rejectedPointCount: 0,
    rejectedByAccuracyCount: 0,
    rejectedBySpeedCount: 0,
    rejectedByTimestampCount: 0,
    microJitterCount: 0,
    highConfidencePointCount: 0,
    conditionalPointCount: 0,
    conditionalAcceptedPointCount: 0,
    conditionalRejectedPointCount: 0,
    threePointSpikeCount: 0,
    endOfActivityDiscardedPointCount: 0,
    segmentPendingResetCount: 0,
    segmentBreakCount: 0,
    maxGapMs: 0,
    rawDistanceM: 0,
    filteredDistanceM: 0,
    accuracySamplesM: [],
    decisionCounts: {},
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
  point?: ProcessedGpsPoint | null,
  config: Readonly<GpsProcessingConfig> = DEFAULT_GPS_PROCESSING_CONFIG,
): GpsProcessingState {
  const next = {
    ...state,
    rejectedPointCount: state.rejectedPointCount + 1,
    decisionCounts: {
      ...state.decisionCounts,
      [reason]: (state.decisionCounts[reason] ?? 0) + 1,
    },
  };
  if (reason === 'INVALID_ACCURACY' || reason === 'POOR_ACCURACY') {
    next.rejectedByAccuracyCount += 1;
  } else if (reason === 'IMPOSSIBLE_SPEED' || reason === 'CONDITIONAL_ACCURACY_REJECTED') {
    next.rejectedBySpeedCount += 1;
  } else if (reason === 'DUPLICATE' || reason === 'NON_MONOTONIC_TIMESTAMP') {
    next.rejectedByTimestampCount += 1;
  } else if (reason === 'MICRO_JITTER') {
    next.microJitterCount += 1;
  } else if (reason === 'THREE_POINT_SPIKE') {
    next.threePointSpikeCount += 1;
  } else if (reason === 'END_OF_ACTIVITY_JITTER') {
    next.endOfActivityDiscardedPointCount += 1;
  } else if (reason === 'SEGMENT_PENDING_RESET') {
    next.segmentPendingResetCount += 1;
  }
  if (
    point
    && point.accuracy > config.highConfidenceAccuracyM
    && point.accuracy <= config.conditionalAccuracyM
  ) {
    next.conditionalRejectedPointCount += 1;
  }
  return next;
}

function withAcceptedReason(
  state: GpsProcessingState,
  point: ProcessedGpsPoint,
  reason: 'ACCEPTED' | 'GPS_GAP' | 'SEGMENT_BREAK',
  config: Readonly<GpsProcessingConfig>,
): GpsProcessingState {
  return {
    ...state,
    acceptedPointCount: state.acceptedPointCount + 1,
    conditionalAcceptedPointCount: state.conditionalAcceptedPointCount + (
      point.accuracy > config.highConfidenceAccuracyM
      && point.accuracy <= config.conditionalAccuracyM
        ? 1
        : 0
    ),
    decisionCounts: {
      ...state.decisionCounts,
      [reason]: (state.decisionCounts[reason] ?? 0) + 1,
    },
  };
}

function result(
  nextState: GpsProcessingState,
  rejectionReason: GpsPointDecisionReason,
  values: Partial<Omit<ProcessGpsPointResult, 'nextState' | 'rejectionReason'>> = {},
): ProcessGpsPointResult {
  const acceptedPoint = values.acceptedPoint ?? null;
  const acceptedPoints = values.acceptedPoints ?? (acceptedPoint ? [acceptedPoint] : []);
  return {
    nextState,
    resolvedPoint: null,
    removedDisplayPointTimestamp: null,
    displayPoint: null,
    addedDistanceM: 0,
    startedNewSegment: false,
    rejectionReason,
    calculatedSegmentDistanceM: null,
    calculatedSpeedMps: null,
    rawSegmentDistanceM: 0,
    segmentId: nextState.segmentId,
    ...values,
    acceptedPoint,
    acceptedPoints,
  };
}

/** v2またはcommit済みrouteの検証に使う、1点ずつ即時確定する旧処理。 */
function processGpsPointDirect(
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

  if (point.accuracy > config.maxAccuracyM) {
    // 生距離では低精度点の影響も比較できるよう、基本値が有効な点だけは接続する。
    const observedGapMs = previousObserved ? point.timestamp - previousObserved.timestamp : 0;
    let rawSegmentDistanceM = 0;
    if (state.rawAnchor && !options.forceNewSegment && input.seg !== true && observedGapMs < config.gpsGapSegmentMs) {
      rawSegmentDistanceM = haversineDistanceM(state.rawAnchor, point);
      next.rawDistanceM += rawSegmentDistanceM;
    }
    next.rawAnchor = point;
    return result(withRejectedReason(next, 'POOR_ACCURACY'), 'POOR_ACCURACY', { rawSegmentDistanceM });
  }

  const observedGapMs = previousObserved ? point.timestamp - previousObserved.timestamp : 0;
  const explicitSegmentBreak = options.forceNewSegment === true || input.seg === true;
  let rawSegmentDistanceM = 0;
  if (state.rawAnchor && !explicitSegmentBreak && observedGapMs < config.gpsGapSegmentMs) {
    rawSegmentDistanceM = haversineDistanceM(state.rawAnchor, point);
    next.rawDistanceM += rawSegmentDistanceM;
  }
  next.rawAnchor = point;

  // MICRO_JITTERも「良好なGPS受信は続いている」証拠になる。commitAnchorの時刻だけを
  // 使うと静止中を誤ってGPS空白とみなすため、実受信では最後の良好点と比較する。
  const usableGapMs = state.lastUsablePoint ? point.timestamp - state.lastUsablePoint.timestamp : 0;
  const gpsGap = options.inferGpsGaps !== false
    && state.lastUsablePoint !== null
    && usableGapMs >= config.gpsGapSegmentMs;
  if (gpsGap) next.maxGapMs = Math.max(state.maxGapMs, usableGapMs);

  if (!state.commitAnchor || explicitSegmentBreak || gpsGap) {
    const startsNewSegment = state.commitAnchor !== null && (explicitSegmentBreak || gpsGap);
    const segmentId = startsNewSegment ? state.segmentId + 1 : state.segmentId;
    const acceptedPoint: ProcessedGpsPoint = startsNewSegment ? { ...point, seg: true } : point;
    next = {
      ...next,
      commitAnchor: point,
      previousCommitAnchor: null,
      lastUsablePoint: point,
      segmentId,
      segmentBreakCount: state.segmentBreakCount + (startsNewSegment ? 1 : 0),
    };
    next = withAcceptedReason(
      next,
      acceptedPoint,
      gpsGap ? 'GPS_GAP' : explicitSegmentBreak ? 'SEGMENT_BREAK' : 'ACCEPTED',
      config,
    );
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
    return result(withRejectedReason(next, 'IMPOSSIBLE_SPEED', point, config), 'IMPOSSIBLE_SPEED', {
      calculatedSegmentDistanceM: candidateDistanceM,
      calculatedSpeedMps,
      rawSegmentDistanceM,
    });
  }

  next.lastUsablePoint = point;
  if (candidateDistanceM < config.minCommitDistanceM) {
    return result(withRejectedReason(next, 'MICRO_JITTER', point, config), 'MICRO_JITTER', {
      calculatedSegmentDistanceM: candidateDistanceM,
      calculatedSpeedMps,
      rawSegmentDistanceM,
    });
  }

  next = {
    ...next,
    previousCommitAnchor: state.commitAnchor,
    commitAnchor: point,
    filteredDistanceM: state.filteredDistanceM + candidateDistanceM,
  };
  next = withAcceptedReason(next, point, 'ACCEPTED', config);
  return result(next, 'ACCEPTED', {
    acceptedPoint: point,
    addedDistanceM: candidateDistanceM,
    calculatedSegmentDistanceM: candidateDistanceM,
    calculatedSpeedMps,
    rawSegmentDistanceM,
  });
}

interface LocalVector {
  x: number;
  y: number;
}

function localVector(
  from: Pick<ProcessedGpsPoint, 'lat' | 'lng'>,
  to: Pick<ProcessedGpsPoint, 'lat' | 'lng'>,
): LocalVector {
  const meanLatitudeRad = ((from.lat + to.lat) * Math.PI) / 360;
  return {
    x: (to.lng - from.lng) * 111_194.926_645 * Math.cos(meanLatitudeRad),
    y: (to.lat - from.lat) * 111_194.926_645,
  };
}

function vectorLength(vector: LocalVector): number {
  return Math.hypot(vector.x, vector.y);
}

function angleDegrees(a: LocalVector, b: LocalVector): number | null {
  const denominator = vectorLength(a) * vectorLength(b);
  if (denominator < LOCAL_VECTOR_EPSILON_M) return null;
  const cosine = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / denominator));
  return Math.acos(cosine) * 180 / Math.PI;
}

/** 短距離GPS用の局所平面上で、Bから有限線分A-Cまでの最短距離を返す。 */
export function crossTrackDistanceM(
  a: Pick<ProcessedGpsPoint, 'lat' | 'lng'>,
  b: Pick<ProcessedGpsPoint, 'lat' | 'lng'>,
  c: Pick<ProcessedGpsPoint, 'lat' | 'lng'>,
): number {
  const ac = localVector(a, c);
  const ab = localVector(a, b);
  const denominator = ac.x ** 2 + ac.y ** 2;
  if (denominator < LOCAL_VECTOR_EPSILON_M) return vectorLength(ab);
  const ratio = Math.max(0, Math.min(1, (ab.x * ac.x + ab.y * ac.y) / denominator));
  return Math.hypot(ab.x - ac.x * ratio, ab.y - ac.y * ratio);
}

function crossTrackFromIncomingLineM(
  previous: ProcessedGpsPoint,
  anchor: ProcessedGpsPoint,
  candidate: ProcessedGpsPoint,
): number {
  const incoming = localVector(previous, anchor);
  const outgoing = localVector(anchor, candidate);
  const length = vectorLength(incoming);
  if (length < LOCAL_VECTOR_EPSILON_M) return vectorLength(outgoing);
  return Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x) / length;
}

function speedMps(distanceM: number, fromMs: number, toMs: number): number {
  const seconds = (toMs - fromMs) / 1_000;
  return seconds > 0 ? distanceM / seconds : Infinity;
}

interface ThreePointMetrics {
  dAB: number;
  dBC: number;
  dAC: number;
  detourM: number;
  crossTrackM: number;
  speedABMps: number;
  speedBCMps: number;
  speedACMps: number;
  windowMs: number;
  turnAngleDeg: number | null;
  incomingAlignmentDeg: number | null;
  trajectoryContradiction: boolean;
  legitimateTurn: boolean;
  abruptSpeedChange: boolean;
}

function threePointMetrics(
  state: GpsProcessingState,
  a: ProcessedGpsPoint,
  b: ProcessedGpsPoint,
  c: ProcessedGpsPoint,
  config: Readonly<GpsProcessingConfig>,
): ThreePointMetrics {
  const dAB = haversineDistanceM(a, b);
  const dBC = haversineDistanceM(b, c);
  const dAC = haversineDistanceM(a, c);
  const speedABMps = speedMps(dAB, a.timestamp, b.timestamp);
  const speedBCMps = speedMps(dBC, b.timestamp, c.timestamp);
  const speedACMps = speedMps(dAC, a.timestamp, c.timestamp);
  const ab = localVector(a, b);
  const bc = localVector(b, c);
  const ac = localVector(a, c);
  const incoming = state.previousCommitAnchor
    ? localVector(state.previousCommitAnchor, a)
    : null;
  const turnAngleDeg = angleDegrees(ab, bc);
  const incomingAlignmentDeg = incoming ? angleDegrees(incoming, ab) : null;
  const resumedAlignmentDeg = incoming ? angleDegrees(incoming, ac) : null;
  const maxLegSpeed = Math.max(speedABMps, speedBCMps);
  const minLegSpeed = Math.min(speedABMps, speedBCMps);
  const abruptSpeedChange = Number.isFinite(maxLegSpeed)
    && maxLegSpeed >= GPS_ABRUPT_SPEED_MIN_MPS
    && maxLegSpeed - minLegSpeed >= GPS_ABRUPT_SPEED_DELTA_MPS
    && maxLegSpeed / Math.max(GPS_SPEED_RATIO_FLOOR_MPS, minLegSpeed) >= GPS_ABRUPT_SPEED_RATIO;
  const legitimateTurn = turnAngleDeg !== null
    && turnAngleDeg >= GPS_LEGITIMATE_TURN_MIN_DEG
    && (incomingAlignmentDeg === null || incomingAlignmentDeg <= GPS_LEGITIMATE_INCOMING_MAX_DEG)
    && dAB >= config.minCommitDistanceM
    && dBC >= config.minCommitDistanceM
    && speedABMps <= config.maxRunningSpeedMps
    && speedBCMps <= config.maxRunningSpeedMps;
  const trajectoryContradiction = incomingAlignmentDeg !== null
    && resumedAlignmentDeg !== null
    && incomingAlignmentDeg >= GPS_TRAJECTORY_CONTRADICTION_MIN_DEG
    && resumedAlignmentDeg <= GPS_TRAJECTORY_RESUMED_MAX_DEG
    && maxLegSpeed > GPS_DIRECTION_CHECK_MIN_SPEED_MPS;
  return {
    dAB,
    dBC,
    dAC,
    detourM: Math.max(0, dAB + dBC - dAC),
    crossTrackM: crossTrackDistanceM(a, b, c),
    speedABMps,
    speedBCMps,
    speedACMps,
    windowMs: c.timestamp - a.timestamp,
    turnAngleDeg,
    incomingAlignmentDeg,
    trajectoryContradiction,
    legitimateTurn,
    abruptSpeedChange,
  };
}

/**
 * 停止・追跡方式切替・復旧など、次のGPS点を待たずにセグメント境界を確定する。
 * 保留点を終了時finalizeへ持ち越さず、次の良好点を新しいセグメント先頭にする。
 */
export function requestGpsProcessingSegmentBreak(
  state: GpsProcessingState,
  config: Readonly<GpsProcessingConfig> = DEFAULT_GPS_PROCESSING_CONFIG,
): { state: GpsProcessingState; removedTimestamp: number | null } {
  if (!state.pendingPoint) {
    return {
      state: {
        ...state,
        lastUsablePoint: null,
        previousCommitAnchor: null,
        requiresNewSegment: true,
      },
      removedTimestamp: null,
    };
  }
  const pending = state.pendingPoint;
  return {
    state: {
      ...withRejectedReason(state, 'SEGMENT_PENDING_RESET', pending, config),
      pendingPoint: null,
      lastUsablePoint: null,
      previousCommitAnchor: null,
      requiresNewSegment: true,
    },
    removedTimestamp: pending.timestamp,
  };
}

/**
 * v3の1点処理。最初の正式点Aに対してBを保留し、Cの受信時にBだけを確定する。
 * 強い平滑化や道路スナップはせず、単発異常点だけを複数条件で除外する。
 */
export function processGpsPoint(
  state: GpsProcessingState,
  input: GpsInputPoint,
  options: ProcessGpsPointOptions = {},
): ProcessGpsPointResult {
  const config = options.config ?? DEFAULT_GPS_PROCESSING_CONFIG;
  let next: GpsProcessingState = {
    ...state,
    processingVersion: GPS_PROCESSING_VERSION,
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
    const reset = requestGpsProcessingSegmentBreak(next, config);
    next = withRejectedReason(reset.state, 'NON_MONOTONIC_TIMESTAMP');
    return result(next, 'NON_MONOTONIC_TIMESTAMP', {
      removedDisplayPointTimestamp: reset.removedTimestamp,
    });
  }

  next.lastObservedPoint = point;
  if (point.accuracy <= config.highConfidenceAccuracyM) {
    next.highConfidencePointCount += 1;
  } else if (point.accuracy <= config.conditionalAccuracyM) {
    next.conditionalPointCount += 1;
  }

  if (options.paused) {
    const reset = requestGpsProcessingSegmentBreak(next, config);
    next = withRejectedReason({ ...reset.state, rawAnchor: null }, 'PAUSED', point, config);
    return result(next, 'PAUSED', {
      removedDisplayPointTimestamp: reset.removedTimestamp,
    });
  }

  const observedGapMs = previousObserved ? point.timestamp - previousObserved.timestamp : 0;
  const explicitSegmentBreak = options.forceNewSegment === true
    || input.seg === true
    || state.requiresNewSegment;
  let rawSegmentDistanceM = 0;
  if (
    state.rawAnchor
    && !explicitSegmentBreak
    && observedGapMs < config.gpsGapSegmentMs
  ) {
    rawSegmentDistanceM = haversineDistanceM(state.rawAnchor, point);
    next.rawDistanceM += rawSegmentDistanceM;
  }
  next.rawAnchor = point;

  if (point.accuracy > config.maxAccuracyM || point.accuracy > config.conditionalAccuracyM) {
    return result(withRejectedReason(next, 'POOR_ACCURACY', point, config), 'POOR_ACCURACY', {
      rawSegmentDistanceM,
    });
  }

  const usableGapMs = state.lastUsablePoint ? point.timestamp - state.lastUsablePoint.timestamp : 0;
  const gpsGap = options.inferGpsGaps !== false
    && state.lastUsablePoint !== null
    && usableGapMs >= config.gpsGapSegmentMs;
  if (gpsGap) next.maxGapMs = Math.max(state.maxGapMs, usableGapMs);

  if (!state.commitAnchor || explicitSegmentBreak || gpsGap) {
    const reset = requestGpsProcessingSegmentBreak(next, config);
    next = reset.state;
    const startsNewSegment = state.commitAnchor !== null && (explicitSegmentBreak || gpsGap);
    const segmentId = startsNewSegment ? state.segmentId + 1 : state.segmentId;
    const acceptedPoint: ProcessedGpsPoint = startsNewSegment ? { ...point, seg: true } : point;
    next = {
      ...next,
      commitAnchor: point,
      pendingPoint: null,
      lastUsablePoint: point,
      previousCommitAnchor: null,
      requiresNewSegment: false,
      segmentId,
      segmentBreakCount: state.segmentBreakCount + (startsNewSegment ? 1 : 0),
    };
    const decision = gpsGap ? 'GPS_GAP' : startsNewSegment ? 'SEGMENT_BREAK' : 'ACCEPTED';
    next = withAcceptedReason(next, acceptedPoint, decision, config);
    return result(next, decision, {
      acceptedPoint,
      displayPoint: acceptedPoint,
      resolvedPoint: state.pendingPoint,
      removedDisplayPointTimestamp: reset.removedTimestamp,
      startedNewSegment: startsNewSegment,
      rawSegmentDistanceM,
      segmentId,
    });
  }

  if (!state.pendingPoint) {
    next.pendingPoint = point;
    next.lastUsablePoint = point;
    return result(next, 'PENDING', {
      displayPoint: point,
      rawSegmentDistanceM,
    });
  }

  const a = state.commitAnchor;
  const b = state.pendingPoint;
  const metrics = threePointMetrics(state, a, b, point, config);
  const bIsConditional = b.accuracy > config.highConfidenceAccuracyM;
  const accuracyAnomaly = b.accuracy >= Math.max(a.accuracy, point.accuracy)
    + config.spikeAccuracyDifferenceM;
  const acPlausible = Number.isFinite(metrics.speedACMps)
    && metrics.speedACMps <= config.maxRunningSpeedMps;
  const cReturnedToPlausiblePath = acPlausible
    && metrics.dAC <= Math.max(metrics.dAB, metrics.dBC) + config.minCommitDistanceM;
  const speedAnomaly = acPlausible && (
    metrics.speedABMps > config.maxRunningSpeedMps
    || metrics.speedBCMps > config.maxRunningSpeedMps
    || metrics.abruptSpeedChange
  );
  const isThreePointSpike = metrics.windowMs <= config.spikeMaxWindowMs
    && metrics.crossTrackM >= config.spikeMinCrossTrackM
    && metrics.detourM >= config.spikeMinDetourM
    && cReturnedToPlausiblePath
    && (accuracyAnomaly || speedAnomaly || metrics.trajectoryContradiction)
    && !metrics.legitimateTurn;

  let reason: GpsPointDecisionReason = 'ACCEPTED';
  if (metrics.dAB < config.minCommitDistanceM) {
    reason = 'MICRO_JITTER';
  } else if (isThreePointSpike) {
    reason = 'THREE_POINT_SPIKE';
  } else if (bIsConditional && (
    metrics.speedABMps > config.maxRunningSpeedMps
    || (metrics.speedBCMps > config.maxRunningSpeedMps && acPlausible)
    || (
      Math.max(metrics.speedABMps, metrics.speedBCMps) > GPS_DIRECTION_CHECK_MIN_SPEED_MPS
      && !metrics.legitimateTurn
      && (metrics.trajectoryContradiction || (metrics.abruptSpeedChange && cReturnedToPlausiblePath))
    )
  )) {
    reason = 'CONDITIONAL_ACCURACY_REJECTED';
  } else if (!Number.isFinite(metrics.speedABMps) || metrics.speedABMps > config.maxRunningSpeedMps) {
    reason = 'IMPOSSIBLE_SPEED';
  }

  next.pendingPoint = point;
  next.lastUsablePoint = point;
  if (reason !== 'ACCEPTED') {
    next = withRejectedReason(next, reason, b, config);
    const removeFromDisplay = reason === 'THREE_POINT_SPIKE'
      || reason === 'CONDITIONAL_ACCURACY_REJECTED'
      || reason === 'IMPOSSIBLE_SPEED';
    return result(next, reason, {
      resolvedPoint: b,
      removedDisplayPointTimestamp: removeFromDisplay ? b.timestamp : null,
      displayPoint: point,
      calculatedSegmentDistanceM: metrics.dAB,
      calculatedSpeedMps: metrics.speedABMps,
      rawSegmentDistanceM,
    });
  }

  next = {
    ...next,
    previousCommitAnchor: a,
    commitAnchor: b,
    filteredDistanceM: state.filteredDistanceM + metrics.dAB,
  };
  next = withAcceptedReason(next, b, 'ACCEPTED', config);
  return result(next, 'ACCEPTED', {
    acceptedPoint: b,
    resolvedPoint: b,
    displayPoint: point,
    addedDistanceM: metrics.dAB,
    calculatedSegmentDistanceM: metrics.dAB,
    calculatedSpeedMps: metrics.speedABMps,
    rawSegmentDistanceM,
  });
}

/** 活動終了時の最後の保留点を、後続点なしで保守的に確定または破棄する。 */
export function finalizeGpsProcessing(
  state: GpsProcessingState,
  config: Readonly<GpsProcessingConfig> = DEFAULT_GPS_PROCESSING_CONFIG,
): ProcessGpsPointResult {
  const pending = state.pendingPoint;
  const anchor = state.commitAnchor;
  if (!pending || !anchor) return result(state, 'ACCEPTED');

  const distanceM = haversineDistanceM(anchor, pending);
  const calculatedSpeedMps = speedMps(distanceM, anchor.timestamp, pending.timestamp);
  const accuracyWorsened = pending.accuracy > config.highConfidenceAccuracyM
    && pending.accuracy >= anchor.accuracy + config.spikeAccuracyDifferenceM;
  const incomingAlignment = state.previousCommitAnchor
    ? angleDegrees(
        localVector(state.previousCommitAnchor, anchor),
        localVector(anchor, pending),
      )
    : null;
  const incomingCrossTrackM = state.previousCommitAnchor
    ? crossTrackFromIncomingLineM(state.previousCommitAnchor, anchor, pending)
    : 0;
  const lowSpeedLateralDrift = calculatedSpeedMps <= GPS_FINALIZE_LOW_SPEED_MPS
    && incomingAlignment !== null
    && incomingAlignment >= GPS_FINALIZE_LATERAL_TURN_MIN_DEG
    && incomingCrossTrackM >= config.spikeMinCrossTrackM;
  const shouldDiscard = distanceM < config.minCommitDistanceM
    || !Number.isFinite(calculatedSpeedMps)
    || calculatedSpeedMps > config.maxRunningSpeedMps
    || accuracyWorsened
    || lowSpeedLateralDrift;

  if (shouldDiscard) {
    const next = {
      ...withRejectedReason(state, 'END_OF_ACTIVITY_JITTER', pending, config),
      pendingPoint: null,
    };
    return result(next, 'END_OF_ACTIVITY_JITTER', {
      resolvedPoint: pending,
      removedDisplayPointTimestamp: pending.timestamp,
      calculatedSegmentDistanceM: distanceM,
      calculatedSpeedMps,
    });
  }

  let next: GpsProcessingState = {
    ...state,
    previousCommitAnchor: anchor,
    commitAnchor: pending,
    pendingPoint: null,
    filteredDistanceM: state.filteredDistanceM + distanceM,
  };
  next = withAcceptedReason(next, pending, 'ACCEPTED', config);
  return result(next, 'ACCEPTED', {
    acceptedPoint: pending,
    resolvedPoint: pending,
    addedDistanceM: distanceM,
    calculatedSegmentDistanceM: distanceM,
    calculatedSpeedMps,
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
    processingVersion: state.processingVersion,
    receivedPointCount: state.receivedPointCount,
    acceptedPointCount: state.acceptedPointCount,
    rejectedPointCount: state.rejectedPointCount,
    rejectedByAccuracyCount: state.rejectedByAccuracyCount,
    rejectedBySpeedCount: state.rejectedBySpeedCount,
    rejectedByTimestampCount: state.rejectedByTimestampCount,
    microJitterCount: state.microJitterCount,
    highConfidencePointCount: state.highConfidencePointCount,
    conditionalPointCount: state.conditionalPointCount,
    conditionalAcceptedPointCount: state.conditionalAcceptedPointCount,
    conditionalRejectedPointCount: state.conditionalRejectedPointCount,
    threePointSpikeCount: state.threePointSpikeCount,
    endOfActivityDiscardedPointCount: state.endOfActivityDiscardedPointCount,
    segmentPendingResetCount: state.segmentPendingResetCount,
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
    accepted: outcome.acceptedPoints.length > 0,
    rejectionReason: outcome.rejectionReason,
    resolvedTimestamp: outcome.resolvedPoint?.timestamp ?? null,
    pendingTimestamp: outcome.nextState.pendingPoint?.timestamp ?? null,
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

function replayReasonCounts(
  state: GpsProcessingState,
): Partial<Record<GpsPointDecisionReason, number>> {
  const counts = { ...state.decisionCounts };
  delete counts.ACCEPTED;
  return counts;
}

function replayDirectGpsLog(
  points: GpsInputPoint[],
  config: Readonly<GpsProcessingConfig>,
  processingVersion: 2 | 3,
  inferGpsGaps: boolean,
): GpsReplayResult {
  let state = createInitialGpsProcessingState();
  state.processingVersion = processingVersion;
  let pendingSegmentBreak = false;
  const route: ProcessedGpsPoint[] = [];
  const outcomes: ProcessGpsPointResult[] = [];
  const samples: GpsDebugSample[] = [];

  for (const point of points) {
    if (point.seg === true) pendingSegmentBreak = true;
    const outcome = processGpsPointDirect(state, point, {
      config,
      forceNewSegment: pendingSegmentBreak,
      inferGpsGaps,
    });
    state = outcome.nextState;
    if (outcome.acceptedPoints.length > 0) {
      route.push(...outcome.acceptedPoints);
      pendingSegmentBreak = false;
    }
    outcomes.push(outcome);
    samples.push(gpsDebugSample(point, outcome));
  }

  const summary = gpsQualitySummary(state);
  return {
    processingVersion,
    rawDistanceM: state.rawDistanceM,
    filteredDistanceM: state.filteredDistanceM,
    differenceM: state.rawDistanceM - state.filteredDistanceM,
    v2FilteredDistanceM: null,
    differenceFromV2M: null,
    acceptedPointCount: state.acceptedPointCount,
    rejectedPointCount: state.rejectedPointCount,
    rejectionCounts: replayReasonCounts(state),
    segmentCount: route.length > 0 ? state.segmentId + 1 : 0,
    accuracyMedianM: summary.accuracyMedianM,
    accuracyP95M: summary.accuracyP95M,
    kilometerSplitDistancesM: kilometerSplits(outcomes),
    processedRoute: route,
    samples,
    summary,
  };
}

/** アプリ本体と同じv3純粋関数を使い、保存ログをAPI起動なしで再生する。 */
export function replayGpsLog(
  points: GpsInputPoint[],
  config: Readonly<GpsProcessingConfig> = DEFAULT_GPS_PROCESSING_CONFIG,
  options: ReplayGpsLogOptions = {},
): GpsReplayResult {
  if (options.segmentsAlreadyMarked === true) {
    return replayDirectGpsLog(points, config, 3, false);
  }

  let state = createInitialGpsProcessingState();
  let pendingSegmentBreak = false;
  const route: ProcessedGpsPoint[] = [];
  const outcomes: ProcessGpsPointResult[] = [];
  const samples: GpsDebugSample[] = [];

  for (const point of points) {
    if (point.seg === true) pendingSegmentBreak = true;
    const outcome = processGpsPoint(state, point, {
      config,
      forceNewSegment: pendingSegmentBreak,
      inferGpsGaps: true,
    });
    state = outcome.nextState;
    if (outcome.acceptedPoints.length > 0) {
      route.push(...outcome.acceptedPoints);
      pendingSegmentBreak = false;
    }
    outcomes.push(outcome);
    samples.push(gpsDebugSample(point, outcome));
  }

  const finalized = finalizeGpsProcessing(state, config);
  state = finalized.nextState;
  if (finalized.acceptedPoints.length > 0) route.push(...finalized.acceptedPoints);
  if (finalized.resolvedPoint) outcomes.push(finalized);

  // v2比較は同じ生ログを固定した旧設定へ通す。旧実装の別ファイル複製は持たない。
  const v2 = replayDirectGpsLog(points, LEGACY_V2_GPS_PROCESSING_CONFIG, 2, true);
  const summary = gpsQualitySummary(state);
  return {
    processingVersion: GPS_PROCESSING_VERSION,
    rawDistanceM: state.rawDistanceM,
    filteredDistanceM: state.filteredDistanceM,
    differenceM: state.rawDistanceM - state.filteredDistanceM,
    v2FilteredDistanceM: v2.filteredDistanceM,
    differenceFromV2M: state.filteredDistanceM - v2.filteredDistanceM,
    acceptedPointCount: state.acceptedPointCount,
    rejectedPointCount: state.rejectedPointCount,
    rejectionCounts: replayReasonCounts(state),
    segmentCount: route.length > 0 ? state.segmentId + 1 : 0,
    accuracyMedianM: summary.accuracyMedianM,
    accuracyP95M: summary.accuracyP95M,
    kilometerSplitDistancesM: kilometerSplits(outcomes),
    processedRoute: route,
    samples,
    summary,
  };
}

/** v2生ログ比較をテスト・リプレイから利用する入口。 */
export function replayGpsLogV2(points: GpsInputPoint[]): GpsReplayResult {
  return replayDirectGpsLog(points, LEGACY_V2_GPS_PROCESSING_CONFIG, 2, true);
}

/** クライアント採用済みv3点をFunctionsで正式再生する入口。 */
export function replayAcceptedGpsRoute(
  points: GpsInputPoint[],
  config: Readonly<GpsProcessingConfig> = DEFAULT_GPS_PROCESSING_CONFIG,
): GpsReplayResult {
  // サーバーへ届くのはすでにA-B-C判定を通ったcommit点だけで、生の保留点や除外点はない。
  // そのためサーバーでは3点スパイクを再推定せず、座標・accuracy・速度・segだけを再検証する。
  return replayDirectGpsLog(points, config, 3, false);
}

/** 更新前のv2クライアントが送るcommit点を35m基準のまま受理する。 */
export function replayAcceptedGpsRouteV2(points: GpsInputPoint[]): GpsReplayResult {
  return replayDirectGpsLog(points, LEGACY_V2_GPS_PROCESSING_CONFIG, 2, false);
}
