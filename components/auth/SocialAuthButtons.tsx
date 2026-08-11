import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppleAuthButton, GoogleAuthButton } from './ProviderButtons';
import {
  isNativeAuthBuild,
  requestAppleCredential,
  requestGoogleCredential,
  signInWithSocialCredential,
  socialAuthErrorMessage,
  type SocialCredentialBundle,
  type SocialProviderId,
} from '../../lib/socialAuth';
import { useAuthStore } from '../../stores/authStore';
import { Colors, Spacing, Typography } from '../../design_tokens';

interface Props {
  mode: 'sign-in' | 'sign-up';
}

export function SocialAuthButtons({ mode }: Props) {
  const setSuggestedProfileName = useAuthStore((state) => state.setSuggestedProfileName);
  const [busyProvider, setBusyProvider] = useState<SocialProviderId | null>(null);

  async function completeSocialSignIn(bundle: SocialCredentialBundle) {
    setSuggestedProfileName(bundle.suggestedName);
    const result = await signInWithSocialCredential(bundle);
    if (result.status === 'link-required') {
      router.push('/auth/link-account');
    }
  }

  async function run(providerId: SocialProviderId) {
    if (busyProvider) return;
    setBusyProvider(providerId);
    try {
      const bundle = providerId === 'apple.com'
        ? await requestAppleCredential()
        : await requestGoogleCredential();
      await completeSocialSignIn(bundle);
    } catch (error) {
      setSuggestedProfileName(null);
      const message = socialAuthErrorMessage(error);
      if (message) Alert.alert('ログインできませんでした', message);
    } finally {
      setBusyProvider(null);
    }
  }

  if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || !isNativeAuthBuild()) {
    return (
      <Text style={styles.nativeBuildNote}>
        Apple／Googleログインは開発ビルドまたはストア版で利用できます。
      </Text>
    );
  }

  const busy = busyProvider !== null;
  return (
    <View style={styles.container}>
      <View style={styles.dividerRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.divider} />
        <Text style={styles.dividerText}>または</Text>
        <View style={styles.divider} />
      </View>
      <AppleAuthButton
        mode={mode}
        onPress={() => { void run('apple.com'); }}
        disabled={busy}
      />
      <GoogleAuthButton
        onPress={() => run('google.com')}
        loading={busyProvider === 'google.com'}
        disabled={busy}
        mode={mode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.xs,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.xs,
  },
  nativeBuildNote: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.xs,
    lineHeight: Typography.fontSize.xs * Typography.lineHeight.normal,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
