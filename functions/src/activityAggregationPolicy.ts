export interface ActivityBackfillState {
  hasMonthlyStatsImpact: boolean;
  submittedAtMs: number | null;
  startedAtMs: number | null;
}

export interface UserBackfillState {
  version: number;
  completedAtMs: number | null;
}

/**
 * 月次バックフィルに既に含まれた活動を再集計するとき、同じ距離を二重加算しない。
 *
 * v1 からバックフィルは完了時刻以前の保存済み活動を絶対値で集計している。
 * 活動側に impact が残っている場合も、過去の集計処理で月次へ反映済みとみなす。
 */
export function shouldIncrementMonthlyStats(
  activity: ActivityBackfillState,
  user: UserBackfillState,
): boolean {
  if (activity.hasMonthlyStatsImpact) return false;
  if (user.version < 1 || user.completedAtMs == null) return true;
  const activityAtMs = activity.submittedAtMs ?? activity.startedAtMs;
  return activityAtMs == null || activityAtMs > user.completedAtMs;
}
