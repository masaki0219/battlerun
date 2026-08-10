/**
 * RELEASE_TEST_CHECKLIST.md のシナリオ2・3・4・7と参加制約を、
 * Firestore / Auth / Functions エミュレータ上でサーバー側まで通す。
 *
 * チェックリストがこれらを「TestFlight必須」としているのは、Push が実際に端末へ
 * 届くかを見るためである。届く手前の「通知を作る／作らない」「称号・バッジを付ける」
 * 「削除で消す」といったサーバー判断はここで確認し、実機で見る範囲を配送だけに絞る。
 *
 * 実行: npm run test:e2e:scenarios
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { finishBattle } from '../functions/src/finishBattle';
import { runRankChangeScan } from '../functions/src/rankChangeScheduler';

const functionsRequire = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp } = functionsRequire('firebase-admin/app') as typeof import('firebase-admin/app');
const adminFirestore = functionsRequire('firebase-admin/firestore') as typeof import('firebase-admin/firestore');
const adminAuth = functionsRequire('firebase-admin/auth') as typeof import('firebase-admin/auth');
const { getFirestore, Timestamp, FieldValue } = adminFirestore;
const { getAuth } = adminAuth;

const PROJECT_ID = process.env['GCLOUD_PROJECT'] ?? 'demo-zelio';
const FUNCTIONS_HOST = process.env['FUNCTIONS_EMULATOR_HOST'] ?? '127.0.0.1:5001';
const AUTH_HOST = process.env['FIREBASE_AUTH_EMULATOR_HOST'] ?? '127.0.0.1:9099';
const CALLABLE_REGION = 'us-central1';

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

async function waitFor<T>(label: string, probe: () => Promise<T | null>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error(`タイムアウト: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** 一定時間、条件が「起きないこと」を確かめる（通知を作らない系の検証用）。 */
async function assertStaysEmpty(label: string, probe: () => Promise<number>, holdMs = 4_000): Promise<void> {
  const deadline = Date.now() + holdMs;
  while (Date.now() < deadline) {
    const count = await probe();
    assert.equal(count, 0, label);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function createAuthUser(email: string): Promise<{ uid: string; idToken: string }> {
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'test-password-1234', returnSecureToken: true }),
    },
  );
  const body = await response.json() as { localId?: string; idToken?: string };
  assert.ok(body.localId && body.idToken, 'Authエミュレータのユーザー作成に失敗');
  return { uid: body.localId, idToken: body.idToken };
}

