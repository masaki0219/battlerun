import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getDoc, doc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
import { useRecentActivities } from '../../hooks/useRecentActivities';
import { useBattleCategoryStats } from '../../hooks/useBattleCategoryStats';
import { registerPushToken, scheduleBattleEndNotification, scheduleBattleEnd1hNotification } from '../../lib/notifications';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { WeeklyBarChart } from '../../components/viz/WeeklyBarChart';
import { StreakChip } from '../../components/viz/StreakChip';
import { WeeklyGoalProgress } from '../../components/run/WeeklyGoalProgress';
import { CategorySelectModal } from '../../components/battle/CategorySelectModal';
import { ActiveBattleHero } from '../../components/battle/ActiveBattleHero';
import { ActiveBattleSwitcher } from '../../components/battle/ActiveBattleSwitcher';
import { PublicBattleCard } from '../../components/battle/PublicBattleCard';
import { TeamRankingCard } from '../../components/battle/TeamRankingCard';
import { DeclarationCard, DeclarationList } from '../../components/battle/DeclarationCard';
import { RunningPresenceCard } from '../../components/battle/RunningPresenceCard';
import { SafetyActionsModal } from '../../components/moderation/SafetyActionsModal';
import { useTeamRanking } from '../../hooks/useTeamRanking';
import { useBattleProcessContributions } from '../../hooks/useBattleProcessContributions';
import { useBattlePresence } from '../../hooks/useBattlePresence';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';
import { rollingWeekBuckets, weeklyBuckets, streakDays } from '../../utils/displayStats';
import {
  resolveDisplayedBattle,
  selectedBattleStorageKey,
  sortActiveBattlesForDisplay,
} from '../../utils/battleSelection';
import { Colors, Typography, Spacing, BorderRadius, Shadow, teamColorMap } from '../../design_tokens';
import type { Battle, CategoryStats, RunningPresence } from '../../types';
import type { ReportTarget } from '../../lib/moderation';
import { useTranslation } from '../../lib/i18n';
import { userFacingError } from '../../lib/userError';

