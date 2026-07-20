import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../../design_tokens';
import { declarationTimeLabel } from '../../utils/declarations';
import { DECLARATION_NOTE_MAX_LENGTH, validateDeclarationNote } from '../../lib/validation/declaration';
import type { RunDeclaration } from '../../types';

interface OwnDeclarationProps {
  declaration?: RunDeclaration;
  battleTitle: string;
  onDeclare: (plannedAt: Date, note: string) => Promise<void>;
}

type TimeOption = { key: string; label: string; date: Date; disabled: boolean };

function buildTimeOptions(now: Date): TimeOption[] {
  const fixed = [
    { key: 'morning', label: '朝', hour: 7 },
    { key: 'noon', label: '昼', hour: 12 },
    { key: 'evening', label: '夕方', hour: 18 },
    { key: 'night', label: '夜', hour: 20 },
  ].map((item) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), item.hour, 0, 0, 0);
    return { key: item.key, label: `${item.label} ${item.hour}:00`, date, disabled: date <= now };
  });
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 0);
  const soon = new Date(Math.min(now.getTime() + 5 * 60_000, endOfDay.getTime()));
  return [{ key: 'soon', label: 'まもなく', date: soon, disabled: soon <= now }, ...fixed];
}

export function DeclarationCard({ declaration, battleTitle, onDeclare }: OwnDeclarationProps) {
  const options = buildTimeOptions(new Date());
  const [selectedKey, setSelectedKey] = useState('soon');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');

  if (declaration) {
    const done = declaration.status === 'done';
    return (
      <View style={[styles.card, done ? styles.doneCard : styles.plannedCard]}>
        <View style={[styles.stateIcon, done ? styles.doneIcon : styles.plannedIcon]}>
          <Ionicons name={done ? 'checkmark' : 'flag'} size={21} color={done ? Colors.textOnPrimary : Colors.accentDark} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.kicker, done && styles.doneKicker]}>{done ? '宣言達成！' : '今日の出撃宣言'}</Text>
          <Text style={styles.currentTitle}>
            {done ? '自分で決めたランを完了しました' : declarationTimeLabel(declaration.plannedAt)}
          </Text>
          {declaration.note && <Text style={styles.currentNote}>「{declaration.note}」</Text>}
          {!done && <Text style={styles.currentHint}>準備ができたタイミングで始めましょう</Text>}
        </View>
      </View>
    );
  }

  const selected = options.find((item) => item.key === selectedKey) ?? options[0];

  async function submit() {
    const validation = validateDeclarationNote(note);
    if (!validation.ok) {
      setValidationMessage(validation.reason ?? 'ひとことを確認してください');
      return;
    }
    if (!selected || selected.disabled) return;
    setSaving(true);
    setValidationMessage('');
    try {
      await onDeclare(selected.date, note);
    } catch {
      // 呼び出し側がエラーを表示する。フォームは入力を保ったまま再試行できる。
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.card, styles.formCard]}>
      <View style={styles.formHead}>
        <View style={styles.formIcon}>
          <Ionicons name="flag-outline" size={20} color={Colors.accentDark} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.kicker}>今日の出撃宣言</Text>
          <Text style={styles.formTitle}>走り始める時間を自分で決める</Text>
          <Text style={styles.formBattle} numberOfLines={1}>{battleTitle}</Text>
        </View>
      </View>

      <View style={styles.timeOptions}>
        {options.map((option) => {
          const active = option.key === selectedKey;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.timeChip, active && styles.timeChipActive, option.disabled && styles.timeChipDisabled]}
              onPress={() => setSelectedKey(option.key)}
              disabled={option.disabled || saving}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: option.disabled }}
            >
              <Text style={[styles.timeText, active && styles.timeTextActive, option.disabled && styles.timeTextDisabled]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.noteWrap}>
        <TextInput
          value={note}
          onChangeText={(value) => { setNote(value); setValidationMessage(''); }}
          placeholder="ひとこと（任意）"
          placeholderTextColor={Colors.textTertiary}
          maxLength={DECLARATION_NOTE_MAX_LENGTH}
          style={styles.noteInput}
          editable={!saving}
        />
        <Text style={styles.noteCount}>{note.length}/{DECLARATION_NOTE_MAX_LENGTH}</Text>
      </View>
      {!!validationMessage && <Text style={styles.validation}>{validationMessage}</Text>}

      <TouchableOpacity style={styles.declareButton} onPress={() => void submit()} disabled={saving || selected?.disabled}>
        {saving ? (
          <ActivityIndicator color={Colors.textOnAccent} />
        ) : (
          <>
            <Ionicons name="flag" size={17} color={Colors.textOnAccent} />
            <Text style={styles.declareText}>この時間に走ると宣言</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.reminderHint}>リマインドは1回だけ。あとから急かす通知はありません。</Text>
    </View>
  );
}

