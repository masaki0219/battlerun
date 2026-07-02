import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';

/** 未読通知の件数をリアルタイムで購読する。通知ベルの未読バッジ表示用。 */
export function useUnreadNotifications(): number {
  const user = useAuthStore((s) => s.user);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    // バッジ表示は9+で頭打ちにするため、購読自体もlimit(20)に絞りコストを抑える
    const q = query(
      collection(db, 'users', user.id, 'notifications'),
      where('isRead', '==', false),
      limit(20),
    );
    const unsub = onSnapshot(q, (snap) => setUnreadCount(snap.size), () => setUnreadCount(0));
    return unsub;
  }, [user]);

  return unreadCount;
}
