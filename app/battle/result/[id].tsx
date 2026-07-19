import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { collection, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { db } from '../../../lib/firebase';
import { useAuthStore } from '../../../stores/authStore';
import { useBattleStore } from '../../../stores/battleStore';
import { isPro } from '../../../lib/pro';
import type { Battle, CategoryStats } from '../../../types';
import { Colors, DarkColors, Spacing, BorderRadius } from '../../../design_tokens';
import { MonoLabel } from '../../../components/ui/MonoLabel';
import { RankBadge } from '../../../components/ui/RankBadge';
import { VersusGauge } from '../../../components/viz/VersusGauge';
import { ProgressRing } from '../../../components/viz/ProgressRing';
import { contributionShare } from '../../../utils/displayStats';
import { useBattleParticipants } from '../../../hooks/useBattleParticipants';

function mapFirestoreToBattle(id: string, data: Record<string, unknown>): Battle {
  return {
    id,
    type: (data['type'] as 'public' | 'private') ?? 'public',
    seasonId: (data['seasonId'] as string | null) ?? null,
    title: (data['title'] as string) ?? '',
    description: (data['description'] as string) ?? '',
    categories: (data['categories'] as Battle['categories']) ?? [],
    rankingType: (data['rankingType'] as 'average' | 'total') ?? 'total',
    startAt: (data['startAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
    endAt: (data['endAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
    status: (data['status'] as Battle['status']) ?? 'finished',
    createdBy: (data['createdBy'] as string | null) ?? null,
    inviteCode: (data['inviteCode'] as string | null) ?? null,
  };
}

export default function BattleResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, proEntitlement } = useAuthStore();
  const { publicBattles, privateBattles, myMemberships } = useBattleStore();
  const userIsPro = isPro(user?.plan, proEntitlement);

  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [myStats, setMyStats] = useState<{ totalKm: number; actCount: number | null }>({ totalKm: 0, actCount: null });
  const [loading, setLoading] = useState(true);
  const [localBattle, setLocalBattle] = useState<Battle | null>(
    () => [...publicBattles, ...privateBattles].find((b) => b.id === id) ?? null
  );
  const shareCardRef = useRef<View>(null);

  // 参加者ランキング（貢献 TOP）。battle/[id] の個人戦表示と共用の read-only フック
  const { participants } = useBattleParticipants(id, { enabled: !!localBattle, limit: 20 });

  const membership = myMemberships.find((m) => m.battleId === id);
  const myCatId = membership?.categoryId ?? null;

  // ストアにない場合Firestoreから直接取得
  useEffect(() => {
    const fromStore = [...publicBattles, ...privateBattles].find((b) => b.id === id);
    if (fromStore) {
      setLocalBattle(fromStore);
      return;
    }
    if (!id) return;
    getDoc(doc(db, 'battles', id)).then((snap) => {
      if (snap.exists()) {
        setLocalBattle(mapFirestoreToBattle(snap.id, snap.data() as Record<string, unknown>));
      }
    }).catch(() => {});
  }, [id, publicBattles, privateBattles]);

  useEffect(() => {
    if (!id || !localBattle) return;
    const load = async () => {
      setLoading(true);
      try {
        // category_stats
        const statsSnap = await getDocs(collection(db, 'battles', id, 'category_stats'));
        const s: CategoryStats[] = statsSnap.docs.map((d) => ({
          categoryId: d.id,
          label: localBattle.categories.find((c) => c.id === d.id)?.label ?? d.id,
          totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
          avgDistanceKm: (d.data()['avgDistanceKm'] as number) ?? 0,
          participantCount: (d.data()['participantCount'] as number) ?? 0,
        }));
        setStats(s);

        // participants（貢献ランキング）は useBattleParticipants フックで取得する

        // my stats
        if (user) {
          const meSnap = await getDoc(doc(db, 'battles', id, 'participants', user.id));
          if (meSnap.exists()) {
            const km = (meSnap.data()['totalDistanceKm'] as number) ?? 0;
            const actCount = (meSnap.data()['activityCount'] as number | undefined) ?? null;
            setMyStats({ totalKm: km, actCount });
          }
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, localBattle, user]);

  if (!localBattle) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (localBattle.status !== 'finished') {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.nav}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="戻る">
            <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <MonoLabel color={Colors.textTertiary} size={9}>チャレンジ結果</MonoLabel>
          <View style={{ width: 28 }} />
        </View>
        <View style={s.center}>
          <Ionicons name="time-outline" size={40} color={Colors.textTertiary} />
          <Text style={{ color: Colors.textPrimary, fontSize: 17, fontWeight: '800' }}>まだ開催中です</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>終了後に最終結果を確認できます</Text>
        </View>
      </SafeAreaView>
    );
  }

  const rankType = localBattle.rankingType ?? 'total';
  const sorted = [...stats].sort((a, b) =>
    (rankType === 'total' ? b.totalDistanceKm - a.totalDistanceKm : b.avgDistanceKm - a.avgDistanceKm)
      || a.categoryId.localeCompare(b.categoryId)
  );
  const allZero = sorted.every((item) => (rankType === 'total' ? item.totalDistanceKm : item.avgDistanceKm) <= 0);
  const valOf = (st: CategoryStats) => (rankType === 'total' ? st.totalDistanceKm : st.avgDistanceKm);
  const myTeamIdx = sorted.findIndex((s) => s.categoryId === myCatId);
  const myTeam = myTeamIdx >= 0 ? sorted[myTeamIdx] : null;
  const myRank = myTeam && !allZero
    ? 1 + sorted.filter((item) => valOf(item) > valOf(myTeam)).length
    : null;

  // 最終 VS ゲージ用（自陣営 vs 直上、未参加なら上位2陣営）
  const rival = myTeamIdx > 0 ? sorted[myTeamIdx - 1] : myTeamIdx === 0 ? sorted[1] : undefined;
  const gaugeLeft = myTeam ?? sorted[0];
  const gaugeRight = myTeam ? rival : sorted[1];
  const myShare = myTeam ? contributionShare(myStats.totalKm, myTeam.totalDistanceKm) : 0;

  const startDate = new Date(localBattle.startAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  const endDate = new Date(localBattle.endAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });

  function rankMedal(rank: number) {
    if (rank === 1) return { emoji: '🥇', color: Colors.accentYellow, label: '優勝！', bg: `${Colors.accentYellow}18` };
    if (rank === 2) return { emoji: '🥈', color: Colors.rank2, label: '準優勝', bg: `${Colors.rank2}28` };
    if (rank === 3) return { emoji: '🥉', color: Colors.rank3, label: '3位入賞', bg: `${Colors.rank3}18` };
    return { emoji: '🏃', color: Colors.textSecondary, label: `${rank}位`, bg: `${Colors.surfaceAlt}` };
  }

  const medal = myRank ? rankMedal(myRank) : null;

  async function handleShare() {
    const rankText = myRank ? `${myRank}位` : '参加';
    const kmText = myStats.totalKm.toFixed(1);
    const message = `「${localBattle?.title ?? 'チャレンジ'}」で${rankText}！\n自分の貢献: ${kmText}km\n#ZELIO で走ろう`;

    try {
      if (shareCardRef.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.92 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '結果をシェア' });
        return;
      }
    } catch (e) {
      console.warn('[BattleResult] image share failed, falling back to text share:', e);
    }

    try {
      await Share.share({ message });
    } catch {}
  }

  // 称号（優勝/準優勝陣営の一員）はサーバー（battleStatusScheduler）が付与したuser.titlesを正とする。
  // 結果画面を開いたクライアントでは計算しない。
  const myTitle = user?.titles?.find((t) => t.battleId === localBattle.id) ?? null;
  const titleName = myTitle ? (myTitle.rank === 1 ? '優勝陣営の一員' : '準優勝陣営の一員') : null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Nav */}
      <View style={s.nav}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="戻る">
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <MonoLabel color={Colors.textTertiary} size={9}>チャレンジ結果</MonoLabel>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── 最終 VS ゲージ（ダーク演出） ── */}
        {!loading && gaugeLeft && gaugeRight && (
          <View style={s.finalVs}>
            <MonoLabel color={DarkColors.textTertiary} size={9}>最終結果 / FINAL</MonoLabel>
            <View style={{ marginTop: 12 }}>
              <VersusGauge
                left={{ label: gaugeLeft.label, km: valOf(gaugeLeft), isMine: !!myTeam }}
                right={{ label: gaugeRight.label, km: valOf(gaugeRight), isMine: false }}
                size="lg"
                dark
                unit={rankType === 'average' ? 'km/人' : 'km'}
              />
            </View>
          </View>
        )}

        {/* ── Hero ── */}
        <View style={s.heroCard}>
          <MonoLabel color={Colors.textTertiary} size={9}>RESULT / チャレンジ終了</MonoLabel>
          <Text style={s.heroTitle}>{localBattle.title}</Text>
          <Text style={s.heroDates}>{startDate} 〜 {endDate}</Text>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
          ) : medal ? (
            <View style={[s.medalBlock, { backgroundColor: medal.bg }]}>
              <Text style={s.medalEmoji}>{medal.emoji}</Text>
              <Text style={[s.medalLabel, { color: medal.color }]}>{medal.label}</Text>
              {myTeam && (
                <Text style={s.medalTeamName}>{myTeam.label}</Text>
              )}
            </View>
          ) : (
            <View style={s.medalBlock}>
              <Text style={s.medalEmoji}>🏃</Text>
              <Text style={s.medalLabel}>お疲れさまでした！</Text>
            </View>
          )}
        </View>

        {/* ── 称号発表 ── */}
        {titleName && (
          <View style={s.section}>
            <MonoLabel color={Colors.textTertiary} size={9}>称号獲得 / TITLE EARNED</MonoLabel>
            <View style={s.titleCard}>
              <View style={s.titleIconWrap}>
                <Ionicons name="ribbon" size={28} color={Colors.accentYellow} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.titleName}>{titleName}</Text>
                <Text style={s.titleDesc}>
                  {myTitle?.teamName ? `「${myTitle.teamName}」として走った仲間に贈られる称号` : '陣営として勝ち取った称号'}
                </Text>
              </View>
              <View style={s.titleNewChip}><Text style={s.titleNew}>NEW</Text></View>
            </View>
          </View>
        )}

        {/* ── 個人成績 ── */}
        <View style={s.section}>
          <MonoLabel color={Colors.textTertiary} size={9}>個人成績 / MY STATS</MonoLabel>
          <View style={s.statsCard}>
            {myTeam && (
              <View style={s.contribRow}>
                <ProgressRing progress={myShare} size={64} strokeWidth={8}>
                  <Text style={s.contribPct}>{Math.round(myShare * 100)}%</Text>
                </ProgressRing>
                <Text style={s.contribText}>
                  あなたは陣営の{'\n'}<Text style={s.contribBold}>{Math.round(myShare * 100)}%</Text> を走った
                </Text>
              </View>
            )}
            <View style={s.statRow}>
              <View style={s.statItem}>
                <MonoLabel color={Colors.textTertiary} size={8}>貢献距離</MonoLabel>
                <Text style={s.statVal}>{myStats.totalKm.toFixed(1)}<Text style={s.statUnit}> km</Text></Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <MonoLabel color={Colors.textTertiary} size={8}>記録回数</MonoLabel>
                <Text style={s.statVal}>{myStats.actCount ?? '—'}<Text style={s.statUnit}> 回</Text></Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <MonoLabel color={Colors.textTertiary} size={8}>陣営内順位</MonoLabel>
                <Text style={s.statVal}>{myRank ?? '—'}<Text style={s.statUnit}> 位</Text></Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 陣営ランキング ── */}
        {sorted.length > 0 && (
          <View style={s.section}>
            <MonoLabel color={Colors.textTertiary} size={9}>最終ランキング / FINAL RANKING</MonoLabel>
            <View style={s.rankCard}>
              {sorted.map((cat, i) => {
                const isMe = cat.categoryId === myCatId;
                const val = rankType === 'total' ? cat.totalDistanceKm : cat.avgDistanceKm;
                const displayRank = allZero ? null : 1 + sorted.filter((item) => valOf(item) > val).length;
                return (
                  <View key={cat.categoryId} style={[s.rankRow, isMe && s.rankRowMe, i > 0 && s.rankRowBorder]}>
                    {displayRank ? <RankBadge rank={displayRank} /> : <Text style={s.rankKm}>—</Text>}
                    <Text style={[s.rankName, isMe && { color: Colors.primary, fontWeight: '900' }]} numberOfLines={1}>
                      {cat.label}{isMe ? ' （あなた）' : ''}
                    </Text>
                    <Text style={[s.rankKm, isMe && { color: Colors.primary }]}>
                      {val.toFixed(1)}<Text style={s.rankKmUnit}>{rankType === 'average' ? ' km/人' : ' km'}</Text>
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── 個人貢献ランキング (上位5名) ── */}
        {participants.length > 0 && (
          <View style={s.section}>
            <MonoLabel color={Colors.textTertiary} size={9}>個人貢献ランキング / TOP RUNNERS</MonoLabel>
            <View style={s.rankCard}>
              {participants.slice(0, 5).map((p, i) => {
                const isMe = p.userId === user?.id;
                const participantRank = p.totalDistanceKm > 0
                  ? 1 + participants.filter((item) => item.totalDistanceKm > p.totalDistanceKm).length
                  : null;
                return (
                  <View key={p.userId} style={[s.rankRow, isMe && s.rankRowMe, i > 0 && s.rankRowBorder]}>
                    {participantRank ? <RankBadge rank={participantRank} /> : <Text style={s.rankKm}>—</Text>}
                    <Text style={[s.rankName, isMe && { color: Colors.primary, fontWeight: '900' }]} numberOfLines={1}>
                      {p.displayName}{isMe ? ' （あなた）' : ''}
                    </Text>
                    <Text style={[s.rankKm, isMe && { color: Colors.primary }]}>
                      {p.totalDistanceKm.toFixed(1)}<Text style={s.rankKmUnit}> km</Text>
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── 共有 ── */}
        <View style={s.section}>
          <MonoLabel color={Colors.textTertiary} size={9}>結果をシェア / SHARE RESULT</MonoLabel>
          <View ref={shareCardRef} collapsable={false} style={s.sharePreview}>
            <View style={s.sharePreviewContent}>
              <Text style={s.sharePreviewTitle}>{localBattle.title}</Text>
              <Text style={s.sharePreviewRank}>
                {myRank ? `${myRank}位` : '参加'} · {myStats.totalKm.toFixed(1)}km
              </Text>
              {myTeam?.label ? (
                <Text style={s.sharePreviewTeam}>{myTeam.label}</Text>
              ) : null}
              <Text style={s.sharePreviewTag}>#ZELIO</Text>
            </View>
            {!userIsPro && (
              <View style={s.watermarkBadge}>
                <Text style={s.watermarkText}>ZELIO</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={18} color={Colors.textOnAccent} />
            <Text style={s.shareBtnText}>結果をシェアする</Text>
          </TouchableOpacity>
          {!userIsPro && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile' as any)}>
              <Text style={s.proHint}>Proなら透かしなしでシェアできます →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 次のアクション ── */}
        <View style={s.section}>
          <MonoLabel color={Colors.textTertiary} size={9}>NEXT ACTION</MonoLabel>
          <View style={s.nextActions}>
            <TouchableOpacity
              style={s.nextBtn}
              onPress={() => router.replace('/(tabs)/battle' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="search-outline" size={18} color={Colors.textPrimary} />
              <Text style={s.nextBtnText}>次のチャレンジを探す</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.nextBtn, userIsPro && s.nextBtnPro]}
              onPress={() => router.push('/(tabs)/battle' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={18} color={userIsPro ? Colors.primary : Colors.textPrimary} />
              <Text style={[s.nextBtnText, userIsPro && { color: Colors.primary }]}>
                チャレンジを作る{!userIsPro ? ' (Pro)' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  scroll: { paddingBottom: 48 },

  // Hero
  heroCard: {
    backgroundColor: Colors.surface,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  heroTitle: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, textAlign: 'center', marginTop: 4 },
  heroDates: { fontSize: 12, color: Colors.textTertiary, fontWeight: '600' },
  medalBlock: {
    marginTop: 20,
    alignItems: 'center',
    padding: 20,
    borderRadius: BorderRadius.xl,
    gap: 4,
    minWidth: 160,
  },
  medalEmoji: { fontSize: 64, lineHeight: 72 },
  medalLabel: { fontSize: 20, fontWeight: '900', letterSpacing: 0.5, marginTop: 4 },
  medalTeamName: { fontSize: 13, color: Colors.textTertiary, fontWeight: '600', marginTop: 2 },

  // Section
  section: { paddingHorizontal: 16, marginTop: 16 },

  // Title card
  titleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginTop: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.accentYellow}18`,
    borderWidth: 1.5,
    borderColor: `${Colors.accentYellow}55`,
  },
  titleIconWrap: {
    width: 48, height: 48, borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.accentYellow}30`,
    alignItems: 'center', justifyContent: 'center',
  },
  titleName: { fontSize: 16, fontWeight: '900', color: Colors.textPrimary },
  titleDesc: { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  titleNewChip: {
    backgroundColor: Colors.accentYellow,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  titleNew: { fontSize: 10, color: Colors.textPrimary, fontWeight: '900', letterSpacing: 0.5 },

  // Stats card
  statsCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statRow: { flexDirection: 'row' },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  statVal: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1, marginTop: 4, fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 13, color: Colors.textTertiary, fontWeight: '400' },

  // Final VS (dark)
  finalVs: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: DarkColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: DarkColors.line,
    padding: 16,
  },

  // Contribution ring
  contribRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  contribPct: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  contribText: { flex: 1, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  contribBold: { fontWeight: '900', color: Colors.textPrimary, fontSize: 18 },

  // Rank card
  rankCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
    overflow: 'hidden',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rankRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  rankRowMe: { backgroundColor: Colors.primaryLight },
  rankName: { flex: 1, fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
  rankKm: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  rankKmUnit: { fontSize: 10, color: Colors.textTertiary, fontWeight: '400' },

  // Share
  sharePreview: {
    marginTop: 8,
    padding: 16,
    borderRadius: BorderRadius.md,
    backgroundColor: DarkColors.background,
    overflow: 'hidden',
    position: 'relative',
  },
  sharePreviewContent: { gap: 4 },
  sharePreviewTitle: { fontSize: 13, color: DarkColors.textSecondary, fontWeight: '700' },
  sharePreviewRank: { fontSize: 28, fontWeight: '900', color: Colors.textOnPrimary, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  sharePreviewTeam: { fontSize: 13, color: DarkColors.textSecondary, fontWeight: '700', marginTop: 2 },
  sharePreviewTag: { fontSize: 12, color: DarkColors.primary, fontWeight: '700', marginTop: 4 },
  watermarkBadge: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: DarkColors.lineStrong, borderRadius: BorderRadius.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  watermarkText: { fontSize: 10, color: DarkColors.textTertiary, fontWeight: '700' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: 16,
    marginTop: 12,
  },
  shareBtnText: { fontSize: 15, fontWeight: '800', color: Colors.textOnAccent },
  proHint: { textAlign: 'center', fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 8 },

  // Next actions
  nextActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  nextBtnPro: { borderColor: `${Colors.primary}60`, backgroundColor: `${Colors.primary}0C` },
  nextBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },

});
