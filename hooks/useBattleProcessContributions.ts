import { useEffect, useMemo, useState } from 'react';
import {
  Timestamp,
  collection,
  onSnapshot,
  orderBy,
  query,
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
): Record<string, ProcessContribution> {
  const [declarations, setDeclarations] = useState<ProcessDeclarationInput[]>([]);
  const [activities, setActivities] = useState<ProcessActivityInput[]>([]);
  const [resolvedBattleId, setResolvedBattleId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!battleId) {
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
    const todayKey = localDateKey(now);

    const declarationsQuery = query(
      collection(db, 'battles', battleId, 'declarations'),
      where('dateKey', '>=', weekStartKey),
      where('dateKey', '<=', todayKey),
    );
    const activitiesQuery = query(
      collection(db, 'activities'),
      where('battleIds', 'array-contains', battleId),
      where('visibility', '==', 'public_v2'),
      where('startedAt', '>=', Timestamp.fromDate(weekStart)),
      orderBy('startedAt', 'desc'),
    );

    const unsubscribeDeclarations = onSnapshot(
      declarationsQuery,
      (snapshot) => {
        setDeclarations(snapshot.docs.map((declaration) => ({
          uid: (declaration.data()['uid'] as string) ?? '',
          status: (declaration.data()['status'] as string) ?? '',
        })));
      },
      () => setDeclarations([]),
    );
    const unsubscribeActivities = onSnapshot(
      activitiesQuery,
      (snapshot) => {
        const next = snapshot.docs.flatMap((activity): ProcessActivityInput[] => {
          const data = activity.data();
          const timestamp = data['startedAt'] as { toDate?: () => Date } | undefined;
          const startedAt = timestamp?.toDate?.();
          if (!startedAt) return [];
          return [{
            userId: (data['userId'] as string) ?? '',
            startedAt,
          }];
        });
        setActivities(next);
      },
      () => setActivities([]),
    );

    return () => {
      unsubscribeDeclarations();
      unsubscribeActivities();
    };
  }, [battleId]);

  return useMemo(() => (
    battleId && resolvedBattleId === battleId
      ? aggregateProcessContributions(declarations, activities)
      : {}
  ), [activities, battleId, declarations, resolvedBattleId]);
}
