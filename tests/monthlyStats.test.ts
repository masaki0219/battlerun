import assert from 'node:assert/strict';
import { parseMonthlyStatsImpact, tokyoMonthKey as serverMonthKey } from '../functions/src/monthlyStats';
import { recentTokyoMonthKeys, tokyoMonthKey } from '../utils/monthlyStats';

const julyBoundary = new Date('2026-06-30T15:00:00.000Z');
assert.equal(tokyoMonthKey(julyBoundary), '2026-07');
assert.equal(serverMonthKey(julyBoundary.getTime()), '2026-07');
assert.deepEqual(
  recentTokyoMonthKeys(new Date('2026-02-15T00:00:00.000Z'), 4),
  ['2025-11', '2025-12', '2026-01', '2026-02'],
);
assert.deepEqual(
  parseMonthlyStatsImpact({
    monthKey: '2026-07', km: 5, count: 1, durationSec: 1800, elevationM: 30,
  }),
  { monthKey: '2026-07', km: 5, count: 1, durationSec: 1800, elevationM: 30 },
);
assert.equal(
  parseMonthlyStatsImpact({
    monthKey: '2026-13', km: 5, count: 1, durationSec: 1800, elevationM: 30,
  }),
  null,
);

console.log('monthlyStats tests passed');
