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
      await setDoc(doc(db, 'users', result.user.uid), {
        name,
        avatarUrl: null,
        plan: 'free',
        createdAt: new Date(),
      });
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
}));

// アプリ起動時に一度だけ呼ぶ。Firebase Auth のセッションを永続的に監視する。
export function initAuthListener(): () => void {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        const data = snap.data();

        // Google/Apple サインインの初回: Firestore にユーザーを自動作成
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
          useAuthStore.setState({
            user: {
              id: firebaseUser.uid,
              authId: firebaseUser.uid,
              name,
              avatarUrl: firebaseUser.photoURL ?? undefined,
              plan: 'free',
              createdAt: new Date().toISOString(),
              battleIds: [],
            },
            isLoading: false,
          });
          return;
        }

        const user: User = {
          id: firebaseUser.uid,
          authId: firebaseUser.uid,
          name: data!['name'] as string,
          avatarUrl: data!['avatarUrl'] as string | undefined,
          avatarEmoji: data!['avatarEmoji'] as string | undefined,
          plan: data!['plan'] as 'free' | 'pro',
          role: data!['role'] as 'admin' | undefined,
          createdAt: (data!['createdAt'] as any)?.toDate?.()?.toISOString() ?? '',
          battleIds: (data!['battleIds'] as string[] | undefined) ?? [],
        };
        useAuthStore.setState({ user, isLoading: false });
      } catch (e) {
        console.error('[Auth] Firestoreユーザー取得失敗:', e);
        useAuthStore.setState({ user: null, isLoading: false });
      }
    } else {
      useAuthStore.setState({ user: null, isLoading: false });
    }
  });
}
