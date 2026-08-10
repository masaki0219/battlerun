import React from 'react';
import { Text, TextStyle } from 'react-native';
import { Colors, TextStyles } from '../../design_tokens';
import { isJapaneseLocale } from '../../lib/locale';

interface Props {
  children: string;
  color?: string;
  size?: number;
  style?: TextStyle;
  maxFontSizeMultiplier?: number;
}

/**
 * HUD 等幅ラベル。各画面に散らばっていた `Tac` を統合したもの。
 * ライト/ダーク両対応。字間はサイズに比例させて小サイズでも詰まらないようにする。
 */
export function MonoLabel({
  children, color = Colors.textTertiary, size = 10, style, maxFontSizeMultiplier = 1.6,
}: Props) {
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        TextStyles.tacLabel,
        { fontSize: size, letterSpacing: size * 0.15, color },
        isJapaneseLocale && TextStyles.japaneseDecorLabel,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
