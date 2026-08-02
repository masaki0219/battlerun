import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

interface ActivityStats {
  totalDistanceKm: number;
  activityCount: number;
  monthlyDistanceKm: number;
  consecutiveDays: number;
  earlyMorningCount: number;
  stepsModeCount: number;
}

const BADGES: Array<{ id: string; name: string; earned: (stats: ActivityStats) => boolean }> = [
  { id: 'first_run', name: 'はじめの一歩', earned: (s) => s.activityCount >= 1 },
  { id: 'early_bird', name: '朝活ランナー', earned: (s) => s.earlyMorningCount >= 1 },
  { id: 'streak_3', name: '3日連続ラン', earned: (s) => s.consecutiveDays >= 3 },
  { id: 'streak_7', name: '7日連続ラン', earned: (s) => s.consecutiveDays >= 7 },
  { id: 'monthly_10km', name: '月間10km', earned: (s) => s.monthlyDistanceKm >= 10 },
  { id: 'monthly_30km', name: '月間30km', earned: (s) => s.monthlyDistanceKm >= 30 },
  { id: 'step_master', name: 'ウォークマスター', earned: (s) => s.stepsModeCount >= 10 },
  { id: 'total_100km', name: '百里の旅人', earned: (s) => s.totalDistanceKm >= 100 },
];

function jstDayKey(ms: number): string {
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function jstHour(ms: number): number {
  return new Date(ms + JST_OFFSET_MS).getUTCHours();
}

async function awardBadgesForUser(userId: string): Promise<{ earnedBadgeIds: string[]; stats: ActivityStats }> {
  const db = getFirestore();
  const activities = await db.collection('activities').where('userId', '==', userId).get();
  const now = Date.now();
  const currentMonth = jstDayKey(now).slice(0, 7);
  let totalDistanceKm = 0;
  let monthlyDistanceKm = 0;
  let earlyMorningCount = 0;
  let stepsModeCount = 0;
  const dayKeys = new Set<string>();

  for (const doc of activities.docs) {
    const data = doc.data();
    if (data['flagged'] === true || data['aggregated'] !== true) continue;
    const distanceKm = (data['distanceKm'] as number | undefined) ?? 0;
    const startedAt = data['startedAt'] as Timestamp | undefined;
    if (!startedAt) continue;
    const ms = startedAt.toMillis();
    const dayKey = jstDayKey(ms);
    totalDistanceKm += distanceKm;
    if (dayKey.startsWith(currentMonth)) monthlyDistanceKm += distanceKm;
    if (jstHour(ms) < 7) earlyMorningCount += 1;
    if (data['measurementType'] === 'steps') stepsModeCount += 1;
    dayKeys.add(dayKey);
  }

  let consecutiveDays = 0;
  const cursor = new Date(`${jstDayKey(now)}T00:00:00.000Z`);
  if (!dayKeys.has(jstDayKey(now))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (dayKeys.has(cursor.toISOString().slice(0, 10))) {
    consecutiveDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const stats: ActivityStats = {
    totalDistanceKm,
    activityCount: activities.docs.filter((doc) => doc.data()['aggregated'] === true && doc.data()['flagged'] !== true).length,
    monthlyDistanceKm,
    consecutiveDays,
    earlyMorningCount,
    stepsModeCount,
  };
  const earned = BADGES.filter((badge) => badge.earned(stats));
  const existing = await db.collection(`users/${userId}/badges`).get();
  const existingIds = new Set(existing.docs.map((doc) => doc.id));
  const newlyEarned = earned.filter((item) => !existingIds.has(item.id));
  const batch = db.batch();
  for (const badge of newlyEarned) {
    batch.set(db.doc(`users/${userId}/badges/${badge.id}`), {
      badgeId: badge.id,
      name: badge.name,
      earnedAt: FieldValue.serverTimestamp(),
    });
  }
  if (newlyEarned.length > 0) await batch.commit();
  await db.doc(`users/${userId}`).update({
    totalDistanceKm: stats.totalDistanceKm,
    activityCount: stats.activityCount,
  });
  return { earnedBadgeIds: earned.map((badge) => badge.id), stats };
}

export const awardBadgesOnActivityAggregated = onDocumentUpdated(
  'activities/{activityId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || before?.['aggregated'] === true || after['aggregated'] !== true || after['flagged'] === true) return;
    const userId = after['userId'];
    if (typeof userId === 'string') await awardBadgesForUser(userId);
  },
);

export const syncMyBadges = onCall({}, async (request) => {
  const userId = request.auth?.uid;
  if (!userId) throw new HttpsError('unauthenticated', 'ログインが必要です。');
  const db = getFirestore();
  const userRef = db.doc(`users/${userId}`);
  const now = Date.now();
  const claimed = await db.runTransaction(async (tx) => {
    const user = await tx.get(userRef);
    if (!user.exists) throw new HttpsError('failed-precondition', 'ユーザー情報がありません。');
    const last = (user.data()?.['lastStatsSyncAtMs'] as number | undefined) ?? 0;
    if (now - last < 60_000) return false;
    tx.update(userRef, { lastStatsSyncAtMs: now });
    return true;
  });
  if (!claimed) {
    const [user, badges] = await Promise.all([
      userRef.get(),
      db.collection(`users/${userId}/badges`).get(),
    ]);
    return {
      earnedBadgeIds: badges.docs.map((doc) => doc.id),
      stats: {
        totalDistanceKm: (user.data()?.['totalDistanceKm'] as number | undefined) ?? 0,
        activityCount: (user.data()?.['activityCount'] as number | undefined) ?? 0,
      },
    };
  }
  return await awardBadgesForUser(userId);
});
