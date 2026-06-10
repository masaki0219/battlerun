import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

// TODO: タスク2で実装（activities onCreate トリガーで participants / category_stats を集計）
export const aggregateActivity = onDocumentCreated(
  'activities/{activityId}',
  async (event) => {
    logger.info('aggregateActivity: not yet implemented', { id: event.params.activityId });
  },
);
