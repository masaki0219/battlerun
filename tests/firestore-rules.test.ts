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
  deleteField, doc, setDoc, updateDoc, addDoc, deleteDoc, collection, Timestamp, getDoc,
  getDocs, query, where, orderBy, serverTimestamp,
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
    await setDoc(doc(db, 'battles/battle1'), {
      type: 'private', status: 'active', createdBy: 'alice', title: 'test', description: '',
      categories: [{ id: 'teamA', label: 'A' }, { id: 'teamB', label: 'B' }],
      categoryIds: ['teamA', 'teamB'], rankingType: 'total', startAt: Timestamp.now(),
      endAt: Timestamp.fromMillis(Date.now() + 86400000), inviteCode: 'ABC123', seasonId: null,
    });
    await setDoc(doc(db, 'battles/battle2'), {
      type: 'public', status: 'active', createdBy: 'admin', title: 'public', description: '',
      categories: [{ id: 'teamA', label: 'A' }, { id: 'teamB', label: 'B' }],
      categoryIds: ['teamA', 'teamB'], rankingType: 'total', startAt: Timestamp.now(),
      endAt: Timestamp.fromMillis(Date.now() + 86400000), inviteCode: null, seasonId: null,
    });
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
    await setDoc(doc(db, 'battles/battle1/participants/carol'), {
      userId: 'carol', categoryId: 'teamA', totalDistanceKm: 0, activityCount: 0,
    });

    // alice の既存アクティビティ（update/delete拒否確認用）
    await setDoc(doc(db, 'activities/act1'), {
      userId: 'alice',
      visibility: 'public',
      distanceKm: 5,
      battleIds: ['battle1'],
      startedAt: Timestamp.now(),
      endedAt: Timestamp.now(),
      route: [{ lat: 35, lng: 139, timestamp: Date.now() }],
    });

    // alice のユーザードキュメント（plan/role/titles自己変更拒否確認用）
    await setDoc(doc(db, 'users/alice'), {
      name: 'Alice',
      avatarUrl: null,
      plan: 'free',
      role: 'user',
      titles: [],
    });
    await setDoc(doc(db, 'users/bob'), { name: 'Bob', plan: 'free', role: 'user', titles: [] });
    await setDoc(doc(db, 'users/adminUser'), { name: 'Admin', plan: 'free', role: 'admin', titles: [] });
    await setDoc(doc(db, 'users/carol'), {
      name: 'Carol', plan: 'free', role: 'user', titles: [], runningPresenceVisible: true,
    });
    await setDoc(doc(db, 'publicProfiles/alice'), { name: 'Alice', avatarUrl: null, avatarEmoji: null, updatedAt: Timestamp.now() });
    await setDoc(doc(db, 'publicProfiles/carol'), { name: 'Carol', avatarEmoji: null, updatedAt: Timestamp.now() });
    await setDoc(doc(db, 'activities/publicAct'), {
      userId: 'alice', visibility: 'public_v2', distanceKm: 2, battleIds: ['battle1'],
      startedAt: Timestamp.now(), endedAt: Timestamp.now(), durationSeconds: 1200,
    });
    await setDoc(doc(db, 'users/alice/badges/first_run'), { badgeId: 'first_run', name: 'はじめの一歩' });
    await setDoc(doc(db, 'users/alice/monthlyStats/2026-07'), {
      km: 12.5, count: 3, durationSec: 5400, elevationM: 120,
    });
    await setDoc(doc(db, 'battles/battle1/presence/carol'), {
      sessionId: 'carol-stale-session',
      startedAt: Timestamp.fromMillis(Date.now() - 10 * 60_000),
      lastBeatAt: Timestamp.fromMillis(Date.now() - 4 * 60_000),
      visible: true,
    });
    await setDoc(doc(db, 'battles/battle1/declarations/alice_20990106'), {
      uid: 'alice', dateKey: '20990106',
      plannedAt: Timestamp.fromMillis(Date.now() - 3_600_000),
      note: '過ぎた予定', status: 'planned', createdAt: Timestamp.now(),
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
  const bobDb = testEnv.authenticatedContext('bob').firestore();
  const adminDb = testEnv.authenticatedContext('adminUser').firestore();
  const carolDb = testEnv.authenticatedContext('carol').firestore();
  const daveDb = testEnv.authenticatedContext('dave').firestore();

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
    'category_stats: 作成者によるゼロ値の新規作成は許可',
    setDoc(doc(aliceDb, 'battles/battle1/category_stats/teamB'), {
      totalDistanceKm: 0, avgDistanceKm: 0, participantCount: 0,
    }),
    'succeed',
  );
  await check(
    'category_stats: 非ゼロ値での新規作成は拒否',
    setDoc(doc(aliceDb, 'battles/battle1/category_stats/teamC'), {
      totalDistanceKm: 5, avgDistanceKm: 5, participantCount: 0,
    }),
    'fail',
  );
  await check(
    'category_stats: participantCount非ゼロでの新規作成は拒否',
    setDoc(doc(aliceDb, 'battles/battle1/category_stats/teamD'), {
      totalDistanceKm: 0, avgDistanceKm: 0, participantCount: 1,
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
    'participants: 本人の直接参加は拒否（Callable Functionのみ）',
    setDoc(doc(aliceDb, 'battles/battle2/participants/alice'), {
      userId: 'alice', categoryId: 'teamA', totalDistanceKm: 0, activityCount: 0,
    }),
    'fail',
  );
  await check(
    'participants: 歩数チャレンジの日次加算値を新規参加時に自己設定できない',
    setDoc(doc(bobDb, 'battles/battle2/participants/bob'), {
      userId: 'bob', categoryId: 'teamA', totalDistanceKm: 0, activityCount: 0,
      stepCreditKmByDay: { '20260720': 5 },
    }),
    'fail',
  );
  await check(
    'participants: totalDistanceKmの自己更新は拒否',
    updateDoc(doc(aliceDb, 'battles/battle1/participants/alice'), { totalDistanceKm: 100 }),
    'fail',
  );
  await check(
    'participants: 歩数チャレンジの日次加算値の自己更新は拒否',
    updateDoc(doc(aliceDb, 'battles/battle1/participants/alice'), {
      stepCreditKmByDay: { '20260720': 5 },
    }),
    'fail',
  );
  await check(
    'participants: categoryIdのみでも直接更新は拒否（Callable Functionのみ）',
    updateDoc(doc(aliceDb, 'battles/battle1/participants/alice'), { categoryId: 'teamB' }),
    'fail',
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
    'activities: クライアントからの新規作成は拒否（Callableのみ）',
    addDoc(collection(aliceDb, 'activities'), {
      userId: 'alice', distanceKm: 3, battleIds: ['battle1'],
      startedAt: Timestamp.now(), endedAt: Timestamp.now(),
    }),
    'fail',
  );
  await check(
    'activities: 既存ドキュメントのupdateは拒否',
    updateDoc(doc(aliceDb, 'activities/act1'), { distanceKm: 999 }),
    'fail',
  );

  await check(
    'activities: 本人はGPSルートを含む旧形式を読める',
    getDoc(doc(aliceDb, 'activities/act1')),
    'succeed',
  );
  await check(
    'activities: 他人はGPSルートを含む活動を読めない',
    getDoc(doc(bobDb, 'activities/act1')),
    'fail',
  );
  await check(
    'activities: 他人でもrouteのない公開活動は読める',
    getDoc(doc(bobDb, 'activities/publicAct')),
    'succeed',
  );
  await check(
    'activities: 既存ドキュメントのdeleteは拒否',
    deleteDoc(doc(aliceDb, 'activities/act1')),
    'fail',
  );
  await check(
    'users/{uid}: 他人の非公開ユーザードキュメントは読めない',
    getDoc(doc(bobDb, 'users/alice')),
    'fail',
  );
  await check(
    'publicProfiles: 認証済みユーザーは公開プロフィールを読める',
    getDoc(doc(bobDb, 'publicProfiles/alice')),
    'succeed',
  );
  await check(
    'users/{uid}: 明白な嫌がらせ表現を含むニックネームは拒否',
    updateDoc(doc(aliceDb, 'users/alice'), { name: '消えろ' }),
    'fail',
  );
  await check(
    'users/{uid}: アプリ内アバターアイコンは更新できる',
    updateDoc(doc(aliceDb, 'users/alice'), { avatarEmoji: '🐶' }),
    'succeed',
  );
  await check(
    'users/{uid}: アプリ外のアイコンは拒否',
    updateDoc(doc(aliceDb, 'users/alice'), { avatarEmoji: '📷' }),
    'fail',
  );
  await check(
    'users/{uid}: 写真URLは拒否',
    updateDoc(doc(aliceDb, 'users/alice'), { avatarUrl: 'https://example.com/avatar.jpg' }),
    'fail',
  );
  await check(
    'users/{uid}: 旧写真URLフィールドは削除できる',
    updateDoc(doc(aliceDb, 'users/alice'), { avatarUrl: deleteField() }),
    'succeed',
  );
  await check(
    'publicProfiles: 明白な嫌がらせ表現を含む公開名は拒否',
    updateDoc(doc(aliceDb, 'publicProfiles/alice'), { name: '殺すぞ' }),
    'fail',
  );
  await check(
    'publicProfiles: アプリ内アバターアイコンは更新できる',
    updateDoc(doc(aliceDb, 'publicProfiles/alice'), { avatarEmoji: '🐱' }),
    'succeed',
  );
  await check(
    'publicProfiles: アプリ外のアイコンは拒否',
    updateDoc(doc(aliceDb, 'publicProfiles/alice'), { avatarEmoji: '📷' }),
    'fail',
  );
  await check(
    'publicProfiles: 写真URLは拒否',
    updateDoc(doc(aliceDb, 'publicProfiles/alice'), { avatarUrl: 'https://example.com/avatar.jpg' }),
    'fail',
  );
  await check(
    'publicProfiles: 旧写真URLフィールドは削除できる',
    updateDoc(doc(aliceDb, 'publicProfiles/alice'), { avatarUrl: deleteField() }),
    'succeed',
  );
  await check(
    'battles: 不適切な説明の作成はサーバールールで拒否',
    setDoc(doc(adminDb, 'battles/unsafeBattle'), {
      type: 'public', seasonId: null, title: '安全なタイトル', description: '消えろ',
      categories: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      categoryIds: ['a', 'b'], rankingType: 'total', startAt: Timestamp.now(),
      endAt: Timestamp.fromMillis(Date.now() + 86400000), status: 'active',
      createdBy: 'adminUser', inviteCode: null, createdAt: Timestamp.now(),
    }),
    'fail',
  );
  await check(
    'private battle: 作成者でもtypeをpublicへ変更できない',
    updateDoc(doc(aliceDb, 'battles/battle1'), { type: 'public' }),
    'fail',
  );

  // ── battles の get / list ─────────────────────────────────────────
  await check(
    'battles list: adminは全チャレンジを絞り込みなしで一覧できる（管理画面）',
    getDocs(query(collection(adminDb, 'battles'), orderBy('startAt', 'desc'))),
    'succeed',
  );
  await check(
    'battles list: 認証済みユーザーはtype==publicの絞り込み付きで一覧できる（ホーム）',
    getDocs(query(
      collection(bobDb, 'battles'),
      where('type', '==', 'public'),
      where('status', '==', 'active'),
    )),
    'succeed',
  );
  await check(
    'battles list: 非adminの絞り込みなし一覧は拒否',
    getDocs(query(collection(bobDb, 'battles'), orderBy('startAt', 'desc'))),
    'fail',
  );
  await check(
    'battles get: 参加者はprivateチャレンジを単品取得できる',
    getDoc(doc(aliceDb, 'battles/battle1')),
    'succeed',
  );
  await check(
    'battles get: 非参加者はprivateチャレンジを単品取得できない',
    getDoc(doc(bobDb, 'battles/battle1')),
    'fail',
  );

  // ── declarations / cheers ───────────────────────────────────────
  const declarationPath = 'battles/battle1/declarations/alice_20990101';
  await check(
    'declarations: 宣言時刻を過ぎたplanned宣言でも本人はひとことを変更できる',
    updateDoc(doc(aliceDb, 'battles/battle1/declarations/alice_20990106'), {
      note: 'あとで走る',
    }),
    'succeed',
  );
  await check(
    'declarations: 参加者本人は当日IDで宣言を作成できる',
    setDoc(doc(aliceDb, declarationPath), {
      uid: 'alice', dateKey: '20990101', plannedAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      timezone: 'Asia/Tokyo', note: 'ゆっくり走る', status: 'planned', createdAt: Timestamp.now(),
    }),
    'succeed',
  );
  await check(
    'declarations: 本人以外のuidで宣言作成は拒否',
    setDoc(doc(carolDb, 'battles/battle1/declarations/alice_20990102'), {
      uid: 'alice', dateKey: '20990102', plannedAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      status: 'planned', createdAt: Timestamp.now(),
    }),
    'fail',
  );
  await check(
    'declarations: 不適切なひとことはサーバールールで拒否',
    setDoc(doc(aliceDb, 'battles/battle1/declarations/alice_20990104'), {
      uid: 'alice', dateKey: '20990104', plannedAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      note: '死ね', status: 'planned', createdAt: Timestamp.now(),
    }),
    'fail',
  );
  await check(
    'declarations: 参加者は宣言を読める',
    getDoc(doc(carolDb, declarationPath)),
    'succeed',
  );
  await check(
    'declarations: 非参加者は宣言を読めない',
    getDoc(doc(bobDb, declarationPath)),
    'fail',
  );
  await check(
    'declaration cheers: 参加者は自分のuidで応援できる',
    setDoc(doc(carolDb, `${declarationPath}/cheers/carol`), {
      fromUid: 'carol', createdAt: Timestamp.now(),
    }),
    'succeed',
  );
  await check(
    'declaration cheers: 同じ宣言への重複応援は拒否',
    setDoc(doc(carolDb, `${declarationPath}/cheers/carol`), {
      fromUid: 'carol', createdAt: Timestamp.now(),
    }),
    'fail',
  );
  await check(
    'declaration cheers: 非参加者のなりすまし応援は拒否',
    setDoc(doc(bobDb, `${declarationPath}/cheers/carol_spoof`), {
      fromUid: 'carol', createdAt: Timestamp.now(),
    }),
    'fail',
  );
  await check(
    'declaration cheers: 自分自身への応援は拒否',
    setDoc(doc(aliceDb, `${declarationPath}/cheers/alice`), {
      fromUid: 'alice', createdAt: Timestamp.now(),
    }),
    'fail',
  );
  await check(
    'declarations: 他の参加者によるdone更新は拒否',
    updateDoc(doc(carolDb, declarationPath), { status: 'done' }),
    'fail',
  );
  await check(
    'declarations: 本人はplannedをdoneへ更新できる',
    updateDoc(doc(aliceDb, declarationPath), { status: 'done' }),
    'succeed',
  );
  await check(
    'declarations: done宣言の時刻変更は拒否',
    updateDoc(doc(aliceDb, declarationPath), {
      plannedAt: Timestamp.fromMillis(Date.now() + 7_200_000),
    }),
    'fail',
  );
  await check(
    'declarations: done宣言の取り消しは拒否',
    updateDoc(doc(aliceDb, declarationPath), { status: 'cancelled' }),
    'fail',
  );

  const editableDeclarationPath = 'battles/battle1/declarations/alice_20990103';
  await check(
    'declarations: 編集テスト用planned宣言を作成できる',
    setDoc(doc(aliceDb, editableDeclarationPath), {
      uid: 'alice', dateKey: '20990103', timezone: 'Asia/Tokyo',
      plannedAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      note: '最初の予定', status: 'planned', createdAt: Timestamp.now(),
    }),
    'succeed',
  );
  await check(
    'declarations: 本人はplanned宣言の時刻とひとことを変更できる',
    updateDoc(doc(aliceDb, editableDeclarationPath), {
      plannedAt: Timestamp.fromMillis(Date.now() + 7_200_000),
      note: '変更後の予定',
    }),
    'succeed',
  );
  await check(
    'declarations: 他の参加者はplanned宣言を編集できない',
    updateDoc(doc(carolDb, editableDeclarationPath), { note: '他人の変更' }),
    'fail',
  );
  await check(
    'declarations: 許可していないフィールドの変更は拒否',
    updateDoc(doc(aliceDb, editableDeclarationPath), { cheerCount: 999 }),
    'fail',
  );
  await check(
    'declaration cheers: 取り消し前の宣言へ応援できる',
    setDoc(doc(carolDb, `${editableDeclarationPath}/cheers/carol`), {
      fromUid: 'carol', createdAt: Timestamp.now(),
    }),
    'succeed',
  );
  await check(
    'declarations: 本人はplanned宣言を取り消せる',
    updateDoc(doc(aliceDb, editableDeclarationPath), { status: 'cancelled' }),
    'succeed',
  );
  await check(
    'declarations: cancelled宣言をdoneへ変更できない',
    updateDoc(doc(aliceDb, editableDeclarationPath), { status: 'done' }),
    'fail',
  );
  await check(
    'declaration cheers: cancelled宣言への応援は拒否',
    setDoc(doc(carolDb, `${editableDeclarationPath}/cheers/carol`), {
      fromUid: 'carol', createdAt: Timestamp.now(),
    }),
    'fail',
  );
  await check(
    'declaration cheers: 取り消した宣言の所有者は再宣言前に旧応援を削除できる',
    deleteDoc(doc(aliceDb, `${editableDeclarationPath}/cheers/carol`)),
    'succeed',
  );
  await check(
    'declarations: 取り消し後も同日中に新しい予定として再宣言できる',
    setDoc(doc(aliceDb, editableDeclarationPath), {
      uid: 'alice', dateKey: '20990103', timezone: 'Asia/Tokyo',
      plannedAt: Timestamp.fromMillis(Date.now() + 5_400_000),
      note: '再宣言', status: 'planned', createdAt: Timestamp.now(),
    }),
    'succeed',
  );
  await check(
    'declaration cheers: 再宣言後は同じメンバーが改めて応援できる',
    setDoc(doc(carolDb, `${editableDeclarationPath}/cheers/carol`), {
      fromUid: 'carol', createdAt: Timestamp.now(),
    }),
    'succeed',
  );

  // ── live presence / cheers ──────────────────────────────────────
  const alicePresencePath = 'battles/battle1/presence/alice';
  const alicePresenceSession = '2026-07-20T01:00:00.000Z';
  await check(
    'presence: opt-in前は本人でも走行中を公開できない',
    setDoc(doc(aliceDb, alicePresencePath), {
      sessionId: alicePresenceSession,
      startedAt: Timestamp.now(), lastBeatAt: serverTimestamp(), visible: true,
    }),
    'fail',
  );
  await check(
    'presence setting: 本人は走行中公開をopt-inできる',
    updateDoc(doc(aliceDb, 'users/alice'), { runningPresenceVisible: true }),
    'succeed',
  );
  await check(
    'presence: opt-inした参加者本人は位置情報なしの心拍を作成できる',
    setDoc(doc(aliceDb, alicePresencePath), {
      sessionId: alicePresenceSession,
      startedAt: Timestamp.now(), lastBeatAt: serverTimestamp(), visible: true,
    }),
    'succeed',
  );
  await check(
    'presence: 同じチャレンジの参加者は走行中を読める',
    getDoc(doc(carolDb, alicePresencePath)),
    'succeed',
  );
  await check(
    'presence: 非参加者は走行中を読めない',
    getDoc(doc(bobDb, alicePresencePath)),
    'fail',
  );
  await check(
    'presence: 位置情報を含む更新は拒否',
    setDoc(doc(aliceDb, alicePresencePath), {
      sessionId: alicePresenceSession,
      startedAt: Timestamp.now(), lastBeatAt: serverTimestamp(), visible: true,
      lat: 35, lng: 139,
    }),
    'fail',
  );
  await check(
    'presence cheers: 参加者は新しいランへ1回応援できる',
    setDoc(doc(carolDb, `${alicePresencePath}/cheers/carol`), {
      fromUid: 'carol', sessionId: alicePresenceSession, createdAt: serverTimestamp(),
    }),
    'succeed',
  );
  await check(
    'presence cheers: 同じランへの同じ人の再応援は拒否',
    setDoc(doc(carolDb, `${alicePresencePath}/cheers/carol`), {
      fromUid: 'carol', sessionId: alicePresenceSession, createdAt: serverTimestamp(),
    }),
    'fail',
  );
  await check(
    'presence cheers: 自分自身への応援は拒否',
    setDoc(doc(aliceDb, `${alicePresencePath}/cheers/alice`), {
      fromUid: 'alice', sessionId: alicePresenceSession, createdAt: serverTimestamp(),
    }),
    'fail',
  );
  await check(
    'presence cheers: 3分より古い走行状態への応援は拒否',
    setDoc(doc(aliceDb, 'battles/battle1/presence/carol/cheers/alice'), {
      fromUid: 'alice', sessionId: 'carol-stale-session', createdAt: serverTimestamp(),
    }),
    'fail',
  );
  await check(
    'presence cheers: 非参加者の応援は拒否',
    setDoc(doc(bobDb, `${alicePresencePath}/cheers/bob`), {
      fromUid: 'bob', sessionId: alicePresenceSession, createdAt: serverTimestamp(),
    }),
    'fail',
  );
  const nextPresenceSession = '2026-07-20T02:00:00.000Z';
  await check(
    'presence: 次のラン開始時は同じ文書を新しいセッションへ更新できる',
    setDoc(doc(aliceDb, alicePresencePath), {
      sessionId: nextPresenceSession,
      startedAt: Timestamp.now(), lastBeatAt: serverTimestamp(), visible: true,
    }),
    'succeed',
  );
  await check(
    'presence cheers: 同じ人でも次のランには再び1回応援できる',
    setDoc(doc(carolDb, `${alicePresencePath}/cheers/carol`), {
      fromUid: 'carol', sessionId: nextPresenceSession, createdAt: serverTimestamp(),
    }),
    'succeed',
  );
  await check(
    'presence setting: opt-out後も本人は現在の表示を即時OFFにできる',
    updateDoc(doc(aliceDb, 'users/alice'), { runningPresenceVisible: false }),
    'succeed',
  );
  await check(
    'presence: opt-out後の非表示更新は許可',
    setDoc(doc(aliceDb, alicePresencePath), {
      visible: false, lastBeatAt: serverTimestamp(),
    }, { merge: true }),
    'succeed',
  );
  await check(
    'presence: opt-out中の再公開は拒否',
    setDoc(doc(aliceDb, alicePresencePath), {
      sessionId: alicePresenceSession,
      startedAt: Timestamp.now(), lastBeatAt: serverTimestamp(), visible: true,
    }),
    'fail',
  );
  await check(
    'presence setting: boolean以外の公開設定は拒否',
    updateDoc(doc(aliceDb, 'users/alice'), { runningPresenceVisible: 'yes' }),
    'fail',
  );

  // ── user blocks / blocked interactions ─────────────────────────
  await check(
    'blocks: 本人は他ユーザーをブロックできる',
    setDoc(doc(aliceDb, 'users/alice/blocks/carol'), {
      blockerUid: 'alice', blockedUid: 'carol', displayName: 'Carol', createdAt: serverTimestamp(),
    }),
    'succeed',
  );
  await check(
    'blocks: 本人は自分のブロック一覧を読める',
    getDoc(doc(aliceDb, 'users/alice/blocks/carol')),
    'succeed',
  );
  await check(
    'blocks: 他人はブロック関係を読めない',
    getDoc(doc(bobDb, 'users/alice/blocks/carol')),
    'fail',
  );
  await check(
    'blocks: 他人のブロック文書は作成できない',
    setDoc(doc(bobDb, 'users/alice/blocks/bob'), {
      blockerUid: 'alice', blockedUid: 'bob', displayName: 'Bob', createdAt: serverTimestamp(),
    }),
    'fail',
  );
  const blockedDeclarationPath = 'battles/battle1/declarations/alice_20990105';
  await check(
    'blocks: ブロック確認用の宣言を本人は作成できる',
    setDoc(doc(aliceDb, blockedDeclarationPath), {
      uid: 'alice', dateKey: '20990105', plannedAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      note: '走ります', status: 'planned', createdAt: Timestamp.now(),
    }),
    'succeed',
  );
  await check(
    'blocks: ブロック関係にある相手は宣言へ応援できない',
    setDoc(doc(carolDb, `${blockedDeclarationPath}/cheers/carol`), {
      fromUid: 'carol', createdAt: Timestamp.now(),
    }),
    'fail',
  );
  await check(
    'blocks: ブロック関係にある相手は公開記録へリアクションできない',
    setDoc(doc(carolDb, 'activities/publicAct/reactions/carol'), {
      userId: 'carol', type: '🔥', createdAt: serverTimestamp(),
    }),
    'fail',
  );
  await check(
    'blocks: 本人はブロックを解除できる',
    deleteDoc(doc(aliceDb, 'users/alice/blocks/carol')),
    'succeed',
  );
  await check(
    'blocks: 解除後は公開記録へリアクションできる',
    setDoc(doc(carolDb, 'activities/publicAct/reactions/carol'), {
      userId: 'carol', type: '🔥', createdAt: serverTimestamp(),
    }),
    'succeed',
  );

  // ── content reports ─────────────────────────────────────────────
  const reportPath = 'contentReports/report1';
  await check(
    'contentReports: 認証ユーザーは検証済み形式で通報できる',
    setDoc(doc(carolDb, reportPath), {
      reporterUid: 'carol', targetType: 'declaration', targetId: 'alice_20990101',
      targetUid: 'alice', battleId: 'battle1', contentSnapshot: '通報対象',
      reason: 'harassment', details: '確認してください', status: 'pending',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }),
    'succeed',
  );
  await check(
    'contentReports: 通報者本人にも内部レポートは公開しない',
    getDoc(doc(carolDb, reportPath)),
    'fail',
  );
  await check(
    'contentReports: reporterUidのなりすましは拒否',
    setDoc(doc(bobDb, 'contentReports/spoof'), {
      reporterUid: 'alice', targetType: 'user', targetId: 'alice', reason: 'spam',
      status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }),
    'fail',
  );
  await check(
    'contentReports: 管理者は通報を読める',
    getDoc(doc(adminDb, reportPath)),
    'succeed',
  );
  await check(
    'contentReports: 一般ユーザーは処理状態を変更できない',
    updateDoc(doc(carolDb, reportPath), { status: 'resolved' }),
    'fail',
  );
  await check(
    'contentReports: 管理者は監査情報付きで処理状態を更新できる',
    updateDoc(doc(adminDb, reportPath), {
      status: 'reviewing', reviewedBy: 'adminUser', reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }),
    'succeed',
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
    'users/{uid}: personalRecordsの自己更新は拒否（Cloud Functionsのみ更新可）',
    updateDoc(doc(aliceDb, 'users/alice'), {
      personalRecords: { fastest1kSec: 1, longestRunKm: 999 },
    }),
    'fail',
  );
  await check(
    'users/{uid}: battleIdsの自己更新は拒否（Callable Functionのみ更新可）',
    updateDoc(doc(aliceDb, 'users/alice'), { battleIds: ['battle1', 'battle2', 'battle3'] }),
    'fail',
  );
  await check(
    'users/{uid}: 新規登録時のpersonalRecords自己設定は拒否',
    setDoc(doc(daveDb, 'users/dave'), {
      name: 'Dave', plan: 'free', personalRecords: { fastest1kSec: 1 },
    }),
    'fail',
  );
  await check(
    'users/{uid}: 新規登録時のbattleIds自己設定は拒否',
    setDoc(doc(daveDb, 'users/dave'), {
      name: 'Dave', plan: 'free', battleIds: ['battle1', 'battle2', 'battle3'],
    }),
    'fail',
  );
  await check(
    'users/{uid}: 新規登録時の月次バックフィル済み偽装は拒否',
    setDoc(doc(daveDb, 'users/dave'), {
      name: 'Dave', plan: 'free', monthlyStatsBackfillVersion: 1,
    }),
    'fail',
  );
  await check(
    'users/{uid}: personalRecordsなしの通常登録は許可',
    setDoc(doc(daveDb, 'users/dave'), { name: 'Dave', plan: 'free' }),
    'succeed',
  );
  await check(
    'badges: 本人はサーバー付与済みバッジを読める',
    getDoc(doc(aliceDb, 'users/alice/badges/first_run')),
    'succeed',
  );
  await check(
    'badges: 本人でもバッジを自己付与できない',
    setDoc(doc(aliceDb, 'users/alice/badges/fake'), { name: 'fake' }),
    'fail',
  );
  await check(
    'monthlyStats: 本人は月間集計を読める',
    getDoc(doc(aliceDb, 'users/alice/monthlyStats/2026-07')),
    'succeed',
  );
  await check(
    'monthlyStats: 他人の月間集計は読めない',
    getDoc(doc(bobDb, 'users/alice/monthlyStats/2026-07')),
    'fail',
  );
  await check(
    'monthlyStats: 本人でも月間集計を書き換えられない',
    setDoc(doc(aliceDb, 'users/alice/monthlyStats/2026-07'), { km: 999 }, { merge: true }),
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
  await check(
    'users/{uid}: 本人は距離の週間目標を設定できる',
    updateDoc(doc(aliceDb, 'users/alice'), { weeklyGoal: { type: 'distance', value: 10 } }),
    'succeed',
  );
  await check(
    'users/{uid}: 本人は日数の週間目標を設定できる',
    updateDoc(doc(aliceDb, 'users/alice'), { weeklyGoal: { type: 'days', value: 3 } }),
    'succeed',
  );
  await check(
    'users/{uid}: 本人は週間目標を解除できる',
    updateDoc(doc(aliceDb, 'users/alice'), { weeklyGoal: null }),
    'succeed',
  );
  await check(
    'users/{uid}: 8日以上の日数目標は拒否',
    updateDoc(doc(aliceDb, 'users/alice'), { weeklyGoal: { type: 'days', value: 8 } }),
    'fail',
  );
  await check(
    'users/{uid}: 小数の日数目標は拒否',
    updateDoc(doc(aliceDb, 'users/alice'), { weeklyGoal: { type: 'days', value: 2.5 } }),
    'fail',
  );
  await check(
    'users/{uid}: 他人の週間目標更新は拒否',
    updateDoc(doc(bobDb, 'users/alice'), { weeklyGoal: { type: 'distance', value: 10 } }),
    'fail',
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
