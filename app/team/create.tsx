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

export default function CreateTeamScreen() {
  const { createTeam } = useTeam();
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!teamName.trim()) {
      Alert.alert('エラー', 'チーム名を入力してください');
      return;
    }
    setLoading(true);
    try {
      await createTeam(teamName.trim());
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('エラー', e.message);
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
        <Text style={styles.title}>チームを作る</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.content}>
        <Text style={styles.label}>チーム名</Text>
        <TextInput
          style={styles.input}
          placeholder="例: サンライズランナーズ"
          placeholderTextColor={Colors.textTertiary}
          value={teamName}
          onChangeText={setTeamName}
          maxLength={30}
        />
        <Text style={styles.hint}>作成後、招待コードで仲間を招待できます</Text>
        <Button label="チームを作成する" onPress={handleCreate} loading={loading} style={{ marginTop: Spacing['2xl'] }} />
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
  title: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
  content: { flex: 1, padding: Spacing['2xl'] },
  label: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm, fontWeight: Typography.fontWeight.medium },
  input: {
    height: 48, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg, fontSize: Typography.fontSize.md, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  hint: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: Spacing.sm },
});
