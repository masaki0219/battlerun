import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Colors, Spacing, Animation } from '../../design_tokens';

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
}

const MIN_BAR = 3;

/**
 * 直近7日の日別距離バーチャート。View のみ（依存ゼロ）。
 * バトルタブ・ランタブ・stats で共用。マウント時に高さを 0→実値へアニメーション。
 */
export function WeeklyBarChart({ days, maxKm, height = 64, compact = false }: Props) {
  const peak = Math.max(1, maxKm ?? Math.max(...days.map((d) => d.km), 0));
  const totalKm = days.reduce((sum, d) => sum + d.km, 0);
  const allZero = totalKm <= 0;

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
      {!compact ? (
        <View style={styles.headerRow}>
          <Text style={styles.totalText}>
            今週合計 <Text style={styles.totalNum}>{totalKm.toFixed(1)}</Text>km
          </Text>
        </View>
      ) : null}

      <View style={[styles.barsRow, { height }]}>
        {days.map((d, i) => {
          const target = d.km > 0 ? Math.max(MIN_BAR, (d.km / peak) * height) : MIN_BAR;
          const barColor = d.isToday
            ? d.km > 0
              ? Colors.chartToday
              : Colors.chartBarInactive
            : d.km > 0
            ? Colors.chartBarActive
            : Colors.chartBarInactive;
          const barHeight = grow.interpolate({
            inputRange: [0, 1],
            outputRange: [MIN_BAR, target],
          });
          return (
            <View key={i} style={styles.barSlot}>
              <Animated.View
                style={[styles.bar, { height: barHeight, backgroundColor: barColor }]}
              >
                {d.isToday && d.km === 0 ? (
                  <View style={styles.todayUnderline} />
                ) : null}
              </Animated.View>
            </View>
          );
        })}

        {allZero ? (
          <View style={styles.emptyOverlay} pointerEvents="none">
            <Text style={styles.emptyText}>今週最初のランを記録しよう</Text>
          </View>
        ) : null}
      </View>

      {!compact ? (
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  barSlot: {
    flex: 1,
    alignItems: 'stretch',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    justifyContent: 'flex-end',
  },
  todayUnderline: {
    height: 2,
    backgroundColor: Colors.chartToday,
    borderRadius: 1,
  },
  labelsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  dayLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  dayLabelToday: {
    color: Colors.accent,
    fontWeight: '700',
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
});
