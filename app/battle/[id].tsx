import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { onSnapshot, collection, getDocs, orderBy, limit, doc, getDoc, query, where, Timestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import { Colors, DarkColors, Spacing, Shadow, BorderRadius, TextStyles } from '../../design_tokens';
import { MonoLabel } from '../../components/ui/MonoLabel';
import { StatBlock } from '../../components/ui/StatBlock';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { ListRow } from '../../components/ui/ListRow';
import { EmptyState } from '../../components/ui/EmptyState';
import { VersusGauge } from '../../components/viz/VersusGauge';
import { dailyPaceToOvertake } from '../../utils/displayStats';
import type { CategoryStats, Battle, Category } from '../../types';

// ─── countdown helpers ─────────────────────────────────────────
function timeLeft(endAt: string): { d: number; h: number; m: number } {
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return { d: 0, h: 0, m: 0 };
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return { d, h, m };
}
function pad(n: number) { return String(n).padStart(2, '0'); }

// ─── activity feed item type (simplified) ─────────────────────
interface RecentActivity {
  id: string;
  userId: string;
  displayName: string;
  distanceKm: number;
  ago: string;
  isMe: boolean;
}

export default function BattleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { publicBattles, privateBattles, myMemberships } = useBattleStore();

  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedBattle, setFetchedBattle] = useState<Battle | null>(null);

  const battleFromStore = [...publicBattles, ...privateBattles].find((b) => b.id === id);
  const battle = battleFromStore ?? fetchedBattle;
  const membership = myMemberships.find((m) => m.battleId === id);
  const myCatId = membership?.categoryId ?? null;

  // ── store に存在しない場合の fallback fetch ────────────────
  useEffect(() => {
    if (!id || battleFromStore) return;
    getDoc(doc(db, 'battles', id)).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setFetchedBattle({
        id: snap.id,
        type: (data['type'] as 'public' | 'private') ?? 'public',
        seasonId: (data['seasonId'] as string | null) ?? null,
        title: (data['title'] as string) ?? '',
        description: (data['description'] as string) ?? '',
        categories: (data['categories'] as Category[]) ?? [],
        rankingType: (data['rankingType'] as 'average' | 'total') ?? 'average',
        startAt: (data['startAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
        endAt: (data['endAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
        status: (data['status'] as 'upcoming' | 'active' | 'finished') ?? 'active',
        createdBy: (data['createdBy'] as string | null) ?? null,
        inviteCode: (data['inviteCode'] as string | null) ?? null,
      });
    }).catch(() => {});
  }, [id, battleFromStore]);

  // ── real-time category_stats subscription ──────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const colRef = collection(db, 'battles', id, 'category_stats');
    const unsub = onSnapshot(colRef, (snap) => {
      const s: CategoryStats[] = snap.docs.map((d) => ({
        categoryId: d.id,
        label: battle?.categories.find((c) => c.id === d.id)?.label ?? d.id,
        totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
        avgDistanceKm: (d.data()['avgDistanceKm'] as number) ?? 0,
        participantCount: (d.data()['participantCount'] as number) ?? 0,
      }));
      setStats(s);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [id, battle]);

  // ── recent activities for this battle (best-effort) ────────
  useEffect(() => {
    if (!id || !user) return;
    const q = query(
      collection(db, 'activities'),
      where('battleIds', 'array-contains', id),
      orderBy('startedAt', 'desc'),
      limit(10),
    );
    getDocs(q)
      .then((snap) => {
        const now = Date.now();
        const items: RecentActivity[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const startedRaw = data['startedAt'] as any;
          const startedMs: number =
            startedRaw?.toMillis?.() ??
            (startedRaw?.seconds ? (startedRaw.seconds as number) * 1000 : now);
          const diffMin = Math.floor((now - startedMs) / 60000);
          const ago = diffMin < 60
            ? `${diffMin}分前`
            : diffMin < 1440
            ? `${Math.floor(diffMin / 60)}時間前`
            : `${Math.floor(diffMin / 1440)}日前`;
          return {
            id: d.id,
            userId: data['userId'] as string,
            displayName: (data['displayName'] as string | undefined) ?? 'メンバー',
            distanceKm: (data['distanceKm'] as number) ?? 0,
            ago,
            isMe: (data['userId'] as string) === user.id,
          };
        });
        setRecentActivities(items);
      })
      .catch(() => { /* activities may not have battleIds index yet */ });
  }, [id, user]);

  if (!battle) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.navBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {loading
            ? <ActivityIndicator color={Colors.primary} />
            : <Text style={{ color: Colors.textSecondary }}>チャレンジが見つかりませんでした</Text>
          }
        </View>
      </SafeAreaView>
    );
  }

  const { d, h, m } = timeLeft(battle.endAt);
  const rankType = battle.rankingType ?? 'total';
  const val = (st: CategoryStats) => (rankType === 'total' ? st.totalDistanceKm : st.avgDistanceKm);

  const sorted = [...stats].sort((a, b) => val(b) - val(a));
  const myStatIdx = sorted.findIndex((st) => st.categoryId === myCatId);
  const myTeam = myStatIdx >= 0 ? sorted[myStatIdx] : null;
  const myRank = myStatIdx >= 0 ? myStatIdx + 1 : null;

  // 対向ゲージ: 自陣営 vs 直上（自分が1位なら2位）。未参加なら上位2陣営
  const rival = myStatIdx > 0 ? sorted[myStatIdx - 1] : myStatIdx === 0 ? sorted[1] : undefined;
  const gaugeLeft = myTeam ?? sorted[0];
  const gaugeRight = myTeam ? rival : sorted[1];
  const leading = myStatIdx === 0;
  const pace = myTeam && rival
    ? dailyPaceToOvertake({
        myTeamKm: val(myTeam),
        rivalTeamKm: val(rival),
        endAt: battle.endAt,
        isLeading: leading,
      })
    : null;
  const bothZero = gaugeLeft && gaugeRight && val(gaugeLeft) <= 0 && val(gaugeRight) <= 0;
  const maxVal = Math.max(...sorted.map(val), 0.01);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* ── Nav bar ─────────────────────────────────────── */}
      <View style={s.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.navActions}>
          <TouchableOpacity
            style={s.navIconBtn}
            onPress={() => router.push(`/battle/result/${id}` as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="podium-outline" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.navIconBtn}
            onPress={() => router.push(`/battle/theme?id=${id}` as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="color-palette-outline" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Dark hero (勝負どころ) ──────────────────────── */}
        <View style={s.hero}>
          {battle.inviteCode ? (
            <MonoLabel color={DarkColors.primary} size={9}>{`招待コード ${battle.inviteCode}`}</MonoLabel>
          ) : (
            <MonoLabel color={DarkColors.textTertiary} size={9}>BATTLE / ACTIVE</MonoLabel>
          )}
          <Text style={s.heroTitle}>{battle.title}</Text>

          {/* countdown 3連 */}
          <View style={s.countRow}>
            <StatBlock dark align="center" label="日" value={d} />
            <View style={s.countDivider} />
            <StatBlock dark align="center" label="時" value={pad(h)} />
            <View style={s.countDivider} />
            <StatBlock dark align="center" label="分" value={pad(m)} />
          </View>

          {gaugeLeft && gaugeRight ? (
            <View style={s.heroGauge}>
              <VersusGauge
                left={{ label: gaugeLeft.label, km: val(gaugeLeft), isMine: !!myTeam }}
                right={{ label: gaugeRight.label, km: val(gaugeRight), isMine: false }}
                size="lg"
                dark
              />
            </View>
          ) : null}

          {pace && !bothZero && (
            <View style={s.heroPace}>
              <Ionicons name="flash" size={14} color={DarkColors.accent} />
              <Text style={s.heroPaceText}>
                1日 {pace.kmPerDay.toFixed(1)}km 走れば{leading ? '逃げ切り' : '逆転'}
              </Text>
            </View>
          )}
        </View>

        {/* ── 陣営ランキング（全件） ──────────────────────── */}
        <View style={s.sectionCard}>
          <Text style={[TextStyles.sectionTitle, { marginBottom: Spacing.md }]}>陣営ランキング</Text>
          {loading && sorted.length === 0 ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
          ) : sorted.length === 0 ? (
            <EmptyState icon="flag-outline" title="まだ記録がありません" hint="最初のランで陣営に貢献しよう" />
          ) : (
            sorted.map((cat, i) => {
              const isMine = cat.categoryId === myCatId;
              const barColor = isMine ? Colors.primary : Colors.teamColors[Math.min(i, Colors.teamColors.length - 1)];
              return (
                <View key={cat.categoryId} style={s.rankRow}>
                  <Text style={[s.rankNum, isMine && s.rankNumMine]}>{i + 1}</Text>
                  <View style={s.rankMain}>
                    <View style={s.rankNameRow}>
                      <Text style={[s.rankName, isMine && s.rankNameMine]} numberOfLines={1}>
                        {cat.label}{isMine ? ' （あなた）' : ''}
                      </Text>
                      <Text style={[s.rankValue, isMine && s.rankValueMine]}>{val(cat).toFixed(1)}km</Text>
                    </View>
                    <ProgressBar value={val(cat) / maxVal} color={barColor} height={8} />
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── 最近の活動 ──────────────────────────────────── */}
        {recentActivities.length > 0 && (
          <View style={s.sectionCard}>
            <Text style={[TextStyles.sectionTitle, { marginBottom: Spacing.sm }]}>最近の活動</Text>
            {recentActivities.map((a) => (
              <ListRow
                key={a.id}
                icon="walk"
                iconColor={a.isMe ? Colors.primary : Colors.textTertiary}
                iconBg={a.isMe ? Colors.primaryLight : Colors.surfaceGray}
                title={a.displayName}
                subtitle={`${a.distanceKm.toFixed(1)}km走った · ${a.ago}`}
                titleColor={a.isMe ? Colors.primary : undefined}
                onPress={() => router.push(`/activity/${a.id}` as any)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  navActions: { flexDirection: 'row', gap: Spacing.md },
  navIconBtn: { padding: 2 },

  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 100,
    gap: Spacing.lg,
  },

  // Dark hero
  hero: {
    backgroundColor: DarkColors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: DarkColors.line,
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: DarkColors.textPrimary,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: DarkColors.surfaceAlt,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  countDivider: { width: 1, alignSelf: 'stretch', backgroundColor: DarkColors.line, marginVertical: 6 },
  heroGauge: { marginTop: 2 },
  heroPace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: `${DarkColors.accent}1F`,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
  },
  heroPaceText: { fontSize: 13, fontWeight: '800', color: DarkColors.accent, fontVariant: ['tabular-nums'] },

  // Light ranking / sections
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadow.sm,
  },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  rankNum: { width: 18, fontSize: 13, fontWeight: '700', color: Colors.textTertiary, textAlign: 'center', fontVariant: ['tabular-nums'] },
  rankNumMine: { color: Colors.primary },
  rankMain: { flex: 1, gap: 4 },
  rankNameRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  rankName: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  rankNameMine: { fontWeight: '800', color: Colors.primary },
  rankValue: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, fontVariant: ['tabular-nums'], marginLeft: Spacing.sm },
  rankValueMine: { color: Colors.textPrimary },
});
