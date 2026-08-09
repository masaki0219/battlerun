import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { cachedPublicProfile } from './publicProfileCache';
import { isPresenceFresh } from '../utils/presence';
import { PRESENCE_ACTIVE_WINDOW_MS } from '../utils/presence';
import type { LiveRunCheer, RunningPresence } from '../types';

const OWN_CHEER_CACHE_TTL_MS = 5 * 60_000;
const OWN_CHEER_CACHE_MAX_ENTRIES = 500;
const ownCheerCache = new Map<string, { value: boolean; expiresAt: number }>();

function timestampMs(value: unknown): number {
  const timestamp = value as { toMillis?: () => number } | undefined;
  return timestamp?.toMillis?.() ?? Number.NaN;
}

function timestampIso(value: unknown): string {
  const timestamp = value as { toDate?: () => Date } | undefined;
  return timestamp?.toDate?.().toISOString() ?? '';
}

function readOwnCheerCache(key: string): boolean | undefined {
  const cached = ownCheerCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    ownCheerCache.delete(key);
    return undefined;
  }
  return cached.value;
}

function writeOwnCheerCache(key: string, value: boolean): void {
  const nowMs = Date.now();
  for (const [cachedKey, cached] of ownCheerCache) {
    if (cached.expiresAt <= nowMs) ownCheerCache.delete(cachedKey);
  }
  while (ownCheerCache.size >= OWN_CHEER_CACHE_MAX_ENTRIES) {
    const oldestKey = ownCheerCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    ownCheerCache.delete(oldestKey);
  }
  ownCheerCache.set(key, { value, expiresAt: nowMs + OWN_CHEER_CACHE_TTL_MS });
}

function ownCheerKey(battleId: string, runnerId: string, sessionId: string, currentUserId: string): string {
  return `${battleId}/${runnerId}/${sessionId}/${currentUserId}`;
}

export async function heartbeatRunPresence(params: {
  battleId: string;
  userId: string;
  sessionId: string;
  startedAt: string;
}): Promise<void> {
  const startedAt = new Date(params.startedAt);
  if (Number.isNaN(startedAt.getTime())) return;
  await setDoc(doc(db, 'battles', params.battleId, 'presence', params.userId), {
    sessionId: params.sessionId,
    startedAt: Timestamp.fromDate(startedAt),
    lastBeatAt: serverTimestamp(),
    visible: true,
  });
}

export async function hideRunPresence(params: {
  battleId: string;
  userId: string;
  sessionId: string;
}): Promise<void> {
  const presenceRef = doc(db, 'battles', params.battleId, 'presence', params.userId);
  const snapshot = await getDoc(presenceRef);
  if (!snapshot.exists() || snapshot.data()['sessionId'] !== params.sessionId) return;
  await setDoc(presenceRef, { visible: false, lastBeatAt: serverTimestamp() }, { merge: true });
}

