import assert from 'node:assert/strict';
import { buildRunShareMessage, formatShareDuration, ZELIO_DISCOVERY_URL } from '../utils/runShare';
import {
  DEFAULT_RUN_SHARE_STYLE,
  parseRunSharePreference,
  runSharePreferenceKey,
  serializeRunSharePreference,
} from '../utils/runSharePreference';

assert.equal(formatShareDuration(0), '00:00');
assert.equal(formatShareDuration(65), '01:05');
assert.equal(formatShareDuration(3665), '1:01:05');
assert.equal(formatShareDuration(Number.NaN), '00:00');
assert.equal(DEFAULT_RUN_SHARE_STYLE, 'stats');
assert.equal(parseRunSharePreference(null), 'stats');
assert.equal(parseRunSharePreference('0'), 'stats');
assert.equal(parseRunSharePreference('1'), 'map');
assert.equal(parseRunSharePreference('map'), 'map');
assert.equal(parseRunSharePreference('route'), 'route');
assert.equal(parseRunSharePreference('stats'), 'stats');
assert.equal(serializeRunSharePreference('route'), 'route');
assert.equal(runSharePreferenceKey('alice'), '@zelio_run_share_include_route:alice');
assert.equal(ZELIO_DISCOVERY_URL, 'https://apps.apple.com/jp/app/zelio/id6792252669');

{
  const message = buildRunShareMessage({
    distanceKm: 5.26,
    durationSeconds: 1600,
    pace: "5'04\"",
    dateLabel: '7月31日',
    impactLabel: '「朝ラン対決」に5.26km貢献',
    language: 'ja',
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
    language: 'ja',
  });
  assert.match(message, /^今日のラン: 0\.00km\nタイム 00:00\n/);
  assert.doesNotMatch(message, /平均ペース/);
}

console.log('run share tests passed');
