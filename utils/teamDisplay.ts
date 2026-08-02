export interface RankedTeamLike {
  categoryId: string;
}

/** 3チーム以上のコンパクト表示では、自チーム→順位が近い順→その他の順にする。 */
export function prioritizeTeams<T extends RankedTeamLike>(
  ranked: readonly T[],
  myCategoryId?: string | null,
): T[] {
  const myIndex = myCategoryId
    ? ranked.findIndex((team) => team.categoryId === myCategoryId)
    : -1;
  if (myIndex < 0) return [...ranked];
  return ranked
    .map((team, index) => ({ team, index }))
    .sort((left, right) => {
      if (left.index === myIndex) return -1;
      if (right.index === myIndex) return 1;
      const distance = Math.abs(left.index - myIndex) - Math.abs(right.index - myIndex);
      return distance || left.index - right.index;
    })
    .map(({ team }) => team);
}

/** 首位を100%とする実比率。小値が見えなくなる場合だけ15%を確保する。 */
export function factionBarRatio(value: number, leaderValue: number, floor = 0.15): number {
  const safeFloor = Number.isFinite(floor) ? Math.min(1, Math.max(0, floor)) : 0.15;
  // 0kmを「小さい正の値」として描かない。描画側の1〜2pxの基線だけを残す。
  if (!Number.isFinite(leaderValue) || leaderValue <= 0) return 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, Math.max(safeFloor, value / leaderValue));
}
