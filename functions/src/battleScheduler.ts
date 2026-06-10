import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';

// TODO: タスク5で実装（バトルの自動開始/終了とバトル終了通知）
export const battleStatusScheduler = onSchedule('every 60 minutes', async () => {
  logger.info('battleStatusScheduler: not yet implemented');
});
