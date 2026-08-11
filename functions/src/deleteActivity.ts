import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { parseMonthlyStatsImpact, tokyoMonthKey, type MonthlyStatsImpact } from './monthlyStats';

const BATCH_SIZE = 500;

interface AggregationImpact {
  battleId: string;
  categoryId: string;
  creditedDistanceKm?: number;
  stepDayKey?: string;
}

function monthlyImpactFromActivity(data: Record<string, unknown>): MonthlyStatsImpact | null {
  const saved = parseMonthlyStatsImpact(data['monthlyStatsImpact']);
  if (saved) return saved;
  const startedAt = data['startedAt'];
  const km = data['distanceKm'];
  const durationSec = data['durationSeconds'];
  if (
    !(startedAt instanceof Timestamp)
    || typeof km !== 'number' || !Number.isFinite(km) || km < 0
    || typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec < 0
  ) return null;
  return {
    monthKey: tokyoMonthKey(startedAt.toMillis()),
    km,
    count: 1,
    durationSec,
    elevationM: 0,
  };
}

/**
 * 本人のアクティビティを削除し、開催中バトルへの加算を取り消す。
 *
 * - 集計の減算は aggregationImpacts に増分記録が残っているバトルだけが対象。
 *   終了済み（status !== 'active'）のバトルは結果が確定しているため戻さない。
 * - 再試行に備えて reversedBattleIds で減算をバトル単位に冪等化する
 *   （aggregateActivity の aggregatedBattleIds と同じ方式）。
 * - GPSルートチャンクとリアクションも削除し、ユーザー累計（totalDistanceKm /
 *   activityCount）も減算する。
 */
