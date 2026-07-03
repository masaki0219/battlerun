import * as functionsV1 from 'firebase-functions/v1';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

const BATCH_SIZE = 500;

async function batchDelete(
  db: FirebaseFirestore.Firestore,
  refs: FirebaseFirestore.DocumentReference[],
): Promise<void> {
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const chunk = refs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/**
 * Firebase Auth のユーザー削除をトリガーに、関連データを完全に削除する。
 *
 * 背景: activities には GPS ルート（位置情報の履歴）が含まれるため、
 * アカウント削除後もこれが残るのはプライバシー上の実害がある。
 * v2の firebase-functions/v2/identity にはユーザー削除のライフサイクルイベントが
 * 存在しない（beforeUserCreated/beforeUserSignedIn 等のブロッキング関数のみ）ため、
 * v1 の functions.auth.user().onDelete() を使用する。
 */
export const onUserDeleted = functionsV1.auth.user().onDelete(async (user) => {
  const uid = user.uid;
  const db = getFirestore();
  logger.info('onUserDeleted: start', { uid });

  // 1. 本人のactivities（GPSルート含む）と、そのreactionsサブコレクション
  const activitiesSnap = await db.collection('activities').where('userId', '==', uid).get();
  const activityAndReactionRefs: FirebaseFirestore.DocumentReference[] = [];
  for (const activityDoc of activitiesSnap.docs) {
    const reactionsSnap = await activityDoc.ref.collection('reactions').get();
    reactionsSnap.docs.forEach((r) => activityAndReactionRefs.push(r.ref));
    activityAndReactionRefs.push(activityDoc.ref);
  }
  await batchDelete(db, activityAndReactionRefs);

  // 2. 各バトルの participants/{uid}
  //    users/{uid}.battleIds はクライアント側の削除処理で users/{uid} 自体が
  //    先に消えているため参照できない。participants ドキュメントに保存された
  //    userId フィールドで collectionGroup 検索する
  //    （本トリガー導入前に作成された参加データは userId フィールドを持たないため対象外）。
  const participantsSnap = await db
    .collectionGroup('participants')
    .where('userId', '==', uid)
    .get();
  await batchDelete(db, participantsSnap.docs.map((d) => d.ref));
  // participants の削除は participantCounter (onDocumentWritten) をトリガーし、
  // category_stats.participantCount / avgDistanceKm を自動補正する。

  // 3. 通知・バッジのサブコレクション
  const [notificationsSnap, badgesSnap] = await Promise.all([
    db.collection(`users/${uid}/notifications`).get(),
    db.collection(`users/${uid}/badges`).get(),
  ]);
  await batchDelete(db, [
    ...notificationsSnap.docs.map((d) => d.ref),
    ...badgesSnap.docs.map((d) => d.ref),
  ]);

  // 4. users/{uid} 本体（クライアント側削除が何らかの理由で失敗していた場合の保険）
  await db.doc(`users/${uid}`).delete();

  logger.info('onUserDeleted: done', {
    uid,
    deletedActivities: activitiesSnap.size,
    deletedParticipants: participantsSnap.size,
    deletedNotifications: notificationsSnap.size,
    deletedBadges: badgesSnap.size,
  });
});
