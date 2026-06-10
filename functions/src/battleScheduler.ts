import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * 60分ごとにバトルのステータスを自動遷移させる。
 * - upcoming → active: startAt <= now
 * - active → finished: endAt <= now（全participantsへ終了通知を作成）
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
    const battle = battleDoc.data();
    await battleDoc.ref.update({ status: 'finished' });

    const participantsSnap = await battleDoc.ref.collection('participants').get();
    await Promise.all(
      participantsSnap.docs.map((p) =>
        db.collection(`users/${p.id}/notifications`).add({
          type: 'battle_ended',
          title: `「${battle['title']}」が終了しました`,
          body: '結果を確認しよう',
          isRead: false,
          relatedBattleId: battleDoc.id,
          relatedActivityId: null,
          createdAt: FieldValue.serverTimestamp(),
        }),
      ),
    );
  }

  if (!toFinishedSnap.empty) {
    logger.info('battleStatusScheduler: finished battles', { count: toFinishedSnap.size });
  }
});
