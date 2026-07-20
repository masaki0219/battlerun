import type { RoutePoint } from '../types';

/** 距離へ使わない、明らかに精度が低い水平精度の上限（暫定値）。 */
export const GPS_EXTREME_ACCURACY_M = 80;
/** 記録開始地点として採用する水平精度の上限（暫定値）。 */
export const GPS_START_ACCURACY_M = 50;
/** オートポーズ判定に使う水平精度の上限（距離計算より厳しくする）。 */
export const GPS_AUTO_PAUSE_ACCURACY_M = 35;
/** 推定獲得標高へ使う垂直精度の上限（暫定値）。 */
export const GPS_ALTITUDE_ACCURACY_M = 20;

function finiteNonNegative(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** accuracy が取れない旧データは互換性のため許可し、既知の極端な低精度点だけを落とす。 */
export function hasUsableDistanceAccuracy(point: RoutePoint): boolean {
  const accuracy = finiteNonNegative(point.accuracy);
  return accuracy == null || accuracy <= GPS_EXTREME_ACCURACY_M;
}

/** accuracy が取得できた場合、開始地点は通常の距離点より厳しい基準を要求する。 */
export function hasStableStartAccuracy(point: RoutePoint): boolean {
  const accuracy = finiteNonNegative(point.accuracy);
  return accuracy == null || accuracy <= GPS_START_ACCURACY_M;
}

/** 誤停止を避けるため、オートポーズには精度が明示された良好な点だけを使う。 */
export function hasUsableAutoPauseAccuracy(point: RoutePoint): boolean {
  const accuracy = finiteNonNegative(point.accuracy);
  return accuracy != null && accuracy <= GPS_AUTO_PAUSE_ACCURACY_M;
}

/** 垂直精度が明示されている場合は、悪い高度サンプルを推定獲得標高から除外する。 */
export function hasUsableAltitude(point: RoutePoint): boolean {
  if (typeof point.alt !== 'number' || !Number.isFinite(point.alt)) return false;
  const altitudeAccuracy = finiteNonNegative(point.altitudeAccuracy);
  return altitudeAccuracy == null || altitudeAccuracy <= GPS_ALTITUDE_ACCURACY_M;
}
