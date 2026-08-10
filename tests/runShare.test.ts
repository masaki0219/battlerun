import assert from 'node:assert/strict';
import { buildRunShareMessage, formatShareDuration, ZELIO_DISCOVERY_URL } from '../utils/runShare';
import {
  DEFAULT_INCLUDE_ROUTE_IN_SHARE,
  parseRunSharePreference,
  runSharePreferenceKey,
  serializeRunSharePreference,
} from '../utils/runSharePreference';

assert.equal(formatShareDuration(0), '00:00');
assert.equal(formatShareDuration(65), '01:05');
assert.equal(formatShareDuration(3665), '1:01:05');
assert.equal(formatShareDuration(Number.NaN), '00:00');
assert.equal(DEFAULT_INCLUDE_ROUTE_IN_SHARE, false);
assert.equal(parseRunSharePreference(null), false);
assert.equal(parseRunSharePreference('0'), false);
assert.equal(parseRunSharePreference('1'), true);
assert.equal(serializeRunSharePreference(false), '0');
assert.equal(runSharePreferenceKey('alice'), '@zelio_run_share_include_route:alice');
assert.equal(ZELIO_DISCOVERY_URL, 'https://masaki0219.github.io/app-support/zelio/');

{
  const message = buildRunShareMessage({
    distanceKm: 5.26,
    durationSeconds: 1600,
    pace: "5'04\"",
    dateLabel: '7月31日',
    impactLabel: '「朝ラン対決」に5.26km貢献',
  });
  assert.match(message, /7月31日のラン: 5\.26km/);
  assert.match(message, /タイム 26:40 ・ 平均ペース 5'04"\/km/);
  assert.match(message, /朝ラン対決/);
  assert.match(message, /#ZELIO/);
  assert.ok(message.endsWith(ZELIO_DISCOVERY_URL));
}

{
  const message = buildRunShareMessage({
    distanceKm: Number.NaN,
    durationSeconds: -1,
    pace: "--'--\"",
  });
  assert.match(message, /^今日のラン: 0\.00km\nタイム 00:00\n/);
  assert.doesNotMatch(message, /平均ペース/);
}

console.log('run share tests passed');
