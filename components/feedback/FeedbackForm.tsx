import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../design_tokens';
import { Button } from '../ui/Button';
import { FEEDBACK_MESSAGE_MAX, submitFeedback } from '../../lib/feedback';

const RATING_LABELS = ['不満', 'やや不満', 'ふつう', '満足', 'とても満足'];

// ヘルプページ最上部に埋め込む評価・ご要望フォーム。送信後は同じカード内でお礼表示に切り替わる
export function FeedbackForm() {
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (sending || rating < 1) return;
    setSending(true);
    try {
      await submitFeedback({ rating, message });
      setSubmitted(true);
    } catch (e) {
      Alert.alert('送信できませんでした', e instanceof Error ? e.message : '時間をおいて、もう一度お試しください。');
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.card}>
        <View style={styles.thanksRow}>
          <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
          <Text style={styles.thanksTitle}>ありがとうございました</Text>
        </View>
        <Text style={styles.thanksBody}>いただいた評価・ご要望は今後の改善に役立てます。</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>ZELIOの使い心地はいかがですか？</Text>
      <Text style={styles.lead}>いただいた内容は開発者が直接確認します。</Text>

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
                size={36}
                color={value <= rating ? Colors.warningText : Colors.textTertiary}
              />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.starLabel}>{rating >= 1 ? RATING_LABELS[rating - 1] : 'タップして評価'}</Text>
      </View>

      <TextInput
        style={styles.input}
        value={message}
        onChangeText={setMessage}
        editable={!sending}
        multiline
        maxLength={FEEDBACK_MESSAGE_MAX}
        placeholder="ご意見・ご要望があればお書きください（任意）"
        placeholderTextColor={Colors.textTertiary}
        textAlignVertical="top"
        accessibilityLabel="ご意見・ご要望の入力欄"
      />

      <Text style={styles.note}>
        送信内容に返信はできません。返信が必要な不具合報告は、下のお問い合わせ窓口をご利用ください。パスワードやメールアドレスなどの個人情報は書かないでください。
      </Text>

      <Button
        label={sending ? '送信中…' : '送信する'}
        onPress={() => void handleSubmit()}
        disabled={rating < 1 || sending}
        loading={sending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, gap: Spacing.md,
  },
  heading: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  lead: { fontSize: Typography.fontSize.sm, lineHeight: 20, color: Colors.textSecondary },
  starSection: { alignItems: 'center', gap: Spacing.xs },
  starRow: { flexDirection: 'row', gap: Spacing.md },
  starLabel: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  input: {
    minHeight: 96, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.background,
    fontSize: Typography.fontSize.sm, lineHeight: 22, color: Colors.textPrimary,
  },
  note: { fontSize: Typography.fontSize.xs, lineHeight: 18, color: Colors.textSecondary },
  thanksRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  thanksTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  thanksBody: { fontSize: Typography.fontSize.sm, lineHeight: 20, color: Colors.textSecondary },
});
