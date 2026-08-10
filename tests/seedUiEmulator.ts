/**
 * Maestro画面遷移テスト用のシード。Firestoreエミュレータへ公開チャレンジを投入する。
 * ユーザーはMaestroがアプリのUIから新規登録するので、ここでは作らない
 * （Firestoreルールと登録フローを実際に通すため）。
 *
 * 実行: エミュレータ起動中に
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 ts-node --project tests/tsconfig.json tests/seedUiEmulator.ts
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const functionsRequire = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp } = functionsRequire('firebase-admin/app') as typeof import('firebase-admin/app');
const adminFirestore = functionsRequire('firebase-admin/firestore') as typeof import('firebase-admin/firestore');
const { getFirestore, Timestamp } = adminFirestore;

initializeApp({ projectId: process.env['GCLOUD_PROJECT'] ?? 'demo-zelio' });
const db = getFirestore();

async function main(): Promise<void> {
  const now = Date.now();
  const startAt = Timestamp.fromMillis(now - 3 * 24 * 60 * 60 * 1_000);
  const endAt = Timestamp.fromMillis(now + 4 * 24 * 60 * 60 * 1_000);

  const battles = [
    { id: 'ui-battle-morning', title: '朝ラン組 vs よる歩き隊', description: '今週の合計距離で競います。' },
    { id: 'ui-battle-weekend', title: '週末ロング班 vs 平日コツコツ班', description: '無理なく続けるチャレンジ。' },
  ];

  for (const [index, battle] of battles.entries()) {
    await db.doc(`battles/${battle.id}`).set({
      type: 'public',
      status: 'active',
      title: battle.title,
      description: battle.description,
      rankingType: 'total',
      inviteCode: null,
      createdBy: null,
      seasonId: null,
      startAt,
      endAt,
      // 表示名のキーは Category.label。name ではないので注意。
      categories: [
        { id: 'team-a', label: index === 0 ? '朝ラン組' : '週末ロング班', colorId: 'red' },
        { id: 'team-b', label: index === 0 ? 'よる歩き隊' : '平日コツコツ班', colorId: 'blue' },
      ],
      categoryIds: ['team-a', 'team-b'],
    });
    await Promise.all([
      db.doc(`battles/${battle.id}/category_stats/team-a`).set({
        totalDistanceKm: 12.4,
        avgDistanceKm: 6.2,
        participantCount: 2,
      }),
      db.doc(`battles/${battle.id}/category_stats/team-b`).set({
        totalDistanceKm: 9.8,
        avgDistanceKm: 4.9,
        participantCount: 2,
      }),
    ]);
  }

  console.log(`シード投入完了: 公開チャレンジ ${battles.length} 件`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
