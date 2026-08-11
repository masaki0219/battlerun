import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collectionGroup,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { signOutGoogleSession } from '../lib/socialAuth';
import { DISPLAY_NAME_MAX_LENGTH, validateDisplayName } from '../lib/validation/displayName';
import type { AuthStore, PersonalRecords, User, UserTitle } from '../types';
import { isAvatarEmoji } from '../lib/avatarEmojis';

let emailSignUpInProgress = false;

function profileNameSuggestion(value: string | null | undefined): string {
  return (value ?? '').trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
}

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
  profileSetupRequired: false,
  suggestedProfileName: '',
  accountLinkingInProgress: false,
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
    const nameCheck = validateDisplayName(name);
    if (!nameCheck.ok) throw new Error(nameCheck.reason);
    const normalizedName = name.trim();
    set({ isLoading: true, profileError: null });
    emailSignUpInProgress = true;
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', result.user.uid), {
        name: normalizedName,
        plan: 'free',
        runningPresenceVisible: false,
        runDeclarationVisible: false,
        createdAt: new Date(),
      });
      batch.set(doc(db, 'publicProfiles', result.user.uid), {
        name: normalizedName,
        avatarEmoji: null,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      emailSignUpInProgress = false;
      // isLoading は onAuthStateChanged が user をセットしたタイミングで false になる
    } catch (error) {
      emailSignUpInProgress = false;
      set({
        isLoading: false,
        profileSetupRequired: auth.currentUser !== null,
        suggestedProfileName: profileNameSuggestion(normalizedName),
      });
      throw error;
    }
  },

  signOut: async () => {
    const hadGoogleProvider = auth.currentUser?.providerData.some(
      (provider) => provider.providerId === 'google.com',
    ) === true;
    await firebaseSignOut(auth);
    if (hadGoogleProvider) await signOutGoogleSession();
    set({
      user: null,
      authSessionActive: false,
      profileError: null,
      profileSetupRequired: false,
      suggestedProfileName: '',
      accountLinkingInProgress: false,
    });
  },

  completeProfileSetup: async (name, avatarEmoji) => {
    const nameCheck = validateDisplayName(name);
    if (!nameCheck.ok) throw new Error(nameCheck.reason);
    if (!isAvatarEmoji(avatarEmoji)) throw new Error('アイコンを選んでください');
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('ログインが必要です');

    set({ isLoading: true, profileError: null });
    try {
      const normalizedName = name.trim();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', currentUser.uid), {
        name: normalizedName,
        avatarEmoji,
        plan: 'free',
        runningPresenceVisible: false,
        runDeclarationVisible: false,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'publicProfiles', currentUser.uid), {
        name: normalizedName,
        avatarEmoji,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      set({ isLoading: false, profileSetupRequired: true });
      throw error;
    }
  },

  setSuggestedProfileName: (name) => set({
    suggestedProfileName: profileNameSuggestion(name),
  }),

  setAccountLinkingInProgress: (active) => set({ accountLinkingInProgress: active }),

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

  setRunDeclarationVisible: async (visible) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('ログインが必要です');
    const userRef = doc(db, 'users', user.id);
    if (visible) {
      await updateDoc(userRef, { runDeclarationVisible: true });
      return;
    }

    // 設定OFFと現在公開中の宣言を同じバッチで反映し、表示だけOFFの中間状態を作らない。
    const visibleDeclarations = await getDocs(query(
      collectionGroup(db, 'declarations'),
      where('uid', '==', user.id),
      where('visible', '==', true),
    ));
    if (visibleDeclarations.size > 450) {
      throw new Error('公開中の宣言が多いため設定を更新できませんでした。');
    }
    const batch = writeBatch(db);
    visibleDeclarations.docs.forEach((snapshot) => batch.update(snapshot.ref, { visible: false }));
    batch.update(userRef, { runDeclarationVisible: false });
    await batch.commit();
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
      useAuthStore.setState({
        user: null,
        authSessionActive: true,
        profileError: null,
        profileSetupRequired: false,
        isLoading: true,
      });
      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);

        // ソーシャル初回ログインではprovider名をそのまま公開せず、検証画面を必ず挟む。
        // メール新規登録中はsignUp側のbatch作成を待ち、画面の一瞬の切替を避ける。
        if (!snap.exists()) {
          const currentSuggestion = useAuthStore.getState().suggestedProfileName;
          if (!currentSuggestion) {
            useAuthStore.getState().setSuggestedProfileName(firebaseUser.displayName);
          }

          unsubscribeUser = onSnapshot(userRef, (userSnap) => {
            if (generation !== authGeneration) return;
            if (!userSnap.exists()) {
              useAuthStore.setState({
                user: null,
                authSessionActive: true,
                profileError: null,
                profileSetupRequired: !emailSignUpInProgress,
                isLoading: emailSignUpInProgress,
              });
              return;
            }
            applyUserSnapshot(firebaseUser.uid, userSnap.data());
          }, (error) => {
            if (generation !== authGeneration) return;
            console.error('[Auth] Firestoreユーザー購読失敗:', error);
            useAuthStore.setState({
              authSessionActive: true,
              profileSetupRequired: false,
              profileError: profileLoadErrorMessage(error),
              isLoading: false,
            });
          });
          return;
        }

        const current = snap.data();
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
          if (generation !== authGeneration) return;
          if (!userSnap.exists()) {
            useAuthStore.setState({
              user: null,
              authSessionActive: true,
              profileError: null,
              profileSetupRequired: true,
              isLoading: false,
            });
            return;
          }
          applyUserSnapshot(firebaseUser.uid, userSnap.data());
        }, (error) => {
          if (generation !== authGeneration) return;
          console.error('[Auth] Firestoreユーザー購読失敗:', error);
          useAuthStore.setState({
            authSessionActive: true,
            profileSetupRequired: false,
            profileError: profileLoadErrorMessage(error),
            isLoading: false,
          });
        });
      } catch (e) {
        console.error('[Auth] Firestoreユーザー取得失敗:', e);
        useAuthStore.setState({
          authSessionActive: true,
          profileSetupRequired: false,
          profileError: profileLoadErrorMessage(e),
          isLoading: false,
        });
      }
    } else {
      useAuthStore.setState({
        user: null,
        authSessionActive: false,
        profileError: null,
        profileSetupRequired: false,
        suggestedProfileName: '',
        accountLinkingInProgress: false,
        isLoading: false,
      });
    }
  });
  return () => {
    unsubscribeUser?.();
    unsubscribeAuth();
  };
}

