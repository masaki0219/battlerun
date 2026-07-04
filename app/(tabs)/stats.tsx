import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { Colors, DarkColors, Spacing, BorderRadius, Shadow } from '../../design_tokens';
import { MonoLabel } from '../../components/ui/MonoLabel';
import { EmptyState } from '../../components/ui/EmptyState';

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function agoLabel(ts: number) {
  if (!ts) return '日時不明';
  const diff = Math.floor((Date.now() - ts) / 60000);
  if (diff < 60) return `${diff}分前`;
  if (diff < 1440) return `${Math.floor(diff / 60)}時間前`;
  return `${Math.floor(diff / 1440)}日前`;
}

interface ActivityRecord {
  id: string;
  distanceKm: number;
  durationSeconds: number;
  steps: number;
  startedAt: number;
  measurementType: string;
}

export default function StatsScreen() {
  const { user } = useAuthStore();
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalKm, setTotalKm] = useState(0);
  const [totalActivities, setTotalActivities] = useState(0);
  const [longestRun, setLongestRun] = useState(0);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'activities'),
      where('userId', '==', user.id),
      orderBy('startedAt', 'desc'),
      limit(50),
    );
    getDocs(q)
      .then((snap) => {
        let km = 0; let longest = 0;
        const items: ActivityRecord[] = snap.docs.map((d) => {
          const data = d.data();
          const dist = (data['distanceKm'] as number) ?? 0;
          km += dist;
          if (dist > longest) longest = dist;
          const ts: number =
            data['startedAt']?.toMillis?.() ??
            (data['startedAt']?.seconds ? data['startedAt'].seconds * 1000 : 0);
          return {
            id: d.id,
            distanceKm: dist,
            durationSeconds: (data['durationSeconds'] as number) ?? 0,
            steps: (data['steps'] as number) ?? 0,
            startedAt: ts,
            measurementType: (data['measurementType'] as string) ?? 'gps',
          };
        });
        setActivities(items.slice(0, 20));
        setTotalKm(km);
        setTotalActivities(snap.size);
        setLongestRun(longest);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const weekKm = activities
    .filter((a) => Date.now() - a.startedAt < 7 * 86400000)
    .reduce((sum, a) => sum + a.distanceKm, 0);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <MonoLabel color={Colors.textTertiary} size={10}>BATTLERUN / 記録</MonoLabel>
        <Text style={s.headerTitle}>記録</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Summary cards ─────────────────────────────── */}
          <View style={s.summaryGrid}>
            <View style={[s.summaryCard, { backgroundColor: DarkColors.background }]}>
              <MonoLabel color={Colors.primaryBright} size={9}>累計距離</MonoLabel>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 6 }}>
                <Text style={s.summaryBigNum}>{totalKm.toFixed(1)}</Text>
                <Text style={s.summaryUnit}>KM</Text>
              </View>
              <Text style={s.summarySub}>{totalActivities} 回ラン</Text>
            </View>
            <View style={s.summaryCardLight}>
              <MonoLabel color={Colors.textTertiary} size={9}>今週</MonoLabel>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 6 }}>
                <Text style={[s.summaryBigNum, { color: Colors.primaryDark }]}>{weekKm.toFixed(1)}</Text>
                <Text style={[s.summaryUnit, { color: Colors.textTertiary }]}>KM</Text>
              </View>
              <Text style={[s.summarySub, { color: Colors.textTertiary }]}>過去 7日間</Text>
            </View>
          </View>

          <View style={s.summaryGrid}>
            <View style={s.summaryCardLight}>
              <MonoLabel color={Colors.textTertiary} size={9}>最長ラン</MonoLabel>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 6 }}>
                <Text style={[s.summaryBigNum, { color: Colors.accent, fontSize: 32 }]}>
                  {longestRun.toFixed(1)}
                </Text>
                <Text style={[s.summaryUnit, { color: Colors.textTertiary }]}>KM</Text>
              </View>
              <Text style={[s.summarySub, { color: Colors.textTertiary }]}>自己ベスト</Text>
            </View>
            <View style={[s.summaryCardLight, { backgroundColor: `${Colors.accentYellow}1c`, borderColor: `${Colors.accentYellow}44` }]}>
              <MonoLabel color={Colors.accentYellow} size={9}>称号</MonoLabel>
              <Text style={{ fontSize: 32, marginTop: 6 }}>
                {totalKm >= 100 ? '🏆' : totalKm >= 50 ? '🥈' : totalKm >= 10 ? '🥉' : '🎖️'}
              </Text>
              <Text style={[s.summarySub, { color: Colors.textTertiary, marginTop: 4 }]}>
                {totalKm >= 100 ? 'ベテラン' : totalKm >= 50 ? '上級ランナー' : totalKm >= 10 ? 'ランナー' : 'ビギナー'}
              </Text>
            </View>
          </View>

          {/* ── Activity history ──────────────────────────── */}
          <View style={s.sectionHeader}>
            <MonoLabel color={Colors.textTertiary} size={10}>ラン履歴</MonoLabel>
          </View>

          {activities.length === 0 ? (
            <EmptyState
              icon="walk-outline"
              title="まだラン履歴がありません"
              hint="「ラン」タブから記録を開始してください"
            />
          ) : (
            <View style={s.actList}>
              {activities.map((a) => {
                const rankColor =
                  a.distanceKm >= 10 ? Colors.accentYellow
                  : a.distanceKm >= 5 ? Colors.rank2
                  : Colors.rank3;
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={s.actRow}
                    onPress={() => router.push(`/activity/${a.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.actIcon, { backgroundColor: `${rankColor}22` }]}>
                      <Ionicons
                        name={a.measurementType === 'steps' ? 'footsteps-outline' : 'navigate-outline'}
                        size={18}
                        color={rankColor}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                        <Text style={s.actDist}>{a.distanceKm.toFixed(2)}</Text>
                        <Text style={s.actDistUnit}>km</Text>
                      </View>
                      <Text style={s.actMeta}>
                        {formatTime(a.durationSeconds)}
                        {a.steps > 0 ? `  ·  ${a.steps.toLocaleString()} 歩` : ''}
                      </Text>
                    </View>
                    <Text style={s.actAgo}>{agoLabel(a.startedAt)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, gap: 4 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: Colors.textPrimary, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 110, gap: 10 },

  summaryGrid: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1, padding: 18, borderRadius: BorderRadius.lg,
    shadowColor: DarkColors.background, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 6,
  },
  summaryCardLight: {
    flex: 1, padding: 18, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  summaryBigNum: {
    fontSize: 38, fontWeight: '900', color: DarkColors.textPrimary,
    letterSpacing: -1.5, lineHeight: 40, fontVariant: ['tabular-nums'],
  },
  summaryUnit: { fontSize: 14, fontWeight: '700', color: DarkColors.textPrimary, opacity: 0.7 },
  summarySub: { fontSize: 11, color: DarkColors.textPrimary, opacity: 0.6, marginTop: 4 },

  sectionHeader: { paddingTop: 10, paddingBottom: 4 },

  actList: { gap: 8 },
  actRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  actIcon: {
    width: 42, height: 42, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  actDist: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  actDistUnit: { fontSize: 12, color: Colors.textTertiary, fontWeight: '600' },
  actMeta: { fontSize: 11, color: Colors.textTertiary, marginTop: 2, fontVariant: ['tabular-nums'] },
  actAgo: { fontSize: 11, color: Colors.textTertiary },
});