async function callFunction(
  name: string,
  idToken: string,
  data: Record<string, unknown>,
): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; code: string; message: string }> {
  const response = await fetch(`http://${FUNCTIONS_HOST}/${PROJECT_ID}/${CALLABLE_REGION}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const body = await response.json() as {
    result?: Record<string, unknown>;
    error?: { status?: string; message?: string };
  };
  if (body.error) return { ok: false, code: body.error.status ?? 'UNKNOWN', message: body.error.message ?? '' };
  return { ok: true, result: body.result ?? {} };
}

async function seedUser(uid: string, name: string, extra: Record<string, unknown> = {}): Promise<void> {
  await db.doc(`users/${uid}`).set({
    name,
    plan: 'free',
    totalDistanceKm: 0,
    activityCount: 0,
    battleIds: [],
    ...extra,
  });
}

// ── シナリオ2: 帰属ループ（リアクション → 通知生成） ──────────────────
async function scenarioReactionNotification(): Promise<void> {
  const owner = await createAuthUser(`e2e-owner-${Date.now()}@example.com`);
  const reactor = await createAuthUser(`e2e-reactor-${Date.now()}@example.com`);
  await Promise.all([seedUser(owner.uid, '記録した人'), seedUser(reactor.uid, '応援する人')]);

  const activityId = `e2e-reaction-activity-${Date.now()}`;
  await db.doc(`activities/${activityId}`).set({
    userId: owner.uid,
    displayName: '記録した人',
    distanceKm: 3,
    durationSeconds: 1_200,
    battleIds: [],
    aggregatedBattleIds: [],
    measurementType: 'gps',
    startedAt: Timestamp.now(),
    submittedAt: Timestamp.now(),
    aggregated: true,
  });

  // 他人のリアクションは通知される。
  await db.doc(`activities/${activityId}/reactions/${reactor.uid}`).set({ type: '👏', userId: reactor.uid });
  const notification = await waitFor('リアクション通知の作成', async () => {
    const snap = await db.collection(`users/${owner.uid}/notifications`).where('type', '==', 'reaction').get();
    return snap.size > 0 ? snap.docs[0]! : null;
  });
  assert.equal(notification.data()['relatedActivityId'], activityId);
  assert.equal(notification.data()['isRead'], false);
  assert.ok(
    (notification.data()['title'] as string).includes('応援する人'),
    '通知タイトルへリアクションした人の表示名が入る',
  );

  // 自分のリアクションは通知しない。
  await db.doc(`activities/${activityId}/reactions/${owner.uid}`).set({ type: '👏', userId: owner.uid });
  await assertStaysEmpty('自分のリアクションで通知が増えた', async () => {
    const snap = await db.collection(`users/${owner.uid}/notifications`).where('type', '==', 'reaction').get();
    return snap.size - 1;
  });

  // ブロック中の相手からのリアクションは通知しない。
  const blocked = await createAuthUser(`e2e-blocked-${Date.now()}@example.com`);
  await seedUser(blocked.uid, 'ブロックされた人');
  await db.doc(`users/${owner.uid}/blocks/${blocked.uid}`).set({ createdAt: FieldValue.serverTimestamp() });
  await db.doc(`activities/${activityId}/reactions/${blocked.uid}`).set({ type: '👏', userId: blocked.uid });
  await assertStaysEmpty('ブロック中の相手のリアクションで通知が増えた', async () => {
    const snap = await db.collection(`users/${owner.uid}/notifications`).where('type', '==', 'reaction').get();
    return snap.size - 1;
  });

  console.log('  ✓ シナリオ2: 他人のリアクションは通知し、自分とブロック相手は通知しない');
}

// ── シナリオ3: 競争ループ（順位変動通知） ────────────────────────────
async function scenarioRankChangeNotification(): Promise<void> {
  const runner = await createAuthUser(`e2e-rank-${Date.now()}@example.com`);
  await seedUser(runner.uid, '順位テスト');
  const battleId = `e2e-rank-battle-${Date.now()}`;
  const now = Date.now();

  await db.doc(`battles/${battleId}`).set({
    type: 'public',
    status: 'active',
    title: '順位変動テスト',
    rankingType: 'total',
    startAt: Timestamp.fromMillis(now - 86_400_000),
    endAt: Timestamp.fromMillis(now + 86_400_000),
    categories: [
      { id: 'team-a', label: 'Aチーム' },
      { id: 'team-b', label: 'Bチーム' },
    ],
  });
  await Promise.all([
    db.doc(`battles/${battleId}/participants/${runner.uid}`).set({ userId: runner.uid, categoryId: 'team-a' }),
    db.doc(`battles/${battleId}/category_stats/team-a`).set({ totalDistanceKm: 1, avgDistanceKm: 1, participantCount: 1 }),
    db.doc(`battles/${battleId}/category_stats/team-b`).set({ totalDistanceKm: 5, avgDistanceKm: 5, participantCount: 1 }),
  ]);

  // 1回目はスナップショットだけ取り、通知しない。
  await runRankChangeScan();
  const afterFirst = await db.doc(`battles/${battleId}`).get();
  assert.deepEqual(
    afterFirst.data()!['lastRankSnapshot'],
    { 'team-a': 2, 'team-b': 1 },
    '初回はスナップショットを保存する',
  );
  const firstNotifications = await db.collection(`users/${runner.uid}/notifications`)
    .where('type', '==', 'rank_change').get();
  assert.equal(firstNotifications.size, 0, '初回実行では順位変動を通知しない');

  // 順位が入れ替わると通知する。
  await db.doc(`battles/${battleId}/category_stats/team-a`).update({ totalDistanceKm: 10, avgDistanceKm: 10 });
  await runRankChangeScan();
  const notified = await waitFor('順位変動通知の作成', async () => {
    const snap = await db.collection(`users/${runner.uid}/notifications`).where('type', '==', 'rank_change').get();
    return snap.size > 0 ? snap : null;
  });
  assert.equal(notified.size, 1);
  assert.equal(notified.docs[0]!.data()['relatedBattleId'], battleId);
  assert.ok(
    (notified.docs[0]!.data()['body'] as string).includes('1位'),
    '通知本文へ更新後の順位が入る',
  );

  // 順位が変わらなければ通知を増やさない。
  await runRankChangeScan();
  const afterNoChange = await db.collection(`users/${runner.uid}/notifications`)
    .where('type', '==', 'rank_change').get();
  assert.equal(afterNoChange.size, 1, '順位が変わらない実行で通知を増やさない');

  // 1日3回の上限を超えたら通知しない。
  const battleRef = db.doc(`battles/${battleId}`);
  await battleRef.update({ rankChangeNotifyCount: 3 });
  await db.doc(`battles/${battleId}/category_stats/team-b`).update({ totalDistanceKm: 99, avgDistanceKm: 99 });
  await runRankChangeScan();
  const afterCap = await db.collection(`users/${runner.uid}/notifications`)
    .where('type', '==', 'rank_change').get();
  assert.equal(afterCap.size, 1, '1日3回の上限を超えたら通知しない');

  console.log('  ✓ シナリオ3: 初回無通知・順位変動で通知・変動なしと1日3回上限で抑止');
}

// ── シナリオ4: バトル終了（称号・終了通知） ─────────────────────────
// 仕様は「区分ありは上位2陣営全員へ称号」（functions/src/finishBattle.ts）。
// 3チーム構成にして、2位までは付き3位には付かない境界を確認する。
async function scenarioBattleFinish(): Promise<void> {
  const first = await createAuthUser(`e2e-first-${Date.now()}@example.com`);
  const second = await createAuthUser(`e2e-second-${Date.now()}@example.com`);
  const third = await createAuthUser(`e2e-third-${Date.now()}@example.com`);
  await Promise.all([
    seedUser(first.uid, '1位の人'),
    seedUser(second.uid, '2位の人'),
    seedUser(third.uid, '3位の人'),
  ]);

  const battleId = `e2e-finish-battle-${Date.now()}`;
  const now = Date.now();
  await db.doc(`battles/${battleId}`).set({
    type: 'public',
    status: 'active',
    title: '終了処理テスト',
    rankingType: 'total',
    startAt: Timestamp.fromMillis(now - 172_800_000),
    endAt: Timestamp.fromMillis(now - 1_000),
    categories: [
      { id: 'team-a', label: '1位チーム' },
      { id: 'team-b', label: '2位チーム' },
      { id: 'team-c', label: '3位チーム' },
    ],
  });
  const members: Array<[string, string, number]> = [
    [first.uid, 'team-a', 20],
    [second.uid, 'team-b', 10],
    [third.uid, 'team-c', 5],
  ];
  await Promise.all(members.flatMap(([uid, categoryId, km]) => [
    db.doc(`battles/${battleId}/participants/${uid}`).set({
      userId: uid, categoryId, totalDistanceKm: km, activityCount: 1,
    }),
    db.doc(`battles/${battleId}/category_stats/${categoryId}`).set({
      totalDistanceKm: km, avgDistanceKm: km, participantCount: 1,
    }),
  ]));

  await finishBattle(battleId);

  const finished = await db.doc(`battles/${battleId}`).get();
  assert.equal(finished.data()!['status'], 'finished', 'バトルがfinishedになる');
  assert.ok(finished.data()!['titlesAwardedAt'], '称号確定時刻が入る');

  const [firstAfter, secondAfter, thirdAfter] = await Promise.all([
    db.doc(`users/${first.uid}`).get(),
    db.doc(`users/${second.uid}`).get(),
    db.doc(`users/${third.uid}`).get(),
  ]);
  const firstTitles = (firstAfter.data()!['titles'] as Array<Record<string, unknown>> | undefined) ?? [];
  const secondTitles = (secondAfter.data()!['titles'] as Array<Record<string, unknown>> | undefined) ?? [];
  const thirdTitles = (thirdAfter.data()!['titles'] as Array<Record<string, unknown>> | undefined) ?? [];

  assert.equal(firstTitles.length, 1, '1位チームへ称号が付く');
  assert.equal(firstTitles[0]!['rank'], 1);
  assert.equal(firstTitles[0]!['teamName'], '1位チーム', '称号へチーム表示名が入る');
  assert.equal(firstTitles[0]!['battleTitle'], '終了処理テスト');

  assert.equal(secondTitles.length, 1, '2位チームへも称号が付く（上位2陣営が対象）');
  assert.equal(secondTitles[0]!['rank'], 2);

  assert.equal(thirdTitles.length, 0, '3位チームへは称号が付かない');

  // 参加者全員へ終了通知が作られる（3位も含む）。
  const endedNotifications = await Promise.all(members.map(async ([uid]) => {
    const snap = await db.collection(`users/${uid}/notifications`).where('type', '==', 'battle_ended').get();
    return snap.size;
  }));
  assert.deepEqual(endedNotifications, [1, 1, 1], '参加者全員へ終了通知が1件ずつ作られる');

  // 二重実行しても称号も終了通知も増えない。
  await finishBattle(battleId);
  const firstAgain = await db.doc(`users/${first.uid}`).get();
  assert.deepEqual(firstAgain.data()!['titles'], firstTitles, '再実行で称号が重複しない');
  const notificationsAgain = await db.collection(`users/${first.uid}/notifications`)
    .where('type', '==', 'battle_ended').get();
  assert.equal(notificationsAgain.size, 1, '再実行で終了通知が二重送信されない');

  console.log('  ✓ シナリオ4: 終了確定・上位2陣営のみ称号・3位は対象外・全員へ終了通知・再実行で重複なし');
}

// ── 参加制約（joinBattle / leaveBattle） ────────────────────────────
async function scenarioParticipationLimits(): Promise<void> {
  const user = await createAuthUser(`e2e-join-${Date.now()}@example.com`);
  await seedUser(user.uid, '参加テスト');
  const now = Date.now();

  const battleIds = ['a', 'b', 'c'].map((suffix) => `e2e-join-battle-${suffix}-${Date.now()}`);
  await Promise.all(battleIds.map((battleId) => db.doc(`battles/${battleId}`).set({
    type: 'public',
    status: 'active',
    title: `参加テスト ${battleId}`,
    rankingType: 'total',
    startAt: Timestamp.fromMillis(now - 86_400_000),
    endAt: Timestamp.fromMillis(now + 86_400_000),
    categories: [{ id: 'team-a', label: 'Aチーム' }, { id: 'team-b', label: 'Bチーム' }],
  })));

  const first = await callFunction('joinBattle', user.idToken, { battleId: battleIds[0], categoryId: 'team-a' });
  assert.ok(first.ok, `1件目の参加に失敗: ${JSON.stringify(first)}`);
  const second = await callFunction('joinBattle', user.idToken, { battleId: battleIds[1], categoryId: 'team-a' });
  assert.ok(second.ok, `2件目の参加に失敗: ${JSON.stringify(second)}`);

  // 3件目は最大2件の制約で拒否される。
  const third = await callFunction('joinBattle', user.idToken, { battleId: battleIds[2], categoryId: 'team-a' });
  assert.equal(third.ok, false, '3件目の参加が拒否されない');

  const afterJoin = await db.doc(`users/${user.uid}`).get();
  assert.equal((afterJoin.data()!['battleIds'] as string[]).length, 2, '参加中は最大2件');

  // 距離0なら退出できる。
  const leave = await callFunction('leaveBattle', user.idToken, { battleId: battleIds[1] });
  assert.ok(leave.ok, `退出に失敗: ${JSON.stringify(leave)}`);
  const afterLeave = await db.doc(`users/${user.uid}`).get();
  assert.equal((afterLeave.data()!['battleIds'] as string[]).length, 1, '退出後は1件');

  // 距離を記録した後は退出できない。
  await db.doc(`battles/${battleIds[0]}/participants/${user.uid}`).update({ totalDistanceKm: 1.5 });
  const leaveAfterRun = await callFunction('leaveBattle', user.idToken, { battleId: battleIds[0] });
  assert.equal(leaveAfterRun.ok, false, '記録済みでも退出できてしまう');

  console.log('  ✓ 参加制約: 最大2件・距離0なら退出可・記録後は退出不可');
}

// ── シナリオ7: アカウント削除の清掃 ─────────────────────────────────
async function scenarioAccountDeletion(): Promise<void> {
  const victim = await createAuthUser(`e2e-delete-${Date.now()}@example.com`);
  await seedUser(victim.uid, '削除される人');
  await db.doc(`publicProfiles/${victim.uid}`).set({ name: '削除される人' });

  const battleId = `e2e-delete-battle-${Date.now()}`;
  const activityId = `e2e-delete-activity-${Date.now()}`;
  const now = Date.now();
  await Promise.all([
    db.doc(`battles/${battleId}`).set({
      type: 'public',
      status: 'active',
      title: '削除テスト',
      rankingType: 'total',
      startAt: Timestamp.fromMillis(now - 86_400_000),
      endAt: Timestamp.fromMillis(now + 86_400_000),
      categories: [{ id: 'team-a', label: 'Aチーム' }, { id: 'team-b', label: 'Bチーム' }],
    }),
    db.doc(`battles/${battleId}/participants/${victim.uid}`).set({ userId: victim.uid, categoryId: 'team-a' }),
    db.doc(`activities/${activityId}`).set({
      userId: victim.uid,
      distanceKm: 2,
      durationSeconds: 900,
      battleIds: [battleId],
      startedAt: Timestamp.now(),
      submittedAt: Timestamp.now(),
      aggregated: true,
    }),
    db.doc(`users/${victim.uid}/notifications/n1`).set({ type: 'reaction', title: 'x', body: 'y', isRead: false }),
    db.doc(`users/${victim.uid}/monthlyStats/2026-08`).set({ km: 2, count: 1, durationSec: 900, elevationM: 0 }),
    db.doc(`users/${victim.uid}/badges/first_step`).set({ name: 'はじめの一歩' }),
  ]);

  await getAuth().deleteUser(victim.uid);

  await waitFor('アカウント削除の清掃', async () => {
    const [user, profile, activity] = await Promise.all([
      db.doc(`users/${victim.uid}`).get(),
      db.doc(`publicProfiles/${victim.uid}`).get(),
      db.doc(`activities/${activityId}`).get(),
    ]);
    return (!user.exists && !profile.exists && !activity.exists) ? true : null;
  }, 45_000);

  const [notifications, monthly, badges, participant] = await Promise.all([
    db.collection(`users/${victim.uid}/notifications`).get(),
    db.collection(`users/${victim.uid}/monthlyStats`).get(),
    db.collection(`users/${victim.uid}/badges`).get(),
    db.doc(`battles/${battleId}/participants/${victim.uid}`).get(),
  ]);
  assert.equal(notifications.size, 0, '通知が残っている');
  assert.equal(monthly.size, 0, '月次統計が残っている');
  assert.equal(badges.size, 0, 'バッジが残っている');
  assert.equal(participant.exists, false, 'チャレンジのparticipantが残っている');

  console.log('  ✓ シナリオ7: users/publicProfiles/活動/通知/月次/バッジ/participantを削除');
}

async function main(): Promise<void> {
  await scenarioReactionNotification();
  await scenarioRankChangeNotification();
  await scenarioBattleFinish();
  await scenarioParticipationLimits();
  await scenarioAccountDeletion();
  console.log('release scenario e2e tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
