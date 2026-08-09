import assert from 'node:assert/strict';
import { aggregateMonthlyActivities, parseMonthlyStatsImpact, tokyoMonthKey as serverMonthKey } from '../functions/src/monthlyStats';
import {
  monthlyDistanceLowerBound,
  recentTokyoMonthKeys,
  reconcileMonthlyStats,
  tokyoMonthKey,
} from '../utils/monthlyStats';

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

assert.equal(aggregateMonthlyActivities([]).size, 0, '活動0件は月次ドキュメントを作らない');
assert.deepEqual(
  aggregateMonthlyActivities([{
    startedAtMs: Date.parse('2026-08-01T01:00:00.000Z'),
    distanceKm: 4.2,
    durationSec: 1500,
  }]).get('2026-08'),
  { monthKey: '2026-08', km: 4.2, count: 1, durationSec: 1500, elevationM: 0 },
  '活動1件（GPS・歩数共通の保存形式）を正確に集計する',
);

const aggregated = aggregateMonthlyActivities([
  ...Array.from({ length: 51 }, (_, index) => ({
    startedAtMs: Date.parse(`2026-08-${String((index % 28) + 1).padStart(2, '0')}T03:00:00.000Z`),
    distanceKm: 1,
    durationSec: 600,
    elevationM: 2,
  })),
  // 東京時間では8月1日00:00直前と直後。
  { startedAtMs: Date.parse('2026-07-31T14:59:59.000Z'), distanceKm: 2, durationSec: 1200 },
  { startedAtMs: Date.parse('2026-07-31T15:00:00.000Z'), distanceKm: 3, durationSec: 1800 },
  { startedAtMs: Date.parse('2026-08-01T00:00:00.000Z'), distanceKm: 99, durationSec: 1, flagged: true },
]);
assert.deepEqual(aggregated.get('2026-07'), {
  monthKey: '2026-07', km: 2, count: 1, durationSec: 1200, elevationM: 0,
});
assert.deepEqual(aggregated.get('2026-08'), {
  monthKey: '2026-08', km: 54, count: 52, durationSec: 32_400, elevationM: 102,
});

const reconciled = reconcileMonthlyStats([
  { monthKey: '2026-07', km: 80, count: 8, durationSec: 8_000, elevationM: 0 },
  { monthKey: '2026-08', km: 5, count: 1, durationSec: 1_000, elevationM: 0 },
], [
  { startedAt: '2026-07-02T00:00:00.000Z', distanceKm: 70, durationSeconds: 7_000 },
  { startedAt: '2026-08-02T00:00:00.000Z', distanceKm: 20, durationSeconds: 2_000 },
]);
assert.deepEqual(reconciled, [
  { monthKey: '2026-07', km: 80, count: 8, durationSec: 8_000, elevationM: 0 },
  { monthKey: '2026-08', km: 20, count: 1, durationSec: 2_000, elevationM: 0 },
]);
assert.equal(monthlyDistanceLowerBound(reconciled), 100, '生涯表示の下限は月次突合の合計を下回らない');

console.log('monthlyStats tests passed');
