import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

// RevenueCatダッシュボードのWebhook設定で Authorization ヘッダに設定する固定トークン。
// `firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH` で設定する。
const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH');

// Pro化するイベント
const PRO_EVENT_TYPES = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);
// Free化するイベント（CANCELLATIONは解約予約のため期限まではPro維持＝何もしない）
const FREE_EVENT_TYPES = new Set(['EXPIRATION']);

/**
 * RevenueCat Webhook を受信し、`users/{app_user_id}.plan` を更新する。
 *
 * `app_user_id` は initRevenueCat() で Firebase の uid を設定しているため、
 * Firestore の users ドキュメントIDと一致する前提。
 */
export const revenuecatWebhook = onRequest(
  { secrets: [REVENUECAT_WEBHOOK_AUTH] },
  async (req, res) => {
    if (req.get('Authorization') !== REVENUECAT_WEBHOOK_AUTH.value()) {
      logger.warn('revenuecatWebhook: unauthorized request');
      res.status(401).send('Unauthorized');
      return;
    }

    const event = req.body?.event as { type?: string; app_user_id?: string } | undefined;
    const eventType = event?.type;
    const appUserId = event?.app_user_id;

    if (!eventType || !appUserId) {
      logger.warn('revenuecatWebhook: invalid payload', { body: req.body });
      res.status(200).send('ignored');
      return;
    }

    let plan: 'pro' | 'free' | null = null;
    if (PRO_EVENT_TYPES.has(eventType)) plan = 'pro';
    else if (FREE_EVENT_TYPES.has(eventType)) plan = 'free';

    if (plan === null) {
      logger.info('revenuecatWebhook: no-op event type', { eventType, appUserId });
      res.status(200).send('ok');
      return;
    }

    const userRef = getFirestore().doc(`users/${appUserId}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      // RevenueCatはエラー時にリトライするため、恒久的な不在は200で握りつぶす
      logger.warn('revenuecatWebhook: user not found', { appUserId, eventType });
      res.status(200).send('user not found');
      return;
    }

    await userRef.update({ plan });
    logger.info('revenuecatWebhook: plan updated', { appUserId, plan, eventType });
    res.status(200).send('ok');
  },
);
