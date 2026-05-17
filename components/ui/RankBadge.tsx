import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '../../design_tokens';

interface Props {
  rank: number;
}

export function RankBadge({ rank }: Props) {
  if (rank === 1) {
    return <Text style={[styles.base, { color: Colors.rank1 }]}>👑</Text>;
  }
  const color = rank === 2 ? Colors.rank2 : rank === 3 ? Colors.rank3 : Colors.textSecondary;
  return <Text style={[styles.base, { color }]}>{rank}</Text>;
}

const styles = StyleSheet.create({
  base: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    width: 28,
    textAlign: 'center',
  },
});
