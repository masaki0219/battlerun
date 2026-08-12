import { useState, useEffect, useRef } from 'react';
import { Pedometer } from 'expo-sensors';
import { useRecordStore } from '../stores/recordStore';
import { stepCounterPatch } from '../utils/stepCounter';

export function useStepCounter({ enabled }: { enabled: boolean }) {
  const [isAvailable, setIsAvailable] = useState(false);
  const prevStepsRef = useRef(0);

  useEffect(() => {
    Pedometer.isAvailableAsync()
      .then(setIsAvailable)
      .catch(() => setIsAvailable(false));
  }, []);

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

        // 累積値の基準は停止中も先に進め、再開時に停止中の歩数を持ち越さない。
        useRecordStore.setState((state) => stepCounterPatch(state, delta));
      });
    };

    start();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return { isAvailable };
}
