import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import type { Category } from '../../types';

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
  onChangeRankingType, onChangeStartAt, onChangeEndAt, onSubmit, onCancel,
}: Props) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Card style={styles.card}>
        <Text style={styles.formTitle}>新しい友達チャレンジを作る</Text>

        <Text style={styles.inputLabel}>チャレンジ名 *</Text>
        <TextInput style={styles.input} value={title} onChangeText={onChangeTitle}
          placeholder="例: 春の部活対決" placeholderTextColor={Colors.textTertiary} maxLength={40} />

        <Text style={styles.inputLabel}>説明（任意）</Text>
        <TextInput style={[styles.input, styles.inputMulti]} value={desc} onChangeText={onChangeDesc}
          placeholder="チャレンジの説明..." placeholderTextColor={Colors.textTertiary} multiline maxLength={200} />

        <Text style={styles.inputLabel}>区分リスト *（最低2つ）</Text>
        {categories.map((cat, i) => (
          <View key={i} style={styles.catInputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={cat.label}
              onChangeText={(v) => onChangeCategoryLabel(i, v)}
              placeholder={`区分 ${i + 1}（例: きのこの山）`}
              placeholderTextColor={Colors.textTertiary}
              maxLength={20}
            />
            {categories.length > 2 && (
              <TouchableOpacity style={styles.catRemoveBtn} onPress={() => onRemoveCategory(i)}>
                <Text style={styles.catRemoveText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity style={styles.addCatBtn} onPress={onAddCategory}>
          <Text style={styles.addCatText}>＋ 区分を追加</Text>
        </TouchableOpacity>

        <Text style={styles.inputLabel}>ランキング方式</Text>
        <View style={styles.modeRow}>
          {(['average', 'total'] as const).map((t) => (
            <TouchableOpacity key={t}
              style={[styles.modeBtn, rankingType === t && styles.modeBtnActive]}
              onPress={() => onChangeRankingType(t)}
            >
              <Text style={[styles.modeBtnText, rankingType === t && styles.modeBtnTextActive]}>
                {t === 'average' ? '1人あたり平均' : '合計距離'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.inputLabel}>開始日 *（YYYY-MM-DD）</Text>
        <TextInput style={styles.input} value={startAt} onChangeText={onChangeStartAt}
          placeholder="例: 2026-06-01" placeholderTextColor={Colors.textTertiary} maxLength={10} />

        <Text style={styles.inputLabel}>終了日 *（YYYY-MM-DD）</Text>
        <TextInput style={styles.input} value={endAt} onChangeText={onChangeEndAt}
          placeholder="例: 2026-06-30" placeholderTextColor={Colors.textTertiary} maxLength={10} />

        <View style={styles.formActions}>
          <Button label="キャンセル" onPress={onCancel} variant="ghost" style={styles.formBtn} />
          <Button label="作成する" onPress={onSubmit} loading={creating} style={styles.formBtn} />
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
  input: {
    backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.md, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  inputMulti: { height: 72, textAlignVertical: 'top' },
  catInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  catRemoveBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.error + '15', alignItems: 'center', justifyContent: 'center' },
  catRemoveText: { fontSize: Typography.fontSize.lg, color: Colors.error, fontWeight: Typography.fontWeight.bold },
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
