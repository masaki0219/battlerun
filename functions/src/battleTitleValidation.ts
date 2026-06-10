import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

// TODO: タスク6で実装（private バトルのタイトルNGワード検証）
export const validateBattleTitleOnCreate = onDocumentCreated(
  'battles/{battleId}',
  async (event) => {
    logger.info('validateBattleTitleOnCreate: not yet implemented', { params: event.params });
  },
);
