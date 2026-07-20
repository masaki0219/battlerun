import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { MAX_ACTIVITY_DISTANCE_KM } from './constants';
import {
  elevationGainMeters,
  fastestSegmentSeconds,
  mergePersonalRecords,
  type PersonalRecords,
  type TimedRoutePoint,
} from './personalRecords';
import { tokyoMonthKey, type MonthlyStatsImpact } from './monthlyStats';
import { creditedBattleDistanceKm, tokyoDayKey } from './battleCredit';

const MAX_SPEED_KMH = 25;
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

function tokyoMonthBounds(timestamp: Timestamp): { from: Timestamp; to: Timestamp } {
  const local = new Date(timestamp.toMillis() + TOKYO_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    from: Timestamp.fromMillis(Date.UTC(year, month, 1) - TOKYO_OFFSET_MS),
    to: Timestamp.fromMillis(Date.UTC(year, month + 1, 1) - TOKYO_OFFSET_MS),
  };
}

async function activityRoute(
  db: FirebaseFirestore.Firestore,
  userId: string,
  activityId: string,
): Promise<TimedRoutePoint[]> {
  const chunks = await db
    .collection(`users/${userId}/activityRoutes/${activityId}/chunks`)
    .orderBy('index', 'asc')
    .get();
  return chunks.docs.flatMap((chunk) => {
    const points = chunk.data()['points'];
    if (!Array.isArray(points)) return [];
    return points.flatMap((raw): TimedRoutePoint[] => {
      if (!raw || typeof raw !== 'object') return [];
      const point = raw as Record<string, unknown>;
      const lat = point['lat'];
      const lng = point['lng'];
      const timestamp = point['timestamp'];
      if (
        typeof lat !== 'number' || !Number.isFinite(lat)
        || typeof lng !== 'number' || !Number.isFinite(lng)
        || typeof timestamp !== 'number' || !Number.isFinite(timestamp)
      ) return [];
      const parsed: TimedRoutePoint = { lat, lng, timestamp };
      if (typeof point['accuracy'] === 'number' && Number.isFinite(point['accuracy'])) parsed.accuracy = point['accuracy'];
      if (typeof point['alt'] === 'number' && Number.isFinite(point['alt'])) parsed.alt = point['alt'];
      if (typeof point['altitudeAccuracy'] === 'number' && Number.isFinite(point['altitudeAccuracy'])) {
        parsed.altitudeAccuracy = point['altitudeAccuracy'];
      }
      if (point['seg'] === true) parsed.seg = true;
      return [parsed];
    });
  });
}

async function monthDistanceKm(
  db: FirebaseFirestore.Firestore,
  userId: string,
  startedAt: Timestamp,
): Promise<number> {
  const bounds = tokyoMonthBounds(startedAt);
  const snapshot = await db.collection('activities')
    .where('userId', '==', userId)
    .where('startedAt', '>=', bounds.from)
    .where('startedAt', '<', bounds.to)
    .select('distanceKm', 'flagged')
    .get();
  return snapshot.docs.reduce((sum, doc) => {
    const data = doc.data();
    const distance = data['distanceKm'];
    return data['flagged'] === true || typeof distance !== 'number' || !Number.isFinite(distance)
      ? sum
      : sum + Math.max(0, distance);
  }, 0);
}

function rankFor(
  stats: Array<{ id: string; total: number; average: number }>,
  categoryId: string,
  rankingType: string,
): number {
  const value = (item: { total: number; average: number }) =>
    rankingType === 'average' ? item.average : item.total;
  const sorted = [...stats].sort((a, b) => value(b) - value(a) || a.id.localeCompare(b.id));
  const target = sorted.find((item) => item.id === categoryId);
  if (!target) return 0;
  return 1 + sorted.filter((item) => value(item) > value(target)).length;
}

/**
 * submitActivity が作成した activities/{activityId} をバトル集計へ反映する。
 * aggregatedBattleIds を各バトルトランザクション内で更新し、途中失敗からの再試行でも二重加算しない。
 */
