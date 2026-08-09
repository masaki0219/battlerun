/** チャレンジ結果・プロフィール・称号一覧で共通の称号名。 */
export function teamTitleLabel(rank: number): string {
  if (rank === 1) return '優勝チームの一員';
  if (rank === 2) return '準優勝チームの一員';
  return `${rank}位チームの一員`;
}
