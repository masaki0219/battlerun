import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, ScrollView } from 'react-native';
import { Colors, DarkColors, Typography, Spacing, BorderRadius, Animation } from '../../design_tokens';
import { factionBarRatio } from '../../utils/teamDisplay';

export interface FactionColumn {
  id: string;
  label: string;
  km: number;
  /** 1始まりの順位 */
  rank: number | null;
  isMine: boolean;
  color: string;
}

interface Props {
  /** 順位昇順（1位が先頭）で渡す */
  factions: FactionColumn[];
  /** バー領域の高さ。default 120 */
  height?: number;
  /** 数値の単位 */
  valueSuffix?: string;
}

const FLOOR = 0.15;

/** バー上の実数値ラベルが占める高さ（fontSize 9 + marginBottom 4 + 余白） */
const VALUE_LABEL_HEIGHT = 17;

/**
 * 全陣営の距離を縦棒で並べるダーク面のチャート（ホームのヒーロー用）。
 *
 * 首位を100%とした実比率を使い、値が小さい場合だけ最低高を残す。
 */
export function FactionColumns({ factions, height = 120, valueSuffix = 'km' }: Props) {
  const max = Math.max(...factions.map((f) => f.km), 0);

  // 各バーの上に実数値ラベルを置くため、その分だけバーの最大高さを詰める。
  // 詰めないと首位のバーが行の高さいっぱいまで伸び、ラベルが行外へはみ出して
  // 上の順位表示（「2位 / 3」）と重なる。
  const barArea = Math.max(24, height - VALUE_LABEL_HEIGHT);

  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, {
      toValue: 1,
      duration: Animation.countUpDuration,
      useNativeDriver: false,
    }).start();
  }, [max, factions.length]);

  const chart = (
    <View
      style={factions.length > 3
        ? [styles.wideChart, { width: Math.max(368, factions.length * 92) }]
        : undefined}
    >
      <View style={[styles.barsRow, { height }]}>
        {factions.map((f) => {
          const ratio = factionBarRatio(f.km, max, FLOOR);
          const barHeight = grow.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.max(2, ratio * barArea)],
          });
          return (
            <View
              key={f.id}
              style={[styles.col, factions.length > 3 && styles.colWide]}
              accessible
              accessibilityLabel={`${f.label}、${f.km.toFixed(1)}${valueSuffix}、${f.rank == null ? '順位なし' : `${f.rank}位`}${f.isMine ? '、あなたのチーム' : ''}`}
            >
              <Text
                style={[styles.km, f.isMine && styles.kmMine]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {f.km.toFixed(1)} {valueSuffix}
              </Text>
              <Animated.View
                style={[
                  styles.bar,
                  { height: barHeight, backgroundColor: f.color },
                  f.isMine && styles.barMine,
                ]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        {factions.map((f) => (
          <View key={f.id} style={styles.legendCol}>
            <View style={[styles.mark, { backgroundColor: f.color }, f.isMine && styles.markMine]}>
              <Text style={styles.markText}>
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

  return factions.length > 3 ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      contentContainerStyle={styles.scrollContent}
      accessibilityLabel="全チームの成績。横にスクロールできます"
    >
      {chart}
    </ScrollView>
  ) : chart;
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
  colWide: { flex: 0, width: 76 },
  wideChart: { minWidth: 92 * 4 },
  scrollContent: { paddingBottom: 4 },
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
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: DarkColors.primaryRing,
  },

  legendRow: { flexDirection: 'row', gap: Spacing.md, paddingTop: Spacing.sm },
  legendCol: { flex: 1, alignItems: 'center' },
  mark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markMine: { borderWidth: 2, borderColor: DarkColors.primaryRing },
  markText: { fontSize: 9, fontWeight: Typography.fontWeight.bold, color: Colors.textOnPrimary },
  legendLabel: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: DarkColors.textSecondary,
  },
  legendLabelMine: { color: DarkColors.primaryTint },
  legendRank: { fontSize: 9, color: DarkColors.textTertiary, fontVariant: ['tabular-nums'] },
});
