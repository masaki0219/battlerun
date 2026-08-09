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

/** 表示順や参加状態に左右されない、categoryIdベースのチーム色。 */
export function pickTeamColor(palette: readonly string[], categoryId: string): string {
  if (palette.length === 0) return '';
  let hash = 2166136261;
  for (let index = 0; index < categoryId.length; index += 1) {
    hash ^= categoryId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return palette[(hash >>> 0) % palette.length];
}

/**
 * 同じチャレンジ内では可能な限り別々の色を割り当てる。
 * categoryIdをソートしてからハッシュ位置を線形探索するため、ランキング順が変わっても色は変わらない。
 */
export function pickTeamColors(
  palette: readonly string[],
  categoryIds: readonly string[],
): Record<string, string> {
  if (palette.length === 0) return {};
  const assignments: Record<string, string> = {};
  const used = new Set<string>();
  const uniqueIds = [...new Set(categoryIds)].sort((a, b) => a.localeCompare(b));

  for (const categoryId of uniqueIds) {
    const preferred = pickTeamColor(palette, categoryId);
    const preferredIndex = Math.max(0, palette.indexOf(preferred));
    let color = preferred;
    for (let offset = 0; offset < palette.length; offset += 1) {
      const candidate = palette[(preferredIndex + offset) % palette.length];
      if (!used.has(candidate)) {
        color = candidate;
        break;
      }
    }
    assignments[categoryId] = color;
    used.add(color);
  }

  return assignments;
}
