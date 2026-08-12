import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRecentActivities } from '../../hooks/useRecentActivities';
import { useAuthStore } from '../../stores/authStore';
import { calendarWeekKey, formatRunDistanceKm, hasHighTrainingLoad, rollingWeekBuckets, weeklyBuckets, streakDays, relativeDay } from '../../utils/displayStats';
import { Colors, Spacing, BorderRadius, Shadow, TextStyles, Typography } from '../../design_tokens';
import { EmptyState } from '../../components/ui/EmptyState';
import { WeeklyBarChart } from '../../components/viz/WeeklyBarChart';
import { StreakChip } from '../../components/viz/StreakChip';
import { WeeklyGoalProgress } from '../../components/run/WeeklyGoalProgress';
import { WeeklyGoalSettingsModal } from '../../components/run/WeeklyGoalSettingsModal';
import { MonthlyBarChart } from '../../components/viz/MonthlyBarChart';
import { useMonthlyStats } from '../../hooks/useMonthlyStats';
import {
  monthLabel,
  monthlyDistanceLowerBound,
  recentTokyoMonthKeys,
  reconcileMonthlyStats,
  tokyoMonthKey,
} from '../../utils/monthlyStats';
import type { MeasurementType } from '../../types';
import { useTranslation } from '../../lib/i18n';
import { flushPendingActivities, useRecordStore } from '../../stores/recordStore';

type ActivityFilter = 'all' | 'gps' | 'steps';

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function nonNegativeMetric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

const DAY_MS = 86_400_000;
const TRAINING_LOAD_SEEN_KEY = '@battlerun_training_load_seen_v1';

