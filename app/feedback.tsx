import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../design_tokens';
import { Button } from '../components/ui/Button';
import { FEEDBACK_MESSAGE_MAX, submitFeedback } from '../lib/feedback';

const RATING_LABELS = ['不満', 'やや不満', 'ふつう', '満足', 'とても満足'];

export default function FeedbackScreen() {
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (sending || rating < 1) return;
    setSending(true);
    try {
      await submitFeedback({ rating, message });
      Alert.alert('ありがとうございました', 'いただいた評価・ご要望は今後の改善に役立てます。', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('送信できませんでした', e instanceof Error ? e.message : '時間をおいて、もう一度お試しください。');
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="戻る">
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>評価・ご要望</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>ZELIOの使い心地はいかがですか？{'\n'}いただいた内容は開発者が直接確認します。</Text>

          <View style={styles.starSection}>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setRating(value)}
                  disabled={sending}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={`星${value}（${RATING_LABELS[value - 1]}）`}
                  accessibilityState={{ selected: rating === value }}
                >
                  <Ionicons
                    name={value <= rating ? 'star' : 'star-outline'}
                    size={40}
                    color={value <= rating ? Colors.warning : Colors.textTertiary}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.starLabel}>{rating >= 1 ? RATING_LABELS[rating - 1] : 'タップして評価'}</Text>
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>ご意見・ご要望（任意）</Text>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              editable={!sending}
              multiline
              maxLength={FEEDBACK_MESSAGE_MAX}
              placeholder="改善してほしい点、欲しい機能などを自由にお書きください"
              placeholderTextColor={Colors.textTertiary}
              textAlignVertical="top"
              accessibilityLabel="ご意見・ご要望の入力欄"
            />
            <Text style={styles.charCount}>{message.length} / {FEEDBACK_MESSAGE_MAX}</Text>
          </View>

          <Text style={styles.note}>
            送信内容に返信はできません。返信が必要な不具合報告はヘルプのお問い合わせ窓口をご利用ください。パスワードやメールアドレスなどの個人情報は書かないでください。
          </Text>

          <Button
            label={sending ? '送信中…' : '送信する'}
            onPress={() => void handleSubmit()}
            disabled={rating < 1 || sending}
            loading={sending}
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  content: { padding: Spacing.xl, paddingBottom: Spacing['4xl'], gap: Spacing.xl },
  lead: { fontSize: Typography.fontSize.sm, lineHeight: 22, color: Colors.textSecondary },
  starSection: { alignItems: 'center', gap: Spacing.sm },
  starRow: { flexDirection: 'row', gap: Spacing.md },
  starLabel: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  inputSection: { gap: Spacing.xs },
  inputLabel: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  input: {
    minHeight: 140, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    fontSize: Typography.fontSize.sm, lineHeight: 22, color: Colors.textPrimary,
  },
  charCount: { alignSelf: 'flex-end', fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
  note: { fontSize: Typography.fontSize.xs, lineHeight: 18, color: Colors.textTertiary },
});
