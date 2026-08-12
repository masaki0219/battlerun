import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Share, Alert, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { onSnapshot, collection, doc, getDoc, Timestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import { Colors, DarkColors, Spacing, Shadow, BorderRadius, TextStyles, Typography, teamColor, teamColorMap } from '../../design_tokens';
import { MonoLabel } from '../../components/ui/MonoLabel';
import { StatBlock } from '../../components/ui/StatBlock';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { ListRow } from '../../components/ui/ListRow';
import { RankBadge } from '../../components/ui/RankBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { VersusGauge } from '../../components/viz/VersusGauge';
import { FactionColumns } from '../../components/viz/FactionColumns';
import { useBattleParticipants } from '../../hooks/useBattleParticipants';
import { useTeamRanking } from '../../hooks/useTeamRanking';
import { useBattleProcessContributions } from '../../hooks/useBattleProcessContributions';
import { TeamRankingCard } from '../../components/battle/TeamRankingCard';
import { SafetyActionsModal } from '../../components/moderation/SafetyActionsModal';
import { CategorySelectModal } from '../../components/battle/CategorySelectModal';
import type { CategoryStats, Battle, Category } from '../../types';
import { inviteWebUrl } from '../../lib/invite';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';
import { prioritizeTeams } from '../../utils/teamDisplay';
import { adjacentRankRival, comebackTarget, formatRunDistanceKm } from '../../utils/displayStats';
import { cachedPublicProfile } from '../../lib/publicProfileCache';
import { listBattleActivitySummaries } from '../../lib/activitySummaries';
import { useTranslation } from '../../lib/i18n';
import { userFacingError } from '../../lib/userError';

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
  avatarEmoji?: string;
  distanceKm: number;
  isMe: boolean;
}

