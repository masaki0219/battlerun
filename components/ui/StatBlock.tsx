import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, TextStyles } from '../../design_tokens';
import { MonoLabel } from './MonoLabel';

interface Props {
  /** 上の等幅ラベル */
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
 * ラベル＋大数値＋単位の縦組み。record HUD・stats・result で共通利用。
 * 数値は必ず tabular-nums で桁を揃える。
 */
export function StatBlock({
  label, value, unit, hero, dark, valueColor, labelColor, align = 'flex-start', style,
}: Props) {
  const textColor = valueColor ?? (dark ? Colors.textOnPrimary : Colors.textPrimary);
  const subColor = dark ? Colors.textOnPrimary : Colors.textSecondary;
  return (
    <View style={[{ alignItems: align }, style]}>
      <MonoLabel color={labelColor ?? (dark ? Colors.primaryBright : Colors.textTertiary)} size={9}>
        {label}
      </MonoLabel>
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
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  unit: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 3,
  },
  unitHero: {
    fontSize: 18,
    marginLeft: 5,
  },
});
