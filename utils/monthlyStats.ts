const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

export function tokyoMonthKey(date: Date): string {
  const local = new Date(date.getTime() + TOKYO_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function recentTokyoMonthKeys(now: Date, count = 12): string[] {
  if (!Number.isInteger(count) || count <= 0) return [];
  const local = new Date(now.getTime() + TOKYO_OFFSET_MS);
  const currentIndex = local.getUTCFullYear() * 12 + local.getUTCMonth();
  return Array.from({ length: count }, (_, index) => {
    const monthIndex = currentIndex - count + 1 + index;
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex - year * 12 + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  });
}

export function monthLabel(monthKey: string): string {
  const month = Number(monthKey.slice(5, 7));
  return Number.isInteger(month) && month >= 1 && month <= 12 ? `${month}月` : monthKey;
}