export default function BattleDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.6;
  const { user } = useAuthStore();
  const { publicBattles, privateBattles, myMemberships, joinBattle, leaveBattle } = useBattleStore();

  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [statsRetryKey, setStatsRetryKey] = useState(0);
  const [fetchedBattle, setFetchedBattle] = useState<Battle | null>(null);
  const [showTeamChange, setShowTeamChange] = useState(false);
  const [changingTeam, setChangingTeam] = useState(false);
  const [leavingBattle, setLeavingBattle] = useState(false);
  const [canLeaveBattle, setCanLeaveBattle] = useState<boolean | null>(null);
  const [showSafety, setShowSafety] = useState(false);
  const { blockedUserIds } = useBlockedUsers(user?.id);

  const battleFromStore = [...publicBattles, ...privateBattles].find((b) => b.id === id);
  const battle = battleFromStore ?? fetchedBattle;
  const visibleRecentActivities = recentActivities.filter((item) => item.isMe || !blockedUserIds.has(item.userId));
  const membership = myMemberships.find((m) => m.battleId === id);
  const myCatId = membership?.categoryId ?? null;

  // 個人戦（陣営が実質1つ以下）は陣営ランキングが成立しないため、参加者個人のランキングを表示する
  const isIndividual = !!battle && battle.categories.length <= 1;
  const { participants, loading: participantsLoading } = useBattleParticipants(id, {
    enabled: isIndividual,
    limit: 20,
  });
  const visibleParticipants = participants.filter((item) => item.userId === user?.id || !blockedUserIds.has(item.userId));
  const teamRanking = useTeamRanking(id, myCatId, user?.id, { topCount: 10 });
  const processContributions = useBattleProcessContributions(
    battle && !isIndividual && myCatId ? id : undefined,
    myCatId ?? undefined,
  );

  useEffect(() => {
    if (!id || !user || !membership) {
      setCanLeaveBattle(null);
      return;
    }
    return onSnapshot(doc(db, 'battles', id, 'participants', user.id), (snapshot) => {
      if (!snapshot.exists()) {
        setCanLeaveBattle(false);
        return;
      }
      const data = snapshot.data();
      const stepCredits = data['stepCreditKmByDay'];
      const hasStepCredit = stepCredits && typeof stepCredits === 'object'
        ? Object.values(stepCredits as Record<string, unknown>).some(
            (value) => typeof value === 'number' && value > 0,
          )
        : false;
      setCanLeaveBattle(
        ((data['totalDistanceKm'] as number | undefined) ?? 0) <= 0
        && ((data['activityCount'] as number | undefined) ?? 0) <= 0
        && !hasStepCredit,
      );
    }, () => setCanLeaveBattle(null));
  }, [id, user?.id, membership?.battleId]);

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
        ...(Number.isInteger(data['termIndex']) && Number.isInteger(data['termCount']) ? {
          termIndex: data['termIndex'] as number,
          termCount: data['termCount'] as number,
        } : {}),
      });
    }).catch(() => {});
  }, [id, battleFromStore]);

  // ── real-time category_stats subscription ──────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setStatsError(false);
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
      setStatsError(false);
    }, (error) => {
      console.warn('[BattleDetail] category stats subscription failed:', error);
      setStats([]);
      setLoading(false);
      setStatsError(true);
    });
    return unsub;
  }, [id, battle, statsRetryKey]);

  // ── recent activities for this battle (best-effort) ────────
  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    listBattleActivitySummaries({ battleId: id, limit: 10 })
      .then((activities) => {
        void Promise.all(activities.map(async (activity): Promise<RecentActivity> => {
          const userId = activity.userId;
          const profile = await cachedPublicProfile(userId).catch(() => null);
          return {
            id: activity.id,
            userId,
            displayName: profile?.name ?? activity.displayName ?? t('battleDetail.member'),
            avatarEmoji: profile?.avatarEmoji,
            distanceKm: activity.distanceKm,
            isMe: userId === user.id,
          };
        })).then((items) => {
          if (!cancelled) setRecentActivities(items);
        });
      })
      .catch(() => {
        if (!cancelled) setRecentActivities([]);
      });
    return () => { cancelled = true; };
  }, [id, user?.id, t]);

  if (!battle) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.navBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('battleDetail.backA11y')}>
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {loading
            ? <ActivityIndicator color={Colors.primary} />
            : <Text style={{ color: Colors.textSecondary }}>{t('battleDetail.notFound')}</Text>
          }
        </View>
      </SafeAreaView>
    );
  }

  const { d, h, m } = timeLeft(battle.status === 'upcoming' ? battle.startAt : battle.endAt);
  const rankType = battle.rankingType ?? 'total';
  const val = (st: CategoryStats) => (rankType === 'total' ? st.totalDistanceKm : st.avgDistanceKm);

  const sorted = [...stats].sort((a, b) => val(b) - val(a) || a.categoryId.localeCompare(b.categoryId));
  const allZero = sorted.every((item) => val(item) <= 0);
  const myStatIdx = sorted.findIndex((st) => st.categoryId === myCatId);
  const myTeam = myStatIdx >= 0 ? sorted[myStatIdx] : null;
  const myRank = myTeam && !allZero
    ? 1 + sorted.filter((item) => val(item) > val(myTeam)).length
    : null;

  // 対向ゲージ: 自陣営 vs 直上（首位なら次の別スコア）。未参加なら上位2陣営。
  const rivalTarget = adjacentRankRival(sorted, myCatId, rankType);
  const rival = myTeam ? rivalTarget?.stat : sorted[1];
  const gaugeLeft = myTeam ?? sorted[0];
  const gaugeRight = myTeam ? rival : sorted[1];
  const gapToOvertakeKm = myTeam && rival && rivalTarget?.direction === 'ahead'
    ? (rankType === 'average'
      ? Math.max(0, rival.avgDistanceKm * Math.max(myTeam.participantCount, 1) - myTeam.totalDistanceKm)
      : Math.max(0, rival.totalDistanceKm - myTeam.totalDistanceKm))
    : null;
  const comeback = gapToOvertakeKm != null ? comebackTarget(gapToOvertakeKm, battle.endAt) : null;
  const bothZero = gaugeLeft && gaugeRight && val(gaugeLeft) <= 0 && val(gaugeRight) <= 0;
  const maxVal = Math.max(...sorted.map(val), 0.01);
  const colorsByCategory = teamColorMap(battle.categories);
  const multiTeamColumns = prioritizeTeams(sorted, myCatId).map((team) => ({
    id: team.categoryId,
    label: team.label,
    km: val(team),
    rank: allZero ? null : 1 + sorted.filter((item) => val(item) > val(team)).length,
    isMine: team.categoryId === myCatId,
    color: colorsByCategory[team.categoryId] ?? teamColor(team.categoryId),
  }));

  async function shareInvite(targetBattle: Battle) {
    if (!targetBattle.inviteCode) return;
    await Share.share({
      title: t('battleDetail.inviteTitle', { title: targetBattle.title }),
      message: t('battleDetail.inviteMessage', { title: targetBattle.title, url: inviteWebUrl(targetBattle.inviteCode), code: targetBattle.inviteCode }),
    }).catch((error) => console.warn('[BattleDetail] invite share failed:', error));
  }

  function confirmLeaveBattle() {
    if (!user || !battle || leavingBattle || !canLeaveBattle) return;
    const targetBattleId = battle.id;
    const userId = user.id;
    Alert.alert(
      t('battleDetail.leaveTitle'),
      t('battleDetail.leaveBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('battleDetail.leave'),
          style: 'destructive',
          onPress: () => {
            setLeavingBattle(true);
            void leaveBattle(targetBattleId, userId)
              .then(() => router.back())
              .catch((error) => {
                Alert.alert(
                  t('battleDetail.leaveFailed'),
                  userFacingError(error, t('battleDetail.connectionRetry')),
                );
              })
              .finally(() => setLeavingBattle(false));
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* ── Nav bar ─────────────────────────────────────── */}
      <View style={s.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('battleDetail.backA11y')}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.navActions}>
          {battle.status === 'finished' && (
            <TouchableOpacity
              style={s.navIconBtn}
              onPress={() => router.push(`/battle/result/${id}` as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('battleDetail.resultA11y')}
            >
              <Ionicons name="podium-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={s.navIconBtn}
            onPress={() => setShowSafety(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('battleDetail.safetyA11y')}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {statsError && (
          <View style={s.connectionError} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={17} color={Colors.error} />
            <Text style={s.connectionErrorText}>{t('battleDetail.statsFailed')}</Text>
            <TouchableOpacity
              onPress={() => setStatsRetryKey((key) => key + 1)}
              accessibilityRole="button"
              accessibilityLabel={t('battleDetail.retryStatsA11y')}
            >
              <Text style={s.connectionErrorRetry}>{t('battleDetail.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* ── Dark hero (勝負どころ) ──────────────────────── */}
        <View style={s.hero}>
          {battle.inviteCode ? (
            <View style={[s.heroInviteRow, largeText && s.heroInviteRowLargeText]}>
              <View style={s.heroInviteCode}>
                <MonoLabel color={DarkColors.primary} size={9}>{t('battleDetail.inviteCode', { code: battle.inviteCode })}</MonoLabel>
              </View>
              <TouchableOpacity
                style={[s.heroInviteButton, largeText && s.heroInviteButtonLargeText]}
                onPress={() => void shareInvite(battle)}
                accessibilityRole="button"
                accessibilityLabel={t('battleDetail.inviteShareA11y')}
              >
                <Ionicons name="share-outline" size={14} color={DarkColors.primary} />
                <Text style={s.heroInviteText}>{t('battleDetail.invite')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <MonoLabel color={DarkColors.textTertiary} size={9}>
              {t(battle.status === 'upcoming' ? 'battleDetail.upcomingLabel' : 'battleDetail.activeLabel')}
            </MonoLabel>
          )}
          {battle.termIndex != null && battle.termCount != null && (
            <Text style={s.heroTermLabel}>
              {t('battle.termLabel', { index: battle.termIndex, count: battle.termCount })}
            </Text>
          )}
          <Text style={s.heroTitle}>{battle.title}</Text>

          {/* countdown 3連 */}
          <View style={s.countRow}>
            <StatBlock dark align="center" label={t('battleDetail.days')} value={d} />
            <View style={s.countDivider} />
            <StatBlock dark align="center" label={t('battleDetail.hours')} value={pad(h)} />
            <View style={s.countDivider} />
            <StatBlock dark align="center" label={t('battleDetail.minutes')} value={pad(m)} />
          </View>

          {sorted.length >= 3 ? (
            <View style={s.heroGauge}>
              <Text style={s.multiTeamHint}>{t('battleDetail.nearestTeams')}</Text>
              <FactionColumns factions={multiTeamColumns} valueSuffix={rankType === 'average' ? t('common.perPersonKm') : 'km'} />
            </View>
          ) : gaugeLeft && gaugeRight ? (
            <View style={s.heroGauge}>
              <VersusGauge
                left={{ label: gaugeLeft.label, km: val(gaugeLeft), isMine: gaugeLeft.categoryId === myCatId, color: colorsByCategory[gaugeLeft.categoryId] ?? teamColor(gaugeLeft.categoryId) }}
                right={{ label: gaugeRight.label, km: val(gaugeRight), isMine: gaugeRight.categoryId === myCatId, color: colorsByCategory[gaugeRight.categoryId] ?? teamColor(gaugeRight.categoryId) }}
                size="lg"
                dark
                unit={rankType === 'average' ? t('common.perPersonKm') : 'km'}
              />
            </View>
          ) : null}

          {comeback != null && !bothZero && (
            <View style={s.heroPace}>
              <Ionicons name="flash" size={14} color={DarkColors.accent} />
              <Text style={s.heroPaceText}>
                {t('battle.comebackGuide', {
                  rank: rivalTarget?.rank ?? Math.max(1, (myRank ?? 2) - 1),
                  total: comeback.totalKm.toFixed(1),
                  daily: comeback.kmPerDay.toFixed(1),
                })}
              </Text>
            </View>
          )}
        </View>

        {/* ── ランキング ──────────────────────────────────── */}
        {isIndividual ? (
          /* 個人戦: 参加者を距離降順で表示 */
          <View style={s.sectionCard}>
            <Text style={[TextStyles.sectionTitle, { marginBottom: Spacing.md }]}>{t('battleDetail.ranking')}</Text>
            {participantsLoading && participants.length === 0 ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
            ) : visibleParticipants.length === 0 ? (
              <EmptyState icon="flag-outline" title={t('battleDetail.nobodyYet')} hint={t('battleDetail.beFirst')} />
            ) : (
              visibleParticipants.map((p, i) => {
                const isMine = p.userId === user?.id;
                const participantRank = p.totalDistanceKm > 0
                  ? 1 + participants.filter((item) => item.totalDistanceKm > p.totalDistanceKm).length
                  : null;
                return (
                  <View key={p.userId} style={[s.partRow, i > 0 && s.partRowBorder, isMine && s.partRowMine]}>
                    {participantRank ? <RankBadge rank={participantRank} /> : <Text style={s.rankNum}>—</Text>}
                    <Text style={[s.partName, isMine && s.partNameMine]} numberOfLines={1}>
                      {p.displayName}{isMine ? t('battleDetail.youSuffix') : ''}
                    </Text>
                    <Text style={[s.partKm, isMine && s.partKmMine]}>
                      {p.totalDistanceKm.toFixed(1)}<Text style={s.partKmUnit}> km</Text>
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          /* 陣営戦: category_stats を陣営バーで表示 */
          <View style={s.sectionCard}>
            <Text style={[TextStyles.sectionTitle, { marginBottom: Spacing.md }]}>{t('battleDetail.teamRanking')}</Text>
            {loading && sorted.length === 0 ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
            ) : statsError ? (
              <Text style={s.rankingUnavailable}>{t('battleDetail.retryConnection')}</Text>
            ) : sorted.length === 0 ? (
              <EmptyState icon="flag-outline" title={t('battleDetail.noRecords')} hint={t('battleDetail.firstContribution')} />
            ) : (
              sorted.map((cat, i) => {
                const isMine = cat.categoryId === myCatId;
                const displayRank = allZero ? null : 1 + sorted.filter((item) => val(item) > val(cat)).length;
                const barColor = colorsByCategory[cat.categoryId] ?? teamColor(cat.categoryId);
                return (
                  <View key={cat.categoryId} style={s.rankRow}>
                    <Text style={[s.rankNum, isMine && s.rankNumMine]}>{displayRank ?? '—'}</Text>
                    <View style={s.rankMain}>
                      <View style={s.rankNameRow}>
                        <Text style={[s.rankName, isMine && s.rankNameMine]} numberOfLines={1}>
                          {cat.label}{isMine ? t('battleDetail.youSuffix') : ''}
                        </Text>
                        <Text style={[s.rankValue, isMine && s.rankValueMine]}>{val(cat).toFixed(1)}{rankType === 'average' ? t('common.perPersonKm') : 'km'}</Text>
                      </View>
                      <ProgressBar value={val(cat) / maxVal} color={barColor} height={8} />
                    </View>
                  </View>
                );
              })
            )}
            {/* チーム変更（ルール上、距離0・記録0の間だけ許可される）。
                teamSize>0 でデータ取得済みを確認してから出す */}
            {!!membership && battle.status === 'active'
              && teamRanking.teamSize > 0 && teamRanking.myKm === 0 && (
              <TouchableOpacity
                style={s.teamChangeLink}
                onPress={() => setShowTeamChange(true)}
                accessibilityRole="button"
                accessibilityLabel={t('battleDetail.changeTeamA11y')}
              >
                <Ionicons name="swap-horizontal-outline" size={14} color={Colors.primaryDark} />
                <Text style={s.teamChangeText}>{t('battleDetail.changeTeam')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!isIndividual && (teamRanking.top.length > 0 || teamRanking.error) && (
          <View>
            <Text style={[TextStyles.sectionTitle, { marginBottom: Spacing.md }]}>{t('battleDetail.withinTeam')}</Text>
            <TeamRankingCard
              ranking={teamRanking}
              contributions={processContributions}
              currentUserId={user?.id}
              blockedUserIds={blockedUserIds}
              teamColor={myCatId ? colorsByCategory[myCatId] : undefined}
            />
          </View>
        )}

        {!!membership && canLeaveBattle !== null && (
          <View style={s.sectionCard}>
            <Text style={[TextStyles.sectionTitle, { marginBottom: Spacing.sm }]}>{t('battleDetail.participationSettings')}</Text>
            {canLeaveBattle ? (
              <TouchableOpacity
                style={s.leaveButton}
                onPress={confirmLeaveBattle}
                disabled={leavingBattle}
                accessibilityRole="button"
                accessibilityLabel={t('battleDetail.leaveA11y')}
                accessibilityState={{ disabled: leavingBattle, busy: leavingBattle }}
              >
                {leavingBattle
                  ? <ActivityIndicator size="small" color={Colors.error} />
                  : <Ionicons name="exit-outline" size={16} color={Colors.error} />}
                <Text style={s.leaveButtonText}>{leavingBattle ? t('battleDetail.leaving') : t('battleDetail.leaveChallenge')}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={s.leaveUnavailableText}>{t('battleDetail.cannotLeave')}</Text>
            )}
          </View>
        )}

        {/* ── 最近の活動 ──────────────────────────────────── */}
        {visibleRecentActivities.length > 0 && (
          <View style={s.sectionCard}>
            <Text style={[TextStyles.sectionTitle, { marginBottom: Spacing.sm }]}>{t('battleDetail.recent')}</Text>
            {visibleRecentActivities.map((a) => (
              <ListRow
                key={a.id}
                avatarName={a.displayName}
                avatarEmoji={a.avatarEmoji}
                iconColor={a.isMe ? Colors.primary : Colors.textTertiary}
                iconBg={a.isMe ? Colors.primaryLight : Colors.surfaceGray}
                title={a.displayName}
                subtitle={t('battleDetail.ranDistance', { distance: formatRunDistanceKm(a.distanceKm) })}
                titleColor={a.isMe ? Colors.primary : undefined}
                onPress={() => router.push({
                  pathname: '/activity/[id]' as any,
                  params: { id: a.id, battleId: id },
                })}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* チーム変更モーダル（参加時と同じ選択UI。距離0の間だけ開ける） */}
      <CategorySelectModal
        visible={showTeamChange}
        battle={battle}
        stats={stats}
        loading={changingTeam}
        onClose={() => setShowTeamChange(false)}
        onJoin={async (categoryId) => {
          if (!user || changingTeam || categoryId === myCatId) {
            setShowTeamChange(false);
            return;
          }
          setChangingTeam(true);
          try {
            await joinBattle(
              battle.id,
              categoryId,
              user.id,
              battle.type === 'private' ? battle.inviteCode : null,
            );
            setShowTeamChange(false);
          } catch (e) {
            Alert.alert(
              t('battleDetail.teamChangeFailed'),
              userFacingError(e, t('battleDetail.connectionRetry')),
            );
          } finally {
            setChangingTeam(false);
          }
        }}
      />
      {user && (
        <SafetyActionsModal
          visible={showSafety}
          currentUserId={user.id}
          target={{
            type: 'battle', id: battle.id,
            ...(battle.type === 'private' && battle.createdBy ? { targetUid: battle.createdBy } : {}),
            battleId: battle.id,
            contentSnapshot: [battle.title, battle.description, ...battle.categories.map((item) => item.label)].filter(Boolean).join(' / '),
          }}
          targetDisplayName={t('battleDetail.creator')}
          onClose={() => setShowSafety(false)}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  heroTermLabel: {
    marginTop: Spacing.xs,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: DarkColors.primary,
  },
  connectionError: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  connectionErrorText: { flex: 1, fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  connectionErrorRetry: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.primaryDark },
  rankingUnavailable: { paddingVertical: Spacing.lg, textAlign: 'center', color: Colors.textSecondary },
  leaveButton: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.error,
  },
  leaveButtonText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.error },
  leaveUnavailableText: { fontSize: Typography.fontSize.sm, lineHeight: 20, color: Colors.textSecondary },
  teamChangeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  teamChangeText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primaryDark,
  },
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
  heroInviteRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm,
  },
  heroInviteRowLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  heroInviteCode: { flex: 1, minWidth: 0 },
  heroInviteButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: BorderRadius.full, backgroundColor: DarkColors.primarySoft,
  },
  heroInviteButtonLargeText: { alignSelf: 'stretch', justifyContent: 'center', minHeight: 44 },
  heroInviteText: { fontSize: 10, fontWeight: '800', color: DarkColors.primary },
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
  multiTeamHint: { marginBottom: Spacing.sm, fontSize: 10, color: DarkColors.textSecondary },
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

  // 個人戦の参加者ランキング行
  partRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  partRowBorder: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  partRowMine: { backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm },
  partName: { flex: 1, fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  partNameMine: { color: Colors.primary, fontWeight: '900' },
  partKm: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  partKmMine: { color: Colors.primary },
  partKmUnit: { fontSize: 10, color: Colors.textTertiary, fontWeight: '400' },
});
