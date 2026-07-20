import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Animation, BorderRadius, Colors, Spacing, Typography } from '../../design_tokens';

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
  const peak = Math.max(1, ...months.map((month) => month.km));
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
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs },
  slot: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
  track: {
    width: '100%', justifyContent: 'flex-end', overflow: 'hidden',
    borderRadius: BorderRadius.sm, backgroundColor: Colors.chartTrack,
  },
  bar: { width: '100%', borderRadius: BorderRadius.sm },
  labels: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm },
  label: { fontSize: 8, color: Colors.textTertiary, textAlign: 'center' },
  labelSelected: { color: Colors.accentDark, fontWeight: Typography.fontWeight.bold },
});
