/**
 * チーム識別色の割り当て（純関数。design_tokens 経由で使うこと）。
 *
 * パレットの先頭は「自チーム色」に予約されている。他チームへ `palette[順位-1]` のように
 * 割り当てると、自分が1位でないときに1位のバーが自チーム色と同じになり見分けが付かなくなるため、
 * 他チームには常に index 1 以降を循環させる。
 */
export function pickOtherTeamColor(palette: readonly string[], order: number): string {
  if (palette.length === 0) return '';
  if (palette.length === 1) return palette[0];
  const safeOrder = Number.isFinite(order) && order > 0 ? Math.floor(order) : 0;
  return palette[1 + (safeOrder % (palette.length - 1))];
}
