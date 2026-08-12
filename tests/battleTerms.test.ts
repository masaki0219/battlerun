import assert from 'node:assert/strict';
import {
  buildBattleTermPeriods,
  DEFAULT_TERM_COUNT,
  DEFAULT_TERM_LENGTH_DAYS,
  periodIsWithin,
} from '../utils/battleTerms';

const start = new Date(2026, 7, 3);
const periods = buildBattleTermPeriods(start);
assert.equal(periods.length, DEFAULT_TERM_COUNT);
assert.equal(DEFAULT_TERM_LENGTH_DAYS, 14);
assert.deepEqual(
  periods.map((period) => [
    period.termIndex,
    period.startAt.getFullYear(), period.startAt.getMonth() + 1, period.startAt.getDate(),
    period.endAt.getFullYear(), period.endAt.getMonth() + 1, period.endAt.getDate(),
  ]),
  [
    [1, 2026, 8, 3, 2026, 8, 16],
    [2, 2026, 8, 17, 2026, 8, 30],
    [3, 2026, 8, 31, 2026, 9, 13],
  ],
);
assert.equal(periods[0].endAt.getHours(), 23);
assert.equal(periods[0].endAt.getMilliseconds(), 999);
assert.equal(periods[0].endAt.getTime() + 1, periods[1].startAt.getTime(), 'ターム境界に空白を作らない');
assert.equal(periodIsWithin(start, periods[2].endAt, periods[0].startAt, periods[2].endAt), true);
assert.equal(periodIsWithin(periods[0].startAt, periods[1].endAt, periods[0].startAt, periods[2].endAt), false);
assert.deepEqual(buildBattleTermPeriods(start, 0, 14), []);
assert.deepEqual(buildBattleTermPeriods(start, 3, 32), []);

console.log('battle term tests passed');
