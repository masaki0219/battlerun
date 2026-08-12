import { createHash } from 'node:crypto';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { sendPushToUser } from './push';
import { notificationCopy, resolveUiLanguage, userUiLanguage } from './i18n';

interface UserTitle {
  seasonId: string;
  battleId: string;
  battleTitle: string;
  teamName: string;
  rank: number;
  awardedAt: string;
}

const REACTION_NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1_000;
const REACTION_GUARD_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

function reactionNotificationGuardId(activityId: string, reactorId: string): string {
  return createHash('sha256').update(activityId).update('\0').update(reactorId).digest('hex');
}

async function createReactionNotificationWithinCooldown(params: {
  activityId: string;
  reactorId: string;
  activityOwnerId: string;
  title: string;
  body: string;
}): Promise<boolean> {
  const db = getFirestore();
  const now = Timestamp.now();
  const guardRef = db.doc(
    `reactionNotificationGuards/${reactionNotificationGuardId(params.activityId, params.reactorId)}`,
  );
  const notificationRef = db.collection(`users/${params.activityOwnerId}/notifications`).doc();
  return db.runTransaction(async (transaction) => {
    const guard = await transaction.get(guardRef);
    const lastNotifiedAt = guard.data()?.['lastNotifiedAt'];
    if (
      lastNotifiedAt instanceof Timestamp
      && now.toMillis() - lastNotifiedAt.toMillis() < REACTION_NOTIFICATION_COOLDOWN_MS
    ) return false;

    transaction.set(guardRef, {
      lastNotifiedAt: now,
      expireAt: Timestamp.fromMillis(now.toMillis() + REACTION_GUARD_RETENTION_MS),
    });
    transaction.create(notificationRef, {
      type: 'reaction',
      title: params.title,
      body: params.body,
      isRead: false,
      relatedBattleId: null,
      relatedActivityId: params.activityId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

async function hasBlockBetween(firstUid: string, secondUid: string): Promise<boolean> {
  const db = getFirestore();
  const [firstBlocksSecond, secondBlocksFirst] = await Promise.all([
    db.doc(`users/${firstUid}/blocks/${secondUid}`).get(),
    db.doc(`users/${secondUid}/blocks/${firstUid}`).get(),
  ]);
  return firstBlocksSecond.exists || secondBlocksFirst.exists;
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
    if (await hasBlockBetween(activityOwnerId, reactorId)) {
      logger.info('onReactionCreated: blocked pair, skipping notification', { activityOwnerId, reactorId });
      return;
    }

    const [reactorSnap, language] = await Promise.all([
      db.doc(`users/${reactorId}`).get(),
      userUiLanguage(db, activityOwnerId),
    ]);
    const reactorName = (reactorSnap.data()?.['name'] as string) ?? notificationCopy.member(language);
    const { title, body } = notificationCopy.reaction(language, reactorName, reactionType);

    const created = await createReactionNotificationWithinCooldown({
      activityId,
      reactorId,
      activityOwnerId,
      title,
      body,
    });
    if (!created) {
      logger.info('onReactionCreated: notification cooldown active, skipping', { activityId, reactorId });
      return;
    }
    await sendPushToUser(activityOwnerId, title, body, { type: 'reaction', relatedActivityId: activityId });
  },
);

/** ラン宣言への応援を宣言者へ通知する。 */
export const onDeclarationCheerCreated = onDocumentCreated(
  'battles/{battleId}/declarations/{declarationId}/cheers/{fromUid}',
  async (event) => {
    const cheer = event.data;
    if (!cheer) return;
    const { battleId, declarationId, fromUid } = event.params;
    const db = getFirestore();
    const declarationSnap = await db.doc(`battles/${battleId}/declarations/${declarationId}`).get();
    if (!declarationSnap.exists) return;
    if (!['planned', 'done'].includes(declarationSnap.data()?.['status'] as string)) return;
    const ownerId = declarationSnap.data()?.['uid'] as string | undefined;
    if (!ownerId || ownerId === fromUid) return;
    if (await hasBlockBetween(ownerId, fromUid)) {
      logger.info('onDeclarationCheerCreated: blocked pair, skipping notification', { ownerId, fromUid });
      return;
    }

    const [profileSnap, language] = await Promise.all([
      db.doc(`publicProfiles/${fromUid}`).get(),
      userUiLanguage(db, ownerId),
    ]);
    const senderName = (profileSnap.data()?.['name'] as string | undefined) ?? notificationCopy.member(language);
    const { title, body } = notificationCopy.declarationCheer(language, senderName);
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
    if (await hasBlockBetween(runnerId, fromUid)) {
      logger.info('onPresenceCheerWritten: blocked pair, skipping notification', { runnerId, fromUid });
      return;
    }
    const db = getFirestore();
    const presenceSnap = await db.doc(`battles/${battleId}/presence/${runnerId}`).get();
    if (!presenceSnap.exists
      || presenceSnap.data()?.['sessionId'] !== sessionId
      || presenceSnap.data()?.['visible'] !== true) return;

    const [profileSnap, language] = await Promise.all([
      db.doc(`publicProfiles/${fromUid}`).get(),
      userUiLanguage(db, runnerId),
    ]);
    const senderName = (profileSnap.data()?.['name'] as string | undefined) ?? notificationCopy.member(language);
    const { title, body } = notificationCopy.presenceCheer(language, senderName);
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
  const language = resolveUiLanguage(change.after.data()?.['uiLanguage']);

  await Promise.all(
    newTitles.map(async (title) => {
      const { title: notifTitle, body: notifBody } = notificationCopy.earnedTitle(language, title);

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
