import assert from 'node:assert/strict';
import { STEP_LENGTH_KM, stepCounterPatch } from '../utils/stepCounter';

const active = {
  isRecording: true,
  isPaused: false,
  steps: 100,
  distanceKm: 100 * STEP_LENGTH_KM,
};

assert.deepEqual(stepCounterPatch(active, 20), {
  steps: 120,
  distanceKm: 120 * STEP_LENGTH_KM,
}, '記録中の歩数だけを距離へ加算する');

assert.deepEqual(stepCounterPatch({ ...active, isPaused: true }, 5_000), {},
  '手動一時停止中の歩数と距離は加算しない');
assert.deepEqual(stepCounterPatch({ ...active, isRecording: false }, 20), {},
  '記録終了後の購読通知は加算しない');
assert.deepEqual(stepCounterPatch(active, 0), {}, '増分0は無視する');

const resumed = stepCounterPatch(active, 100);
assert.deepEqual(resumed, {
  steps: 200,
  distanceKm: 200 * STEP_LENGTH_KM,
}, '再開後は新しい増分だけを加算し、停止中の歩数を持ち越さない');

console.log('step counter pause tests passed');
