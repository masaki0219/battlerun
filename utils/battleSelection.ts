import type { Battle } from '../types';

const SELECTED_BATTLE_STORAGE_KEY = '@zelio_selected_battle_id';

export function selectedBattleStorageKey(userId: string): string {
  return `${SELECTED_BATTLE_STORAGE_KEY}:${userId}`;
}

/**
 * 参加中チャレンジを終了日時が近い順に並べる。
 * 終了日時が同じ、または比較できない場合は元の順序を維持する。
 */
export function sortActiveBattlesForDisplay<T extends Pick<Battle, 'id' | 'endAt'>>(
  battles: readonly T[],
): T[] {
  return battles
    .map((battle, index) => {
      const endAtMs = new Date(battle.endAt).getTime();
      return { battle, index, endAtMs: Number.isFinite(endAtMs) ? endAtMs : null };
    })
    .sort((left, right) => {
      if (left.endAtMs != null && right.endAtMs != null && left.endAtMs !== right.endAtMs) {
        return left.endAtMs - right.endAtMs;
      }
      if (left.endAtMs != null && right.endAtMs == null) return -1;
      if (left.endAtMs == null && right.endAtMs != null) return 1;
      return left.index - right.index;
    })
    .map(({ battle }) => battle);
}

/** 保存済みIDが有効ならそのチャレンジ、無効なら表示順の先頭を返す。 */
export function resolveDisplayedBattle<T extends { id: string }>(
  sortedBattles: readonly T[],
  selectedBattleId: string | null,
): T | null {
  return sortedBattles.find((battle) => battle.id === selectedBattleId)
    ?? sortedBattles[0]
    ?? null;
}
