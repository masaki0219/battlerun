import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import type { CategoryStats } from '../../types';

const BR = {
  dark:        '#0A0E1A',
  darkCard:    '#161D33',
  darkPanel:   '#11172A',
  darkLine:    'rgba(255,255,255,0.08)',
  darkLine2:   'rgba(255,255,255,0.14)',
  light:       '#F4F2EC',
  lightSurf2:  '#EDEAE2',
  lightLine:   'rgba(10,14,26,0.08)',
  ink:         '#0A0E1A',
  ink2:        '#5A6477',
  ink3:        '#9AA4B5',
  primary:     '#00D9A3',
  primaryDeep: '#06B189',
  accent:      '#FF5C2B',
  gold:        '#FFC23C',
  paper:       '#FFFFFF',
  paper2:      'rgba(255,255,255,0.68)',
  paper3:      'rgba(255,255,255,0.40)',
};

function Tac({ children, color = BR.paper3, size = 9 }: {
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

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

interface BattleImpact {
  battleId: string;
  battleTitle: string;
  rankBefore: number;
  rankAfter: number;
  totalKm: number;
}

export default function RecordingSummaryScreen() {
  const params = useLocalSearchParams<{
    distanceKm: string;
    durationSeconds: string;
    steps: string;
    pace: string;
  }>();

  const distanceKm = parseFloat(params.distanceKm ?? '0');
  const durationSeconds = parseInt(params.durationSeconds ?? '0', 10);
  const steps = parseInt(params.steps ?? '0', 10);
  const pace = params.pace ?? "--'--\"";

  const { user } = useAuthStore();
  const { publicBattles, privateBattles, myMemberships } = useBattleStore();

  const [impacts, setImpacts] = useState<BattleImpact[]>([]);
  const [loadingImpact, setLoadingImpact] = useState(true);
  const [earnedBadge, setEarnedBadge] = useState<string | null>(null);

  // バトルへの影響を実データから計算
  useEffect(() => {
    if (!user || myMemberships.length === 0) {
      setLoadingImpact(false);
      return;
    }
    const allBattles = [...publicBattles, ...privateBattles];

    const load = async () => {
      setLoadingImpact(true);
      try {
        const results: BattleImpact[] = [];

        for (const mem of myMemberships) {
          const battle = allBattles.find((b) => b.id === mem.battleId);
          if (!battle || !mem.categoryId) continue;

          // category_stats を取得して現在の順位を確認
          const statsSnap = await getDocs(
            collection(db, 'battles', mem.battleId, 'category_stats')
          );
          const stats: CategoryStats[] = statsSnap.docs.map((d) => ({
            categoryId: d.id,
            label: battle.categories.find((c) => c.id === d.id)?.label ?? d.id,
            totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
            avgDistanceKm: (d.data()['avgDistanceKm'] as number) ?? 0,
            participantCount: (d.data()['participantCount'] as number) ?? 0,
          }));

          const sorted = [...stats].sort((a, b) =>
            battle.rankingType === 'total'
              ? b.totalDistanceKm - a.totalDistanceKm
              : b.avgDistanceKm - a.avgDistanceKm
          );
          const rankBefore = sorted.findIndex((s) => s.categoryId === mem.categoryId) + 1;
          const myTeam = sorted.find((s) => s.categoryId === mem.categoryId);

          if (!myTeam) continue;

          // Cloud Functionsによる集計はまだ反映されていないため、
          // この記録の距離をローカルで加算した「加算後」の状態をシミュレーションする
          const newTotalDistanceKm = myTeam.totalDistanceKm + distanceKm;
          const newAvgDistanceKm = newTotalDistanceKm / Math.max(myTeam.participantCount, 1);
          const simAfter = sorted.map((s) =>
            s.categoryId === mem.categoryId
              ? { ...s, totalDistanceKm: newTotalDistanceKm, avgDistanceKm: newAvgDistanceKm }
              : s
          ).sort((a, b) =>
            battle.rankingType === 'total'
              ? b.totalDistanceKm - a.totalDistanceKm
              : b.avgDistanceKm - a.avgDistanceKm
          );
          const rankAfter = simAfter.findIndex((s) => s.categoryId === mem.categoryId) + 1;

          results.push({
            battleId: battle.id,
            battleTitle: battle.title,
            rankBefore,
            rankAfter,
            totalKm: newTotalDistanceKm,
          });
        }
        setImpacts(results);

        // バッジ判定（陣営累計10km達成）
        if (user) {
          const partSnap = await getDoc(
            doc(db, 'battles', myMemberships[0]?.battleId ?? 'x', 'participants', user.id)
          ).catch(() => null);
          const myContrib = (partSnap?.data()?.['totalDistanceKm'] as number) ?? 0;
          if (myContrib < 10 && myContrib + distanceKm >= 10) {
            setEarnedBadge('陣営貢献者');
          }
        }
      } finally {
        setLoadingImpact(false);
      }
    };
    load();
  }, [user, myMemberships, publicBattles, privateBattles, distanceKm]);

  const primaryImpact = impacts[0] ?? null;
  const rankChanged = primaryImpact && primaryImpact.rankBefore !== primaryImpact.rankAfter;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero dark card ─────────────────────────────── */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <Tac color={BR.primary} size={9}>記録完了 / RUN COMPLETE</Tac>
            <TouchableOpacity onPress={() => router.replace('/(tabs)' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color={BR.paper3} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
            <Text style={s.heroBigNum}>{distanceKm.toFixed(1)}</Text>
            <Text style={s.heroUnit}>KM</Text>
          </View>

          <View style={s.heroStats}>
            <View style={s.heroStat}>
              <Tac color={BR.paper3} size={8.5}>時間</Tac>
              <Text style={s.heroStatVal}>{formatTime(durationSeconds)}</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Tac color={BR.paper3} size={8.5}>ペース</Tac>
              <Text style={s.heroStatVal}>{pace}<Text style={s.heroStatUnit}>/km</Text></Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Tac color={BR.paper3} size={8.5}>歩数</Tac>
              <Text style={s.heroStatVal}>{steps > 0 ? steps.toLocaleString() : '---'}</Text>
            </View>
          </View>
        </View>

        {/* ── Battle impact ─────────────────────────────── */}
        <View style={s.section}>
          <Tac color={BR.ink3} size={9}>RUN IMPACT / ランへの反映</Tac>
          {loadingImpact ? (
            <View style={[s.impactCard, { alignItems: 'center', paddingVertical: 24 }]}>
              <ActivityIndicator color={BR.primary} />
            </View>
          ) : primaryImpact ? (
            <View style={s.impactCard}>
              <View style={s.rankRise}>
                <View style={s.rankBefore}>
                  <Text style={s.rankBeforeLabel}>BEFORE</Text>
                  <View style={s.rankBox}>
                    <Text style={s.rankBoxNum}>{primaryImpact.rankBefore}</Text>
                  </View>
                </View>
                <View style={s.rankArrowWrap}>
                  <View style={s.rankArrowLine} />
                  {rankChanged && (
                    <View style={s.rankArrowBadge}>
                      <Text style={s.rankArrowText}>
                        {primaryImpact.rankBefore > primaryImpact.rankAfter
                          ? `+${primaryImpact.rankBefore - primaryImpact.rankAfter} 位`
                          : `${primaryImpact.rankAfter - primaryImpact.rankBefore} 位↓`}
                      </Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={14} color={BR.primaryDeep} />
                </View>
                <View style={s.rankAfter}>
                  <Text style={s.rankAfterLabel}>AFTER</Text>
                  <View style={[s.rankBoxAfter, !rankChanged && { backgroundColor: BR.ink2 }]}>
                    <Text style={s.rankBoxAfterNum}>{primaryImpact.rankAfter}</Text>
                  </View>
                </View>
              </View>

              <View style={s.impactBottom}>
                <View>
                  <Text style={s.impactBattleLabel}>{primaryImpact.battleTitle}</Text>
                  <Text style={s.impactTeamText}>
                    {rankChanged && primaryImpact.rankBefore > primaryImpact.rankAfter
                      ? <>陣営が{' '}<Text style={{ color: BR.primaryDeep, fontWeight: '900' }}>{primaryImpact.rankAfter}位</Text>{' '}に上昇！</>
                      : rankChanged
                      ? <>順位が変動しました</>
                      : <>陣営に距離を加算しました</>}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.impactAddLabel}>陣営加算</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={s.impactAddVal}>+{distanceKm.toFixed(1)}</Text>
                    <Text style={s.impactAddUnit}>KM</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={[s.impactCard, { alignItems: 'center', paddingVertical: 20 }]}>
              <Ionicons name="walk-outline" size={32} color={BR.ink3} />
              <Text style={{ color: BR.ink3, marginTop: 8, fontSize: 13 }}>バトル未参加</Text>
              <Text style={{ color: BR.ink3, fontSize: 11, marginTop: 2 }}>バトルに参加して記録を競おう</Text>
            </View>
          )}
        </View>

        {/* ── Badge unlocked ────────────────────────────── */}
        {earnedBadge && (
          <View style={s.section}>
            <View style={s.badgeCard}>
              <View style={s.badgeIcon}>
                <Ionicons name="shield" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Tac color={BR.gold} size={9}>バッジ獲得</Tac>
                <Text style={s.badgeTitle}>{earnedBadge}</Text>
                <Text style={s.badgeSub}>累計10km 陣営に貢献達成</Text>
              </View>
              <Text style={s.badgeNew}>NEW</Text>
            </View>
          </View>
        )}

        {/* ── CTA ───────────────────────────────────────── */}
        <View style={s.ctaSection}>
          <TouchableOpacity
            style={s.ctaBtn}
            onPress={() => {
              if (primaryImpact) {
                router.replace(`/battle/${primaryImpact.battleId}` as any);
              } else {
                router.replace('/(tabs)/battle' as any);
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={s.ctaBtnText}>チャレンジ詳細を見る</Text>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </TouchableOpacity>
          <Text style={s.ctaHint}>最近の記録に表示されました</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BR.light },
  scroll: { paddingBottom: 40 },

  heroCard: {
    margin: 16, marginTop: 8, padding: 22, borderRadius: 24,
    backgroundColor: BR.dark, overflow: 'hidden',
    shadowColor: BR.dark, shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18, shadowRadius: 32, elevation: 10,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBigNum: {
    fontSize: 80, fontWeight: '900', color: BR.paper,
    letterSpacing: -3, lineHeight: 80,
  },
  heroUnit: { fontSize: 28, fontWeight: '700', color: BR.paper3, letterSpacing: 1 },
  heroStats: {
    flexDirection: 'row', marginTop: 16, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: BR.darkLine2,
  },
  heroStat: { flex: 1, paddingHorizontal: 14, gap: 4 },
  heroStatVal: { fontSize: 17, fontWeight: '600', color: BR.paper, letterSpacing: -0.5 },
  heroStatUnit: { fontSize: 10, color: BR.paper3 },
  heroStatDivider: { width: 1, backgroundColor: BR.darkLine2 },

  section: { paddingHorizontal: 16, marginBottom: 4 },

  impactCard: {
    marginTop: 8, padding: 16, borderRadius: 18, backgroundColor: '#fff',
    shadowColor: BR.ink, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
  },
  rankRise: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rankBefore: { alignItems: 'center' },
  rankBeforeLabel: { fontSize: 9, color: BR.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  rankBox: {
    width: 54, height: 54, borderRadius: 14,
    backgroundColor: BR.lightSurf2,
    alignItems: 'center', justifyContent: 'center',
  },
  rankBoxNum: { fontSize: 32, fontWeight: '800', color: BR.ink2, lineHeight: 36 },
  rankArrowWrap: {
    flex: 1, alignItems: 'center', position: 'relative',
  },
  rankArrowLine: { height: 1, width: '100%', backgroundColor: BR.ink3 },
  rankArrowBadge: {
    position: 'absolute', top: -14,
    backgroundColor: BR.primary, borderRadius: 99,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  rankArrowText: { fontSize: 10, fontWeight: '900', color: BR.dark, letterSpacing: 0.5 },
  rankAfter: { alignItems: 'center' },
  rankAfterLabel: { fontSize: 9, color: BR.primaryDeep, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  rankBoxAfter: {
    width: 54, height: 54, borderRadius: 14,
    backgroundColor: BR.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: BR.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  rankBoxAfterNum: { fontSize: 32, fontWeight: '800', color: '#fff', lineHeight: 36 },
  impactBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: BR.lightLine, borderStyle: 'dashed' as const,
  },
  impactBattleLabel: { fontSize: 11, color: BR.ink3, fontWeight: '700', letterSpacing: 1 },
  impactTeamText: { fontSize: 14, fontWeight: '800', color: BR.ink, marginTop: 2 },
  impactAddLabel: { fontSize: 10, color: BR.ink3, fontWeight: '700', letterSpacing: 1 },
  impactAddVal: { fontSize: 24, color: BR.accent, fontWeight: '800', lineHeight: 28 },
  impactAddUnit: { fontSize: 11, color: BR.ink3 },

  badgeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 16,
    backgroundColor: `${BR.gold}1c`,
    borderWidth: 1.5, borderColor: `${BR.gold}66`,
  },
  badgeIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: BR.gold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: BR.gold, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  badgeTitle: { fontSize: 15, fontWeight: '900', color: BR.ink, marginTop: 1 },
  badgeSub: { fontSize: 11, color: BR.ink3, marginTop: 1 },
  badgeNew: { fontSize: 11, color: BR.gold, fontWeight: '800' },

  ctaSection: { paddingHorizontal: 16, marginTop: 16, gap: 10 },
  ctaBtn: {
    backgroundColor: BR.dark, borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: BR.dark, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 6,
  },
  ctaBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  ctaHint: { textAlign: 'center', fontSize: 11, color: BR.ink3, fontWeight: '600' },

});
