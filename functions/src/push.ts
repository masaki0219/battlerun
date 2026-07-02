import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

const expo = new Expo();

/**
 * users/{userId}.expoPushToken へExpo Push通知を送信する。
 * Firestore通知（users/{uid}/notifications）の作成と対で呼び出すことを想定。
 *
 * - トークン未登録なら何もしない（アプリ未起動・通知権限拒否ユーザー）
 * - トークン形式が不正なら送信せずログのみ
 * - 送信直後のticketでDeviceNotRegisteredが判明した場合はトークンを削除する
 *   （アンインストール済み端末への送信を止めるため）。
 *   ただし多くのDeviceNotRegisteredは送信の数秒〜数分後に発行されるreceipt側で
 *   判明するため、この即時チェックだけでは検知漏れが残る。receipt側の追跡は
 *   別途フォローアップジョブが必要でこの実装のスコープ外。
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const db = getFirestore();
  const userRef = db.doc(`users/${userId}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return;

  const token = userSnap.data()?.['expoPushToken'] as string | undefined;
  if (!token) return;

  if (!Expo.isExpoPushToken(token)) {
    logger.warn('sendPushToUser: invalid Expo push token, skipping', { userId });
    return;
  }

  const message: ExpoPushMessage = {
    to: token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
  };

  try {
    const [ticket] = await expo.sendPushNotificationsAsync([message]);
    if (ticket.status === 'error') {
      logger.warn('sendPushToUser: push ticket error', { userId, ticket });
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await userRef.update({ expoPushToken: null });
      }
    }
  } catch (e) {
    logger.error('sendPushToUser: send failed', { userId, error: (e as Error).message });
  }
}
