import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_RUN_SHARE_STYLE,
  parseRunSharePreference,
  runSharePreferenceKey,
  serializeRunSharePreference,
  type RunShareStyle,
} from '../utils/runSharePreference';

/** 記録直後と活動詳細で共有する、ユーザー別・端末内の共有形式設定。 */
export function useRunSharePreference(userId?: string): {
  shareStyle: RunShareStyle;
  preferenceLoaded: boolean;
  setShareStyle: (next: RunShareStyle) => void;
} {
  const [shareStyle, setValue] = useState<RunShareStyle>(DEFAULT_RUN_SHARE_STYLE);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setValue(DEFAULT_RUN_SHARE_STYLE);
    setPreferenceLoaded(false);
    if (!userId) {
      setPreferenceLoaded(true);
      return () => { cancelled = true; };
    }

    void AsyncStorage.getItem(runSharePreferenceKey(userId))
      .then((saved) => {
        if (!cancelled) setValue(parseRunSharePreference(saved));
      })
      .catch((error) => console.warn('[RunSharePreference] restore failed:', error))
      .finally(() => {
        if (!cancelled) setPreferenceLoaded(true);
      });
    return () => { cancelled = true; };
  }, [userId]);

  const setShareStyle = useCallback((next: RunShareStyle) => {
    setValue(next);
    if (userId) {
      void AsyncStorage.setItem(
        runSharePreferenceKey(userId),
        serializeRunSharePreference(next),
      ).catch((error) => console.warn('[RunSharePreference] save failed:', error));
    }
  }, [userId]);

  return { shareStyle, preferenceLoaded, setShareStyle };
}
