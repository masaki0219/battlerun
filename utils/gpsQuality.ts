import type { RoutePoint } from '../types';
import {
  DISTANCE_MAX_ACCURACY_M,
  START_ACCEPTABLE_ACCURACY_M,
} from './gpsProcessing';

/** 推定獲得標高へ使う垂直精度の上限（暫定値）。 */
export const GPS_ALTITUDE_ACCURACY_M = 20;

function finitePositive(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** 新規の正式距離には、明示された正のaccuracyが必要。上限は実走調整用の暫定値。 */
export function hasUsableDistanceAccuracy(point: RoutePoint): boolean {
  const accuracy = finitePositive(point.accuracy);
  return accuracy != null && accuracy <= DISTANCE_MAX_ACCURACY_M;
}

/** ウォームアップ点を開始地点へ引き継げるaccuracyか。 */
export function hasStableStartAccuracy(point: RoutePoint): boolean {
  const accuracy = finitePositive(point.accuracy);
  return accuracy != null && accuracy <= START_ACCEPTABLE_ACCURACY_M;
}

/** 距離ノイズ除去とは独立して、オートポーズも良好な点だけで判定する。 */
export function hasUsableAutoPauseAccuracy(point: RoutePoint): boolean {
  const accuracy = finitePositive(point.accuracy);
  return accuracy != null && accuracy <= DISTANCE_MAX_ACCURACY_M;
}

/** 垂直精度が明示されている場合は、悪い高度サンプルを推定獲得標高から除外する。 */
export function hasUsableAltitude(point: RoutePoint): boolean {
  if (typeof point.alt !== 'number' || !Number.isFinite(point.alt)) return false;
  const altitudeAccuracy = typeof point.altitudeAccuracy === 'number'
    && Number.isFinite(point.altitudeAccuracy)
    && point.altitudeAccuracy >= 0
    ? point.altitudeAccuracy
    : null;
  return altitudeAccuracy == null || altitudeAccuracy <= GPS_ALTITUDE_ACCURACY_M;
}
