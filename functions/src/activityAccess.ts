import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { tokyoDayKey } from './battleCredit';

const MAX_ACTIVITY_LIST_SIZE = 500;
const MAX_ACTIVITY_CANDIDATES = 1_000;
const BLOCK_READ_BATCH_SIZE = 200;
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

function requiredId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', `${label}が正しくありません。`);
  }
  return value;
}

function listLimit(value: unknown): number {
  if (value == null) return 50;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new HttpsError('invalid-argument', '取得件数が正しくありません。');
  }
  return Math.min(value, MAX_ACTIVITY_LIST_SIZE);
}

function fromDayTimestamp(value: unknown): Timestamp | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^[0-9]{8}$/.test(value)) {
    throw new HttpsError('invalid-argument', '開始日が正しくありません。');
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const millis = Date.UTC(year, month - 1, day) - TOKYO_OFFSET_MS;
  if (tokyoDayKey(millis) !== value) {
    throw new HttpsError('invalid-argument', '開始日が正しくありません。');
  }
  return Timestamp.fromMillis(millis);
}

async function authorizedBattle(uid: string, battleId: string): Promise<FirebaseFirestore.DocumentData> {
  const db = getFirestore();
  const battleSnap = await db.doc(`battles/${battleId}`).get();
  if (!battleSnap.exists) throw new HttpsError('not-found', 'チャレンジが見つかりません。');
  const battle = battleSnap.data()!;
  if (battle['type'] === 'public' || battle['createdBy'] === uid) return battle;

  const [participantSnap, userSnap] = await Promise.all([
    db.doc(`battles/${battleId}/participants/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  if (!participantSnap.exists && userSnap.data()?.['role'] !== 'admin') {
    // private の存在自体を第三者へ知らせない。
    throw new HttpsError('not-found', 'チャレンジが見つかりません。');
  }
  return battle;
}

async function blockedCandidateUserIds(uid: string, candidateUserIds: string[]): Promise<Set<string>> {
  const db = getFirestore();
  const candidates = [...new Set(candidateUserIds)].filter((candidate) => candidate !== uid);
  const refToCandidate = new Map<string, string>();
  for (const candidate of candidates) {
    const outgoing = db.doc(`users/${uid}/blocks/${candidate}`);
    const incoming = db.doc(`users/${candidate}/blocks/${uid}`);
    refToCandidate.set(outgoing.path, candidate);
    refToCandidate.set(incoming.path, candidate);
  }

  const refs = [...refToCandidate.keys()].map((path) => db.doc(path));
  const blocked = new Set<string>();
  for (let offset = 0; offset < refs.length; offset += BLOCK_READ_BATCH_SIZE) {
    const snapshots = await db.getAll(...refs.slice(offset, offset + BLOCK_READ_BATCH_SIZE));
    snapshots.forEach((snapshot) => {
      if (!snapshot.exists) return;
      const candidate = refToCandidate.get(snapshot.ref.path);
      if (candidate) blocked.add(candidate);
    });
  }
  return blocked;
}

async function hasBlockBetween(uid: string, otherUid: string): Promise<boolean> {
  if (uid === otherUid) return false;
  const db = getFirestore();
  const [outgoing, incoming] = await Promise.all([
    db.doc(`users/${uid}/blocks/${otherUid}`).get(),
    db.doc(`users/${otherUid}/blocks/${uid}`).get(),
  ]);
  return outgoing.exists || incoming.exists;
}

function activitySummary(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Record<string, unknown> | null {
  const userId = data['userId'];
  const startedAt = data['startedAt'];
  const distanceKm = data['distanceKm'];
  const durationSeconds = data['durationSeconds'];
  if (
    typeof userId !== 'string'
    || !(startedAt instanceof Timestamp)
    || typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)
    || typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)
  ) return null;
  const displayName = typeof data['displayName'] === 'string'
    ? data['displayName'].slice(0, 40)
    : 'メンバー';
  const measurementType = data['measurementType'] === 'steps' ? 'steps' : 'gps';
  const steps = typeof data['steps'] === 'number' && Number.isFinite(data['steps'])
    ? Math.max(0, Math.floor(data['steps']))
    : null;
  return {
    id,
    userId,
    displayName,
    distanceKm: Math.max(0, distanceKm),
    durationSeconds: Math.max(0, durationSeconds),
    measurementType,
    steps,
    dayKey: tokyoDayKey(startedAt.toMillis()),
  };
}

/** 認可した1チャレンジ分だけ、時刻と内部集計値を除いた活動要約を返す。 */
export const listBattleActivities = onCall({ maxInstances: 20 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');
  const battleId = requiredId(request.data?.battleId, 'チャレンジID');
  await authorizedBattle(uid, battleId);
  const from = fromDayTimestamp(request.data?.fromDayKey);
  const limit = listLimit(request.data?.limit);

  let query: FirebaseFirestore.Query = getFirestore().collection('activities')
    .where('battleIds', 'array-contains', battleId)
    .where('visibility', '==', 'public_v2');
  if (from) query = query.where('startedAt', '>=', from);
  // ブロック除外後も要求件数へ近づけるため候補を多めに取り、候補との関係だけを確認する。
  // 全世界のincoming blockを列挙せず、読み取り量を明示的に上限内へ収める。
  const candidateLimit = Math.min(MAX_ACTIVITY_CANDIDATES, Math.max(limit, limit * 2));
  const snapshot = await query.orderBy('startedAt', 'desc').limit(candidateLimit).select(
    'userId',
    'displayName',
    'distanceKm',
    'durationSeconds',
    'measurementType',
    'steps',
    'startedAt',
  ).get();
  const summaries = snapshot.docs.flatMap((doc) => {
    const summary = activitySummary(doc.id, doc.data());
    return summary ? [summary] : [];
  });
  const blockedUserIds = await blockedCandidateUserIds(
    uid,
    summaries.map((summary) => summary['userId'] as string),
  );
  return {
    activities: summaries
      .filter((summary) => !blockedUserIds.has(summary['userId'] as string))
      .slice(0, limit),
  };
});

/** 他人の活動詳細用。要求したチャレンジ以外の所属・正確な時刻・内部集計値は返さない。 */
export const getBattleActivity = onCall({ maxInstances: 20 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');
  const battleId = requiredId(request.data?.battleId, 'チャレンジID');
  const activityId = requiredId(request.data?.activityId, '記録ID');
  const battle = await authorizedBattle(uid, battleId);
  const activitySnap = await getFirestore().doc(`activities/${activityId}`).get();
  const activity = activitySnap.data();
  const battleIds = activity?.['battleIds'];
  if (
    !activitySnap.exists
    || activity?.['visibility'] !== 'public_v2'
    || !Array.isArray(battleIds)
    || !battleIds.includes(battleId)
  ) throw new HttpsError('not-found', '記録が見つかりません。');
  const summary = activitySummary(activityId, activity!);
  if (!summary) throw new HttpsError('not-found', '記録が見つかりません。');
  if (await hasBlockBetween(uid, summary['userId'] as string)) {
    // ブロック関係と記録の存在を呼び出し元へ区別させない。
    throw new HttpsError('not-found', '記録が見つかりません。');
  }
  const impact = activity?.['aggregationImpacts']?.[battleId] as Record<string, unknown> | undefined;
  const creditedDistanceKm = typeof impact?.['creditedDistanceKm'] === 'number'
    && Number.isFinite(impact['creditedDistanceKm'])
    ? Math.max(0, impact['creditedDistanceKm'])
    : summary['distanceKm'];
  return {
    activity: summary,
    contribution: {
      battleTitle: typeof battle['title'] === 'string' ? battle['title'].slice(0, 60) : 'チャレンジ',
      creditedDistanceKm,
    },
  };
});
