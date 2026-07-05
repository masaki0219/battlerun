import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  collection, query, where, getDocs, orderBy, limit,
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import type { UserActivityStats, EarnedBadge, UserTitle } from '../types';
import { Colors, BorderRadius, TextStyles } from '../design_tokens';
import { ProgressBar } from '../components/ui/ProgressBar';

// ── バッジ定義 ─────────────────────────────────────────────────
interface BadgeDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  check: (s: UserActivityStats) => boolean;
  progress?: (s: UserActivityStats) => { current: number; target: number; unit: string };
}

const BADGE_DEFS: BadgeDef[] = [
  {
    id: 'first_run',
    name: '初陣ランナー',
    desc: '初めて記録した',
    icon: 'flag',
    color: Colors.primary,
    check: (s) => s.activityCount >= 1,
  },
  {
    id: 'early_bird',
    name: '朝活兵',
    desc: '朝7時前に記録した',
    icon: 'sunny',
    color: Colors.accentYellow,
    check: (s) => s.earlyMorningCount >= 1,
  },
  {
    id: 'streak_3',
    name: '3日連続出撃',
    desc: '3日連続で記録した',
    icon: 'flame',
    color: Colors.accent,
    check: (s) => s.consecutiveDays >= 3,
    progress: (s) => ({ current: Math.min(s.consecutiveDays, 3), target: 3, unit: '日' }),
  },
  {
    id: 'streak_7',
    name: '7日連続出撃',
    desc: '7日連続で記録した',
    icon: 'flash',
    color: Colors.pro,
    check: (s) => s.consecutiveDays >= 7,
    progress: (s) => ({ current: Math.min(s.consecutiveDays, 7), target: 7, unit: '日' }),
  },
  {
    id: 'monthly_10km',
    name: '月間10km',
    desc: '月に10km記録した',
    icon: 'medal',
    color: Colors.primary,
    check: (s) => s.monthlyDistanceKm >= 10,
    progress: (s) => ({ current: Math.min(s.monthlyDistanceKm, 10), target: 10, unit: 'km' }),
  },
  {
    id: 'monthly_30km',
    name: '月間30km',
    desc: '月に30km記録した',
    icon: 'trophy',
    color: Colors.accentYellow,
    check: (s) => s.monthlyDistanceKm >= 30,
    progress: (s) => ({ current: Math.min(s.monthlyDistanceKm, 30), target: 30, unit: 'km' }),
  },
  {
    id: 'step_master',
    name: '歩兵隊長',
    desc: '歩数モードで10回記録した',
    icon: 'footsteps',
    color: Colors.accent,
    check: (s) => s.stepsModeCount >= 10,
    progress: (s) => ({ current: Math.min(s.stepsModeCount, 10), target: 10, unit: '回' }),
  },
  {
    id: 'total_100km',
    name: '百里の旅人',
    desc: '累計100km記録した',
    icon: 'earth',
    color: Colors.accentYellow,
    check: (s) => s.totalDistanceKm >= 100,
    progress: (s) => ({ current: Math.min(s.totalDistanceKm, 100), target: 100, unit: 'km' }),
  },
];

