import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing } from '../../design_tokens';
import { MonoLabel } from './MonoLabel';

interface Props {
  /** 左側の等幅ラベル（例: "BATTLERUN / 記録"） */
  label: string;
  labelColor?: string;
  /** 右側アクションのテキスト（例: "すべて見る"） */
  actionLabel?: string;
  onActionPress?: () => void;
  /** ダーク画面用 */
  dark?: boolean;
}

/**
 * セクション見出しの統一。左に MonoLabel、任意で右にテキストアクション。
 */
export function SectionHeader({ label, labelColor, actionLabel, onActionPress, dark }: Props) {
  return (
    <View style={styles.row}>
      <MonoLabel color={labelColor ?? (dark ? Colors.primaryBright : Colors.textTertiary)} size={10}>
        {label}
      </MonoLabel>
      {actionLabel ? (
        <TouchableOpacity onPress={onActionPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.action, { color: dark ? Colors.primaryBright : Colors.primary }]}>
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
