import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { localDateKey } from '../utils/declarations';
import {
  aggregateProcessContributions,
  type ProcessActivityInput,
  type ProcessContribution,
  type ProcessDeclarationInput,
} from '../utils/processContributions';
import { listBattleActivitySummaries } from '../lib/activitySummaries';

function startOfCalendarWeek(now: Date): Date {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/**
 * バトル内の「今週の宣言達成数」と「今週の参加日数」を表示用に購読する。
 * participant や距離集計には書き込まず、過程の称賛だけに利用する。
 */
export function useBattleProcessContributions(
  battleId: string | undefined,
  categoryId: string | undefined,
): Record<string, ProcessContribution> {
  const [declarations, setDeclarations] = useState<ProcessDeclarationInput[]>([]);
  const [activities, setActivities] = useState<ProcessActivityInput[]>([]);
  const [resolvedBattleId, setResolvedBattleId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!battleId || !categoryId) {
      setDeclarations([]);
      setActivities([]);
      setResolvedBattleId(undefined);
      return;
    }

    // チャレンジ切替直後は、前のチャレンジの過程データを表示しない。
    setDeclarations([]);
    setActivities([]);
    setResolvedBattleId(battleId);

    const now = new Date();
    const weekStart = startOfCalendarWeek(now);
    const weekStartKey = localDateKey(weekStart);
    // 宣言は安全上48時間で失効するため、保持中の同一チーム分だけを称賛表示に使う。
    const declarationsQuery = query(
      collection(db, 'battles', battleId, 'declarations'),
      where('categoryId', '==', categoryId),
      where('visible', '==', true),
      where('expireAt', '>', Timestamp.now()),
    );
    const unsubscribeDeclarations = onSnapshot(
      declarationsQuery,
      (snapshot) => {
        setDeclarations(snapshot.docs
          .filter((declaration) => ((declaration.data()['dateKey'] as string | undefined) ?? '') >= weekStartKey)
          .map((declaration) => ({
            uid: (declaration.data()['uid'] as string) ?? '',
            status: (declaration.data()['status'] as string) ?? '',
          })));
      },
      () => setDeclarations([]),
    );
    let cancelled = false;
    let loadingActivities = false;
    const loadActivities = async () => {
      if (cancelled || loadingActivities) return;
      loadingActivities = true;
      try {
        const items = await listBattleActivitySummaries({ battleId, limit: 500, fromDayKey: weekStartKey });
        if (cancelled) return;
        setActivities(items.map((activity): ProcessActivityInput => ({
          userId: activity.userId,
          dayKey: activity.dayKey,
        })));
      } catch {
        if (!cancelled) setActivities([]);
      } finally {
        loadingActivities = false;
      }
    };
    void loadActivities();
    const activityRefresh = setInterval(() => void loadActivities(), 60_000);

    return () => {
      cancelled = true;
      clearInterval(activityRefresh);
      unsubscribeDeclarations();
    };
  }, [battleId, categoryId]);

  return useMemo(() => (
    battleId && resolvedBattleId === battleId
      ? aggregateProcessContributions(declarations, activities)
      : {}
  ), [activities, battleId, declarations, resolvedBattleId]);
}
