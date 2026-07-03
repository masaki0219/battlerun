/**
 * 称号付与バッチスクリプト（障害時の手動復旧用）
 *
 * 通常は functions/src/battleScheduler.ts の battleStatusScheduler が
 * バトル終了時（active→finished）に自動で称号を付与する。
 * このスクリプトは、スケジューラが何らかの理由で実行されなかった場合の
 * 手動復旧用であり、選出ロジックは battleScheduler.ts と揃えてある。
 *
 * 付与仕様（battleScheduler.ts と同一）:
 *   - 区分ありバトル: category_stats を rankingType でソートし、
 *     上位2陣営（優勝/準優勝）の participants 全員に付与（rank = 陣営順位）
 *   - 個人戦バトル（mode: 'individual' または区分未設定）:
 *     participants の totalDistanceKm 上位2名に付与（rank = 個人順位）
 * 冪等性: user.titles に同一 battleId の称号が既にあればスキップする
 *   （battleScheduler.ts は battle.titlesAwardedAt で冪等性を担保しているが、
 *   このスクリプトは手動実行のため titles 側での重複チェックで担保する）。
 *
 * シーズンの archived 更新はこのスクリプトの責務ではない（分離済み）。
 * 必要な場合は Firebase Console または管理画面から別途行うこと。
 *
 * 実行方法:
 *   1. npm install -D firebase-admin ts-node  # 初回のみ
 *   2. Firebase Console → プロジェクト設定 → サービスアカウント
 *      → 「新しい秘密鍵の生成」でJSONをダウンロード
 *   3. GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *      npx ts-node scripts/award-titles.ts <battleId>
 *
 * 例:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   npx ts-node scripts/award-titles.ts abc123
 */

import * as admin from 'firebase-admin';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

interface UserTitle {
  seasonId: string;
  battleId: string;
  battleTitle: string;
  teamName: string;
  rank: number;
  awardedAt: string;
}

async function awardTitles(battleId: string): Promise<void> {
  console.log(`\n🏆 称号付与開始（手動復旧）: battleId=${battleId}`);

  const battleSnap = await db.collection('battles').doc(battleId).get();
  if (!battleSnap.exists) {
    console.error('❌ バトルが見つかりません:', battleId);
    process.exit(1);
  }
  const battle = battleSnap.data()!;
  const battleTitle = battle['title'] as string;
  const seasonId = (battle['seasonId'] as string | null) ?? '';
  const categories = (battle['categories'] as Array<{ id: string; label: string }>) ?? [];
  console.log(`📋 バトル: ${battleTitle}`);

  const awardedAt = new Date().toISOString();
  const titleUpdates: { userId: string; title: UserTitle }[] = [];

  const isIndividual = battle['mode'] === 'individual' || categories.length === 0;

  if (isIndividual) {
    const topSnap = await db
      .collection('battles').doc(battleId)
      .collection('participants')
      .orderBy('totalDistanceKm', 'desc')
      .limit(2)
      .get();
    topSnap.docs.forEach((p, i) => {
      const totalDistanceKm = (p.data()['totalDistanceKm'] as number) ?? 0;
      if (totalDistanceKm <= 0) return;
      titleUpdates.push({
        userId: p.id,
        title: { seasonId, battleId, battleTitle, teamName: '', rank: i + 1, awardedAt },
      });
    });
  } else {
    const rankingType = (battle['rankingType'] as string | undefined) ?? 'total';
    const statsSnap = await db.collection('battles').doc(battleId).collection('category_stats').get();
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
      const participantsSnap = await db
        .collection('battles').doc(battleId)
        .collection('participants')
        .where('categoryId', 'in', rankedCategories.map((c) => c.categoryId))
        .get();

      participantsSnap.docs.forEach((p) => {
        const categoryId = p.data()['categoryId'] as string;
        const rank = rankedCategories.findIndex((c) => c.categoryId === categoryId) + 1;
        const teamName = categories.find((c) => c.id === categoryId)?.label ?? '';
        titleUpdates.push({
          userId: p.id,
          title: { seasonId, battleId, battleTitle, teamName, rank, awardedAt },
        });
      });
    }
  }

  if (titleUpdates.length === 0) {
    console.log('⚠️  付与対象がいません（参加者0、または集計未反映）');
    return;
  }

  let awarded = 0;
  let skipped = 0;
  for (const { userId, title } of titleUpdates) {
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const existingTitles = (userSnap.data()?.['titles'] as UserTitle[] | undefined) ?? [];
    const alreadyAwarded = existingTitles.some((t) => t.battleId === battleId);
    if (alreadyAwarded) {
      console.log(`  ⏭  userId=${userId} は既に称号付与済みのためスキップ`);
      skipped++;
      continue;
    }
    await userRef.update({ titles: admin.firestore.FieldValue.arrayUnion(title) });
    console.log(
      `  ${title.rank === 1 ? '👑' : `${title.rank}位`} userId=${userId} ${title.teamName || '(個人)'}`,
    );
    awarded++;
  }

  console.log(`\n✅ 完了: ${awarded}人に称号を付与（${skipped}人は付与済みのためスキップ）`);
}

const [battleId] = process.argv.slice(2);
if (!battleId) {
  console.error('使い方: npx ts-node scripts/award-titles.ts <battleId>');
  process.exit(1);
}

awardTitles(battleId).catch((e) => {
  console.error('❌ エラー:', e);
  process.exit(1);
});
