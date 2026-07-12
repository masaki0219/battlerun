import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, writeBatch, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { AuthStore, User, UserTitle } from '../types';

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,
  proEntitlement: false,

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // isLoading は onAuthStateChanged が user をセットしたタイミングで false になる
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  signUp: async (email, password, name) => {
    set({ isLoading: true });
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', result.user.uid), {
        name,
        avatarUrl: null,
        plan: 'free',
        createdAt: new Date(),
      });
      batch.set(doc(db, 'publicProfiles', result.user.uid), {
        name,
        avatarUrl: null,
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
    set({ user: null });
  },

  setProEntitlement: (active) => set({ proEntitlement: active }),
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
            avatarUrl: firebaseUser.photoURL ?? null,
            plan: 'free',
            createdAt: new Date(),
          });
          await setDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
            name,
            avatarUrl: firebaseUser.photoURL ?? null,
            avatarEmoji: null,
            updatedAt: serverTimestamp(),
          });
        }

        const current = (await getDoc(userRef)).data()!;
        if (generation !== authGeneration) return;
        await setDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
          name: (current['name'] as string | undefined) ?? 'ユーザー',
          avatarUrl: (current['avatarUrl'] as string | null | undefined) ?? null,
          avatarEmoji: (current['avatarEmoji'] as string | null | undefined) ?? null,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        if (generation !== authGeneration) return;

        // plan・称号・累計値を含むサーバー更新をリアルタイムでUIへ反映する。
        unsubscribeUser = onSnapshot(userRef, (userSnap) => {
          if (!userSnap.exists()) {
            useAuthStore.setState({ user: null, isLoading: false });
            return;
          }
          const data = userSnap.data();
          const user: User = {
            id: firebaseUser.uid,
            authId: firebaseUser.uid,
            name: data['name'] as string,
            avatarUrl: data['avatarUrl'] as string | undefined,
            avatarEmoji: data['avatarEmoji'] as string | undefined,
            plan: data['plan'] as 'free' | 'pro',
            role: data['role'] as 'admin' | undefined,
            createdAt: (data['createdAt'] as any)?.toDate?.()?.toISOString() ?? '',
            titles: (data['titles'] as UserTitle[] | undefined) ?? [],
            battleIds: (data['battleIds'] as string[] | undefined) ?? [],
            totalDistanceKm: (data['totalDistanceKm'] as number | undefined) ?? undefined,
            activityCount: (data['activityCount'] as number | undefined) ?? undefined,
          };
          useAuthStore.setState({ user, isLoading: false });
        }, (error) => {
          console.error('[Auth] Firestoreユーザー購読失敗:', error);
          useAuthStore.setState({ user: null, isLoading: false });
        });
      } catch (e) {
        console.error('[Auth] Firestoreユーザー取得失敗:', e);
        useAuthStore.setState({ user: null, isLoading: false });
      }
    } else {
      useAuthStore.setState({ user: null, isLoading: false });
    }
  });
  return () => {
    unsubscribeUser?.();
    unsubscribeAuth();
  };
}
