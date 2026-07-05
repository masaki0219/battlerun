import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, DarkColors, Spacing, TextStyles } from '../../design_tokens';

interface Props {
  /** 左側の見出しテキスト（例: "今週の走り"） */
  label: string;
  labelColor?: string;
  /** 右側アクションのテキスト（例: "すべて見る"） */
  actionLabel?: string;
  onActionPress?: () => void;
  /** ダーク画面用 */
  dark?: boolean;
}

/**
 * ライト画面のセクション見出し。左 TextStyles.sectionTitle、任意で右にアクション。
 * MonoLabel をライト画面で使っていた箇所はすべてこれに置換する。
 */
export function SectionHeader({ label, labelColor, actionLabel, onActionPress, dark }: Props) {
  return (
    <View style={styles.row}>
      <Text
        style={[
          TextStyles.sectionTitle,
          { color: labelColor ?? (dark ? DarkColors.textSecondary : Colors.textSecondary) },
        ]}
      >
        {label}
      </Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onActionPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.action, { color: dark ? DarkColors.primary : Colors.primary }]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  action: {
    fontSize: 13,
    fontWeight: '600',
  },
});
