/** 1 / 2 / 5 × 10^n の刻みで、値以上となる見やすいチャート上限を返す。 */
export function niceChartMaximum(value: number, minimum = 1): number {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const safeMinimum = Number.isFinite(minimum) ? Math.max(0, minimum) : 1;
  if (safeValue <= 0) return safeMinimum;

  const range = niceNumber(safeValue, false);
  const tickStep = niceNumber(range / 2, true);
  const maximum = Math.ceil(safeValue / tickStep) * tickStep;
  return Math.max(safeMinimum, maximum);
}

function niceNumber(value: number, round: boolean): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / (10 ** exponent);
  let niceFraction: number;
  if (round) {
    niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  } else {
    niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  }
  return niceFraction * (10 ** exponent);
}

export function chartAxisLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 10 || Number.isInteger(value)) return value.toFixed(0);
  return value.toFixed(1).replace(/\.0$/, '');
}
