import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

// RevenueCatダッシュボードのWebhook設定で Authorization ヘッダに設定する固定トークン。
// `firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH` で設定する。
const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH');

// Pro化するイベント
const PRO_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT',
]);
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

    const event = req.body?.event as {
      id?: string;
      type?: string;
      app_user_id?: string;
      event_timestamp_ms?: number;
      expiration_at_ms?: number | null;
      entitlement_ids?: string[];
    } | undefined;
    const eventType = event?.type;
    const appUserId = event?.app_user_id;

    if (!eventType || !appUserId) {
      logger.warn('revenuecatWebhook: invalid payload');
      res.status(200).send('ignored');
      return;
    }

    let plan: 'pro' | 'free' | null = null;
    const hasProEntitlement = !event.entitlement_ids || event.entitlement_ids.includes('pro');
    if (PRO_EVENT_TYPES.has(eventType) && hasProEntitlement) plan = 'pro';
    else if (FREE_EVENT_TYPES.has(eventType) && (event.expiration_at_ms ?? 0) <= Date.now()) plan = 'free';

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

    const incomingAt = event.event_timestamp_ms ?? Date.now();
    const applied = await getFirestore().runTransaction(async (tx) => {
      const fresh = await tx.get(userRef);
      if (!fresh.exists) return false;
      const previousAt = (fresh.data()?.['revenuecatLastEventAtMs'] as number | undefined) ?? 0;
      const previousId = fresh.data()?.['revenuecatLastEventId'] as string | undefined;
      if (incomingAt < previousAt || (event.id && event.id === previousId)) return false;
      tx.update(userRef, {
        plan,
        revenuecatLastEventAtMs: incomingAt,
        revenuecatLastEventId: event.id ?? null,
        revenuecatExpirationAtMs: event.expiration_at_ms ?? null,
      });
      return true;
    });
    if (!applied) {
      logger.info('revenuecatWebhook: stale or duplicate event ignored', { appUserId, eventType, eventId: event.id });
      res.status(200).send('ignored');
      return;
    }
    logger.info('revenuecatWebhook: plan updated', { appUserId, plan, eventType });
    res.status(200).send('ok');
  },
);