export function DeclarationList({
  declarations, currentUserId, onCheer,
}: {
  declarations: RunDeclaration[];
  currentUserId: string;
  onCheer: (declarationId: string) => Promise<void>;
}) {
  const [sendingId, setSendingId] = useState<string | null>(null);
  if (declarations.length === 0) return null;

  async function cheer(id: string) {
    setSendingId(id);
    try {
      await onCheer(id);
    } finally {
      setSendingId(null);
    }
  }

  return (
    <View>
      <Text style={styles.listSectionTitle}>今日の宣言</Text>
      <View style={styles.listCard}>
        {declarations.map((item, index) => {
          const own = item.uid === currentUserId;
          const done = item.status === 'done';
          return (
            <View key={item.id} style={[styles.listRow, index > 0 && styles.listDivider]}>
              <Avatar name={item.displayName} emoji={item.avatarEmoji} size="sm" />
              <View style={styles.copy}>
                <Text style={styles.memberName} numberOfLines={1}>{own ? 'あなた' : item.displayName}</Text>
                <Text style={[styles.memberPlan, done && styles.memberDone]}>
                  {done ? 'ラン完了' : declarationTimeLabel(item.plannedAt)}
                  {item.note ? `・${item.note}` : ''}
                </Text>
              </View>
              {!own && (
                <TouchableOpacity
                  style={[styles.cheerButton, item.cheeredByMe && styles.cheeredButton]}
                  onPress={() => void cheer(item.id)}
                  disabled={item.cheeredByMe || sendingId === item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.displayName}さんを応援`}
                >
                  {sendingId === item.id
                    ? <ActivityIndicator size="small" color={Colors.accentDark} />
                    : <Text style={styles.cheerText}>{item.cheeredByMe ? '応援済み' : '🔥 応援'}</Text>}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, padding: Spacing.lg, borderWidth: 1, ...Shadow.sm },
  formCard: { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
  plannedCard: { backgroundColor: Colors.accentLight, borderColor: Colors.accent, flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  doneCard: { backgroundColor: Colors.primaryLight, borderColor: Colors.primaryBorder, flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  formHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  formIcon: { width: 42, height: 42, borderRadius: BorderRadius.full, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  stateIcon: { width: 44, height: 44, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center' },
  plannedIcon: { backgroundColor: Colors.surface },
  doneIcon: { backgroundColor: Colors.primary },
  copy: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 10, fontWeight: Typography.fontWeight.bold, color: Colors.accentDark, letterSpacing: 0.7 },
  doneKicker: { color: Colors.primaryDark },
  formTitle: { fontSize: 15, fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary, marginTop: 2 },
  formBattle: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  currentTitle: { fontSize: 16, fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary, marginTop: 2 },
  currentNote: { fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  currentHint: { fontSize: 10, color: Colors.textTertiary, marginTop: 3 },
  timeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  timeChip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  timeChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  timeChipDisabled: { backgroundColor: Colors.surfaceGray, borderColor: Colors.borderLight },
  timeText: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
  timeTextActive: { color: Colors.textOnAccent },
  timeTextDisabled: { color: Colors.textTertiary },
  noteWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.md },
  noteInput: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary },
  noteCount: { fontSize: 9, color: Colors.textTertiary, marginRight: Spacing.sm },
  validation: { fontSize: 10, color: Colors.error, marginTop: Spacing.xs },
  declareButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, minHeight: 46, backgroundColor: Colors.accent, borderRadius: BorderRadius.md, marginTop: Spacing.md },
  declareText: { color: Colors.textOnAccent, fontSize: 13, fontWeight: Typography.fontWeight.extrabold },
  reminderHint: { fontSize: 9, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
  listSectionTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.md },
  listCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, ...Shadow.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  listDivider: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  memberName: { fontSize: 13, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  memberPlan: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  memberDone: { color: Colors.primaryDark, fontWeight: Typography.fontWeight.bold },
  cheerButton: { minWidth: 76, minHeight: 34, paddingHorizontal: 10, borderRadius: BorderRadius.full, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  cheeredButton: { backgroundColor: Colors.surfaceGray },
  cheerText: { fontSize: 10, fontWeight: Typography.fontWeight.bold, color: Colors.accentDark },
});
