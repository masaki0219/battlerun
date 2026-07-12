import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { MAX_ACTIVITY_DISTANCE_KM } from './constants';

const MAX_SPEED_KMH = 25;

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
        const currentTotal = (categoryStatsDoc.data()['totalDistanceKm'] as number | undefined) ?? 0;
        const newTotal = currentTotal + distanceKm;
        const afterStats = beforeStats.map((item) => item.id === categoryId
          ? { ...item, total: newTotal, average: newTotal / participantCount }
          : item);
        const rankingType = (battle['rankingType'] as string | undefined) ?? 'total';
        const rankBefore = rankFor(beforeStats, categoryId, rankingType);
        const rankAfter = rankFor(afterStats, categoryId, rankingType);

        tx.update(participantRef, {
          totalDistanceKm: FieldValue.increment(distanceKm),
          activityCount: FieldValue.increment(1),
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
          },
        });
      });
    }

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
        tx.update(userSnap.ref, {
          totalDistanceKm: FieldValue.increment(distanceKm),
          activityCount: FieldValue.increment(1),
        });
      }
      tx.update(activityRef, {
        userStatsAggregated: true,
        aggregated: true,
        aggregatedAt: FieldValue.serverTimestamp(),
      });
    });
  },
);
