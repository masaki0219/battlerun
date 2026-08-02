import assert from 'node:assert/strict';
import * as clientGps from '../utils/gpsProcessing';
import * as serverGps from '../functions/src/gpsProcessing';
import {
  createInitialGpsProcessingState,
  processGpsPoint,
  replayGpsLog,
  type GpsInputPoint,
  type ProcessGpsPointOptions,
} from '../utils/gpsProcessing';
import { emptyAutoPauseDetector, evaluateAutoPause } from '../utils/autoPause';
import type { RoutePoint } from '../types';

const METERS_PER_LATITUDE_DEGREE = 111_194.926_645;

function point(northM: number, timestamp: number, accuracy = 5): GpsInputPoint {
  return {
    lat: 35 + northM / METERS_PER_LATITUDE_DEGREE,
    lng: 139,
    timestamp,
    accuracy,
  };
}

function autoPoint(northM: number, timestamp: number): RoutePoint {
  return point(northM, timestamp) as RoutePoint;
}

function processSequence(
  points: GpsInputPoint[],
  optionAt: (index: number) => ProcessGpsPointOptions = () => ({}),
) {
  let state = createInitialGpsProcessingState();
  const outcomes = points.map((item, index) => {
    const outcome = processGpsPoint(state, item, optionAt(index));
    state = outcome.nextState;
    return outcome;
  });
  return { state, outcomes };
}

// 1. 既知1,000mの直線移動。フィルタ後も幾何距離と一致する。
const straight = Array.from({ length: 201 }, (_, index) => point(index * 5, index * 1_000));
const straightReplay = replayGpsLog(straight);
assert.ok(Math.abs(straightReplay.filteredDistanceM - 1_000) < 0.5);
assert.equal(straightReplay.rejectedPointCount, 0);

// 2. 1〜2mの左右揺れでcommitAnchorを更新せず、逐次合算しない。
const jitter = [
  point(0, 0),
  ...Array.from({ length: 20 }, (_, index) => point(index % 2 === 0 ? 1.8 : -1.8, (index + 1) * 1_000)),
];
const jitterReplay = replayGpsLog(jitter);
assert.equal(jitterReplay.filteredDistanceM, 0);
assert.equal(jitterReplay.acceptedPointCount, 1);
assert.equal(jitterReplay.rejectionCounts.MICRO_JITTER, 20);

// 3. 100m/1秒の単発ジャンプは除外し、正常ルートに戻った点は採用できる。
const jumpReplay = replayGpsLog([
  point(0, 0),
  point(5, 1_000),
  point(105, 2_000),
  point(10, 3_000),
]);
assert.equal(jumpReplay.rejectionCounts.IMPOSSIBLE_SPEED, 1);
assert.ok(Math.abs(jumpReplay.filteredDistanceM - 10) < 0.1);

// commitAnchorが静止中に古くなっても、直前の良好点との速度で単発ジャンプを検出する。
const delayedJumpReplay = replayGpsLog([
  point(0, 0),
  ...Array.from({ length: 19 }, (_, index) => point(index % 2 === 0 ? 1 : -1, (index + 1) * 1_000)),
  point(100, 20_000),
]);
assert.equal(delayedJumpReplay.samples[delayedJumpReplay.samples.length - 1]?.rejectionReason, 'IMPOSSIBLE_SPEED');
assert.equal(delayedJumpReplay.filteredDistanceM, 0);

// 4. accuracy 80mの点は次の正常点のcommitAnchorにならない。
const poorAccuracyReplay = replayGpsLog([
  point(0, 0),
  point(80, 1_000, 80),
  point(10, 2_000),
]);
assert.equal(poorAccuracyReplay.rejectionCounts.POOR_ACCURACY, 1);
assert.ok(Math.abs(poorAccuracyReplay.filteredDistanceM - 10) < 0.1);

// 5. 20秒のGPS空白は前後を接続せず、新しいセグメントにする。
const gapReplay = replayGpsLog([
  point(0, 0),
  point(10, 2_000),
  point(110, 22_000),
]);
assert.ok(Math.abs(gapReplay.filteredDistanceM - 10) < 0.1);
assert.equal(gapReplay.rejectionCounts.GPS_GAP, 1);
assert.equal(gapReplay.segmentCount, 2);
assert.equal(gapReplay.summary.maxGapMs, 20_000);

// 6. timestamp逆転。
const reverseReplay = replayGpsLog([point(0, 1_000), point(5, 2_000), point(6, 1_500)]);
assert.equal(reverseReplay.rejectionCounts.NON_MONOTONIC_TIMESTAMP, 1);

// 7. 同一timestamp・同一座標の重複配信。
const duplicate = point(5, 2_000);
const duplicateReplay = replayGpsLog([point(0, 1_000), duplicate, { ...duplicate }]);
assert.equal(duplicateReplay.rejectionCounts.DUPLICATE, 1);

