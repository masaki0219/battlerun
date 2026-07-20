import assert from 'node:assert/strict';
import {
  PRESENCE_ACTIVE_WINDOW_MS,
  isPresenceFresh,
  presenceSessionId,
} from '../utils/presence';

const now = Date.parse('2026-07-20T12:00:00.000Z');
assert.equal(isPresenceFresh(true, now, now), true);
assert.equal(isPresenceFresh(true, now - PRESENCE_ACTIVE_WINDOW_MS, now), true);
assert.equal(isPresenceFresh(true, now - PRESENCE_ACTIVE_WINDOW_MS - 1, now), false);
assert.equal(isPresenceFresh(false, now, now), false);
assert.equal(isPresenceFresh(true, Number.NaN, now), false);
assert.equal(presenceSessionId('2026-07-20T12:00:00+09:00'), '2026-07-20T03:00:00.000Z');
assert.equal(presenceSessionId('invalid'), null);
assert.equal(presenceSessionId(null), null);

console.log('presence tests passed');
