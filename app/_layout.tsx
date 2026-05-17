import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initAuthListener, useAuthStore } from '../stores/authStore';
import { initRevenueCat } from '../lib/revenuecat';

export default function RootLayout() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const unsubscribe = initAuthListener();
    return unsubscribe;
  }, []);

  // ログイン後に RevenueCat を初期化（EASビルド時のみ有効）
  useEffect(() => {
    if (user) initRevenueCat(user.id);
  }, [user?.id]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/signup" />
        <Stack.Screen name="team/create" />
        <Stack.Screen name="team/join" />
        <Stack.Screen name="team/[id]" />
      </Stack>
    </>
  );
}
