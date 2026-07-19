import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRecentActivities } from '../../hooks/useRecentActivities';
import { weeklyBuckets, streakDays, relativeDay } from '../../utils/displayStats';
import { Colors, Spacing, BorderRadius, Shadow, TextStyles, Typography } from '../../design_tokens';
import { EmptyState } from '../../components/ui/EmptyState';
import { WeeklyBarChart } from '../../components/viz/WeeklyBarChart';
import { StreakChip } from '../../components/viz/StreakChip';
import type { MeasurementType } from '../../types';

type ActivityFilter = 'all' | 'gps' | 'steps';

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

const DAY_MS = 86_400_000;

/** 記録の振り返り画面。集計値は取得済みの直近50件から算出する。 */
export default function StatsScreen() {
  const { activities, loading } = useRecentActivities(50);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const now = new Date();

  const totalKm = activities.reduce((sum, activity) => sum + activity.distanceKm, 0);
  const longestRun = activities.reduce((max, activity) => Math.max(max, activity.distanceKm), 0);
  const monthKm = activities
    .filter((activity) => {
      const date = new Date(activity.startedAt);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    })
    .reduce((sum, activity) => sum + activity.distanceKm, 0);
  const weekBuckets = weeklyBuckets(activities, now);
  const weekTotal = weekBuckets.reduce((sum, day) => sum + day.km, 0);
  const weekCount = activities.filter(
    (activity) => now.getTime() - new Date(activity.startedAt).getTime() < 7 * DAY_MS,
  ).length;
  const streak = streakDays(activities, now);

  const filteredActivities = useMemo(
    () => activities.filter((activity) => filter === 'all' || activity.measurementType === filter),
    [activities, filter],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ZELIO</Text>
        <Text style={styles.headerTitle}>記録</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>今週</Text>
              <StreakChip days={streak} />
            </View>
            <View style={styles.weekCard}>
              <WeeklyBarChart days={weekBuckets} height={84} showTotal={false} />
              <View style={styles.weekTotals}>
                <View style={styles.weekTotalCell}>
                  <Text style={styles.statLabel}>合計</Text>
                  <Text style={styles.weekNumber}>{weekTotal.toFixed(1)}<Text style={styles.unit}>km</Text></Text>
                </View>
                <View style={styles.weekTotalCell}>
                  <Text style={styles.statLabel}>記録回数</Text>
                  <Text style={styles.weekNumber}>{weekCount}<Text style={styles.unit}>回</Text></Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.grid}>
            <SummaryCard label="距離" value={totalKm.toFixed(1)} unit="km" note="直近50件" />
            <SummaryCard
              label="最長ラン"
              value={longestRun.toFixed(1)}
              unit="km"
              note="自己ベスト"
              icon="trophy-outline"
              accent
            />
            <SummaryCard label="今月" value={monthKm.toFixed(1)} unit="km" note={`${now.getMonth() + 1}月の合計`} valuePrimary />
            <SummaryCard label="連続日数" value={String(streak)} unit="日" note="現在の記録" />
          </View>

          <View>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>履歴</Text>
              <View style={styles.filterBar}>
                {([
                  { value: 'all', label: 'すべて' },
                  { value: 'gps', label: 'GPS' },
                  { value: 'steps', label: '歩数' },
                ] as const).map((item) => {
                  const active = filter === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      onPress={() => setFilter(item.value)}
                      style={[styles.filterButton, active && styles.filterButtonActive]}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {activities.length === 0 ? (
              <EmptyState icon="walk-outline" title="まだラン履歴がありません" hint="「ラン」タブから記録を開始してください" />
            ) : filteredActivities.length === 0 ? (
              <EmptyState icon="filter-outline" title="該当する記録はありません" hint="別の記録種類を選んでください" />
            ) : (
              <View style={styles.historyCard}>
                {filteredActivities.map((activity, index) => {
                  const isSteps = activity.measurementType === 'steps';
                  const isBest = activity.distanceKm > 0 && activity.distanceKm === longestRun;
                  return (
                    <React.Fragment key={activity.id}>
                      {index > 0 && <View style={styles.rowDivider} />}
                      <TouchableOpacity
                        style={styles.historyRow}
                        onPress={() => router.push(`/activity/${activity.id}` as any)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.typeIcon, isSteps ? styles.typeIconSteps : styles.typeIconGps]}>
                          <Ionicons
                            name={isSteps ? 'footsteps-outline' : 'navigate-outline'}
                            size={18}
                            color={isSteps ? Colors.info : Colors.primaryDark}
                          />
                        </View>
                        <View style={styles.rowMain}>
                          <View style={styles.distanceLine}>
                            <Text style={styles.rowDistance}>{activity.distanceKm.toFixed(2)} km</Text>
                            {isBest && <Text style={styles.bestBadge}>BEST</Text>}
                          </View>
                          <Text style={styles.rowDetail}>
                            {formatTime(activity.durationSeconds)} ・ {isSteps ? `${(activity.steps ?? 0).toLocaleString()}歩` : 'GPS'}
                          </Text>
                        </View>
                        <View style={styles.rowEnd}>
                          <Text style={styles.rowDate}>{relativeDay(activity.startedAt, now)}</Text>
                          <Ionicons name="chevron-forward" size={15} color={Colors.textTertiary} />
                        </View>
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </View>
            )}
            {activities.length > 0 && <Text style={styles.historyNote}>直近50件のラン記録を表示しています</Text>}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SummaryCard({
  label, value, unit, note, icon, accent = false, valuePrimary = false,
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  accent?: boolean;
  valuePrimary?: boolean;
}) {
  return (
    <View style={[styles.summaryCard, accent && styles.summaryCardAccent]}>
      <View style={styles.summaryLabelRow}>
        {icon && <Ionicons name={icon} size={13} color={Colors.accentDark} />}
        <Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label}</Text>
      </View>
      <Text style={[styles.summaryNumber, accent && styles.summaryNumberAccent, valuePrimary && styles.summaryNumberPrimary]}>
        {value}<Text style={styles.unit}>{unit}</Text>
      </Text>
      <Text style={[styles.summaryNote, accent && styles.summaryNoteAccent]}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  eyebrow: { fontSize: 10, letterSpacing: 1.8, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
  headerTitle: { fontSize: 26, fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary, marginTop: 2 },
  scroll: { paddingHorizontal: Spacing.xl, paddingBottom: 110, gap: Spacing['2xl'] },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  sectionTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  weekCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, ...Shadow.sm },
  weekTotals: { flexDirection: 'row', gap: Spacing['3xl'], borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.md, marginTop: Spacing.md },
  weekTotalCell: { minWidth: 82 },
  statLabel: { fontSize: 11, fontWeight: Typography.fontWeight.medium, color: Colors.textSecondary },
  weekNumber: { fontSize: 22, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary, marginTop: 2, fontVariant: ['tabular-nums'] },
  unit: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary, marginLeft: 3 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  summaryCard: { width: '48%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, ...Shadow.sm },
  summaryCardAccent: { borderColor: Colors.accent },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabelAccent: { color: Colors.accentDark },
  summaryNumber: { fontSize: 24, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary, marginTop: Spacing.sm, fontVariant: ['tabular-nums'] },
  summaryNumberAccent: { color: Colors.accent },
  summaryNumberPrimary: { color: Colors.primaryDark },
  summaryNote: { fontSize: 10, color: Colors.textTertiary, marginTop: 3 },
  summaryNoteAccent: { color: Colors.accentDark },

  filterBar: { flexDirection: 'row', gap: 2, backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.md, padding: 3 },
  filterButton: { paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: BorderRadius.sm },
  filterButtonActive: { backgroundColor: Colors.primaryDark },
  filterText: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
  filterTextActive: { color: Colors.textOnPrimary },
  historyCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  rowDivider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 68 },
  typeIcon: { width: 40, height: 40, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center' },
  typeIconGps: { backgroundColor: Colors.primaryLight },
  typeIconSteps: { backgroundColor: Colors.surfaceGray },
  rowMain: { flex: 1, minWidth: 0 },
  distanceLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowDistance: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  bestBadge: { backgroundColor: Colors.accentLight, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, color: Colors.accentDark, fontSize: 9, fontWeight: Typography.fontWeight.bold },
  rowDetail: { fontSize: 11, fontWeight: Typography.fontWeight.medium, color: Colors.textSecondary, marginTop: 3 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rowDate: { fontSize: 11, fontWeight: Typography.fontWeight.medium, color: Colors.textSecondary },
  historyNote: { fontSize: 10, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.md },
});
