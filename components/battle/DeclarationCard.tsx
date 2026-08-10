import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform,
} from 'react-native';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../../design_tokens';
import { declarationTimeLabel } from '../../utils/declarations';
import { DECLARATION_NOTE_MAX_LENGTH, validateDeclarationNote } from '../../lib/validation/declaration';
import type { RunDeclaration } from '../../types';
import type { ReportTarget } from '../../lib/moderation';

// 旧development buildでも宣言一覧を開けるよう、ネイティブピッカーは遅延ロードする。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let NativeDateTimePicker: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NativeDateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  NativeDateTimePicker = null;
}

interface OwnDeclarationProps {
  declaration?: RunDeclaration;
  battleTitle: string;
  onDeclare: (plannedAt: Date, note: string) => Promise<void>;
  onUpdate: (plannedAt: Date, note: string) => Promise<void>;
  onCancel: () => Promise<void>;
}

type TimeOption = { key: string; label: string; date: Date; disabled: boolean };

function endOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

function nextQuarterHour(now: Date): Date {
  const date = new Date(now);
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil((now.getMinutes() + (now.getSeconds() > 0 ? 1 : 0)) / 15) * 15);
  if (date <= now) date.setMinutes(date.getMinutes() + 15);
  return date;
}

function timeLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function buildTimeOptions(now: Date): TimeOption[] {
  const endOfDay = endOfToday(now);
  const soon = new Date(Math.min(now.getTime() + 5 * 60_000, endOfDay.getTime()));
  const quarter = nextQuarterHour(now);
  const later = new Date(quarter.getTime() + 60 * 60_000);
  return [
    { key: 'soon', label: 'まもなく', date: soon, disabled: soon <= now },
    { key: 'quarter', label: `次の区切り ${timeLabel(quarter)}`, date: quarter, disabled: quarter > endOfDay },
    { key: 'later', label: `1時間後 ${timeLabel(later)}`, date: later, disabled: later > endOfDay },
  ];
}

