import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendPushToUser } from './push';

interface UserTitle {
  seasonId: string;
  battleId: string;
  battleTitle: string;
  teamName: string;
  rank: number;
  awardedAt: string;
}

/**
 * activities/{activityId}/reactions/{userId} の作成をトリガーに、
 * 記録の持ち主（自分以外からのリアクション時のみ）へ通知を作成する。
 */
export const onReactionCreated = onDocumentCreated(
  'activities/{activityId}/reactions/{userId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const { activityId, userId: reactorId } = event.params;
    const reaction = snapshot.data();
    const reactionType = (reaction['type'] as string) ?? '';

    const db = getFirestore();
    const activitySnap = await db.doc(`activities/${activityId}`).get();
    if (!activitySnap.exists) {
      logger.warn('onReactionCreated: activity not found, skipping', { activityId });
      return;
    }
    const activity = activitySnap.data()!;
    const activityOwnerId = activity['userId'] as string;

    // 自分の記録への自分のリアクションは通知しない
    if (activityOwnerId === reactorId) return;

    const reactorSnap = await db.doc(`users/${reactorId}`).get();
    const reactorName = (reactorSnap.data()?.['name'] as string) ?? 'メンバー';

    const title = `${reactorName}さんがリアクションしました`;
    const body = `あなたの記録に ${reactionType} がつきました`;

    await db.collection(`users/${activityOwnerId}/notifications`).add({
      type: 'reaction',
      title,
      body,
      isRead: false,
      relatedBattleId: null,
      relatedActivityId: activityId,
      createdAt: FieldValue.serverTimestamp(),
    });
    await sendPushToUser(activityOwnerId, title, body, { type: 'reaction', relatedActivityId: activityId });
  },
);

/** 出撃宣言への応援を宣言者へ通知する。 */
export const onDeclarationCheerCreated = onDocumentCreated(
  'battles/{battleId}/declarations/{declarationId}/cheers/{fromUid}',
  async (event) => {
    const cheer = event.data;
    if (!cheer) return;
    const { battleId, declarationId, fromUid } = event.params;
    const db = getFirestore();
    const declarationSnap = await db.doc(`battles/${battleId}/declarations/${declarationId}`).get();
    if (!declarationSnap.exists) return;
    const ownerId = declarationSnap.data()?.['uid'] as string | undefined;
    if (!ownerId || ownerId === fromUid) return;

    const profileSnap = await db.doc(`publicProfiles/${fromUid}`).get();
    const senderName = (profileSnap.data()?.['name'] as string | undefined) ?? 'メンバー';
    const title = '応援が届きました 🔥';
    const body = `${senderName}さんが応援しています`;
    await db.collection(`users/${ownerId}/notifications`).add({
      type: 'declaration_cheer',
      title,
      body,
      isRead: false,
      relatedBattleId: battleId,
      relatedActivityId: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    await sendPushToUser(ownerId, title, body, {
      type: 'declaration_cheer',
      relatedBattleId: battleId,
      declarationId,
    });
  },
);

/** 記録中プレゼンスへの応援を、対象ランナーの通知センターとプッシュへ送る。 */
export const onPresenceCheerWritten = onDocumentWritten(
  'battles/{battleId}/presence/{runnerId}/cheers/{fromUid}',
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const cheer = after.data();
    const sessionId = cheer?.['sessionId'] as string | undefined;
    if (!sessionId) return;

    const previousSessionId = event.data?.before.exists
      ? event.data.before.data()?.['sessionId'] as string | undefined
      : undefined;
    // 同一ランへの同じ書き込みが再送されても、通知を重ねない。
    if (previousSessionId === sessionId) return;

    const { battleId, runnerId, fromUid } = event.params;
    if (runnerId === fromUid) return;
    const db = getFirestore();
    const presenceSnap = await db.doc(`battles/${battleId}/presence/${runnerId}`).get();
    if (!presenceSnap.exists
      || presenceSnap.data()?.['sessionId'] !== sessionId
      || presenceSnap.data()?.['visible'] !== true) return;

    const profileSnap = await db.doc(`publicProfiles/${fromUid}`).get();
    const senderName = (profileSnap.data()?.['name'] as string | undefined) ?? 'メンバー';
    const title = 'ラン中に応援が届きました 🔥';
    const body = `${senderName}さんが応援しています`;
    await db.collection(`users/${runnerId}/notifications`).add({
      type: 'presence_cheer',
      title,
      body,
      isRead: false,
      relatedBattleId: battleId,
      relatedActivityId: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    await sendPushToUser(runnerId, title, body, {
      type: 'presence_cheer',
      relatedBattleId: battleId,
      presenceSessionId: sessionId,
    });
  },
);

/**
 * users/{userId} の更新をトリガーに、titles 配列に新規追加された称号があれば
 * 「title_earned」通知を作成する。
 */
export const onUserTitlesUpdated = onDocumentUpdated('users/{userId}', async (event) => {
  const change = event.data;
  if (!change) return;

  const before = (change.before.data()?.['titles'] as UserTitle[] | undefined) ?? [];
  const after = (change.after.data()?.['titles'] as UserTitle[] | undefined) ?? [];

  if (after.length <= before.length) return;

  const beforeKeys = new Set(before.map((t) => t.battleId));
  const newTitles = after.filter((t) => !beforeKeys.has(t.battleId));
  if (newTitles.length === 0) return;

  const { userId } = event.params;
  const db = getFirestore();

  await Promise.all(
    newTitles.map(async (title) => {
      const titleLabel = title.rank === 1 ? '優勝陣営の一員' : '準優勝陣営の一員';
      const teamText = title.teamName ? `「${title.teamName}」として` : '';
      const notifTitle = `称号「${titleLabel}」を獲得しました！`;
      const notifBody = `「${title.battleTitle}」で${teamText}走った成果が認められました`;

      await db.collection(`users/${userId}/notifications`).add({
        type: 'title_earned',
        title: notifTitle,
        body: notifBody,
        isRead: false,
        relatedBattleId: title.battleId,
        relatedActivityId: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      await sendPushToUser(userId, notifTitle, notifBody, { type: 'title_earned', relatedBattleId: title.battleId });
    }),
  );
});
