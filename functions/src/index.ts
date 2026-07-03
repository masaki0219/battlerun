import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { aggregateActivity } from './aggregateActivity';
export { participantCounter } from './participantCounter';
export { revenuecatWebhook } from './revenuecatWebhook';
export { battleStatusScheduler } from './battleScheduler';
export { rankChangeScheduler } from './rankChangeScheduler';
export { onReactionCreated, onUserTitlesUpdated } from './notifications';
export { validateBattleTitleOnCreate } from './battleTitleValidation';
export { onUserDeleted } from './onUserDeleted';
