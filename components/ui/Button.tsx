import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { ActionColors, Colors, Typography, BorderRadius, ComponentSize } from '../../design_tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

// variant の primary は「主操作」の意味。ブランド色名ではなく ActionColors を参照する。
const BG: Record<Variant, string> = {
  primary: ActionColors.background,
  secondary: Colors.surface,
  ghost: 'transparent',
  danger: Colors.error,
  accent: ActionColors.background,
};

const FG: Record<Variant, string> = {
  primary: ActionColors.foreground,
  secondary: Colors.textPrimary,
  ghost: Colors.textSecondary,
  danger: Colors.textOnPrimary,
  accent: ActionColors.foreground,
};

const FONT: Record<Size, number> = {
  sm: Typography.fontSize.sm,
  md: Typography.fontSize.md,
  lg: Typography.fontSize.lg,
};

export function Button({ label, onPress, variant = 'primary', size = 'md', disabled, loading, style }: Props) {
  const height = ComponentSize.buttonHeight[size];
  const unavailable = !!disabled || !!loading;
  const bg = disabled ? Colors.surfaceGray : BG[variant];
  const color = disabled ? Colors.textSecondary : FG[variant];
  const border = variant === 'secondary' ? { borderWidth: 1, borderColor: Colors.border } : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={unavailable}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        { height, backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
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
