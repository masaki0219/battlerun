/**
 * 称号付与バッチスクリプト
 *
 * 実行方法:
 *   1. npm install -D firebase-admin ts-node  # 初回のみ
 *   2. Firebase Console → プロジェクト設定 → サービスアカウント
 *      → 「新しい秘密鍵の生成」でJSONをダウンロード
 *   3. GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *      npx ts-node scripts/award-titles.ts <battleId> <seasonId>
 *
 * 例:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   npx ts-node scripts/award-titles.ts abc123 season001
 */

import * as admin from 'firebase-admin';

// ─── Firebase Admin 初期化 ────────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

// ─── 型定義 ───────────────────────────────────────────────────────────────
interface Contributor {
  userId: string;
  categoryId: string | null;
  categoryLabel: string;
  totalDistanceKm: number;
}

// ─── メイン処理 ───────────────────────────────────────────────────────────
async function awardTitles(battleId: string, seasonId: string): Promise<void> {
  console.log(`\n🏆 称号付与開始: battleId=${battleId}, seasonId=${seasonId}`);

  // 1. バトル情報を取得
  const battleSnap = await db.collection('battles').doc(battleId).get();
  if (!battleSnap.exists) {
    console.error('❌ バトルが見つかりません:', battleId);
    process.exit(1);
  }
  const battle = battleSnap.data()!;
  const battleTitle = battle['title'] as string;
  const categories = (battle['categories'] as Array<{ id: string; label: string }>) ?? [];
  console.log(`📋 バトル: ${battleTitle}`);

  // 2. 参加者一覧を取得（battles/{battleId}/participants/{userId}）
  const participantsSnap = await db
    .collection('battles')
    .doc(battleId)
    .collection('participants')
    .get();

  if (participantsSnap.empty) {
    console.log('⚠️  参加者がいません');
    return;
  }

  // 3. 各参加者の走行距離を participants から取得
  const contributors: Contributor[] = participantsSnap.docs.map((participantDoc) => {
    const data = participantDoc.data();
    const categoryId = (data['categoryId'] as string | null) ?? null;
    const categoryLabel = categories.find((c) => c.id === categoryId)?.label ?? categoryId ?? '個人';
    return {
      userId: participantDoc.id,
      categoryId,
      categoryLabel,
      totalDistanceKm: (data['totalDistanceKm'] as number) ?? 0,
    };
  });

  // 4. 陣営ごとに分けてTOP10を選出
  const categoryGroups = new Map<string, Contributor[]>();
  for (const c of contributors) {
    const key = c.categoryId ?? '__individual__';
    if (!categoryGroups.has(key)) categoryGroups.set(key, []);
    categoryGroups.get(key)!.push(c);
  }

  const awardedAt = admin.firestore.Timestamp.now();
  let totalAwarded = 0;

  for (const [, members] of categoryGroups) {
    const sorted = members.sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);
    const top10 = sorted.slice(0, 10);

    console.log(`\n🏅 陣営: ${top10[0]?.categoryLabel} (${top10.length}人)`);

    for (let i = 0; i < top10.length; i++) {
      const { userId, categoryLabel, totalDistanceKm } = top10[i];
      const rank = i + 1;

      const title = {
        seasonId,
        battleId,
        battleTitle,
        teamName: categoryLabel,
        rank,
        awardedAt: awardedAt.toDate(),
      };

      await db.collection('users').doc(userId).update({
        titles: admin.firestore.FieldValue.arrayUnion(title),
      });

      console.log(
        `  ${rank === 1 ? '👑' : `${rank}位`} userId=${userId} ${totalDistanceKm.toFixed(1)}km`,
      );
      totalAwarded++;
    }
  }

  // 5. シーズンをarchivedに更新
  await db.collection('seasons').doc(seasonId).update({ status: 'archived' });
  console.log(`\n✅ 完了: ${totalAwarded}人に称号を付与、seasonId=${seasonId} を archived に更新`);
}

// ─── エントリーポイント ───────────────────────────────────────────────────
const [battleId, seasonId] = process.argv.slice(2);
if (!battleId || !seasonId) {
  console.error('使い方: npx ts-node scripts/award-titles.ts <battleId> <seasonId>');
  process.exit(1);
}

awardTitles(battleId, seasonId).catch((e) => {
  console.error('❌ エラー:', e);
  process.exit(1);
});
