import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius, ComponentSize } from '../../design_tokens';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  dark?: boolean;
}

/**
 * 空表示の統一。アイコン＋タイトル＋ヒント＋任意 CTA。
 * 空画面を「次の行動への招待」にする。
 */
export function EmptyState({ icon, title, hint, ctaLabel, onCtaPress, dark }: Props) {
  const titleColor = dark ? Colors.textOnPrimary : Colors.textPrimary;
  const hintColor = dark ? Colors.textTertiary : Colors.textSecondary;
  const iconBg = dark ? Colors.surfaceGray + '22' : Colors.surfaceGray;
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={28} color={dark ? Colors.textTertiary : Colors.textTertiary} />
      </View>
      <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
      {hint ? <Text style={[styles.hint, { color: hintColor }]}>{hint}</Text> : null}
      {ctaLabel && onCtaPress ? (
        <TouchableOpacity style={styles.cta} onPress={onCtaPress} activeOpacity={0.85}>
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['4xl'],
    paddingHorizontal: Spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    textAlign: 'center',
  },
  hint: {
    fontSize: Typography.fontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.normal,
  },
  cta: {
    marginTop: Spacing.xl,
    height: ComponentSize.buttonHeight.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    color: Colors.textOnAccent,
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
  },
});
