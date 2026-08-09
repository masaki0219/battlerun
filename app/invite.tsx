import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/ui/Button';
import { useAuthStore } from '../stores/authStore';
import { PENDING_INVITE_CODE_KEY, normalizeInviteCode } from '../lib/invite';
import { BorderRadius, Colors, Spacing, Typography } from '../design_tokens';

export default function InviteScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { user, isLoading } = useAuthStore();
  const code = normalizeInviteCode(params.code);
  const [stored, setStored] = useState(false);

  useEffect(() => {
    if (!code) {
      setStored(true);
      return;
    }
    let cancelled = false;
    void AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, code).finally(() => {
      if (!cancelled) setStored(true);
    });
    return () => { cancelled = true; };
  }, [code]);

  useEffect(() => {
    if (!isLoading && user && stored && code) {
      router.replace({ pathname: '/(tabs)/battle' as any, params: { inviteCode: code } });
    }
  }, [isLoading, user?.id, stored, code]);

  if (isLoading || (code && !stored) || (user && !!code)) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="people-outline" size={30} color={Colors.primaryDark} />
        </View>
        <Text style={styles.eyebrow}>ZELIO 招待</Text>
        <Text style={styles.title}>{code ? 'チャレンジに招待されました' : '招待リンクを確認できません'}</Text>
        {code ? (
          <>
            <Text style={styles.body}>アカウントを作成またはログインすると、招待コードが自動入力されます。</Text>
            <View style={styles.codeBox}><Text style={styles.code}>{code}</Text></View>
            <Button label="はじめる（新規登録）" onPress={() => router.push('/auth/signup')} />
            <Button label="アカウントをお持ちの方はログイン" variant="secondary" onPress={() => router.push('/auth/login')} />
          </>
        ) : (
          <>
            <Text style={styles.body}>リンクが途中で切れている可能性があります。送信者から6桁の招待コードを受け取ってください。</Text>
            <Button
              label={user ? 'チャレンジ一覧へ' : 'ログイン画面へ'}
              onPress={() => router.replace(user ? '/(tabs)/battle' : '/auth/login')}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', padding: Spacing.xl,
  },
  card: {
    width: '100%', maxWidth: 420, gap: Spacing.md,
    padding: Spacing.xl, borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  icon: {
    width: 58, height: 58, borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  eyebrow: { fontSize: Typography.fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: Colors.primary },
  title: { fontSize: Typography.fontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  body: { fontSize: Typography.fontSize.sm, lineHeight: 21, color: Colors.textSecondary },
  codeBox: {
    alignSelf: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceAlt,
  },
  code: { fontSize: 24, fontWeight: '900', letterSpacing: 5, color: Colors.primaryDark },
});