export default function BadgesScreen() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<UserActivityStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // 既に獲得済みのバッジIDをFirestoreから取得
        const badgesSnap = await getDocs(
          collection(db, 'users', user.id, 'badges')
        );
        const persistedBadgeIds = new Set(badgesSnap.docs.map((d) => d.id));

        const q = query(
          collection(db, 'activities'),
          where('userId', '==', user.id),
          orderBy('startedAt', 'desc'),
          limit(200),
        );
        const snap = await getDocs(q);

        let totalKm = 0;
        let monthlyKm = 0;
        let stepsCount = 0;
        let earlyCount = 0;
        const dates = new Set<string>();

        snap.docs.forEach((d) => {
          const km = (d.data()['distanceKm'] as number) ?? 0;
          const mode = d.data()['measurementType'] as string;

          totalKm += km;
          if (mode === 'steps') stepsCount++;

          const startedAt = d.data()['startedAt'];
          let startMs: number;
          if (startedAt?.toMillis) {
            startMs = startedAt.toMillis();
          } else if (startedAt?.seconds) {
            startMs = startedAt.seconds * 1000;
          } else {
            startMs = new Date(startedAt as string).getTime();
          }

          const dt = new Date(startMs);
          dates.add(dt.toDateString());

          if (dt.getHours() < 7) earlyCount++;
          if (dt >= startOfMonth) monthlyKm += km;
        });

        // 連続日数計算
        const sortedDates = [...dates].map((d) => new Date(d).getTime()).sort((a, b) => b - a);
        let consecutive = 0;
        let prev = Date.now();
        for (const ts of sortedDates) {
          const diff = (prev - ts) / 86400000;
          if (diff <= 1.5) { consecutive++; prev = ts; }
          else break;
        }

        const computedStats: UserActivityStats = {
          totalDistanceKm: totalKm,
          activityCount: snap.size,
          monthlyDistanceKm: monthlyKm,
          consecutiveDays: consecutive,
          earlyMorningCount: earlyCount,
          stepsModeCount: stepsCount,
          earnedBadgeIds: [...persistedBadgeIds],
        };

        // 新たに条件達成したバッジをFirestoreに保存
        const newlyEarned = BADGE_DEFS.filter(
          (b) => !persistedBadgeIds.has(b.id) && b.check(computedStats)
        );
        if (newlyEarned.length > 0) {
          await Promise.all(
            newlyEarned.map((b) =>
              setDoc(
                doc(db, 'users', user.id, 'badges', b.id),
                { earnedAt: serverTimestamp(), name: b.name },
              )
            )
          );
          newlyEarned.forEach((b) => persistedBadgeIds.add(b.id));
          computedStats.earnedBadgeIds = [...persistedBadgeIds];
        }

        setStats(computedStats);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const earned = stats ? BADGE_DEFS.filter((b) => b.check(stats)) : [];
  const earnedIds = new Set(earned.map((b) => b.id));
  const unearned = BADGE_DEFS.filter((b) => !earnedIds.has(b.id));

  // 次に取れそうなバッジ（プログレスあり・未獲得）
  const upcoming = unearned.filter((b) => b.progress && stats).map((b) => ({
    badge: b,
    prog: b.progress!(stats!),
  }));

  const titles = (user?.titles ?? []).sort(
    (a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime()
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>バッジ・称号</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* 獲得済みバッジ */}
          <View style={s.section}>
            <Text style={TextStyles.sectionTitle}>{`獲得済みバッジ ${earned.length}/${BADGE_DEFS.length}`}</Text>
            {earned.length === 0 ? (
              <Text style={s.emptyText}>まだバッジがありません。走って獲得しよう！</Text>
            ) : (
              <View style={s.badgeGrid}>
                {earned.map((b) => (
                  <View key={b.id} style={s.badgeItem}>
                    <View style={[s.badgeIcon, { backgroundColor: `${b.color}22` }]}>
                      <Ionicons name={b.icon as any} size={28} color={b.color} />
                    </View>
                    <Text style={s.badgeName} numberOfLines={2}>{b.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 次に取れそうなバッジ */}
          {upcoming.length > 0 && (
            <View style={s.section}>
              <Text style={TextStyles.sectionTitle}>次に取れそうなバッジ</Text>
              {upcoming.map(({ badge, prog }) => {
                const pct = Math.min(prog.current / prog.target, 1);
                const left = (prog.target - prog.current).toFixed(1);
                return (
                  <View key={badge.id} style={s.upcomingCard}>
                    <View style={[s.upcomingIcon, { backgroundColor: `${badge.color}18` }]}>
                      <Ionicons name={badge.icon as any} size={22} color={badge.color} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={s.upcomingTop}>
                        <Text style={s.upcomingName}>{badge.name}</Text>
                        <Text style={[s.upcomingLeft, { color: badge.color }]}>
                          あと {left}{prog.unit}
                        </Text>
                      </View>
                      <ProgressBar value={pct} color={badge.color} trackColor={Colors.surfaceAlt} height={6} />
                      <Text style={s.upcomingDesc}>{badge.desc}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* 未獲得バッジ */}
          {unearned.length > 0 && (
            <View style={s.section}>
              <Text style={TextStyles.sectionTitle}>未獲得バッジ</Text>
              <View style={s.badgeGrid}>
                {unearned.map((b) => (
                  <View key={b.id} style={[s.badgeItem, s.badgeItemGray]}>
                    <View style={[s.badgeIcon, { backgroundColor: Colors.surfaceAlt }]}>
                      <Ionicons name={b.icon as any} size={28} color={Colors.textTertiary} />
                    </View>
                    <Text style={[s.badgeName, { color: Colors.textTertiary }]} numberOfLines={2}>{b.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 獲得称号 */}
          <View style={s.section}>
            <Text style={TextStyles.sectionTitle}>獲得称号一覧</Text>
            {titles.length === 0 ? (
              <Text style={s.emptyText}>まだ称号がありません。バトルで活躍しよう！</Text>
            ) : (
              <View style={{ gap: 8, marginTop: 8 }}>
                {titles.map((t, i) => (
                  <View key={i} style={s.titleCard}>
                    <View style={s.titleIconWrap}>
                      <Ionicons name="ribbon" size={20} color={Colors.accentYellow} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.titleBattleName} numberOfLines={1}>
                        {t.rank === 1 ? '👑 MVP' : t.rank === 2 ? '準MVP' : `TOP ${t.rank}`}
                        　{t.battleTitle}
                      </Text>
                      <Text style={s.titleMeta}>
                        {t.teamName} · {new Date(t.awardedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 48 },
  section: { paddingHorizontal: 16, marginTop: 20, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textTertiary, paddingVertical: 12, textAlign: 'center' },

  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeItem: {
    width: '22%',
    alignItems: 'center',
    gap: 6,
  },
  badgeItemGray: { opacity: 0.5 },
  badgeIcon: {
    width: 56, height: 56, borderRadius: BorderRadius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeName: {
    fontSize: 10, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', lineHeight: 13,
  },

  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  upcomingIcon: {
    width: 44, height: 44, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  upcomingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  upcomingName: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  upcomingLeft: { fontSize: 12, fontWeight: '700' },
  upcomingDesc: { fontSize: 11, color: Colors.textTertiary },

  titleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: `${Colors.accentYellow}12`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.accentYellow}40`,
  },
  titleIconWrap: {
    width: 36, height: 36, borderRadius: BorderRadius.sm,
    backgroundColor: `${Colors.accentYellow}30`,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  titleBattleName: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  titleMeta: { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },

});
