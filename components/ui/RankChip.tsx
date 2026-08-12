import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, BorderRadius, Spacing } from '../../design_tokens';
import { useTranslation } from '../../lib/i18n';

interface Props {
  rank: number;
  /** 総数（例: 12チーム）。指定時「3位 / 12」表示 */
  total?: number;
  /** 総数の単位ラベル（default 「チーム」相当は付けず数字のみ） */
  totalUnit?: string;
}

/**
 * 「3位 / 12チーム」等の順位ピル。
 * 1–3位は rank1–3 の淡色背景、それ以外は surfaceGray。
 */
export function RankChip({ rank, total, totalUnit }: Props) {
  const { t } = useTranslation();
  const { bg, fg } = palette(rank);
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.rank, { color: fg }]}>{t('common.rank', { rank })}</Text>
      {total != null ? (
        <Text style={[styles.total, { color: fg }]}>
          {' '}/ {total}{totalUnit ?? ''}
        </Text>
      ) : null}
    </View>
  );
}

function palette(rank: number): { bg: string; fg: string } {
  switch (rank) {
    case 1:
      return { bg: Colors.rank1 + '26', fg: Colors.rank1Text };
    case 2:
      return { bg: Colors.rank2 + '26', fg: Colors.textPrimary };
    case 3:
      return { bg: Colors.rank3 + '26', fg: Colors.textPrimary };
    default:
      return { bg: Colors.surfaceGray, fg: Colors.textSecondary };
  }
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  rank: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  total: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
