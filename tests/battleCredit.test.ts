import assert from 'node:assert/strict';
import {
  BATTLE_RESULT_GRACE_MS,
  battleCreditEligibility,
  creditedBattleDistanceKm,
  tokyoDayKey,
} from '../functions/src/battleCredit';

assert.equal(creditedBattleDistanceKm('gps', 12, 99), 12, 'GPS距離は歩数の日次上限を受けない');
assert.equal(creditedBattleDistanceKm('steps', 3, 0), 3);
assert.equal(creditedBattleDistanceKm('steps', 4, 3), 2, '同日の残り枠だけを加算する');
assert.equal(creditedBattleDistanceKm('steps', 2, 5), 0, '日次上限到達後は追加加算しない');

assert.equal(tokyoDayKey(Date.parse('2026-07-19T14:59:59.000Z')), '20260719');
assert.equal(tokyoDayKey(Date.parse('2026-07-19T15:00:00.000Z')), '20260720', '東京時間0時で日付を切り替える');

const battleStartAtMs = Date.parse('2026-08-01T00:00:00.000Z');
const battleEndAtMs = Date.parse('2026-08-08T00:00:00.000Z');
const activityStartedAtMs = Date.parse('2026-08-02T01:00:00.000Z');
const activityEndedAtMs = Date.parse('2026-08-02T01:30:00.000Z');

assert.deepEqual(battleCreditEligibility({
  battleStatus: 'active',
  battleStartAtMs,
  battleEndAtMs,
  activityStartedAtMs,
  activityEndedAtMs,
  submittedAtMs: activityEndedAtMs + 12 * 60 * 60 * 1000,
}), { eligible: true }, '開催中なら12時間後のオフライン再送も加算対象');

assert.deepEqual(battleCreditEligibility({
  battleStatus: 'finished',
  battleStartAtMs,
  battleEndAtMs,
  activityStartedAtMs,
  activityEndedAtMs,
  submittedAtMs: battleEndAtMs + BATTLE_RESULT_GRACE_MS + 1,
}), { eligible: false, reason: 'battle-finalized' }, '結果確定後の再送は個人記録だけにする');

assert.deepEqual(battleCreditEligibility({
  battleStatus: 'active',
  battleStartAtMs,
  battleEndAtMs,
  activityStartedAtMs: battleStartAtMs - 1,
  activityEndedAtMs,
  submittedAtMs: activityEndedAtMs,
}), { eligible: false, reason: 'outside-period' }, '期間外に開始した記録は加算しない');

console.log('battle credit tests passed');