export function subscribeBattlePresence(
  battleId: string,
  currentUserId: string,
  listener: (items: RunningPresence[]) => void,
): () => void {
  let generation = 0;
  let resolvedItems: RunningPresence[] = [];

  const emitFresh = () => {
    const nowMs = Date.now();
    listener(resolvedItems.filter((item) => isPresenceFresh(
      true,
      new Date(item.lastBeatAt).getTime(),
      nowMs,
    )));
  };
  const freshnessTimer = setInterval(emitFresh, 30_000);

  const activePresenceQuery = query(
    collection(db, 'battles', battleId, 'presence'),
    where('lastBeatAt', '>=', Timestamp.fromMillis(Date.now() - PRESENCE_ACTIVE_WINDOW_MS)),
  );
  const unsubscribe = onSnapshot(activePresenceQuery, (snapshot) => {
    const currentGeneration = ++generation;
    const nowMs = Date.now();
    const activeDocs = snapshot.docs.filter((presenceDoc) => {
      const data = presenceDoc.data();
      return isPresenceFresh(data['visible'] === true, timestampMs(data['lastBeatAt']), nowMs)
        && typeof data['sessionId'] === 'string';
    });

    void Promise.all(activeDocs.map(async (presenceDoc): Promise<RunningPresence> => {
      const data = presenceDoc.data();
      const uid = presenceDoc.id;
      const sessionId = data['sessionId'] as string;
      const cacheKey = ownCheerKey(battleId, uid, sessionId, currentUserId);
      let cheeredByMe = readOwnCheerCache(cacheKey);
      const profilePromise = cachedPublicProfile(uid);
      if (cheeredByMe === undefined && uid !== currentUserId) {
        const cheer = await getDoc(doc(db, 'battles', battleId, 'presence', uid, 'cheers', currentUserId));
        cheeredByMe = cheer.exists() && cheer.data()['sessionId'] === sessionId;
        writeOwnCheerCache(cacheKey, cheeredByMe);
      }
      const profile = await profilePromise;
      return {
        uid,
        sessionId,
        startedAt: timestampIso(data['startedAt']),
        lastBeatAt: timestampIso(data['lastBeatAt']),
        displayName: profile.name,
        avatarEmoji: profile.avatarEmoji,
        cheeredByMe: uid === currentUserId || cheeredByMe === true,
      };
    })).then((items) => {
      if (currentGeneration !== generation) return;
      resolvedItems = items.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      emitFresh();
    }).catch((error) => {
      console.warn('[Presence] 走行中メンバーの解決に失敗:', error);
      if (currentGeneration === generation) {
        resolvedItems = [];
        listener([]);
      }
    });
  }, (error) => {
    console.warn('[Presence] 走行中メンバーの購読に失敗:', error);
    resolvedItems = [];
    listener([]);
  });

  return () => {
    clearInterval(freshnessTimer);
    unsubscribe();
  };
}

export async function cheerRunningMember(params: {
  battleId: string;
  runnerId: string;
  sessionId: string;
  fromUid: string;
}): Promise<boolean> {
  const presenceRef = doc(db, 'battles', params.battleId, 'presence', params.runnerId);
  const presence = await getDoc(presenceRef);
  const data = presence.data();
  if (!presence.exists()
    || data?.['sessionId'] !== params.sessionId
    || !isPresenceFresh(data['visible'] === true, timestampMs(data['lastBeatAt']))) {
    return false;
  }

  const cheerRef = doc(
    db,
    'battles', params.battleId, 'presence', params.runnerId, 'cheers', params.fromUid,
  );
  const existing = await getDoc(cheerRef);
  if (existing.exists() && existing.data()['sessionId'] === params.sessionId) return false;
  await setDoc(cheerRef, {
    fromUid: params.fromUid,
    sessionId: params.sessionId,
    createdAt: serverTimestamp(),
  });
  writeOwnCheerCache(
    ownCheerKey(params.battleId, params.runnerId, params.sessionId, params.fromUid),
    true,
  );
  return true;
}

export function subscribeRunCheers(params: {
  battleId: string;
  runnerId: string;
  sessionId: string;
  onCheer: (cheer: LiveRunCheer) => void;
}): () => void {
  const cheersQuery = query(
    collection(db, 'battles', params.battleId, 'presence', params.runnerId, 'cheers'),
    where('sessionId', '==', params.sessionId),
  );
  let initialSnapshot = true;
  const subscribedAtMs = Date.now();
  return onSnapshot(cheersQuery, (snapshot) => {
    snapshot.docChanges()
      .filter((change) => change.type === 'added' || change.type === 'modified')
      .filter((change) => (
        !initialSnapshot
        || timestampMs(change.doc.data()['createdAt']) >= subscribedAtMs - 1_000
      ))
      .forEach((change) => {
        const data = change.doc.data();
        const senderId = data['fromUid'] as string;
        void cachedPublicProfile(senderId).then((profile) => params.onCheer({
          id: `${change.doc.id}:${params.sessionId}`,
          senderId,
          senderName: profile.name,
          receivedAt: timestampIso(data['createdAt']) || new Date().toISOString(),
        })).catch((error) => console.warn('[Presence] 応援者プロフィールの取得に失敗:', error));
      });
    initialSnapshot = false;
  }, (error) => console.warn('[Presence] ライブ応援の購読に失敗:', error));
}
