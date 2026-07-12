import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { MAX_ACTIVITY_DISTANCE_KM } from './constants';

const MAX_SPEED_KMH = 25;
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const MAX_OFFLINE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ROUTE_POINTS = 50_000;
const ROUTE_CHUNK_SIZE = 500;
const STEP_LENGTH_KM = 0.00075;

interface RoutePoint {
  lat: number;
  lng: number;
  timestamp: number;
}

interface SubmitActivityData {
  measurementType?: unknown;
  steps?: unknown;
  startedAtMs?: unknown;
  endedAtMs?: unknown;
  route?: unknown;
}

function haversine(a: RoutePoint, b: RoutePoint): number {
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

function parseRoute(value: unknown, startedAtMs: number, endedAtMs: number): RoutePoint[] {
  if (!Array.isArray(value) || value.length > MAX_ROUTE_POINTS) {
    throw new HttpsError('invalid-argument', 'GPSルートの件数が不正です。');
  }

  const route: RoutePoint[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const point = raw as Record<string, unknown>;
    const lat = point['lat'];
    const lng = point['lng'];
    const timestamp = point['timestamp'];
    if (
      typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180 ||
      typeof timestamp !== 'number' || !Number.isFinite(timestamp) ||
      timestamp < startedAtMs - 60_000 || timestamp > endedAtMs + 60_000
    ) {
      continue;
    }

    const next = { lat, lng, timestamp };
    const prev = route[route.length - 1];
    if (prev) {
      const seconds = (next.timestamp - prev.timestamp) / 1000;
      if (seconds <= 0) continue;
      const speedKmh = (haversine(prev, next) / seconds) * 3600;
      if (speedKmh > MAX_SPEED_KMH) continue;
    }
    route.push(next);
  }
  return route;
}

function routeDistance(route: RoutePoint[]): number {
  return route.reduce((sum, point, index) => (
    index === 0 ? sum : sum + haversine(route[index - 1], point)
  ), 0);
}

/**
 * App Check 済みのクライアントから記録を受け取り、公開メタデータと本人専用GPSルートを分離して保存する。
 * userId・表示名・反映先バトルはクライアント値を信用せずサーバーで確定する。
 */
export const submitActivity = onCall(
  {},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');

    const data = (request.data ?? {}) as SubmitActivityData;
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
    const durationSeconds = Math.floor((endedAtMs - startedAtMs) / 1000);
    if (
      durationSeconds <= 0 || durationSeconds > MAX_DURATION_SECONDS ||
      endedAtMs > now + 60_000 || endedAtMs < now - MAX_OFFLINE_AGE_MS
    ) {
      throw new HttpsError('invalid-argument', '記録時刻が不正です。');
    }

    const steps = typeof data.steps === 'number' && Number.isFinite(data.steps)
      ? Math.max(0, Math.floor(data.steps))
      : 0;
    const route = measurementType === 'gps'
      ? parseRoute(data.route, startedAtMs, endedAtMs)
      : [];
    const distanceKm = measurementType === 'gps'
      ? routeDistance(route)
      : steps * STEP_LENGTH_KM;
    const averageSpeedKmh = distanceKm / (durationSeconds / 3600);

    if (
      distanceKm <= 0 || distanceKm > MAX_ACTIVITY_DISTANCE_KM ||
      averageSpeedKmh > MAX_SPEED_KMH ||
      (measurementType === 'gps' && route.length < 2) ||
      (measurementType === 'steps' && steps <= 0)
    ) {
      throw new HttpsError('invalid-argument', '距離または速度が不正です。');
    }

    const db = getFirestore();
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError('failed-precondition', 'ユーザー情報がありません。');
    const user = userSnap.data()!;
    const candidateBattleIds = ((user['battleIds'] as string[] | undefined) ?? []).slice(0, 50);

    // 10分を超える遅延送信は個人履歴としては受理するが、過去バトルへの後付け加算はしない。
    const eligibleForBattleCredit = endedAtMs >= now - 10 * 60_000;
    const activeBattleIds = eligibleForBattleCredit ? (
      await Promise.all(candidateBattleIds.map(async (battleId) => {
        const [battleSnap, participantSnap] = await Promise.all([
          db.doc(`battles/${battleId}`).get(),
          db.doc(`battles/${battleId}/participants/${uid}`).get(),
        ]);
        if (!battleSnap.exists || !participantSnap.exists) return null;
        const battle = battleSnap.data()!;
        const startAt = battle['startAt'] as Timestamp | undefined;
        const endAt = battle['endAt'] as Timestamp | undefined;
        if (
          !['active', 'finished'].includes(battle['status'] as string) || !startAt || !endAt ||
          startedAtMs < startAt.toMillis() || startedAtMs > endAt.toMillis() ||
          endedAtMs > endAt.toMillis() + 10 * 60_000
        ) return null;
        return battleId;
      }))
    ).filter((id): id is string => id !== null) : [];

    const activityRef = db.collection('activities').doc();
    const saveBatch = db.batch();
    saveBatch.create(activityRef, {
      userId: uid,
      displayName: (user['name'] as string | undefined) ?? 'メンバー',
      visibility: 'public_v2',
      battleId: activeBattleIds[0] ?? null,
      battleIds: activeBattleIds,
      distanceKm,
      steps: measurementType === 'steps' ? steps : null,
      durationSeconds,
      measurementType,
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
    await saveBatch.commit();

    return {
      activityId: activityRef.id,
      distanceKm,
      durationSeconds,
      steps,
      battleIds: activeBattleIds,
    };
  },
);
