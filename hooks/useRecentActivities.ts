import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import type { Activity, MeasurementType, RoutePoint } from '../types';

/** Firestore Timestamp / millis / ISO を ISO 文字列へ正規化 */
function toIso(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (typeof v.toMillis === 'function') return new Date(v.toMillis()).toISOString();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return '';
}

/**
 * 直近アクティビティの read-only 取得フック。
 * stats.tsx が持っていた `activities` の `where userId ==` + `orderBy startedAt desc`
 * + `limit` クエリを切り出して共用化したもの（新しいインデックスは不要な同型クエリ）。
 * stats / record / battle から利用する。書き込み・新規クエリ形状の追加は行わない。
 */
export function useRecentActivities(limitCount = 50): {
  activities: Activity[];
  loading: boolean;
} {
  const { user } = useAuthStore();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setActivities([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const q = query(
      collection(db, 'activities'),
      where('userId', '==', user.id),
      orderBy('startedAt', 'desc'),
      limit(limitCount),
    );
    getDocs(q)
      .then((snap) => {
        if (cancelled) return;
        const items: Activity[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            userId: (data.userId as string) ?? user.id,
            eventId: (data.eventId as string) ?? undefined,
            distanceKm: (data.distanceKm as number) ?? 0,
            steps: (data.steps as number) ?? undefined,
            durationSeconds: (data.durationSeconds as number) ?? 0,
            measurementType: (data.measurementType as MeasurementType) ?? 'gps',
            route: (data.route as RoutePoint[]) ?? undefined,
            startedAt: toIso(data.startedAt),
            endedAt: toIso(data.endedAt),
          };
        });
        setActivities(items);
      })
      .catch(() => {
        if (!cancelled) setActivities([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, limitCount]);

  return { activities, loading };
}
