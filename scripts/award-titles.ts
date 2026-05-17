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
  teamId: string;
  teamName: string;
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
  console.log(`📋 バトル: ${battleTitle}`);

  // 2. バトル期間中のアクティビティを集計
  const battleStart: admin.firestore.Timestamp = battle['startAt'];
  const battleEnd: admin.firestore.Timestamp = battle['endAt'];

  // 参加メンバー一覧を取得
  const membersSnap = await db
    .collection('battles')
    .doc(battleId)
    .collection('members')
    .get();

  if (membersSnap.empty) {
    console.log('⚠️  参加メンバーがいません');
    return;
  }

  // 3. 各メンバーのバトル期間内の走行距離を集計
  const contributors: Contributor[] = [];

  for (const memberDoc of membersSnap.docs) {
    const userId = memberDoc.id;
    const teamId = memberDoc.data()['teamId'] as string;

    const activitiesSnap = await db
      .collection('activities')
      .where('userId', '==', userId)
      .where('startedAt', '>=', battleStart)
      .where('startedAt', '<=', battleEnd)
      .get();

    const totalKm = activitiesSnap.docs.reduce(
      (sum, d) => sum + ((d.data()['distanceKm'] as number) ?? 0),
      0,
    );

    // チーム名を取得
    const teamName = (battle['teams'] as Array<{ teamId: string; name: string }>)
      .find((t) => t.teamId === teamId)?.name ?? teamId;

    contributors.push({ userId, teamId, teamName, totalDistanceKm: totalKm });
  }

  // 4. チームごとに分けてTOP10を選出
  const teamGroups = new Map<string, Contributor[]>();
  for (const c of contributors) {
    if (!teamGroups.has(c.teamId)) teamGroups.set(c.teamId, []);
    teamGroups.get(c.teamId)!.push(c);
  }

  const awardedAt = admin.firestore.Timestamp.now();
  let totalAwarded = 0;

  for (const [teamId, members] of teamGroups) {
    const sorted = members.sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);
    const top10 = sorted.slice(0, 10);

    console.log(`\n🏅 チーム: ${top10[0]?.teamName} (${top10.length}人)`);

    for (let i = 0; i < top10.length; i++) {
      const { userId, teamName, totalDistanceKm } = top10[i];
      const rank = i + 1;

      const title = {
        seasonId,
        battleId,
        battleTitle,
        teamName,
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
