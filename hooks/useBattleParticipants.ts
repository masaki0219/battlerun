import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cachedPublicProfile } from '../lib/publicProfileCache';
import { useTranslation } from '../lib/i18n';

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
  const { t } = useTranslation();
  const [participants, setParticipants] = useState<BattleParticipant[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!battleId || !enabled) {
      setParticipants([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const participantsQuery = query(
      collection(db, 'battles', battleId, 'participants'),
      orderBy('totalDistanceKm', 'desc'),
      firestoreLimit(limit),
    );
    const unsubscribe = onSnapshot(participantsQuery, async (partSnap) => {
      try {
        const parts = await Promise.all(
          partSnap.docs.map(async (d) => {
            const uid = d.id;
            const km = (d.data()['totalDistanceKm'] as number) ?? 0;
            const activityCount = (d.data()['activityCount'] as number | undefined) ?? null;
            const profile = await cachedPublicProfile(uid).catch(() => null);
            const name = profile?.name ?? t('common.member');
            return { userId: uid, displayName: name, totalDistanceKm: km, activityCount };
          }),
        );
        parts.sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);
        setParticipants(parts);
      } catch {
        setParticipants([]);
      } finally {
        setLoading(false);
      }
    }, () => { setParticipants([]); setLoading(false); });
    return unsubscribe;
  }, [battleId, enabled, limit, t]);

  return { participants, loading };
}
