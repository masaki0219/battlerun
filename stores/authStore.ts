import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { deleteField, doc, setDoc, getDoc, serverTimestamp, writeBatch, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { AuthStore, PersonalRecords, User, UserTitle } from '../types';

function personalRecordsFrom(value: unknown): PersonalRecords | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const records: PersonalRecords = {};
  const keys = [
    'fastest1kSec', 'fastest5kSec', 'fastest10kSec',
    'longestRunKm', 'maxElevationGainM', 'bestMonthKm',
  ] as const;
  for (const key of keys) {
    const record = raw[key];
    if (typeof record === 'number' && Number.isFinite(record) && record >= 0) records[key] = record;
  }
  return Object.keys(records).length > 0 ? records : undefined;
}

function profileLoadErrorMessage(error: unknown): string {
  const rawCode = error && typeof error === 'object'
    ? (error as { code?: unknown }).code
    : null;
  const code = typeof rawCode === 'string' ? rawCode.replace(/^firestore\//, '') : '';
  if (code === 'permission-denied') {
    return 'プロフィール情報へのアクセス権限を確認できませんでした。再試行しても解決しない場合はヘルプをご確認ください。';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'network-request-failed') {
    return 'オフラインまたは通信がタイムアウトしました。接続を確認して再試行してください。';
  }
  return 'プロフィール情報を読み込めませんでした。通信状態を確認して再試行してください。';
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,
  authSessionActive: false,
  profileError: null,
  proEntitlement: false,

  signIn: async (email, password) => {
    set({ isLoading: true, profileError: null });
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // isLoading は onAuthStateChanged が user をセットしたタイミングで false になる
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  signUp: async (email, password, name) => {
    set({ isLoading: true, profileError: null });
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', result.user.uid), {
        name,
        plan: 'free',
        runningPresenceVisible: false,
        createdAt: new Date(),
      });
      batch.set(doc(db, 'publicProfiles', result.user.uid), {
        name,
        avatarEmoji: null,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      // isLoading は onAuthStateChanged が user をセットしたタイミングで false になる
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth);
    set({ user: null, authSessionActive: false, profileError: null });
  },

  setProEntitlement: (active) => set({ proEntitlement: active }),

  setWeeklyGoal: async (goal) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('ログインが必要です');
    await updateDoc(doc(db, 'users', user.id), { weeklyGoal: goal });
  },

  setRunningPresenceVisible: async (visible) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('ログインが必要です');
    await updateDoc(doc(db, 'users', user.id), { runningPresenceVisible: visible });
  },
}));

// アプリ起動時に一度だけ呼ぶ。Firebase Auth のセッションを永続的に監視する。
export function initAuthListener(): () => void {
  let unsubscribeUser: (() => void) | null = null;
  let authGeneration = 0;
  const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
    const generation = ++authGeneration;
    unsubscribeUser?.();
    unsubscribeUser = null;
    if (firebaseUser) {
      useAuthStore.setState({ authSessionActive: true, profileError: null });
      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);

        // 認証ユーザーに対応するFirestoreプロフィールが無い場合は初期化する。
        if (!snap.exists()) {
          const name = firebaseUser.displayName
            ?? firebaseUser.email?.split('@')[0]
            ?? 'ユーザー';
          await setDoc(doc(db, 'users', firebaseUser.uid), {
            name,
            plan: 'free',
            runningPresenceVisible: false,
            createdAt: new Date(),
          });
          await setDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
            name,
            avatarEmoji: null,
            updatedAt: serverTimestamp(),
          });
        }

        const current = (await getDoc(userRef)).data()!;
        if (generation !== authGeneration) return;
        // 旧写真機能のURLはログイン時にプロフィールから除去し、固定アイコンへ統一する。
        // avatarUrl はどの画面からも読まれないため、この掃除はログインの前提条件ではない。
        // ルール検証に引っかかる既存ドキュメントでユーザーを締め出さないよう、失敗しても続行する。
        try {
          const profileBatch = writeBatch(db);
          profileBatch.update(userRef, { avatarUrl: deleteField() });
          profileBatch.set(doc(db, 'publicProfiles', firebaseUser.uid), {
            name: (current['name'] as string | undefined) ?? 'ユーザー',
            avatarEmoji: (current['avatarEmoji'] as string | null | undefined) ?? null,
            avatarUrl: deleteField(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
          await profileBatch.commit();
        } catch (cleanupError) {
          console.warn('[Auth] 旧avatarUrlの除去に失敗（ログインは継続）:', cleanupError);
        }
        if (generation !== authGeneration) return;

        // plan・称号・累計値を含むサーバー更新をリアルタイムでUIへ反映する。
        unsubscribeUser = onSnapshot(userRef, (userSnap) => {
          if (!userSnap.exists()) {
            // Auth セッションは有効なまま。削除・権限エラーをログアウト表示に誤変換しない。
            useAuthStore.setState({
              profileError: 'プロフィール情報が見つかりません。通信状態を確認して再試行してください。',
              isLoading: false,
            });
            return;
          }
          const data = userSnap.data();
          const weeklyGoalData = data['weeklyGoal'];
          const weeklyGoal = weeklyGoalData
            && (weeklyGoalData.type === 'distance' || weeklyGoalData.type === 'days')
            && typeof weeklyGoalData.value === 'number'
            ? { type: weeklyGoalData.type, value: weeklyGoalData.value }
            : null;
          const user: User = {
            id: firebaseUser.uid,
            authId: firebaseUser.uid,
            name: data['name'] as string,
            avatarEmoji: typeof data['avatarEmoji'] === 'string' ? data['avatarEmoji'] : undefined,
            plan: data['plan'] as 'free' | 'pro',
            role: data['role'] as 'admin' | undefined,
            createdAt: (data['createdAt'] as any)?.toDate?.()?.toISOString() ?? '',
            titles: (data['titles'] as UserTitle[] | undefined) ?? [],
            battleIds: (data['battleIds'] as string[] | undefined) ?? [],
            totalDistanceKm: (data['totalDistanceKm'] as number | undefined) ?? undefined,
            activityCount: (data['activityCount'] as number | undefined) ?? undefined,
            weeklyGoal,
            personalRecords: personalRecordsFrom(data['personalRecords']),
            runningPresenceVisible: data['runningPresenceVisible'] === true,
          };
          useAuthStore.setState({ user, authSessionActive: true, profileError: null, isLoading: false });
        }, (error) => {
          console.error('[Auth] Firestoreユーザー購読失敗:', error);
          useAuthStore.setState({
            authSessionActive: true,
            profileError: profileLoadErrorMessage(error),
            isLoading: false,
          });
        });
      } catch (e) {
        console.error('[Auth] Firestoreユーザー取得失敗:', e);
        useAuthStore.setState({
          authSessionActive: true,
          profileError: profileLoadErrorMessage(e),
          isLoading: false,
        });
      }
    } else {
      useAuthStore.setState({
        user: null,
        authSessionActive: false,
        profileError: null,
        isLoading: false,
      });
    }
  });
  return () => {
    unsubscribeUser?.();
    unsubscribeAuth();
  };
}
