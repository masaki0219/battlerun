import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { onSnapshot, collection, getDocs, orderBy, limit, doc, getDoc, query, where, Timestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import { Colors, Spacing, Shadow } from '../../design_tokens';
import { getThemeTokens } from '../../lib/battleTheme';
import type { CategoryStats, BattleTheme, Battle, Category } from '../../types';

// ─── team colour palette ───────────────────────────────────────
const TEAM_COLORS = ['#3A86FF', '#FF4757', '#FFC23C', '#9B5CFF', '#00D9A3', '#FF6B35'];
const GOLD   = '#FFB800';
const SILVER = '#9CA3AF';
const BRONZE = '#CD7F32';

function teamColor(i: number) { return TEAM_COLORS[i % TEAM_COLORS.length]; }
function rankColor(rank: number) {
  return rank === 1 ? GOLD : rank === 2 ? SILVER : rank === 3 ? BRONZE : Colors.textTertiary;
}

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

// ─── small shared atoms ────────────────────────────────────────
function MonoLabel({ children, color = Colors.textTertiary, size = 9 }: {
  children: string; color?: string; size?: number;
}) {
  return (
    <Text style={{
      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
      fontSize: size,
      fontWeight: '700',
      letterSpacing: 2,
      color,
      textTransform: 'uppercase',
    }}>{children}</Text>
  );
}

// ─── activity feed item type (simplified) ─────────────────────
interface RecentActivity {
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
  const [theme, setTheme] = useState<BattleTheme>('sports');
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
      setTheme((data['theme'] as BattleTheme) ?? 'sports');
      setFetchedBattle({
        id: snap.id,
        type: (data['type'] as 'public' | 'private') ?? 'public',
        seasonId: (data['seasonId'] as string | null) ?? null,
        title: (data['title'] as string) ?? '',
        description: (data['description'] as string) ?? '',
        mode: (data['mode'] as 'team' | 'individual') ?? 'team',
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

  // ── テーマ取得（store から battle が見つかった場合のみ）──
  useEffect(() => {
    if (!id || !battleFromStore) return;
    getDoc(doc(db, 'battles', id)).then((snap) => {
      if (snap.exists()) setTheme((snap.data()['theme'] as BattleTheme) ?? 'sports');
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
      where('battleId', '==', id),
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
            userId: data['userId'] as string,
            displayName: (data['displayName'] as string | undefined) ?? 'メンバー',
            distanceKm: (data['distanceKm'] as number) ?? 0,
            ago,
            isMe: (data['userId'] as string) === user.id,
          };
        });
        setRecentActivities(items);
      })
      .catch(() => { /* activities may not have battleId index yet */ });
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
  const tk = getThemeTokens(theme);

  const rankType = battle.rankingType ?? 'total';
  const sorted = [...stats].sort((a, b) =>
    rankType === 'total'
      ? b.totalDistanceKm - a.totalDistanceKm
      : b.avgDistanceKm - a.avgDistanceKm
  );
  const myStatIdx = sorted.findIndex((s) => s.categoryId === myCatId);
  const myTeam = myStatIdx >= 0 ? sorted[myStatIdx] : null;
  const myRank = myStatIdx >= 0 ? myStatIdx + 1 : null;

  const is2Team = sorted.length === 2;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* ── Nav bar ─────────────────────────────────────── */}
      <View style={s.navBar}>
        <TouchableOpacity
          style={s.navBack}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
          <MonoLabel color={Colors.textTertiary} size={9}>{`${tk.battleLabel} / ACTIVE`}</MonoLabel>
        </TouchableOpacity>
        <View style={s.navActions}>
          <TouchableOpacity style={s.navBtn} onPress={() => router.push(`/battle/result/${id}` as any)}>
            <Text style={s.navBtnText}>RESULT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.navBtn} onPress={() => router.push(`/battle/theme?id=${id}` as any)}>
            <Text style={s.navBtnText}>THEME</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Title block ──────────────────────────────────── */}
      <View style={s.titleBlock}>
        {battle.inviteCode && (
          <MonoLabel color={Colors.primary} size={9}>{`招待コード: ${battle.inviteCode}`}</MonoLabel>
        )}
        <Text style={s.battleTitle}>{battle.title}</Text>
      </View>

      {/* ── Countdown ────────────────────────────────────── */}
      <View style={s.countdownWrap}>
        <View style={[s.countdown, {
          backgroundColor: `${tk.accent}10`,
          borderColor: `${tk.accent}35`,
        }]}>
          <View style={[s.countdownDot, { backgroundColor: tk.accent }]} />
          <MonoLabel color={tk.accent} size={9}>残り時間</MonoLabel>
          <View style={{ flex: 1 }} />
          <Text style={s.countdownNum}>
            {d}
            <Text style={s.countdownUnit}>D </Text>
            {pad(h)}
            <Text style={s.countdownUnit}>H </Text>
            {pad(m)}
            <Text style={s.countdownUnit}>M</Text>
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={tk.primary} style={{ marginTop: 40 }} />
        ) : is2Team && sorted.length === 2 ? (
          <TwoTeamBlock
            left={sorted[0]}
            right={sorted[1]}
            myCatId={myCatId}
            themeTokens={tk}
            rankType={rankType}
          />
        ) : (
          <MultiTeamBlock
            teams={sorted}
            myCatId={myCatId}
            rankType={rankType}
            myTeam={myTeam}
            myRank={myRank}
            myContrib={user ? undefined : undefined}
            themeTokens={tk}
          />
        )}

        {/* ── Member contribution ranking ──────────────────── */}
        <View style={s.sectionCard}>
          <MonoLabel color={Colors.textTertiary} size={9}>陣営内 貢献ランキング</MonoLabel>
          <View style={{ height: 10 }} />
          {sorted.map((cat, i) => {
            const isMe = cat.categoryId === myCatId;
            const rc = rankColor(i + 1);
            return (
              <View key={cat.categoryId} style={[s.memberRow, isMe && s.memberRowMe]}>
                <View style={[s.memberRank, {
                  backgroundColor: i < 3 ? rc : Colors.surfaceGray,
                }]}>
                  <Text style={[s.memberRankText, {
                    color: i < 3 ? (i === 0 ? '#1A1A2E' : '#fff') : Colors.textTertiary,
                  }]}>{i + 1}</Text>
                </View>
                <Text style={[s.memberName, isMe && { color: Colors.primary, fontWeight: '700' }]} numberOfLines={1}>
                  {cat.label}{isMe ? ' （あなた）' : ''}
                </Text>
                <Text style={[s.memberKm, isMe && { color: Colors.primary }]}>
                  {rankType === 'total'
                    ? cat.totalDistanceKm.toFixed(1)
                    : cat.avgDistanceKm.toFixed(1)}
                  <Text style={s.memberKmUnit}> KM</Text>
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── Recent activity ──────────────────────────────── */}
        {recentActivities.length > 0 && (
          <View style={s.sectionCard}>
            <MonoLabel color={Colors.textTertiary} size={9}>最近の活動</MonoLabel>
            <View style={{ height: 10 }} />
            {recentActivities.map((a, i) => (
              <View key={i} style={[
                s.actRow,
                i < recentActivities.length - 1 && s.actRowBorder,
              ]}>
                <View style={[s.actAvatar, a.isMe && s.actAvatarMe]}>
                  <Ionicons name="walk-outline" size={16} color={a.isMe ? Colors.primary : Colors.textTertiary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.actName, a.isMe && { color: Colors.primary }]}>
                    {a.displayName}
                  </Text>
                  <Text style={s.actMeta}>{a.distanceKm.toFixed(1)}km走った · {a.ago}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// 2-TEAM VS BLOCK
// ═══════════════════════════════════════════════════════════════
function TwoTeamBlock({
  left, right, myCatId, rankType, themeTokens,
}: {
  left: CategoryStats;
  right: CategoryStats;
  myCatId: string | null;
  rankType: 'average' | 'total';
  themeTokens?: import('../../lib/battleTheme').ThemeTokens;
}) {
  const tk = themeTokens ?? { primary: '#00D9A3', accent: '#FF5C2B' } as any;
  function val(s: CategoryStats) {
    return rankType === 'total' ? s.totalDistanceKm : s.avgDistanceKm;
  }
  const lv = val(left);
  const rv = val(right);
  const total = lv + rv || 1;
  const lRatio = lv / total;
  const lWin = lv >= rv;
  const isLeftMine = left.categoryId === myCatId;
  const isRightMine = right.categoryId === myCatId;
  const myTeam = isLeftMine ? left : isRightMine ? right : null;
  const foeTeam = isLeftMine ? right : isRightMine ? left : null;
  const winning = myTeam && foeTeam ? val(myTeam) >= val(foeTeam) : false;
  const diff = myTeam && foeTeam ? Math.abs(val(myTeam) - val(foeTeam)).toFixed(1) : '0.0';

  const leftColor  = teamColor(0);
  const rightColor = teamColor(1);

  return (
    <View style={t2.block}>
      {/* team name row */}
      <View style={t2.teamsRow}>
        {/* left team */}
        <View style={t2.teamSide}>
          <MonoLabel color={leftColor} size={8}>{isLeftMine ? 'MY TEAM' : 'TEAM'}</MonoLabel>
          <Text style={t2.teamName}>{left.label}</Text>
          <Text style={[t2.teamKm, lWin && { color: Colors.primary }]}>
            {lv.toFixed(1)}
            <Text style={t2.kmUnit}> KM</Text>
          </Text>
          {isLeftMine && (
            <Text style={t2.contrib}>
              {left.participantCount}名 参加中
            </Text>
          )}
        </View>

        {/* VS badge */}
        <View style={t2.vsBadge}>
          <Text style={t2.vsText}>VS</Text>
        </View>

        {/* right team */}
        <View style={[t2.teamSide, t2.teamRight]}>
          <MonoLabel color={rightColor} size={8}>{isRightMine ? 'MY TEAM' : 'TEAM'}</MonoLabel>
          <Text style={[t2.teamName, { textAlign: 'right' }]}>{right.label}</Text>
          <Text style={[t2.teamKm, { textAlign: 'right' }, !lWin && { color: Colors.accent }]}>
            {rv.toFixed(1)}
            <Text style={t2.kmUnit}> KM</Text>
          </Text>
          {isRightMine && (
            <Text style={[t2.contrib, { textAlign: 'right' }]}>
              {right.participantCount}名 参加中
            </Text>
          )}
        </View>
      </View>

      {/* gauge bar */}
      <View style={t2.gaugeWrap}>
        <View style={t2.gauge}>
          <View style={[t2.gaugeFill, {
            width: `${lRatio * 100}%`,
            backgroundColor: leftColor,
          }]} />
          <View style={[t2.gaugeFoe, {
            width: `${(1 - lRatio) * 100}%`,
            backgroundColor: rightColor,
          }]} />
          <View style={t2.gaugeMid} />
        </View>
      </View>

      {/* NEXT MOVE callout */}
      {myTeam && foeTeam && (
        <View style={[t2.nextMove, {
          backgroundColor: winning ? `${tk.primary}12` : `${tk.accent}12`,
          borderColor: winning ? `${tk.primary}40` : `${tk.accent}40`,
        }]}>
          <Text style={t2.nextEmoji}>{winning ? '🔥' : '⚡'}</Text>
          <View style={{ flex: 1 }}>
            <MonoLabel color={winning ? tk.primary : tk.accent} size={8}>NEXT MOVE</MonoLabel>
            <Text style={t2.nextText}>
              {winning
                ? `リードを守れ！ 差は ${diff}km`
                : `あと ${diff}km で逆転`}
            </Text>
          </View>
          <TouchableOpacity style={[t2.deployBtn, { backgroundColor: tk.accent }]} onPress={() => router.push('/(tabs)/record' as any)}>
            <Text style={t2.deployText}>ラン</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const t2 = StyleSheet.create({
  block: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    ...Shadow.sm,
  },
  teamsRow: { flexDirection: 'row', alignItems: 'stretch' },
  teamSide: { flex: 1, padding: 16, borderRightWidth: 1, borderRightColor: Colors.border },
  teamRight: { borderRightWidth: 0, borderLeftWidth: 1, borderLeftColor: Colors.border },
  teamName: { fontSize: 13, fontWeight: '900', color: Colors.textPrimary, marginTop: 4 },
  teamKm: { fontSize: 32, fontWeight: '700', color: Colors.textPrimary, lineHeight: 38, marginTop: 6, letterSpacing: -1 },
  kmUnit: { fontSize: 11, color: Colors.textTertiary, letterSpacing: 0 },
  contrib: { fontSize: 11, color: Colors.textTertiary, marginTop: 3 },
  vsBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    flexShrink: 0,
  },
  vsText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.accent,
    letterSpacing: 1,
    backgroundColor: `${Colors.accent}15`,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 99,
  },
  gaugeWrap: { paddingHorizontal: 14, paddingBottom: 6 },
  gauge: {
    position: 'relative',
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.surfaceGray,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  gaugeFill: { height: 16, borderRadius: 0 },
  gaugeFoe: { height: 16, borderRadius: 0 },
  gaugeMid: {
    position: 'absolute',
    left: '50%' as any,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: Colors.background,
  },
  nextMove: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  nextEmoji: { fontSize: 18 },
  nextText: { fontSize: 13, fontWeight: '900', color: Colors.textPrimary, marginTop: 3 },
  deployBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  deployText: { fontSize: 12, fontWeight: '900', color: '#fff' },
});

// ═══════════════════════════════════════════════════════════════
// MULTI-TEAM BLOCK
// ═══════════════════════════════════════════════════════════════
function MultiTeamBlock({
  teams, myCatId, rankType, myTeam, myRank, themeTokens,
}: {
  teams: CategoryStats[];
  myCatId: string | null;
  rankType: 'average' | 'total';
  myTeam: CategoryStats | null;
  myRank: number | null;
  myContrib?: number;
  themeTokens?: import('../../lib/battleTheme').ThemeTokens;
}) {
  const tk = themeTokens ?? { primary: '#00D9A3', accent: '#FF5C2B', primaryDeep: '#06B189' } as any;
  const maxVal = Math.max(
    ...teams.map((t) => rankType === 'total' ? t.totalDistanceKm : t.avgDistanceKm),
    0.01,
  );

  function val(s: CategoryStats) {
    return rankType === 'total' ? s.totalDistanceKm : s.avgDistanceKm;
  }

  const myIdx = teams.findIndex((t) => t.categoryId === myCatId);
  const above = myIdx > 0 ? teams[myIdx - 1] : null;
  const below = myIdx >= 0 && myIdx < teams.length - 1 ? teams[myIdx + 1] : null;
  const toOvertake = above ? (val(above) - val(teams[myIdx])).toFixed(1) : null;
  const chased = below ? (val(teams[myIdx]) - val(below)).toFixed(1) : null;

  return (
    <View>
      {/* My status pill */}
      {myTeam && myRank !== null && (
        <View style={mt.myPill}>
          <View style={[mt.myRankBox, { backgroundColor: `${teamColor(myRank - 1)}22`, borderColor: teamColor(myRank - 1) }]}>
            <Text style={[mt.myRankNum, { color: teamColor(myRank - 1) }]}>{myRank}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={mt.myTeamLabel}>あなたの陣営</Text>
            <Text style={mt.myTeamName}>{myTeam.label}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={mt.myContribLabel}>参加人数</Text>
            <Text style={mt.myContribVal}>{myTeam.participantCount}<Text style={mt.myContribUnit}>名</Text></Text>
          </View>
        </View>
      )}

      {/* Bar chart */}
      <View style={mt.chartBlock}>
        <View style={mt.chartHeader}>
          <MonoLabel color={Colors.textTertiary} size={9}>陣営ランキング</MonoLabel>
          {teams.length > 5 && <MonoLabel color={Colors.textTertiary} size={8}>スクロールで全件</MonoLabel>}
        </View>

        <ScrollView style={{ maxHeight: teams.length > 5 ? 280 : undefined }} scrollEnabled={teams.length > 5} nestedScrollEnabled>
          {teams.map((team, i) => {
            const isUs = team.categoryId === myCatId;
            const ratio = val(team) / maxVal;
            const rc = rankColor(i + 1);
            const tc = teamColor(i);
            const showGap = i === myIdx - 1 && toOvertake;

            return (
              <React.Fragment key={team.categoryId}>
                <View style={[mt.barRow, isUs && {
                  backgroundColor: `${tc}0D`,
                  borderLeftWidth: 3,
                  borderLeftColor: tc,
                }]}>
                  <View style={mt.barMeta}>
                    <View style={[mt.rankDot, {
                      backgroundColor: i < 3 ? rc : Colors.surfaceGray,
                    }]}>
                      <Text style={[mt.rankDotText, {
                        color: i < 3 ? (i === 0 ? '#1A1A2E' : '#fff') : Colors.textTertiary,
                      }]}>{i + 1}</Text>
                    </View>
                    <Text style={[mt.barName, isUs && { color: tc, fontWeight: '900' }]} numberOfLines={1}>
                      {team.label}{isUs && <Text style={[mt.youLabel, { color: Colors.textTertiary }]}> （あなた）</Text>}
                    </Text>
                    <Text style={[mt.barKm, isUs && { color: tc }]}>
                      {val(team).toFixed(1)}<Text style={mt.barKmUnit}> KM</Text>
                    </Text>
                  </View>
                  <View style={mt.track}>
                    <View style={[mt.fill, {
                      width: `${ratio * 100}%`,
                      backgroundColor: isUs ? tc : `${tc}55`,
                    }]} />
                  </View>
                </View>

                {showGap && (
                  <View style={[mt.gapBadge, {
                    backgroundColor: `${tk.accent}14`,
                    borderColor: `${tk.accent}50`,
                  }]}>
                    <Text style={mt.gapEmoji}>⚡</Text>
                    <Text style={[mt.gapText, { color: tk.accent }]}>あと {toOvertake}km で {above!.label} を逆転</Text>
                  </View>
                )}
              </React.Fragment>
            );
          })}

          {chased && myIdx >= 0 && (
            <View style={mt.chasedBadge}>
              <Text style={mt.chasedEmoji}>⚠️</Text>
              <Text style={mt.chasedText}>
                {teams[myIdx + 1].label} が {chased}km 差まで追い上げ中
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const mt = StyleSheet.create({
  myPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  myRankBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myRankNum: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  myTeamLabel: { fontSize: 11, color: Colors.textTertiary },
  myTeamName: { fontSize: 14, fontWeight: '900', color: Colors.textPrimary, marginTop: 1 },
  myContribLabel: { fontSize: 10, color: Colors.textTertiary },
  myContribVal: { fontSize: 20, color: Colors.primary, fontWeight: '700', lineHeight: 24 },
  myContribUnit: { fontSize: 10, color: Colors.textTertiary },

  chartBlock: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    ...Shadow.sm,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  barRow: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  barMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  rankDot: {
    width: 18,
    height: 18,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rankDotText: { fontSize: 10, fontWeight: '700' },
  barName: { flex: 1, fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  youLabel: { fontWeight: '400', fontSize: 10 },
  barKm: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary, letterSpacing: -0.5 },
  barKmUnit: { fontSize: 9, fontWeight: '400', color: Colors.textTertiary, letterSpacing: 0 },
  track: {
    height: 6,
    borderRadius: 4,
    backgroundColor: Colors.surfaceGray,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },

  gapBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 2,
    padding: 6,
    borderRadius: 6,
    backgroundColor: `${Colors.accent}14`,
    borderWidth: 1,
    borderColor: `${Colors.accent}50`,
    borderStyle: 'dashed',
  },
  gapEmoji: { fontSize: 12 },
  gapText: { fontSize: 11, color: Colors.accent, fontWeight: '700' },
  chasedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    margin: 10,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FFF9EC',
    borderWidth: 1,
    borderColor: `${Colors.warning}40`,
    borderStyle: 'dashed',
  },
  chasedEmoji: { fontSize: 12 },
  chasedText: { fontSize: 11, color: Colors.warning, fontWeight: '700' },
});

// ═══════════════════════════════════════════════════════════════
// SCREEN-LEVEL STYLES
// ═══════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  navBack: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navActions: { flexDirection: 'row', gap: 6 },
  navBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
  },
  navBtnText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 9,
    letterSpacing: 2,
    color: Colors.textSecondary,
  },

  titleBlock: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md, gap: 4 },
  battleTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: 0.2,
    marginTop: 4,
  },

  countdownWrap: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${Colors.accent}10`,
    borderWidth: 1,
    borderColor: `${Colors.accent}35`,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  countdownDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  countdownNum: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  countdownUnit: { fontSize: 10, color: Colors.textSecondary },

  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 100,
  },

  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: Spacing.lg,
    ...Shadow.sm,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 4,
    borderRadius: 8,
  },
  memberRowMe: {
    backgroundColor: `${Colors.primary}12`,
    borderWidth: 1,
    borderColor: `${Colors.primary}35`,
  },
  memberRank: {
    width: 22,
    height: 22,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  memberRankText: { fontSize: 12, fontWeight: '700' },
  memberName: { flex: 1, fontSize: 12, color: Colors.textPrimary, fontWeight: '500' },
  memberKm: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary, letterSpacing: -0.5 },
  memberKmUnit: { fontSize: 9, fontWeight: '400', color: Colors.textTertiary },

  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  actRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  actAvatar: {
    width: 32,
    height: 32,
    borderRadius: 99,
    backgroundColor: Colors.surfaceGray,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actAvatarMe: {
    backgroundColor: `${Colors.primary}22`,
    borderColor: Colors.primary,
  },
  actName: { fontSize: 12, color: Colors.textPrimary, fontWeight: '700' },
  actMeta: { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
});
