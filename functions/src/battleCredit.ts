const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 歩数モードが1つのチャレンジへ加算できる1人あたりの日次上限。 */
export const STEP_BATTLE_DAILY_CAP_KM = 5;
export const BATTLE_RESULT_GRACE_MS = 10 * 60 * 1000;

export type BattleCreditIneligibilityReason =
  | 'battle-finalized'
  | 'outside-period'
  | 'inactive-battle';

export type BattleCreditEligibility =
  | { eligible: true }
  | { eligible: false; reason: BattleCreditIneligibilityReason };

/**
 * 通信遅延そのものではなく、記録時刻とチャレンジの結果確定時刻で加算可否を決める。
 * 開催中ならオフライン記録も救済し、終了10分後からは確定済み順位を変更しない。
 */
export function battleCreditEligibility(params: {
  battleStatus: unknown;
  battleStartAtMs: number;
  battleEndAtMs: number;
  activityStartedAtMs: number;
  activityEndedAtMs: number;
  submittedAtMs: number;
}): BattleCreditEligibility {
  const {
    battleStatus,
    battleStartAtMs,
    battleEndAtMs,
    activityStartedAtMs,
    activityEndedAtMs,
    submittedAtMs,
  } = params;
  if (battleStatus !== 'active' && battleStatus !== 'finished') {
    return { eligible: false, reason: 'inactive-battle' };
  }
  if (
    activityStartedAtMs < battleStartAtMs
    || activityStartedAtMs > battleEndAtMs
    || activityEndedAtMs > battleEndAtMs + BATTLE_RESULT_GRACE_MS
  ) {
    return { eligible: false, reason: 'outside-period' };
  }
  if (submittedAtMs > battleEndAtMs + BATTLE_RESULT_GRACE_MS) {
    return { eligible: false, reason: 'battle-finalized' };
  }
  return { eligible: true };
}

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
