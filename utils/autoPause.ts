import type { RoutePoint } from '../types';

export const AUTO_PAUSE_STOP_SPEED_MPS = 0.55;
export const AUTO_PAUSE_RESUME_SPEED_MPS = 1.2;
export const AUTO_PAUSE_DELAY_MS = 5_000;

export interface AutoPauseDetectorState {
  lastPoint: RoutePoint | null;
  slowSinceMs: number | null;
  bufferedPoints: RoutePoint[];
}

export type AutoPauseDecision =
  | { type: 'append'; points: RoutePoint[]; next: AutoPauseDetectorState }
  | { type: 'hold'; next: AutoPauseDetectorState }
  | { type: 'pause'; pausedAtMs: number; next: AutoPauseDetectorState }
  | { type: 'resume'; next: AutoPauseDetectorState };

export function emptyAutoPauseDetector(): AutoPauseDetectorState {
  return { lastPoint: null, slowSinceMs: null, bufferedPoints: [] };
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
 * GPS点1件からオートポーズの状態遷移を決める純関数。
 * 低速が5秒未満なら点を一時保留し、再加速した時だけまとめてルートへ戻す。
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
      ? { lastPoint: point, slowSinceMs: point.timestamp, bufferedPoints: [point] }
      : { ...emptyAutoPauseDetector(), lastPoint: point };
    if (isSlow && !isAutoPaused) return { type: 'hold', next };
    return isAutoPaused ? { type: 'hold', next } : { type: 'append', points: [point], next };
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
    const next = { ...emptyAutoPauseDetector(), lastPoint: point };
    return speedMps > AUTO_PAUSE_RESUME_SPEED_MPS
      ? { type: 'resume', next }
      : { type: 'hold', next };
  }

  if (speedMps < AUTO_PAUSE_STOP_SPEED_MPS) {
    const slowSinceMs = state.slowSinceMs ?? previous.timestamp;
    const next: AutoPauseDetectorState = {
      lastPoint: point,
      slowSinceMs,
      bufferedPoints: [...state.bufferedPoints, point],
    };
    if (point.timestamp - slowSinceMs >= AUTO_PAUSE_DELAY_MS) {
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
    points: [...state.bufferedPoints, point],
    next: { ...emptyAutoPauseDetector(), lastPoint: point },
  };
}