export const deleteActivity = onCall(
  {},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');

    const activityId = (request.data ?? {})['activityId'];
    if (typeof activityId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(activityId)) {
      throw new HttpsError('invalid-argument', '記録IDが不正です。');
    }

    const db = getFirestore();
    const activityRef = db.doc(`activities/${activityId}`);
    const activitySnap = await activityRef.get();
    if (!activitySnap.exists) throw new HttpsError('not-found', '記録が見つかりません。');
    const activity = activitySnap.data()!;
    if (activity['userId'] !== uid) {
      throw new HttpsError('permission-denied', '自分の記録のみ削除できます。');
    }
    // aggregateActivity と競合すると削除後に加算だけが残るため、集計完了を待つ
    if (activity['aggregated'] !== true) {
      throw new HttpsError('failed-precondition', '集計処理中です。しばらくしてからもう一度お試しください。');
    }

    const distanceKm = (activity['distanceKm'] as number | undefined) ?? 0;
    const impacts = Object.values(
      (activity['aggregationImpacts'] as Record<string, AggregationImpact> | undefined) ?? {},
    );

    for (const impact of impacts) {
      const battleId = impact.battleId;
      const categoryId = impact.categoryId;
      if (typeof battleId !== 'string' || typeof categoryId !== 'string') continue;
      const creditedDistanceKm = typeof impact.creditedDistanceKm === 'number'
        && Number.isFinite(impact.creditedDistanceKm)
        ? Math.max(0, impact.creditedDistanceKm)
        : distanceKm;

      await db.runTransaction(async (tx) => {
        const battleRef = db.doc(`battles/${battleId}`);
        const participantRef = db.doc(`battles/${battleId}/participants/${uid}`);
        const statsRef = battleRef.collection('category_stats').doc(categoryId);
        const [freshActivitySnap, battleSnap, participantSnap, statsSnap] = await Promise.all([
          tx.get(activityRef),
          tx.get(battleRef),
          tx.get(participantRef),
          tx.get(statsRef),
        ]);
        if (!freshActivitySnap.exists) return;
        const reversed = (freshActivitySnap.data()!['reversedBattleIds'] as string[] | undefined) ?? [];
        if (reversed.includes(battleId)) return;

        // 開催中のバトルだけ減算する。終了済みは結果確定のため触らない
        if (battleSnap.exists && battleSnap.data()!['status'] === 'active') {
          if (statsSnap.exists) {
            const currentTotal = (statsSnap.data()!['totalDistanceKm'] as number | undefined) ?? 0;
            const participantCount = Math.max(
              (statsSnap.data()!['participantCount'] as number | undefined) ?? 0,
              1,
            );
            const newTotal = Math.max(0, currentTotal - creditedDistanceKm);
            tx.update(statsRef, {
              totalDistanceKm: newTotal,
              avgDistanceKm: newTotal / participantCount,
            });
          }
          if (participantSnap.exists) {
            const participant = participantSnap.data()!;
            const stepCredits = (participant['stepCreditKmByDay'] as Record<string, number> | undefined) ?? {};
            tx.update(participantRef, {
              totalDistanceKm: Math.max(
                0,
                ((participant['totalDistanceKm'] as number | undefined) ?? 0) - creditedDistanceKm,
              ),
              activityCount: Math.max(0, ((participant['activityCount'] as number | undefined) ?? 0) - 1),
              ...(impact.stepDayKey ? {
                [`stepCreditKmByDay.${impact.stepDayKey}`]: Math.max(
                  0,
                  (stepCredits[impact.stepDayKey] ?? 0) - creditedDistanceKm,
                ),
              } : {}),
            });
          }
        }
        tx.update(activityRef, { reversedBattleIds: FieldValue.arrayUnion(battleId) });
      });
    }

    // GPSルートチャンクとリアクションを先に削除する。
    // 途中で失敗しても activities 本体が残っているため、リトライで完遂できる
    const [chunksSnap, reactionsSnap] = await Promise.all([
      db.collection(`users/${uid}/activityRoutes/${activityId}/chunks`).get(),
      activityRef.collection('reactions').get(),
    ]);
    const refs = [...chunksSnap.docs.map((d) => d.ref), ...reactionsSnap.docs.map((d) => d.ref)];
    for (let i = 0; i < refs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    const initialMonthlyImpact = monthlyImpactFromActivity(activity);
    const monthlyStatsRef = initialMonthlyImpact
      ? db.doc(`users/${uid}/monthlyStats/${initialMonthlyImpact.monthKey}`)
      : null;

    // ユーザー累計・月間集計の減算と本体削除
    await db.runTransaction(async (tx) => {
      const [freshActivitySnap, userSnap, monthlyStatsSnap] = await Promise.all([
        tx.get(activityRef),
        tx.get(db.doc(`users/${uid}`)),
        monthlyStatsRef ? tx.get(monthlyStatsRef) : Promise.resolve(null),
      ]);
      if (!freshActivitySnap.exists) return;
      const fresh = freshActivitySnap.data()!;
      const freshMonthlyImpact = monthlyImpactFromActivity(fresh);
      if (fresh['userStatsAggregated'] === true && userSnap.exists) {
        const user = userSnap.data()!;
        tx.update(userSnap.ref, {
          totalDistanceKm: Math.max(0, ((user['totalDistanceKm'] as number | undefined) ?? 0) - distanceKm),
          activityCount: Math.max(0, ((user['activityCount'] as number | undefined) ?? 0) - 1),
        });
      }
      if (
        (fresh['userStatsAggregated'] === true
          || ((userSnap.data()?.['monthlyStatsBackfillVersion'] as number | undefined) ?? 0) >= 1)
        && monthlyStatsRef && monthlyStatsSnap?.exists
        && freshMonthlyImpact != null
        && freshMonthlyImpact?.monthKey === initialMonthlyImpact?.monthKey
      ) {
        const current = monthlyStatsSnap.data()!;
        tx.update(monthlyStatsRef, {
          km: Math.max(0, ((current['km'] as number | undefined) ?? 0) - freshMonthlyImpact.km),
          count: Math.max(0, ((current['count'] as number | undefined) ?? 0) - freshMonthlyImpact.count),
          durationSec: Math.max(
            0,
            ((current['durationSec'] as number | undefined) ?? 0) - freshMonthlyImpact.durationSec,
          ),
          elevationM: Math.max(
            0,
            ((current['elevationM'] as number | undefined) ?? 0) - freshMonthlyImpact.elevationM,
          ),
        });
      }
      tx.delete(activityRef);
    });

    logger.info('deleteActivity: done', { uid, activityId, reversedBattles: impacts.length });
    return { ok: true };
  },
);
