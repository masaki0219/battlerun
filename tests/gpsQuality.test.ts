import assert from 'node:assert/strict';
import type { RoutePoint } from '../types';
import {
  hasStableStartAccuracy,
  hasUsableAltitude,
  hasUsableAutoPauseAccuracy,
  hasUsableDistanceAccuracy,
} from '../utils/gpsQuality';

function point(patch: Partial<RoutePoint> = {}): RoutePoint {
  return { lat: 37.9, lng: 140.1, timestamp: 1_000, ...patch };
}

assert.equal(hasUsableDistanceAccuracy(point({ accuracy: 80 })), true);
assert.equal(hasUsableDistanceAccuracy(point({ accuracy: 81 })), false);
assert.equal(hasUsableDistanceAccuracy(point()), true, '旧データのaccuracy欠損は互換性のため許可する');

assert.equal(hasStableStartAccuracy(point({ accuracy: 50 })), true);
assert.equal(hasStableStartAccuracy(point({ accuracy: 51 })), false);

assert.equal(hasUsableAutoPauseAccuracy(point({ accuracy: 35 })), true);
assert.equal(hasUsableAutoPauseAccuracy(point({ accuracy: 36 })), false);
assert.equal(hasUsableAutoPauseAccuracy(point()), false, '精度不明の点で自動停止を発火させない');

assert.equal(hasUsableAltitude(point({ alt: 100, altitudeAccuracy: 20 })), true);
assert.equal(hasUsableAltitude(point({ alt: 100, altitudeAccuracy: 21 })), false);

console.log('gps quality tests passed');
