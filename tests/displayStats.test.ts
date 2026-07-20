import assert from 'node:assert/strict';
import { calendarWeekKey, daysLeft, hasHighTrainingLoad, streakDays, weekOverWeek, weeklyBuckets } from '../utils/displayStats';
import { emptyAutoPauseDetector, evaluateAutoPause } from '../utils/autoPause';
import { buildVoiceCoachAnnouncement, DEFAULT_VOICE_COACH_SETTINGS, spokenPace } from '../utils/voiceCoach';
import { isQuietHours } from '../utils/notificationTiming';
import { declarationDocumentId, declarationTimeLabel, localDateKey } from '../utils/declarations';
import { validateDeclarationNote } from '../lib/validation/declaration';
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
assert.equal(calendarWeekKey(new Date(2026, 6, 12, 12)), '2026-07-06');
assert.equal(hasHighTrainingLoad([
  activity('2026-07-12T07:00:00+09:00', 16),
  activity('2026-07-05T07:00:00+09:00', 10),
], now), true);
assert.equal(isQuietHours(new Date(2026, 6, 20, 6, 59)), true);
assert.equal(isQuietHours(new Date(2026, 6, 20, 7, 0)), false);
assert.equal(isQuietHours(new Date(2026, 6, 20, 22, 0)), true);
const declarationDate = new Date(2026, 6, 20, 19, 0);
assert.equal(localDateKey(declarationDate), '20260720');
assert.equal(declarationDocumentId('alice', declarationDate), 'alice_20260720');
assert.equal(declarationTimeLabel(declarationDate.toISOString()), '19:00ごろ');
assert.equal(validateDeclarationNote('ゆっくり走る').ok, true);
assert.equal(validateDeclarationNote('123456789012345678901').ok, false);
assert.equal(validateDeclarationNote('iPhone').ok, false);

function point(metersNorth: number, timestamp: number) {
  return { lat: 35 + metersNorth / 111_000, lng: 139, timestamp };
}

let detector = emptyAutoPauseDetector();
let decision = evaluateAutoPause(detector, point(0, 0), false);
assert.equal(decision.type, 'append');
detector = decision.next;
for (let second = 1; second <= 4; second++) {
  decision = evaluateAutoPause(detector, point(0, second * 1_000), false);
  assert.equal(decision.type, 'hold');
  detector = decision.next;
}
decision = evaluateAutoPause(detector, point(0, 5_000), false);
assert.equal(decision.type, 'pause');
if (decision.type === 'pause') assert.equal(decision.pausedAtMs, 0);
detector = decision.next;
decision = evaluateAutoPause(detector, point(2, 6_000), true);
assert.equal(decision.type, 'resume');

detector = emptyAutoPauseDetector();
decision = evaluateAutoPause(detector, point(0, 0), false, 0);
assert.equal(decision.type, 'hold');
detector = decision.next;
for (let second = 1; second <= 5; second++) {
  decision = evaluateAutoPause(detector, point(0, second * 1_000), false, 0);
  detector = decision.next;
}
assert.equal(decision.type, 'pause');
decision = evaluateAutoPause(detector, point(0.8, 6_000), true, 0.8);
assert.equal(decision.type, 'hold');
detector = decision.next;
decision = evaluateAutoPause(detector, point(2.1, 7_000), true, 1.3);
assert.equal(decision.type, 'resume');

detector = emptyAutoPauseDetector();
decision = evaluateAutoPause(detector, point(0, 0), false);
detector = decision.next;
for (let second = 1; second <= 4; second++) {
  decision = evaluateAutoPause(detector, point(0, second * 1_000), false);
  detector = decision.next;
}
decision = evaluateAutoPause(detector, point(1, 5_000), false);
assert.equal(decision.type, 'append');
if (decision.type === 'append') assert.equal(decision.points.length, 5);

assert.equal(spokenPace(372), 'キロ 6分12秒');
assert.equal(
  buildVoiceCoachAnnouncement(DEFAULT_VOICE_COACH_SETTINGS, {
    elapsedSeconds: 372,
    distanceKm: 1,
    lapElapsedSeconds: 372,
    lapDistanceKm: 1,
  }),
  '距離、1.00キロメートル。平均ペース、キロ 6分12秒',
);

console.log('displayStats / autoPause / voiceCoach / declarations / notificationTiming tests passed');
