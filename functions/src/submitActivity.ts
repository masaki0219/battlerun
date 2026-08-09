import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { MAX_ACTIVITY_DISTANCE_KM } from './constants';
import {
  battleCreditEligibility,
  type BattleCreditIneligibilityReason,
} from './battleCredit';
import {
  GPS_PROCESSING_VERSION,
  MAX_RUNNING_SPEED_MPS,
  replayAcceptedGpsRoute,
  replayAcceptedGpsRouteV2,
  type GpsInputPoint,
  type GpsQualitySummary,
  type ProcessedGpsPoint,
} from './gpsProcessing';

const MAX_SPEED_KMH = MAX_RUNNING_SPEED_MPS * 3.6;
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const MAX_OFFLINE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ROUTE_POINTS = 50_000;
const ROUTE_CHUNK_SIZE = 500;
const STEP_LENGTH_KM = 0.00075;
const LEGACY_GPS_EXTREME_ACCURACY_M = 80;
const LEGACY_MAX_SPEED_KMH = 25;

interface LegacyRoutePoint {
  lat: number;
  lng: number;
  timestamp: number;
  /** 水平精度（m）。クライアントが取得できた場合のみ */
  accuracy?: number;
  /** 高度（m）。クライアントが取得できた場合のみ */
  alt?: number;
  /** 高度の精度（m）。クライアントが取得できた場合のみ */
  altitudeAccuracy?: number;
  /** 一時停止から再開した直後の点。前の点との間は距離に加算しない */
  seg?: true;
}

interface SubmitActivityData {
  localId?: unknown;
  measurementType?: unknown;
  steps?: unknown;
  startedAtMs?: unknown;
  endedAtMs?: unknown;
  pausedMs?: unknown;
  route?: unknown;
  gpsProcessingVersion?: unknown;
  gpsQuality?: unknown;
}

function haversine(a: LegacyRoutePoint, b: LegacyRoutePoint): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return radiusKm * 2 * Math.asin(Math.sqrt(sin2));
}

/** 新方式導入前に端末キューへ入った活動だけに使う互換処理。 */
function parseLegacyRoute(value: unknown, startedAtMs: number, endedAtMs: number): LegacyRoutePoint[] {
  if (!Array.isArray(value) || value.length > MAX_ROUTE_POINTS) {
    throw new HttpsError('invalid-argument', 'GPSルートの件数が不正です。');
  }

  const route: LegacyRoutePoint[] = [];
  // seg付きの点が検証で落ちた場合、次に採用する点へセグメント境界を引き継ぐ
  let pendingSegmentBreak = false;
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const point = raw as Record<string, unknown>;
    const lat = point['lat'];
    const lng = point['lng'];
    const timestamp = point['timestamp'];
    const accuracy = point['accuracy'];
    const isSegmentStart = point['seg'] === true;
    if (isSegmentStart) pendingSegmentBreak = true;
    if (
      typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180 ||
      typeof timestamp !== 'number' || !Number.isFinite(timestamp) ||
      timestamp < startedAtMs - 60_000 || timestamp > endedAtMs + 60_000 ||
      (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > LEGACY_GPS_EXTREME_ACCURACY_M)
    ) {
      continue;
    }

    const next: LegacyRoutePoint = { lat, lng, timestamp };
    if (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0) {
      next.accuracy = accuracy;
    }
    const alt = point['alt'];
    if (typeof alt === 'number' && Number.isFinite(alt)) next.alt = alt;
    const altitudeAccuracy = point['altitudeAccuracy'];
    if (typeof altitudeAccuracy === 'number' && Number.isFinite(altitudeAccuracy) && altitudeAccuracy >= 0) {
      next.altitudeAccuracy = altitudeAccuracy;
    }
    const prev = route[route.length - 1];
    if (prev && !pendingSegmentBreak) {
      const seconds = (next.timestamp - prev.timestamp) / 1000;
      if (seconds <= 0) continue;
      const speedKmh = (haversine(prev, next) / seconds) * 3600;
      if (speedKmh > LEGACY_MAX_SPEED_KMH) continue;
    }
    // セグメント境界を跨ぐペアは距離に数えないため、速度検査を免除しても距離の水増しにはならない
    if (prev && pendingSegmentBreak) next.seg = true;
    pendingSegmentBreak = false;
    route.push(next);
  }
  return route;
}

function legacyRouteDistance(route: LegacyRoutePoint[]): number {
  return route.reduce((sum, point, index) => (
    index === 0 || point.seg ? sum : sum + haversine(route[index - 1], point)
  ), 0);
}

