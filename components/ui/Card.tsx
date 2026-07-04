import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, DarkColors, BorderRadius, Shadow, Spacing, ComponentSize } from '../../design_tokens';

type Variant = 'default' | 'outlined' | 'dark';

interface Props {
  children: React.ReactNode;
  padding?: number;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
}

/**
 * カードの統一。
 * - default / outlined: 白面＋角丸 lg＋Shadow.sm＋hairline ボーダー（明るい画面の標準）
 * - dark: DarkColors.surface＋line ボーダー、シャドウ無し（ダーク HUD）
 */
export function Card({ children, padding = ComponentSize.cardPadding, variant = 'default', style }: Props) {
  return (
    <View style={[styles.base, styles[variant], { padding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
  },
  default: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  outlined: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dark: {
    backgroundColor: DarkColors.surface,
    borderWidth: 1,
    borderColor: DarkColors.line,
  },
});
