import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { AuthStore, User } from '../types';

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // ユーザー情報は onAuthStateChanged リスナーが自動的に set する
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email, password, name) => {
    set({ isLoading: true });
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', result.user.uid), {
        name,
        avatarUrl: null,
        plan: 'free',
        createdAt: new Date(),
      });
      // onAuthStateChanged がユーザー情報を set する
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth);
    set({ user: null });
  },
}));

// アプリ起動時に一度だけ呼ぶ。Firebase Auth のセッションを永続的に監視する。
export function initAuthListener(): () => void {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
      const data = snap.data();
      const user: User | null = snap.exists() && data
        ? {
            id: firebaseUser.uid,
            authId: firebaseUser.uid,
            name: data['name'] as string,
            avatarUrl: data['avatarUrl'] as string | undefined,
            plan: data['plan'] as 'free' | 'pro',
            createdAt: (data['createdAt'] as any)?.toDate?.()?.toISOString() ?? '',
            titles: ((data['titles'] as any[]) ?? []).map((t: any) => ({
              seasonId: (t.seasonId as string) ?? '',
              battleId: (t.battleId as string) ?? '',
              battleTitle: (t.battleTitle as string) ?? '',
              teamName: (t.teamName as string) ?? '',
              rank: (t.rank as number) ?? 0,
              awardedAt: t.awardedAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
            })),
          }
        : null;
      useAuthStore.setState({ user, isLoading: false });
    } else {
      useAuthStore.setState({ user: null, isLoading: false });
    }
  });
}
