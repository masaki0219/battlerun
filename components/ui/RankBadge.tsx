import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../design_tokens';

interface Props {
  rank: number;
  size?: number;
}

/**
 * 順位数字の丸バッジ。1〜3位は淡色背景＋濃色数字、4位以下はグレー。
 * battle 一覧・詳細・結果で共用。
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
      return { bg: Colors.rank1 + '26', fg: '#B7860B' };
    case 2:
      return { bg: Colors.rank2 + '26', fg: '#6B7280' };
    case 3:
      return { bg: Colors.rank3 + '26', fg: '#A05A22' };
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
