import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { sendPushToUser } from './push';

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
 * - active → finished: endAt <= now（全participantsへ終了通知を作成、優勝/準優勝陣営の全員に称号を付与）
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

    // 優勝陣営/準優勝陣営の称号: 冪等性はtitlesAwardedAtが未設定の場合のみ算出し、
    // status更新と1つのbatchでアトミックにcommitすることで保証する。
    const titleUpdates: { userRef: FirebaseFirestore.DocumentReference; title: UserTitle }[] = [];
    if (!battle['titlesAwardedAt']) {
      const categories = (battle['categories'] as Array<{ id: string; label: string }> | undefined) ?? [];
      const awardedAt = new Date().toISOString();
      const seasonId = (battle['seasonId'] as string | null) ?? '';
      const battleTitle = battle['title'] as string;

      // 旧仕様（個人戦モード）・区分未設定バトルは個人貢献距離の上位2名に付与する
      const isIndividual = battle['mode'] === 'individual' || categories.length === 0;

      if (isIndividual) {
        const topSnap = await battleDoc.ref
          .collection('participants')
          .orderBy('totalDistanceKm', 'desc')
          .limit(2)
          .get();
        topSnap.docs.forEach((p, i) => {
          const totalDistanceKm = (p.data()['totalDistanceKm'] as number) ?? 0;
          if (totalDistanceKm <= 0) return;
          titleUpdates.push({
            userRef: db.doc(`users/${p.id}`),
            title: { seasonId, battleId: battleDoc.id, battleTitle, teamName: '', rank: i + 1, awardedAt },
          });
        });
      } else {
        // category_stats を rankingType でソートし、上位2陣営を確定する
        const rankingType = (battle['rankingType'] as string | undefined) ?? 'total';
        const statsSnap = await battleDoc.ref.collection('category_stats').get();
        const rankedCategories = statsSnap.docs
          .map((s) => ({
            categoryId: s.id,
            value: (rankingType === 'average'
              ? (s.data()['avgDistanceKm'] as number)
              : (s.data()['totalDistanceKm'] as number)) ?? 0,
          }))
          .filter((c) => c.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 2);

        if (rankedCategories.length > 0) {
          const participantsSnap = await battleDoc.ref
            .collection('participants')
            .where('categoryId', 'in', rankedCategories.map((c) => c.categoryId))
            .get();

          participantsSnap.docs.forEach((p) => {
            const categoryId = p.data()['categoryId'] as string;
            const rank = rankedCategories.findIndex((c) => c.categoryId === categoryId) + 1;
            const teamName = categories.find((c) => c.id === categoryId)?.label ?? '';
            titleUpdates.push({
              userRef: db.doc(`users/${p.id}`),
              title: { seasonId, battleId: battleDoc.id, battleTitle, teamName, rank, awardedAt },
            });
          });
        }
      }
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
    const battleEndedTitle = `「${battle['title']}」が終了しました`;
    const battleEndedBody = '結果を確認しよう';
    await Promise.all(
      participantsSnap.docs.map(async (p) => {
        await db.collection(`users/${p.id}/notifications`).add({
          type: 'battle_ended',
          title: battleEndedTitle,
          body: battleEndedBody,
          isRead: false,
          relatedBattleId: battleDoc.id,
          relatedActivityId: null,
          createdAt: FieldValue.serverTimestamp(),
        });
        await sendPushToUser(p.id, battleEndedTitle, battleEndedBody, {
          type: 'battle_ended',
          relatedBattleId: battleDoc.id,
        });
      }),
    );
  }

  if (!toFinishedSnap.empty) {
    logger.info('battleStatusScheduler: finished battles', { count: toFinishedSnap.size });
  }
});
