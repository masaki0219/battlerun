import * as functionsV1 from 'firebase-functions/v1';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

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
  const userSnap = await db.doc(`users/${uid}`).get();
  const knownBattleIds = (userSnap.data()?.['battleIds'] as string[] | undefined) ?? [];

  // 1. 本人のactivities（GPSルート含む）と、そのreactionsサブコレクション
  const activitiesSnap = await db.collection('activities').where('userId', '==', uid).get();
  const activityAndReactionRefs: FirebaseFirestore.DocumentReference[] = [];
  for (const activityDoc of activitiesSnap.docs) {
    const reactionsSnap = await activityDoc.ref.collection('reactions').get();
    reactionsSnap.docs.forEach((r) => activityAndReactionRefs.push(r.ref));
    const routeChunksSnap = await db
      .collection(`users/${uid}/activityRoutes/${activityDoc.id}/chunks`)
      .get();
    routeChunksSnap.docs.forEach((chunk) => activityAndReactionRefs.push(chunk.ref));
    activityAndReactionRefs.push(activityDoc.ref);
  }
  await batchDelete(db, activityAndReactionRefs);

  // 本人が他ユーザーの活動へ付けたリアクションも削除する。
  const authoredReactionsSnap = await db.collectionGroup('reactions').where('userId', '==', uid).get();
  await batchDelete(db, authoredReactionsSnap.docs.map((doc) => doc.ref));

  // 本人のラン宣言、その宣言に付いた応援、および本人が送った応援を削除する。
  const [declarationsSnap, authoredCheersSnap] = await Promise.all([
    db.collectionGroup('declarations').where('uid', '==', uid).get(),
    db.collectionGroup('cheers').where('fromUid', '==', uid).get(),
  ]);
  const declarationCheerRefs = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const declarationDoc of declarationsSnap.docs) {
    const cheersSnap = await declarationDoc.ref.collection('cheers').get();
    cheersSnap.docs.forEach((cheer) => declarationCheerRefs.set(cheer.ref.path, cheer.ref));
  }
  authoredCheersSnap.docs.forEach((cheer) => declarationCheerRefs.set(cheer.ref.path, cheer.ref));
  await batchDelete(db, [...declarationCheerRefs.values()]);
  await batchDelete(db, declarationsSnap.docs.map((declaration) => declaration.ref));

  // 2. 各バトルの participants/{uid}
  //    users/{uid}.battleIds はクライアント側の削除処理で users/{uid} 自体が
  //    先に消えているため参照できない。participants ドキュメントに保存された
  //    userId フィールドで collectionGroup 検索する
  //    （本トリガー導入前に作成された参加データは userId フィールドを持たないため対象外）。
  const participantsSnap = await db
    .collectionGroup('participants')
    .where('userId', '==', uid)
    .get();
  const participantRefs = new Map<string, FirebaseFirestore.DocumentReference>();
  participantsSnap.docs.forEach((doc) => participantRefs.set(doc.ref.path, doc.ref));
  knownBattleIds.forEach((battleId) => {
    const ref = db.doc(`battles/${battleId}/participants/${uid}`);
    participantRefs.set(ref.path, ref);
  });

  // 本人のライブプレゼンスと、そこへ届いた応援を削除する。
  const presenceBattleIds = new Set(knownBattleIds);
  participantRefs.forEach((ref) => {
    const battleDoc = ref.parent.parent;
    if (battleDoc) presenceBattleIds.add(battleDoc.id);
  });
  const presenceRefs: FirebaseFirestore.DocumentReference[] = [];
  const receivedPresenceCheerRefs: FirebaseFirestore.DocumentReference[] = [];
  for (const battleId of presenceBattleIds) {
    const presenceRef = db.doc(`battles/${battleId}/presence/${uid}`);
    const presenceSnap = await presenceRef.get();
    if (!presenceSnap.exists) continue;
    const cheersSnap = await presenceRef.collection('cheers').get();
    cheersSnap.docs.forEach((cheer) => receivedPresenceCheerRefs.push(cheer.ref));
    presenceRefs.push(presenceRef);
  }
  await batchDelete(db, receivedPresenceCheerRefs);
  await batchDelete(db, presenceRefs);
  await batchDelete(db, [...participantRefs.values()]);
  // participants の削除は participantCounter (onDocumentWritten) をトリガーし、
  // category_stats.participantCount / avgDistanceKm を自動補正する。

  // 3. 通知・バッジ・月間集計のサブコレクション
  const [notificationsSnap, badgesSnap, monthlyStatsSnap, ownBlocksSnap, blockedByOthersSnap] = await Promise.all([
    db.collection(`users/${uid}/notifications`).get(),
    db.collection(`users/${uid}/badges`).get(),
    db.collection(`users/${uid}/monthlyStats`).get(),
    db.collection(`users/${uid}/blocks`).get(),
    db.collectionGroup('blocks').where('blockedUid', '==', uid).get(),
  ]);
  await batchDelete(db, [
    ...notificationsSnap.docs.map((d) => d.ref),
    ...badgesSnap.docs.map((d) => d.ref),
    ...monthlyStatsSnap.docs.map((d) => d.ref),
    ...ownBlocksSnap.docs.map((d) => d.ref),
    ...blockedByOthersSnap.docs.map((d) => d.ref),
  ]);

  // 4. users/{uid} 本体（クライアント側削除が何らかの理由で失敗していた場合の保険）
  await Promise.all([
    db.doc(`users/${uid}`).delete(),
    db.doc(`publicProfiles/${uid}`).delete(),
  ]);

  // 5. 廃止済みの写真機能で保存された旧画像。移行完了までは削除保険を維持する。
  await getStorage().bucket().file(`avatars/${uid}`).delete({ ignoreNotFound: true }).catch((error) => {
    logger.warn('onUserDeleted: avatar deletion failed', { uid, error: (error as Error).message });
  });

  logger.info('onUserDeleted: done', {
    uid,
    deletedActivities: activitiesSnap.size,
    deletedParticipants: participantRefs.size,
    deletedNotifications: notificationsSnap.size,
    deletedBadges: badgesSnap.size,
    deletedMonthlyStats: monthlyStatsSnap.size,
    deletedBlocks: ownBlocksSnap.size + blockedByOthersSnap.size,
    deletedAuthoredReactions: authoredReactionsSnap.size,
    deletedDeclarations: declarationsSnap.size,
    deletedDeclarationCheers: declarationCheerRefs.size,
    deletedPresences: presenceRefs.length,
    deletedReceivedPresenceCheers: receivedPresenceCheerRefs.length,
  });
});
