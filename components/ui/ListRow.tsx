import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, DarkColors, Spacing, ComponentSize, BorderRadius } from '../../design_tokens';
import { Avatar } from './Avatar';

interface Props {
  /** 左アイコン（Ionicons）。emoji を渡す場合は不要 */
  icon?: keyof typeof Ionicons.glyphMap;
  /** アイコンの代わりに絵文字 */
  emoji?: string;
  /** 人物行では共通Avatarを使う。 */
  avatarName?: string;
  avatarEmoji?: string;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  /** 右側に表示する値テキスト（chevron の代替） */
  value?: string;
  /** 右にカスタム要素 */
  right?: React.ReactNode;
  /** onPress があり right/value 未指定なら chevron を出す */
  showChevron?: boolean;
  onPress?: () => void;
  dark?: boolean;
  /** 未読などの強調（primaryLight 背景） */
  highlight?: boolean;
  /** error 色のタイトル（削除など） */
  danger?: boolean;
  titleColor?: string;
}

/**
 * リスト行の統一。高さ listItemHeight(60)、左アイコン（丸36・淡背景）・
 * タイトル/サブ・右アクセサリ（chevron or 値）。履歴・設定・通知の全リスト行に使う。
 */
export function ListRow({
  icon, emoji, avatarName, avatarEmoji, iconColor, iconBg, title, subtitle, value, right,
  showChevron = true, onPress, dark, highlight, danger, titleColor,
}: Props) {
  const txtPrimary = danger ? Colors.error : titleColor ?? (dark ? DarkColors.textPrimary : Colors.textPrimary);
  const txtSub = dark ? DarkColors.textSecondary : Colors.textSecondary;
  const defaultIconColor = dark ? DarkColors.primary : Colors.primary;
  const defaultIconBg = dark ? DarkColors.surfaceAlt : Colors.surfaceGray;
  const chevronColor = dark ? DarkColors.textTertiary : Colors.textTertiary;

  const body = (
    <View style={[styles.row, highlight && styles.highlight]}>
      {avatarName ? (
        <Avatar name={avatarName} emoji={avatarEmoji} size="sm" />
      ) : icon || emoji ? (
        <View style={[styles.iconCircle, { backgroundColor: iconBg ?? defaultIconBg }]}>
          {emoji ? (
            <Text style={styles.emoji}>{emoji}</Text>
          ) : (
            <Ionicons name={icon!} size={18} color={iconColor ?? defaultIconColor} />
          )}
        </View>
      ) : null}

      <View style={styles.textCol}>
        <Text style={[styles.title, { color: txtPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: txtSub }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ? (
        right
      ) : value ? (
        <Text style={[styles.value, { color: txtSub }]} numberOfLines={1}>
          {value}
        </Text>
      ) : onPress && showChevron ? (
        <Ionicons name="chevron-forward" size={18} color={chevronColor} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6} accessibilityRole="button">
        {body}
      </TouchableOpacity>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ComponentSize.listItemHeight,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  highlight: {
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 18,
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
