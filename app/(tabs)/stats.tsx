import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useRecentActivities } from '../../hooks/useRecentActivities';
import { weeklyBuckets, streakDays, relativeDay } from '../../utils/displayStats';
import { Colors, Spacing, BorderRadius, Shadow, TextStyles } from '../../design_tokens';
import { StatBlock } from '../../components/ui/StatBlock';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { ListRow } from '../../components/ui/ListRow';
import { EmptyState } from '../../components/ui/EmptyState';
import { WeeklyBarChart } from '../../components/viz/WeeklyBarChart';
import { StreakChip } from '../../components/viz/StreakChip';

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  return `${m}分`;
}

const DAY_MS = 86_400_000;

export default function StatsScreen() {
  const { activities, loading } = useRecentActivities(50);

  const now = new Date();
  const totalKm = activities.reduce((sum, a) => sum + a.distanceKm, 0);
  const totalCount = activities.length;
  const longestRun = activities.reduce((max, a) => Math.max(max, a.distanceKm), 0);
  const monthKm = activities
    .filter((a) => {
      const d = new Date(a.startedAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, a) => sum + a.distanceKm, 0);

  const weekBuckets = weeklyBuckets(activities, now);
  const weekTotal = weekBuckets.reduce((sum, b) => sum + b.km, 0);
  const weekCount = activities.filter((a) => now.getTime() - new Date(a.startedAt).getTime() < 7 * DAY_MS).length;
  const streak = streakDays(activities, now);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>記録</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* ── ヒーロー: 週間バーチャート ── */}
          <View style={s.heroCard}>
            <View style={s.heroHead}>
              <Text style={TextStyles.sectionTitle}>今週</Text>
              <StreakChip days={streak} />
            </View>
            <WeeklyBarChart days={weekBuckets} height={88} />
            <Text style={s.heroSub}>
              合計 <Text style={s.heroSubBold}>{weekTotal.toFixed(1)}</Text>km ・{' '}
              <Text style={s.heroSubBold}>{weekCount}</Text>回
            </Text>
          </View>

          {/* ── 統計グリッド 2×2 ── */}
          <View style={s.grid}>
            <View style={s.cell}>
              <StatBlock label="距離" value={totalKm.toFixed(1)} unit="km" />
              <Text style={s.cellNote}>直近50件</Text>
            </View>
            <View style={s.cell}>
              <StatBlock label="最長ラン" value={longestRun.toFixed(1)} unit="km" valueColor={Colors.accent} />
            </View>
          </View>
          <View style={s.grid}>
            <View style={s.cell}>
              <StatBlock label="今月" value={monthKm.toFixed(1)} unit="km" />
            </View>
            <View style={s.cell}>
              <StatBlock label="連続日数" value={streak} unit="日" />
            </View>
          </View>

          {/* ── 履歴 ── */}
          <View style={s.historyHead}>
            <SectionHeader label="履歴" />
          </View>

          {activities.length === 0 ? (
            <EmptyState
              icon="walk-outline"
              title="まだラン履歴がありません"
              hint="「ラン」タブから記録を開始してください"
            />
          ) : (
            <View style={s.historyCard}>
              {activities.map((a) => (
                <ListRow
                  key={a.id}
                  icon={a.measurementType === 'steps' ? 'footsteps' : 'navigate'}
                  title={`${a.distanceKm.toFixed(2)}km・${formatTime(a.durationSeconds)}`}
                  subtitle={a.steps ? `${a.steps.toLocaleString()}歩` : undefined}
                  value={relativeDay(a.startedAt, now)}
                  onPress={() => router.push(`/activity/${a.id}` as any)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: Colors.textPrimary },
  scroll: { padding: 16, paddingBottom: 110, gap: 12 },

  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadow.sm,
  },
  heroHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  heroSub: { fontSize: 13, color: Colors.textSecondary, marginTop: Spacing.md, fontVariant: ['tabular-nums'] },
  heroSubBold: { fontWeight: '800', color: Colors.textPrimary },

  grid: { flexDirection: 'row', gap: 12 },
  cell: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadow.sm,
  },
  cellNote: { fontSize: 10, color: Colors.textTertiary, marginTop: 4 },

  historyHead: { marginTop: Spacing.sm },
  historyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    ...Shadow.sm,
  },
});
