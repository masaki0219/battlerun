import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { getDoc, doc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import { parseLocalDate } from '../../utils/dateInput';
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
import { useRecentActivities } from '../../hooks/useRecentActivities';
import { useBattleCategoryStats } from '../../hooks/useBattleCategoryStats';
import { registerPushToken, scheduleBattleEndNotification, scheduleBattleEnd1hNotification } from '../../lib/notifications';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { WeeklyBarChart } from '../../components/viz/WeeklyBarChart';
import { StreakChip } from '../../components/viz/StreakChip';
import { CategorySelectModal } from '../../components/battle/CategorySelectModal';
import { ActiveBattleHero } from '../../components/battle/ActiveBattleHero';
import { PublicBattleCard } from '../../components/battle/PublicBattleCard';
import { PrivateBattleCard } from '../../components/battle/PrivateBattleCard';
import { PrivateBattleCreateForm } from '../../components/battle/PrivateBattleCreateForm';
import { InviteCodeJoinView } from '../../components/battle/InviteCodeJoinView';
import { JoinRecommendationCard } from '../../components/battle/JoinRecommendationCard';
import { TeamRankingCard } from '../../components/battle/TeamRankingCard';
import { useTeamRanking } from '../../hooks/useTeamRanking';
import { weeklyBuckets, streakDays, weekOverWeek, weekStartLabel } from '../../utils/displayStats';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../design_tokens';
import type { Battle, Category, CategoryStats } from '../../types';

type Tab = 'public' | 'private';
type PrivateView = 'list' | 'create' | 'join_code' | 'join_select';

// ────────────────────────────────────────────────────────────────
// メイン画面（state・購読・handler を集約。表示は components/battle/* に委譲）
// ────────────────────────────────────────────────────────────────
export default function BattleScreen() {
  const { user } = useAuthStore();
  const userIsPro = user?.plan === 'pro';
  const unreadNotifications = useUnreadNotifications();
  const {
    publicBattles, privateBattles, myMemberships, seasons, isLoading,
    fetchPublicBattles, fetchMyMemberships, fetchMyPrivateBattles, fetchSeason,
    joinBattle, createBattle, findBattleByInviteCode,
  } = useBattleStore();

  const [activeTab, setActiveTab] = useState<Tab>('public');
  const [joiningBattleId, setJoiningBattleId] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(true);

  // 各バトルの陣営統計をリアルタイム購読（public / private を同一フックで共通化）
  const publicStatsMap = useBattleCategoryStats(publicBattles);
  const privateStatsMap = useBattleCategoryStats(privateBattles);
  const categoryStatsMap: Record<string, CategoryStats[]> = { ...publicStatsMap, ...privateStatsMap };

  // 区分選択モーダル
  const [categoryModalBattle, setCategoryModalBattle] = useState<Battle | null>(null);

  // 友達チャレンジビュー
  const [privateView, setPrivateView] = useState<PrivateView>('list');
  const [inviteCode, setInviteCode] = useState('');
  const [foundBattle, setFoundBattle] = useState<Battle | null>(null);
  const [searching, setSearching] = useState(false);

  // 友達チャレンジ作成フォーム
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createCategories, setCreateCategories] = useState<Category[]>([
    { id: '', label: '' },
    { id: '', label: '' },
  ]);
  const [createRankingType, setCreateRankingType] = useState<'average' | 'total'>('average');
  const [createStartAt, setCreateStartAt] = useState('');
  const [createEndAt, setCreateEndAt] = useState('');
  const [creating, setCreating] = useState(false);

  // 参加者個人距離（バトルIDごと）
  const [myDistancePerBattle, setMyDistancePerBattle] = useState<Record<string, number>>({});
  // 一覧カードの陣営折りたたみ状態
  const [expandedBattles, setExpandedBattles] = useState<Set<string>>(new Set());

  // 直近アクティビティ（週間バー・ストリーク用）※read-only、useRecentActivities のみ
  const { activities: recentActivities } = useRecentActivities(50);
  const weekBuckets = weeklyBuckets(recentActivities);
  const streak = streakDays(recentActivities);
  const week = weekOverWeek(recentActivities);

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
    Promise.all([
      fetchPublicBattles(),
      fetchMyMemberships(user.id),
      fetchMyPrivateBattles(user.id),
    ]).finally(() => setLocalLoading(false));
  }, [user]);

  useEffect(() => {
    const ids = [...new Set(
      publicBattles.map((b) => b.seasonId).filter((id): id is string => !!id)
    )];
    ids.forEach((id) => fetchSeason(id));
  }, [publicBattles]);

  // ── アクティブバトルの計算 ─────────────────────────────────
  const now = Date.now();
  const allBattles = [...publicBattles, ...privateBattles];
  const myBattleIdSet = new Set(myMemberships.map((m) => m.battleId));
  const activeBattles = allBattles.filter(
    (b) =>
      myBattleIdSet.has(b.id) &&
      b.status === 'active' &&
      new Date(b.startAt).getTime() <= now &&
      now <= new Date(b.endAt).getTime(),
  );
  const isParticipating = activeBattles.length > 0;
  const primaryBattle = activeBattles[0] ?? null;
  const primaryMembership = primaryBattle
    ? myMemberships.find((m) => m.battleId === primaryBattle.id)
    : null;
  const primaryCategoryId = primaryMembership?.categoryId ?? null;

  // 自分の陣営内での立ち位置（ヒーローのフッターとチーム内ランキングで共用）
  const teamRanking = useTeamRanking(primaryBattle?.id, primaryCategoryId, user?.id);

  // Day-0アクティベーション: 未参加ユーザーに開催中のパブリックランを1件だけ強く提示する
  const recommendedBattle = publicBattles.find(
    (b) => b.status === 'active' && !myMemberships.some((m) => m.battleId === b.id),
  ) ?? null;
  const recommendedStats = recommendedBattle ? (categoryStatsMap[recommendedBattle.id] ?? []) : [];
  const recommendedShortageCategory = recommendedBattle
    ? recommendedBattle.categories.reduce<Category | null>((min, cat) => {
        const count = recommendedStats.find((s) => s.categoryId === cat.id)?.participantCount ?? 0;
        const minCount = min ? (recommendedStats.find((s) => s.categoryId === min.id)?.participantCount ?? 0) : Infinity;
        return count < minCount ? cat : min;
      }, null)
    : null;

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
  }, [user?.id, myMemberships.length, publicBattles.length, privateBattles.length]);

  // ── ヘルパー ──────────────────────────────────────────────
  function myMembershipFor(battleId: string) {
    return myMemberships.find((m) => m.battleId === battleId);
  }

  // ── ジョイン処理 ──────────────────────────────────────────
  async function handleJoin(battle: Battle, categoryId: string) {
    if (!user) return;
    setJoiningBattleId(battle.id);
    try {
      await joinBattle(battle.id, categoryId, user.id);
      void registerPushToken(user.id, true);
      void scheduleBattleEndNotification(battle);
      void scheduleBattleEnd1hNotification(battle);
      setCategoryModalBattle(null);
      Alert.alert(
        '参加完了',
        `「${battle.categories.find((c) => c.id === categoryId)?.label}」として参加しました。最初のランで陣営に貢献しよう`,
        [
          { text: 'あとで', style: 'cancel' },
          { text: 'ランを始める', onPress: () => router.push('/(tabs)/record' as any) },
        ],
      );
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '参加に失敗しました');
    } finally {
      setJoiningBattleId(null);
    }
  }

  async function handleSearchInviteCode() {
    if (!inviteCode.trim()) return;
    setSearching(true);
    try {
      const battle = await findBattleByInviteCode(inviteCode);
      setFoundBattle(battle);
      setPrivateView('join_select');
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '招待コードが見つかりません');
    } finally {
      setSearching(false);
    }
  }

  async function handleCreateBattle() {
    if (!user) return;
    if (!createTitle.trim()) {
      Alert.alert('入力エラー', 'チャレンジ名を入力してください');
      return;
    }
    const validCats = createCategories.filter((c) => c.label.trim());
    if (validCats.length < 2) {
      Alert.alert('入力エラー', '区分を2つ以上入力してください');
      return;
    }
    if (!createStartAt || !createEndAt) {
      Alert.alert('入力エラー', '開始日と終了日を入力してください（YYYY-MM-DD）');
      return;
    }
    // UTC解釈（new Date('YYYY-MM-DD')）だとJSTでは朝9:00が締切になるため、ローカルで解釈し
    // 終了日は23:59:59まで含める（PeriodPickerの「終了日の23:59まで」表示・admin側と同じ扱い）。
    const startDate = parseLocalDate(createStartAt);
    const endDate = parseLocalDate(createEndAt, true);
    if (!startDate || !endDate) {
      Alert.alert('入力エラー', '日付の形式が正しくありません（例: 2026-06-01）');
      return;
    }
    if (endDate <= startDate) {
      Alert.alert('入力エラー', '終了日は開始日より後にしてください');
      return;
    }

    setCreating(true);
    try {
      await createBattle({
        title: createTitle.trim(),
        description: createDesc.trim(),
        // ID生成は createBattle 側に集約。ラベルのみ渡す（id は無視される）。
        categories: validCats.map((c) => ({ id: '', label: c.label.trim() })),
        rankingType: createRankingType,
        startAt: startDate,
        endAt: endDate,
        userId: user.id,
        isPublic: false,
      });
      await fetchMyPrivateBattles(user.id);
      setPrivateView('list');
      resetCreateForm();
      Alert.alert('作成完了', 'チャレンジを作成しました！招待コードはチャレンジ一覧から確認できます');
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '作成に失敗しました');
    } finally {
      setCreating(false);
    }
  }

  function resetCreateForm() {
    setCreateTitle('');
    setCreateDesc('');
    setCreateCategories([{ id: '', label: '' }, { id: '', label: '' }]);
    setCreateRankingType('average');
    setCreateStartAt('');
    setCreateEndAt('');
  }

  function addCategory() {
    setCreateCategories((prev) => [...prev, { id: '', label: '' }]);
  }
  function removeCategory(index: number) {
    setCreateCategories((prev) => prev.filter((_, i) => i !== index));
  }
  function updateCategoryLabel(index: number, label: string) {
    setCreateCategories((prev) => prev.map((c, i) => (i === index ? { ...c, label } : c)));
  }

  function copyInvite(code: string) {
    void Clipboard.setStringAsync(code);
    Alert.alert('コピーしました', `招待コード: ${code}`);
  }

  // ── 表示部品（小さいものは inline） ────────────────────────
  const publicCard = (battle: Battle) => {
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
        onToggleExpand={() => toggleExpanded(battle.id)}
        onPress={() => router.push(`/battle/${battle.id}` as any)}
        onPressJoin={() => setCategoryModalBattle(battle)}
      />
    );
  };

  const privateCard = (battle: Battle) => (
    <PrivateBattleCard
      key={battle.id}
      battle={battle}
      stats={categoryStatsMap[battle.id] ?? []}
      myCategoryId={myMembershipFor(battle.id)?.categoryId}
      expanded={expandedBattles.has(battle.id)}
      onToggleExpand={() => toggleExpanded(battle.id)}
      onPress={() => router.push(`/battle/${battle.id}` as any)}
      onCopyInvite={copyInvite}
    />
  );

  const createForm = (
    <PrivateBattleCreateForm
      title={createTitle}
      desc={createDesc}
      categories={createCategories}
      rankingType={createRankingType}
      startAt={createStartAt}
      endAt={createEndAt}
      creating={creating}
      onChangeTitle={setCreateTitle}
      onChangeDesc={setCreateDesc}
      onAddCategory={addCategory}
      onRemoveCategory={removeCategory}
      onChangeCategoryLabel={updateCategoryLabel}
      onChangeRankingType={setCreateRankingType}
      onChangeStartAt={setCreateStartAt}
      onChangeEndAt={setCreateEndAt}
      onSubmit={handleCreateBattle}
      onCancel={() => { setPrivateView('list'); resetCreateForm(); }}
    />
  );

  const inviteJoinView = (view: 'join_code' | 'join_select') => (
    <InviteCodeJoinView
      view={view}
      inviteCode={inviteCode}
      onChangeInviteCode={setInviteCode}
      searching={searching}
      onSearch={handleSearchInviteCode}
      onCancelCode={() => { setPrivateView('list'); setInviteCode(''); }}
      foundBattle={foundBattle}
      joining={joiningBattleId === foundBattle?.id}
      onJoinCategory={(catId) => foundBattle && handleJoin(foundBattle, catId)}
      onBackToCode={() => { setPrivateView('join_code'); setFoundBattle(null); }}
    />
  );

  function renderWeeklyCard() {
    const up = week.changeRatio != null && week.changeRatio >= 0;
    return (
      <View>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>今週の走り</Text>
          <Text style={styles.sectionNote}>{weekStartLabel()}</Text>
        </View>
        <Card style={styles.card}>
          <View style={styles.weekHead}>
            <View>
              <Text style={styles.weekLabel}>週合計距離</Text>
              <View style={styles.weekValueRow}>
                <Text style={styles.weekValue}>{week.thisWeekKm.toFixed(1)}</Text>
                <Text style={styles.weekUnit}>km</Text>
              </View>
            </View>
            {week.changeRatio != null && (
              <View style={[styles.deltaChip, !up && styles.deltaChipDown]}>
                <Text style={[styles.deltaText, !up && styles.deltaTextDown]}>
                  先週比 {up ? '+' : ''}{Math.round(week.changeRatio * 100)}%
                </Text>
              </View>
            )}
          </View>

          <View style={styles.weekChart}>
            <WeeklyBarChart days={weekBuckets} height={70} showTotal={false} />
          </View>

          <View style={styles.weekFoot}>
            <StreakChip days={streak} />
            {week.lastWeekKm > 0 && (
              <Text style={styles.weekFootNote}>先週 {week.lastWeekKm.toFixed(1)} km</Text>
            )}
          </View>
        </Card>
      </View>
    );
  }

  function renderRunNowButton() {
    const label = activeBattles.length === 1
      ? `今回の走行距離は「${primaryBattle?.title}」に加算されます`
      : activeBattles.length > 1
        ? `今回の走行距離は参加中の${activeBattles.length}件のチャレンジに加算されます`
        : 'チャレンジに参加すると今回の距離が加算されます';
    return (
      <View style={styles.runNowSection}>
        <TouchableOpacity
          style={styles.runNowBtn}
          onPress={() => router.push('/(tabs)/record' as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="walk" size={21} color={Colors.textOnAccent} />
          <Text style={styles.runNowLabel}>今すぐ走る</Text>
        </TouchableOpacity>
        <Text style={styles.runNowHint}>{label}</Text>
      </View>
    );
  }

  // ── State A: 参加中レイアウト ──────────────────────────────
  function renderParticipatingView() {
    return (
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {primaryBattle && (
          <ActiveBattleHero
            battle={primaryBattle}
            stats={categoryStatsMap[primaryBattle.id] ?? []}
            myCategoryId={primaryCategoryId}
            myDist={teamRanking.teamSize > 0 ? teamRanking.myKm : (myDistancePerBattle[primaryBattle.id] ?? 0)}
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
            onPress={() => router.push(`/battle/${primaryBattle.id}` as any)}
          />
        )}
        {renderWeeklyCard()}

        {/* チーム内ランキング（自分の陣営の中での順位） */}
        {primaryBattle && teamRanking.top.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>チーム内ランキング</Text>
            <TeamRankingCard
              ranking={teamRanking}
              onPressMore={() => router.push(`/battle/${primaryBattle.id}` as any)}
            />
          </View>
        )}

        {renderRunNowButton()}

        {/* 他のバトル セクション */}
        <View style={styles.otherSection}>
          <Text style={styles.sectionTitle}>他のチャレンジ</Text>
          <View style={styles.segmentRow}>
            {(['public', 'private'] as Tab[]).map((tab) => {
              const active = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => { setActiveTab(tab); setPrivateView('list'); }}
                >
                  <Ionicons
                    name={tab === 'public' ? 'trophy-outline' : 'lock-closed-outline'}
                    size={14}
                    color={active ? Colors.textPrimary : Colors.textTertiary}
                  />
                  <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                    {tab === 'public' ? '公開チャレンジ' : '友達チャレンジ'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {activeTab === 'public' ? (
          publicBattles.length === 0
            ? <EmptyState
                icon="trophy-outline"
                title="開催中の公開チャレンジがありません"
                hint="友達チャレンジで仲間と競うこともできます"
              />
            : publicBattles.map(publicCard)
        ) : (
          <>
            {privateView === 'list' && (
              <>
                {privateBattles.length === 0 && (
                  <EmptyState
                    icon="people-outline"
                    title="参加中の友達チャレンジがありません"
                    hint="招待コードで友達チャレンジに参加できます"
                  />
                )}
                {privateBattles.map(privateCard)}
                <Button
                  label={userIsPro ? '＋ 新しいチャレンジを作る' : '＋ 新しいチャレンジを作る（Pro）'}
                  onPress={() => {
                    if (!userIsPro) {
                      Alert.alert('Proプランが必要です',
                        '友達チャレンジの作成にはProプランが必要です。\nプロフィール画面からアップグレードできます。');
                      return;
                    }
                    setPrivateView('create');
                  }}
                  style={{ marginTop: Spacing.sm }}
                />
                <Button label="招待コードで参加"
                  onPress={() => setPrivateView('join_code')}
                  variant="secondary" style={{ marginTop: Spacing.sm }} />
              </>
            )}
            {privateView === 'create' && createForm}
            {privateView === 'join_code' && inviteJoinView('join_code')}
            {privateView === 'join_select' && inviteJoinView('join_select')}
          </>
        )}
      </ScrollView>
    );
  }

  // ── State B: 未参加レイアウト ──────────────────────────────
  function renderNotParticipatingView() {
    return (
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {recommendedBattle ? (
          <JoinRecommendationCard
            battle={recommendedBattle}
            stats={recommendedStats}
            shortageCategory={recommendedShortageCategory}
            onPress={() => setCategoryModalBattle(recommendedBattle)}
          />
        ) : (
          <View style={styles.emptyStateCard}>
            <Ionicons name="trophy-outline" size={40} color={Colors.textTertiary} />
            <Text style={styles.emptyStateTitle}>参加中のチャレンジはありません</Text>
            <Text style={styles.emptyStateHint}>下のチャレンジに参加して距離を競おう！</Text>
          </View>
        )}

        {/* パブリックバトル一覧 */}
        {publicBattles.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>公開チャレンジ</Text>
            {publicBattles.map(publicCard)}
          </>
        )}

        {/* 招待コードで参加 */}
        {privateView === 'list' && (
          <Card style={[styles.card, { marginTop: Spacing.lg }]}>
            <Text style={styles.formTitle}>友達チャレンジに参加</Text>
            <Text style={styles.inputLabel}>6桁の招待コード</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={inviteCode}
              onChangeText={(v) => setInviteCode(v.toUpperCase())}
              placeholder="例: A3F9KZ"
              placeholderTextColor={Colors.textTertiary}
              maxLength={6}
              autoCapitalize="characters"
            />
            <Button label="検索" onPress={handleSearchInviteCode} loading={searching} style={{ marginTop: Spacing.md }} />
          </Card>
        )}
        {privateView === 'join_code' && inviteJoinView('join_code')}
        {privateView === 'join_select' && inviteJoinView('join_select')}

        {/* チャレンジ作成（Proのみ） */}
        {privateView === 'list' && (
          <Button
            label={userIsPro ? '＋ 友達チャレンジを作る' : '＋ 友達チャレンジを作る（Pro）'}
            onPress={() => {
              if (!userIsPro) {
                Alert.alert('Proプランが必要です',
                  '友達チャレンジの作成にはProプランが必要です。\nプロフィール画面からアップグレードできます。');
                return;
              }
              setPrivateView('create');
            }}
            style={{ marginTop: Spacing.sm }}
          />
        )}
        {privateView === 'create' && createForm}
      </ScrollView>
    );
  }

  // ── JSX ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>ZELIO</Text>
          <Text style={styles.headerTitle}>チャレンジ</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/notifications' as any)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.notifBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={unreadNotifications > 0 ? `通知、未読${unreadNotifications}件` : '通知'}
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

      {localLoading || isLoading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : isParticipating ? (
        renderParticipatingView()
      ) : (
        renderNotParticipatingView()
      )}

      {/* 区分選択モーダル（パブリックラン用） */}
      <CategorySelectModal
        visible={categoryModalBattle !== null}
        battle={categoryModalBattle}
        onJoin={(catId) => categoryModalBattle && handleJoin(categoryModalBattle, catId)}
        onClose={() => setCategoryModalBattle(null)}
        loading={joiningBattleId === categoryModalBattle?.id}
      />
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────
// スタイル（container 側で使う分のみ。カード等の見た目は各コンポーネントに移設済み）
// ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
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
  deltaChip: {
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  deltaChipDown: { backgroundColor: Colors.surfaceGray },
  deltaText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.primary, fontVariant: ['tabular-nums'] },
  deltaTextDown: { color: Colors.textSecondary },
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
  weekFootNote: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, fontVariant: ['tabular-nums'] },

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

  // Segment tabs
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  segment: { flex: 1, flexDirection: 'row', gap: 5, paddingVertical: Spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm },
  segmentActive: { backgroundColor: Colors.surface, ...Shadow.sm },
  segmentLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, fontWeight: Typography.fontWeight.medium },
  segmentLabelActive: { color: Colors.textPrimary, fontWeight: Typography.fontWeight.bold },

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
  emptyStateHint: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary, textAlign: 'center' },

  // State B のインライン招待コード入力カード
  formTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.lg },
  inputLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.md },
  input: {
    backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.md, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  codeInput: { fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.bold, textAlign: 'center', letterSpacing: 4 },
});
