/**
 * 記録反映のフルE2E。
 *
 * Firestore / Auth / Functions エミュレータを同時に起動し、実際にデプロイされる形の
 * Callable `submitActivity` をHTTPで呼んで、以下が最後まで通ることを確認する。
 *
 *   端末のGPS点列 → submitActivity（サーバー側の距離再計算）→ activities作成
 *   → aggregateActivityトリガー → チャレンジのチーム距離・順位・participant
 *   → 個人累計・月次統計・自己ベスト
 *
 * 既存の activityAggregation.integration.ts は集計関数を直接呼ぶためCallableと
 * トリガー配線を通らない。ここはその手前から通す。
 *
 * 実行: npm run test:e2e
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const functionsRequire = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp } = functionsRequire('firebase-admin/app') as typeof import('firebase-admin/app');
const adminFirestore = functionsRequire('firebase-admin/firestore') as typeof import('firebase-admin/firestore');
const { getFirestore, Timestamp } = adminFirestore;

const PROJECT_ID = process.env['GCLOUD_PROJECT'] ?? 'demo-zelio';
const AUTH_HOST = process.env['FIREBASE_AUTH_EMULATOR_HOST'] ?? '127.0.0.1:9099';
const FUNCTIONS_HOST = process.env['FUNCTIONS_EMULATOR_HOST'] ?? '127.0.0.1:5001';
const CALLABLE_REGION = 'us-central1';

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

interface AuthUser {
  uid: string;
  idToken: string;
}

interface SubmitResult {
  activityId: string;
  distanceKm: number;
  durationSeconds: number;
  battleIds: string[];
  battleCreditStatus: string;
  battleCreditReason: string | null;
}

/** Authエミュレータへ実ユーザーを作り、Callableが検証するIDトークンを得る。 */
async function createAuthUser(email: string): Promise<AuthUser> {
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'test-password-1234', returnSecureToken: true }),
    },
  );
  const body = await response.json() as { localId?: string; idToken?: string; error?: unknown };
  assert.ok(body.localId && body.idToken, `Authエミュレータのユーザー作成に失敗: ${JSON.stringify(body.error)}`);
  return { uid: body.localId, idToken: body.idToken };
}

