import type { MonthlyStat } from '../types';

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

interface MonthlyActivityMetric {
  startedAt: string;
  distanceKm: number;
  durationSeconds: number;
}

function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

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

/**
 * サーバー月次と端末で確認できた活動を、月ごとに一度だけ突き合わせる。
 * 各画面が別の粒度で max を取って年間・生涯の矛盾を作らないための共通レイヤー。
 */
export function reconcileMonthlyStats(
  serverMonths: MonthlyStat[],
  activities: MonthlyActivityMetric[],
): MonthlyStat[] {
  const months = new Map<string, MonthlyStat>();
  for (const month of serverMonths) {
    months.set(month.monthKey, {
      monthKey: month.monthKey,
      km: nonNegative(month.km),
      count: Math.floor(nonNegative(month.count)),
      durationSec: Math.floor(nonNegative(month.durationSec)),
      elevationM: nonNegative(month.elevationM),
    });
  }

  const localMonths = new Map<string, MonthlyStat>();
  for (const activity of activities) {
    const startedAt = new Date(activity.startedAt);
    if (Number.isNaN(startedAt.getTime())) continue;
    const monthKey = tokyoMonthKey(startedAt);
    const current = localMonths.get(monthKey) ?? {
      monthKey,
      km: 0,
      count: 0,
      durationSec: 0,
      elevationM: 0,
    };
    current.km += nonNegative(activity.distanceKm);
    current.count += 1;
    current.durationSec += Math.floor(nonNegative(activity.durationSeconds));
    localMonths.set(monthKey, current);
  }

  for (const [monthKey, local] of localMonths) {
    const server = months.get(monthKey);
    months.set(monthKey, server ? {
      monthKey,
      km: Math.max(server.km, local.km),
      count: Math.max(server.count, local.count),
      durationSec: Math.max(server.durationSec, local.durationSec),
      elevationM: Math.max(server.elevationM, local.elevationM),
    } : local);
  }

  return [...months.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

/** 月次突合で確認できた距離の合計。生涯累計が下回ってはいけない下限値。 */
export function monthlyDistanceLowerBound(months: MonthlyStat[]): number {
  return months.reduce((sum, month) => sum + nonNegative(month.km), 0);
}