/** 記録の振り返り画面。月次はサーバー集計、それ以外は生涯値または直近50件を使う。 */
export default function StatsScreen() {
  const { language, t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.6;
  const { activities, loading } = useRecentActivities(50);
  const now = new Date();
  const { months: monthlyStats, loading: monthlyLoading } = useMonthlyStats(now);
  const { user, setWeeklyGoal } = useAuthStore();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [showWeeklyGoal, setShowWeeklyGoal] = useState(false);
  const [showTrainingLoad, setShowTrainingLoad] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => tokyoMonthKey(now));
  const pendingActivityCount = useRecordStore((state) => state.pendingActivityCount);
  const pendingQueueHydrated = useRecordStore((state) => state.pendingQueueHydrated);
  const pendingQueueSending = useRecordStore((state) => state.pendingQueueSending);

  const retryPendingActivities = async () => {
    try {
      const before = useRecordStore.getState().pendingActivityCount;
      const result = await flushPendingActivities();
      const remaining = useRecordStore.getState().pendingActivityCount;
      if (remaining > 0 && result.sent === 0 && result.discarded === 0) {
        Alert.alert(t('stats.pendingRetryTitle'), t('stats.pendingRetryBody'));
        return;
      }
      if (remaining === 0 && before > 0 && result.sent > 0 && result.discarded === 0) {
        Alert.alert(t('stats.resentTitle'), t('stats.resentBody'));
      }
    } catch (error) {
      console.warn('[StatsScreen] pending activity retry failed:', error);
      Alert.alert(t('stats.retryStartFailed'), t('stats.retryStartFailedBody'));
    }
  };

  // 取得済み活動よりサーバー累計が小さい矛盾時は、確実に確認できる側を下限として使う。
  const recentKm = activities.reduce((sum, activity) => sum + nonNegativeMetric(activity.distanceKm), 0);
  const serverLifetimeKm = typeof user?.totalDistanceKm === 'number'
    && Number.isFinite(user.totalDistanceKm)
    && user.totalDistanceKm >= 0
    ? user.totalDistanceKm
    : null;
  const longestRun = activities.reduce(
    (max, activity) => Math.max(max, nonNegativeMetric(activity.distanceKm)),
    0,
  );
  const personalRecords = user?.personalRecords;
  const longestRecordKm = personalRecords?.longestRunKm ?? longestRun;
  const rollingBuckets = rollingWeekBuckets(activities, now, language);
  const calendarWeekBuckets = weeklyBuckets(activities, now, language);
  const weekTotal = rollingBuckets.reduce((sum, day) => sum + day.km, 0);
  const rollingStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
  const weekCount = activities.filter((activity) => {
    const started = new Date(activity.startedAt).getTime();
    return !Number.isNaN(started) && started >= rollingStart && started <= now.getTime();
  }).length;
  const streak = streakDays(activities, now);
  const highTrainingLoad = hasHighTrainingLoad(activities, now);
  const currentWeekKey = calendarWeekKey(now);
  const recentMonthKeys = recentTokyoMonthKeys(now, 12);
  const reconciledMonths = reconcileMonthlyStats(monthlyStats, activities);
  const monthlyStatsMap = new Map(reconciledMonths.map((month) => [month.monthKey, month]));
  const currentMonthKey = tokyoMonthKey(now);
  const monthKm = monthlyStatsMap.get(currentMonthKey)?.km ?? 0;
  const bestMonthRecordKm = Math.max(
    personalRecords?.bestMonthKm ?? 0,
    ...[...monthlyStatsMap.values()].map((month) => month.km),
  );
  const monthlyChart = recentMonthKeys.map((monthKey) => ({
    monthKey,
    label: monthKey.endsWith('-01') ? monthLabel(monthKey, language) : String(Number(monthKey.slice(5, 7))),
    km: monthlyStatsMap.get(monthKey)?.km ?? 0,
  }));
  const selectedMonthlyStat = monthlyStatsMap.get(selectedMonthKey) ?? {
    monthKey: selectedMonthKey,
    km: 0,
    count: 0,
    durationSec: 0,
    elevationM: 0,
  };
  const currentYear = tokyoMonthKey(now).slice(0, 4);
  const annualKm = [...monthlyStatsMap.values()]
    .filter((month) => month.monthKey.startsWith(`${currentYear}-`))
    .reduce((sum, month) => sum + month.km, 0);
  const reconciledMonthlyKm = monthlyDistanceLowerBound(reconciledMonths);
  const lifetimeKm = Math.max(recentKm, serverLifetimeKm ?? 0, reconciledMonthlyKm);
  const lifetimeNeedsReview = serverLifetimeKm != null
    && (recentKm > serverLifetimeKm + 0.001 || reconciledMonthlyKm > serverLifetimeKm + 0.001);
  const lifetimeNote = lifetimeNeedsReview
    ? t('stats.reviewing')
    : serverLifetimeKm != null ? t('stats.lifetime') : t('stats.fetchedRecords');

  useEffect(() => {
    if (loading || !user || !highTrainingLoad) return;
    let cancelled = false;
    const storageKey = `${TRAINING_LOAD_SEEN_KEY}:${user.id}`;
    void AsyncStorage.getItem(storageKey).then(async (seenWeek) => {
      if (cancelled || seenWeek === currentWeekKey) return;
      await AsyncStorage.setItem(storageKey, currentWeekKey);
      if (!cancelled) setShowTrainingLoad(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [loading, user?.id, highTrainingLoad, currentWeekKey]);

  const filteredActivities = useMemo(
    () => activities.filter((activity) => filter === 'all' || activity.measurementType === filter),
    [activities, filter],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ZELIO</Text>
        <Text style={styles.headerTitle}>{t('stats.title')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {pendingQueueHydrated && pendingActivityCount > 0 && (
            <View style={[styles.pendingCard, largeText && styles.pendingCardLargeText]} accessibilityLiveRegion="polite">
              <View style={styles.pendingIcon}>
                <Ionicons name="cloud-upload-outline" size={20} color={Colors.accentText} />
              </View>
              <View style={styles.pendingCopy}>
                <Text style={styles.pendingTitle}>{t('stats.pendingCount', { count: pendingActivityCount })}</Text>
                <Text style={styles.pendingText}>{t('stats.pendingSafe')}</Text>
              </View>
              <TouchableOpacity
                style={[styles.pendingButton, largeText && styles.pendingButtonLargeText]}
                onPress={() => void retryPendingActivities()}
                disabled={pendingQueueSending}
                accessibilityRole="button"
                accessibilityLabel={t('stats.retryPendingA11y', { count: pendingActivityCount })}
                accessibilityState={{ disabled: pendingQueueSending }}
              >
                {pendingQueueSending
                  ? <ActivityIndicator size="small" color={Colors.accentText} />
                  : <Text style={styles.pendingButtonText}>{t('stats.retry')}</Text>}
              </TouchableOpacity>
            </View>
          )}
          <View>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('battle.lastSevenDays')}</Text>
              <StreakChip days={streak} />
            </View>
            <View style={styles.weekCard}>
              <WeeklyBarChart days={rollingBuckets} height={84} showTotal={false} periodLabel={t('battle.lastSevenDays')} />
              <View style={styles.weekTotals}>
                <View style={styles.weekTotalCell}>
                  <Text style={styles.statLabel}>{t('stats.total')}</Text>
                  <Text style={styles.weekNumber}>{weekTotal.toFixed(1)}<Text style={styles.unit}>km</Text></Text>
                </View>
                <View style={styles.weekTotalCell}>
                  <Text style={styles.statLabel}>{t('stats.recordCount')}</Text>
                  <Text style={styles.weekNumber}>{weekCount}<Text style={styles.unit}>{t('profile.times')}</Text></Text>
                </View>
              </View>
            </View>
            <View style={styles.goalBlock}>
              <WeeklyGoalProgress
                goal={user?.weeklyGoal}
                days={calendarWeekBuckets}
                onPress={() => setShowWeeklyGoal(true)}
              />
            </View>
            {showTrainingLoad && (
              <View style={styles.trainingLoadCard}>
                <View style={styles.trainingLoadIcon}>
                  <Ionicons name="leaf-outline" size={19} color={Colors.primaryDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.trainingLoadTitle}>{t('stats.trainingLoadTitle')}</Text>
                  <Text style={styles.trainingLoadText}>{t('stats.trainingLoadBody')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowTrainingLoad(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('stats.closeNoticeA11y')}
                >
                  <Ionicons name="close" size={17} color={Colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('stats.monthlyAnnual')}</Text>
              <View style={styles.periodLabels}>
                <Text style={styles.rangeLabel}>{t('stats.lastTwelveMonths')}</Text>
                <Text style={styles.yearTotalLabel}>{t('stats.annualToDate', { year: currentYear })}</Text>
              </View>
            </View>
            <View style={styles.monthlyCard}>
              <View style={styles.annualRow}>
                <View>
                  <Text style={styles.statLabel}>{t('stats.annualTotal')}</Text>
                  <Text style={styles.annualNumber}>
                    {annualKm.toFixed(1)}<Text style={styles.unit}>km</Text>
                  </Text>
                </View>
                {monthlyLoading && <ActivityIndicator size="small" color={Colors.primary} />}
              </View>
              <MonthlyBarChart
                months={monthlyChart}
                selectedMonthKey={selectedMonthKey}
                onSelect={setSelectedMonthKey}
              />
              <View style={styles.monthDetailHeader}>
                <Text style={styles.monthDetailTitle}>{t('stats.monthBreakdown', { month: monthLabel(selectedMonthKey, language) })}</Text>
                <Text style={styles.monthDetailYear}>{t('stats.year', { year: selectedMonthKey.slice(0, 4) })}</Text>
              </View>
              <View style={styles.monthDetailGrid}>
                <MonthDetailCell label={t('stats.distance')} value={`${selectedMonthlyStat.km.toFixed(1)} km`} />
                <MonthDetailCell label={t('stats.recordCount')} value={t('stats.recordsUnit', { count: selectedMonthlyStat.count })} />
                <MonthDetailCell label={t('stats.time')} value={formatTime(selectedMonthlyStat.durationSec)} />
              </View>
              <Text style={styles.monthlyNote}>{t('stats.tokyoAggregation')}</Text>
            </View>
          </View>

          <View style={styles.grid}>
            <SummaryCard label={t('stats.distance')} value={lifetimeKm.toFixed(1)} unit="km" note={lifetimeNote} />
            <SummaryCard
              label={t('stats.longestRun')}
              value={formatRunDistanceKm(longestRecordKm)}
              unit="km"
              note={t('stats.personalBest')}
              icon="trophy-outline"
              accent
            />
            <SummaryCard
              label={t('stats.thisMonth')}
              value={monthKm.toFixed(1)}
              unit="km"
              note={t('stats.monthTotal', { month: monthLabel(currentMonthKey, language) })}
              valuePrimary
            />
            <SummaryCard label={t('profile.streak')} value={String(streak)} unit={t('profile.dayUnit')} note={t('stats.currentRecord')} />
          </View>

          <View>
            <Text style={[styles.sectionTitle, { marginBottom: Spacing.md }]}>{t('stats.personalRecords')}</Text>
            <View style={styles.personalRecordsCard}>
              <View style={styles.personalRecordsRow}>
                <PersonalRecordCell label={t('stats.fastest1k')} value={recordTime(personalRecords?.fastest1kSec)} />
                <PersonalRecordCell label={t('stats.fastest5k')} value={recordTime(personalRecords?.fastest5kSec)} />
                <PersonalRecordCell label={t('stats.fastest10k')} value={recordTime(personalRecords?.fastest10kSec)} />
              </View>
              <View style={styles.personalRecordsDivider} />
              <View style={styles.personalRecordsRow}>
                <PersonalRecordCell label={t('stats.longestDistance')} value={longestRecordKm > 0 ? `${formatRunDistanceKm(longestRecordKm)} km` : '—'} />
                <PersonalRecordCell label={t('stats.bestMonth')} value={bestMonthRecordKm > 0 ? `${bestMonthRecordKm.toFixed(1)} km` : '—'} />
              </View>
            </View>
          </View>

          <View>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('stats.history')}</Text>
              <View style={styles.filterBar}>
                {([
                  { value: 'all', label: t('stats.all') },
                  { value: 'gps', label: 'GPS' },
                  { value: 'steps', label: t('stats.steps') },
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
              <EmptyState icon="walk-outline" title={t('stats.noHistory')} hint={t('stats.noHistoryHint')} />
            ) : filteredActivities.length === 0 ? (
              <EmptyState icon="filter-outline" title={t('stats.noFiltered')} hint={t('stats.noFilteredHint')} />
            ) : (
              <View style={styles.historyCard}>
                {filteredActivities.map((activity, index) => {
                  const isSteps = activity.measurementType === 'steps';
                  const isBest = activity.distanceKm > 0
                    && Math.abs(activity.distanceKm - longestRecordKm) < 0.000001;
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
                            <Text style={styles.rowDistance}>{formatRunDistanceKm(activity.distanceKm)} km</Text>
                            {isBest && <Text style={styles.bestBadge}>{t('locale.best')}</Text>}
                          </View>
                          <Text style={styles.rowDetail}>
                            {formatTime(activity.durationSeconds)} · {isSteps ? t('stats.stepCount', { value: (activity.steps ?? 0).toLocaleString(language) }) : 'GPS'}
                          </Text>
                        </View>
                        <View style={styles.rowEnd}>
                          <Text style={styles.rowDate}>{relativeDay(activity.startedAt, now, language)}</Text>
                          <Ionicons name="chevron-forward" size={15} color={Colors.textTertiary} />
                        </View>
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </View>
            )}
            {activities.length > 0 && <Text style={styles.historyNote}>{t('stats.recentFifty')}</Text>}
          </View>
        </ScrollView>
      )}
      <WeeklyGoalSettingsModal
        visible={showWeeklyGoal}
        currentGoal={user?.weeklyGoal}
        onSave={async (goal) => {
          try {
            await setWeeklyGoal(goal);
          } catch {
            Alert.alert(t('stats.saveFailed'), t('connection.tryAgain'));
            throw new Error('weekly goal save failed');
          }
        }}
        onClear={async () => {
          try {
            await setWeeklyGoal(null);
          } catch {
            Alert.alert(t('stats.clearFailed'), t('connection.tryAgain'));
            throw new Error('weekly goal clear failed');
          }
        }}
        onClose={() => setShowWeeklyGoal(false)}
      />
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
        {icon && <Ionicons name={icon} size={13} color={Colors.accentText} />}
        <Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label}</Text>
      </View>
      <Text style={[styles.summaryNumber, accent && styles.summaryNumberAccent, valuePrimary && styles.summaryNumberPrimary]}>
        {value}<Text style={styles.unit}>{unit}</Text>
      </Text>
      <Text style={[styles.summaryNote, accent && styles.summaryNoteAccent]}>{note}</Text>
    </View>
  );
}

function recordTime(seconds: number | undefined): string {
  return seconds != null && Number.isFinite(seconds) && seconds > 0
    ? formatTime(Math.round(seconds))
    : '—';
}

function PersonalRecordCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.personalRecordCell}>
      <Text style={styles.personalRecordLabel}>{label}</Text>
      <Text style={styles.personalRecordValue}>{value}</Text>
    </View>
  );
}

function MonthDetailCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.monthDetailCell}>
      <Text style={styles.monthDetailLabel}>{label}</Text>
      <Text style={styles.monthDetailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  eyebrow: { fontSize: 10, letterSpacing: 1.8, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
  headerTitle: { fontSize: 26, fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary, marginTop: 2 },
  scroll: { paddingHorizontal: Spacing.xl, paddingBottom: 110, gap: Spacing['2xl'] },
  pendingCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.md,
    backgroundColor: Colors.accentLight, borderWidth: 1, borderColor: Colors.accent,
  },
  pendingCardLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  pendingIcon: {
    width: 36, height: 36, borderRadius: BorderRadius.full,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface,
  },
  pendingCopy: { flex: 1, minWidth: 0 },
  pendingTitle: { fontSize: 12, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  pendingText: { marginTop: 2, fontSize: 10, lineHeight: 14, color: Colors.textSecondary },
  pendingButton: {
    minWidth: 72, minHeight: 44, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accent,
  },
  pendingButtonLargeText: { alignSelf: 'stretch' },
  pendingButtonText: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: Colors.accentText },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  sectionTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  weekCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, ...Shadow.sm },
  weekTotals: { flexDirection: 'row', gap: Spacing['3xl'], borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.md, marginTop: Spacing.md },
  weekTotalCell: { minWidth: 82 },
  goalBlock: { marginTop: Spacing.md },
  trainingLoadCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    marginTop: Spacing.md, padding: Spacing.md,
    borderRadius: BorderRadius.md, backgroundColor: Colors.primaryLight,
    borderWidth: 1, borderColor: Colors.primaryBorder,
  },
  trainingLoadIcon: { width: 38, height: 38, borderRadius: BorderRadius.full, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  trainingLoadTitle: { fontSize: 13, fontWeight: Typography.fontWeight.bold, color: Colors.primaryDark },
  trainingLoadText: { fontSize: 10, lineHeight: 15, color: Colors.textSecondary, marginTop: 2 },
  statLabel: { fontSize: 11, fontWeight: Typography.fontWeight.medium, color: Colors.textSecondary },
  weekNumber: { fontSize: 22, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary, marginTop: 2, fontVariant: ['tabular-nums'] },
  unit: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary, marginLeft: 3 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  summaryCard: { width: '48%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, ...Shadow.sm },
  summaryCardAccent: { borderColor: Colors.accent },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabelAccent: { color: Colors.accentText },
  summaryNumber: { fontSize: 24, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary, marginTop: Spacing.sm, fontVariant: ['tabular-nums'] },
  summaryNumberAccent: { color: Colors.accentText },
  summaryNumberPrimary: { color: Colors.primaryDark },
  summaryNote: { fontSize: 10, color: Colors.textSecondary, marginTop: 3 },
  summaryNoteAccent: { color: Colors.accentText },

  personalRecordsCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, ...Shadow.sm },
  personalRecordsRow: { flexDirection: 'row', gap: Spacing.md },
  personalRecordsDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: Spacing.lg },
  personalRecordCell: { flex: 1, minWidth: 0 },
  personalRecordLabel: { fontSize: 9, color: Colors.textTertiary, fontWeight: Typography.fontWeight.bold },
  personalRecordValue: { fontSize: 15, color: Colors.textPrimary, fontWeight: Typography.fontWeight.extrabold, marginTop: 4, fontVariant: ['tabular-nums'] },

  yearTotalLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: Typography.fontWeight.bold },
  periodLabels: { alignItems: 'flex-end', gap: 2 },
  rangeLabel: { fontSize: 9, color: Colors.textSecondary },
  monthlyCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, ...Shadow.sm },
  annualRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  annualNumber: { fontSize: 28, fontWeight: Typography.fontWeight.extrabold, color: Colors.primaryDark, marginTop: 2, fontVariant: ['tabular-nums'] },
  monthDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.borderLight, marginTop: Spacing.lg, paddingTop: Spacing.lg },
  monthDetailTitle: { fontSize: 14, color: Colors.textPrimary, fontWeight: Typography.fontWeight.bold },
  monthDetailYear: { fontSize: 10, color: Colors.textTertiary },
  monthDetailGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: Spacing.md },
  monthDetailCell: { width: '50%', paddingVertical: Spacing.sm },
  monthDetailLabel: { fontSize: 9, color: Colors.textTertiary, fontWeight: Typography.fontWeight.bold },
  monthDetailValue: { fontSize: 15, color: Colors.textPrimary, fontWeight: Typography.fontWeight.extrabold, marginTop: 3, fontVariant: ['tabular-nums'] },
  monthlyNote: { fontSize: 9, lineHeight: 14, color: Colors.textSecondary, marginTop: Spacing.md },

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
  bestBadge: { backgroundColor: Colors.accentLight, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, color: Colors.accentText, fontSize: 9, fontWeight: Typography.fontWeight.bold },
  rowDetail: { fontSize: 11, fontWeight: Typography.fontWeight.medium, color: Colors.textSecondary, marginTop: 3 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rowDate: { fontSize: 11, fontWeight: Typography.fontWeight.medium, color: Colors.textSecondary },
  historyNote: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.md },
});
