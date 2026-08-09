import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface CachedPublicProfile {
  name: string;
  avatarEmoji?: string;
}

const PROFILE_CACHE_TTL_MS = 5 * 60_000;
const PROFILE_CACHE_MAX_ENTRIES = 200;
const profileCache = new Map<string, { profile: CachedPublicProfile; expiresAt: number }>();
const profileRequests = new Map<string, Promise<CachedPublicProfile>>();

function trimProfileCache(nowMs: number): void {
  for (const [uid, cached] of profileCache) {
    if (cached.expiresAt <= nowMs) profileCache.delete(uid);
  }
  while (profileCache.size >= PROFILE_CACHE_MAX_ENTRIES) {
    const oldestKey = profileCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    profileCache.delete(oldestKey);
  }
}

/** 公開プロフィールの短期・上限付きキャッシュ。表示名変更は最大5分で反映する。 */
export async function cachedPublicProfile(uid: string): Promise<CachedPublicProfile> {
  const nowMs = Date.now();
  const cached = profileCache.get(uid);
  if (cached && cached.expiresAt > nowMs) return cached.profile;
  const inFlight = profileRequests.get(uid);
  if (inFlight) return inFlight;

  const request = getDoc(doc(db, 'publicProfiles', uid)).then((snapshot) => {
    const profile = {
      name: (snapshot.data()?.['name'] as string | undefined) ?? 'メンバー',
      avatarEmoji: (snapshot.data()?.['avatarEmoji'] as string | undefined) ?? undefined,
    };
    const resolvedAtMs = Date.now();
    trimProfileCache(resolvedAtMs);
    profileCache.set(uid, { profile, expiresAt: resolvedAtMs + PROFILE_CACHE_TTL_MS });
    return profile;
  }).finally(() => profileRequests.delete(uid));
  profileRequests.set(uid, request);
  return request;
}
