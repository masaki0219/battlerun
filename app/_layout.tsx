import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../lib/firebase';
import { initAuthListener, useAuthStore } from '../stores/authStore';
import { initRevenueCat, checkProEntitlement } from '../lib/revenuecat';
import { registerPushToken } from '../lib/notifications';
import { ONBOARDING_KEY } from './onboarding';

const SEEN_RESULTS_KEY = 'battlerun_seen_results';

export default function RootLayout() {
  const { user, isLoading } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [resultChecked, setResultChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = initAuthListener();
    return unsubscribe;
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => {
      setShowOnboarding(!v);
      setOnboardingChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    initRevenueCat(user.id);
    registerPushToken(user.id);
    checkProEntitlement().then((active) => useAuthStore.getState().setProEntitlement(active));
  }, [user?.id]);

  // バトル終了後の自動表示: ログイン後に一度だけチェック
  useEffect(() => {
    if (!user || resultChecked) return;
    setResultChecked(true);
    checkFinishedBattles(user.id, router);
  }, [user?.id]);

  // プッシュ通知タップ時、data の relatedBattleId / relatedActivityId で該当画面へ遷移する
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        relatedBattleId?: string;
        relatedActivityId?: string;
      };
      if (data?.relatedActivityId) {
        router.push(`/activity/${data.relatedActivityId}` as any);
      } else if (data?.relatedBattleId) {
        router.push(`/battle/${data.relatedBattleId}` as any);
      }
    });
    return () => sub.remove();
  }, []);

  // 認証状態 + オンボーディング確認が揃ってから画面を振り分ける
  useEffect(() => {
    if (isLoading || !onboardingChecked) return;
    const inAuth = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';

    if (!user) {
      if (!inAuth && !inOnboarding) {
        if (showOnboarding) {
          router.replace('/onboarding');
        } else {
          router.replace('/auth/login');
        }
      }
    } else if (user && (inAuth || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments, onboardingChecked, showOnboarding]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/signup" />
        <Stack.Screen name="battle/[id]" />
        <Stack.Screen name="battle/result/[id]" />
        <Stack.Screen name="battle/theme" />
        <Stack.Screen name="record/summary" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="badges" />
        <Stack.Screen name="activity/[id]" />
        <Stack.Screen name="admin" />
      </Stack>
    </>
  );
}

/**
 * ログイン後に終了済みバトルをチェック → 未閲覧の結果画面へ誘導
 * AsyncStorage で既閲覧バトルIDを管理し二重表示を防ぐ
 */
async function checkFinishedBattles(userId: string, router: ReturnType<typeof useRouter>) {
  try {
    const seenRaw = await AsyncStorage.getItem(SEEN_RESULTS_KEY);
    const seen: string[] = seenRaw ? JSON.parse(seenRaw) : [];

    // 参加しているfinishedバトルを取得
    const userSnap = await import('firebase/firestore').then(({ getDoc, doc }) =>
      getDoc(doc(db, 'users', userId))
    );
    const battleIds: string[] = (userSnap.data()?.['battleIds'] as string[] | undefined) ?? [];
    if (battleIds.length === 0) return;

    const { getDoc: fGetDoc, doc: fDoc } = await import('firebase/firestore');
    for (const bid of battleIds) {
      if (seen.includes(bid)) continue;
      const bSnap = await fGetDoc(fDoc(db, 'battles', bid));
      if (!bSnap.exists()) continue;
      const status = bSnap.data()['status'] as string;
      if (status !== 'finished') continue;

      // 初回表示: 既読マーク → 結果画面へ
      const newSeen = [...seen, bid];
      await AsyncStorage.setItem(SEEN_RESULTS_KEY, JSON.stringify(newSeen));

      // 少し遅延させてルーターが初期化されてから遷移
      setTimeout(() => {
        router.push(`/battle/result/${bid}` as any);
      }, 1500);
      return; // 一度に1件だけ表示
    }
  } catch {
    // サイレントに失敗
  }
}
