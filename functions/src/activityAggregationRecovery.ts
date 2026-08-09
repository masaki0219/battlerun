import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { runActivityAggregationWithDiagnostics } from './aggregateActivity';
import { backfillMonthlyStatsForUser } from './monthlyStatsBackfill';

const STALE_AFTER_MS = 30 * 60 * 1000;
const SCHEDULED_BATCH_SIZE = 50;
const MAX_ADMIN_BATCH_SIZE = 100;
const CONCURRENCY = 5;

interface RecoveryResult {
  found: number;
  repaired: number;
  failedActivityIds: string[];
  reconciledUsers: number;
  reconciliationFailures: number;
}

async function processActivities(
  activities: FirebaseFirestore.QueryDocumentSnapshot[],
  source: 'scheduler' | 'admin',
): Promise<RecoveryResult> {
  const failedActivityIds: string[] = [];
  const repairedUserIds = new Set<string>();
  let repaired = 0;
  for (let start = 0; start < activities.length; start += CONCURRENCY) {
    const chunk = activities.slice(start, start + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((activity) => runActivityAggregationWithDiagnostics(activity, source)),
    );
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        repaired += 1;
        const userId = chunk[index].data()['userId'];
        if (typeof userId === 'string') repairedUserIds.add(userId);
      } else {
        failedActivityIds.push(chunk[index].id);
      }
    });
  }
  const reconciliations = await Promise.allSettled(
    [...repairedUserIds].map((userId) => backfillMonthlyStatsForUser(userId)),
  );
  const reconciliationFailures = reconciliations.filter((result) => result.status === 'rejected').length;
  if (reconciliationFailures > 0) {
    logger.error('activity_stats_reconciliation_failed', {
      source,
      failedCount: reconciliationFailures,
    });
  }
  return {
    found: activities.length,
    repaired,
    failedActivityIds,
    reconciledUsers: repairedUserIds.size - reconciliationFailures,
    reconciliationFailures,
  };
}

/** 30分以上止まった活動を定期的に拾い、冪等な集計本体へ戻す安全網。 */
export const recoverStaleActivityAggregations = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'asia-northeast1',
    timeoutSeconds: 540,
    retryCount: 3,
    maxRetrySeconds: 600,
  },
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - STALE_AFTER_MS);
    const snapshot = await db.collection('activities')
      .where('aggregated', '==', false)
      .where('submittedAt', '<=', cutoff)
      .orderBy('submittedAt', 'asc')
      .limit(SCHEDULED_BATCH_SIZE)
      .get();
    if (snapshot.empty) return;

    const result = await processActivities(snapshot.docs, 'scheduler');
    logger.info('activity_aggregation_recovery_completed', result);
    if (result.failedActivityIds.length > 0 || result.reconciliationFailures > 0) {
      // Scheduler 自体にも失敗を伝え、Cloud Monitoring で検知できる状態にする。
      throw new Error('One or more activity aggregate recoveries failed.');
    }
  },
);

/** 障害復旧時に admin が未集計活動を即時処理する、件数制限つき Callable。 */
export const retryPendingActivityAggregations = onCall(
  { timeoutSeconds: 540 },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'ログインが必要です。');
    const db = getFirestore();
    const caller = await db.doc(`users/${callerUid}`).get();
    if (!caller.exists || caller.data()?.['role'] !== 'admin') {
      throw new HttpsError('permission-denied', '管理者権限が必要です。');
    }

    const requestedLimit = request.data?.['limit'];
    const limit = typeof requestedLimit === 'number' && Number.isInteger(requestedLimit)
      ? Math.min(MAX_ADMIN_BATCH_SIZE, Math.max(1, requestedLimit))
      : SCHEDULED_BATCH_SIZE;
    const snapshot = await db.collection('activities')
      .where('aggregated', '==', false)
      .limit(limit)
      .get();
    const result = await processActivities(snapshot.docs, 'admin');
    logger.info('activity_aggregation_admin_retry_completed', {
      callerUid,
      ...result,
    });
    return {
      ...result,
      mayHaveMore: snapshot.size === limit,
    };
  },
);
