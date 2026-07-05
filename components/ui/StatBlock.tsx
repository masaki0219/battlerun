import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, DarkColors, TextStyles } from '../../design_tokens';

interface Props {
  /** 上のラベル */
  label: string;
  /** 大数値本体 */
  value: string | number;
  /** 数値のあとの単位（km / 歩 など） */
  unit?: string;
  /** ヒーロー扱い（大きく） */
  hero?: boolean;
  /** ダーク画面用 */
  dark?: boolean;
  /** 数値色（未指定ならテキスト色） */
  valueColor?: string;
  labelColor?: string;
  align?: 'flex-start' | 'center';
  style?: StyleProp<ViewStyle>;
}

/**
 * ラベル（12, textSecondary）＋大数値（tabular-nums）＋単位の縦組み。
 * stats・record HUD・result・profile で共通利用。数値は必ず桁が揃う。
 * ライト画面では等幅ラベルを使わない（MonoLabel はダーク専用）。
 */
export function StatBlock({
  label, value, unit, hero, dark, valueColor, labelColor, align = 'flex-start', style,
}: Props) {
  const textColor = valueColor ?? (dark ? DarkColors.textPrimary : Colors.textPrimary);
  const subColor = dark ? DarkColors.textSecondary : Colors.textSecondary;
  const lblColor = labelColor ?? (dark ? DarkColors.textSecondary : Colors.textSecondary);
  return (
    <View style={[{ alignItems: align }, style]}>
      <Text style={[styles.label, { color: lblColor }]}>{label}</Text>
      <View style={styles.valueRow}>
        <Text
          style={[
            hero ? TextStyles.heroNumber : TextStyles.statNumber,
            { color: textColor },
          ]}
        >
          {value}
        </Text>
        {unit ? (
          <Text style={[styles.unit, hero && styles.unitHero, { color: subColor }]}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  unit: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 3,
  },
  unitHero: {
    fontSize: 18,
    marginLeft: 5,
  },
});
