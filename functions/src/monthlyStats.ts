const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface MonthlyStatsImpact {
  monthKey: string;
  km: number;
  count: number;
  durationSec: number;
  elevationM: number;
}

export interface MonthlyActivityInput {
  startedAtMs: number;
  distanceKm: number;
  durationSec: number;
  elevationM?: number;
  flagged?: boolean;
}

export function aggregateMonthlyActivities(
  activities: readonly MonthlyActivityInput[],
): Map<string, MonthlyStatsImpact> {
  const result = new Map<string, MonthlyStatsImpact>();
  for (const activity of activities) {
    if (
      activity.flagged === true
      || !Number.isFinite(activity.startedAtMs)
      || !Number.isFinite(activity.distanceKm) || activity.distanceKm < 0
      || !Number.isFinite(activity.durationSec) || activity.durationSec < 0
    ) continue;
    const monthKey = tokyoMonthKey(activity.startedAtMs);
    const current = result.get(monthKey) ?? {
      monthKey, km: 0, count: 0, durationSec: 0, elevationM: 0,
    };
    current.km += activity.distanceKm;
    current.count += 1;
    current.durationSec += activity.durationSec;
    current.elevationM += Number.isFinite(activity.elevationM) && (activity.elevationM ?? 0) >= 0
      ? activity.elevationM ?? 0
      : 0;
    result.set(monthKey, current);
  }
  return result;
}

/** Unix ms を東京時間の YYYY-MM へ変換する。 */
export function tokyoMonthKey(timestampMs: number): string {
  const local = new Date(timestampMs + TOKYO_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

function nonNegativeFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseMonthlyStatsImpact(value: unknown): MonthlyStatsImpact | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const monthKey = data['monthKey'];
  const km = nonNegativeFinite(data['km']);
  const count = nonNegativeFinite(data['count']);
  const durationSec = nonNegativeFinite(data['durationSec']);
  const elevationM = nonNegativeFinite(data['elevationM']);
  if (
    typeof monthKey !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)
    || km == null || count == null || !Number.isInteger(count)
    || durationSec == null || elevationM == null
  ) return null;
  return { monthKey, km, count, durationSec, elevationM };
}
