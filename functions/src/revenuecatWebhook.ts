import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

// TODO: タスク4で実装（RevenueCat Webhook を検証し users/{uid}.plan を更新）
export const revenuecatWebhook = onRequest(async (req, res) => {
  logger.info('revenuecatWebhook: not yet implemented');
  res.status(200).send('ok');
});
