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
import { useTranslation } from '../lib/i18n';

export default function InviteScreen() {
  const { t } = useTranslation();
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
      router.replace({ pathname: '/(tabs)/friends' as any, params: { inviteCode: code } });
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
        <Text style={styles.eyebrow}>{t('inviteLanding.eyebrow')}</Text>
        <Text style={styles.title}>{code ? t('inviteLanding.invited') : t('inviteLanding.invalid')}</Text>
        {code ? (
          <>
            <Text style={styles.body}>{t('inviteLanding.signInHint')}</Text>
            <View style={styles.codeBox}><Text style={styles.code}>{code}</Text></View>
            <Button label={t('inviteLanding.signup')} onPress={() => router.push('/auth/signup')} />
            <Button label={t('inviteLanding.login')} variant="secondary" onPress={() => router.push('/auth/login')} />
          </>
        ) : (
          <>
            <Text style={styles.body}>{t('inviteLanding.invalidHint')}</Text>
            <Button
              label={user ? t('inviteLanding.friends') : t('inviteLanding.loginScreen')}
              onPress={() => router.replace(user ? '/(tabs)/friends' : '/auth/login')}
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
    borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceGray,
  },
  code: { fontSize: 24, fontWeight: '900', letterSpacing: 5, color: Colors.primaryDark },
});
