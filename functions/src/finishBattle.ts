import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { sendPushToUser } from './push';

export interface UserTitle {
  seasonId: string;
  battleId: string;
  battleTitle: string;
  teamName: string;
  rank: number;
  awardedAt: string;
}

/**
 * バトルを終了させ、称号付与と終了通知を行う共通処理。
 * battleStatusScheduler（自動終了）と onBattleFinished（admin手動終了トリガー）の
 * 両方から呼ばれる唯一の終了経路。
 *
 * 冪等性は battle.titlesAwardedAt で担保する。トランザクション内で
 * 「フラグ確認 → status/titlesAwardedAt/titles を確定」をアトミックに行うため、
 * スケジューラとトリガーが同時発火しても称号は一度しか付かない。
 * 終了通知は「確定した実行」のみが送るため二重送信しない。
 *
 * 選出ロジックは変更していない（区分ありは上位2陣営全員、個人戦/区分なしは上位2名）。
 */
export async function finishBattle(battleId: string): Promise<void> {
  const db = getFirestore();
  const battleRef = db.doc(`battles/${battleId}`);
  const snap = await battleRef.get();
  if (!snap.exists) {
    logger.warn('finishBattle: battle not found', { battleId });
    return;
  }
  const battle = snap.data()!;

  // すでに称号付与済みなら status だけ finished を保証して撤退（冪等）
  if (battle['titlesAwardedAt']) {
    if (battle['status'] !== 'finished') {
      await battleRef.update({ status: 'finished' });
    }
    return;
  }

  // ── 称号対象の算出（クエリはトランザクション外で行う）──
  const categories =
    (battle['categories'] as Array<{ id: string; label: string }> | undefined) ?? [];
  const awardedAt = new Date().toISOString();
  const seasonId = (battle['seasonId'] as string | null) ?? '';
  const battleTitle = battle['title'] as string;
  const isIndividual = battle['mode'] === 'individual' || categories.length === 0;

  const titleUpdates: { userRef: FirebaseFirestore.DocumentReference; title: UserTitle }[] = [];

  if (isIndividual) {
    const topSnap = await battleRef
      .collection('participants')
      .orderBy('totalDistanceKm', 'desc')
      .limit(2)
      .get();
    topSnap.docs.forEach((p, i) => {
      const totalDistanceKm = (p.data()['totalDistanceKm'] as number) ?? 0;
      if (totalDistanceKm <= 0) return;
      titleUpdates.push({
        userRef: db.doc(`users/${p.id}`),
        title: { seasonId, battleId, battleTitle, teamName: '', rank: i + 1, awardedAt },
      });
    });
  } else {
    const rankingType = (battle['rankingType'] as string | undefined) ?? 'total';
    const statsSnap = await battleRef.collection('category_stats').get();
    const rankedCategories = statsSnap.docs
      .map((s) => ({
        categoryId: s.id,
        value:
          (rankingType === 'average'
            ? (s.data()['avgDistanceKm'] as number)
            : (s.data()['totalDistanceKm'] as number)) ?? 0,
      }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 2);

    if (rankedCategories.length > 0) {
      const participantsSnap = await battleRef
        .collection('participants')
        .where('categoryId', 'in', rankedCategories.map((c) => c.categoryId))
        .get();
      participantsSnap.docs.forEach((p) => {
        const categoryId = p.data()['categoryId'] as string;
        const rank = rankedCategories.findIndex((c) => c.categoryId === categoryId) + 1;
        const teamName = categories.find((c) => c.id === categoryId)?.label ?? '';
        titleUpdates.push({
          userRef: db.doc(`users/${p.id}`),
          title: { seasonId, battleId, battleTitle, teamName, rank, awardedAt },
        });
      });
    }
  }

  // ── フラグ確認 → 確定 をトランザクションでアトミックに ──
  // reads を writes より前に行う制約を守るため、battleRef の get のみ txn 内で行う。
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(battleRef);
    if (fresh.data()?.['titlesAwardedAt']) {
      // 別実行が先に確定済み。status だけ保証して撤退。
      if (fresh.data()?.['status'] !== 'finished') {
        tx.update(battleRef, { status: 'finished' });
      }
      return false;
    }
    tx.update(battleRef, {
      status: 'finished',
      titlesAwardedAt: FieldValue.serverTimestamp(),
    });
    for (const { userRef, title } of titleUpdates) {
      tx.update(userRef, { titles: FieldValue.arrayUnion(title) });
    }
    return true;
  });

  if (!claimed) return;

  // ── 終了通知（確定した実行のみ送る）──
  const participantsSnap = await battleRef.collection('participants').get();
  const notifyTitle = `「${battleTitle}」が終了しました`;
  const notifyBody = '結果を確認しよう';
  await Promise.all(
    participantsSnap.docs.map(async (p) => {
      await db.collection(`users/${p.id}/notifications`).add({
        type: 'battle_ended',
        title: notifyTitle,
        body: notifyBody,
        isRead: false,
        relatedBattleId: battleId,
        relatedActivityId: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      await sendPushToUser(p.id, notifyTitle, notifyBody, {
        type: 'battle_ended',
        relatedBattleId: battleId,
      });
    }),
  );

  logger.info('finishBattle: finished', { battleId, awarded: titleUpdates.length });
}
