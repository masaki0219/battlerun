import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface BattleActivitySummary {
  id: string;
  userId: string;
  displayName: string;
  distanceKm: number;
  durationSeconds: number;
  measurementType: 'gps' | 'steps';
  steps: number | null;
  /** 正確な開始時刻を公開しない、東京時間の日付キー。 */
  dayKey: string;
}

interface ListBattleActivitiesResult {
  activities: BattleActivitySummary[];
}

interface GetBattleActivityResult {
  activity: BattleActivitySummary;
  contribution: {
    battleTitle: string;
    creditedDistanceKm: number;
  };
}

export async function listBattleActivitySummaries(params: {
  battleId: string;
  limit: number;
  fromDayKey?: string;
}): Promise<BattleActivitySummary[]> {
  const callable = httpsCallable<typeof params, ListBattleActivitiesResult>(functions, 'listBattleActivities');
  const result = await callable(params);
  return Array.isArray(result.data.activities) ? result.data.activities : [];
}

export async function getBattleActivitySummary(
  battleId: string,
  activityId: string,
): Promise<GetBattleActivityResult> {
  const callable = httpsCallable<
    { battleId: string; activityId: string },
    GetBattleActivityResult
  >(functions, 'getBattleActivity');
  const result = await callable({ battleId, activityId });
  return result.data;
}

export function dayKeyToDisplayDate(dayKey: string): Date {
  if (!/^[0-9]{8}$/.test(dayKey)) return new Date(Number.NaN);
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(4, 6));
  const day = Number(dayKey.slice(6, 8));
  // 正午に固定し、端末タイムゾーン差で前日へずれるのを避ける。
  return new Date(year, month - 1, day, 12);
}
