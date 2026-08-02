import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { aggregateMonthlyActivities, parseMonthlyStatsImpact } from './monthlyStats';

const BACKFILL_VERSION = 1;

/** 既存活動を一度だけ全件集計し、以後の増減集計の基準値を作る。 */
export const backfillMonthlyStats = onCall({ timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (tx) => {
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
      monthlyStatsBackfilledAt: Timestamp.now(),
      personalRecords: records,
    });
    return { backfilled: true, activityCount: activities.length };
  });
});