// ────────────────────────────────────────────────────────────────
// メイン画面（state・購読・handler を集約。表示は components/battle/* に委譲）
// ────────────────────────────────────────────────────────────────
export default function BattleScreen() {
  const { language, t } = useTranslation();
  const { user } = useAuthStore();
  const unreadNotifications = useUnreadNotifications();
  const {
    publicBattles, privateBattles, myMemberships, seasons, isLoading,
    fetchPublicBattles, fetchMyMemberships, fetchMyPrivateBattles, fetchSeason,
    joinBattle, declarationsByBattle,
    subscribeDeclarations, declareRun, updateDeclaration, cancelDeclaration, cheerDeclaration,
  } = useBattleStore();

  const [joiningBattleId, setJoiningBattleId] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [selectionOwnerId, setSelectionOwnerId] = useState<string | null>(null);

  // 各バトルの陣営統計をリアルタイム購読（public / private を同一フックで共通化）
  const publicStats = useBattleCategoryStats(publicBattles);
  const privateStats = useBattleCategoryStats(privateBattles);
  const categoryStatsMap: Record<string, CategoryStats[]> = {
    ...publicStats.statsMap,
    ...privateStats.statsMap,
  };
  const categoryStatsFailed = publicStats.failedBattleIds.size > 0
    || privateStats.failedBattleIds.size > 0;

  // チーム選択モーダル
  const [categoryModalBattle, setCategoryModalBattle] = useState<Battle | null>(null);
  const [safetyTarget, setSafetyTarget] = useState<ReportTarget | null>(null);
  const [safetyDisplayName, setSafetyDisplayName] = useState('');
  const { blockedUserIds } = useBlockedUsers(user?.id);

  // 閲覧中チャレンジはユーザーごとに保存する。別ユーザーへの選択状態の引き継ぎを防ぐ。
  useEffect(() => {
    let cancelled = false;
    setSelectedBattleId(null);
    setSelectionOwnerId(null);
    if (!user?.id) return () => { cancelled = true; };

    const userId = user.id;
    void (async () => {
      let savedBattleId: string | null = null;
      try {
        savedBattleId = await AsyncStorage.getItem(selectedBattleStorageKey(userId));
      } catch (error) {
        console.warn('[BattleScreen] selected battle restore failed:', error);
      }
      if (cancelled) return;
      setSelectedBattleId(savedBattleId);
      setSelectionOwnerId(userId);
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  // 参加者個人距離（バトルIDごと）
  const [myDistancePerBattle, setMyDistancePerBattle] = useState<Record<string, number>>({});
  // 一覧カードの陣営折りたたみ状態
  const [expandedBattles, setExpandedBattles] = useState<Set<string>>(new Set());

  // 直近アクティビティ（週間バー・ストリーク用）※read-only、useRecentActivities のみ
  const { activities: recentActivities } = useRecentActivities(50);
  const rollingBuckets = rollingWeekBuckets(recentActivities, new Date(), language);
  const calendarWeekBuckets = weeklyBuckets(recentActivities, new Date(), language);
  const streak = streakDays(recentActivities);

  function toggleExpanded(id: string) {
    setExpandedBattles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── 初期データ取得 ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setLocalLoading(true);
    setLoadFailed(false);
    Promise.all([
      fetchPublicBattles(),
      fetchMyMemberships(user.id),
      fetchMyPrivateBattles(user.id),
    ])
      // 失敗を握り潰すと「開催中のチャレンジがありません」が出て、
      // データが無いのか取得できなかったのか区別できなくなる。
      .catch((error) => {
        console.warn('[BattleScreen] initial load failed:', error);
        setLoadFailed(true);
      })
      .finally(() => setLocalLoading(false));
  }, [user, reloadKey]);

  useEffect(() => {
    const ids = [...new Set(
      publicBattles.map((b) => b.seasonId).filter((id): id is string => !!id)
    )];
    ids.forEach((id) => fetchSeason(id));
  }, [publicBattles]);

  // ── アクティブバトルの計算 ─────────────────────────────────
  const now = Date.now();
  const allBattles = [...publicBattles, ...privateBattles].filter(
    (battle) => battle.type === 'public'
      || battle.createdBy === user?.id
      || !battle.createdBy
      || !blockedUserIds.has(battle.createdBy),
  );
  const myBattleIdSet = new Set(myMemberships.map((m) => m.battleId));
  const activeBattleById = new Map(allBattles.filter(
    (b) =>
      myBattleIdSet.has(b.id) &&
      b.status === 'active' &&
      new Date(b.startAt).getTime() <= now &&
      now <= new Date(b.endAt).getTime(),
  ).map((battle) => [battle.id, battle] as const));
  // battleIds（= myMemberships）の安定順で最大2件を有効枠にする。
  // 旧データに3件以上あっても、余剰分は下の「他のチャレンジ」に残して操作不能を避ける。
  const activeBattles = myMemberships
    .map((membership) => activeBattleById.get(membership.battleId))
    .filter((battle): battle is Battle => !!battle)
    .slice(0, 2);
  const sortedActiveBattles = sortActiveBattlesForDisplay(activeBattles);
  const displayedBattle = resolveDisplayedBattle(sortedActiveBattles, selectedBattleId);
  const isParticipating = displayedBattle !== null;
  const activeBattleIdsKey = sortedActiveBattles.map((battle) => battle.id).join('|');

  // 保存済みの選択が終了・退出などで無効になったら、終了日時が近い有効な1件へ寄せる。
  // 初期読み込み失敗時は、前回選択を誤って削除しない。
  useEffect(() => {
    if (!user || selectionOwnerId !== user.id || localLoading || loadFailed) return;
    const normalizedBattleId = displayedBattle?.id ?? null;
    if (selectedBattleId !== normalizedBattleId) {
      setSelectedBattleId(normalizedBattleId);
    }

    const storageKey = selectedBattleStorageKey(user.id);
    const persistence = normalizedBattleId
      ? AsyncStorage.setItem(storageKey, normalizedBattleId)
      : AsyncStorage.removeItem(storageKey);
    void persistence.catch((error) => {
      console.warn('[BattleScreen] selected battle save failed:', error);
    });
  }, [
    user?.id,
    selectionOwnerId,
    localLoading,
    loadFailed,
    selectedBattleId,
    displayedBattle?.id,
    activeBattleIdsKey,
  ]);

  // 「他のチャレンジ」セクションには、上の切替UIにある参加中チャレンジを再掲しない
  const activeBattleIdSet = new Set(activeBattles.map((b) => b.id));
  const activePublicBattles = publicBattles.filter((battle) => (
    battle.status === 'active'
    && new Date(battle.startAt).getTime() <= now
    && now <= new Date(battle.endAt).getTime()
  ));
  const upcomingPublicBattles = publicBattles.filter((battle) => (
    battle.status === 'upcoming' || new Date(battle.startAt).getTime() > now
  ));
  const otherPublicBattles = activePublicBattles.filter((b) => !activeBattleIdSet.has(b.id));
  const displayedMembership = displayedBattle
    ? myMemberships.find((m) => m.battleId === displayedBattle.id)
    : null;
  const displayedCategoryId = displayedMembership?.categoryId ?? null;
  const allDeclarations = displayedBattle ? (declarationsByBattle[displayedBattle.id] ?? []) : [];
  const ownDeclaration = allDeclarations.find((item) => item.uid === user?.id);
  const declarations = allDeclarations.filter((item) => item.uid === user?.id || !blockedUserIds.has(item.uid));
  const { presences, cheer: cheerPresence } = useBattlePresence(displayedBattle?.id, user?.id);
  const visiblePresences = presences.filter((item) => item.uid === user?.id || !blockedUserIds.has(item.uid));

  function openSafety(target: ReportTarget, displayName: string) {
    setSafetyTarget(target);
    setSafetyDisplayName(displayName);
  }

  useEffect(() => {
    if (!displayedBattle || !displayedCategoryId || !user) return;
    return subscribeDeclarations(displayedBattle.id, user.id, displayedCategoryId);
  }, [displayedBattle?.id, displayedCategoryId, user?.id]);

  // 自分の陣営内での立ち位置（ヒーローのフッターとチーム内ランキングで共用）
  const teamRanking = useTeamRanking(displayedBattle?.id, displayedCategoryId, user?.id);
  const processContributions = useBattleProcessContributions(displayedBattle?.id, displayedCategoryId ?? undefined);

  async function handleDeclareRun(plannedAt: Date, note: string) {
    if (!displayedBattle || !displayedCategoryId || !user) return;
    try {
      await declareRun(displayedBattle.id, user.id, displayedCategoryId, plannedAt, note);
    } catch (error) {
      Alert.alert(t('battle.declareFailed'), userFacingError(error, t('connection.tryAgain')));
      throw error;
    }
  }

  async function handleUpdateDeclaration(plannedAt: Date, note: string) {
    if (!displayedBattle || !ownDeclaration) return;
    try {
      await updateDeclaration(displayedBattle.id, ownDeclaration, plannedAt, note);
    } catch (error) {
      Alert.alert(t('battle.declarationUpdateFailed'), userFacingError(error, t('connection.tryAgain')));
      throw error;
    }
  }

  async function handleCancelDeclaration() {
    if (!displayedBattle || !ownDeclaration) return;
    try {
      await cancelDeclaration(displayedBattle.id, ownDeclaration.id);
    } catch (error) {
      Alert.alert(t('battle.declarationCancelFailed'), userFacingError(error, t('connection.tryAgain')));
      throw error;
    }
  }

  async function handleCheerDeclaration(declarationId: string) {
    if (!displayedBattle || !user) return;
    try {
      await cheerDeclaration(displayedBattle.id, declarationId, user.id);
    } catch {
      Alert.alert(t('battle.cheerSendFailed'), t('connection.tryAgain'));
    }
  }

  async function handleCheerPresence(presence: RunningPresence) {
    try {
      const created = await cheerPresence(presence);
      if (!created) Alert.alert(t('battle.cheerFailed'), t('battle.cheerAlreadySent'));
    } catch {
      Alert.alert(t('battle.cheerSendFailed'), t('connection.tryAgain'));
    }
  }

  // ── 自分の参加者個人距離を取得 ────────────────────────────
  useEffect(() => {
    if (!user || activeBattles.length === 0) return;
    const ids = activeBattles.map((b) => b.id);
    Promise.all(
      ids.map(async (battleId) => {
        const snap = await getDoc(doc(db, 'battles', battleId, 'participants', user.id));
        return [battleId, (snap.data()?.['totalDistanceKm'] as number) ?? 0] as const;
      }),
    )
      .then((entries) => setMyDistancePerBattle(Object.fromEntries(entries)))
      .catch(() => {});
  }, [user?.id, activeBattleIdsKey]);

  // ── ヘルパー ──────────────────────────────────────────────
  function myMembershipFor(battleId: string) {
    return myMemberships.find((m) => m.battleId === battleId);
  }

  // ── ジョイン処理 ──────────────────────────────────────────
  async function handleJoin(battle: Battle, categoryId: string) {
    if (!user) return;
    setJoiningBattleId(battle.id);
    try {
      await joinBattle(battle.id, categoryId, user.id, battle.type === 'private' ? battle.inviteCode : null);
      void registerPushToken(user.id, true);
      void scheduleBattleEndNotification(battle);
      void scheduleBattleEnd1hNotification(battle);
      setCategoryModalBattle(null);
      Alert.alert(
        t('battle.joinComplete'),
        t('battle.joinedAs', { team: battle.categories.find((c) => c.id === categoryId)?.label ?? '' }),
        [
          { text: t('battle.later'), style: 'cancel' },
          { text: t('battle.startRun'), onPress: () => router.push('/(tabs)/record' as any) },
        ],
      );
    } catch (e: any) {
      Alert.alert(t('common.error'), userFacingError(e, t('battle.joinFailed')));
    } finally {
      setJoiningBattleId(null);
    }
  }

  // ── 表示部品（小さいものは inline） ────────────────────────
  const renderPublicCard = (battle: Battle, prominentJoin = false) => {
    const membership = myMembershipFor(battle.id);
    return (
      <PublicBattleCard
        key={battle.id}
        battle={battle}
        stats={categoryStatsMap[battle.id] ?? []}
        myCategoryId={membership?.categoryId}
        joined={!!membership}
        seasonTitle={battle.seasonId ? seasons[battle.seasonId]?.title : undefined}
        expanded={expandedBattles.has(battle.id)}
        prominentJoin={prominentJoin}
        onToggleExpand={() => toggleExpanded(battle.id)}
        onPress={() => router.push(`/battle/${battle.id}` as any)}
        onPressJoin={() => {
          if (activeBattles.length >= 2) {
            Alert.alert(t('battle.participationLimitTitle'), t('battle.participationLimitBody'));
            return;
          }
          setCategoryModalBattle(battle);
        }}
      />
    );
  };
  const publicCard = (battle: Battle) => renderPublicCard(battle);

  function renderUpcomingChallenges() {
    if (upcomingPublicBattles.length === 0) return null;
    return (
      <View style={styles.upcomingSection}>
        <View>
          <Text style={styles.sectionTitle}>{t('battle.upcomingChallenges')}</Text>
          <Text style={styles.choiceHint}>{t('battle.upcomingHint')}</Text>
        </View>
        {upcomingPublicBattles.map(publicCard)}
      </View>
    );
  }

  function renderWeeklyCard() {
    const rollingTotalKm = rollingBuckets.reduce((sum, day) => sum + day.km, 0);
    return (
      <View>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('battle.lastSevenDays')}</Text>
        </View>
        <Card style={styles.card}>
          <View style={styles.weekHead}>
            <View>
              <Text style={styles.weekLabel}>{t('battle.totalDistance')}</Text>
              <View style={styles.weekValueRow}>
                <Text style={styles.weekValue}>{rollingTotalKm.toFixed(1)}</Text>
                <Text style={styles.weekUnit}>km</Text>
              </View>
            </View>
          </View>

          <View style={styles.weekChart}>
            <WeeklyBarChart days={rollingBuckets} height={70} showTotal={false} periodLabel={t('battle.lastSevenDays')} />
          </View>

          {user?.weeklyGoal && (
            <WeeklyGoalProgress goal={user.weeklyGoal} days={calendarWeekBuckets} compact />
          )}

          <View style={styles.weekFoot}>
            <StreakChip days={streak} />
          </View>
        </Card>
      </View>
    );
  }

  function renderRunNowButton() {
    const label = activeBattles.length === 1
      ? t('battle.runAddedToOne', { title: displayedBattle?.title ?? '' })
      : activeBattles.length > 1
        ? t('battle.runAddedToMany', { count: activeBattles.length })
        : t('battle.runAddedAfterJoin');
    return (
      <View style={styles.runNowSection}>
        <TouchableOpacity
          style={styles.runNowBtn}
          onPress={() => router.push('/(tabs)/record' as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="walk" size={21} color={Colors.textOnAccent} />
          <Text style={styles.runNowLabel}>{t('battle.runNow')}</Text>
        </TouchableOpacity>
        <Text style={styles.runNowHint}>{label}</Text>
      </View>
    );
  }

  // ── State A: 参加中レイアウト ──────────────────────────────
  function renderParticipatingView() {
    return (
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {sortedActiveBattles.length > 1 && (
          <ActiveBattleSwitcher
            items={sortedActiveBattles.map((battle) => ({
              battle,
              stats: categoryStatsMap[battle.id] ?? [],
              myCategoryId: myMembershipFor(battle.id)?.categoryId,
            }))}
            selectedBattleId={displayedBattle?.id ?? null}
            onSelect={setSelectedBattleId}
          />
        )}
        {displayedBattle && (
          <ActiveBattleHero
            battle={displayedBattle}
            stats={categoryStatsMap[displayedBattle.id] ?? []}
            myCategoryId={displayedCategoryId}
            myDist={teamRanking.teamSize > 0 ? teamRanking.myKm : (myDistancePerBattle[displayedBattle.id] ?? 0)}
            teamRank={
              teamRanking.myRank > 0
                ? {
                    myRank: teamRanking.myRank,
                    teamSize: teamRanking.teamSize,
                    gapToNextKm: teamRanking.gapToNextKm,
                  }
                : undefined
            }
            activeBattleCount={activeBattles.length}
            onPress={() => router.push(`/battle/${displayedBattle.id}` as any)}
          />
        )}
        {displayedBattle && user?.runDeclarationVisible && (
          <DeclarationCard
            declaration={ownDeclaration}
            battleTitle={displayedBattle.title}
            battleType={displayedBattle.type}
            onDeclare={handleDeclareRun}
            onUpdate={handleUpdateDeclaration}
            onCancel={handleCancelDeclaration}
          />
        )}
        {displayedBattle && user && !user.runDeclarationVisible && (
          <Card style={styles.declarationPrivacyCard}>
            <View style={styles.declarationPrivacyIcon}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primaryDark} />
            </View>
            <View style={styles.declarationPrivacyCopy}>
              <Text style={styles.declarationPrivacyTitle}>{t('battle.declarationPrivateTitle')}</Text>
              <Text style={styles.declarationPrivacyText}>{t('battle.declarationPrivateBody')}</Text>
            </View>
            <TouchableOpacity
              style={styles.declarationPrivacyButton}
              onPress={() => router.push('/(tabs)/profile' as any)}
              accessibilityRole="button"
              accessibilityLabel={t('battle.declarationSettingsA11y')}
            >
              <Text style={styles.declarationPrivacyButtonText}>{t('profile.settings')}</Text>
            </TouchableOpacity>
          </Card>
        )}
        {displayedBattle && user && (
          <RunningPresenceCard
            presences={visiblePresences}
            currentUserId={user.id}
            battleId={displayedBattle.id}
            onCheer={handleCheerPresence}
            onOpenSafety={openSafety}
          />
        )}
        {renderWeeklyCard()}

        {/* チーム内ランキング（自分の陣営の中での順位） */}
        {displayedBattle && (teamRanking.top.length > 0 || teamRanking.error) && (
          <View>
            <Text style={styles.sectionTitle}>{t('battle.teamRanking')}</Text>
            <TeamRankingCard
              ranking={teamRanking}
              contributions={processContributions}
              currentUserId={user?.id}
              blockedUserIds={blockedUserIds}
              teamColor={displayedCategoryId
                ? teamColorMap(displayedBattle.categories)[displayedCategoryId]
                : undefined}
              onPressMore={() => router.push(`/battle/${displayedBattle.id}` as any)}
            />
          </View>
        )}

        {displayedBattle && declarations.length > 0 && user && (
          <DeclarationList
            declarations={declarations}
            currentUserId={user.id}
            onCheer={handleCheerDeclaration}
            onOpenSafety={openSafety}
          />
        )}

        {renderRunNowButton()}

        {/* 友達チャレンジの作成・招待・一覧はフレンドタブへ集約する。 */}
        <View style={styles.otherSection}>
          <Text style={styles.sectionTitle}>{t('battle.otherChallenges')}</Text>
          <Text style={styles.choiceHint}>{t('battle.publicLimitHint')}</Text>
        </View>

        {otherPublicBattles.length === 0
          ? <EmptyState
              icon="trophy-outline"
              title={t('battle.noOtherPublic')}
              hint={t('battle.inviteFromFriendsHint')}
            />
          : otherPublicBattles.map(publicCard)}

        {renderUpcomingChallenges()}
      </ScrollView>
    );
  }

  // ── State B: 未参加レイアウト ──────────────────────────────
  function renderNotParticipatingView() {
    const choices = activePublicBattles.slice(0, 3);
    const remainingChoices = activePublicBattles.slice(3);
    return (
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {choices.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <Ionicons name="trophy-outline" size={40} color={Colors.textTertiary} />
            <Text style={styles.emptyStateTitle}>{t('battle.noActive')}</Text>
            <Text style={styles.emptyStateHint}>{t('battle.waitForPublic')}</Text>
          </View>
        ) : (
          <>
            <View>
              <Text style={styles.sectionTitle}>{t('battle.chooseChallenge')}</Text>
              <Text style={styles.choiceHint}>{t('battle.activeLimitHint')}</Text>
            </View>
            {choices.map((battle) => renderPublicCard(battle, true))}
          </>
        )}

        {remainingChoices.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('battle.otherPublic')}</Text>
            {remainingChoices.map((battle) => renderPublicCard(battle, true))}
          </>
        )}

        {renderUpcomingChallenges()}

        <Button
          label={t('battle.runWithoutJoining')}
          onPress={() => router.push('/(tabs)/record' as any)}
          variant="secondary"
        />

        <Button
          label={t('battle.joinWithCode')}
          onPress={() => router.push('/(tabs)/friends' as any)}
          variant="secondary"
        />
      </ScrollView>
    );
  }

  // ── JSX ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>ZELIO</Text>
          <Text style={styles.headerTitle} maxFontSizeMultiplier={1.5}>{t('battle.title')}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/notifications' as any)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.notifBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={unreadNotifications > 0
            ? t('common.unreadNotifications', { count: unreadNotifications })
            : t('common.notifications')}
        >
          <Ionicons name="notifications-outline" size={20} color={Colors.textPrimary} />
          {unreadNotifications > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loadFailed && (
        <View style={styles.loadErrorBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={Colors.error} />
          <Text style={styles.loadErrorText}>{t('battle.loadFailed')}</Text>
          <TouchableOpacity onPress={() => setReloadKey((key) => key + 1)} accessibilityRole="button">
            <Text style={styles.loadErrorRetry}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loadFailed && categoryStatsFailed && (
        <View style={styles.loadErrorBanner} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={16} color={Colors.error} />
          <Text style={styles.loadErrorText}>{t('battle.statsLoadFailed')}</Text>
          <TouchableOpacity
            onPress={() => { publicStats.retry(); privateStats.retry(); }}
            accessibilityRole="button"
            accessibilityLabel={t('battle.retryStatsA11y')}
          >
            <Text style={styles.loadErrorRetry}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {localLoading || isLoading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : isParticipating ? (
        renderParticipatingView()
      ) : (
        renderNotParticipatingView()
      )}

      {/* チーム選択モーダル（パブリックラン用） */}
      <CategorySelectModal
        visible={categoryModalBattle !== null}
        battle={categoryModalBattle}
        stats={categoryModalBattle ? categoryStatsMap[categoryModalBattle.id] ?? [] : []}
        onJoin={(catId) => categoryModalBattle && handleJoin(categoryModalBattle, catId)}
        onClose={() => setCategoryModalBattle(null)}
        loading={joiningBattleId === categoryModalBattle?.id}
      />
      {user && (
        <SafetyActionsModal
          visible={safetyTarget !== null}
          currentUserId={user.id}
          target={safetyTarget}
          targetDisplayName={safetyDisplayName || t('battle.fallbackUser')}
          onClose={() => setSafetyTarget(null)}
        />
      )}
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────
// スタイル（container 側で使う分のみ。カード等の見た目は各コンポーネントに移設済み）
// ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  loadErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loadErrorText: { flex: 1, fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  loadErrorRetry: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.primaryDark },
  // ヘッダーは背景と地続き（境界線なし）。小さなブランド行＋大見出しの2段組
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.background,
  },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: Spacing.md },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textTertiary,
    letterSpacing: 1.8,
  },
  headerTitle: {
    marginTop: 2,
    fontSize: 26,
    fontWeight: Typography.fontWeight.extrabold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  notifBtn: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  notifBadge: {
    position: 'absolute', top: 5, right: 5,
    minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.textOnAccent },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.xl },

  card: { marginBottom: 0, marginHorizontal: 0 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  sectionNote: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
    marginBottom: Spacing.md,
  },
  choiceHint: { marginTop: -Spacing.sm, fontSize: Typography.fontSize.sm, color: Colors.textSecondary },

  // 今週の走り
  weekHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  weekLabel: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, fontWeight: Typography.fontWeight.medium },
  weekValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  weekValue: {
    fontSize: 27,
    fontWeight: Typography.fontWeight.extrabold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  weekUnit: { marginLeft: 4, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
  weekChart: { marginTop: Spacing.xl },
  weekFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },

  declarationPrivacyCard: { marginHorizontal: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  declarationPrivacyIcon: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  declarationPrivacyCopy: { flex: 1, minWidth: 0 },
  declarationPrivacyTitle: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  declarationPrivacyText: { marginTop: 2, fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  declarationPrivacyButton: {
    minHeight: 36, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  declarationPrivacyButtonText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.primaryDark },

  // Run Now
  runNowSection: { gap: Spacing.sm },
  runNowHint: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, textAlign: 'center' },
  runNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    shadowColor: Colors.accentDark,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  runNowLabel: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.extrabold, color: Colors.textOnAccent },

  // 他のバトル
  otherSection: { gap: 0 },
  upcomingSection: { gap: Spacing.md },

  // Empty state (State B)
  emptyStateCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing['3xl'],
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyStateTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: Colors.textSecondary },
  emptyStateHint: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center' },

});
