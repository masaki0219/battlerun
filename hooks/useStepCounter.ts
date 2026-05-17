import { useEffect, useRef } from 'react';
import { Pedometer } from 'expo-sensors';
import { useRecordStore } from '../stores/recordStore';

const STEP_LENGTH_KM = 0.00075; // 1歩 ≈ 0.75m

export function useStepCounter({ enabled }: { enabled: boolean }) {
  const prevStepsRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      prevStepsRef.current = 0;
      return;
    }

    let subscription: ReturnType<typeof Pedometer.watchStepCount> | null = null;
    let cancelled = false;

    const start = async () => {
      const available = await Pedometer.isAvailableAsync();
      if (cancelled || !available) return;

      prevStepsRef.current = 0;
      subscription = Pedometer.watchStepCount((result) => {
        if (cancelled) return;
        const delta = result.steps - prevStepsRef.current;
        prevStepsRef.current = result.steps;
        if (delta <= 0) return;

        useRecordStore.setState((state) => ({
          steps: state.steps + delta,
          distanceKm: state.distanceKm + delta * STEP_LENGTH_KM,
        }));
      });
    };

    start();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);
}
