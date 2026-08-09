import assert from 'node:assert/strict';
import * as clientGps from '../utils/gpsProcessing';
import * as serverGps from '../functions/src/gpsProcessing';
import {
  createInitialGpsProcessingState,
  finalizeGpsProcessing,
  processGpsPoint,
  requestGpsProcessingSegmentBreak,
  replayGpsLog,
  type GpsInputPoint,
  type ProcessGpsPointOptions,
} from '../utils/gpsProcessing';
import { emptyAutoPauseDetector, evaluateAutoPause } from '../utils/autoPause';
import type { RoutePoint } from '../types';

const METERS_PER_LATITUDE_DEGREE = 111_194.926_645;
const BASE_LATITUDE = 35;
const METERS_PER_LONGITUDE_DEGREE = METERS_PER_LATITUDE_DEGREE
  * Math.cos(BASE_LATITUDE * Math.PI / 180);

function point(northM: number, timestamp: number, accuracy = 5): GpsInputPoint {
  return pointXY(0, northM, timestamp, accuracy);
}

function pointXY(eastM: number, northM: number, timestamp: number, accuracy = 5): GpsInputPoint {
  return {
    lat: BASE_LATITUDE + northM / METERS_PER_LATITUDE_DEGREE,
    lng: 139 + eastM / METERS_PER_LONGITUDE_DEGREE,
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
  const accepted: clientGps.ProcessedGpsPoint[] = [];
  const outcomes = points.map((item, index) => {
    const outcome = processGpsPoint(state, item, optionAt(index));
    state = outcome.nextState;
    accepted.push(...outcome.acceptedPoints);
    return outcome;
  });
  return { state, outcomes, accepted };
}

// 一定速度の既知1,000m直線。v3の1点保留とfinalize後も幾何距離と一致する。
const straight = Array.from({ length: 201 }, (_, index) => point(index * 5, index * 1_000));
const straightReplay = replayGpsLog(straight);
assert.ok(Math.abs(straightReplay.filteredDistanceM - 1_000) < 0.5);
assert.equal(straightReplay.rejectedPointCount, 0);
assert.equal(straightReplay.processingVersion, 3);
assert.ok(straightReplay.v2FilteredDistanceM != null);
assert.ok(Math.abs(straightReplay.differenceFromV2M ?? Infinity) < 0.01);

// 90度の曲がり角を単発スパイクとして削らない。
const rightAngle = replayGpsLog([
  pointXY(0, 0, 0),
  pointXY(5, 0, 1_000),
  pointXY(10, 0, 2_000),
  pointXY(10, 5, 3_000),
  pointXY(10, 10, 4_000),
]);
assert.ok(Math.abs(rightAngle.filteredDistanceM - 20) < 0.2);
assert.equal(rightAngle.rejectionCounts.THREE_POINT_SPIKE, undefined);

// Uターン/折り返しは、進入方向とA-Bが整合する通常の方向転換として保持する。
const uTurn = replayGpsLog([
  pointXY(0, 0, 0),
  pointXY(5, 0, 1_000),
  pointXY(10, 0, 2_000),
  pointXY(5, 0, 3_000),
  pointXY(0, 0, 4_000),
  pointXY(-5, 0, 5_000),
]);
assert.ok(Math.abs(uTurn.filteredDistanceM - 25) < 0.2);
assert.equal(uTurn.rejectionCounts.THREE_POINT_SPIKE, undefined);

// 0.8m/sの低速方向転換はcourse相当の方向変化だけで除外しない。
const slowTurnaround = replayGpsLog([
  pointXY(0, 0, 0),
  pointXY(4, 0, 5_000),
  pointXY(8, 0, 10_000),
  pointXY(4, 0, 15_000),
  pointXY(0, 0, 20_000),
]);
assert.ok(Math.abs(slowTurnaround.filteredDistanceM - 16) < 0.2);
assert.equal(slowTurnaround.rejectionCounts.CONDITIONAL_ACCURACY_REJECTED, undefined);

// 小さなカーブは各点を強く平滑化せず、入力折れ線の長さを維持する。
const curvePoints = [
  pointXY(0, 0, 0),
  pointXY(4, 0, 1_000),
  pointXY(7, 2, 2_000),
  pointXY(9, 5, 3_000),
  pointXY(10, 9, 4_000),
];
const curveExpected = curvePoints.slice(1).reduce((sum, item, index) => (
  sum + clientGps.haversineDistanceM(
    curvePoints[index] as clientGps.ProcessedGpsPoint,
    item as clientGps.ProcessedGpsPoint,
  )
), 0);
const curve = replayGpsLog(curvePoints);
assert.ok(Math.abs(curve.filteredDistanceM - curveExpected) < 0.1);

// accuracy 5〜15mは高信頼、15〜25mでも一貫する直線は条件付き採用する。
const tieredAccuracy = replayGpsLog([
  point(0, 0, 5),
  point(5, 1_000, 15),
  point(10, 2_000, 20),
  point(15, 3_000, 25),
  point(20, 4_000, 5),
]);
assert.ok(Math.abs(tieredAccuracy.filteredDistanceM - 20) < 0.1);
assert.equal(tieredAccuracy.summary.highConfidencePointCount, 3);
assert.equal(tieredAccuracy.summary.conditionalPointCount, 2);
assert.equal(tieredAccuracy.summary.conditionalAcceptedPointCount, 2);
assert.equal(tieredAccuracy.summary.conditionalRejectedPointCount, 0);

// 1〜2mの静止ドリフトはcommitAnchorを更新せず、終了時保留も加算しない。
const jitter = [
  point(0, 0),
  ...Array.from({ length: 20 }, (_, index) => point(index % 2 === 0 ? 1.8 : -1.8, (index + 1) * 1_000)),
];
const jitterReplay = replayGpsLog(jitter);
assert.equal(jitterReplay.filteredDistanceM, 0);
assert.equal(jitterReplay.acceptedPointCount, 1);
assert.equal(jitterReplay.rejectionCounts.MICRO_JITTER, 19);
assert.equal(jitterReplay.rejectionCounts.END_OF_ACTIVITY_JITTER, 1);

// 10分静止で数mずつ交互に漂っても暫定合格基準20m未満に収まる。
const stationaryTenMinutes = replayGpsLog([
  point(0, 0),
  ...Array.from({ length: 600 }, (_, index) => (
    point(index % 2 === 0 ? 2.2 : -2.2, (index + 1) * 1_000, 12)
  )),
]);
assert.ok(stationaryTenMinutes.filteredDistanceM < 20);

// 前進中にBだけ横へ20m飛びCで本来の進行線へ戻る場合、複数条件でTHREE_POINT_SPIKEにする。
const lateralSpike = replayGpsLog([
  pointXY(-5, 0, 0, 5),
  pointXY(0, 0, 1_000, 5),
  pointXY(0, 20, 3_000, 20),
  pointXY(5, 0, 5_000, 5),
  pointXY(10, 0, 6_000, 5),
]);
assert.equal(lateralSpike.rejectionCounts.THREE_POINT_SPIKE, 1);
assert.equal(lateralSpike.summary.threePointSpikeCount, 1);
assert.ok(Math.abs(lateralSpike.filteredDistanceM - 15) < 0.2);
assert.ok(!lateralSpike.processedRoute.some((item) => Math.abs(item.lat - (BASE_LATITUDE + 20 / METERS_PER_LATITUDE_DEGREE)) < 1e-9));

// 同じ幾何形状でも進入方向に沿った実Uターンはスパイク除外しない。
const compactUTurn = replayGpsLog([
  pointXY(-5, 0, 0, 5),
  pointXY(0, 0, 1_000, 5),
  pointXY(10, 0, 3_000, 20),
  pointXY(0, 0, 5_000, 5),
  pointXY(-5, 0, 6_000, 5),
]);
assert.equal(compactUTurn.rejectionCounts.THREE_POINT_SPIKE, undefined);
assert.ok(Math.abs(compactUTurn.filteredDistanceM - 30) < 0.2);

// 高信頼点の100m/1秒ジャンプは除外し、正常ルートへ戻った点は採用できる。
const jumpReplay = replayGpsLog([
  point(0, 0),
  point(100, 1_000),
  point(200, 2_000),
]);
assert.ok((jumpReplay.rejectionCounts.IMPOSSIBLE_SPEED ?? 0) >= 1);
assert.equal(jumpReplay.filteredDistanceM, 0);

// 条件付きBが速度上限を超えるがA-Cは直線上で妥当な場合、専用理由でBを除外する。
const conditionalSpeedReject = replayGpsLog([
  point(0, 0, 5),
  point(20, 2_000, 20),
  point(25, 4_000, 5),
  point(30, 5_000, 5),
]);
assert.equal(conditionalSpeedReject.rejectionCounts.CONDITIONAL_ACCURACY_REJECTED, 1);
assert.equal(conditionalSpeedReject.summary.conditionalRejectedPointCount, 1);

// accuracy 30mは正式候補にもdisplay候補にもならない。
const poorAccuracyReplay = replayGpsLog([
  point(0, 0),
  point(10, 2_000, 30),
  point(10, 3_000),
  point(15, 4_000),
]);
assert.equal(poorAccuracyReplay.rejectionCounts.POOR_ACCURACY, 1);
assert.ok(!poorAccuracyReplay.processedRoute.some((item) => item.accuracy === 30));

// 正常な移動直後の終了はfinalizeで最後の5mを失わない。
let normalEndState = createInitialGpsProcessingState();
normalEndState = processGpsPoint(normalEndState, point(0, 0)).nextState;
normalEndState = processGpsPoint(normalEndState, point(5, 1_000)).nextState;
const normalEnd = finalizeGpsProcessing(normalEndState);
assert.equal(normalEnd.rejectionReason, 'ACCEPTED');
assert.ok(Math.abs(normalEnd.addedDistanceM - 5) < 0.1);
assert.equal(normalEnd.nextState.pendingPoint, null);

// 終了直前だけaccuracyが悪化して横へ飛ぶ点はfinalizeで加算しない。
let endSpikeState = createInitialGpsProcessingState();
for (const item of [
  pointXY(0, 0, 0, 5),
  pointXY(5, 0, 1_000, 5),
  pointXY(10, 0, 2_000, 5),
  pointXY(10, 10, 4_000, 20),
]) endSpikeState = processGpsPoint(endSpikeState, item).nextState;
const endSpike = finalizeGpsProcessing(endSpikeState);
assert.equal(endSpike.rejectionReason, 'END_OF_ACTIVITY_JITTER');
assert.equal(endSpike.nextState.endOfActivityDiscardedPointCount, 1);
assert.ok(Math.abs(endSpike.nextState.filteredDistanceM - 10) < 0.2);
assert.deepEqual(finalizeGpsProcessing(endSpikeState), endSpike, 'finalizeは同じstateに対して決定的');

// 20秒のGPS空白では保留点を破棄し、前後を接続しない。
const gapSequence = processSequence([
  point(0, 0),
  point(10, 2_000),
  point(110, 22_000),
  point(115, 23_000),
]);
assert.equal(gapSequence.outcomes[2].rejectionReason, 'GPS_GAP');
assert.equal(gapSequence.outcomes[2].acceptedPoint?.seg, true);
assert.equal(gapSequence.state.segmentBreakCount, 1);
assert.equal(gapSequence.state.segmentPendingResetCount, 1);
assert.equal(gapSequence.state.maxGapMs, 20_000);

// 明示segment（foreground/background切替相当）でも保留を跨がず、新しい先頭へsegを付ける。
const foregroundBackgroundSwitch = processSequence(
  [point(0, 0), point(5, 1_000), point(100, 2_000), point(105, 3_000)],
  (index) => index === 2 ? { forceNewSegment: true } : {},
);
assert.equal(foregroundBackgroundSwitch.outcomes[2].acceptedPoint?.seg, true);
assert.equal(foregroundBackgroundSwitch.state.segmentPendingResetCount, 1);
assert.equal(foregroundBackgroundSwitch.state.segmentBreakCount, 1);

// 手動/自動停止中を距離へ入れず、再開点は新しいセグメント先頭にする。
const manualPause = processSequence(
  [point(0, 0), point(10, 2_000), point(100, 4_000), point(110, 6_000)],
  (index) => index === 2 ? { paused: true } : index === 3 ? { forceNewSegment: true } : {},
);
assert.equal(manualPause.outcomes[2].rejectionReason, 'PAUSED');
assert.equal(manualPause.outcomes[3].rejectionReason, 'SEGMENT_BREAK');
assert.equal(manualPause.outcomes[3].acceptedPoint?.seg, true);

// 手動停止などの境界要求は次の点を待たず保留を破棄し、直後に終了しても加算しない。
let immediateBreakState = createInitialGpsProcessingState();
immediateBreakState = processGpsPoint(immediateBreakState, point(0, 0)).nextState;
immediateBreakState = processGpsPoint(immediateBreakState, point(5, 1_000)).nextState;
const immediateBreak = requestGpsProcessingSegmentBreak(immediateBreakState);
assert.equal(immediateBreak.removedTimestamp, 1_000);
assert.equal(immediateBreak.state.pendingPoint, null);
assert.equal(immediateBreak.state.segmentPendingResetCount, 1);
assert.equal(finalizeGpsProcessing(immediateBreak.state).addedDistanceM, 0);
const afterImmediateBreak = processGpsPoint(immediateBreak.state, point(100, 2_000));
assert.equal(afterImmediateBreak.acceptedPoint?.seg, true);
assert.equal(afterImmediateBreak.addedDistanceM, 0);

// timestamp逆転は保留をリセットし、次の正常点を新しいセグメントにする。
const reverse = processSequence([
  point(0, 1_000),
  point(5, 2_000),
  point(6, 1_500),
  point(10, 3_000),
]);
assert.equal(reverse.outcomes[2].rejectionReason, 'NON_MONOTONIC_TIMESTAMP');
assert.equal(reverse.outcomes[2].removedDisplayPointTimestamp, 2_000);
assert.equal(reverse.outcomes[3].acceptedPoint?.seg, true);

// 同一timestamp・同一座標の重複は除外するが、既存保留は次の正常点で判定できる。
const duplicate = point(5, 2_000);
const duplicateReplay = replayGpsLog([
  point(0, 1_000),
  duplicate,
  { ...duplicate },
  point(10, 3_000),
]);
assert.equal(duplicateReplay.rejectionCounts.DUPLICATE, 1);

const invalidReplay = replayGpsLog([
  { lat: Number.NaN, lng: 139, timestamp: 1_000, accuracy: 5 },
  { lat: 35, lng: 139, timestamp: 2_000, accuracy: 0 },
]);
assert.equal(invalidReplay.rejectionCounts.INVALID_COORDINATE, 1);
assert.equal(invalidReplay.rejectionCounts.INVALID_ACCURACY, 1);

// オートポーズ中の単発ジャンプでは即時再開しない。
let detector = emptyAutoPauseDetector();
let autoDecision = evaluateAutoPause(detector, autoPoint(0, 0), true, 0);
detector = autoDecision.next;
autoDecision = evaluateAutoPause(detector, autoPoint(100, 1_000), true, 100);
assert.equal(autoDecision.type, 'hold');
detector = autoDecision.next;
autoDecision = evaluateAutoPause(detector, autoPoint(0, 2_000), true, 100);
assert.equal(autoDecision.type, 'hold');

// 0.8m/sの低速ウォーキングは方向だけを根拠に停止扱いにしない。
detector = emptyAutoPauseDetector();
for (let second = 0; second <= 12; second++) {
  autoDecision = evaluateAutoPause(detector, autoPoint(second * 0.8, second * 1_000), false, 0.8);
  assert.notEqual(autoDecision.type, 'pause');
  detector = autoDecision.next;
}

// クライアントとFunctionsは同じ純粋関数・fixtureで完全一致する。
const parityFixture = [
  point(0, 0, 5),
  point(5, 1_000, 20),
  pointXY(5, 10, 2_000, 25),
  point(10, 3_000, 5),
  point(15, 4_000, 5),
  point(100, 24_000, 5),
  point(105, 25_000, 5),
];
const clientReplay = clientGps.replayGpsLog(parityFixture);
const serverReplay = serverGps.replayGpsLog(parityFixture);
assert.deepEqual(clientReplay, serverReplay);
const formalServerReplay = serverGps.replayAcceptedGpsRoute(clientReplay.processedRoute);
assert.equal(formalServerReplay.filteredDistanceM, clientReplay.filteredDistanceM);
assert.deepEqual(formalServerReplay.processedRoute, clientReplay.processedRoute);

// v2 commit点は35m基準の互換入口で受理し、v3の25m基準へ再解釈しない。
const v2Committed = serverGps.replayAcceptedGpsRouteV2([
  point(0, 0, 30),
  point(5, 1_000, 30),
]);
assert.ok(Math.abs(v2Committed.filteredDistanceM - 5) < 0.1);
assert.equal(v2Committed.processingVersion, 2);

// 長時間記録でも品質統計用accuracyサンプルを無制限に持たない。
const longStationary = processSequence(
  Array.from({ length: 2_100 }, (_, index) => point(0, index * 1_000, 5 + (index % 20))),
);
assert.equal(
  longStationary.state.accuracySamplesM.length,
  clientGps.GPS_QUALITY_ACCURACY_SAMPLE_LIMIT,
);

console.log('gps processing v3 / replay / auto pause tests passed');
