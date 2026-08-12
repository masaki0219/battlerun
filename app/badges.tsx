import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  collection, query, where, getDocs, orderBy, limit,
  doc, getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Ionicons } from '@expo/vector-icons';
import { db, functions } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import type { UserActivityStats, EarnedBadge, UserTitle } from '../types';
import { Colors, BorderRadius, TextStyles } from '../design_tokens';
import { ProgressBar } from '../components/ui/ProgressBar';
import { teamTitleLabel } from '../lib/teamTitle';
import { useTranslation } from '../lib/i18n';

// ── バッジ定義 ─────────────────────────────────────────────────
interface BadgeDef {
  id: string;
  icon: string;
  color: string;
  check: (s: UserActivityStats) => boolean;
  progress?: (s: UserActivityStats) => { current: number; target: number; unit: 'days' | 'times' | 'km' };
}

const BADGE_DEFS: BadgeDef[] = [
  {
    id: 'first_run',
    icon: 'flag',
    color: Colors.primary,
    check: (s) => s.activityCount >= 1,
  },
  {
    id: 'early_bird',
    icon: 'sunny',
    color: Colors.goldText,
    check: (s) => s.earlyMorningCount >= 1,
  },
  {
    id: 'streak_3',
    icon: 'flame',
    color: Colors.accentText,
    check: (s) => s.consecutiveDays >= 3,
    progress: (s) => ({ current: Math.min(s.consecutiveDays, 3), target: 3, unit: 'days' }),
  },
  {
    id: 'streak_7',
    icon: 'flash',
    color: Colors.primaryDark,
    check: (s) => s.consecutiveDays >= 7,
    progress: (s) => ({ current: Math.min(s.consecutiveDays, 7), target: 7, unit: 'days' }),
  },
  {
    id: 'monthly_10km',
    icon: 'medal',
    color: Colors.primary,
    check: (s) => s.monthlyDistanceKm >= 10,
    progress: (s) => ({ current: Math.min(s.monthlyDistanceKm, 10), target: 10, unit: 'km' }),
  },
  {
    id: 'monthly_30km',
    icon: 'trophy',
    color: Colors.goldText,
    check: (s) => s.monthlyDistanceKm >= 30,
    progress: (s) => ({ current: Math.min(s.monthlyDistanceKm, 30), target: 30, unit: 'km' }),
  },
  {
    id: 'step_master',
    icon: 'footsteps',
    color: Colors.accentText,
    check: (s) => s.stepsModeCount >= 10,
    progress: (s) => ({ current: Math.min(s.stepsModeCount, 10), target: 10, unit: 'times' }),
  },
  {
    id: 'total_100km',
    icon: 'earth',
    color: Colors.goldText,
    check: (s) => s.totalDistanceKm >= 100,
    progress: (s) => ({ current: Math.min(s.totalDistanceKm, 100), target: 100, unit: 'km' }),
  },
];

