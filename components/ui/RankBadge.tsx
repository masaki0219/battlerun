import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../design_tokens';

interface Props {
  rank: number;
  size?: number;
}

/**
 * 順位数字の丸バッジ。順位表示の統一部品（一覧・詳細・結果で共用）。
 * 1〜3 位は金銀銅の淡背景（rank1Bg/rank2Bg/rank3Bg）＋濃色数字、4 位以下は surfaceGray。
 * ※ rank 色（金・銀・銅）を数字色にすると淡背景上で判読できないため、
 *   数字は textPrimary、地色で金銀銅を表現する。
 */
export function RankBadge({ rank, size = 28 }: Props) {
  const palette = rankPalette(rank);
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bg },
      ]}
    >
      <Text style={[styles.num, { color: palette.fg, fontSize: size * 0.46 }]}>{rank}</Text>
    </View>
  );
}

function rankPalette(rank: number): { bg: string; fg: string } {
  switch (rank) {
    case 1:
      return { bg: Colors.rank1Bg, fg: Colors.textPrimary };
    case 2:
      return { bg: Colors.rank2Bg, fg: Colors.textPrimary };
    case 3:
      return { bg: Colors.rank3Bg, fg: Colors.textPrimary };
    default:
      return { bg: Colors.surfaceGray, fg: Colors.textSecondary };
  }
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: {
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
