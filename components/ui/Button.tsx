import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, BorderRadius, ComponentSize } from '../../design_tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
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

export function Button({ label, onPress, variant = 'primary', size = 'md', disabled, loading, style }: Props) {
  const height = ComponentSize.buttonHeight[size];
  const bg = {
    primary: Colors.primary,
    secondary: Colors.primaryLight,
    ghost: 'transparent',
    danger: Colors.error,
  }[variant];
  const color = {
    primary: Colors.textOnPrimary,
    secondary: Colors.primary,
    ghost: Colors.textSecondary,
    danger: Colors.textOnPrimary,
  }[variant];
  const border = variant === 'ghost' ? { borderWidth: 1, borderColor: Colors.border } : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.base, { height, backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, border, style]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.label, { color, fontSize: size === 'sm' ? Typography.fontSize.sm : Typography.fontSize.md }]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
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
