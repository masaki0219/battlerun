import { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/** battles/{id}/participants/{uid} を表示用に整形した1件 */
export interface BattleParticipant {
  userId: string;
  displayName: string;
  totalDistanceKm: number;
  /** サーバー未集計なら null（'—' 表示に使う） */
  activityCount: number | null;
}

/**
 * バトルの参加者を距離降順で最大 limit 件取得する read-only フック。
 * battle/result/[id] が行っていた participants 取得を切り出したもの。
 * 個人戦（battle/[id]）の貢献ランキング表示でも共用する。
 * 新規インデックス不要（participants サブコレクションの単純読み）。
 */
export function useBattleParticipants(
  battleId: string | undefined,
  { enabled = true, limit = 20 }: { enabled?: boolean; limit?: number } = {},
) {
  const [participants, setParticipants] = useState<BattleParticipant[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!battleId || !enabled) {
      setParticipants([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const partSnap = await getDocs(collection(db, 'battles', battleId, 'participants'));
        const parts: BattleParticipant[] = [];
        await Promise.all(
          partSnap.docs.slice(0, limit).map(async (d) => {
            const uid = d.id;
            const km = (d.data()['totalDistanceKm'] as number) ?? 0;
            const activityCount = (d.data()['activityCount'] as number | undefined) ?? null;
            const userSnap = await getDoc(doc(db, 'users', uid));
            const name = (userSnap.data()?.['name'] as string) ?? 'メンバー';
            parts.push({ userId: uid, displayName: name, totalDistanceKm: km, activityCount });
          }),
        );
        parts.sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);
        if (!cancelled) setParticipants(parts);
      } catch {
        if (!cancelled) setParticipants([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [battleId, enabled, limit]);

  return { participants, loading };
}
