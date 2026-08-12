import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share, Alert,
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
import { Colors, DarkColors, Spacing, BorderRadius, Typography, teamColor, teamColorMap } from '../../../design_tokens';
import { MonoLabel } from '../../../components/ui/MonoLabel';
import { RankBadge } from '../../../components/ui/RankBadge';
import { VersusGauge } from '../../../components/viz/VersusGauge';
import { FactionColumns } from '../../../components/viz/FactionColumns';
import { ProgressRing } from '../../../components/viz/ProgressRing';
import { contributionShare } from '../../../utils/displayStats';
import { useBattleParticipants } from '../../../hooks/useBattleParticipants';
import { useTranslation } from '../../../lib/i18n';
import { prioritizeTeams } from '../../../utils/teamDisplay';
import { teamTitleLabel } from '../../../lib/teamTitle';
import { completedTermBattles, termWinnerLabels } from '../../../utils/battleTerms';
import { resolveBattleMarket } from '../../../lib/market';

interface TermResultRow {
  battle: Battle;
  winnerLabels: string[];
}

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
    ...(data['type'] !== 'private' ? { market: resolveBattleMarket(data['market']) } : {}),
    ...(Number.isInteger(data['termIndex']) && Number.isInteger(data['termCount']) ? {
      termIndex: data['termIndex'] as number,
      termCount: data['termCount'] as number,
    } : {}),
  };
}

