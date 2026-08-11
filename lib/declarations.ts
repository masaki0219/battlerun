import {
  collection, deleteField, doc, getCountFromServer, getDoc, getDocs, onSnapshot, query, runTransaction,
  serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  cancelDeclarationReminder,
  registerPushToken,
  rescheduleDeclarationReminder,
  scheduleDeclarationReminder,
} from './notifications';
import {
  candidateDeclarationDateKeys,
  DECLARATION_RETENTION_MS,
  dateKeyAtTimeZone,
  declarationDocumentId,
  deviceTimeZone,
  isVisibleTodayDeclarationStatus,
  localDateKey,
  shouldCompleteDeclaration,
} from '../utils/declarations';
import { validateDeclarationNote } from './validation/declaration';
import { cachedPublicProfile } from './publicProfileCache';
import type { RunDeclaration } from '../types';

function timestampIso(value: unknown): string {
  const timestamp = value as { toDate?: () => Date } | undefined;
  return timestamp?.toDate?.().toISOString() ?? '';
}

export function subscribeTodayDeclarations(
  battleId: string,
  currentUserId: string,
  categoryId: string,
  listener: (declarations: RunDeclaration[]) => void,
): () => void {
  const dateKey = localDateKey();
  const declarationsQuery = query(
    collection(db, 'battles', battleId, 'declarations'),
    where('categoryId', '==', categoryId),
    where('dateKey', '==', dateKey),
    where('visible', '==', true),
    where('expireAt', '>', Timestamp.now()),
  );
  let generation = 0;
  return onSnapshot(declarationsQuery, (snapshot) => {
    const currentGeneration = ++generation;
    const visibleDocs = snapshot.docs.filter((declarationDoc) => {
      const status = declarationDoc.data()['status'] as string | undefined;
      return isVisibleTodayDeclarationStatus(status ?? '');
    });
    void Promise.all(visibleDocs.map(async (declarationDoc) => {
      const data = declarationDoc.data();
      const uid = data['uid'] as string;
      const cheers = collection(db, 'battles', battleId, 'declarations', declarationDoc.id, 'cheers');
      const ownCheerPromise = uid === currentUserId
        ? Promise.resolve(false)
        : getDoc(doc(cheers, currentUserId)).then((snapshot) => snapshot.exists());
      const [profile, ownCheer, cheerCount] = await Promise.all([
        cachedPublicProfile(uid),
        ownCheerPromise,
        getCountFromServer(cheers),
      ]);
      return {
        id: declarationDoc.id,
        battleId,
        uid,
        categoryId: (data['categoryId'] as string) ?? categoryId,
        dateKey: (data['dateKey'] as string) ?? dateKey,
        timezone: (data['timezone'] as string | undefined) || undefined,
        plannedAt: timestampIso(data['plannedAt']),
        note: (data['note'] as string | undefined) || undefined,
        status: (data['status'] as RunDeclaration['status']) ?? 'planned',
        createdAt: timestampIso(data['createdAt']),
        displayName: profile.name,
        avatarEmoji: profile.avatarEmoji,
        cheeredByMe: ownCheer,
        cheerCount: Math.max(0, cheerCount.data().count),
      } satisfies RunDeclaration;
    })).then((items) => {
      if (currentGeneration !== generation) return;
      listener(items
        .filter((item) => isVisibleTodayDeclarationStatus(item.status))
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
  categoryId: string;
  plannedAt: Date;
  note: string;
}): Promise<void> {
  const validation = validateDeclarationNote(params.note);
  if (!validation.ok) throw new Error(validation.reason);
  const timezone = deviceTimeZone();
  const dateKey = dateKeyAtTimeZone(params.plannedAt, timezone);
  const declarationId = declarationDocumentId(params.userId, params.plannedAt, timezone);
  const trimmedNote = params.note.trim();
  const declarationRef = doc(db, 'battles', params.battleId, 'declarations', declarationId);
  const previous = await getDoc(declarationRef);
  if (previous.exists() && previous.data()['status'] === 'cancelled') {
    // 同日中にもう一度宣言できるよう、前回分の応援を再利用前に消す。
    const oldCheers = await getDocs(collection(declarationRef, 'cheers'));
    for (let offset = 0; offset < oldCheers.docs.length; offset += 450) {
      const batch = writeBatch(db);
      oldCheers.docs.slice(offset, offset + 450).forEach((cheer) => batch.delete(cheer.ref));
      await batch.commit();
    }
  }
  await setDoc(declarationRef, {
    uid: params.userId,
    categoryId: params.categoryId,
    dateKey,
    timezone,
    plannedAt: Timestamp.fromDate(params.plannedAt),
    ...(trimmedNote ? { note: trimmedNote } : {}),
    status: 'planned',
    visible: true,
    createdAt: serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + DECLARATION_RETENTION_MS),
  });
  await scheduleDeclarationReminder({ declarationId, battleId: params.battleId, plannedAt: params.plannedAt });
  void registerPushToken(params.userId, false);
}

export async function updateDeclaration(params: {
  battleId: string;
  declaration: Pick<RunDeclaration, 'id' | 'dateKey' | 'plannedAt' | 'timezone'>;
  plannedAt: Date;
  note: string;
}): Promise<void> {
  const validation = validateDeclarationNote(params.note);
  if (!validation.ok) throw new Error(validation.reason);
  const declarationTimezone = params.declaration.timezone ?? deviceTimeZone();
  if (dateKeyAtTimeZone(params.plannedAt, declarationTimezone) !== params.declaration.dateKey) {
    throw new Error('宣言時刻は今日の範囲で選んでください。');
  }
  const trimmedNote = params.note.trim();
  await updateDoc(doc(db, 'battles', params.battleId, 'declarations', params.declaration.id), {
    plannedAt: Timestamp.fromDate(params.plannedAt),
    note: trimmedNote || deleteField(),
  });
  if (new Date(params.declaration.plannedAt).getTime() !== params.plannedAt.getTime()) {
    await rescheduleDeclarationReminder({
      declarationId: params.declaration.id,
      battleId: params.battleId,
      plannedAt: params.plannedAt,
    });
  }
}

export async function cancelDeclaration(params: {
  battleId: string;
  declarationId: string;
}): Promise<void> {
  await updateDoc(doc(db, 'battles', params.battleId, 'declarations', params.declarationId), {
    status: 'cancelled',
  });
  await cancelDeclarationReminder(params);
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
  startedAt: string;
  timezone?: string;
}): Promise<boolean> {
  const activityDate = new Date(params.startedAt);
  if (Number.isNaN(activityDate.getTime())) return false;
  let completed = false;
  await Promise.all(params.battleIds.map(async (battleId) => {
    const candidates = candidateDeclarationDateKeys(activityDate).map((dateKey) => doc(
      db,
      'battles',
      battleId,
      'declarations',
      `${params.userId}_${dateKey}`,
    ));
    const snapshots = await Promise.all(candidates.map((candidate) => getDoc(candidate)));
    const matching = snapshots.find((snapshot) => {
      if (!snapshot.exists()) return false;
      const data = snapshot.data();
      return shouldCompleteDeclaration({
        status: (data['status'] as string | undefined) ?? '',
        dateKey: (data['dateKey'] as string | undefined) ?? '',
        timezone: (data['timezone'] as string | undefined) || undefined,
        activityStartedAt: activityDate,
        fallbackTimezone: params.timezone,
      });
    });
    if (!matching) return;
    const changed = await runTransaction(db, async (transaction) => {
      const latest = await transaction.get(matching.ref);
      if (!latest.exists()) return false;
      const data = latest.data();
      if (!shouldCompleteDeclaration({
        status: (data['status'] as string | undefined) ?? '',
        dateKey: (data['dateKey'] as string | undefined) ?? '',
        timezone: (data['timezone'] as string | undefined) || undefined,
        activityStartedAt: activityDate,
        fallbackTimezone: params.timezone,
      })) return false;
      transaction.update(matching.ref, { status: 'done' });
      return true;
    });
    if (changed) completed = true;
  }));
  return completed;
}
