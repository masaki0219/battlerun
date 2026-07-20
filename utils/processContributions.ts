import { localDateKey } from './declarations';

export interface ProcessContribution {
  declarationsDone: number;
  activeDaysThisWeek: number;
}

export interface ProcessDeclarationInput {
  uid: string;
  status: string;
}

export interface ProcessActivityInput {
  userId: string;
  startedAt: Date;
}

/**
 * 今週分として取得済みの宣言と活動を、ユーザーごとの過程の貢献へまとめる。
 * 距離や順位は入力にも出力にも持たず、ランキング集計とは独立させる。
 */
export function aggregateProcessContributions(
  declarations: ProcessDeclarationInput[],
  activities: ProcessActivityInput[],
): Record<string, ProcessContribution> {
  const declarationCounts = new Map<string, number>();
  for (const declaration of declarations) {
    if (!declaration.uid || declaration.status !== 'done') continue;
    declarationCounts.set(declaration.uid, (declarationCounts.get(declaration.uid) ?? 0) + 1);
  }

  const activeDateKeys = new Map<string, Set<string>>();
  for (const activity of activities) {
    if (!activity.userId || Number.isNaN(activity.startedAt.getTime())) continue;
    const dates = activeDateKeys.get(activity.userId) ?? new Set<string>();
    dates.add(localDateKey(activity.startedAt));
    activeDateKeys.set(activity.userId, dates);
  }

  const userIds = new Set([...declarationCounts.keys(), ...activeDateKeys.keys()]);
  const contributions: Record<string, ProcessContribution> = {};
  for (const userId of userIds) {
    contributions[userId] = {
      declarationsDone: Math.max(0, declarationCounts.get(userId) ?? 0),
      activeDaysThisWeek: Math.max(0, activeDateKeys.get(userId)?.size ?? 0),
    };
  }
  return contributions;
}