export default function BattleResultScreen() {
  const { language, t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, proEntitlement } = useAuthStore();
  const { publicBattles, privateBattles, myMemberships, fetchPublicSeasonBattles } = useBattleStore();
  const userIsPro = isPro(user?.plan, proEntitlement);

  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [myStats, setMyStats] = useState<{ totalKm: number; actCount: number | null }>({ totalKm: 0, actCount: null });
  const [participantCategoryId, setParticipantCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [localBattle, setLocalBattle] = useState<Battle | null>(
    () => [...publicBattles, ...privateBattles].find((b) => b.id === id) ?? null
  );
  const [termResults, setTermResults] = useState<TermResultRow[] | null>(null);
  const shareCardRef = useRef<View>(null);

  // 参加者ランキング（貢献 TOP）。battle/[id] の個人戦表示と共用の read-only フック
  const { participants } = useBattleParticipants(id, { enabled: !!localBattle, limit: 20 });

  const membership = myMemberships.find((m) => m.battleId === id);
  const myCatId = membership?.categoryId ?? participantCategoryId;

  // ストアにない場合Firestoreから直接取得
  useEffect(() => {
    const fromStore = [...publicBattles, ...privateBattles].find((b) => b.id === id);
    if (fromStore) {
      setLocalBattle(fromStore);
      return;
    }
    // Push直行時は認証復元前に最初のreadが拒否されうる。user確定後に再試行する。
    if (!id || !user) return;
    let cancelled = false;
    getDoc(doc(db, 'battles', id)).then((snap) => {
      if (!cancelled && snap.exists()) {
        setLocalBattle(mapFirestoreToBattle(snap.id, snap.data() as Record<string, unknown>));
      }
    }).catch((error) => console.warn('[BattleResult] battle load failed:', error));
    return () => { cancelled = true; };
  }, [id, publicBattles, privateBattles, user?.id]);

  useEffect(() => {
    if (!id || !localBattle) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setMyStats({ totalKm: 0, actCount: null });
      setParticipantCategoryId(null);
      try {
        // category_stats と自分の participant を同時に読み、Push直行時もストアに依存しない。
        const [statsSnap, meSnap] = await Promise.all([
          getDocs(collection(db, 'battles', id, 'category_stats')),
          user ? getDoc(doc(db, 'battles', id, 'participants', user.id)) : Promise.resolve(null),
        ]);
        if (cancelled) return;
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
        if (meSnap?.exists()) {
          const meData = meSnap.data();
          const km = (meData['totalDistanceKm'] as number) ?? 0;
          const actCount = (meData['activityCount'] as number | undefined) ?? null;
          const categoryId = meData['categoryId'];
          setMyStats({ totalKm: km, actCount });
          setParticipantCategoryId(typeof categoryId === 'string' ? categoryId : null);
        }
      } catch (error) {
        console.warn('[BattleResult] result data load failed:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [id, localBattle, user]);

  useEffect(() => {
    if (
      !localBattle
      || !user
      || localBattle.type !== 'public'
      || localBattle.status !== 'finished'
      || !localBattle.seasonId
      || !localBattle.termIndex
      || !localBattle.termCount
    ) {
      setTermResults(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const seasonBattles = await fetchPublicSeasonBattles(localBattle.seasonId!);
      const completed = completedTermBattles(seasonBattles, localBattle);
      if (!completed) {
        if (!cancelled) setTermResults(null);
        return;
      }
      const rows = await Promise.all(completed.map(async (termBattle) => {
        const statsSnap = await getDocs(collection(db, 'battles', termBattle.id, 'category_stats'));
        const termStats: CategoryStats[] = statsSnap.docs.map((statDoc) => ({
          categoryId: statDoc.id,
          label: termBattle.categories.find((category) => category.id === statDoc.id)?.label ?? statDoc.id,
          totalDistanceKm: (statDoc.data()['totalDistanceKm'] as number) ?? 0,
          avgDistanceKm: (statDoc.data()['avgDistanceKm'] as number) ?? 0,
          participantCount: (statDoc.data()['participantCount'] as number) ?? 0,
        }));
        return { battle: termBattle, winnerLabels: termWinnerLabels(termBattle, termStats) };
      }));
      if (!cancelled) setTermResults(rows);
    })().catch((error) => {
      console.warn('[BattleResult] term retrospective load failed:', error);
      if (!cancelled) setTermResults(null);
    });
    return () => { cancelled = true; };
  }, [localBattle, user?.id, fetchPublicSeasonBattles]);

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
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('battleResult.backA11y')}>
            <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <MonoLabel color={Colors.textTertiary} size={9}>{t('battleResult.label')}</MonoLabel>
          <View style={{ width: 28 }} />
        </View>
        <View style={s.center}>
          <Ionicons name="time-outline" size={40} color={Colors.textTertiary} />
          <Text style={{ color: Colors.textPrimary, fontSize: 17, fontWeight: '800' }}>{t('battleResult.stillActive')}</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>{t('battleResult.afterEnd')}</Text>
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
  const colorsByCategory = teamColorMap(localBattle.categories);
  const finalColumns = prioritizeTeams(sorted, myCatId).map((team) => ({
    id: team.categoryId,
    label: team.label,
    km: valOf(team),
    rank: allZero ? null : 1 + sorted.filter((item) => valOf(item) > valOf(team)).length,
    isMine: team.categoryId === myCatId,
    color: colorsByCategory[team.categoryId] ?? teamColor(team.categoryId),
  }));
  const myShare = myTeam ? contributionShare(myStats.totalKm, myTeam.totalDistanceKm) : 0;

  const dateLocale = language === 'ja' ? 'ja-JP' : 'en-US';
  const startDate = new Date(localBattle.startAt).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' });
  const endDate = new Date(localBattle.endAt).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' });

  function rankMedal(rank: number) {
    if (rank === 1) return { emoji: '🥇', color: Colors.rank1Text, label: t('battleResult.first'), bg: `${Colors.accentYellow}18` };
    if (rank === 2) return { emoji: '🥈', color: Colors.rank2, label: t('battleResult.second'), bg: `${Colors.rank2}28` };
    if (rank === 3) return { emoji: '🥉', color: Colors.rank3, label: t('battleResult.third'), bg: `${Colors.rank3}18` };
    return { emoji: '🏃', color: Colors.textSecondary, label: t('common.rank', { rank }), bg: Colors.surfaceGray };
  }

  const medal = myRank ? rankMedal(myRank) : null;

  async function handleShare() {
    const rankText = myRank ? t('common.rank', { rank: myRank }) : t('battleResult.participation');
    const kmText = myStats.totalKm.toFixed(1);
    const message = t('battleResult.shareMessage', { title: localBattle?.title ?? t('battle.title'), rank: rankText, distance: kmText });

    try {
      if (shareCardRef.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.92 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('battleResult.shareDialog') });
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
  const titleName = myTitle ? teamTitleLabel(myTitle.rank, language) : null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Nav */}
      <View style={s.nav}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('battleResult.backA11y')}>
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <MonoLabel color={Colors.textTertiary} size={9}>{t('battleResult.label')}</MonoLabel>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── 最終 VS ゲージ（ダーク演出） ── */}
        {!loading && sorted.length >= 3 ? (
          <View style={s.finalVs}>
            <MonoLabel color={DarkColors.textTertiary} size={9}>{t('locale.final')}</MonoLabel>
            <View style={{ marginTop: 12 }}>
              <FactionColumns factions={finalColumns} valueSuffix={rankType === 'average' ? t('common.perPersonKm') : 'km'} />
            </View>
          </View>
        ) : !loading && gaugeLeft && gaugeRight ? (
          <View style={s.finalVs}>
            <MonoLabel color={DarkColors.textTertiary} size={9}>{t('locale.final')}</MonoLabel>
            <View style={{ marginTop: 12 }}>
              <VersusGauge
                left={{ label: gaugeLeft.label, km: valOf(gaugeLeft), isMine: gaugeLeft.categoryId === myCatId, color: colorsByCategory[gaugeLeft.categoryId] ?? teamColor(gaugeLeft.categoryId) }}
                right={{ label: gaugeRight.label, km: valOf(gaugeRight), isMine: gaugeRight.categoryId === myCatId, color: colorsByCategory[gaugeRight.categoryId] ?? teamColor(gaugeRight.categoryId) }}
                size="lg"
                dark
                unit={rankType === 'average' ? t('common.perPersonKm') : 'km'}
              />
            </View>
          </View>
        ) : null}

        {/* ── Hero ── */}
        <View style={s.heroCard}>
          <MonoLabel color={Colors.textTertiary} size={9}>{t('locale.result')}</MonoLabel>
          {localBattle.termIndex != null && localBattle.termCount != null && (
            <Text style={s.termLabel}>
              {t('battle.termLabel', { index: localBattle.termIndex, count: localBattle.termCount })}
            </Text>
          )}
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
              <Text style={s.medalLabel}>{t('battleResult.completed')}</Text>
            </View>
          )}
        </View>

        {/* Theme全体の勝者は作らず、全ターム終了時だけ各Battleの1位を並べる。 */}
        {termResults && (
          <View style={s.section}>
            <MonoLabel color={Colors.textTertiary} size={9}>{t('battleResult.themeEnded')}</MonoLabel>
            <Text style={s.termResultsTitle}>
              {t('battleResult.termResults', { count: termResults.length })}
            </Text>
            <View style={s.termResultsCard}>
              {termResults.map((row, index) => {
                const resultText = row.winnerLabels.length === 0
                  ? t('battleResult.termNoResult')
                  : row.winnerLabels.length === 1
                    ? t('battleResult.termWinner', { team: row.winnerLabels[0] })
                    : t('battleResult.termTie', { teams: row.winnerLabels.join(' / ') });
                return (
                  <View
                    key={row.battle.id}
                    style={[s.termResultRow, index > 0 && s.termResultRowBorder]}
                  >
                    <Text style={s.termResultIndex}>
                      {t('battle.termLabel', {
                        index: row.battle.termIndex ?? index + 1,
                        count: row.battle.termCount ?? termResults.length,
                      })}
                    </Text>
                    <Text style={s.termResultWinner}>{resultText}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={s.termResultsNote}>{t('battleResult.termResultsNote')}</Text>
          </View>
        )}

        {/* ── 称号発表 ── */}
        {titleName && (
          <View style={s.section}>
            <MonoLabel color={Colors.textTertiary} size={9}>{t('locale.titleEarned')}</MonoLabel>
            <View style={s.titleCard}>
              <View style={s.titleIconWrap}>
                <Ionicons name="ribbon" size={28} color={Colors.goldText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.titleName}>{titleName}</Text>
                <Text style={s.titleDesc}>
                  {myTitle?.teamName ? t('battleResult.titleForTeam', { team: myTitle.teamName }) : t('battleResult.titleForWin')}
                </Text>
              </View>
              <View style={s.titleNewChip}><Text style={s.titleNew}>{t('locale.new')}</Text></View>
            </View>
          </View>
        )}

        {/* ── 個人成績 ── */}
        <View style={s.section}>
          <MonoLabel color={Colors.textTertiary} size={9}>{t('locale.myStats')}</MonoLabel>
          <View style={s.statsCard}>
            {myTeam && (
              <View style={s.contribRow}>
                <ProgressRing progress={myShare} size={64} strokeWidth={8}>
                  <Text style={s.contribPct}>{Math.round(myShare * 100)}%</Text>
                </ProgressRing>
                <Text style={s.contribText}>{t('battleResult.teamShare', { percent: Math.round(myShare * 100) })}</Text>
              </View>
            )}
            <View style={s.statRow}>
              <View style={s.statItem}>
                <MonoLabel color={Colors.textTertiary} size={8}>{t('battleResult.contributionDistance')}</MonoLabel>
                <Text style={s.statVal}>{myStats.totalKm.toFixed(1)}<Text style={s.statUnit}> km</Text></Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <MonoLabel color={Colors.textTertiary} size={8}>{t('battleResult.activityCount')}</MonoLabel>
                <Text style={s.statVal}>{myStats.actCount ?? '—'}<Text style={s.statUnit}>{t('battleResult.timesUnit')}</Text></Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                {/* myRank は陣営同士の最終順位（チーム内の個人順位ではない）なのでラベルを値に合わせる */}
                <MonoLabel color={Colors.textTertiary} size={8}>{t('battleResult.teamRank')}</MonoLabel>
                <Text style={s.statVal}>{myRank ?? '—'}<Text style={s.statUnit}>{t('battleResult.rankUnit')}</Text></Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 陣営ランキング ── */}
        {sorted.length > 0 && (
          <View style={s.section}>
            <MonoLabel color={Colors.textTertiary} size={9}>{t('locale.finalRanking')}</MonoLabel>
            <View style={s.rankCard}>
              {sorted.map((cat, i) => {
                const isMe = cat.categoryId === myCatId;
                const val = rankType === 'total' ? cat.totalDistanceKm : cat.avgDistanceKm;
                const displayRank = allZero ? null : 1 + sorted.filter((item) => valOf(item) > val).length;
                return (
                  <View key={cat.categoryId} style={[s.rankRow, isMe && s.rankRowMe, i > 0 && s.rankRowBorder]}>
                    {displayRank ? <RankBadge rank={displayRank} /> : <Text style={s.rankKm}>—</Text>}
                    <Text style={[s.rankName, isMe && { color: Colors.primary, fontWeight: '900' }]} numberOfLines={1}>
                      {cat.label}{isMe ? t('battleDetail.youSuffix') : ''}
                    </Text>
                    <Text style={[s.rankKm, isMe && { color: Colors.primary }]}>
                      {val.toFixed(1)}<Text style={s.rankKmUnit}>{rankType === 'average' ? ` ${t('common.perPersonKm')}` : ' km'}</Text>
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
            <MonoLabel color={Colors.textTertiary} size={9}>{t('locale.topRunners')}</MonoLabel>
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
                      {p.displayName}{isMe ? t('battleDetail.youSuffix') : ''}
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
          <MonoLabel color={Colors.textTertiary} size={9}>{t('locale.shareResult')}</MonoLabel>
          <View ref={shareCardRef} collapsable={false} style={s.sharePreview}>
            <View style={s.sharePreviewContent}>
              <Text style={s.sharePreviewTitle}>{localBattle.title}</Text>
              <Text style={s.sharePreviewRank}>
                {myRank ? t('common.rank', { rank: myRank }) : t('battleResult.participation')} · {myStats.totalKm.toFixed(1)}km
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
            <Text style={s.shareBtnText}>{t('battleResult.share')}</Text>
          </TouchableOpacity>
          {!userIsPro && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile' as any)}>
              <Text style={s.proHint}>{t('battleResult.proShare')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 次のアクション ── */}
        <View style={s.section}>
          <MonoLabel color={Colors.textTertiary} size={9}>{t('locale.nextAction')}</MonoLabel>
          <View style={s.nextActions}>
            <TouchableOpacity
              style={s.nextBtn}
              onPress={() => router.replace('/(tabs)/battle' as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('battleResult.findNext')}
            >
              <Ionicons name="search-outline" size={18} color={Colors.textPrimary} />
              <Text style={s.nextBtnText}>{t('battleResult.findNext')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.nextBtn, userIsPro && s.nextBtnPro]}
              onPress={() => {
                if (!userIsPro) {
                  Alert.alert(
                    t('friends.proRequiredTitle'),
                    t('friends.proRequiredBody'),
                  );
                  return;
                }
                router.push({ pathname: '/(tabs)/friends', params: { open: 'create' } } as any);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={userIsPro ? t('battleResult.create') : t('battleResult.createProA11y')}
            >
              <Ionicons name="add-circle-outline" size={18} color={userIsPro ? Colors.primary : Colors.textPrimary} />
              <Text style={[s.nextBtnText, userIsPro && { color: Colors.primary }]}>
                {t('battleResult.create')}{!userIsPro ? ' (Pro)' : ''}
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
  termLabel: { marginTop: Spacing.sm, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.primary },
  heroTitle: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, textAlign: 'center', marginTop: 4 },
  heroDates: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
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
  medalTeamName: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 2 },

  // Section
  section: { paddingHorizontal: 16, marginTop: 16 },
  termResultsTitle: {
    marginTop: Spacing.xs,
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.extrabold,
    color: Colors.textPrimary,
  },
  termResultsCard: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  termResultRow: {
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  termResultRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  termResultIndex: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  termResultWinner: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  termResultsNote: {
    marginTop: Spacing.sm,
    fontSize: Typography.fontSize.xs,
    lineHeight: 18,
    color: Colors.textSecondary,
  },

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
  titleDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
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