export const aggregateActivity = onDocumentCreated(
  'activities/{activityId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const db = getFirestore();
    const activityRef = snapshot.ref;
    const initial = snapshot.data();
    const userId = initial['userId'];
    const distanceKm = initial['distanceKm'];
    const durationSeconds = initial['durationSeconds'];
    const battleIds = initial['battleIds'];
    const startedAt = initial['startedAt'];
    const measurementType = initial['measurementType'];

    const invalid =
      typeof userId !== 'string' ||
      typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) ||
      typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
      !Array.isArray(battleIds) || battleIds.some((id) => typeof id !== 'string') ||
      !(startedAt instanceof Timestamp) ||
      distanceKm <= 0 || distanceKm > MAX_ACTIVITY_DISTANCE_KM ||
      distanceKm / (durationSeconds / 3600) > MAX_SPEED_KMH;

    if (invalid) {
      logger.warn('aggregateActivity: invalid activity', { id: event.params['activityId'] });
      await activityRef.update({
        aggregated: true,
        aggregatedAt: FieldValue.serverTimestamp(),
        flagged: true,
        flagReason: 'invalid_activity',
      });
      return;
    }

    for (const battleId of [...new Set(battleIds as string[])]) {
      await db.runTransaction(async (tx) => {
        const battleRef = db.doc(`battles/${battleId}`);
        const participantRef = db.doc(`battles/${battleId}/participants/${userId}`);
        const statsQuery = battleRef.collection('category_stats');

        const [activitySnap, battleSnap, participantSnap, statsSnap] = await Promise.all([
          tx.get(activityRef),
          tx.get(battleRef),
          tx.get(participantRef),
          tx.get(statsQuery),
        ]);
        const activity = activitySnap.data();
        const completed = (activity?.['aggregatedBattleIds'] as string[] | undefined) ?? [];
        if (completed.includes(battleId)) return;

        if (!battleSnap.exists || !participantSnap.exists) {
          tx.update(activityRef, { aggregatedBattleIds: FieldValue.arrayUnion(battleId) });
          return;
        }
        const battle = battleSnap.data()!;
        const battleStartAt = battle['startAt'] as Timestamp | undefined;
        const battleEndAt = battle['endAt'] as Timestamp | undefined;
        if (
          !['active', 'finished'].includes(battle['status'] as string) || !battleStartAt || !battleEndAt ||
          startedAt.toMillis() < battleStartAt.toMillis() ||
          startedAt.toMillis() > battleEndAt.toMillis()
        ) {
          tx.update(activityRef, { aggregatedBattleIds: FieldValue.arrayUnion(battleId) });
          return;
        }

        const participant = participantSnap.data()!;
        const categoryId = participant['categoryId'] as string | null | undefined;
        if (!categoryId) {
          tx.update(activityRef, { aggregatedBattleIds: FieldValue.arrayUnion(battleId) });
          return;
        }
        const categoryStatsDoc = statsSnap.docs.find((doc) => doc.id === categoryId);
        if (!categoryStatsDoc) {
          tx.update(activityRef, { aggregatedBattleIds: FieldValue.arrayUnion(battleId) });
          return;
        }

        const beforeStats = statsSnap.docs.map((doc) => ({
          id: doc.id,
          total: (doc.data()['totalDistanceKm'] as number | undefined) ?? 0,
          average: (doc.data()['avgDistanceKm'] as number | undefined) ?? 0,
        }));
        const participantCount = Math.max(
          (categoryStatsDoc.data()['participantCount'] as number | undefined) ?? 0,
          1,
        );
        const stepDayKey = measurementType === 'steps' ? tokyoDayKey(startedAt.toMillis()) : null;
        const stepCredits = (participant['stepCreditKmByDay'] as Record<string, number> | undefined) ?? {};
        const alreadyCreditedKm = stepDayKey && typeof stepCredits[stepDayKey] === 'number'
          ? stepCredits[stepDayKey]
          : 0;
        const creditedDistanceKm = creditedBattleDistanceKm(
          measurementType,
          distanceKm,
          alreadyCreditedKm,
        );
        const currentTotal = (categoryStatsDoc.data()['totalDistanceKm'] as number | undefined) ?? 0;
        const newTotal = currentTotal + creditedDistanceKm;
        const afterStats = beforeStats.map((item) => item.id === categoryId
          ? { ...item, total: newTotal, average: newTotal / participantCount }
          : item);
        const rankingType = (battle['rankingType'] as string | undefined) ?? 'total';
        const rankBefore = rankFor(beforeStats, categoryId, rankingType);
        const rankAfter = rankFor(afterStats, categoryId, rankingType);

        tx.update(participantRef, {
          totalDistanceKm: FieldValue.increment(creditedDistanceKm),
          activityCount: FieldValue.increment(1),
          ...(stepDayKey ? {
            [`stepCreditKmByDay.${stepDayKey}`]: FieldValue.increment(creditedDistanceKm),
          } : {}),
        });
        tx.update(categoryStatsDoc.ref, {
          totalDistanceKm: newTotal,
          avgDistanceKm: newTotal / participantCount,
        });
        tx.update(activityRef, {
          aggregatedBattleIds: FieldValue.arrayUnion(battleId),
          [`aggregationImpacts.${battleId}`]: {
            battleId,
            battleTitle: (battle['title'] as string | undefined) ?? 'チャレンジ',
            categoryId,
            rankBefore,
            rankAfter,
            totalKm: newTotal,
            creditedDistanceKm,
            ...(stepDayKey ? { stepDayKey } : {}),
          },
        });
      });
    }

    const [route, currentMonthKm] = await Promise.all([
      measurementType === 'gps'
        ? activityRoute(db, userId as string, event.params['activityId'])
        : Promise.resolve([]),
      monthDistanceKm(db, userId as string, startedAt as Timestamp),
    ]);
    const elevationGain = elevationGainMeters(route);
    const monthlyStatsImpact: MonthlyStatsImpact = {
      monthKey: tokyoMonthKey((startedAt as Timestamp).toMillis()),
      km: distanceKm as number,
      count: 1,
      durationSec: durationSeconds as number,
      elevationM: elevationGain ?? 0,
    };
    const recordCandidates: PersonalRecords = {
      longestRunKm: distanceKm as number,
      bestMonthKm: currentMonthKm,
    };
    const fastest1kSec = fastestSegmentSeconds(route, 1);
    const fastest5kSec = fastestSegmentSeconds(route, 5);
    const fastest10kSec = fastestSegmentSeconds(route, 10);
    if (fastest1kSec != null) recordCandidates.fastest1kSec = fastest1kSec;
    if (fastest5kSec != null) recordCandidates.fastest5kSec = fastest5kSec;
    if (fastest10kSec != null) recordCandidates.fastest10kSec = fastest10kSec;
    if (elevationGain != null) recordCandidates.maxElevationGainM = elevationGain;

    await db.runTransaction(async (tx) => {
      const [activitySnap, userSnap] = await Promise.all([
        tx.get(activityRef),
        tx.get(db.doc(`users/${userId}`)),
      ]);
      const activity = activitySnap.data();
      if (!activity || activity['userStatsAggregated'] === true) {
        if (activity && activity['aggregated'] !== true) {
          tx.update(activityRef, { aggregated: true, aggregatedAt: FieldValue.serverTimestamp() });
        }
        return;
      }
      if (userSnap.exists) {
        const mergedRecords = mergePersonalRecords(
          userSnap.data()?.['personalRecords'] as Record<string, unknown> | undefined,
          recordCandidates,
        );
        tx.update(userSnap.ref, {
          totalDistanceKm: FieldValue.increment(distanceKm),
          activityCount: FieldValue.increment(1),
          personalRecords: mergedRecords.records,
        });
        tx.set(
          db.doc(`users/${userId}/monthlyStats/${monthlyStatsImpact.monthKey}`),
          {
            km: FieldValue.increment(monthlyStatsImpact.km),
            count: FieldValue.increment(monthlyStatsImpact.count),
            durationSec: FieldValue.increment(monthlyStatsImpact.durationSec),
            elevationM: FieldValue.increment(monthlyStatsImpact.elevationM),
          },
          { merge: true },
        );
        tx.update(activityRef, {
          newRecords: mergedRecords.newRecords,
          monthlyStatsImpact,
        });
      } else {
        tx.update(activityRef, { newRecords: [] });
      }
      tx.update(activityRef, {
        userStatsAggregated: true,
        aggregated: true,
        aggregatedAt: FieldValue.serverTimestamp(),
      });
    });
  },
);
