import { useEffect, useMemo, useState } from 'react';
import { subscribeBlockedUsers, type BlockedUser } from '../lib/moderation';

export function useBlockedUsers(userId?: string) {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);

  useEffect(() => {
    if (!userId) {
      setBlockedUsers([]);
      return;
    }
    return subscribeBlockedUsers(userId, setBlockedUsers);
  }, [userId]);

  const blockedUserIds = useMemo(
    () => new Set(blockedUsers.map((item) => item.blockedUid)),
    [blockedUsers],
  );
  return { blockedUsers, blockedUserIds };
}
