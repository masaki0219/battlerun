import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import { formatDateInput, parseLocalDate, addDays } from '../../utils/dateInput';

// ネイティブモジュール未リンクの実行環境（datetimepicker追加前のネイティブビルド等）で
// クラッシュしないよう遅延ロードし、使えない場合は手入力へフォールバックする。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let NativeDateTimePicker: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NativeDateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  NativeDateTimePicker = null;
}

interface Props {
  /** YYYY-MM-DD */
  startAt: string;
  /** YYYY-MM-DD */
  endAt: string;
  onChangeStartAt: (v: string) => void;
  onChangeEndAt: (v: string) => void;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const toInput = formatDateInput;
const fromInput = parseLocalDate;

/** 翌月の同日の前日（例: 7/19 → 8/18）。同日が存在しない月（1/31等）は月末に丸める。 */
function addOneMonth(date: Date): Date {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + 1);
  if (next.getDate() !== day) {
    // setMonth は存在しない日を翌月へ繰り越すため、繰り越したら前月の末日へ戻す
    next.setDate(0);
    return next;
  }
  return addDays(next, -1);
}

/**
 * ネイティブピッカーがマウント時に落ちる環境（datetimepicker追加前のネイティブビルド等）で
 * 手入力へ切り替えるためのエラーバウンダリ。require の成否だけではネイティブ実在を確認できない。
 */
class NativePickerBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function nextMonday(from: Date): Date {
  let delta = (1 - from.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(from, delta);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDisplay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日(${WEEKDAYS[date.getDay()]})`;
}

function diffDaysInclusive(start: Date, end: Date): number {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000) + 1;
}

/**
 * チャレンジ期間の設定UI。
 * 「いつから」（プリセット or カレンダー）と「どのくらい」（長さプリセット or 終了日）で選び、
 * 結果を「7月19日(土)〜8月1日(金)・14日間」の形で常に見せる。
 * 値は親フォームの YYYY-MM-DD 文字列のまま受け渡す。
 */
export function PeriodPicker({ startAt, endAt, onChangeStartAt, onChangeEndAt }: Props) {
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);

  const today = startOfDay(new Date());
  const start = fromInput(startAt);
  const end = fromInput(endAt);
  const duration = start && end ? diffDaysInclusive(start, end) : null;

  const startPresets: { label: string; date: Date }[] = [
    { label: '今日から', date: today },
    { label: '明日から', date: addDays(today, 1) },
    { label: `月曜から`, date: nextMonday(today) },
  ];
  const lengthPresets: { label: string; endFor: (s: Date) => Date }[] = [
    { label: '1週間', endFor: (s) => addDays(s, 6) },
    { label: '2週間', endFor: (s) => addDays(s, 13) },
    { label: '1ヶ月', endFor: (s) => addOneMonth(s) },
  ];

  const startIsPreset = start ? startPresets.some((p) => toInput(p.date) === startAt) : false;
  const activeLength = start && end
    ? lengthPresets.find((p) => toInput(p.endFor(start)) === endAt) ?? null
    : null;

  /** 開始日を動かすとき、設定済みの長さ（日数）を保ったまま終了日も追従させる */
  function applyStart(date: Date) {
    const days = start && end && end >= start ? diffDaysInclusive(start, end) : 14;
    onChangeStartAt(toInput(date));
    onChangeEndAt(toInput(addDays(date, days - 1)));
  }

  function applyLength(preset: (typeof lengthPresets)[number]) {
    const base = start ?? today;
    if (!start) onChangeStartAt(toInput(base));
    onChangeEndAt(toInput(preset.endFor(base)));
  }

  function handlePicked(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setPicker(null);
    if (event.type !== 'set' || !date) return;
    if (picker === 'start') {
      applyStart(startOfDay(date));
    } else {
      onChangeEndAt(toInput(startOfDay(date)));
    }
  }

  const invalid = start && end ? end < start : false;

  return (
    <View>
      <Text style={styles.rowLabel}>いつから</Text>
      <View style={styles.chipRow}>
        {startPresets.map((p) => {
          const active = startAt === toInput(p.date);
          return (
            <TouchableOpacity
              key={p.label}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => { applyStart(p.date); setPicker(null); }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.chip, !startIsPreset && styles.chipActive, picker === 'start' && styles.chipOpen]}
          onPress={() => setPicker(picker === 'start' ? null : 'start')}
          accessibilityLabel="開始日をカレンダーで選ぶ"
        >
          <Text style={[styles.chipText, !startIsPreset && styles.chipTextActive]}>
            {!startIsPreset && start ? formatDisplay(start) : '日付を選ぶ'} ▾
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.rowLabel}>どのくらい</Text>
      <View style={styles.chipRow}>
        {lengthPresets.map((p) => {
          const active = activeLength?.label === p.label;
          return (
            <TouchableOpacity
              key={p.label}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => { applyLength(p); setPicker(null); }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.chip, !activeLength && styles.chipActive, picker === 'end' && styles.chipOpen]}
          onPress={() => setPicker(picker === 'end' ? null : 'end')}
          accessibilityLabel="終了日をカレンダーで選ぶ"
        >
          <Text style={[styles.chipText, !activeLength && styles.chipTextActive]}>
            {!activeLength && end ? `〜${formatDisplay(end)}` : '終了日を選ぶ'} ▾
          </Text>
        </TouchableOpacity>
      </View>

      {picker !== null && (() => {
        const manualInput = (
          <View style={[styles.pickerWrap, styles.fallbackWrap]}>
            <Text style={styles.fallbackLabel}>
              {picker === 'start' ? '開始日' : '終了日'}を入力（YYYY-MM-DD）
            </Text>
            <TextInput
              style={styles.fallbackInput}
              value={picker === 'start' ? startAt : endAt}
              onChangeText={picker === 'start' ? onChangeStartAt : onChangeEndAt}
              placeholder="例: 2026-08-01"
              placeholderTextColor={Colors.textTertiary}
              maxLength={10}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        );
        if (!NativeDateTimePicker) return manualInput;
        return (
          <NativePickerBoundary fallback={manualInput}>
            <View style={styles.pickerWrap}>
              <NativeDateTimePicker
                value={(picker === 'start' ? start : end) ?? today}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                locale="ja"
                accentColor={Colors.primary}
                minimumDate={picker === 'end' ? (start ?? today) : undefined}
                onChange={handlePicked}
              />
            </View>
          </NativePickerBoundary>
        );
      })()}

      {start && end ? (
        <View style={[styles.summary, invalid && styles.summaryInvalid]}>
          <Text style={[styles.summaryMain, invalid && styles.summaryMainInvalid]}>
            {formatDisplay(start)} 〜 {formatDisplay(end)}
          </Text>
          {invalid ? (
            <Text style={styles.summaryError}>終了日が開始日より前になっています</Text>
          ) : (
            <Text style={styles.summarySub}>
              {duration}日間・終了日の23:59までの記録が集計されます
            </Text>
          )}
        </View>
      ) : (
        <View style={[styles.summary, styles.summaryInvalid]}>
          <Text style={styles.summaryError}>開始日と終了日を選んでください</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rowLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceGray,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  chipOpen: { borderStyle: 'dashed' },
  chipText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  chipTextActive: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  pickerWrap: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  summary: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  summaryInvalid: { backgroundColor: Colors.error + '10', borderColor: Colors.error },
  summaryMain: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  summaryMainInvalid: { color: Colors.error },
  summarySub: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  summaryError: { fontSize: Typography.fontSize.sm, color: Colors.error, fontWeight: Typography.fontWeight.medium },
  fallbackWrap: { padding: Spacing.md, gap: Spacing.xs },
  fallbackLabel: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
  fallbackInput: {
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
