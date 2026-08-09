import { useCallback, useEffect, useState } from 'react';
import { onSnapshot, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Battle, CategoryStats } from '../types';

/**
 * 渡されたバトル群の category_stats をまとめてリアルタイム購読し、
 * { [battleId]: CategoryStats[] } を返す read-only フック。
 * battle.tsx が public / private 双方で同一形状の購読をしていたのを共通化したもの
 * （新形状クエリ・新規インデックスは追加しない）。
 * battles 配列は store の安定参照を渡すこと（レンダー毎に生成した配列を渡すと再購読される）。
 */
export interface BattleCategoryStatsSubscription {
  statsMap: Record<string, CategoryStats[]>;
  failedBattleIds: ReadonlySet<string>;
  retry: () => void;
}

export function useBattleCategoryStats(battles: Battle[]): BattleCategoryStatsSubscription {
  const [statsMap, setStatsMap] = useState<Record<string, CategoryStats[]>>({});
  const [failedBattleIds, setFailedBattleIds] = useState<string[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  useEffect(() => {
    if (battles.length === 0) {
      setStatsMap({});
      setFailedBattleIds([]);
      return;
    }
    const activeIds = new Set(battles.map((battle) => battle.id));
    setStatsMap((previous) => Object.fromEntries(
      Object.entries(previous).filter(([battleId]) => activeIds.has(battleId)),
    ));
    setFailedBattleIds([]);
    const unsubs = battles.map((battle) => {
      const colRef = collection(db, 'battles', battle.id, 'category_stats');
      return onSnapshot(colRef, (snap) => {
        const stats: CategoryStats[] = snap.docs.map((d) => {
          const catId = d.id;
          const label = battle.categories.find((c) => c.id === catId)?.label ?? catId;
          return {
            categoryId: catId,
            label,
            totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
            avgDistanceKm: (d.data()['avgDistanceKm'] as number) ?? 0,
            participantCount: (d.data()['participantCount'] as number) ?? 0,
          };
        });
        setStatsMap((prev) => ({ ...prev, [battle.id]: stats }));
        setFailedBattleIds((previous) => previous.filter((battleId) => battleId !== battle.id));
      }, (error) => {
        console.warn(`[BattleCategoryStats] subscription failed (${battle.id}):`, error);
        setStatsMap((previous) => ({ ...previous, [battle.id]: [] }));
        setFailedBattleIds((previous) => previous.includes(battle.id)
          ? previous
          : [...previous, battle.id]);
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [battles, retryKey]);

  return { statsMap, failedBattleIds: new Set(failedBattleIds), retry };
}
