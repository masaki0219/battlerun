import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, BorderRadius, ComponentSize } from '../../design_tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

// このアプリの主 CTA はオレンジ（accent）。primary=accent に統一
const BG: Record<Variant, string> = {
  primary: Colors.accent,
  secondary: Colors.surface,
  ghost: 'transparent',
  danger: Colors.error,
  accent: Colors.accent,
};

const FG: Record<Variant, string> = {
  primary: Colors.textOnAccent,
  secondary: Colors.textPrimary,
  ghost: Colors.textSecondary,
  danger: Colors.textOnPrimary,
  accent: Colors.textOnAccent,
};

const FONT: Record<Size, number> = {
  sm: Typography.fontSize.sm,
  md: Typography.fontSize.md,
  lg: Typography.fontSize.lg,
};

export function Button({ label, onPress, variant = 'primary', size = 'md', disabled, loading, style }: Props) {
  const height = ComponentSize.buttonHeight[size];
  const bg = BG[variant];
  const color = FG[variant];
  const border = variant === 'secondary' ? { borderWidth: 1, borderColor: Colors.border } : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        { height, backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        border,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.label, { color, fontSize: FONT[size] }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: {
    fontWeight: Typography.fontWeight.semibold,
  },
});
