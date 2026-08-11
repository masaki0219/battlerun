import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { tokyoDayKey } from './battleCredit';

const MAX_ACTIVITY_LIST_SIZE = 500;
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
  const snapshot = await query.orderBy('startedAt', 'desc').limit(limit).select(
    'userId',
    'displayName',
    'distanceKm',
    'durationSeconds',
    'measurementType',
    'steps',
    'startedAt',
  ).get();
  return {
    activities: snapshot.docs.flatMap((doc) => {
      const summary = activitySummary(doc.id, doc.data());
      return summary ? [summary] : [];
    }),
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
