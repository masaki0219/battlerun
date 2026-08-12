import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { PeriodPicker } from './PeriodPicker';
import { Colors, Typography, Spacing, BorderRadius, TeamColorOptions } from '../../design_tokens';
import type { Category, TeamColorId } from '../../types';
import { useTranslation } from '../../lib/i18n';

interface Props {
  title: string;
  desc: string;
  categories: Category[];
  rankingType: 'average' | 'total';
  startAt: string;
  endAt: string;
  creating: boolean;
  onChangeTitle: (v: string) => void;
  onChangeDesc: (v: string) => void;
  onAddCategory: () => void;
  onRemoveCategory: (index: number) => void;
  onChangeCategoryLabel: (index: number, label: string) => void;
  onChangeCategoryColor: (index: number, colorId: TeamColorId) => void;
  onChangeRankingType: (t: 'average' | 'total') => void;
  onChangeStartAt: (v: string) => void;
  onChangeEndAt: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/** 友達チャレンジ作成フォーム。表示専用の制御コンポーネント（値・更新は親が保持）。 */
export function PrivateBattleCreateForm({
  title, desc, categories, rankingType, startAt, endAt, creating,
  onChangeTitle, onChangeDesc, onAddCategory, onRemoveCategory, onChangeCategoryLabel,
  onChangeCategoryColor,
  onChangeRankingType, onChangeStartAt, onChangeEndAt, onSubmit, onCancel,
}: Props) {
  const { t } = useTranslation();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Card style={styles.card}>
        <Text style={styles.formTitle}>{t('friends.formTitle')}</Text>

        <Text style={styles.inputLabel}>{t('friends.challengeName')}</Text>
        <TextInput style={styles.input} value={title} onChangeText={onChangeTitle}
          placeholder={t('friends.titlePlaceholder')} placeholderTextColor={Colors.textTertiary} maxLength={40} />

        <Text style={styles.inputLabel}>{t('friends.descriptionOptional')}</Text>
        <TextInput style={[styles.input, styles.inputMulti]} value={desc} onChangeText={onChangeDesc}
          placeholder={t('friends.descriptionPlaceholder')} placeholderTextColor={Colors.textTertiary} multiline maxLength={200} />

        <Text style={styles.inputLabel}>{t('friends.teamsRequired')}</Text>
        {/* 記入例に実在ブランド名（禁止語リスト収載語）を使わない */}
        <Text style={styles.helpText}>{t('friends.teamsHelp')}</Text>
        {categories.map((cat, i) => (
          <View key={i} style={styles.catBlock}>
            <View style={styles.catInputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={cat.label}
                onChangeText={(v) => onChangeCategoryLabel(i, v)}
                placeholder={t(i === 0 ? 'friends.teamOnePlaceholder' : i === 1 ? 'friends.teamTwoPlaceholder' : 'friends.teamPlaceholder', { number: i + 1 })}
                placeholderTextColor={Colors.textTertiary}
                maxLength={20}
              />
              {categories.length > 2 && (
                <TouchableOpacity
                  style={styles.catRemoveBtn}
                  onPress={() => onRemoveCategory(i)}
                  accessibilityRole="button"
                  accessibilityLabel={t('friends.deleteTeamA11y', { number: i + 1 })}
                >
                  <Text style={styles.catRemoveText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.colorLabel}>{t('friends.identifyingColor')}</Text>
            <View style={styles.colorRow}>
              {TeamColorOptions.map((option) => {
                const selected = cat.colorId === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.colorButton, selected && styles.colorButtonSelected]}
                    onPress={() => onChangeCategoryColor(i, option.id)}
                    accessibilityRole="radio"
                    accessibilityLabel={t('friends.chooseTeamColorA11y', {
                      color: t(`colors.${option.id}`),
                      number: i + 1,
                    })}
                    accessibilityState={{ selected }}
                  >
                    <View style={[styles.colorSwatch, { backgroundColor: option.color }]}>
                      {selected && <Text style={styles.colorCheck}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.addCatBtn} onPress={onAddCategory}>
          <Text style={styles.addCatText}>{t('friends.addTeam')}</Text>
        </TouchableOpacity>

        <Text style={styles.inputLabel}>{t('friends.rankingMethod')}</Text>
        <View style={styles.modeRow}>
          {(['average', 'total'] as const).map((mode) => (
            <TouchableOpacity key={mode}
              style={[styles.modeBtn, rankingType === mode && styles.modeBtnActive]}
              onPress={() => onChangeRankingType(mode)}
            >
              <Text style={[styles.modeBtnText, rankingType === mode && styles.modeBtnTextActive]}>
                {t(mode === 'average' ? 'friends.averagePerPerson' : 'friends.totalDistance')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.helpText}>
          {rankingType === 'average'
            ? t('friends.averageHelp')
            : t('friends.totalHelp')}
        </Text>

        <Text style={styles.inputLabel}>{t('friends.period')}</Text>
        <PeriodPicker
          startAt={startAt}
          endAt={endAt}
          onChangeStartAt={onChangeStartAt}
          onChangeEndAt={onChangeEndAt}
        />

        <View style={styles.formActions}>
          <Button label={t('common.cancel')} onPress={onCancel} variant="ghost" style={styles.formBtn} />
          <Button label={t('friends.createButton')} onPress={onSubmit} loading={creating} style={styles.formBtn} />
        </View>
      </Card>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // 画面側が左右パディングを持つので Card のデフォルト marginHorizontal は打ち消す
  card: { marginBottom: 0, marginHorizontal: 0 },
  formTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.lg },
  inputLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.md },
  helpText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.md, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  inputMulti: { height: 72, textAlignVertical: 'top' },
  catBlock: { marginTop: Spacing.sm },
  catInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  catRemoveBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.error + '15', alignItems: 'center', justifyContent: 'center' },
  catRemoveText: { fontSize: Typography.fontSize.lg, color: Colors.error, fontWeight: Typography.fontWeight.bold },
  colorLabel: { marginTop: Spacing.xs, fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  colorButton: {
    width: 34, height: 34, borderRadius: BorderRadius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  colorButtonSelected: { borderWidth: 2, borderColor: Colors.textPrimary },
  colorSwatch: {
    width: 26, height: 26, borderRadius: BorderRadius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  colorCheck: { color: Colors.textOnPrimary, fontSize: 14, fontWeight: Typography.fontWeight.bold },
  addCatBtn: { marginTop: Spacing.sm, padding: Spacing.sm, alignItems: 'center' },
  addCatText: { fontSize: Typography.fontSize.sm, color: Colors.primary, fontWeight: Typography.fontWeight.medium },
  modeRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  modeBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceGray, borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  modeBtnText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  modeBtnTextActive: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  formActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xl },
  formBtn: { flex: 1 },
});
