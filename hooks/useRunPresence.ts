import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { heartbeatRunPresence, hideRunPresence } from '../lib/presence';
import { PRESENCE_HEARTBEAT_MS, presenceSessionId } from '../utils/presence';

export function useRunPresence(params: {
  battleId?: string;
  userId?: string;
  startedAt: string | null;
  isRecording: boolean;
  visible: boolean;
}): void {
  const [appState, setAppState] = useState(AppState.currentState);
  const sessionId = presenceSessionId(params.startedAt);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (appState !== 'active'
      || !params.battleId
      || !params.userId
      || !params.startedAt
      || !sessionId
      || !params.isRecording
      || !params.visible) return;

    const heartbeat = () => {
      void heartbeatRunPresence({
        battleId: params.battleId!,
        userId: params.userId!,
        sessionId,
        startedAt: params.startedAt!,
      }).catch((error) => console.warn('[Presence] 心拍の更新に失敗:', error));
    };
    heartbeat();
    const timer = setInterval(heartbeat, PRESENCE_HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      // バックグラウンド移行時は書き込まず、3分の鮮度判定で自然に非表示にする。
      if (AppState.currentState !== 'active') return;
      void hideRunPresence({
        battleId: params.battleId!,
        userId: params.userId!,
        sessionId,
      }).catch((error) => console.warn('[Presence] 非表示更新に失敗:', error));
    };
  }, [
    appState,
    params.battleId,
    params.userId,
    params.startedAt,
    params.isRecording,
    params.visible,
    sessionId,
  ]);
}
