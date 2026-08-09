import assert from 'node:assert/strict';
import { shouldIncrementMonthlyStats } from '../functions/src/activityAggregationPolicy';

const noBackfill = { version: 0, completedAtMs: null };
const backfilled = { version: 1, completedAtMs: 2_000 };

assert.equal(shouldIncrementMonthlyStats({
  hasMonthlyStatsImpact: false,
  submittedAtMs: 1_000,
  startedAtMs: 900,
}, noBackfill), true, 'バックフィル前の新規集計は月次へ加算する');

assert.equal(shouldIncrementMonthlyStats({
  hasMonthlyStatsImpact: true,
  submittedAtMs: 3_000,
  startedAtMs: 2_900,
}, noBackfill), false, '保存済みimpactがあれば再試行で二重加算しない');

assert.equal(shouldIncrementMonthlyStats({
  hasMonthlyStatsImpact: false,
  submittedAtMs: 1_000,
  startedAtMs: 900,
}, backfilled), false, 'バックフィル完了前に保存された未集計活動は既に月次へ含まれる');

assert.equal(shouldIncrementMonthlyStats({
  hasMonthlyStatsImpact: false,
  submittedAtMs: 2_001,
  startedAtMs: 1_900,
}, backfilled), true, 'バックフィル完了後に保存された活動は月次へ加算する');

assert.equal(shouldIncrementMonthlyStats({
  hasMonthlyStatsImpact: false,
  submittedAtMs: null,
  startedAtMs: 1_500,
}, backfilled), false, '旧活動はstartedAtを境界判定へ使う');

console.log('activity aggregation policy tests passed');
