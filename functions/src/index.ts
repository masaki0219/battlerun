import { initializeApp } from 'firebase-admin/app';

initializeApp();

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
export { joinBattle, leaveBattle } from './battleParticipation';
export { backfillMonthlyStats } from './monthlyStatsBackfill';
export {
  completeDeclarationOnActivityCreated,
  completeRunDeclarationsForActivity,
} from './declarationCompletion';
