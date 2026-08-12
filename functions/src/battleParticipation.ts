import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

export const MAX_ACTIVE_BATTLE_COUNT = 2;

function timestampMillis(value: unknown): number | null {
  if (!value || typeof value !== 'object' || typeof (value as { toMillis?: unknown }).toMillis !== 'function') {
    return null;
  }
  const millis = (value as { toMillis: () => number }).toMillis();
  return Number.isFinite(millis) ? millis : null;
}

export function isActiveBattleAt(data: Record<string, unknown>, nowMs: number): boolean {
  const startAt = data['startAt'];
  const endAt = data['endAt'];
  const startMs = timestampMillis(startAt);
  const endMs = timestampMillis(endAt);
  return data['status'] === 'active'
    && startMs != null
    && endMs != null
    && startMs <= nowMs
    && nowMs <= endMs;
}

/** users.battleIds に残す必要がある、開催中または開催予定の参加情報。 */
export function shouldRetainBattleMembership(data: Record<string, unknown>, nowMs: number): boolean {
  const endMs = timestampMillis(data['endAt']);
  return (data['status'] === 'active' || data['status'] === 'upcoming')
    && endMs != null
    && endMs >= nowMs;
}

export function canLeaveParticipant(data: Record<string, unknown>): boolean {
  const distance = data['totalDistanceKm'];
  const activityCount = data['activityCount'];
  const stepCredits = data['stepCreditKmByDay'];
  const hasStepCredit = stepCredits && typeof stepCredits === 'object'
    ? Object.values(stepCredits as Record<string, unknown>).some(
        (value) => typeof value === 'number' && value > 0,
      )
    : false;
  return (typeof distance !== 'number' || distance <= 0)
    && (typeof activityCount !== 'number' || activityCount <= 0)
    && !hasStepCredit;
}

function requiredId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', `${field}が正しくありません。`);
  }
  return value;
}

function normalizedInviteCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
}

/** 参加上限と対象チームをサーバートランザクションで検証する唯一の参加経路。 */
export const joinBattle = onCall({}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');
  const battleId = requiredId(request.data?.battleId, 'チャレンジID');
  const categoryId = requiredId(request.data?.categoryId, 'チームID');
  const inviteCode = normalizedInviteCode(request.data?.inviteCode);
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const battleRef = db.doc(`battles/${battleId}`);
  const participantRef = battleRef.collection('participants').doc(uid);

  await db.runTransaction(async (tx) => {
    const [userSnap, battleSnap, participantSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(battleRef),
      tx.get(participantRef),
    ]);
    if (!userSnap.exists) throw new HttpsError('not-found', 'ユーザー情報が見つかりません。');
    if (!battleSnap.exists) throw new HttpsError('not-found', 'チャレンジが見つかりません。');

    const battle = battleSnap.data()!;
    if (!isActiveBattleAt(battle, Date.now())) {
      throw new HttpsError('failed-precondition', 'このチャレンジは現在参加できません。');
    }
    // battleId / categoryId は秘密情報ではない。非公開チャレンジへの参加権限は、
    // 毎回サーバー上の最新 inviteCode と照合して証明させる。
    if (battle['type'] === 'private' && inviteCode !== battle['inviteCode']) {
      throw new HttpsError('permission-denied', '招待コードが正しくありません。');
    }
    const categoryIds = Array.isArray(battle['categoryIds'])
      ? battle['categoryIds'] as unknown[]
      : Array.isArray(battle['categories'])
        ? (battle['categories'] as Array<Record<string, unknown>>).map((item) => item['id'])
        : [];
    if (!categoryIds.includes(categoryId)) {
      throw new HttpsError('invalid-argument', '選択したチームが見つかりません。');
    }

    if (participantSnap.exists) {
      const participant = participantSnap.data()!;
      if (participant['categoryId'] !== categoryId) {
        if (!canLeaveParticipant(participant)) {
          throw new HttpsError('failed-precondition', '一度記録した後はチームを変更できません。');
        }
        tx.update(participantRef, { categoryId });
      }
      // 旧データで参加者とbattleIdsがずれていても、再参加操作で自己修復する。
      tx.update(userRef, { battleIds: FieldValue.arrayUnion(battleId) });
      return;
    }

    const battleIds = Array.isArray(userSnap.data()?.['battleIds'])
      ? [...new Set((userSnap.data()?.['battleIds'] as unknown[]).filter((id): id is string => typeof id === 'string'))]
      : [];
    // 旧実装は終了済みIDも永久に保持し、51件目以降の参加を拒否していた。
    // トランザクション上限に十分余裕を残しつつ、通常の履歴はここで自動的に間引く。
    if (battleIds.length > 450) {
      throw new HttpsError('failed-precondition', '参加情報が多すぎます。サポートへお問い合わせください。');
    }
    const otherBattleSnaps = await Promise.all(
      battleIds.filter((id) => id !== battleId).map((id) => tx.get(db.doc(`battles/${id}`))),
    );
    const activeCount = otherBattleSnaps.filter(
      (snapshot) => snapshot.exists && isActiveBattleAt(snapshot.data()!, Date.now()),
    ).length;
    if (activeCount >= MAX_ACTIVE_BATTLE_COUNT) {
      throw new HttpsError(
        'failed-precondition',
        `同時に参加できるチャレンジは${MAX_ACTIVE_BATTLE_COUNT}件までです。`,
      );
    }

    const retainedBattleIds = otherBattleSnaps
      .filter((snapshot) => snapshot.exists && shouldRetainBattleMembership(snapshot.data()!, Date.now()))
      .map((snapshot) => snapshot.id);

    tx.set(participantRef, {
      userId: uid,
      categoryId,
      totalDistanceKm: 0,
      activityCount: 0,
      joinedAt: FieldValue.serverTimestamp(),
    });
    tx.update(userRef, { battleIds: [...retainedBattleIds, battleId] });
  });

  return { battleId, categoryId };
});

/** 距離・活動回数が0の参加だけを、ユーザードキュメントと同時に解除する。 */
export const leaveBattle = onCall({}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');
  const battleId = requiredId(request.data?.battleId, 'チャレンジID');
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const participantRef = db.doc(`battles/${battleId}/participants/${uid}`);

  await db.runTransaction(async (tx) => {
    const [userSnap, participantSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(participantRef),
    ]);
    if (!userSnap.exists) throw new HttpsError('not-found', 'ユーザー情報が見つかりません。');
    if (!participantSnap.exists) {
      tx.update(userRef, { battleIds: FieldValue.arrayRemove(battleId) });
      return;
    }
    if (!canLeaveParticipant(participantSnap.data()!)) {
      throw new HttpsError('failed-precondition', '距離を加算したチャレンジからは退出できません。');
    }
    tx.delete(participantRef);
    tx.update(userRef, { battleIds: FieldValue.arrayRemove(battleId) });
  });

  return { battleId };
});