export function DeclarationCard({
  declaration, battleTitle, onDeclare, onUpdate, onCancel,
}: OwnDeclarationProps) {
  const options = buildTimeOptions(new Date());
  const [selectedKey, setSelectedKey] = useState('soon');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [customDate, setCustomDate] = useState(() => nextQuarterHour(new Date()));
  const [showTimePicker, setShowTimePicker] = useState(false);
  const currentOption: TimeOption | null = declaration && editing
    ? {
        key: 'current',
        label: `現在 ${declarationTimeLabel(declaration.plannedAt, declaration.timezone)}`,
        date: new Date(declaration.plannedAt),
        disabled: false,
      }
    : null;
  const formOptions = currentOption ? [currentOption, ...options] : options;

  function beginEditing() {
    if (!declaration || declaration.status !== 'planned') return;
    setSelectedKey('current');
    setCustomDate(new Date(declaration.plannedAt));
    setNote(declaration.note ?? '');
    setValidationMessage('');
    setEditing(true);
  }

  function confirmCancellation() {
    Alert.alert(
      '今日のラン予定を取り消しますか？',
      '取り消してもチームには通知されません。',
      [
        { text: 'やめる', style: 'cancel' },
        {
          text: '取り消す',
          style: 'destructive',
          onPress: () => {
            setCancelling(true);
            void onCancel().catch(() => {}).finally(() => setCancelling(false));
          },
        },
      ],
    );
  }

  if (declaration && !editing) {
    const done = declaration.status === 'done';
    return (
      <View style={[styles.card, done ? styles.doneCard : styles.plannedCard]}>
        <View style={[styles.stateIcon, done ? styles.doneIcon : styles.plannedIcon]}>
          <Ionicons name={done ? 'checkmark' : 'flag'} size={21} color={done ? Colors.textOnPrimary : Colors.accentDark} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.kicker, done && styles.doneKicker]}>{done ? '宣言達成！' : '今日のラン宣言'}</Text>
          <Text style={styles.currentTitle}>
            {done ? '自分で決めたランを完了しました' : declarationTimeLabel(declaration.plannedAt, declaration.timezone)}
          </Text>
          {declaration.note && <Text style={styles.currentNote}>「{declaration.note}」</Text>}
          {declaration.cheerCount > 0 && (
            <Text style={styles.currentCheers}>🔥 {declaration.cheerCount}人が応援</Text>
          )}
          {!done && <Text style={styles.currentHint}>準備ができたタイミングで始めましょう</Text>}
          {!done && (
            <View style={styles.ownActions}>
              <TouchableOpacity
                style={styles.ownActionButton}
                onPress={beginEditing}
                disabled={cancelling}
                accessibilityRole="button"
                accessibilityLabel="今日のラン宣言を変更"
              >
                <Text style={styles.ownActionText}>変更</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ownActionButton}
                onPress={confirmCancellation}
                disabled={cancelling}
                accessibilityRole="button"
                accessibilityLabel="今日のラン宣言を取り消す"
              >
                {cancelling
                  ? <ActivityIndicator size="small" color={Colors.textSecondary} />
                  : <Text style={styles.cancelActionText}>取り消す</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  const selected = selectedKey === 'custom'
    ? { key: 'custom', label: timeLabel(customDate), date: customDate, disabled: customDate <= new Date() }
    : formOptions.find((item) => item.key === selectedKey) ?? formOptions[0];

  function selectCustomDate(date: Date) {
    setCustomDate(date);
    setSelectedKey('custom');
    setValidationMessage('');
  }

  function handleTimePicked(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (event.type !== 'set' || !date) return;
    const picked = new Date(
      customDate.getFullYear(), customDate.getMonth(), customDate.getDate(),
      date.getHours(), date.getMinutes(), 0, 0,
    );
    if (picked <= new Date() || picked > endOfToday(new Date())) return;
    selectCustomDate(picked);
  }

  function adjustCustomDate(minutes: number) {
    const adjusted = new Date(selected.date.getTime() + minutes * 60_000);
    if (adjusted <= new Date() || adjusted > endOfToday(new Date())) return;
    selectCustomDate(adjusted);
  }

  async function submit() {
    const validation = validateDeclarationNote(note);
    if (!validation.ok) {
      setValidationMessage(validation.reason ?? 'ひとことを確認してください');
      return;
    }
    if (!selected || selected.disabled || selected.date <= new Date()) {
      setValidationMessage('これからの時刻を選んでください。');
      return;
    }
    setSaving(true);
    setValidationMessage('');
    try {
      if (declaration) {
        await onUpdate(selected.date, note);
        setEditing(false);
      } else {
        await onDeclare(selected.date, note);
      }
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
          <Text style={styles.kicker}>今日のラン宣言</Text>
          <Text style={styles.formTitle}>{declaration ? '今日の予定を変更する' : '走り始める時間を自分で決める'}</Text>
          <Text style={styles.formBattle} numberOfLines={1}>{battleTitle}</Text>
        </View>
      </View>

      <View style={styles.timeOptions}>
        {formOptions.map((option) => {
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
        <TouchableOpacity
          style={[styles.timeChip, selectedKey === 'custom' && styles.timeChipActive]}
          onPress={() => {
            if (selectedKey !== 'custom') setCustomDate(nextQuarterHour(new Date()));
            setShowTimePicker((visible) => !visible);
          }}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="宣言する時間を選ぶ"
        >
          <Text style={[styles.timeText, selectedKey === 'custom' && styles.timeTextActive]}>
            {selectedKey === 'custom' ? `選択中 ${timeLabel(customDate)}` : '時間を選ぶ'}
          </Text>
        </TouchableOpacity>
      </View>

      {showTimePicker && NativeDateTimePicker && (
        <View style={styles.pickerWrap}>
          <NativeDateTimePicker
            value={customDate}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            locale="ja"
            is24Hour
            minuteInterval={15}
            minimumDate={new Date(Date.now() + 60_000)}
            maximumDate={endOfToday(new Date())}
            accentColor={Colors.accent}
            onChange={handleTimePicked}
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.pickerDone} onPress={() => setShowTimePicker(false)}>
              <Text style={styles.pickerDoneText}>この時刻にする</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {showTimePicker && !NativeDateTimePicker && (
        <Text style={styles.validation}>このビルドでは時間選択を利用できません。アプリを更新してください。</Text>
      )}

      {(selectedKey === 'custom' || selectedKey === 'current') && (
        <View style={styles.adjustRow}>
          <TouchableOpacity style={styles.adjustChip} onPress={() => adjustCustomDate(-15)} disabled={saving}>
            <Text style={styles.adjustText}>−15分</Text>
          </TouchableOpacity>
          <Text style={styles.selectedTime}>{timeLabel(selected.date)}</Text>
          <TouchableOpacity style={styles.adjustChip} onPress={() => adjustCustomDate(15)} disabled={saving}>
            <Text style={styles.adjustText}>＋15分</Text>
          </TouchableOpacity>
        </View>
      )}

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
            <Text style={styles.declareText}>{declaration ? '変更を保存' : 'この時間に走ると宣言'}</Text>
          </>
        )}
      </TouchableOpacity>
      {declaration && (
        <TouchableOpacity
          style={styles.stopEditingButton}
          onPress={() => setEditing(false)}
          disabled={saving}
          accessibilityRole="button"
        >
          <Text style={styles.stopEditingText}>編集をやめる</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.scopeHint}>公開範囲：このチャレンジの参加者</Text>
      <Text style={styles.reminderHint}>15分以内の予定は通知せず、それより先は1回だけリマインドします。</Text>
    </View>
  );
}

export function DeclarationList({
  declarations, currentUserId, onCheer, onOpenSafety,
}: {
  declarations: RunDeclaration[];
  currentUserId: string;
  onCheer: (declarationId: string) => Promise<void>;
  onOpenSafety: (target: ReportTarget, displayName: string) => void;
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
                  {done ? 'ラン完了' : declarationTimeLabel(item.plannedAt, item.timezone)}
                  {item.note ? `・${item.note}` : ''}
                </Text>
              </View>
              {!own && (
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    style={[styles.cheerButton, item.cheeredByMe && styles.cheeredButton]}
                    onPress={() => void cheer(item.id)}
                    disabled={item.cheeredByMe || sendingId === item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.displayName}さんを応援`}
                  >
                    {sendingId === item.id
                      ? <ActivityIndicator size="small" color={Colors.accentDark} />
                      : (
                        <Text style={styles.cheerText}>
                          {item.cheeredByMe
                            ? `🔥 応援済み${item.cheerCount > 1 ? ` · ${item.cheerCount}人` : ''}`
                            : item.cheerCount > 0
                              ? `🔥 ${item.cheerCount}人が応援`
                              : '応援する'}
                        </Text>
                      )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.safetyButton}
                    onPress={() => onOpenSafety({
                      type: 'declaration',
                      id: item.id,
                      targetUid: item.uid,
                      battleId: item.battleId,
                      contentSnapshot: [item.displayName, item.note].filter(Boolean).join(' / '),
                    }, item.displayName)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.displayName}さんの安全メニュー`}
                  >
                    <Ionicons name="ellipsis-horizontal" size={17} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
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
  currentCheers: { fontSize: 10, color: Colors.accentDark, fontWeight: Typography.fontWeight.bold, marginTop: 4 },
  currentHint: { fontSize: 10, color: Colors.textSecondary, marginTop: 3 },
  ownActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  ownActionButton: { minHeight: 32, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  ownActionText: { fontSize: 10, color: Colors.primaryDark, fontWeight: Typography.fontWeight.bold },
  cancelActionText: { fontSize: 10, color: Colors.error, fontWeight: Typography.fontWeight.bold },
  timeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  timeChip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  timeChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  timeChipDisabled: { backgroundColor: Colors.surfaceGray, borderColor: Colors.borderLight },
  timeText: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
  timeTextActive: { color: Colors.textOnAccent },
  timeTextDisabled: { color: Colors.textTertiary },
  pickerWrap: { marginTop: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.surface, overflow: 'hidden' },
  pickerDone: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: Colors.borderLight },
  pickerDoneText: { fontSize: 12, color: Colors.primaryDark, fontWeight: Typography.fontWeight.bold },
  adjustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.sm },
  adjustChip: { minHeight: 34, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  adjustText: { fontSize: 11, color: Colors.primaryDark, fontWeight: Typography.fontWeight.bold },
  selectedTime: { minWidth: 52, textAlign: 'center', fontSize: 14, color: Colors.textPrimary, fontWeight: Typography.fontWeight.extrabold, fontVariant: ['tabular-nums'] },
  noteWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.md },
  noteInput: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary },
  noteCount: { fontSize: 9, color: Colors.textTertiary, marginRight: Spacing.sm },
  validation: { fontSize: 10, color: Colors.error, marginTop: Spacing.xs },
  declareButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, minHeight: 46, backgroundColor: Colors.accent, borderRadius: BorderRadius.md, marginTop: Spacing.md },
  declareText: { color: Colors.textOnAccent, fontSize: 13, fontWeight: Typography.fontWeight.extrabold },
  stopEditingButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
  stopEditingText: { fontSize: 11, color: Colors.textSecondary, fontWeight: Typography.fontWeight.bold },
  reminderHint: { fontSize: 9, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
  scopeHint: { fontSize: 9, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm, fontWeight: Typography.fontWeight.bold },
  listSectionTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.md },
  listCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, ...Shadow.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  listDivider: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  memberName: { fontSize: 13, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  memberPlan: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  memberDone: { color: Colors.primaryDark, fontWeight: Typography.fontWeight.bold },
  cheerButton: { minWidth: 76, maxWidth: 126, minHeight: 34, paddingHorizontal: 10, borderRadius: BorderRadius.full, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  cheeredButton: { backgroundColor: Colors.surfaceGray },
  cheerText: { fontSize: 10, fontWeight: Typography.fontWeight.bold, color: Colors.accentDark },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  safetyButton: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full },
});
