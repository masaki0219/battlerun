import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { finishBattle } from './finishBattle';

/**
 * 60分ごとにバトルのステータスを自動遷移させる。
 * - upcoming → active: startAt <= now
 * - active → finished: endAt <= now（finishBattle が終了通知・称号付与を行う）
 *
 * 終了処理は finishBattle に一本化されており、手動終了（onBattleFinished 経由）と
 * 同一ロジック・同一冪等性で実行される。
 *
 * 緊急時の手動切替（app/admin/index.tsx）は引き続き利用可能。
 */
export const battleStatusScheduler = onSchedule('every 60 minutes', async () => {
  const db = getFirestore();
  const now = Timestamp.now();

  const toActiveSnap = await db
    .collection('battles')
    .where('status', '==', 'upcoming')
    .where('startAt', '<=', now)
    .get();

  await Promise.all(toActiveSnap.docs.map((doc) => doc.ref.update({ status: 'active' })));
  if (!toActiveSnap.empty) {
    logger.info('battleStatusScheduler: started battles', { count: toActiveSnap.size });
  }

  const toFinishedSnap = await db
    .collection('battles')
    .where('status', '==', 'active')
    .where('endAt', '<=', now)
    .get();

  for (const battleDoc of toFinishedSnap.docs) {
    await finishBattle(battleDoc.id);
  }

  if (!toFinishedSnap.empty) {
    logger.info('battleStatusScheduler: finished battles', { count: toFinishedSnap.size });
  }
});