const invalidReplay = replayGpsLog([
  { lat: Number.NaN, lng: 139, timestamp: 1_000, accuracy: 5 },
  { lat: 35, lng: 139, timestamp: 2_000, accuracy: 0 },
]);
assert.equal(invalidReplay.rejectionCounts.INVALID_COORDINATE, 1);
assert.equal(invalidReplay.rejectionCounts.INVALID_ACCURACY, 1);

// 8. 手動一時停止中を距離に入れず、再開点は新しい基準点にする。
const manualPause = processSequence(
  [point(0, 0), point(10, 2_000), point(100, 4_000), point(110, 6_000)],
  (index) => index === 2 ? { paused: true } : index === 3 ? { forceNewSegment: true } : {},
);
assert.ok(Math.abs(manualPause.state.filteredDistanceM - 10) < 0.1);
assert.equal(manualPause.outcomes[2].rejectionReason, 'PAUSED');
assert.equal(manualPause.outcomes[3].rejectionReason, 'SEGMENT_BREAK');

// 9. オートポーズ中の単発ジャンプでは即時再開しない。
let detector = emptyAutoPauseDetector();
let autoDecision = evaluateAutoPause(detector, autoPoint(0, 0), true, 0);
detector = autoDecision.next;
autoDecision = evaluateAutoPause(detector, autoPoint(100, 1_000), true, 100);
assert.equal(autoDecision.type, 'hold');
detector = autoDecision.next;
autoDecision = evaluateAutoPause(detector, autoPoint(0, 2_000), true, 100);
assert.equal(autoDecision.type, 'hold');
detector = autoDecision.next;
autoDecision = evaluateAutoPause(detector, autoPoint(0, 3_000), true, 0);
assert.equal(autoDecision.type, 'hold');

// 10. 0.8m/sの低速ウォーキングは停止扱いにしない。
detector = emptyAutoPauseDetector();
for (let second = 0; second <= 12; second++) {
  autoDecision = evaluateAutoPause(detector, autoPoint(second * 0.8, second * 1_000), false, 0.8);
  assert.notEqual(autoDecision.type, 'pause');
  detector = autoDecision.next;
}

// 11. クライアントとFunctionsは同一fixtureに同じ実装・理由・距離を使う。
const parityFixture = [
  point(0, 0),
  point(1, 1_000),
  point(5, 2_000),
  point(100, 3_000, 80),
  point(10, 4_000),
  { ...point(10, 4_000) },
  point(110, 24_000),
];
const clientReplay = clientGps.replayGpsLog(parityFixture);
const serverReplay = serverGps.replayGpsLog(parityFixture);
assert.equal(clientReplay.filteredDistanceM, serverReplay.filteredDistanceM);
assert.deepEqual(
  clientReplay.samples.map((sample) => sample.rejectionReason),
  serverReplay.samples.map((sample) => sample.rejectionReason),
);
assert.equal(clientReplay.acceptedPointCount, serverReplay.acceptedPointCount);
const formalServerReplay = serverGps.replayAcceptedGpsRoute(clientReplay.processedRoute);
assert.equal(formalServerReplay.filteredDistanceM, clientReplay.filteredDistanceM);

// MICRO_JITTERが長く続く場合も、クライアント採用ルートのFunctions再生は同じ距離になる。
const longJitterFixture = [
  point(0, 0),
  ...Array.from({ length: 20 }, (_, index) => point(index % 2 === 0 ? 1 : -1, (index + 1) * 1_000)),
  point(5, 21_000),
];
const longJitterClient = clientGps.replayGpsLog(longJitterFixture);
const longJitterServer = serverGps.replayAcceptedGpsRoute(longJitterClient.processedRoute);
assert.equal(longJitterServer.filteredDistanceM, longJitterClient.filteredDistanceM);

// 12. 終了直前の3m未満の端数は無条件に足さない。
const tailReplay = replayGpsLog([point(0, 0), point(5, 1_000), point(7, 2_000)]);
assert.ok(Math.abs(tailReplay.filteredDistanceM - 5) < 0.1);
assert.equal(tailReplay.processedRoute.length, 2);
assert.equal(tailReplay.samples[tailReplay.samples.length - 1]?.rejectionReason, 'MICRO_JITTER');

// 長時間記録でも品質統計用サンプルを無制限に持たない。
const longStationary = processSequence(
  Array.from({ length: 2_100 }, (_, index) => point(0, index * 1_000, 5 + (index % 20))),
);
assert.equal(
  longStationary.state.accuracySamplesM.length,
  clientGps.GPS_QUALITY_ACCURACY_SAMPLE_LIMIT,
);

console.log('gps processing / replay / auto pause tests passed');
