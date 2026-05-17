import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTeam } from '../../hooks/useTeam';
import { Button } from '../../components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';

export default function JoinTeamScreen() {
  const { joinTeam } = useTeam();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    if (code.trim().length !== 6) {
      Alert.alert('エラー', '招待コードは6文字で入力してください');
      return;
    }
    setLoading(true);
    try {
      await joinTeam(code.trim());
      Alert.alert('参加完了', 'チームに参加しました！', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '参加に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.title}>招待コードで参加</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.content}
      >
        <Text style={styles.label}>招待コード</Text>
        <TextInput
          style={styles.input}
          placeholder="例: A3F9KZ"
          placeholderTextColor={Colors.textTertiary}
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />
        <Text style={styles.hint}>チームオーナーから共有された6桁のコードを入力してください</Text>
        <Button
          label="チームに参加する"
          onPress={handleJoin}
          loading={loading}
          style={{ marginTop: Spacing['2xl'] }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  back: { fontSize: Typography.fontSize.md, color: Colors.primary },
  title: {
    fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  content: { flex: 1, padding: Spacing['2xl'] },
  label: {
    fontSize: Typography.fontSize.sm, color: Colors.textSecondary,
    marginBottom: Spacing.sm, fontWeight: Typography.fontWeight.medium,
  },
  input: {
    height: 56, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg, fontSize: Typography.fontSize['2xl'],
    fontWeight: '700', color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
    textAlign: 'center', letterSpacing: 6,
  },
  hint: {
    fontSize: Typography.fontSize.xs, color: Colors.textTertiary,
    marginTop: Spacing.sm, textAlign: 'center',
  },
});
