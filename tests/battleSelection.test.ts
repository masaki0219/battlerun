import assert from 'node:assert/strict';
import { resolveDisplayedBattle, sortActiveBattlesForDisplay } from '../utils/battleSelection';

const first = { id: 'first', endAt: '2026-08-10T00:00:00.000Z' };
const second = { id: 'second', endAt: '2026-08-05T00:00:00.000Z' };
const third = { id: 'third', endAt: '2026-08-05T00:00:00.000Z' };

assert.deepEqual(sortActiveBattlesForDisplay([]), []);
assert.deepEqual(sortActiveBattlesForDisplay([first]).map((battle) => battle.id), ['first']);
assert.deepEqual(
  sortActiveBattlesForDisplay([first, second]).map((battle) => battle.id),
  ['second', 'first'],
);
assert.deepEqual(
  sortActiveBattlesForDisplay([first, second, third]).map((battle) => battle.id),
  ['second', 'third', 'first'],
);
assert.deepEqual(
  sortActiveBattlesForDisplay([
    { id: 'unknown-a', endAt: '' },
    second,
    { id: 'unknown-b', endAt: 'invalid' },
  ]).map((battle) => battle.id),
  ['second', 'unknown-a', 'unknown-b'],
);

const sorted = sortActiveBattlesForDisplay([first, second, third]);
assert.equal(resolveDisplayedBattle(sorted, 'first')?.id, 'first');
assert.equal(resolveDisplayedBattle(sorted, 'missing')?.id, 'second');
assert.equal(resolveDisplayedBattle(sorted, null)?.id, 'second');
assert.equal(resolveDisplayedBattle([], 'first'), null);

console.log('battle selection tests passed');
