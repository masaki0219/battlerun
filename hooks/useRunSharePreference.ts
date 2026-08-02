import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_INCLUDE_ROUTE_IN_SHARE,
  parseRunSharePreference,
  runSharePreferenceKey,
  serializeRunSharePreference,
} from '../utils/runSharePreference';

/** 記録直後と活動詳細で共有する、ユーザー別・端末内の共有形式設定。 */
export function useRunSharePreference(userId?: string): {
  includeRouteInShare: boolean;
  preferenceLoaded: boolean;
  setIncludeRouteInShare: (next: boolean | ((current: boolean) => boolean)) => void;
} {
  const [includeRouteInShare, setValue] = useState(DEFAULT_INCLUDE_ROUTE_IN_SHARE);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setValue(DEFAULT_INCLUDE_ROUTE_IN_SHARE);
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

  const setIncludeRouteInShare = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    setValue((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      if (userId) {
        void AsyncStorage.setItem(
          runSharePreferenceKey(userId),
          serializeRunSharePreference(resolved),
        ).catch((error) => console.warn('[RunSharePreference] save failed:', error));
      }
      return resolved;
    });
  }, [userId]);

  return { includeRouteInShare, preferenceLoaded, setIncludeRouteInShare };
}