function applyUserSnapshot(firebaseUid: string, data: Record<string, any>): void {
  const weeklyGoalData = data['weeklyGoal'];
  const weeklyGoal = weeklyGoalData
    && (weeklyGoalData.type === 'distance' || weeklyGoalData.type === 'days')
    && typeof weeklyGoalData.value === 'number'
    ? { type: weeklyGoalData.type, value: weeklyGoalData.value }
    : null;
  const user: User = {
    id: firebaseUid,
    authId: firebaseUid,
    name: data['name'] as string,
    avatarEmoji: typeof data['avatarEmoji'] === 'string' ? data['avatarEmoji'] : undefined,
    plan: data['plan'] as 'free' | 'pro',
    role: data['role'] as 'admin' | undefined,
    createdAt: data['createdAt']?.toDate?.()?.toISOString() ?? '',
    titles: (data['titles'] as UserTitle[] | undefined) ?? [],
    battleIds: (data['battleIds'] as string[] | undefined) ?? [],
    totalDistanceKm: (data['totalDistanceKm'] as number | undefined) ?? undefined,
    activityCount: (data['activityCount'] as number | undefined) ?? undefined,
    weeklyGoal,
    personalRecords: personalRecordsFrom(data['personalRecords']),
    runningPresenceVisible: data['runningPresenceVisible'] === true,
    runDeclarationVisible: data['runDeclarationVisible'] === true,
  };
  useAuthStore.setState({
    user,
    authSessionActive: true,
    profileError: null,
    profileSetupRequired: false,
    suggestedProfileName: '',
    isLoading: false,
  });
}
