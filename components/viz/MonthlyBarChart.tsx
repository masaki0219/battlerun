import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Animation, BorderRadius, Colors, Spacing, Typography } from '../../design_tokens';
import { chartAxisLabel, niceChartMaximum } from '../../utils/chartScale';

export interface MonthlyBarChartItem {
  monthKey: string;
  label: string;
  km: number;
}

interface Props {
  months: MonthlyBarChartItem[];
  selectedMonthKey: string;
  onSelect: (monthKey: string) => void;
  height?: number;
}

const MIN_BAR = 3;

/** 直近12ヶ月を選択できる、依存ゼロの月間距離チャート。 */
export function MonthlyBarChart({ months, selectedMonthKey, onSelect, height = 92 }: Props) {
  const peak = niceChartMaximum(Math.max(...months.map((month) => month.km), 0));
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, {
      toValue: 1,
      duration: Animation.countUpDuration,
      useNativeDriver: false,
    }).start();
  }, [months.map((month) => month.km).join(',')]);

  return (
    <View>
      <Text style={styles.axisUnit}>km</Text>
      <View style={styles.plotRow}>
        <View style={[styles.axis, { height }]}>
          <Text style={styles.axisLabel}>{chartAxisLabel(peak)}</Text>
          <Text style={styles.axisLabel}>{chartAxisLabel(peak / 2)}</Text>
          <Text style={styles.axisLabel}>0</Text>
        </View>
        <View style={[styles.plot, { height }]}>
          <View style={styles.grid} pointerEvents="none">
            <View style={[styles.gridLine, styles.gridTop]} />
            <View style={[styles.gridLine, styles.gridMiddle]} />
            <View style={[styles.gridLine, styles.gridBottom]} />
          </View>
          <View style={[styles.bars, { height }]}>
            {months.map((month) => {
              const selected = month.monthKey === selectedMonthKey;
              const target = month.km > 0 ? Math.max(MIN_BAR, (month.km / peak) * height) : MIN_BAR;
              const barHeight = grow.interpolate({
                inputRange: [0, 1],
                outputRange: [MIN_BAR, target],
              });
              return (
                <TouchableOpacity
                  key={month.monthKey}
                  style={styles.slot}
                  onPress={() => onSelect(month.monthKey)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${month.label}、${month.km.toFixed(1)}キロメートル`}
                >
                  <View style={[styles.track, { height }]}>
                    <Animated.View
                      style={[
                        styles.bar,
                        {
                          height: barHeight,
                          backgroundColor: month.km <= 0
                            ? Colors.chartBarInactive
                            : selected ? Colors.accent : Colors.chartBarActive,
                        },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.labelsOuter}>
        <View style={styles.axisSpacer} />
        <View style={styles.labels}>
          {months.map((month) => {
            const selected = month.monthKey === selectedMonthKey;
            return (
              <View key={month.monthKey} style={styles.slot}>
                <Text style={[styles.label, selected && styles.labelSelected]}>{month.label}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plotRow: { flexDirection: 'row', gap: Spacing.xs },
  plot: { flex: 1, position: 'relative' },
  bars: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs },
  axisUnit: { width: 32, marginBottom: 3, fontSize: 9, color: Colors.textTertiary, textAlign: 'right' },
  axis: { width: 32, justifyContent: 'space-between', alignItems: 'flex-end' },
  axisLabel: { fontSize: 9, color: Colors.textTertiary, fontVariant: ['tabular-nums'] },
  axisSpacer: { width: 32 },
  grid: { ...StyleSheet.absoluteFillObject },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: Colors.chartTrack },
  gridTop: { top: 0 },
  gridMiddle: { top: '50%' },
  gridBottom: { bottom: 0 },
  slot: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
  track: {
    width: '100%', justifyContent: 'flex-end', overflow: 'hidden',
    borderRadius: BorderRadius.sm, backgroundColor: Colors.chartTrack,
  },
  bar: { width: '100%', borderRadius: BorderRadius.sm },
  labelsOuter: { flexDirection: 'row', gap: Spacing.xs },
  labels: { flex: 1, flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm },
  label: { fontSize: 8, color: Colors.textTertiary, textAlign: 'center' },
  labelSelected: { color: Colors.accentText, fontWeight: Typography.fontWeight.bold },
});
