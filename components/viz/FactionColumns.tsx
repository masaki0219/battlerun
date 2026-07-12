import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { DarkColors, Typography, Spacing, BorderRadius, Animation } from '../../design_tokens';

export interface FactionColumn {
  id: string;
  label: string;
  km: number;
  /** 1始まりの順位 */
  rank: number | null;
  isMine: boolean;
}

interface Props {
  /** 順位昇順（1位が先頭）で渡す */
  factions: FactionColumn[];
  /** バー領域の高さ。default 120 */
  height?: number;
  /** 数値の単位 */
  valueSuffix?: string;
}

/** バーの最低の高さ（比率）。全陣営が僅差でも順位差が読めるようにする */
const FLOOR = 0.32;

/**
 * 全陣営の距離を縦棒で並べるダーク面のチャート（ホームのヒーロー用）。
 *
 * ★スケールに注意: 高さは 0 起点ではなく「最下位〜首位」の幅で正規化する（最下位でも FLOOR は残す）。
 * 総距離は陣営間で僅差になりやすく、0 起点だと全部同じ高さに潰れて順位が読めないため。
 * 誤読を避けるために各バーの上に実数値（km）を必ず表示する。
 */
export function FactionColumns({ factions, height = 120, valueSuffix = 'km' }: Props) {
  const max = Math.max(...factions.map((f) => f.km), 0);
  const min = factions.length > 0 ? Math.min(...factions.map((f) => f.km)) : 0;
  const span = max - min;

  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, {
      toValue: 1,
      duration: Animation.countUpDuration,
      useNativeDriver: false,
    }).start();
  }, [max, factions.length]);

  return (
    <View>
      <View style={[styles.barsRow, { height }]}>
        {factions.map((f) => {
          const ratio = max <= 0
            ? FLOOR
            : span > 0
            ? FLOOR + (1 - FLOOR) * ((f.km - min) / span)
            : 1;
          const barHeight = grow.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.max(2, ratio * height)],
          });
          return (
            <View key={f.id} style={styles.col}>
              <Text
                style={[styles.km, f.isMine && styles.kmMine]}
                numberOfLines={1}
              >
                {f.km.toFixed(1)} {valueSuffix}
              </Text>
              <Animated.View
                style={[styles.bar, f.isMine ? styles.barMine : styles.barOther, { height: barHeight }]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        {factions.map((f) => (
          <View key={f.id} style={styles.legendCol}>
            <View style={[styles.mark, f.isMine ? styles.markMine : styles.markOther]}>
              <Text style={[styles.markText, f.isMine && styles.markTextMine]}>
                {f.label.slice(0, 1)}
              </Text>
            </View>
            <Text style={[styles.legendLabel, f.isMine && styles.legendLabelMine]} numberOfLines={1}>
              {f.label}
            </Text>
            <Text style={styles.legendRank}>{f.rank == null ? '順位なし' : `${f.rank}位`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: DarkColors.lineStrong,
    paddingHorizontal: 2,
  },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  km: {
    fontSize: 9,
    fontWeight: Typography.fontWeight.bold,
    color: DarkColors.textSecondary,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  kmMine: { color: DarkColors.primaryTint },
  bar: {
    width: '100%',
    maxWidth: 42,
    borderTopLeftRadius: BorderRadius.sm,
    borderTopRightRadius: BorderRadius.sm,
  },
  barMine: {
    backgroundColor: DarkColors.primary,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: DarkColors.primaryRing,
  },
  barOther: { backgroundColor: DarkColors.barMuted },

  legendRow: { flexDirection: 'row', gap: Spacing.md, paddingTop: Spacing.sm },
  legendCol: { flex: 1, alignItems: 'center' },
  mark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markMine: { backgroundColor: DarkColors.markStrong },
  markOther: { backgroundColor: DarkColors.chip },
  markText: { fontSize: 9, fontWeight: Typography.fontWeight.bold, color: DarkColors.textSecondary },
  markTextMine: { color: DarkColors.markStrongText },
  legendLabel: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: DarkColors.textSecondary,
  },
  legendLabelMine: { color: DarkColors.primaryTint },
  legendRank: { fontSize: 9, color: DarkColors.textTertiary, fontVariant: ['tabular-nums'] },
});
