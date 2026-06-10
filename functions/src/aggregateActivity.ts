import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { MAX_ACTIVITY_DISTANCE_KM } from './constants';

/**
 * activities/{activityId} の作成をトリガーに、参加中バトルの
 * participants.totalDistanceKm / category_stats.totalDistanceKm を集計する。
 *
 * 冪等性: 処理完了後に activity へ aggregated:true を書き込み、
 * リトライ時は最新状態を再取得して aggregated:true なら即終了する。
 */
export const aggregateActivity = onDocumentCreated(
  'activities/{activityId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const db = getFirestore();
    const activityRef = snapshot.ref;

    // リトライ時の二重加算防止: 最新状態を読み直してチェックする
    const freshSnap = await activityRef.get();
    const data = freshSnap.data();
    if (!data || data['aggregated'] === true) {
      logger.info('aggregateActivity: already aggregated, skipping', {
        id: event.params['activityId'],
      });
      return;
    }

    const userId = data['userId'] as string;
    const distanceKm = data['distanceKm'] as number;
    const battleIds = (data['battleIds'] as string[] | undefined) ?? [];
    const startedAt = data['startedAt'] as Timestamp;

    // 距離の妥当性チェック: 0以下 or MAX_ACTIVITY_DISTANCE_KM超は不正として加算しない
    if (distanceKm <= 0 || distanceKm > MAX_ACTIVITY_DISTANCE_KM) {
      logger.warn('aggregateActivity: invalid distanceKm, flagging without aggregation', {
        id: event.params['activityId'],
        distanceKm,
      });
      await activityRef.update({
        aggregated: true,
        aggregatedAt: FieldValue.serverTimestamp(),
        flagged: true,
      });
      return;
    }

    for (const battleId of battleIds) {
      await db.runTransaction(async (tx) => {
        const battleRef = db.doc(`battles/${battleId}`);
        const participantRef = db.doc(`battles/${battleId}/participants/${userId}`);

        const [battleSnap, participantSnap] = await Promise.all([
          tx.get(battleRef),
          tx.get(participantRef),
        ]);

        if (!battleSnap.exists) {
          logger.warn('aggregateActivity: battle not found, skipping', { battleId });
          return;
        }
        const battle = battleSnap.data()!;
        if (battle['status'] !== 'active') {
          logger.warn('aggregateActivity: battle is not active, skipping', {
            battleId,
            status: battle['status'],
          });
          return;
        }
        const battleStartAt = battle['startAt'] as Timestamp;
        const battleEndAt = battle['endAt'] as Timestamp;
        if (
          startedAt.toMillis() < battleStartAt.toMillis() ||
          startedAt.toMillis() > battleEndAt.toMillis()
        ) {
          logger.warn('aggregateActivity: activity outside battle period, skipping', { battleId });
          return;
        }

        if (!participantSnap.exists) {
          logger.warn('aggregateActivity: participant not found, skipping', { battleId, userId });
          return;
        }

        // category_stats を更新する場合に必要な読み取りも、書き込みより前に行う
        const categoryId = participantSnap.data()?.['categoryId'] as string | null | undefined;
        let categoryStatsRef: FirebaseFirestore.DocumentReference | null = null;
        let categoryStatsSnap: FirebaseFirestore.DocumentSnapshot | null = null;
        if (categoryId) {
          categoryStatsRef = db.doc(`battles/${battleId}/category_stats/${categoryId}`);
          categoryStatsSnap = await tx.get(categoryStatsRef);
        }

        tx.update(participantRef, {
          totalDistanceKm: FieldValue.increment(distanceKm),
          activityCount: FieldValue.increment(1),
        });

        if (categoryStatsRef && categoryStatsSnap?.exists) {
          const stats = categoryStatsSnap.data()!;
          const currentTotal = (stats['totalDistanceKm'] as number) ?? 0;
          const participantCount = (stats['participantCount'] as number) ?? 0;
          const newTotal = currentTotal + distanceKm;
          tx.update(categoryStatsRef, {
            totalDistanceKm: FieldValue.increment(distanceKm),
            avgDistanceKm: newTotal / Math.max(participantCount, 1),
          });
        }
      });
    }

    await activityRef.update({
      aggregated: true,
      aggregatedAt: FieldValue.serverTimestamp(),
    });
  },
);
