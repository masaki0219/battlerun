import type { RoutePoint } from '../types';

export const AUTO_PAUSE_STOP_SPEED_MPS = 0.55;
export const AUTO_PAUSE_RESUME_SPEED_MPS = 1.2;
export const AUTO_PAUSE_DELAY_MS = 5_000;
/** 停止判定窓の始点から許容する実変位。実走調整用の暫定値。 */
export const AUTO_PAUSE_STOP_MAX_DISPLACEMENT_M = 4;
/** 単発GPSジャンプで再開しないために要求する連続点数。実走調整用の暫定値。 */
export const AUTO_PAUSE_RESUME_POINT_COUNT = 3;
/** 再開候補点の始点から必要な実変位。実走調整用の暫定値。 */
export const AUTO_PAUSE_RESUME_DISTANCE_M = 3;

export interface AutoPauseDetectorState {
  lastPoint: RoutePoint | null;
  slowSinceMs: number | null;
  slowStartPoint: RoutePoint | null;
  resumeStartPoint: RoutePoint | null;
  resumeConsecutivePoints: number;
}

export type AutoPauseDecision =
  | { type: 'append'; next: AutoPauseDetectorState }
  | { type: 'hold'; next: AutoPauseDetectorState }
  | { type: 'pause'; pausedAtMs: number; next: AutoPauseDetectorState }
  | { type: 'resume'; next: AutoPauseDetectorState };

export function emptyAutoPauseDetector(): AutoPauseDetectorState {
  return {
    lastPoint: null,
    slowSinceMs: null,
    slowStartPoint: null,
    resumeStartPoint: null,
    resumeConsecutivePoints: 0,
  };
}

function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const radiusM = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return radiusM * 2 * Math.asin(Math.sqrt(sin2));
}

/**
 * GPS点1件からオートポーズの状態遷移だけを決める純関数。
 * 距離ノイズ除去は gpsProcessing 側で常時実行し、この関数とは分離する。
 * 停止は低速継続、再開は3点連続かつ3m以上の実変位を必要とする。
 */
export function evaluateAutoPause(
  state: AutoPauseDetectorState,
  point: RoutePoint,
  isAutoPaused: boolean,
  observedSpeedMps?: number | null,
): AutoPauseDecision {
  const previous = state.lastPoint;
  if (!previous) {
    const hasObservedSpeed = typeof observedSpeedMps === 'number'
      && Number.isFinite(observedSpeedMps)
      && observedSpeedMps >= 0;
    const isSlow = hasObservedSpeed && observedSpeedMps < AUTO_PAUSE_STOP_SPEED_MPS;
    const next: AutoPauseDetectorState = isSlow && !isAutoPaused
      ? {
          ...emptyAutoPauseDetector(),
          lastPoint: point,
          slowSinceMs: point.timestamp,
          slowStartPoint: point,
        }
      : { ...emptyAutoPauseDetector(), lastPoint: point };
    if (isSlow && !isAutoPaused) return { type: 'hold', next };
    return isAutoPaused ? { type: 'hold', next } : { type: 'append', next };
  }

  const elapsedMs = point.timestamp - previous.timestamp;
  if (elapsedMs <= 0) {
    return { type: 'hold', next: { ...state, lastPoint: point } };
  }
  const speedMps = typeof observedSpeedMps === 'number'
    && Number.isFinite(observedSpeedMps)
    && observedSpeedMps >= 0
    ? observedSpeedMps
    : haversineMeters(previous, point) / (elapsedMs / 1_000);

  if (isAutoPaused) {
    if (speedMps <= AUTO_PAUSE_RESUME_SPEED_MPS) {
      return { type: 'hold', next: { ...emptyAutoPauseDetector(), lastPoint: point } };
    }
    const resumeStartPoint = state.resumeStartPoint ?? point;
    const resumeConsecutivePoints = state.resumeConsecutivePoints + 1;
    const displacementM = haversineMeters(resumeStartPoint, point);
    const next: AutoPauseDetectorState = {
      ...emptyAutoPauseDetector(),
      lastPoint: point,
      resumeStartPoint,
      resumeConsecutivePoints,
    };
    if (
      resumeConsecutivePoints >= AUTO_PAUSE_RESUME_POINT_COUNT
      && displacementM >= AUTO_PAUSE_RESUME_DISTANCE_M
    ) {
      return { type: 'resume', next: { ...emptyAutoPauseDetector(), lastPoint: point } };
    }
    return { type: 'hold', next };
  }

  if (speedMps < AUTO_PAUSE_STOP_SPEED_MPS) {
    const slowSinceMs = state.slowSinceMs ?? previous.timestamp;
    const next: AutoPauseDetectorState = {
      ...emptyAutoPauseDetector(),
      lastPoint: point,
      slowSinceMs,
      slowStartPoint: state.slowStartPoint ?? previous,
    };
    if (point.timestamp - slowSinceMs >= AUTO_PAUSE_DELAY_MS) {
      const displacementM = haversineMeters(next.slowStartPoint ?? previous, point);
      if (displacementM > AUTO_PAUSE_STOP_MAX_DISPLACEMENT_M) {
        return { type: 'append', next: { ...emptyAutoPauseDetector(), lastPoint: point } };
      }
      return {
        type: 'pause',
        pausedAtMs: slowSinceMs,
        next: { ...emptyAutoPauseDetector(), lastPoint: point },
      };
    }
    return { type: 'hold', next };
  }

  return {
    type: 'append',
    next: { ...emptyAutoPauseDetector(), lastPoint: point },
  };
}
