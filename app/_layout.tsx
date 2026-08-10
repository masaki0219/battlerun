import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../lib/firebase';
import { initAuthListener, useAuthStore } from '../stores/authStore';
import { initRevenueCat, checkProEntitlement } from '../lib/revenuecat';
import { registerPushToken } from '../lib/notifications';
import { ONBOARDING_KEY } from './onboarding';
import { BorderRadius, Colors, Spacing, Typography } from '../design_tokens';

const SEEN_RESULTS_KEY = 'battlerun_seen_results';

export default function RootLayout() {
  const {
    user,
    isLoading,
    authSessionActive,
    profileError,
    profileSetupRequired,
    accountLinkingInProgress,
  } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [resultCheckedUserId, setResultCheckedUserId] = useState<string | null>(null);
  const [authRetryKey, setAuthRetryKey] = useState(0);

  const retryProfileLoad = () => {
    useAuthStore.setState({ isLoading: true, profileError: null });
    setAuthRetryKey((value) => value + 1);
  };

  useEffect(() => {
    const unsubscribe = initAuthListener();
    return unsubscribe;
  }, [authRetryKey]);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => {
      setShowOnboarding(!v);
      setOnboardingChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    void registerPushToken(user.id, false);
    // configure() 完了前に getCustomerInfo() を呼ぶと失敗して false で上書きされるため、
    // 初期化を待ってから entitlement を確認する。
    void (async () => {
      await initRevenueCat(user.id);
      const active = await checkProEntitlement();
      useAuthStore.getState().setProEntitlement(active);
    })();
  }, [user?.id]);

  // バトル終了後の自動表示: ログイン後に一度だけチェック
  useEffect(() => {
    if (!user || resultCheckedUserId === user.id) return;
    setResultCheckedUserId(user.id);
    checkFinishedBattles(user.id, router);
  }, [user?.id, resultCheckedUserId]);

  // プッシュ通知タップ時、data の relatedBattleId / relatedActivityId で該当画面へ遷移する
  useEffect(() => {
    const openNotification = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as {
        type?: string;
        relatedBattleId?: string;
        relatedActivityId?: string;
        openRecord?: boolean;
      };
      if (data?.openRecord || data?.type === 'declaration_reminder') {
        router.push('/(tabs)/record' as any);
      } else if (data?.relatedActivityId) {
        router.push(`/activity/${data.relatedActivityId}` as any);
      } else if (data?.relatedBattleId) {
        if (data.type === 'battle_ended' || data.type === 'title_earned') {
          router.push(`/battle/result/${data.relatedBattleId}` as any);
        } else {
          router.push(`/battle/${data.relatedBattleId}` as any);
        }
      }
    };
    void Notifications.getLastNotificationResponseAsync().then(openNotification);
    const sub = Notifications.addNotificationResponseReceivedListener(openNotification);
    return () => sub.remove();
  }, []);

  // 認証状態 + オンボーディング確認が揃ってから画面を振り分ける
  useEffect(() => {
    if (isLoading || !onboardingChecked) return;
    const inAuth = segments[0] === 'auth';
    const authScreen = (segments as readonly string[])[1];
    const inProfileSetup = inAuth && authScreen === 'profile-setup';
    const inAccountLink = inAuth && authScreen === 'link-account';
    const inOnboarding = segments[0] === 'onboarding';
    const inPublicInfo = segments[0] === 'legal' || segments[0] === 'help' || segments[0] === 'invite';

    // Firestoreだけ失敗した認証済みユーザーをログイン画面へ送らない。
    if (authSessionActive && profileError) return;

    // Authだけ完了した初回ユーザーは、検証済みニックネームを作るまでアプリ本体へ入れない。
    if (authSessionActive && profileSetupRequired) {
      if (!inProfileSetup && !inPublicInfo) router.replace('/auth/profile-setup');
      return;
    }

    if (!user) {
      if (accountLinkingInProgress && inAccountLink) return;
      if (!inAuth && !inOnboarding && !inPublicInfo) {
        if (showOnboarding) {
          router.replace('/onboarding');
        } else {
          router.replace('/auth/login');
        }
      }
    } else if (user && (inAuth || inOnboarding)) {
      if (accountLinkingInProgress && inAccountLink) return;
      router.replace('/(tabs)');
    }
  }, [
    user,
    isLoading,
    authSessionActive,
    profileError,
    profileSetupRequired,
    accountLinkingInProgress,
    segments,
    onboardingChecked,
    showOnboarding,
  ]);

  const inPublicInfo = segments[0] === 'legal' || segments[0] === 'help' || segments[0] === 'invite';
  if (!isLoading && authSessionActive && profileError && !user && !inPublicInfo) {
    return (
      <SafeAreaView style={styles.recoveryScreen}>
        <StatusBar style="dark" />
        <Text style={styles.recoveryTitle}>接続できませんでした</Text>
        <Text style={styles.recoveryBody}>{profileError}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="プロフィール情報の読み込みを再試行"
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          onPress={retryProfileLoad}
        >
          <Text style={styles.retryButtonText}>再試行</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/signup" />
        <Stack.Screen name="auth/profile-setup" />
        <Stack.Screen name="auth/link-account" />
        <Stack.Screen name="battle/[id]" />
        <Stack.Screen name="battle/result/[id]" />
        <Stack.Screen name="record/summary" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="badges" />
        <Stack.Screen name="blocked-users" />
        <Stack.Screen name="activity/[id]" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="legal/terms" />
        <Stack.Screen name="legal/privacy" />
        <Stack.Screen name="help" />
        <Stack.Screen name="invite" />
      </Stack>
      {!!user && authSessionActive && !!profileError && (
        <View style={styles.connectionBanner} accessibilityRole="alert">
          <Text style={styles.connectionBannerText}>{profileError}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="プロフィール情報の読み込みを再試行"
            style={({ pressed }) => [styles.bannerRetry, pressed && styles.bannerRetryPressed]}
            onPress={retryProfileLoad}
          >
            <Text style={styles.bannerRetryText}>再試行</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  recoveryScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.background,
  },
  recoveryTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    lineHeight: Typography.fontSize.xl * Typography.lineHeight.tight,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  recoveryBody: {
    fontSize: Typography.fontSize.md,
    lineHeight: Typography.fontSize.md * Typography.lineHeight.normal,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    maxWidth: 360,
  },
  retryButton: {
    marginTop: Spacing.lg,
    minHeight: 48,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
  },
  retryButtonPressed: {
    backgroundColor: Colors.accentDark,
  },
  retryButtonText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textOnAccent,
  },
  connectionBanner: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: Colors.surface,
  },
  connectionBannerText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.normal,
    color: Colors.textPrimary,
  },
  bannerRetry: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.accent,
  },
  bannerRetryPressed: {
    backgroundColor: Colors.accentDark,
  },
  bannerRetryText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textOnAccent,
  },
});

/**
 * ログイン後に終了済みバトルをチェック → 未閲覧の結果画面へ誘導
 * AsyncStorage で既閲覧バトルIDを管理し二重表示を防ぐ
 */
async function checkFinishedBattles(userId: string, router: ReturnType<typeof useRouter>) {
  try {
    const seenKey = `${SEEN_RESULTS_KEY}:${userId}`;
    const seenRaw = await AsyncStorage.getItem(seenKey);
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
      await AsyncStorage.setItem(seenKey, JSON.stringify(newSeen));

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
