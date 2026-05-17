import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../../components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';

export default function SignupScreen() {
  const { signUp, isLoading } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSignup() {
    if (!name || !email || !password) {
      Alert.alert('エラー', 'すべての項目を入力してください');
      return;
    }
    if (password.length < 6) {
      Alert.alert('エラー', 'パスワードは6文字以上で設定してください');
      return;
    }
    try {
      await signUp(email, password, name);
      // 画面遷移は onAuthStateChanged → user セット → TabLayout に任せる
    } catch (e: any) {
      Alert.alert('登録失敗', e.message ?? '登録に失敗しました');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>🏃 BattleRun</Text>
          <Text style={styles.tagline}>新規アカウント作成</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="ニックネーム"
            placeholderTextColor={Colors.textTertiary}
            value={name}
            onChangeText={setName}
          />
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
            placeholder="パスワード（6文字以上）"
            placeholderTextColor={Colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Button label="アカウントを作成" onPress={handleSignup} loading={isLoading} style={styles.btn} />
          <Button label="ログインに戻る" onPress={() => router.back()} variant="ghost" />
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
    height: 48,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btn: { marginTop: Spacing.sm },
});