export default function BadgesScreen() {
  const { language, t } = useTranslation();
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

        // 判定・付与はサーバーで行い、クライアントは結果を読むだけにする。
        await httpsCallable(functions, 'syncMyBadges')({}).catch(() => null);
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

        setStats(computedStats);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const earnedIdsFromServer = new Set(stats?.earnedBadgeIds ?? []);
  const earned = stats ? BADGE_DEFS.filter((b) => earnedIdsFromServer.has(b.id)) : [];
  const earnedIds = new Set(earned.map((b) => b.id));
  const unearned = BADGE_DEFS.filter((b) => !earnedIds.has(b.id));

  // 次に取れそうなバッジ（プログレスあり・未獲得）
  const upcoming = unearned.filter((b) => b.progress && stats).map((b) => ({
    badge: b,
    prog: b.progress!(stats!),
  }));
  const upcomingIds = new Set(upcoming.map(({ badge }) => badge.id));
  const remainingUnearned = unearned.filter((badge) => !upcomingIds.has(badge.id));

  const titles = [...(user?.titles ?? [])].sort(
    (a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime()
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{t('badges.title')}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* 獲得済みバッジ */}
          <View style={s.section}>
            <Text style={TextStyles.sectionTitle}>{t('badges.earned', { earned: earned.length, total: BADGE_DEFS.length })}</Text>
            {earned.length === 0 ? (
              <Text style={s.emptyText}>{t('badges.noBadges')}</Text>
            ) : (
              <View style={s.badgeGrid}>
                {earned.map((b) => (
                  <View key={b.id} style={s.badgeItem}>
                    <View style={[s.badgeIcon, { backgroundColor: `${b.color}22` }]}>
                      <Ionicons name={b.icon as any} size={28} color={b.color} />
                    </View>
                    <Text style={s.badgeName} numberOfLines={2}>{t(`badges.defs.${b.id}.name`)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 次に取れそうなバッジ */}
          {upcoming.length > 0 && (
            <View style={s.section}>
              <Text style={TextStyles.sectionTitle}>{t('badges.upcoming')}</Text>
              {upcoming.map(({ badge, prog }) => {
                const pct = Math.min(prog.current / prog.target, 1);
                // 日・回は小数にならないよう切り上げ整数で表示（「あと0.0日」「あと9.0回」を防ぐ）。
                // kmのみ0.1km単位の小数を維持する。
                const leftRaw = prog.target - prog.current;
                const left = prog.unit === 'km' ? leftRaw.toFixed(1) : String(Math.ceil(leftRaw));
                return (
                  <View key={badge.id} style={s.upcomingCard}>
                    <View style={[s.upcomingIcon, { backgroundColor: `${badge.color}18` }]}>
                      <Ionicons name={badge.icon as any} size={22} color={badge.color} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={s.upcomingTop}>
                        <Text style={s.upcomingName}>{t(`badges.defs.${badge.id}.name`)}</Text>
                        <Text style={[s.upcomingLeft, { color: badge.color }]}>
                          {t('badges.remaining', { value: left, unit: t(`badges.unit${prog.unit === 'days' ? 'Days' : prog.unit === 'times' ? 'Times' : 'Km'}`) })}
                        </Text>
                      </View>
                      <ProgressBar value={pct} color={badge.color} trackColor={Colors.surfaceGray} height={6} />
                      <Text style={s.upcomingDesc}>{t(`badges.defs.${badge.id}.desc`)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* 未獲得バッジ */}
          {remainingUnearned.length > 0 && (
            <View style={s.section}>
              <Text style={TextStyles.sectionTitle}>{t('badges.unearned')}</Text>
              <View style={s.badgeGrid}>
                {remainingUnearned.map((b) => (
                  <View key={b.id} style={[s.badgeItem, s.badgeItemGray]}>
                    <View style={[s.badgeIcon, { backgroundColor: Colors.surfaceGray }]}>
                      <Ionicons name={b.icon as any} size={28} color={Colors.textTertiary} />
                    </View>
                    <Text style={[s.badgeName, { color: Colors.textTertiary }]} numberOfLines={2}>{t(`badges.defs.${b.id}.name`)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 獲得称号 */}
          <View style={s.section}>
            <Text style={TextStyles.sectionTitle}>{t('badges.earnedTitles')}</Text>
            {titles.length === 0 ? (
              <Text style={s.emptyText}>{t('badges.noTitles')}</Text>
            ) : (
              <View style={{ gap: 8, marginTop: 8 }}>
                {titles.map((t, i) => (
                  <View key={i} style={s.titleCard}>
                    <View style={s.titleIconWrap}>
                      <Ionicons name="ribbon" size={20} color={Colors.goldText} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.titleBattleName} numberOfLines={1}>
                        {t.rank === 1 ? '👑 ' : ''}{teamTitleLabel(t.rank, language)}
                        　{t.battleTitle}
                      </Text>
                      <Text style={s.titleMeta}>
                        {t.teamName} · {new Date(t.awardedAt).toLocaleDateString(language === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'short' })}
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
  emptyText: { fontSize: 13, color: Colors.textSecondary, paddingVertical: 12, textAlign: 'center' },

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
  upcomingDesc: { fontSize: 11, color: Colors.textSecondary },

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
  titleMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

});
