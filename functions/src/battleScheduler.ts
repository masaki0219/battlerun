import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

interface UserTitle {
  seasonId: string;
  battleId: string;
  battleTitle: string;
  teamName: string;
  rank: number;
  awardedAt: string;
}

/**
 * 60分ごとにバトルのステータスを自動遷移させる。
 * - upcoming → active: startAt <= now
 * - active → finished: endAt <= now（全participantsへ終了通知を作成、MVP/準MVPの称号を付与）
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

    // MVP/準MVP称号: バトル内の個人貢献距離（participants.totalDistanceKm）1位/2位に付与。
    // 冪等性: titlesAwardedAtが未設定の場合のみ算出し、status更新と1つのbatchでアトミックにcommitする。
    const titleUpdates: { userRef: FirebaseFirestore.DocumentReference; title: UserTitle }[] = [];
    if (!battle['titlesAwardedAt']) {
      const categories = (battle['categories'] as Array<{ id: string; label: string }> | undefined) ?? [];
      const topSnap = await battleDoc.ref
        .collection('participants')
        .orderBy('totalDistanceKm', 'desc')
        .limit(2)
        .get();

      const awardedAt = new Date().toISOString();
      topSnap.docs.forEach((p, i) => {
        const totalDistanceKm = (p.data()['totalDistanceKm'] as number) ?? 0;
        if (totalDistanceKm <= 0) return;
        const categoryId = (p.data()['categoryId'] as string | null) ?? null;
        const teamName = categories.find((c) => c.id === categoryId)?.label ?? '';
        titleUpdates.push({
          userRef: db.doc(`users/${p.id}`),
          title: {
            seasonId: (battle['seasonId'] as string | null) ?? '',
            battleId: battleDoc.id,
            battleTitle: battle['title'] as string,
            teamName,
            rank: i + 1,
            awardedAt,
          },
        });
      });
    }

    const batch = db.batch();
    batch.update(battleDoc.ref, {
      status: 'finished',
      ...(battle['titlesAwardedAt'] ? {} : { titlesAwardedAt: FieldValue.serverTimestamp() }),
    });
    for (const { userRef, title } of titleUpdates) {
      batch.update(userRef, { titles: FieldValue.arrayUnion(title) });
    }
    await batch.commit();

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
