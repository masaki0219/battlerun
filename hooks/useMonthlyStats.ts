import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  documentId,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { recentTokyoMonthKeys } from '../utils/monthlyStats';
import type { MonthlyStat } from '../types';

function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function useMonthlyStats(now = new Date()): {
  months: MonthlyStat[];
  loading: boolean;
} {
  const { user } = useAuthStore();
  const monthKeys = useMemo(() => recentTokyoMonthKeys(now, 12), [now.getFullYear(), now.getMonth()]);
  const [months, setMonths] = useState<MonthlyStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || monthKeys.length === 0) {
      setMonths([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    setLoading(true);
    void (async () => {
      try {
        await httpsCallable(functions, 'backfillMonthlyStats')({});
      } catch (error) {
        console.warn('[MonthlyStats] backfill failed; using current aggregate:', error);
      }
      if (cancelled) return;
      const monthlyQuery = query(
        collection(db, 'users', user.id, 'monthlyStats'),
        where(documentId(), '>=', monthKeys[0]),
        orderBy(documentId(), 'asc'),
      );
      unsubscribe = onSnapshot(monthlyQuery, (snapshot) => {
        const allowed = new Set(monthKeys);
        setMonths(snapshot.docs.flatMap((monthlyDoc): MonthlyStat[] => {
          if (!allowed.has(monthlyDoc.id)) return [];
          const data = monthlyDoc.data();
          return [{
            monthKey: monthlyDoc.id,
            km: nonNegative(data['km']),
            count: Math.floor(nonNegative(data['count'])),
            durationSec: Math.floor(nonNegative(data['durationSec'])),
            elevationM: nonNegative(data['elevationM']),
          }];
        }));
        setLoading(false);
      }, () => {
        setMonths([]);
        setLoading(false);
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user?.id, monthKeys.join(',')]);

  return { months, loading };
}
