import assert from 'node:assert/strict';
import { daysLeft, streakDays, weekOverWeek, weeklyBuckets } from '../utils/displayStats';
import type { Activity } from '../types';

function activity(startedAt: string, distanceKm: number): Activity {
  return {
    id: startedAt,
    userId: 'u',
    distanceKm,
    durationSeconds: 600,
    measurementType: 'gps',
    startedAt,
    endedAt: startedAt,
  };
}

const now = new Date('2026-07-12T12:00:00+09:00');
const items = [
  activity('2026-07-12T07:00:00+09:00', 3),
  activity('2026-07-11T07:00:00+09:00', 2),
  activity('2026-07-05T07:00:00+09:00', 4),
];

assert.equal(weeklyBuckets(items, now).reduce((sum, day) => sum + day.km, 0), 5);
assert.equal(streakDays(items, now), 2);
assert.deepEqual(weekOverWeek(items, now), { thisWeekKm: 5, lastWeekKm: 4, changeRatio: 0.25 });
assert.equal(daysLeft('invalid', now), null);
assert.equal(daysLeft('2026-07-14T12:00:00+09:00', now), 2);

console.log('displayStats tests passed');
