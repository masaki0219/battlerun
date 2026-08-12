import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
// 小規模リリースのコスト安全弁。個別関数の maxInstances 指定はこの値を上書きする。
setGlobalOptions({ maxInstances: 20 });

export { aggregateActivity } from './aggregateActivity';
export {
  recoverStaleActivityAggregations,
  retryPendingActivityAggregations,
} from './activityAggregationRecovery';
export { participantCounter } from './participantCounter';
export { revenuecatWebhook } from './revenuecatWebhook';
export { battleStatusScheduler } from './battleScheduler';
export { onBattleFinished } from './onBattleFinished';
export { rankChangeScheduler } from './rankChangeScheduler';
export {
  onDeclarationCheerCreated,
  onPresenceCheerWritten,
  onReactionCreated,
  onUserTitlesUpdated,
} from './notifications';
export { validateBattleTitleOnCreate } from './battleTitleValidation';
export { onUserDeleted } from './onUserDeleted';
export { submitActivity } from './submitActivity';
export { deleteActivity } from './deleteActivity';
export { awardBadgesOnActivityAggregated, syncMyBadges } from './badges';
export { lookupBattleByInviteCode } from './lookupBattle';
export { createPrivateBattle } from './privateBattle';
export { joinBattle, leaveBattle } from './battleParticipation';
export { getBattleActivity, listBattleActivities } from './activityAccess';
export { backfillMonthlyStats } from './monthlyStatsBackfill';
export {
  completeDeclarationOnActivityCreated,
  completeRunDeclarationsForActivity,
} from './declarationCompletion';
