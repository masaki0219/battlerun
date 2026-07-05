import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../../design_tokens';

interface Props {
  days: number;
}

/**
 * 連続記録日数のピル型チップ。
 * days > 0: accentLight 背景＋accent 文字「🔥 ◯日連続」
 * days === 0: surfaceGray 背景＋行動喚起「🔥 今日から始めよう」
 * 絵文字使用が許可されている数少ない箇所。
 */
export function StreakChip({ days }: Props) {
  const active = days > 0;
  return (
    <View style={[styles.chip, { backgroundColor: active ? Colors.accentLight : Colors.surfaceGray }]}>
      <Text style={styles.fire}>🔥</Text>
      <Text style={[styles.label, { color: active ? Colors.accent : Colors.textSecondary }]}>
        {active ? `${days}日連続` : '今日から始めよう'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  fire: {
    fontSize: 13,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
