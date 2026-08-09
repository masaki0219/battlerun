import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runActivityAggregationWithDiagnostics } from '../functions/src/aggregateActivity';
import { backfillMonthlyStatsForUser } from '../functions/src/monthlyStatsBackfill';

// Functions本体と同じfirebase-adminインスタンスを使い、FieldValue等のprototype混在を避ける。
const functionsRequire = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp } = functionsRequire('firebase-admin/app') as typeof import('firebase-admin/app');
const adminFirestore = functionsRequire('firebase-admin/firestore') as typeof import('firebase-admin/firestore');
const { FieldPath, getFirestore, Timestamp } = adminFirestore;

initializeApp({ projectId: 'zelio-run' });

async function main() {
  const db = getFirestore();
  const uid = 'aggregation-test-user';
  const activityId = 'aggregation-test-activity';
  const startedAt = Timestamp.fromDate(new Date('2026-08-01T00:00:00.000Z'));
  const submittedAt = Timestamp.fromDate(new Date('2026-08-01T00:30:00.000Z'));
  const backfilledAt = Timestamp.fromDate(new Date('2026-08-01T01:00:00.000Z'));

  await Promise.all([
    db.doc(`users/${uid}`).set({
      name: '集計テスト',
      totalDistanceKm: 0,
      activityCount: 0,
      monthlyStatsBackfillVersion: 1,
      monthlyStatsBackfilledAt: backfilledAt,
    }),
    db.doc(`users/${uid}/monthlyStats/2026-08`).set({
      km: 3,
      count: 1,
      durationSec: 1_800,
      elevationM: 0,
    }),
    db.doc(`activities/${activityId}`).set({
      userId: uid,
      distanceKm: 3,
      durationSeconds: 1_800,
      battleIds: [],
      aggregatedBattleIds: [],
      measurementType: 'steps',
      startedAt,
      submittedAt,
      aggregated: false,
    }),
  ]);

  const activityQuery = await db.collection('activities')
    .where(FieldPath.documentId(), '==', activityId)
    .get();
  const activity = activityQuery.docs[0];
  assert.ok(activity);

  await runActivityAggregationWithDiagnostics(activity, 'admin');
  await runActivityAggregationWithDiagnostics(activity, 'admin');

  const [userAfter, activityAfter, monthAfter] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`activities/${activityId}`).get(),
    db.doc(`users/${uid}/monthlyStats/2026-08`).get(),
  ]);
  assert.equal(userAfter.data()?.['totalDistanceKm'], 3, '再試行しても累計距離を二重加算しない');
  assert.equal(userAfter.data()?.['activityCount'], 1, '再試行しても回数を二重加算しない');
  assert.equal(userAfter.data()?.['personalRecords']?.['longestRunKm'], 3);
  assert.equal(activityAfter.data()?.['aggregated'], true);
  assert.equal(activityAfter.data()?.['userStatsAggregated'], true);
  assert.equal(activityAfter.data()?.['aggregationAttemptCount'], 2);
  assert.equal(monthAfter.data()?.['km'], 3, 'v1バックフィル済み活動を月次へ二重加算しない');
  assert.equal(monthAfter.data()?.['count'], 1);

  const backfill = await backfillMonthlyStatsForUser(uid);
  assert.equal(backfill.backfilled, true);
  const rebuiltUser = await db.doc(`users/${uid}`).get();
  assert.equal(rebuiltUser.data()?.['monthlyStatsBackfillVersion'], 2);
  assert.equal(rebuiltUser.data()?.['totalDistanceKm'], 3);
  assert.equal(rebuiltUser.data()?.['activityCount'], 1);
  console.log('activity aggregation integration tests passed');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