function gpsInputPoints(value: unknown, startedAtMs: number, endedAtMs: number): GpsInputPoint[] {
  if (!Array.isArray(value) || value.length > MAX_ROUTE_POINTS) {
    throw new HttpsError('invalid-argument', 'GPSルートの件数が不正です。');
  }
  return value.flatMap((raw): GpsInputPoint[] => {
    if (!raw || typeof raw !== 'object') return [];
    const point = raw as Record<string, unknown>;
    const timestamp = point['timestamp'];
    // OS時刻の微差だけを許容し、活動から大きく外れた点は正式距離へ入れない。
    if (
      typeof timestamp !== 'number'
      || !Number.isFinite(timestamp)
      || timestamp < startedAtMs - 60_000
      || timestamp > endedAtMs + 60_000
    ) return [];
    return [{
      lat: point['lat'],
      lng: point['lng'],
      timestamp,
      accuracy: point['accuracy'],
      alt: point['alt'],
      altitudeAccuracy: point['altitudeAccuracy'],
      seg: point['seg'],
    }];
  });
}

function finiteNonNegative(value: unknown, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return integer ? Math.floor(value) : value;
}

function nullableAccuracy(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** 品質集計は診断専用。座標を含めず、数値だけを正規化して保存する。 */
function parseGpsQuality(value: unknown, processingVersion: number): GpsQualitySummary | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  return {
    processingVersion,
    receivedPointCount: finiteNonNegative(data['receivedPointCount'], true),
    acceptedPointCount: finiteNonNegative(data['acceptedPointCount'], true),
    rejectedPointCount: finiteNonNegative(data['rejectedPointCount'], true),
    rejectedByAccuracyCount: finiteNonNegative(data['rejectedByAccuracyCount'], true),
    rejectedBySpeedCount: finiteNonNegative(data['rejectedBySpeedCount'], true),
    rejectedByTimestampCount: finiteNonNegative(data['rejectedByTimestampCount'], true),
    microJitterCount: finiteNonNegative(data['microJitterCount'], true),
    highConfidencePointCount: finiteNonNegative(data['highConfidencePointCount'], true),
    conditionalPointCount: finiteNonNegative(data['conditionalPointCount'], true),
    conditionalAcceptedPointCount: finiteNonNegative(data['conditionalAcceptedPointCount'], true),
    conditionalRejectedPointCount: finiteNonNegative(data['conditionalRejectedPointCount'], true),
    threePointSpikeCount: finiteNonNegative(data['threePointSpikeCount'], true),
    endOfActivityDiscardedPointCount: finiteNonNegative(data['endOfActivityDiscardedPointCount'], true),
    segmentPendingResetCount: finiteNonNegative(data['segmentPendingResetCount'], true),
    segmentBreakCount: finiteNonNegative(data['segmentBreakCount'], true),
    maxGapMs: finiteNonNegative(data['maxGapMs'], true),
    accuracyMedianM: nullableAccuracy(data['accuracyMedianM']),
    accuracyP95M: nullableAccuracy(data['accuracyP95M']),
    rawDistanceM: finiteNonNegative(data['rawDistanceM']),
    filteredDistanceM: finiteNonNegative(data['filteredDistanceM']),
    warmupDurationMs: finiteNonNegative(data['warmupDurationMs'], true),
    warmupReadyAccuracyM: nullableAccuracy(data['warmupReadyAccuracyM']),
    foregroundFallbackCount: finiteNonNegative(data['foregroundFallbackCount'], true),
    backgroundPointCount: finiteNonNegative(data['backgroundPointCount'], true),
    foregroundPointCount: finiteNonNegative(data['foregroundPointCount'], true),
  };
}

/**
 * 認証済みクライアントから記録を受け取り、公開メタデータと本人専用GPSルートを分離して保存する。
 * userId・表示名・反映先バトルはクライアント値を信用せずサーバーで確定する。
 */
