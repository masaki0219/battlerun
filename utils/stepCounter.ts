export const STEP_LENGTH_KM = 0.00075; // 1歩 ≈ 0.75m

type StepCounterState = {
  isRecording: boolean;
  isPaused: boolean;
  steps: number;
  distanceKm: number;
};

type StepCounterPatch = Pick<StepCounterState, 'steps' | 'distanceKm'> | Record<string, never>;

export function stepCounterPatch(state: StepCounterState, delta: number): StepCounterPatch {
  if (!state.isRecording || state.isPaused || !Number.isFinite(delta) || delta <= 0) return {};

  return {
    steps: state.steps + delta,
    distanceKm: state.distanceKm + delta * STEP_LENGTH_KM,
  };
}
