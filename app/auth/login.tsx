import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { authErrorMessage } from '../../lib/authErrors';
import { Button } from '../../components/ui/Button';
import { SocialAuthButtons } from '../../components/auth/SocialAuthButtons';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import { useTranslation } from '../../lib/i18n';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleForgotPassword() {
    if (!email) {
      Alert.alert(t('auth.emailRequired'));
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert(t('auth.resetSentTitle'), t('auth.resetSentBody', { email }));
    } catch {
      Alert.alert(t('common.error'), t('auth.resetFailed'));
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.emailPasswordRequired'));
      return;
    }
    try {
      await signIn(email, password);
    } catch (e: unknown) {
      Alert.alert(t('auth.loginFailed'), authErrorMessage(e));
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.logo}>ZELIO</Text>
            <Text style={styles.tagline}>{t('auth.tagline')}</Text>
          </View>

          <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t('auth.email')}
            placeholderTextColor={Colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            autoComplete="email"
            returnKeyType="next"
          />
          <View>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder={t('auth.password')}
              placeholderTextColor={Colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              textContentType="password"
              autoComplete="current-password"
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            >
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>

          <Button label={t('auth.login')} onPress={handleLogin} loading={isLoading} style={styles.btn} />

            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
              <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
            </TouchableOpacity>

            <SocialAuthButtons mode="sign-in" />

            <Text style={styles.or}>{t('auth.noAccount')}</Text>
            <Button label={t('auth.signUpLink')} onPress={() => router.push('/auth/signup')} variant="ghost" />
            <View style={styles.legalRow}>
              <TouchableOpacity onPress={() => router.push('/legal/terms')} accessibilityRole="link">
                <Text style={styles.legalText}>{t('common.terms')}</Text>
              </TouchableOpacity>
              <Text style={styles.legalDivider}>・</Text>
              <TouchableOpacity onPress={() => router.push('/legal/privacy')} accessibilityRole="link">
                <Text style={styles.legalText}>{t('common.privacy')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  keyboard: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing['2xl'], paddingVertical: Spacing['2xl'] },
  header: { alignItems: 'center', marginBottom: Spacing['2xl'] },
  logo: { fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.extrabold, color: Colors.primary },
  tagline: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm },
  form: { gap: Spacing.md },
  input: {
    height: 48, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg, fontSize: Typography.fontSize.md,
    color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border,
  },
  passwordInput: { paddingRight: 44 },
  passwordToggle: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  btn: { marginTop: Spacing.sm },
  forgotBtn: { alignSelf: 'center' },
  forgotText: { fontSize: Typography.fontSize.sm, color: Colors.primary },
  or: { textAlign: 'center', fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm },
  legalText: { fontSize: Typography.fontSize.xs, color: Colors.primary },
  legalDivider: { marginHorizontal: Spacing.sm, color: Colors.textTertiary },
});
