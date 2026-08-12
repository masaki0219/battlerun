import assert from 'node:assert/strict';
import {
  notificationLocalState,
  notificationTimeZone,
} from '../functions/src/rankNotificationTiming';

assert.equal(
  notificationTimeZone({ timezone: 'America/Los_Angeles', market: 'JP' }),
  'America/Los_Angeles',
  '保存済みIANAタイムゾーンをmarketより優先する',
);
assert.equal(notificationTimeZone({ market: 'JP' }), 'Asia/Tokyo');
assert.equal(notificationTimeZone({ market: 'US' }), 'America/New_York');
assert.equal(notificationTimeZone({ timezone: 'invalid timezone', market: 'GLOBAL' }), 'UTC');

assert.deepEqual(
  notificationLocalState(new Date('2026-08-12T12:59:00.000Z'), 'UTC'),
  { dateKey: '2026-08-12', quietHours: false },
);
assert.equal(notificationLocalState(new Date('2026-08-12T21:59:00.000Z'), 'UTC').quietHours, false);
assert.equal(notificationLocalState(new Date('2026-08-12T22:00:00.000Z'), 'UTC').quietHours, true);
assert.equal(notificationLocalState(new Date('2026-08-12T06:59:00.000Z'), 'UTC').quietHours, true);
assert.equal(notificationLocalState(new Date('2026-08-12T07:00:00.000Z'), 'UTC').quietHours, false);

const sameInstant = new Date('2026-08-12T05:00:00.000Z');
assert.deepEqual(
  notificationLocalState(sameInstant, 'Asia/Tokyo'),
  { dateKey: '2026-08-12', quietHours: false },
);
assert.deepEqual(
  notificationLocalState(sameInstant, 'America/Los_Angeles'),
  { dateKey: '2026-08-11', quietHours: true },
);

console.log('rank notification timezone / quiet hours tests passed');
