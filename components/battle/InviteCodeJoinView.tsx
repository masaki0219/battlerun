import React from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Colors, Typography, Spacing, BorderRadius, teamColorMap } from '../../design_tokens';
import type { Battle } from '../../types';
import { useTranslation } from '../../lib/i18n';

interface Props {
  /** join_code=コード入力 / join_select=チーム選択 */
  view: 'join_code' | 'join_select';
  inviteCode: string;
  onChangeInviteCode: (v: string) => void;
  searching: boolean;
  onSearch: () => void;
  /** コード入力のキャンセル（一覧へ戻る） */
  onCancelCode: () => void;
  foundBattle: Battle | null;
  joining: boolean;
  onJoinCategory: (categoryId: string) => void;
  /** チーム選択からコード入力へ戻る */
  onBackToCode: () => void;
}

/** 招待コードの検索・チーム選択で参加するビュー。表示専用。 */
export function InviteCodeJoinView({
  view, inviteCode, onChangeInviteCode, searching, onSearch, onCancelCode,
  foundBattle, joining, onJoinCategory, onBackToCode,
}: Props) {
  const { t } = useTranslation();
  if (view === 'join_code') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Card style={styles.card}>
          <Text style={styles.formTitle}>{t('friends.joinWithInvite')}</Text>
          <Text style={styles.inputLabel}>{t('friends.sixDigitCode')}</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={inviteCode}
            onChangeText={(v) => onChangeInviteCode(v.toUpperCase())}
            placeholder={t('friends.codePlaceholder')}
            placeholderTextColor={Colors.textTertiary}
            maxLength={6}
            autoCapitalize="characters"
          />
          <View style={styles.formActions}>
            <Button label={t('common.cancel')} onPress={onCancelCode} variant="ghost" style={styles.formBtn} />
            <Button label={t('friends.search')} onPress={onSearch} loading={searching} style={styles.formBtn} />
          </View>
        </Card>
      </KeyboardAvoidingView>
    );
  }

  if (!foundBattle) return null;
  const colorsByCategory = teamColorMap(foundBattle.categories);
  return (
    <Card style={styles.card}>
      <Text style={styles.formTitle}>{foundBattle.title}</Text>
      {foundBattle.description ? (
        <Text style={styles.battleMeta}>{foundBattle.description}</Text>
      ) : null}

      <Text style={[styles.inputLabel, { marginBottom: Spacing.sm }]}>{t('friends.chooseTeamAndJoin')}</Text>
      <View style={styles.catSelectList}>
        {foundBattle.categories.map((cat) => (
          <Button
            key={cat.id}
            label={cat.label}
            onPress={() => onJoinCategory(cat.id)}
            loading={joining}
            variant="secondary"
            style={[styles.catSelectBtn, { borderLeftColor: colorsByCategory[cat.id] }]}
          />
        ))}
      </View>
      <Button label={t('common.back')} onPress={onBackToCode} variant="ghost" style={{ marginTop: Spacing.md }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  // 画面側が左右パディングを持つので Card のデフォルト marginHorizontal は打ち消す
  card: { marginBottom: 0, marginHorizontal: 0 },
  formTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.lg },
  inputLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.md },
  input: {
    backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.md, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  codeInput: { fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.bold, textAlign: 'center', letterSpacing: 4 },
  formActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xl },
  formBtn: { flex: 1 },
  battleMeta: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  catSelectList: { gap: Spacing.sm },
  catSelectBtn: { marginTop: 0, borderLeftWidth: 6 },
});
