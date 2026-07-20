import assert from 'node:assert/strict';
import {
  elevationGainMeters,
  fastestSegmentSeconds,
  mergePersonalRecords,
  type TimedRoutePoint,
} from '../functions/src/personalRecords';

const KM_PER_LONGITUDE_DEGREE_AT_EQUATOR = 111.19492664455873;

function point(km: number, timestampSeconds: number, seg = false): TimedRoutePoint {
  return {
    lat: 0,
    lng: km / KM_PER_LONGITUDE_DEGREE_AT_EQUATOR,
    timestamp: timestampSeconds * 1_000,
    ...(seg ? { seg: true as const } : {}),
  };
}

assert.equal(
  fastestSegmentSeconds([point(0, 0), point(0.9, 90)], 1),
  null,
  '目標距離に満たないルートは記録を作らない',
);

assert.equal(
  fastestSegmentSeconds([
    point(0, 0),
    point(0.6, 60),
    point(10, 120, true),
    point(10.6, 180),
  ], 1),
  null,
  '一時停止のセグメント境界を跨いで距離を合算しない',
);

assert.equal(
  fastestSegmentSeconds([point(0, 0), point(0.6, 60), point(1.2, 180)], 1),
  140,
  'GPS点の間を線形補間して1kmの経過時間を求める',
);

assert.equal(
  elevationGainMeters([
    { ...point(0, 0), alt: 10 },
    { ...point(0.1, 10), alt: 12 },
    { ...point(0.2, 20), alt: 14 },
    { ...point(0.3, 30), alt: 11 },
    { ...point(0.4, 40), alt: 16 },
  ]),
  9,
  '3m未満の高度ノイズを除外して獲得標高を集計する',
);

assert.deepEqual(
  mergePersonalRecords(
    { fastest1kSec: 300, longestRunKm: 8 },
    { fastest1kSec: 290, longestRunKm: 7, bestMonthKm: 20 },
  ),
  {
    records: { fastest1kSec: 290, longestRunKm: 8, bestMonthKm: 20 },
    newRecords: ['fastest1kSec', 'bestMonthKm'],
  },
  '最速記録は小さい値、それ以外は大きい値だけを更新する',
);

console.log('personalRecords tests passed');
