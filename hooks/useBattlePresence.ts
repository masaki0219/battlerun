import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { cheerRunningMember, subscribeBattlePresence } from '../lib/presence';
import type { RunningPresence } from '../types';

export function useBattlePresence(battleId?: string, currentUserId?: string): {
  presences: RunningPresence[];
  cheer: (presence: RunningPresence) => Promise<boolean>;
} {
  const [presences, setPresences] = useState<RunningPresence[]>([]);
  const [resolvedBattleId, setResolvedBattleId] = useState<string | undefined>(undefined);

  useFocusEffect(useCallback(() => {
    if (!battleId || !currentUserId) {
      setPresences([]);
      setResolvedBattleId(undefined);
      return;
    }
    setPresences([]);
    setResolvedBattleId(battleId);
    const unsubscribe = subscribeBattlePresence(battleId, currentUserId, (nextPresences) => {
      setPresences(nextPresences);
      setResolvedBattleId(battleId);
    });
    return () => {
      unsubscribe();
      setPresences([]);
      setResolvedBattleId(undefined);
    };
  }, [battleId, currentUserId]));

  const cheer = useCallback(async (presence: RunningPresence) => {
    if (!battleId || !currentUserId || presence.uid === currentUserId) return false;
    const created = await cheerRunningMember({
      battleId,
      runnerId: presence.uid,
      sessionId: presence.sessionId,
      fromUid: currentUserId,
    });
    if (created) {
      setPresences((current) => current.map((item) => (
        item.uid === presence.uid && item.sessionId === presence.sessionId
          ? { ...item, cheeredByMe: true }
          : item
      )));
    }
    return created;
  }, [battleId, currentUserId]);

  return { presences: resolvedBattleId === battleId ? presences : [], cheer };
}
