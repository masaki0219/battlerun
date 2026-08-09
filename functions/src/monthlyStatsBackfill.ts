import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { aggregateMonthlyActivities, parseMonthlyStatsImpact } from './monthlyStats';

const BACKFILL_VERSION = 2;

/** 既存活動を全件集計し、以後の増減集計の基準値を作る共通本体。 */
export async function backfillMonthlyStatsForUser(uid: string): Promise<{
  backfilled: boolean;
  activityCount: number;
}> {
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  // この時刻以前の活動だけを対象にし、同時に作成された新規活動との境界を明確にする。
  const cutoff = Timestamp.now();

  return await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError('not-found', 'ユーザー情報が見つかりません。');
    if (((userSnap.data()?.['monthlyStatsBackfillVersion'] as number | undefined) ?? 0) >= BACKFILL_VERSION) {
      return { backfilled: false, activityCount: 0 };
    }

    const [activitiesSnap, currentStatsSnap] = await Promise.all([
      tx.get(db.collection('activities').where('userId', '==', uid)),
      tx.get(db.collection(`users/${uid}/monthlyStats`)),
    ]);
    const activities = activitiesSnap.docs.flatMap((activityDoc) => {
      const data = activityDoc.data();
      const submittedAt = data['submittedAt'];
      if (submittedAt instanceof Timestamp && submittedAt.toMillis() > cutoff.toMillis()) return [];
      const startedAt = data['startedAt'];
      const distanceKm = data['distanceKm'];
      const durationSec = data['durationSeconds'];
      if (
        !(startedAt instanceof Timestamp)
        || typeof distanceKm !== 'number'
        || typeof durationSec !== 'number'
      ) return [];
      const impact = parseMonthlyStatsImpact(data['monthlyStatsImpact']);
      return [{
        startedAtMs: startedAt.toMillis(),
        distanceKm,
        durationSec,
        elevationM: impact?.elevationM ?? 0,
        flagged: data['flagged'] === true,
      }];
    });
    const totals = aggregateMonthlyActivities(activities);
    const lifetimeActivities = activitiesSnap.docs.flatMap((activityDoc) => {
      const data = activityDoc.data();
      const distanceKm = data['distanceKm'];
      if (
        data['aggregated'] !== true
        || data['flagged'] === true
        || typeof distanceKm !== 'number'
        || !Number.isFinite(distanceKm)
        || distanceKm < 0
      ) return [];
      return [distanceKm];
    });
    const currentIds = new Set(currentStatsSnap.docs.map((doc) => doc.id));
    totals.forEach((total, monthKey) => {
      tx.set(db.doc(`users/${uid}/monthlyStats/${monthKey}`), {
        km: total.km,
        count: total.count,
        durationSec: total.durationSec,
        elevationM: total.elevationM,
      });
      currentIds.delete(monthKey);
    });
    currentIds.forEach((monthKey) => tx.delete(db.doc(`users/${uid}/monthlyStats/${monthKey}`)));

    const currentRecords = userSnap.data()?.['personalRecords'];
    const records = currentRecords && typeof currentRecords === 'object'
      ? { ...currentRecords as Record<string, unknown> }
      : {};
    const bestMonthKm = Math.max(0, ...[...totals.values()].map((month) => month.km));
    records['bestMonthKm'] = Math.max(
      typeof records['bestMonthKm'] === 'number' ? records['bestMonthKm'] : 0,
      bestMonthKm,
    );
    tx.update(userRef, {
      monthlyStatsBackfillVersion: BACKFILL_VERSION,
      monthlyStatsBackfilledAt: cutoff,
      totalDistanceKm: lifetimeActivities.reduce((sum, distanceKm) => sum + distanceKm, 0),
      activityCount: lifetimeActivities.length,
      personalRecords: records,
    });
    return { backfilled: true, activityCount: activities.length };
  });
}

/** 認証ユーザー自身の月次・累計を現行バージョンへ一度だけ再構築する。 */
export const backfillMonthlyStats = onCall({ timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');
  return await backfillMonthlyStatsForUser(uid);
});
