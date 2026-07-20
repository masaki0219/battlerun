import assert from 'node:assert/strict';
import {
  creditedBattleDistanceKm,
  tokyoDayKey,
} from '../functions/src/battleCredit';

assert.equal(creditedBattleDistanceKm('gps', 12, 99), 12, 'GPS距離は歩数の日次上限を受けない');
assert.equal(creditedBattleDistanceKm('steps', 3, 0), 3);
assert.equal(creditedBattleDistanceKm('steps', 4, 3), 2, '同日の残り枠だけを加算する');
assert.equal(creditedBattleDistanceKm('steps', 2, 5), 0, '日次上限到達後は追加加算しない');

assert.equal(tokyoDayKey(Date.parse('2026-07-19T14:59:59.000Z')), '20260719');
assert.equal(tokyoDayKey(Date.parse('2026-07-19T15:00:00.000Z')), '20260720', '東京時間0時で日付を切り替える');

console.log('battle credit tests passed');
