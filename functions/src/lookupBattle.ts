import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/** 招待コードを列挙可能なFirestore readから切り離し、必要な参加情報だけを返す。 */
export const lookupBattleByInviteCode = onCall({}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');
  const raw = typeof request.data?.inviteCode === 'string' ? request.data.inviteCode : '';
  const inviteCode = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(inviteCode)) {
    throw new HttpsError('invalid-argument', '招待コードは6桁の英数字で入力してください。');
  }
  const snapshot = await getFirestore().collection('battles')
    .where('type', '==', 'private')
    .where('inviteCode', '==', inviteCode)
    .limit(1)
    .get();
  if (snapshot.empty) throw new HttpsError('not-found', '招待コードが見つかりません。');
  const doc = snapshot.docs[0];
  const data = doc.data();
  if (data['status'] !== 'active') throw new HttpsError('failed-precondition', 'このチャレンジは現在参加できません。');
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
