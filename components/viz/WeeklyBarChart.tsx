import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius, Animation } from '../../design_tokens';
import { chartAxisLabel, niceChartMaximum } from '../../utils/chartScale';

export interface WeeklyBarChartDay {
  label: string;
  km: number;
  isToday: boolean;
}

interface Props {
  /** 常に7要素、古い→新しい順 */
  days: WeeklyBarChartDay[];
  /** 未指定なら days の最大値（最低 1） */
  maxKm?: number;
  /** バー領域の高さ。default 64 */
  height?: number;
  /** true: ラベル・数値を省略（ランタブのミニ表示用） */
  compact?: boolean;
  /** 「今週合計 ◯km」行の表示。default は compact の逆。カード側が合計を大きく出すなら false */
  showTotal?: boolean;
  /** 合計行と空表示の期間名。カレンダー週では「今週」、移動窓では「直近7日」。 */
  periodLabel?: string;
}

const MIN_BAR = 3;

/**
 * 直近7日の日別距離バーチャート。View のみ（依存ゼロ）。
 * バトルタブ・ランタブ・stats で共用。マウント時に高さを 0→実値へアニメーション。
 * 各バーは下地トラック（レーン）の中で伸びる。今日のバーだけ accent。
 */
export function WeeklyBarChart({
  days, maxKm, height = 64, compact = false, showTotal, periodLabel = '今週',
}: Props) {
  const rawPeak = maxKm ?? Math.max(...days.map((d) => d.km), 0);
  const peak = niceChartMaximum(rawPeak);
  const totalKm = days.reduce((sum, d) => sum + d.km, 0);
  const allZero = totalKm <= 0;
  const withTotal = showTotal ?? !compact;

  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, {
      toValue: 1,
      duration: Animation.countUpDuration,
      useNativeDriver: false,
    }).start();
  }, [peak, days.length]);

  return (
    <View>
      {withTotal ? (
        <View style={styles.headerRow}>
          <Text style={styles.totalText}>
            {periodLabel}合計 <Text style={styles.totalNum}>{totalKm.toFixed(1)}</Text>km
          </Text>
        </View>
      ) : null}

      {!compact && <Text style={styles.axisUnit}>km</Text>}
      <View style={styles.plotRow}>
        {!compact && (
          <View style={[styles.axis, { height }]}>
            <Text style={styles.axisLabel}>{chartAxisLabel(peak)}</Text>
            <Text style={styles.axisLabel}>{chartAxisLabel(peak / 2)}</Text>
            <Text style={styles.axisLabel}>0</Text>
          </View>
        )}
        <View style={[styles.plot, { height }]}>
          {!compact && (
            <View style={styles.grid} pointerEvents="none">
              <View style={[styles.gridLine, styles.gridTop]} />
              <View style={[styles.gridLine, styles.gridMiddle]} />
              <View style={[styles.gridLine, styles.gridBottom]} />
            </View>
          )}
          <View style={[styles.barsRow, { height }]}>
            {days.map((d, i) => {
              const target = d.km > 0 ? Math.max(MIN_BAR, (d.km / peak) * height) : MIN_BAR;
              const barColor = d.km <= 0
                ? Colors.chartBarInactive
                : d.isToday
                ? Colors.chartToday
                : Colors.chartBarActive;
              const barHeight = grow.interpolate({
                inputRange: [0, 1],
                outputRange: [MIN_BAR, target],
              });
              return (
                <View
                  key={i}
                  style={styles.barSlot}
                  accessible
                  accessibilityLabel={`${d.label}${d.isToday ? '、今日' : ''}、${d.km.toFixed(1)}キロメートル`}
                >
                  <View style={[styles.track, { height }]}>
                    <Animated.View
                      style={[styles.bar, { height: barHeight, backgroundColor: barColor }]}
                    />
                  </View>
                </View>
              );
            })}
          </View>

          {allZero ? (
            <View style={styles.emptyOverlay} pointerEvents="none">
              <Text style={styles.emptyText}>{periodLabel}の最初のランを記録しよう</Text>
            </View>
          ) : null}
        </View>
      </View>

      {!compact ? (
        <View style={styles.labelsOuter}>
          <View style={styles.axisSpacer} />
          <View style={styles.labelsRow}>
            {days.map((d, i) => (
              <View key={i} style={styles.barSlot}>
                <Text
                  style={[styles.dayLabel, d.isToday && styles.dayLabelToday]}
                  numberOfLines={1}
                >
                  {d.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: Spacing.sm,
  },
  totalText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  totalNum: {
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  barsRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  plotRow: { flexDirection: 'row', gap: Spacing.xs },
  plot: { flex: 1, position: 'relative' },
  axisUnit: { width: 32, marginBottom: 3, fontSize: 9, color: Colors.textTertiary, textAlign: 'right' },
  axis: { width: 32, justifyContent: 'space-between', alignItems: 'flex-end' },
  axisLabel: { fontSize: 9, color: Colors.textTertiary, fontVariant: ['tabular-nums'] },
  axisSpacer: { width: 32 },
  grid: { ...StyleSheet.absoluteFillObject },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: Colors.chartTrack },
  gridTop: { top: 0 },
  gridMiddle: { top: '50%' },
  gridBottom: { bottom: 0 },
  barSlot: {
    flex: 1,
    alignItems: 'stretch',
  },
  // バーが伸びる下地レーン。v3 の「棒＋トラック」表現
  track: {
    width: '100%',
    justifyContent: 'flex-end',
    backgroundColor: Colors.chartTrack,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: BorderRadius.sm,
  },
  labelsOuter: { flexDirection: 'row', gap: Spacing.xs },
  labelsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  dayLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  dayLabelToday: {
    color: Colors.accentText,
    fontWeight: '700',
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
