import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import {
  MAX_ACTIVE_BATTLE_COUNT,
  canLeaveParticipant,
  isActiveBattleAt,
  shouldRetainBattleMembership,
} from '../functions/src/battleParticipation';

assert.equal(MAX_ACTIVE_BATTLE_COUNT, 2);
assert.equal(canLeaveParticipant({ totalDistanceKm: 0, activityCount: 0 }), true);
assert.equal(canLeaveParticipant({ totalDistanceKm: 0.1, activityCount: 0 }), false);
assert.equal(canLeaveParticipant({ totalDistanceKm: 0, activityCount: 1 }), false);
assert.equal(canLeaveParticipant({ totalDistanceKm: 0, stepCreditKmByDay: { '2026-08-01': 1 } }), false);

const now = Date.parse('2026-08-01T12:00:00Z');
assert.equal(isActiveBattleAt({
  status: 'active',
  startAt: Timestamp.fromMillis(now - 1),
  endAt: Timestamp.fromMillis(now + 1),
}, now), true);
assert.equal(isActiveBattleAt({
  status: 'finished',
  startAt: Timestamp.fromMillis(now - 1),
  endAt: Timestamp.fromMillis(now + 1),
}, now), false);
assert.equal(shouldRetainBattleMembership({
  status: 'upcoming',
  endAt: Timestamp.fromMillis(now + 86400000),
}, now), true);
assert.equal(shouldRetainBattleMembership({
  status: 'finished',
  endAt: Timestamp.fromMillis(now - 1),
}, now), false, '終了済みIDは次回参加時にbattleIdsから間引く');
assert.equal(shouldRetainBattleMembership({
  status: 'active',
  endAt: Timestamp.fromMillis(now - 1),
}, now), false, 'スケジューラ反映待ちでも期間終了済みなら間引く');

console.log('battle participation tests passed');
