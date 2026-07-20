import { useEffect, useState } from 'react';
import { subscribeRunCheers } from '../lib/presence';
import { presenceSessionId } from '../utils/presence';
import type { LiveRunCheer } from '../types';

export function useRunCheers(params: {
  battleId?: string;
  runnerId?: string;
  startedAt: string | null;
  enabled: boolean;
}): LiveRunCheer | null {
  const [latestCheer, setLatestCheer] = useState<LiveRunCheer | null>(null);
  const sessionId = presenceSessionId(params.startedAt);

  useEffect(() => {
    setLatestCheer(null);
    if (!params.enabled || !params.battleId || !params.runnerId || !sessionId) return;
    return subscribeRunCheers({
      battleId: params.battleId,
      runnerId: params.runnerId,
      sessionId,
      onCheer: setLatestCheer,
    });
  }, [params.enabled, params.battleId, params.runnerId, sessionId]);

  return latestCheer;
}
