import type { TeamColorId } from '../types';

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
  preferredColors: Readonly<Record<string, string | undefined>> = {},
  hashPalette: readonly string[] = palette,
  fallbackPreferredColors: Readonly<Record<string, string | undefined>> = {},
): Record<string, string> {
  if (palette.length === 0) return {};
  const assignments: Record<string, string> = {};
  const used = new Set<string>();
  const uniqueIds = [...new Set(categoryIds)].sort((a, b) => a.localeCompare(b));

  const assignAvailable = (categoryId: string, preferred: string) => {
    const preferredIndex = Math.max(0, palette.indexOf(preferred));
    let color = palette[preferredIndex];
    for (let offset = 0; offset < palette.length; offset += 1) {
      const candidate = palette[(preferredIndex + offset) % palette.length];
      if (!used.has(candidate)) {
        color = candidate;
        break;
      }
    }
    assignments[categoryId] = color;
    used.add(color);
  };

  // 明示選択された色を先に確保し、ハッシュ割当がその色を横取りしないようにする。
  for (const categoryId of uniqueIds) {
    const preferred = preferredColors[categoryId];
    if (preferred && palette.includes(preferred)) assignAvailable(categoryId, preferred);
  }

  // 旧データの名前推測は、保存済みの明示色が確保されたあとにだけ使う。
  for (const categoryId of uniqueIds) {
    if (assignments[categoryId]) continue;
    const preferred = fallbackPreferredColors[categoryId];
    if (preferred && palette.includes(preferred)) assignAvailable(categoryId, preferred);
  }

  for (const categoryId of uniqueIds) {
    if (assignments[categoryId]) continue;
    const preferred = pickTeamColor(hashPalette.length > 0 ? hashPalette : palette, categoryId);
    assignAvailable(categoryId, preferred);
  }

  return assignments;
}

/**
 * colorId導入前のデータ向け。部分一致は「青森」「赤ちゃん」等を誤判定するため、
 * 色そのものを表す短い定型名だけを補完する。
 */
export function inferredLegacyTeamColorId(label: string): TeamColorId | undefined {
  const normalized = label.trim().toLowerCase().replace(/[\s　_-]+/g, '');
  const exactNames: Partial<Record<string, TeamColorId>> = {
    赤: 'red', 赤組: 'red', 赤チーム: 'red', レッド: 'red', レッドチーム: 'red', red: 'red', redteam: 'red',
    紅: 'red', 紅組: 'red', 紅チーム: 'red',
    青: 'blue', 青組: 'blue', 青チーム: 'blue', ブルー: 'blue', ブルーチーム: 'blue', blue: 'blue', blueteam: 'blue',
    緑: 'green', 緑組: 'green', 緑チーム: 'green', グリーン: 'green', グリーンチーム: 'green', green: 'green', greenteam: 'green',
    紫: 'purple', 紫組: 'purple', 紫チーム: 'purple', パープル: 'purple', パープルチーム: 'purple', purple: 'purple', purpleteam: 'purple',
    桃: 'pink', 桃組: 'pink', 桃チーム: 'pink', ピンク: 'pink', ピンクチーム: 'pink', pink: 'pink', pinkteam: 'pink',
    白: 'gray', 白組: 'gray', 白チーム: 'gray', グレー: 'gray', グレーチーム: 'gray', gray: 'gray', grayteam: 'gray',
  };
  return exactNames[normalized];
}
