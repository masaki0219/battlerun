import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

// TODO: タスク3で実装（リアクション通知の作成）
export const onReactionCreated = onDocumentCreated(
  'activities/{activityId}/reactions/{userId}',
  async (event) => {
    logger.info('onReactionCreated: not yet implemented', { params: event.params });
  },
);

// TODO: タスク3で実装（称号獲得(titles)通知の作成）
export const onUserTitlesUpdated = onDocumentUpdated('users/{userId}', async (event) => {
  logger.info('onUserTitlesUpdated: not yet implemented', { params: event.params });
});
