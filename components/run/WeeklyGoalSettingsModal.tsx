import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionColors, Colors, DarkColors, Spacing, BorderRadius, Shadow } from '../../design_tokens';
import type { WeeklyGoal } from '../../types';
import { useTranslation } from '../../lib/i18n';

interface Props {
  visible: boolean;
  currentGoal: WeeklyGoal | null | undefined;
  onSave: (goal: WeeklyGoal) => Promise<void>;
  onClear: () => Promise<void>;
  onClose: () => void;
}

const DISTANCE_OPTIONS = [5, 10, 20, 30] as const;
const DAYS_OPTIONS = [2, 3, 4, 5] as const;

export function WeeklyGoalSettingsModal({ visible, currentGoal, onSave, onClear, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<WeeklyGoal['type']>('distance');
  const [value, setValue] = useState(10);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setType(currentGoal?.type ?? 'distance');
    setValue(currentGoal?.value ?? 10);
  }, [visible, currentGoal?.type, currentGoal?.value]);

  function changeType(next: WeeklyGoal['type']) {
    setType(next);
    setValue(next === 'distance' ? 10 : 3);
  }

  async function run(action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
      onClose();
    } catch {
      // 呼び出し側がユーザー向けエラーを表示する。シートは開いたまま再試行できる。
    } finally {
      setSaving(false);
    }
  }

  const options = type === 'distance' ? DISTANCE_OPTIONS : DAYS_OPTIONS;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('goal.weekly')}</Text>
          <Text style={styles.intro}>{t('goal.intro')}</Text>

          <View style={styles.segment}>
            {(['distance', 'days'] as const).map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.segmentButton, type === item && styles.segmentButtonActive]}
                onPress={() => changeType(item)}
                disabled={saving}
                accessibilityRole="radio"
                accessibilityState={{ checked: type === item, disabled: saving }}
              >
                <Text style={[styles.segmentText, type === item && styles.segmentTextActive]}>
                  {t(item === 'distance' ? 'goal.distance' : 'goal.runningDays')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t(type === 'distance' ? 'goal.weeklyDistance' : 'goal.weeklyDays')}</Text>
          <View style={styles.options}>
            {options.map((option) => {
              const active = value === option;
              const recommended = option === (type === 'distance' ? 10 : 3);
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => setValue(option)}
                  disabled={saving}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active, disabled: saving }}
                >
                  <Text style={[styles.optionValue, active && styles.optionValueActive]}>
                    {option}<Text style={[styles.optionUnit, active && styles.optionValueActive]}>{type === 'distance' ? 'km' : t('profile.dayUnit')}</Text>
                  </Text>
                  {recommended && <Text style={[styles.recommended, active && styles.recommendedActive]}>{t('goal.recommended')}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.restHint}>{t('goal.restHint')}</Text>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => void run(() => onSave({ type, value }))}
            disabled={saving}
            accessibilityRole="button"
          >
            {saving ? <ActivityIndicator color={Colors.textOnPrimary} /> : <Text style={styles.saveText}>{t('goal.save')}</Text>}
          </TouchableOpacity>
          {currentGoal && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => void run(onClear)}
              disabled={saving}
              accessibilityRole="button"
            >
              <Text style={styles.clearText}>{t('goal.clear')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: DarkColors.modalBackdrop },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: BorderRadius.full, backgroundColor: Colors.border, marginBottom: Spacing.lg },
  title: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  intro: { fontSize: 12, lineHeight: 18, color: Colors.textSecondary, marginTop: Spacing.xs },
  segment: { flexDirection: 'row', gap: 4, backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.md, padding: 4, marginTop: Spacing.xl },
  segmentButton: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: BorderRadius.sm },
  segmentButtonActive: { backgroundColor: Colors.surface, ...Shadow.sm },
  segmentText: { fontSize: 12, fontWeight: '700', color: Colors.textTertiary },
  segmentTextActive: { color: Colors.textPrimary },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  options: { flexDirection: 'row', gap: Spacing.sm },
  option: { flex: 1, alignItems: 'center', minHeight: 70, justifyContent: 'center', borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceGray, borderWidth: 1, borderColor: Colors.border },
  optionActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optionValue: { fontSize: 19, fontWeight: '800', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  optionValueActive: { color: Colors.textOnPrimary },
  optionUnit: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  recommended: { fontSize: 8, fontWeight: '700', color: Colors.primaryDark, marginTop: 2 },
  recommendedActive: { color: Colors.textOnPrimary },
  restHint: { fontSize: 10, color: Colors.textSecondary, marginTop: Spacing.md },
  saveButton: { backgroundColor: ActionColors.background, borderRadius: BorderRadius.md, alignItems: 'center', paddingVertical: 14, marginTop: Spacing.xl },
  saveText: { color: ActionColors.foreground, fontSize: 15, fontWeight: '800' },
  clearButton: { alignItems: 'center', paddingVertical: 12, marginBottom: Spacing.xs },
  clearText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
});
