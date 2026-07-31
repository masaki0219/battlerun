import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export type ReportTargetType = 'user' | 'battle' | 'declaration' | 'presence' | 'activity';
export type ReportReason = 'harassment' | 'hate' | 'sexual' | 'violence' | 'spam' | 'impersonation' | 'other';
export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: '嫌がらせ・いじめ' },
  { value: 'hate', label: '差別的な内容' },
  { value: 'sexual', label: '性的・わいせつな内容' },
  { value: 'violence', label: '暴力・脅迫' },
  { value: 'spam', label: 'スパム・宣伝' },
  { value: 'impersonation', label: 'なりすまし' },
  { value: 'other', label: 'その他' },
];

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  targetUid?: string;
  battleId?: string;
  contentSnapshot?: string;
}

export interface BlockedUser {
  blockedUid: string;
  displayName: string;
  createdAt: string;
}

function timestampIso(value: unknown): string {
  const timestamp = value as { toDate?: () => Date } | undefined;
  return timestamp?.toDate?.().toISOString() ?? '';
}

export async function submitContentReport(params: {
  reporterUid: string;
  target: ReportTarget;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  const details = params.details?.trim() ?? '';
  const contentSnapshot = params.target.contentSnapshot?.trim().slice(0, 500) ?? '';
  await addDoc(collection(db, 'contentReports'), {
    reporterUid: params.reporterUid,
    targetType: params.target.type,
    targetId: params.target.id.slice(0, 200),
    ...(params.target.targetUid ? { targetUid: params.target.targetUid } : {}),
    ...(params.target.battleId ? { battleId: params.target.battleId.slice(0, 200) } : {}),
    ...(contentSnapshot ? { contentSnapshot } : {}),
    reason: params.reason,
    ...(details ? { details: details.slice(0, 300) } : {}),
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function blockUser(params: {
  blockerUid: string;
  blockedUid: string;
  displayName: string;
}): Promise<void> {
  if (params.blockerUid === params.blockedUid) throw new Error('自分自身はブロックできません');
  await setDoc(doc(db, 'users', params.blockerUid, 'blocks', params.blockedUid), {
    blockerUid: params.blockerUid,
    blockedUid: params.blockedUid,
    displayName: params.displayName.trim().slice(0, 40) || 'ユーザー',
    createdAt: serverTimestamp(),
  });
}

export async function unblockUser(blockerUid: string, blockedUid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', blockerUid, 'blocks', blockedUid));
}

export function subscribeBlockedUsers(
  userId: string,
  listener: (users: BlockedUser[]) => void,
): () => void {
  const blocksQuery = query(collection(db, 'users', userId, 'blocks'), orderBy('createdAt', 'desc'));
  return onSnapshot(blocksQuery, (snapshot) => {
    listener(snapshot.docs.map((item) => ({
      blockedUid: item.id,
      displayName: (item.data()['displayName'] as string | undefined) ?? 'ユーザー',
      createdAt: timestampIso(item.data()['createdAt']),
    })));
  }, (error) => {
    console.warn('[Moderation] ブロック一覧の取得に失敗:', error);
    listener([]);
  });
}
