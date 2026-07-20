export const PRESENCE_HEARTBEAT_MS = 60_000;
export const PRESENCE_ACTIVE_WINDOW_MS = 3 * 60_000;

/** サーバー心拍が3分以内で、公開中のセッションだけを走行中として扱う。 */
export function isPresenceFresh(
  visible: boolean,
  lastBeatAtMs: number,
  nowMs = Date.now(),
): boolean {
  if (!visible || !Number.isFinite(lastBeatAtMs)) return false;
  const ageMs = nowMs - lastBeatAtMs;
  return ageMs >= -PRESENCE_HEARTBEAT_MS && ageMs <= PRESENCE_ACTIVE_WINDOW_MS;
}

/** 記録開始時刻を、同じユーザーのランを区別する安定したIDとして使う。 */
export function presenceSessionId(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const timestamp = new Date(startedAt).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
