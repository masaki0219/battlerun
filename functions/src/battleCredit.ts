const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 歩数モードが1つのチャレンジへ加算できる1人あたりの日次上限。 */
export const STEP_BATTLE_DAILY_CAP_KM = 5;

export function tokyoDayKey(timestampMs: number): string {
  const date = new Date(timestampMs + TOKYO_OFFSET_MS);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function creditedBattleDistanceKm(
  measurementType: unknown,
  activityDistanceKm: number,
  alreadyCreditedKm: number,
): number {
  if (measurementType !== 'steps') return Math.max(0, activityDistanceKm);
  const remainingKm = Math.max(0, STEP_BATTLE_DAILY_CAP_KM - Math.max(0, alreadyCreditedKm));
  return Math.min(Math.max(0, activityDistanceKm), remainingKm);
}
