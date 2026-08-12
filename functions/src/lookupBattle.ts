import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const LOOKUP_WINDOW_MS = 10 * 60 * 1000;
const MAX_LOOKUPS_PER_WINDOW = 30;

async function enforceLookupRateLimit(uid: string): Promise<void> {
  const db = getFirestore();
  const ref = db.doc(`inviteLookupAttempts/${uid}`);
  const now = Timestamp.now();
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data();
    const windowStartedAt = data?.['windowStartedAt'];
    const attemptCount = data?.['attemptCount'];
    const windowExpired = !(windowStartedAt instanceof Timestamp)
      || now.toMillis() - windowStartedAt.toMillis() >= LOOKUP_WINDOW_MS;
    if (windowExpired) {
      tx.set(ref, { windowStartedAt: now, attemptCount: 1, updatedAt: now });
      return;
    }
    const count = typeof attemptCount === 'number' ? attemptCount : 0;
    if (count >= MAX_LOOKUPS_PER_WINDOW) {
      throw new HttpsError('resource-exhausted', '招待コードの確認回数が上限に達しました。しばらくしてからお試しください。', { reason: 'invite-lookup-limit' });
    }
    tx.update(ref, { attemptCount: count + 1, updatedAt: now });
  });
}

/** 招待コードを列挙可能なFirestore readから切り離し、必要な参加情報だけを返す。 */
export const lookupBattleByInviteCode = onCall({}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'ログインが必要です。', { reason: 'auth-required' });
  const raw = typeof request.data?.inviteCode === 'string' ? request.data.inviteCode : '';
  const inviteCode = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(inviteCode)) {
    throw new HttpsError('invalid-argument', '招待コードは6桁の英数字で入力してください。', { reason: 'invite-code-format' });
  }
  await enforceLookupRateLimit(request.auth.uid);
  const snapshot = await getFirestore().collection('battles')
    .where('type', '==', 'private')
    .where('inviteCode', '==', inviteCode)
    .limit(2)
    .get();
  if (snapshot.empty) throw new HttpsError('not-found', '招待コードが見つかりません。', { reason: 'invite-code-not-found' });
  // 旧データに重複があれば、どちらかを曖昧に選んで招待先を横取りさせない。
  if (snapshot.size !== 1) {
    throw new HttpsError('failed-precondition', '招待コードが重複しています。サポートへお問い合わせください。', { reason: 'invite-code-duplicate' });
  }
  const doc = snapshot.docs[0];
  const data = doc.data();
  if (data['status'] !== 'active') throw new HttpsError('failed-precondition', 'このチャレンジは現在参加できません。', { reason: 'battle-not-active' });
  const toIso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : '';
  return {
    id: doc.id,
    type: 'private',
    seasonId: null,
    title: data['title'] as string,
    description: (data['description'] as string | undefined) ?? '',
    categories: (data['categories'] as Array<{ id: string; label: string }> | undefined) ?? [],
    rankingType: (data['rankingType'] as 'average' | 'total' | undefined) ?? 'average',
    startAt: toIso(data['startAt']),
    endAt: toIso(data['endAt']),
    status: 'active',
    createdBy: data['createdBy'] as string,
    inviteCode,
  };
});