/** デプロイ時と同じCallableプロトコルで submitActivity を呼ぶ。 */
async function callSubmitActivity(
  user: AuthUser,
  data: Record<string, unknown>,
): Promise<{ ok: true; result: SubmitResult } | { ok: false; code: string; message: string }> {
  const response = await fetch(
    `http://${FUNCTIONS_HOST}/${PROJECT_ID}/${CALLABLE_REGION}/submitActivity`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.idToken}`,
      },
      body: JSON.stringify({ data }),
    },
  );
  const body = await response.json() as {
    result?: SubmitResult;
    error?: { status?: string; message?: string };
  };
  if (body.error) {
    return { ok: false, code: body.error.status ?? 'UNKNOWN', message: body.error.message ?? '' };
  }
  assert.ok(body.result, `submitActivityが結果を返さなかった: ${JSON.stringify(body)}`);
  return { ok: true, result: body.result };
}

async function waitFor<T>(
  label: string,
  probe: () => Promise<T | null>,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error(`タイムアウト: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * 北向き直線の点列を作る。1度の緯度差 = 約111,320m。
 * 精度5m（高信頼）、間隔12.5m（v3のcommitAnchor 3mより十分大きい）、
 * 速度2.5m/s（上限7.0m/s以内）。
 */
function straightLineRoute(options: {
  startedAtMs: number;
  meters: number;
  stepMeters: number;
  stepSeconds: number;
}): Array<Record<string, unknown>> {
  const { startedAtMs, meters, stepMeters, stepSeconds } = options;
  const pointCount = Math.floor(meters / stepMeters) + 1;
  const metersPerDegreeLat = 111_320;
  return Array.from({ length: pointCount }, (_, index) => ({
    lat: 35 + (index * stepMeters) / metersPerDegreeLat,
    lng: 139,
    timestamp: startedAtMs + index * stepSeconds * 1_000,
    accuracy: 5,
    alt: null,
    altitudeAccuracy: null,
    seg: 0,
  }));
}

async function seedBattle(options: {
  battleId: string;
  uid: string;
  categoryId: string;
  startAtMs: number;
  endAtMs: number;
}): Promise<void> {
  const { battleId, uid, categoryId, startAtMs, endAtMs } = options;
  await Promise.all([
    db.doc(`battles/${battleId}`).set({
      title: 'E2Eチャレンジ',
      status: 'active',
      rankingType: 'total',
      startAt: Timestamp.fromMillis(startAtMs),
      endAt: Timestamp.fromMillis(endAtMs),
    }),
    db.doc(`battles/${battleId}/participants/${uid}`).set({
      userId: uid,
      categoryId,
      totalDistanceKm: 0,
      activityCount: 0,
    }),
    // 自チームは2位started。相手チームを抜くと順位が2→1へ動くことを確認する。
    db.doc(`battles/${battleId}/category_stats/${categoryId}`).set({
      totalDistanceKm: 0,
      avgDistanceKm: 0,
      participantCount: 1,
    }),
    db.doc(`battles/${battleId}/category_stats/rival`).set({
      totalDistanceKm: 0.5,
      avgDistanceKm: 0.5,
      participantCount: 1,
    }),
  ]);
}

async function scenarioCreditedGpsRun(): Promise<void> {
  const user = await createAuthUser(`e2e-credited-${Date.now()}@example.com`);
  const battleId = 'e2e-battle-active';
  const categoryId = 'team-a';
  const now = Date.now();

  await seedBattle({
    battleId,
    uid: user.uid,
    categoryId,
    startAtMs: now - 24 * 60 * 60 * 1_000,
    endAtMs: now + 24 * 60 * 60 * 1_000,
  });
  await db.doc(`users/${user.uid}`).set({
    name: 'E2E走者',
    totalDistanceKm: 0,
    activityCount: 0,
    battleIds: [battleId],
  });

  // 400秒で1000m（2.5m/s = 9km/h）。
  const durationSeconds = 400;
  const endedAtMs = now - 60_000;
  const startedAtMs = endedAtMs - durationSeconds * 1_000;
  const route = straightLineRoute({ startedAtMs, meters: 1_000, stepMeters: 12.5, stepSeconds: 5 });

  const submitted = await callSubmitActivity(user, {
    localId: 'e2e-credited-activity',
    measurementType: 'gps',
    startedAtMs,
    endedAtMs,
    pausedMs: 0,
    steps: 0,
    gpsProcessingVersion: 3,
    route,
  });
  assert.ok(submitted.ok, `submitActivityが失敗した: ${JSON.stringify(submitted)}`);
  const result = submitted.result;

  // 1) サーバーがGPS点列から距離を再計算している（クライアント申告値を信用しない）。
  assert.ok(
    Math.abs(result.distanceKm - 1) < 0.03,
    `サーバー再計算距離が1kmから外れた: ${result.distanceKm}`,
  );
  assert.equal(result.durationSeconds, durationSeconds);
  assert.deepEqual(result.battleIds, [battleId], '開催中チャレンジが加算対象になる');
  assert.equal(result.battleCreditStatus, 'eligible');

  // 2) aggregateActivityトリガーが最後まで走る。
  const activityRef = db.doc(`activities/${result.activityId}`);
  await waitFor('活動の集計完了', async () => {
    const snap = await activityRef.get();
    return snap.data()?.['aggregated'] === true ? snap : null;
  });
  const activity = (await activityRef.get()).data()!;
  assert.equal(activity['userStatsAggregated'], true);
  assert.deepEqual(activity['aggregatedBattleIds'], [battleId]);

  // 3) GPSルートが分割保存されている。
  const chunks = await db.collection(`users/${user.uid}/activityRoutes/${result.activityId}/chunks`).get();
  assert.ok(chunks.size > 0, 'GPSルートが保存されていない');

  // 4) チャレンジへの反映: participant・チーム合計・平均・順位。
  const [participant, myStats, rivalStats] = await Promise.all([
    db.doc(`battles/${battleId}/participants/${user.uid}`).get(),
    db.doc(`battles/${battleId}/category_stats/${categoryId}`).get(),
    db.doc(`battles/${battleId}/category_stats/rival`).get(),
  ]);
  const credited = participant.data()!['totalDistanceKm'] as number;
  assert.ok(Math.abs(credited - result.distanceKm) < 1e-6, 'participantへ走行距離が反映されていない');
  assert.equal(participant.data()!['activityCount'], 1);
  assert.ok(
    Math.abs((myStats.data()!['totalDistanceKm'] as number) - result.distanceKm) < 1e-6,
    'チーム合計距離が更新されていない',
  );
  // participantCountはparticipantCounterトリガーが管理するので、実測値との整合を見る。
  const participantCount = Math.max((myStats.data()!['participantCount'] as number | undefined) ?? 0, 1);
  assert.ok(
    Math.abs((myStats.data()!['avgDistanceKm'] as number) - result.distanceKm / participantCount) < 1e-6,
    `チーム平均距離が合計/人数と一致しない（人数=${participantCount}）`,
  );
  assert.equal(rivalStats.data()!['totalDistanceKm'], 0.5, '相手チームの距離を書き換えていない');

  const impact = (activity['aggregationImpacts'] as Record<string, Record<string, unknown>>)[battleId];
  assert.ok(impact, 'aggregationImpactsが残っていない');
  assert.equal(impact['rankBefore'], 2, '加算前は0kmで2位');
  assert.equal(impact['rankAfter'], 1, '1km加算で相手チーム0.5kmを抜いて1位');

  // 5) 個人統計・月次統計・自己ベスト。
  const userAfter = (await db.doc(`users/${user.uid}`).get()).data()!;
  assert.ok(
    Math.abs((userAfter['totalDistanceKm'] as number) - result.distanceKm) < 1e-6,
    '個人累計距離が反映されていない',
  );
  assert.equal(userAfter['activityCount'], 1);
  const records = userAfter['personalRecords'] as Record<string, unknown> | undefined;
  assert.ok(records, '自己ベストが作られていない');
  assert.ok(
    Math.abs((records['longestRunKm'] as number) - result.distanceKm) < 1e-6,
    '最長距離の自己ベストが更新されていない',
  );

  const monthKey = (activity['monthlyStatsImpact'] as Record<string, unknown>)['monthKey'] as string;
  const monthly = (await db.doc(`users/${user.uid}/monthlyStats/${monthKey}`).get()).data()!;
  assert.ok(Math.abs((monthly['km'] as number) - result.distanceKm) < 1e-6, '月次距離が反映されていない');
  assert.equal(monthly['count'], 1);

  console.log(`  ✓ 開催中チャレンジ: サーバー再計算 ${result.distanceKm.toFixed(3)}km がチーム・個人・月次・自己ベストへ反映、順位2→1`);
}

async function scenarioOutsidePeriod(): Promise<void> {
  const user = await createAuthUser(`e2e-outside-${Date.now()}@example.com`);
  const battleId = 'e2e-battle-past';
  const categoryId = 'team-a';
  const now = Date.now();

  // 記録より後に始まるチャレンジ。期間外なので個人記録だけに入る。
  await seedBattle({
    battleId,
    uid: user.uid,
    categoryId,
    startAtMs: now + 60 * 60 * 1_000,
    endAtMs: now + 48 * 60 * 60 * 1_000,
  });
  await db.doc(`users/${user.uid}`).set({
    name: 'E2E期間外',
    totalDistanceKm: 0,
    activityCount: 0,
    battleIds: [battleId],
  });

  const durationSeconds = 400;
  const endedAtMs = now - 60_000;
  const startedAtMs = endedAtMs - durationSeconds * 1_000;
  const route = straightLineRoute({ startedAtMs, meters: 1_000, stepMeters: 12.5, stepSeconds: 5 });

  const submitted = await callSubmitActivity(user, {
    localId: 'e2e-outside-activity',
    measurementType: 'gps',
    startedAtMs,
    endedAtMs,
    pausedMs: 0,
    steps: 0,
    gpsProcessingVersion: 3,
    route,
  });
  assert.ok(submitted.ok, `submitActivityが失敗した: ${JSON.stringify(submitted)}`);
  const result = submitted.result;

  assert.deepEqual(result.battleIds, [], '期間外の記録をチャレンジへ加算しない');
  assert.equal(result.battleCreditStatus, 'not-eligible');
  assert.equal(result.battleCreditReason, 'outside-period', 'サマリーへ出す理由が期間外になる');

  await waitFor('期間外活動の集計完了', async () => {
    const snap = await db.doc(`activities/${result.activityId}`).get();
    return snap.data()?.['aggregated'] === true ? snap : null;
  });

  const [teamStats, userAfter] = await Promise.all([
    db.doc(`battles/${battleId}/category_stats/${categoryId}`).get(),
    db.doc(`users/${user.uid}`).get(),
  ]);
  assert.equal(teamStats.data()!['totalDistanceKm'], 0, '期間外なのにチーム距離が増えている');
  assert.ok(
    Math.abs((userAfter.data()!['totalDistanceKm'] as number) - result.distanceKm) < 1e-6,
    '期間外でも個人記録には残る',
  );

  console.log(`  ✓ 期間外: チーム距離0のまま、個人記録には ${result.distanceKm.toFixed(3)}km を保存、理由=outside-period`);
}

async function scenarioResubmitIsIdempotent(): Promise<void> {
  const user = await createAuthUser(`e2e-resend-${Date.now()}@example.com`);
  const battleId = 'e2e-battle-resend';
  const categoryId = 'team-a';
  const now = Date.now();

  await seedBattle({
    battleId,
    uid: user.uid,
    categoryId,
    startAtMs: now - 24 * 60 * 60 * 1_000,
    endAtMs: now + 24 * 60 * 60 * 1_000,
  });
  await db.doc(`users/${user.uid}`).set({
    name: 'E2E再送',
    totalDistanceKm: 0,
    activityCount: 0,
    battleIds: [battleId],
  });

  const durationSeconds = 400;
  const endedAtMs = now - 60_000;
  const startedAtMs = endedAtMs - durationSeconds * 1_000;
  const route = straightLineRoute({ startedAtMs, meters: 1_000, stepMeters: 12.5, stepSeconds: 5 });
  const payload = {
    localId: 'e2e-resend-activity',
    measurementType: 'gps',
    startedAtMs,
    endedAtMs,
    pausedMs: 0,
    steps: 0,
    gpsProcessingVersion: 3,
    route,
  };

  const first = await callSubmitActivity(user, payload);
  assert.ok(first.ok);
  await waitFor('再送テスト活動の集計完了', async () => {
    const snap = await db.doc(`activities/${first.result.activityId}`).get();
    return snap.data()?.['aggregated'] === true ? snap : null;
  });

  // オフラインキューの再送と同じく、同一localIdで再度送る。
  const second = await callSubmitActivity(user, payload);
  assert.ok(second.ok, `再送が失敗した: ${JSON.stringify(second)}`);
  assert.equal(second.result.activityId, first.result.activityId, '再送で別の活動が作られている');

  const [teamStats, participant, userAfter] = await Promise.all([
    db.doc(`battles/${battleId}/category_stats/${categoryId}`).get(),
    db.doc(`battles/${battleId}/participants/${user.uid}`).get(),
    db.doc(`users/${user.uid}`).get(),
  ]);
  assert.ok(
    Math.abs((teamStats.data()!['totalDistanceKm'] as number) - first.result.distanceKm) < 1e-6,
    '再送でチーム距離が二重加算された',
  );
  assert.equal(participant.data()!['activityCount'], 1, '再送でparticipantの回数が二重加算された');
  assert.equal(userAfter.data()!['activityCount'], 1, '再送で個人回数が二重加算された');

  console.log('  ✓ 同一localIdの再送: 活動・チーム距離・回数のいずれも二重加算しない');
}

async function main(): Promise<void> {
  await scenarioCreditedGpsRun();
  await scenarioOutsidePeriod();
  await scenarioResubmitIsIdempotent();
  console.log('record reflection e2e tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
