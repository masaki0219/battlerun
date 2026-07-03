/**
 * Firestoreセキュリティルールのテスト
 *
 * 実行方法:
 *   npm run test:rules
 *   （内部で firebase emulators:exec --only firestore を使用）
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, addDoc, deleteDoc, collection, Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'battlerun-rules-test';

const [emulatorHost, emulatorPort] = (process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080').split(':');

let testEnv: RulesTestEnvironment;
let failed = 0;

async function check(name: string, promise: Promise<unknown>, expected: 'succeed' | 'fail') {
  try {
    if (expected === 'succeed') {
      await assertSucceeds(promise);
    } else {
      await assertFails(promise);
    }
    console.log(`PASS: ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(e);
  }
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // バトル1: チーム戦、teamAは集計済みのcategory_stats
    await setDoc(doc(db, 'battles/battle1/category_stats/teamA'), {
      label: 'チームA',
      totalDistanceKm: 10,
      avgDistanceKm: 5,
      participantCount: 2,
    });

    // alice は battle1 の teamA に参加済み（totalDistanceKm: 0）
    await setDoc(doc(db, 'battles/battle1/participants/alice'), {
      categoryId: 'teamA',
      totalDistanceKm: 0,
      activityCount: 0,
    });

    // alice の既存アクティビティ（update/delete拒否確認用）
    await setDoc(doc(db, 'activities/act1'), {
      userId: 'alice',
      distanceKm: 5,
      battleIds: ['battle1'],
      startedAt: Timestamp.now(),
      endedAt: Timestamp.now(),
    });

    // alice のユーザードキュメント（plan/role/titles自己変更拒否確認用）
    await setDoc(doc(db, 'users/alice'), {
      name: 'Alice',
      plan: 'free',
      role: 'user',
      titles: [],
    });
  });
}

async function run() {
  const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: emulatorHost, port: Number(emulatorPort) },
  });

  await seed();

  const aliceDb = testEnv.authenticatedContext('alice').firestore();

  // ── category_stats ────────────────────────────────────────────────
  await check(
    'category_stats: totalDistanceKmの直接更新は拒否',
    updateDoc(doc(aliceDb, 'battles/battle1/category_stats/teamA'), { totalDistanceKm: 9999 }),
    'fail',
  );
  await check(
    'category_stats: participantCountのみの更新も拒否（人数水増しによる平均改ざん防止）',
    updateDoc(doc(aliceDb, 'battles/battle1/category_stats/teamA'), { participantCount: 3 }),
    'fail',
  );
  await check(
    'category_stats: ゼロ値での新規作成は許可',
    setDoc(doc(aliceDb, 'battles/battle1/category_stats/teamB'), {
      label: 'チームB', totalDistanceKm: 0, avgDistanceKm: 0, participantCount: 0,
    }),
    'succeed',
  );
  await check(
    'category_stats: 非ゼロ値での新規作成は拒否',
    setDoc(doc(aliceDb, 'battles/battle1/category_stats/teamC'), {
      label: 'チームC', totalDistanceKm: 5, avgDistanceKm: 5, participantCount: 0,
    }),
    'fail',
  );
  await check(
    'category_stats: participantCount非ゼロでの新規作成は拒否',
    setDoc(doc(aliceDb, 'battles/battle1/category_stats/teamD'), {
      label: 'チームD', totalDistanceKm: 0, avgDistanceKm: 0, participantCount: 1,
    }),
    'fail',
  );

  // ── participants ───────────────────────────────────────────────────
  await check(
    'participants: totalDistanceKm!=0での新規参加は拒否',
    setDoc(doc(aliceDb, 'battles/battle2/participants/alice'), {
      userId: 'alice', categoryId: 'teamA', totalDistanceKm: 5, activityCount: 0,
    }),
    'fail',
  );
  await check(
    'participants: userIdを他人のuidに詐称した新規参加は拒否',
    setDoc(doc(aliceDb, 'battles/battle2/participants/alice'), {
      userId: 'bob', categoryId: 'teamA', totalDistanceKm: 0, activityCount: 0,
    }),
    'fail',
  );
  await check(
    'participants: totalDistanceKm:0での新規参加は許可',
    setDoc(doc(aliceDb, 'battles/battle2/participants/alice'), {
      userId: 'alice', categoryId: 'teamA', totalDistanceKm: 0, activityCount: 0,
    }),
    'succeed',
  );
  await check(
    'participants: totalDistanceKmの自己更新は拒否',
    updateDoc(doc(aliceDb, 'battles/battle1/participants/alice'), { totalDistanceKm: 100 }),
    'fail',
  );
  await check(
    'participants: categoryIdのみの更新は許可',
    updateDoc(doc(aliceDb, 'battles/battle1/participants/alice'), { categoryId: 'teamB' }),
    'succeed',
  );

  // ── activities ─────────────────────────────────────────────────────
  await check(
    'activities: aggregatedフィールドを含む新規作成は拒否',
    addDoc(collection(aliceDb, 'activities'), {
      userId: 'alice', distanceKm: 3, battleIds: ['battle1'],
      startedAt: Timestamp.now(), endedAt: Timestamp.now(), aggregated: true,
    }),
    'fail',
  );
  await check(
    'activities: aggregatedなしの新規作成は許可',
    addDoc(collection(aliceDb, 'activities'), {
      userId: 'alice', distanceKm: 3, battleIds: ['battle1'],
      startedAt: Timestamp.now(), endedAt: Timestamp.now(),
    }),
    'succeed',
  );
  await check(
    'activities: 既存ドキュメントのupdateは拒否',
    updateDoc(doc(aliceDb, 'activities/act1'), { distanceKm: 999 }),
    'fail',
  );
  await check(
    'activities: 既存ドキュメントのdeleteは拒否',
    deleteDoc(doc(aliceDb, 'activities/act1')),
    'fail',
  );

  // ── users/{uid} ──────────────────────────────────────────────────
  await check(
    'users/{uid}: titlesの自己更新は拒否（Cloud Functionsのみ付与可）',
    updateDoc(doc(aliceDb, 'users/alice'), {
      titles: [{ seasonId: '', battleId: 'battle1', battleTitle: 't', teamName: 'teamA', rank: 1, awardedAt: '' }],
    }),
    'fail',
  );
  await check(
    'users/{uid}: planの自己更新は拒否',
    updateDoc(doc(aliceDb, 'users/alice'), { plan: 'pro' }),
    'fail',
  );
  await check(
    'users/{uid}: roleの自己更新は拒否（admin自称防止）',
    updateDoc(doc(aliceDb, 'users/alice'), { role: 'admin' }),
    'fail',
  );
  await check(
    'users/{uid}: titles/plan/role以外のフィールド更新は許可',
    updateDoc(doc(aliceDb, 'users/alice'), { name: 'Alice2' }),
    'succeed',
  );

  // ── users/{uid}/notifications ─────────────────────────────────────
  await check(
    'users/{uid}/notifications: クライアントからのcreateは拒否',
    addDoc(collection(aliceDb, 'users/alice/notifications'), {
      type: 'reaction', title: 't', body: 'b', isRead: false, createdAt: Timestamp.now(),
    }),
    'fail',
  );

  await testEnv.cleanup();

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log('\nAll Firestore rules tests passed');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
