import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProgressRing } from '../viz/ProgressRing';
import { Colors, Spacing, BorderRadius } from '../../design_tokens';
import type { WeeklyGoal } from '../../types';
import type { WeeklyBucket } from '../../utils/displayStats';

interface Props {
  goal: WeeklyGoal | null | undefined;
  days: WeeklyBucket[];
  onPress?: () => void;
  compact?: boolean;
}

export function weeklyGoalValues(goal: WeeklyGoal, days: WeeklyBucket[]) {
  const current = goal.type === 'distance'
    ? days.reduce((sum, day) => sum + day.km, 0)
    : days.filter((day) => day.km > 0).length;
  return { current, progress: goal.value > 0 ? current / goal.value : 0 };
}

export function WeeklyGoalProgress({ goal, days, onPress, compact = false }: Props) {
  if (!goal) {
    if (!onPress) return null;
    return (
      <TouchableOpacity style={styles.empty} onPress={onPress} activeOpacity={0.75}>
        <View style={styles.emptyIcon}>
          <Ionicons name="flag-outline" size={18} color={Colors.primaryDark} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>週間目標を設定</Text>
          <Text style={styles.hint}>10km または週3日から気軽に始められます</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
      </TouchableOpacity>
    );
  }

  const { current, progress } = weeklyGoalValues(goal, days);
  const achieved = progress >= 1;
  const unit = goal.type === 'distance' ? 'km' : '日';
  const currentLabel = goal.type === 'distance' ? current.toFixed(1) : String(current);
  const content = (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <ProgressRing progress={progress} size={compact ? 58 : 68} strokeWidth={7}>
        <Text style={styles.percent}>{Math.min(100, Math.round(progress * 100))}%</Text>
      </ProgressRing>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>週間目標</Text>
        <Text style={styles.value}>
          {currentLabel}<Text style={styles.unit}> / {goal.value}{unit}</Text>
        </Text>
        <Text style={[styles.hint, achieved && styles.achieved]}>
          {achieved ? '今週の目標を達成しました！' : goal.type === 'distance' ? '自分のペースで積み重ねよう' : '休息日も大切に続けよう'}
        </Text>
      </View>
      {onPress && <Ionicons name="settings-outline" size={18} color={Colors.textTertiary} />}
    </View>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>{content}</TouchableOpacity>
  ) : content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.primaryBorder, padding: Spacing.md,
  },
  rowCompact: { marginTop: Spacing.md },
  empty: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  emptyIcon: {
    width: 38, height: 38, borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  copy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '700', color: Colors.primaryDark, letterSpacing: 0.5 },
  title: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  value: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, fontVariant: ['tabular-nums'], marginTop: 2 },
  unit: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  hint: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  achieved: { color: Colors.primaryDark, fontWeight: '700' },
  percent: { fontSize: 12, fontWeight: '800', color: Colors.primaryDark, fontVariant: ['tabular-nums'] },
});