export const submitActivity = onCall(
  {},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');

    const data = (request.data ?? {}) as SubmitActivityData;
    const localId = data.localId;
    if (
      typeof localId !== 'string' ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(localId)
    ) {
      throw new HttpsError('invalid-argument', '記録IDの形式が不正です。');
    }

    const db = getFirestore();
    const activityRef = db.collection('activities').doc(localId);
    const existingActivity = await activityRef.get();
    if (existingActivity.exists) {
      const existing = existingActivity.data()!;
      if (existing['userId'] !== uid) {
        throw new HttpsError('permission-denied', 'この記録IDは使用できません。');
      }
      return {
        activityId: activityRef.id,
        distanceKm: existing['distanceKm'],
        durationSeconds: existing['durationSeconds'],
        steps: existing['steps'] ?? 0,
        battleIds: existing['battleIds'] ?? [],
        battleCreditStatus: existing['battleCreditStatus'] ?? 'unknown',
        battleCreditReason: existing['battleCreditReason'] ?? null,
      };
    }

    const measurementType = data.measurementType;
    const startedAtMs = data.startedAtMs;
    const endedAtMs = data.endedAtMs;
    if (
      (measurementType !== 'gps' && measurementType !== 'steps') ||
      typeof startedAtMs !== 'number' || !Number.isFinite(startedAtMs) ||
      typeof endedAtMs !== 'number' || !Number.isFinite(endedAtMs)
    ) {
      throw new HttpsError('invalid-argument', '記録データの形式が不正です。');
    }

    const now = Date.now();
    // pausedMs は一時停止の合計。実走時間(durationSeconds)から除外する。
    // 過大に申告しても平均速度検査が厳しくなるだけで距離の水増しには使えない。
    const pausedMs = typeof data.pausedMs === 'number' && Number.isFinite(data.pausedMs)
      ? Math.max(0, Math.floor(data.pausedMs))
      : 0;
    const wallSeconds = Math.floor((endedAtMs - startedAtMs) / 1000);
    const durationSeconds = Math.floor((endedAtMs - startedAtMs - pausedMs) / 1000);
    if (
      durationSeconds <= 0 || wallSeconds > MAX_DURATION_SECONDS ||
      endedAtMs > now + 60_000 || endedAtMs < now - MAX_OFFLINE_AGE_MS
    ) {
      throw new HttpsError('invalid-argument', '記録時刻が不正です。');
    }

    const steps = typeof data.steps === 'number' && Number.isFinite(data.steps)
      ? Math.max(0, Math.floor(data.steps))
      : 0;
    const usesV3GpsProcessing = measurementType === 'gps'
      && data.gpsProcessingVersion === GPS_PROCESSING_VERSION;
    const usesV2GpsProcessing = measurementType === 'gps'
      && data.gpsProcessingVersion === 2;
    let route: Array<LegacyRoutePoint | ProcessedGpsPoint> = [];
    let distanceKm = measurementType === 'steps' ? steps * STEP_LENGTH_KM : 0;
    let gpsQuality: GpsQualitySummary | null = null;
    if (measurementType === 'gps' && usesV3GpsProcessing) {
      const replay = replayAcceptedGpsRoute(gpsInputPoints(data.route, startedAtMs, endedAtMs));
      route = replay.processedRoute;
      distanceKm = replay.filteredDistanceM / 1_000;
      const clientQuality = parseGpsQuality(data.gpsQuality, GPS_PROCESSING_VERSION);
      gpsQuality = clientQuality
        ? { ...clientQuality, processingVersion: GPS_PROCESSING_VERSION, filteredDistanceM: replay.filteredDistanceM }
        : replay.summary;
    } else if (measurementType === 'gps' && usesV2GpsProcessing) {
      // 配布済みv2は35m基準で確定済み点だけを送る。v3の25m/3点判定へ通し直さず、
      // 当時の共通処理で検証することで、新旧クライアント混在中の距離変化を避ける。
      const replay = replayAcceptedGpsRouteV2(gpsInputPoints(data.route, startedAtMs, endedAtMs));
      route = replay.processedRoute;
      distanceKm = replay.filteredDistanceM / 1_000;
      const clientQuality = parseGpsQuality(data.gpsQuality, 2);
      gpsQuality = clientQuality
        ? { ...clientQuality, processingVersion: 2, filteredDistanceM: replay.filteredDistanceM }
        : replay.summary;
    } else if (measurementType === 'gps') {
      // v2導入前に端末キューへ保存済みの活動を失わないためだけの旧方式。新規活動はv3を送る。
      const legacyRoute = parseLegacyRoute(data.route, startedAtMs, endedAtMs);
      route = legacyRoute;
      distanceKm = legacyRouteDistance(legacyRoute);
    }
    const averageSpeedKmh = distanceKm / (durationSeconds / 3600);

    if (
      distanceKm <= 0 || distanceKm > MAX_ACTIVITY_DISTANCE_KM ||
      averageSpeedKmh > MAX_SPEED_KMH ||
      (measurementType === 'gps' && route.length < 2) ||
      (measurementType === 'steps' && steps <= 0)
    ) {
      throw new HttpsError('invalid-argument', '距離または速度が不正です。');
    }

    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError('failed-precondition', 'ユーザー情報がありません。');
    const user = userSnap.data()!;
    // 旧データでは終了済みIDが配列の先頭に残る場合がある。先に活動中かを判定し、
    // その後で最大2件へ絞ることで、有効な参加枠を取りこぼさない。
    const candidateBattleIds = [...new Set(
      ((user['battleIds'] as unknown[] | undefined) ?? [])
        .filter((id): id is string => typeof id === 'string'),
    )].slice(0, 50);

    // 記録終了からの固定10分ではなく、開催期間と結果確定時刻で判定する。
    // これにより開催中の通信断は救済しつつ、確定済み結果の後付け変更は防ぐ。
    const battleCandidates = await Promise.all(candidateBattleIds.map(async (battleId) => {
        const [battleSnap, participantSnap] = await Promise.all([
          db.doc(`battles/${battleId}`).get(),
          db.doc(`battles/${battleId}/participants/${uid}`).get(),
        ]);
        if (!battleSnap.exists || !participantSnap.exists) return null;
        const battle = battleSnap.data()!;
        const startAt = battle['startAt'] as Timestamp | undefined;
        const endAt = battle['endAt'] as Timestamp | undefined;
        if (!startAt || !endAt) {
          return { battleId, eligible: false as const, reason: 'inactive-battle' as const };
        }
        return {
          battleId,
          ...battleCreditEligibility({
            battleStatus: battle['status'],
            battleStartAtMs: startAt.toMillis(),
            battleEndAtMs: endAt.toMillis(),
            activityStartedAtMs: startedAtMs,
            activityEndedAtMs: endedAtMs,
            submittedAtMs: now,
          }),
        };
      }));
    const activeBattleIds = battleCandidates
      .filter((candidate): candidate is { battleId: string; eligible: true } => candidate?.eligible === true)
      .map((candidate) => candidate.battleId)
      .slice(0, 2);
    const ineligibilityReasons = battleCandidates.flatMap((candidate): BattleCreditIneligibilityReason[] => (
      candidate && !candidate.eligible ? [candidate.reason] : []
    ));
    const battleCreditStatus = activeBattleIds.length > 0
      ? 'eligible'
      : candidateBattleIds.length === 0 ? 'not-participating' : 'not-eligible';
    const battleCreditReason = ineligibilityReasons.includes('battle-finalized')
      ? 'battle-finalized'
      : ineligibilityReasons.includes('outside-period')
        ? 'outside-period'
        : ineligibilityReasons[0] ?? null;

    const saveBatch = db.batch();
    saveBatch.create(activityRef, {
      userId: uid,
      displayName: (user['name'] as string | undefined) ?? 'メンバー',
      visibility: 'public_v2',
      battleId: activeBattleIds[0] ?? null,
      battleIds: activeBattleIds,
      battleCreditStatus,
      battleCreditReason,
      distanceKm,
      steps: measurementType === 'steps' ? steps : null,
      durationSeconds,
      pausedMs,
      measurementType,
      gpsProcessingVersion: measurementType === 'gps'
        ? (usesV3GpsProcessing ? GPS_PROCESSING_VERSION : usesV2GpsProcessing ? 2 : 1)
        : null,
      gpsQuality: measurementType === 'gps' ? gpsQuality : null,
      startedAt: Timestamp.fromMillis(startedAtMs),
      endedAt: Timestamp.fromMillis(endedAtMs),
      submittedAt: Timestamp.now(),
      aggregated: false,
      aggregatedBattleIds: [],
    });

    if (route.length > 0) {
      for (let index = 0; index < route.length; index += ROUTE_CHUNK_SIZE) {
        const chunkIndex = index / ROUTE_CHUNK_SIZE;
        const chunkRef = db.doc(
          `users/${uid}/activityRoutes/${activityRef.id}/chunks/${String(chunkIndex).padStart(5, '0')}`,
        );
        saveBatch.set(chunkRef, { index: chunkIndex, points: route.slice(index, index + ROUTE_CHUNK_SIZE) });
      }
    }
    try {
      await saveBatch.commit();
    } catch (error) {
      // 同じlocalIdの並行送信では一方のcreateだけが成功する。勝者の結果を返し、
      // 通信切断後の再送を含めてクライアントからは同じ成功として見せる。
      const committedActivity = await activityRef.get();
      if (!committedActivity.exists || committedActivity.data()?.['userId'] !== uid) throw error;
      const committed = committedActivity.data()!;
      return {
        activityId: activityRef.id,
        distanceKm: committed['distanceKm'],
        durationSeconds: committed['durationSeconds'],
        steps: committed['steps'] ?? 0,
        battleIds: committed['battleIds'] ?? [],
        battleCreditStatus: committed['battleCreditStatus'] ?? 'unknown',
        battleCreditReason: committed['battleCreditReason'] ?? null,
      };
    }

    return {
      activityId: activityRef.id,
      distanceKm,
      durationSeconds,
      steps,
      battleIds: activeBattleIds,
      battleCreditStatus,
      battleCreditReason,
    };
  },
);
