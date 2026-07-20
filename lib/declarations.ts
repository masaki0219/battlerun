import {
  collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc,
  Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from './firebase';
import { registerPushToken, scheduleDeclarationReminder } from './notifications';
import { declarationDocumentId, localDateKey } from '../utils/declarations';
import { validateDeclarationNote } from './validation/declaration';
import type { RunDeclaration } from '../types';

const profileCache = new Map<string, { name: string; avatarEmoji?: string }>();

function timestampIso(value: unknown): string {
  const timestamp = value as { toDate?: () => Date } | undefined;
  return timestamp?.toDate?.().toISOString() ?? '';
}

async function declarationProfile(uid: string) {
  const cached = profileCache.get(uid);
  if (cached) return cached;
  const snapshot = await getDoc(doc(db, 'publicProfiles', uid));
  const profile = {
    name: (snapshot.data()?.['name'] as string | undefined) ?? 'メンバー',
    avatarEmoji: (snapshot.data()?.['avatarEmoji'] as string | undefined) ?? undefined,
  };
  profileCache.set(uid, profile);
  return profile;
}

export function subscribeTodayDeclarations(
  battleId: string,
  currentUserId: string,
  listener: (declarations: RunDeclaration[]) => void,
): () => void {
  const dateKey = localDateKey();
  const declarationsQuery = query(
    collection(db, 'battles', battleId, 'declarations'),
    where('dateKey', '==', dateKey),
  );
  let generation = 0;
  return onSnapshot(declarationsQuery, (snapshot) => {
    const currentGeneration = ++generation;
    void Promise.all(snapshot.docs.map(async (declarationDoc) => {
      const data = declarationDoc.data();
      const uid = data['uid'] as string;
      const [profile, ownCheer] = await Promise.all([
        declarationProfile(uid),
        getDoc(doc(db, 'battles', battleId, 'declarations', declarationDoc.id, 'cheers', currentUserId)),
      ]);
      return {
        id: declarationDoc.id,
        battleId,
        uid,
        dateKey: (data['dateKey'] as string) ?? dateKey,
        plannedAt: timestampIso(data['plannedAt']),
        note: (data['note'] as string | undefined) || undefined,
        status: (data['status'] as RunDeclaration['status']) ?? 'planned',
        createdAt: timestampIso(data['createdAt']),
        displayName: profile.name,
        avatarEmoji: profile.avatarEmoji,
        cheeredByMe: ownCheer.exists(),
      } satisfies RunDeclaration;
    })).then((items) => {
      if (currentGeneration !== generation) return;
      listener(items
        .filter((item) => item.status !== 'expired')
        .sort((a, b) => new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime()));
    }).catch((error) => {
      console.warn('[Declarations] 宣言一覧の解決に失敗:', error);
      if (currentGeneration === generation) listener([]);
    });
  }, (error) => {
    console.warn('[Declarations] 宣言購読に失敗:', error);
    listener([]);
  });
}

export async function createDeclaration(params: {
  battleId: string;
  userId: string;
  plannedAt: Date;
  note: string;
}): Promise<void> {
  const validation = validateDeclarationNote(params.note);
  if (!validation.ok) throw new Error(validation.reason);
  const declarationId = declarationDocumentId(params.userId, params.plannedAt);
  const trimmedNote = params.note.trim();
  await setDoc(doc(db, 'battles', params.battleId, 'declarations', declarationId), {
    uid: params.userId,
    dateKey: localDateKey(params.plannedAt),
    plannedAt: Timestamp.fromDate(params.plannedAt),
    ...(trimmedNote ? { note: trimmedNote } : {}),
    status: 'planned',
    createdAt: serverTimestamp(),
  });
  await scheduleDeclarationReminder({ declarationId, battleId: params.battleId, plannedAt: params.plannedAt });
  void registerPushToken(params.userId, false);
}

export async function cheerDeclaration(params: {
  battleId: string;
  declarationId: string;
  fromUid: string;
}): Promise<boolean> {
  const cheerRef = doc(
    db, 'battles', params.battleId, 'declarations', params.declarationId, 'cheers', params.fromUid,
  );
  if ((await getDoc(cheerRef)).exists()) return false;
  await setDoc(cheerRef, { fromUid: params.fromUid, createdAt: serverTimestamp() });
  return true;
}

/** 保存済みアクティビティの日付に対応する宣言をdoneへ更新する。 */
export async function completeDeclarationsForActivity(params: {
  battleIds: string[];
  userId: string;
  endedAt: string;
}): Promise<boolean> {
  const activityDate = new Date(params.endedAt);
  if (Number.isNaN(activityDate.getTime())) return false;
  const declarationId = declarationDocumentId(params.userId, activityDate);
  let completed = false;
  await Promise.all(params.battleIds.map(async (battleId) => {
    const declarationRef = doc(db, 'battles', battleId, 'declarations', declarationId);
    const snapshot = await getDoc(declarationRef);
    if (!snapshot.exists() || snapshot.data()['status'] !== 'planned') return;
    await updateDoc(declarationRef, { status: 'done' });
    completed = true;
  }));
  return completed;
}
