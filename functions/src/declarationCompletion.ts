import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { completeDeclarationsForActivity, normalizedTimeZone } from './declarations';

function activityBattleIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string'))].slice(0, 2);
}

/**
 * 新しいアプリが活動保存直後に呼ぶ達成確定。活動本体をサーバーで読み、ユーザー・開始時刻・反映先を検証する。
 */
export const completeRunDeclarationsForActivity = onCall({}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');
  const activityId = request.data?.['activityId'];
  if (typeof activityId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(activityId)) {
    throw new HttpsError('invalid-argument', '記録IDの形式が不正です。');
  }

  const db = getFirestore();
  const activityRef = db.doc(`activities/${activityId}`);
  const activity = await activityRef.get();
  if (!activity.exists) throw new HttpsError('not-found', '記録が見つかりません。');
  const data = activity.data()!;
  if (data['userId'] !== uid) throw new HttpsError('permission-denied', 'この記録は更新できません。');
  const startedAt = data['startedAt'];
  if (!(startedAt instanceof Timestamp)) {
    throw new HttpsError('failed-precondition', '記録の開始日時がありません。');
  }

  const declarationAchieved = await completeDeclarationsForActivity({
    db,
    battleIds: activityBattleIds(data['battleIds']),
    userId: uid,
    startedAtMs: startedAt.toMillis(),
    activityTimezone: normalizedTimeZone(request.data?.['timezone']),
    activityRef,
  });
  return { declarationAchieved };
});

/** クライアント呼び出しが途切れても、活動作成イベントから同じ処理を冪等に再実行する。 */
export const completeDeclarationOnActivityCreated = onDocumentCreated(
  { document: 'activities/{activityId}', retry: true },
  async (event) => {
    const activity = event.data;
    if (!activity) return;
    const data = activity.data();
    const userId = data['userId'];
    const startedAt = data['startedAt'];
    if (typeof userId !== 'string' || !(startedAt instanceof Timestamp)) return;
    try {
      await completeDeclarationsForActivity({
        db: getFirestore(),
        battleIds: activityBattleIds(data['battleIds']),
        userId,
        startedAtMs: startedAt.toMillis(),
        activityTimezone: normalizedTimeZone(data['timezone']),
        activityRef: activity.ref,
      });
    } catch (error) {
      // 活動自体はすでに保存済み。再配信に任せつつ、調査できるログを残す。
      logger.error('completeDeclarationOnActivityCreated failed', {
        activityId: event.params.activityId,
        userId,
        error,
      });
      throw error;
    }
  },
);
