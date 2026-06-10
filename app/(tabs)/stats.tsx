import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';

const BR = {
  light:       '#F4F2EC',
  lightSurf2:  '#EDEAE2',
  lightLine:   'rgba(10,14,26,0.08)',
  dark:        '#0A0E1A',
  darkCard:    '#161D33',
  ink:         '#0A0E1A',
  ink2:        '#5A6477',
  ink3:        '#9AA4B5',
  primary:     '#00D9A3',
  primaryDeep: '#06B189',
  accent:      '#FF5C2B',
  gold:        '#FFC23C',
  silver:      '#C2CBD6',
  bronze:      '#CB7B3A',
  paper:       '#FFFFFF',
};

function Tac({ children, color = BR.ink3, size = 9 }: {
  children: string; color?: string; size?: number;
}) {
  return (
    <Text style={{
      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
      fontSize: size, fontWeight: '700',
      letterSpacing: size * 0.2, color,
      textTransform: 'uppercase',
    }}>{children}</Text>
  );
}

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
        <Tac color={BR.ink3} size={9}>BATTLERUN / 記録</Tac>
        <Text style={s.headerTitle}>記録</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={BR.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Summary cards ─────────────────────────────── */}
          <View style={s.summaryGrid}>
            <View style={[s.summaryCard, { backgroundColor: BR.dark }]}>
              <Tac color={BR.primary} size={8.5}>累計距離</Tac>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 6 }}>
                <Text style={s.summaryBigNum}>{totalKm.toFixed(1)}</Text>
                <Text style={s.summaryUnit}>KM</Text>
              </View>
              <Text style={s.summarySub}>{totalActivities} 回ラン</Text>
            </View>
            <View style={s.summaryCardLight}>
              <Tac color={BR.ink3} size={8.5}>今週</Tac>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 6 }}>
                <Text style={[s.summaryBigNum, { color: BR.primaryDeep }]}>{weekKm.toFixed(1)}</Text>
                <Text style={[s.summaryUnit, { color: BR.ink3 }]}>KM</Text>
              </View>
              <Text style={[s.summarySub, { color: BR.ink3 }]}>過去 7日間</Text>
            </View>
          </View>

          <View style={s.summaryGrid}>
            <View style={s.summaryCardLight}>
              <Tac color={BR.ink3} size={8.5}>最長ラン</Tac>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 6 }}>
                <Text style={[s.summaryBigNum, { color: BR.accent, fontSize: 32 }]}>
                  {longestRun.toFixed(1)}
                </Text>
                <Text style={[s.summaryUnit, { color: BR.ink3 }]}>KM</Text>
              </View>
              <Text style={[s.summarySub, { color: BR.ink3 }]}>自己ベスト</Text>
            </View>
            <View style={[s.summaryCardLight, { backgroundColor: `${BR.gold}1c`, borderColor: `${BR.gold}44` }]}>
              <Tac color={BR.gold} size={8.5}>称号</Tac>
              <Text style={{ fontSize: 32, marginTop: 6 }}>
                {totalKm >= 100 ? '🏆' : totalKm >= 50 ? '🥈' : totalKm >= 10 ? '🥉' : '🎖️'}
              </Text>
              <Text style={[s.summarySub, { color: BR.ink3, marginTop: 4 }]}>
                {totalKm >= 100 ? 'ベテラン' : totalKm >= 50 ? '上級ランナー' : totalKm >= 10 ? 'ランナー' : 'ビギナー'}
              </Text>
            </View>
          </View>

          {/* ── Activity history ──────────────────────────── */}
          <View style={s.sectionHeader}>
            <Tac color={BR.ink3} size={9}>ラン履歴</Tac>
          </View>

          {activities.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="walk-outline" size={36} color={BR.ink3} />
              <Text style={s.emptyText}>まだラン履歴がありません</Text>
              <Text style={s.emptyHint}>「ラン」タブから記録を開始してください</Text>
            </View>
          ) : (
            <View style={s.actList}>
              {activities.map((a) => {
                const rankColor =
                  a.distanceKm >= 10 ? BR.gold
                  : a.distanceKm >= 5 ? BR.silver
                  : BR.bronze;
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
  root: { flex: 1, backgroundColor: BR.light },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, gap: 4 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: BR.ink, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 110, gap: 10 },

  summaryGrid: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1, padding: 18, borderRadius: 18,
    shadowColor: BR.dark, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 6,
  },
  summaryCardLight: {
    flex: 1, padding: 18, borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: BR.lightLine,
    shadowColor: BR.ink, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  summaryBigNum: {
    fontSize: 38, fontWeight: '900', color: BR.paper,
    letterSpacing: -1.5, lineHeight: 40,
  },
  summaryUnit: { fontSize: 14, fontWeight: '700', color: BR.paper, opacity: 0.7 },
  summarySub: { fontSize: 11, color: BR.paper, opacity: 0.6, marginTop: 4 },

  sectionHeader: { paddingTop: 10, paddingBottom: 4 },

  emptyCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 32,
    alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: BR.lightLine,
  },
  emptyText: { fontSize: 14, fontWeight: '700', color: BR.ink2 },
  emptyHint: { fontSize: 12, color: BR.ink3, textAlign: 'center' },

  actList: { gap: 8 },
  actRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: BR.lightLine,
    shadowColor: BR.ink, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  actIcon: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  actDist: { fontSize: 20, fontWeight: '800', color: BR.ink, letterSpacing: -0.5 },
  actDistUnit: { fontSize: 12, color: BR.ink3, fontWeight: '600' },
  actMeta: { fontSize: 11, color: BR.ink3, marginTop: 2 },
  actAgo: { fontSize: 11, color: BR.ink3 },
});
