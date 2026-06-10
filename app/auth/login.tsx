import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../../components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';

export default function LoginScreen() {
  const { signIn, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleForgotPassword() {
    if (!email) {
      Alert.alert('メールアドレスを入力してください');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert('送信しました', `${email} にパスワードリセット用のメールを送りました。`);
    } catch {
      Alert.alert('エラー', '送信に失敗しました。メールアドレスを確認してください。');
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('エラー', 'メールアドレスとパスワードを入力してください');
      return;
    }
    try {
      await signIn(email, password);
    } catch (e: any) {
      Alert.alert('ログイン失敗', e.message ?? '認証に失敗しました');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>🏃 BattleRun</Text>
          <Text style={styles.tagline}>走る距離が、絆になる。</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="メールアドレス"
            placeholderTextColor={Colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="パスワード"
            placeholderTextColor={Colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Button label="ログイン" onPress={handleLogin} loading={isLoading} style={styles.btn} />

          <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>パスワードを忘れた方はこちら</Text>
          </TouchableOpacity>

          <Text style={styles.or}>アカウントをお持ちでない方</Text>
          <Button label="新規登録はこちら" onPress={() => router.push('/auth/signup')} variant="ghost" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing['2xl'] },
  header: { alignItems: 'center', marginBottom: Spacing['4xl'] },
  logo: { fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.extrabold, color: Colors.primary },
  tagline: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm },
  form: { gap: Spacing.md },
  input: {
    height: 48, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg, fontSize: Typography.fontSize.md,
    color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border,
  },
  btn: { marginTop: Spacing.sm },
  forgotBtn: { alignSelf: 'center' },
  forgotText: { fontSize: Typography.fontSize.sm, color: Colors.primary },
  or: { textAlign: 'center', fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm },
});
