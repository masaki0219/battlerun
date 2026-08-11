import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  linkWithCredential,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type UserCredential,
} from 'firebase/auth';
import { AppleAuthButton, GoogleAuthButton, providerLabel } from '../../components/auth/ProviderButtons';
import { Button } from '../../components/ui/Button';
import { auth } from '../../lib/firebase';
import { authErrorMessage } from '../../lib/authErrors';
import {
  SocialAuthError,
  clearPendingAccountLink,
  getPendingAccountLink,
  requestAppleCredential,
  requestGoogleCredential,
  socialAuthErrorMessage,
} from '../../lib/socialAuth';
import { useAuthStore } from '../../stores/authStore';
import { BorderRadius, Colors, Spacing, Typography } from '../../design_tokens';

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export default function LinkAccountScreen() {
  const initialPending = getPendingAccountLink();
  const setAccountLinkingInProgress = useAuthStore((state) => state.setAccountLinkingInProgress);
  const setSuggestedProfileName = useAuthStore((state) => state.setSuggestedProfileName);
  const [email, setEmail] = useState(initialPending?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function linkAfterExistingSignIn(signIn: () => Promise<UserCredential>) {
    if (busy) return;
    const pending = getPendingAccountLink();
    if (!pending) {
      Alert.alert('認証の有効期限が切れました', '最初からもう一度ログインしてください。');
      router.replace('/auth/login');
      return;
    }

    setBusy(true);
    setAccountLinkingInProgress(true);
    try {
      const existing = await signIn();
      const pendingEmail = normalizeEmail(pending.email);
      const existingEmail = normalizeEmail(existing.user.email);
      if (pendingEmail && existingEmail && pendingEmail !== existingEmail) {
        throw new SocialAuthError(
          'social/account-email-mismatch',
          '同じメールアドレスのアカウントを選んでください。',
        );
      }
      await linkWithCredential(existing.user, pending.credential);
      clearPendingAccountLink();
      setSuggestedProfileName(null);
      setAccountLinkingInProgress(false);
    } catch (error) {
      if (auth.currentUser) await firebaseSignOut(auth).catch(() => {});
      const message = authErrorMessage(
        error,
        socialAuthErrorMessage(error) ?? '時間をおいて、もう一度お試しください。',
      );
      Alert.alert('アカウントを連携できませんでした', message);
      setAccountLinkingInProgress(false);
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordLink() {
    const pending = getPendingAccountLink();
    const signInEmail = pending?.email ?? email.trim();
    if (!signInEmail || !password) {
      Alert.alert('入力を確認してください', 'メールアドレスとパスワードを入力してください。');
      return;
    }
    await linkAfterExistingSignIn(
      () => signInWithEmailAndPassword(auth, signInEmail, password),
    );
  }

  async function handleSocialLink(providerId: 'apple.com' | 'google.com') {
    if (busy) return;
    setBusy(true);
    try {
      const bundle = providerId === 'apple.com'
        ? await requestAppleCredential()
        : await requestGoogleCredential();
      await linkAfterExistingSignIn(() => signInWithCredential(auth, bundle.credential));
    } catch (error) {
      const message = socialAuthErrorMessage(error);
      if (message) Alert.alert('本人確認できませんでした', message);
      setBusy(false);
    }
  }

  async function handleCancel() {
    clearPendingAccountLink();
    setSuggestedProfileName(null);
    setAccountLinkingInProgress(false);
    if (auth.currentUser) await firebaseSignOut(auth).catch(() => {});
    router.replace('/auth/login');
  }

  if (!initialPending) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.missingContainer}>
          <Text style={styles.title}>認証の有効期限が切れました</Text>
          <Text style={styles.body}>最初からもう一度ログインしてください。</Text>
          <Button label="ログインへ戻る" onPress={() => { void handleCancel(); }} />
        </View>
      </SafeAreaView>
    );
  }

  const pendingLabel = providerLabel(initialPending.providerId);
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.eyebrow}>ACCOUNT LINK</Text>
            <Text style={styles.title}>既存アカウントを確認</Text>
            <Text style={styles.body}>
              このメールアドレスは別のログイン方法で登録済みです。既存の方法で本人確認すると、データを失わずに{pendingLabel}ログインを同じZELIOアカウントへ追加します。
            </Text>
            {initialPending.email ? (
              <View style={styles.emailCard}>
                <Text style={styles.emailLabel}>対象メールアドレス</Text>
                <Text style={styles.emailValue} numberOfLines={2}>{initialPending.email}</Text>
              </View>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="登録済みのメールアドレス"
                placeholderTextColor={Colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
              />
            )}
            <TextInput
              style={styles.input}
              placeholder="既存アカウントのパスワード"
              placeholderTextColor={Colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => { void handlePasswordLink(); }}
            />
            <Button
              label="パスワードで本人確認して連携"
              onPress={() => { void handlePasswordLink(); }}
              loading={busy}
            />

            <View style={styles.dividerRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.divider} />
              <Text style={styles.dividerText}>以前使ったログイン方法</Text>
              <View style={styles.divider} />
            </View>

            {initialPending.providerId !== 'apple.com' && (
              <AppleAuthButton
                mode="continue"
                onPress={() => { void handleSocialLink('apple.com'); }}
                disabled={busy}
              />
            )}
            {initialPending.providerId !== 'google.com' && (
              <GoogleAuthButton
                onPress={() => handleSocialLink('google.com')}
                loading={busy}
                disabled={busy}
                mode="continue"
              />
            )}
            {Platform.OS === 'android' && initialPending.providerId === 'google.com' && (
              <Text style={styles.platformNote}>Appleで作成したアカウントの確認は、iPhone／iPad版から行ってください。</Text>
            )}

            <Text style={styles.consent}>
              「本人確認して連携」を行うことで、2つの認証方法を同じZELIOアカウントへ関連付けることに同意します。
            </Text>
            <Button
              label="連携せずログインへ戻る"
              onPress={() => { void handleCancel(); }}
              variant="ghost"
              disabled={busy}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboard: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  missingContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.lg,
    padding: Spacing['2xl'],
  },
  card: {
    gap: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    letterSpacing: 1.2,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    lineHeight: Typography.fontSize['2xl'] * Typography.lineHeight.tight,
  },
  body: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  emailCard: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceGray,
  },
  emailLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.xs,
  },
  emailValue: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
  },
  input: {
    minHeight: 50,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.xs,
    textAlign: 'center',
  },
  consent: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.xs,
    lineHeight: Typography.fontSize.xs * Typography.lineHeight.normal,
    textAlign: 'center',
  },
  platformNote: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.xs,
    lineHeight: Typography.fontSize.xs * Typography.lineHeight.normal,
    textAlign: 'center',
  },
});
