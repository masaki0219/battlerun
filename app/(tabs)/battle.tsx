import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, KeyboardAvoidingView,
  Platform, Modal, Pressable, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import {
  onSnapshot, collection, getDocs, query, where, getDoc, doc, Timestamp,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
import { isPro } from '../../lib/pro';
import { scheduleBattleEndNotification, scheduleBattleEnd1hNotification } from '../../lib/notifications';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../design_tokens';
import type { Battle, CategoryStats, Category } from '../../types';

type Tab = 'public' | 'private';
type PrivateView = 'list' | 'create' | 'join_code' | 'join_select';

// ────────────────────────────────────────────────────────────────
// 区分選択モーダル
// ────────────────────────────────────────────────────────────────
function CategorySelectModal({
  visible,
  battle,
  onJoin,
  onClose,
  loading,
}: {
  visible: boolean;
  battle: Battle | null;
  onJoin: (categoryId: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setSelected(null);
  }, [visible]);

  if (!battle) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modal.overlay} onPress={onClose}>
        <Pressable style={modal.sheet} onPress={() => {}}>
          <View style={modal.handle} />
          <Text style={modal.title}>{battle.title}</Text>
          <Text style={modal.subtitle}>参加する区分を選んでください</Text>

          <FlatList
            data={battle.categories}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => {
              const isSelected = selected === item.id;
              return (
                <TouchableOpacity
                  style={[modal.catBtn, isSelected && modal.catBtnSelected]}
                  onPress={() => setSelected(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[modal.catLabel, isSelected && modal.catLabelSelected]}>
                    {item.label}
                  </Text>
                  {isSelected && <Text style={modal.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.lg }}
          />

          <Button
            label="参加する"
            onPress={() => { if (selected) onJoin(selected); }}
            loading={loading}
            style={{ opacity: selected ? 1 : 0.4 }}
          />
          <Button label="キャンセル" onPress={onClose} variant="ghost" style={{ marginTop: Spacing.sm }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────
// メイン画面
// ────────────────────────────────────────────────────────────────
export default function BattleScreen() {
  const { user, proEntitlement } = useAuthStore();
  const userIsPro = isPro(user?.plan, proEntitlement);
  const unreadNotifications = useUnreadNotifications();
  const {
    publicBattles, privateBattles, myMemberships, seasons, isLoading,
    fetchPublicBattles, fetchMyMemberships, fetchMyPrivateBattles, fetchSeason,
    joinBattle, createBattle, findBattleByInviteCode,
  } = useBattleStore();

  const [activeTab, setActiveTab] = useState<Tab>('public');
  const [categoryStatsMap, setCategoryStatsMap] = useState<Record<string, CategoryStats[]>>({});
  const [joiningBattleId, setJoiningBattleId] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(true);

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
  // 今週の集計
  const [weeklyDistanceKm, setWeeklyDistanceKm] = useState(0);
  const [weeklyCount, setWeeklyCount] = useState(0);

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

  // ── パブリックランの category_stats をリアルタイム購読 ──────
  useEffect(() => {
    if (!user || publicBattles.length === 0) return;
    const unsubs = publicBattles.map((battle) => {
      const colRef = collection(db, 'battles', battle.id, 'category_stats');
      return onSnapshot(colRef, (snap) => {
        const stats: CategoryStats[] = snap.docs.map((d) => {
          const catId = d.id;
          const label = battle.categories.find((c) => c.id === catId)?.label ?? catId;
          return {
            categoryId: catId,
            label,
            totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
            avgDistanceKm: (d.data()['avgDistanceKm'] as number) ?? 0,
            participantCount: (d.data()['participantCount'] as number) ?? 0,
          };
        });
        setCategoryStatsMap((prev) => ({ ...prev, [battle.id]: stats }));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [publicBattles]);

  // ── 友達チャレンジの category_stats もリアルタイム購読 ────
  useEffect(() => {
    if (!user || privateBattles.length === 0) return;
    const unsubs = privateBattles.map((battle) => {
      const colRef = collection(db, 'battles', battle.id, 'category_stats');
      return onSnapshot(colRef, (snap) => {
        const stats: CategoryStats[] = snap.docs.map((d) => {
          const catId = d.id;
          const label = battle.categories.find((c) => c.id === catId)?.label ?? catId;
          return {
            categoryId: catId,
            label,
            totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
            avgDistanceKm: (d.data()['avgDistanceKm'] as number) ?? 0,
            participantCount: (d.data()['participantCount'] as number) ?? 0,
          };
        });
        setCategoryStatsMap((prev) => ({ ...prev, [battle.id]: stats }));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [privateBattles]);

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

  // ── 今週の距離・回数 ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    getDocs(query(
      collection(db, 'activities'),
      where('userId', '==', user.id),
      where('startedAt', '>=', Timestamp.fromDate(monday)),
    ))
      .then((snap) => {
        let km = 0;
        snap.forEach((d) => { km += (d.data()['distanceKm'] as number) ?? 0; });
        setWeeklyDistanceKm(km);
        setWeeklyCount(snap.size);
      })
      .catch(() => {});
  }, [user?.id]);

  // ── ヘルパー関数 ──────────────────────────────────────────
  function myMembershipFor(battleId: string) {
    return myMemberships.find((m) => m.battleId === battleId);
  }

  function daysLeft(endAt: string): number | null {
    if (!endAt) return null;
    return Math.max(0, Math.ceil((new Date(endAt).getTime() - Date.now()) / 86400000));
  }

  function sortedStats(stats: CategoryStats[], rankingType: 'average' | 'total') {
    return [...stats].sort((a, b) =>
      rankingType === 'total'
        ? b.totalDistanceKm - a.totalDistanceKm
        : b.avgDistanceKm - a.avgDistanceKm,
    );
  }
  function maxStat(stats: CategoryStats[], rankingType: 'average' | 'total') {
    return Math.max(
      ...stats.map((s) => (rankingType === 'total' ? s.totalDistanceKm : s.avgDistanceKm)),
      0.01,
    );
  }
  function statValue(s: CategoryStats, rankingType: 'average' | 'total') {
    return rankingType === 'total' ? s.totalDistanceKm : s.avgDistanceKm;
  }
  function statLabel(s: CategoryStats, rankingType: 'average' | 'total') {
    return rankingType === 'total'
      ? `${s.totalDistanceKm.toFixed(1)}km`
      : `${s.avgDistanceKm.toFixed(1)}km/人`;
  }

  // ── ジョイン処理 ──────────────────────────────────────────
  async function handleJoin(battle: Battle, categoryId: string) {
    if (!user) return;
    setJoiningBattleId(battle.id);
    try {
      await joinBattle(battle.id, categoryId, user.id);
      void scheduleBattleEndNotification(battle);
      void scheduleBattleEnd1hNotification(battle);
      setCategoryModalBattle(null);
      Alert.alert(
        '参加完了',
        `「${battle.categories.find((c) => c.id === categoryId)?.label}」として参加しました。最初の出撃で陣営に貢献しよう`,
        [
          { text: 'あとで', style: 'cancel' },
          { text: '出撃する', onPress: () => router.push('/(tabs)/record' as any) },
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
    const startDate = new Date(createStartAt);
    const endDate = new Date(createEndAt);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      Alert.alert('入力エラー', '日付の形式が正しくありません（例: 2026-06-01）');
      return;
    }

    setCreating(true);
    try {
      const resolvedCats = validCats.map((c, i) => ({
        id: c.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || `cat${i}`,
        label: c.label.trim(),
      }));
      await createBattle({
        title: createTitle.trim(),
        description: createDesc.trim(),
        categories: resolvedCats,
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

  // ────────────────────────────────────────────────────────────────
  // State A: 参加中コンポーネント
  // ────────────────────────────────────────────────────────────────
  function renderActiveChallengeCard() {
    if (!primaryBattle) return null;
    const stats = categoryStatsMap[primaryBattle.id] ?? [];
    const sorted = sortedStats(stats, primaryBattle.rankingType);
    const myRank = sorted.findIndex((s) => s.categoryId === primaryCategoryId) + 1;
    const totalTeams = sorted.length;
    const days = daysLeft(primaryBattle.endAt);
    const myDist = myDistancePerBattle[primaryBattle.id] ?? 0;

    const topStat = sorted[0];
    const myStat = sorted.find((s) => s.categoryId === primaryCategoryId);
    const distToOvertake = myRank > 1 && topStat && myStat
      ? Math.max(0, statValue(topStat, primaryBattle.rankingType) - statValue(myStat, primaryBattle.rankingType) + 0.01)
      : 0;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(`/battle/${primaryBattle.id}` as any)}
      >
        <View style={styles.activeChallengeCard}>
          {/* ヘッダー */}
          <View style={styles.acHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.acTitle} numberOfLines={1}>{primaryBattle.title}</Text>
              {days !== null && (
                <Text style={styles.acDays}>残り {days} 日</Text>
              )}
            </View>
            {myRank > 0 && (
              <View style={styles.acRankBadge}>
                <Text style={styles.acRankText}>
                  {myRank === 1 ? '👑 ' : ''}{myRank}位 / {totalTeams}チーム
                </Text>
              </View>
            )}
          </View>

          {/* 自分の距離 */}
          <View style={styles.acDistRow}>
            <View>
              <Text style={styles.acDistLabel}>自分の合計距離</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text style={styles.acDistNum}>{myDist.toFixed(1)}</Text>
                <Text style={styles.acDistUnit}>km</Text>
              </View>
            </View>

            {/* 逆転ヒント */}
            {distToOvertake > 0 && (
              <View style={styles.acOvertake}>
                <Ionicons name="arrow-up" size={11} color={Colors.primary} />
                <Text style={styles.acOvertakeText}>
                  あと {distToOvertake < 0.1
                    ? `${Math.round(distToOvertake * 1000)}m`
                    : `${distToOvertake.toFixed(1)}km`} で逆転
                </Text>
              </View>
            )}
            {myRank === 1 && (
              <View style={[styles.acOvertake, { backgroundColor: `${Colors.accentYellow}22` }]}>
                <Text style={[styles.acOvertakeText, { color: Colors.accentYellow }]}>
                  👑 現在トップ！
                </Text>
              </View>
            )}
          </View>

          {/* 複数バトル参加中の場合 */}
          {activeBattles.length > 1 && (
            <View style={styles.multiBattleBadge}>
              <Ionicons name="flash" size={11} color={Colors.primary} />
              <Text style={styles.multiBattleText}>
                他 {activeBattles.length - 1} 件のバトルにも参加中
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  function renderWeeklyContributionRow() {
    return (
      <View style={styles.weeklyRow}>
        <Ionicons name="trending-up-outline" size={16} color={Colors.primary} />
        <Text style={styles.weeklyText}>
          今週{' '}
          <Text style={styles.weeklyBold}>{weeklyDistanceKm.toFixed(1)}km</Text>
          {' '}・{' '}
          <Text style={styles.weeklyBold}>{weeklyCount}回</Text>
        </Text>
      </View>
    );
  }

  function renderRunNowButton() {
    const label = activeBattles.length === 1
      ? `「${primaryBattle?.title}」に加算されます`
      : activeBattles.length > 1
        ? `参加中の${activeBattles.length}件のバトルに加算されます`
        : 'バトルへ加算されます';

    return (
      <View style={styles.runNowSection}>
        <Text style={styles.runNowHint}>{label}</Text>
        <TouchableOpacity
          style={styles.runNowBtn}
          onPress={() => router.push('/(tabs)/record' as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="walk" size={20} color="#fff" />
          <Text style={styles.runNowLabel}>今すぐ走る</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // パブリックランカード
  // ────────────────────────────────────────────────────────────────
  function renderPublicBattleCard(battle: Battle) {
    const stats = categoryStatsMap[battle.id] ?? [];
    const membership = myMembershipFor(battle.id);
    const myCatId = membership?.categoryId;
    const days = daysLeft(battle.endAt);
    const sorted = sortedStats(stats, battle.rankingType);
    const maxVal = maxStat(stats, battle.rankingType);

    return (
      <TouchableOpacity
        key={battle.id}
        activeOpacity={0.85}
        onPress={() => router.push(`/battle/${battle.id}` as any)}
      >
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.battleTitle}>{battle.title}</Text>
              <Text style={styles.battleMeta}>
                {days !== null ? `残り ${days} 日` : ''}
                {battle.seasonId && seasons[battle.seasonId]
                  ? `　${seasons[battle.seasonId].title}` : ''}
              </Text>
            </View>
            {membership && (
              <View style={styles.joinedBadge}>
                <Text style={styles.joinedBadgeText}>参加中</Text>
              </View>
            )}
          </View>

          {sorted.length > 0 && (
            <View style={styles.statsSection}>
              {sorted.map((s, i) => {
                const isMine = s.categoryId === myCatId;
                const barColor = isMine
                  ? Colors.primary
                  : Colors.teamColors[Math.min(i, Colors.teamColors.length - 1)];
                return (
                  <View key={s.categoryId} style={styles.teamRow}>
                    <Text style={[styles.teamName, isMine && styles.teamNameMine]} numberOfLines={1}>
                      {i === 0 ? '👑 ' : ''}{s.label}
                    </Text>
                    <View style={styles.barArea}>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, {
                          width: `${(statValue(s, battle.rankingType) / maxVal) * 100}%`,
                          backgroundColor: barColor,
                        }]} />
                      </View>
                      <Text style={styles.avgText}>{statLabel(s, battle.rankingType)}</Text>
                    </View>
                    <Text style={styles.memberCount}>{s.participantCount}人</Text>
                  </View>
                );
              })}
            </View>
          )}

          {!membership && battle.categories.length > 0 && (
            <View style={styles.joinSection}>
              <Button
                label="区分を選んで参加"
                onPress={() => setCategoryModalBattle(battle)}
                size="sm"
                variant="secondary"
              />
            </View>
          )}
        </Card>
      </TouchableOpacity>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // 友達チャレンジカード
  // ────────────────────────────────────────────────────────────────
  function renderPrivateBattleCard(battle: Battle) {
    const stats = categoryStatsMap[battle.id] ?? [];
    const membership = myMembershipFor(battle.id);
    const myCatId = membership?.categoryId;
    const sorted = sortedStats(stats, battle.rankingType);
    const maxVal = maxStat(stats, battle.rankingType);
    const myRank = sorted.findIndex((s) => s.categoryId === myCatId) + 1;

    return (
      <TouchableOpacity
        key={battle.id}
        activeOpacity={0.85}
        onPress={() => router.push(`/battle/${battle.id}` as any)}
      >
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.battleTitle}>{battle.title}</Text>
              {battle.inviteCode && (
                <TouchableOpacity
                  style={styles.inviteRow}
                  onPress={() => {
                    void Clipboard.setStringAsync(battle.inviteCode!);
                    Alert.alert('コピーしました', `招待コード: ${battle.inviteCode}`);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.inviteLabel}>招待コード: </Text>
                  <Text style={styles.inviteCode}>{battle.inviteCode}</Text>
                  <Text style={styles.inviteCopy}>📋</Text>
                </TouchableOpacity>
              )}
            </View>
            {myRank > 0 && (
              <View style={styles.rankBadge}>
                <Text style={styles.rankBadgeText}>{myRank === 1 ? '👑 1位' : `${myRank}位`}</Text>
              </View>
            )}
          </View>

          {sorted.length > 0 && (
            <View style={styles.statsSection}>
              {sorted.map((s, i) => {
                const isMine = s.categoryId === myCatId;
                return (
                  <View key={s.categoryId} style={styles.teamRow}>
                    <Text style={[styles.teamName, isMine && styles.teamNameMine]} numberOfLines={1}>
                      {i === 0 ? '👑 ' : ''}{s.label}
                    </Text>
                    <View style={styles.barArea}>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, {
                          width: `${(statValue(s, battle.rankingType) / maxVal) * 100}%`,
                          backgroundColor: isMine ? Colors.primary : Colors.teamColors[Math.min(i, Colors.teamColors.length - 1)],
                        }]} />
                      </View>
                      <Text style={styles.avgText}>{statLabel(s, battle.rankingType)}</Text>
                    </View>
                    <Text style={styles.memberCount}>{s.participantCount}人</Text>
                  </View>
                );
              })}
            </View>
          )}

        </Card>
      </TouchableOpacity>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // 友達チャレンジ作成フォーム
  // ────────────────────────────────────────────────────────────────
  function renderCreateForm() {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Card style={styles.card}>
          <Text style={styles.formTitle}>新しい友達チャレンジを作る</Text>

          <Text style={styles.inputLabel}>チャレンジ名 *</Text>
          <TextInput style={styles.input} value={createTitle} onChangeText={setCreateTitle}
            placeholder="例: 春の部活対決" placeholderTextColor={Colors.textTertiary} maxLength={40} />

          <Text style={styles.inputLabel}>説明（任意）</Text>
          <TextInput style={[styles.input, styles.inputMulti]} value={createDesc} onChangeText={setCreateDesc}
            placeholder="チャレンジの説明..." placeholderTextColor={Colors.textTertiary} multiline maxLength={200} />

          <Text style={styles.inputLabel}>区分リスト *（最低2つ）</Text>
          {createCategories.map((cat, i) => (
            <View key={i} style={styles.catInputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={cat.label}
                onChangeText={(v) => updateCategoryLabel(i, v)}
                placeholder={`区分 ${i + 1}（例: きのこの山）`}
                placeholderTextColor={Colors.textTertiary}
                maxLength={20}
              />
              {createCategories.length > 2 && (
                <TouchableOpacity style={styles.catRemoveBtn} onPress={() => removeCategory(i)}>
                  <Text style={styles.catRemoveText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity style={styles.addCatBtn} onPress={addCategory}>
            <Text style={styles.addCatText}>＋ 区分を追加</Text>
          </TouchableOpacity>

          <Text style={styles.inputLabel}>ランキング方式</Text>
          <View style={styles.modeRow}>
            {(['average', 'total'] as const).map((t) => (
              <TouchableOpacity key={t}
                style={[styles.modeBtn, createRankingType === t && styles.modeBtnActive]}
                onPress={() => setCreateRankingType(t)}
              >
                <Text style={[styles.modeBtnText, createRankingType === t && styles.modeBtnTextActive]}>
                  {t === 'average' ? '1人あたり平均' : '合計距離'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inputLabel}>開始日 *（YYYY-MM-DD）</Text>
          <TextInput style={styles.input} value={createStartAt} onChangeText={setCreateStartAt}
            placeholder="例: 2026-06-01" placeholderTextColor={Colors.textTertiary} maxLength={10} />

          <Text style={styles.inputLabel}>終了日 *（YYYY-MM-DD）</Text>
          <TextInput style={styles.input} value={createEndAt} onChangeText={setCreateEndAt}
            placeholder="例: 2026-06-30" placeholderTextColor={Colors.textTertiary} maxLength={10} />

          <View style={styles.formActions}>
            <Button label="キャンセル" onPress={() => { setPrivateView('list'); resetCreateForm(); }}
              variant="ghost" style={styles.formBtn} />
            <Button label="作成する" onPress={handleCreateBattle} loading={creating} style={styles.formBtn} />
          </View>
        </Card>
      </KeyboardAvoidingView>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // 招待コード検索フォーム
  // ────────────────────────────────────────────────────────────────
  function renderJoinCodeForm() {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Card style={styles.card}>
          <Text style={styles.formTitle}>招待コードで参加</Text>
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
          <View style={styles.formActions}>
            <Button label="キャンセル"
              onPress={() => { setPrivateView('list'); setInviteCode(''); }}
              variant="ghost" style={styles.formBtn} />
            <Button label="検索" onPress={handleSearchInviteCode} loading={searching} style={styles.formBtn} />
          </View>
        </Card>
      </KeyboardAvoidingView>
    );
  }

  function renderJoinSelectForm() {
    if (!foundBattle) return null;
    return (
      <Card style={styles.card}>
        <Text style={styles.formTitle}>{foundBattle.title}</Text>
        {foundBattle.description ? (
          <Text style={styles.battleMeta}>{foundBattle.description}</Text>
        ) : null}

        <Text style={[styles.inputLabel, { marginBottom: Spacing.sm }]}>区分を選んで参加</Text>
        <View style={styles.catSelectList}>
          {foundBattle.categories.map((cat) => (
            <Button
              key={cat.id}
              label={cat.label}
              onPress={() => handleJoin(foundBattle, cat.id)}
              loading={joiningBattleId === foundBattle.id}
              variant="secondary"
              style={styles.catSelectBtn}
            />
          ))}
        </View>
        <Button label="戻る"
          onPress={() => { setPrivateView('join_code'); setFoundBattle(null); }}
          variant="ghost" style={{ marginTop: Spacing.md }} />
      </Card>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // State A: 参加中レイアウト
  // ────────────────────────────────────────────────────────────────
  function renderParticipatingView() {
    return (
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {renderActiveChallengeCard()}
        {renderWeeklyContributionRow()}
        {renderRunNowButton()}

        {/* 他のバトル セクション */}
        <View style={styles.sectionDivider}>
          <View style={styles.sectionDividerLine} />
          <Text style={styles.sectionDividerLabel}>他のバトル</Text>
          <View style={styles.sectionDividerLine} />
        </View>

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
                  {tab === 'public' ? 'パブリックラン' : '友達チャレンジ'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'public' ? (
          publicBattles.length === 0
            ? <EmptyState
                icon="trophy-outline"
                title="開催中のパブリックランがありません"
                hint="友達チャレンジで仲間と競うこともできます"
              />
            : publicBattles.map(renderPublicBattleCard)
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
                {privateBattles.map(renderPrivateBattleCard)}
                <Button
                  label={userIsPro ? '＋ 新しいチャレンジを作る' : '＋ 新しいチャレンジを作る（Pro）'}
                  onPress={() => {
                    if (!userIsPro) {
                      Alert.alert('Proプランが必要です',
                        'プライベートチャレンジの作成にはProプランが必要です。\nプロフィール画面からアップグレードできます。');
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
            {privateView === 'create' && renderCreateForm()}
            {privateView === 'join_code' && renderJoinCodeForm()}
            {privateView === 'join_select' && renderJoinSelectForm()}
          </>
        )}
      </ScrollView>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // Day-0アクティベーション: 開催中の作戦に参加しようカード
  // ────────────────────────────────────────────────────────────────
  function renderJoinRecommendationCard() {
    if (!recommendedBattle) return null;
    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => setCategoryModalBattle(recommendedBattle)}
        style={styles.recommendCard}
      >
        <View style={styles.recommendHeader}>
          <Ionicons name="flash" size={16} color="#fff" />
          <Text style={styles.recommendHeaderText}>開催中の作戦に参加しよう</Text>
        </View>
        <Text style={styles.recommendTitle} numberOfLines={1}>{recommendedBattle.title}</Text>
        {recommendedShortageCategory && (
          <View style={styles.recommendShortageRow}>
            <Text style={styles.recommendShortageText}>
              「{recommendedShortageCategory.label}」は援軍募集中！
            </Text>
          </View>
        )}
        <View style={styles.recommendCta}>
          <Text style={styles.recommendCtaText}>区分を選んで参加する</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
        </View>
      </TouchableOpacity>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // State B: 未参加レイアウト
  // ────────────────────────────────────────────────────────────────
  function renderNotParticipatingView() {
    return (
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {recommendedBattle ? (
          renderJoinRecommendationCard()
        ) : (
          <View style={styles.emptyStateCard}>
            <Ionicons name="trophy-outline" size={40} color={Colors.textTertiary} />
            <Text style={styles.emptyStateTitle}>参加中のチャレンジはありません</Text>
            <Text style={styles.emptyStateHint}>下のバトルに参加して距離を競おう！</Text>
          </View>
        )}

        {/* パブリックバトル一覧 */}
        {publicBattles.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>パブリックラン</Text>
            {publicBattles.map(renderPublicBattleCard)}
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
        {privateView === 'join_code' && renderJoinCodeForm()}
        {privateView === 'join_select' && renderJoinSelectForm()}

        {/* チャレンジ作成（Proのみ） */}
        {privateView === 'list' && (
          <Button
            label={userIsPro ? '＋ 友達チャレンジを作る' : '＋ 友達チャレンジを作る（Pro）'}
            onPress={() => {
              if (!userIsPro) {
                Alert.alert('Proプランが必要です',
                  'プライベートチャレンジの作成にはProプランが必要です。\nプロフィール画面からアップグレードできます。');
                return;
              }
              setPrivateView('create');
            }}
            style={{ marginTop: Spacing.sm }}
          />
        )}
        {privateView === 'create' && renderCreateForm()}
      </ScrollView>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // JSX
  // ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>チャレンジ</Text>
        <TouchableOpacity
          onPress={() => router.push('/notifications' as any)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.notifBtn}
        >
          <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
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
// スタイル
// ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
  notifBtn: { position: 'relative' },
  notifBadge: {
    position: 'absolute', top: -4, right: -6,
    minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.surface,
  },
  notifBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.textOnPrimary },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.lg },

  // Active Challenge Card
  activeChallengeCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    ...Shadow.md,
  },
  acHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  acTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  acDays: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  acRankBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  acRankText: { fontSize: Typography.fontSize.xs, color: Colors.primary, fontWeight: Typography.fontWeight.bold },
  acDistRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  acDistLabel: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginBottom: 2 },
  acDistNum: { fontSize: Typography.fontSize['3xl'], fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary, letterSpacing: -1 },
  acDistUnit: { fontSize: Typography.fontSize.md, color: Colors.textSecondary },
  acOvertake: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${Colors.primary}14`,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  acOvertakeText: { fontSize: Typography.fontSize.xs, color: Colors.primary, fontWeight: Typography.fontWeight.bold },
  multiBattleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  multiBattleText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },

  // Weekly row
  weeklyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  weeklyText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  weeklyBold: { fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },

  // Run Now
  runNowSection: { gap: Spacing.sm },
  runNowHint: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, textAlign: 'center' },
  runNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    ...Shadow.md,
  },
  runNowLabel: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.extrabold, color: Colors.textOnPrimary },

  // Section divider
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.xs,
  },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  sectionDividerLabel: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, fontWeight: Typography.fontWeight.semibold },

  // Segment tabs
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  segment: { flex: 1, flexDirection: 'row', gap: 5, paddingVertical: Spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm },
  segmentActive: { backgroundColor: Colors.surface, ...Shadow.sm },
  segmentLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, fontWeight: Typography.fontWeight.medium },
  segmentLabelActive: { color: Colors.textPrimary, fontWeight: Typography.fontWeight.semibold },

  // Battle cards (共通)
  card: { marginBottom: 0 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  battleTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  battleMeta: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  joinedBadge: {
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  joinedBadgeText: { fontSize: Typography.fontSize.xs, color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  rankBadge: {
    backgroundColor: Colors.accentYellow + '22', borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  rankBadgeText: { fontSize: Typography.fontSize.xs, color: Colors.accentYellow, fontWeight: Typography.fontWeight.semibold },
  statsSection: { gap: Spacing.md, marginBottom: Spacing.sm },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  teamName: { width: 80, fontSize: Typography.fontSize.sm, color: Colors.textPrimary },
  teamNameMine: { fontWeight: Typography.fontWeight.bold, color: Colors.primary },
  barArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  barTrack: { flex: 1, height: 8, backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.full, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: BorderRadius.full },
  avgText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, width: 58 },
  memberCount: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, width: 28 },
  joinSection: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md, alignItems: 'flex-start' },
  inviteRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs },
  inviteLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  inviteCode: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.primary, letterSpacing: 2 },
  inviteCopy: { fontSize: Typography.fontSize.sm, marginLeft: Spacing.xs },

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
  sectionLabel: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },

  // Day-0アクティベーション: 参加おすすめカード
  recommendCard: {
    backgroundColor: Colors.textPrimary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
    ...Shadow.md,
  },
  recommendHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  recommendHeaderText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.textOnPrimary },
  recommendTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textOnPrimary, marginTop: Spacing.xs },
  recommendShortageRow: {
    alignSelf: 'flex-start',
    backgroundColor: `${Colors.primary}30`,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginTop: Spacing.xs,
  },
  recommendShortageText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.primary },
  recommendCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  recommendCtaText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.primary },

  // Forms
  formTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.lg },
  inputLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.md },
  input: {
    backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.md, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  inputMulti: { height: 72, textAlignVertical: 'top' },
  codeInput: { fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.bold, textAlign: 'center', letterSpacing: 4 },
  modeRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  modeBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceGray, borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  modeBtnText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  modeBtnTextActive: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  catInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  catRemoveBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.error + '15', alignItems: 'center', justifyContent: 'center' },
  catRemoveText: { fontSize: Typography.fontSize.lg, color: Colors.error, fontWeight: Typography.fontWeight.bold },
  addCatBtn: { marginTop: Spacing.sm, padding: Spacing.sm, alignItems: 'center' },
  addCatText: { fontSize: Typography.fontSize.sm, color: Colors.primary, fontWeight: Typography.fontWeight.medium },
  catSelectList: { gap: Spacing.sm },
  catSelectBtn: { marginTop: 0 },
  formActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xl },
  formBtn: { flex: 1 },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg, paddingBottom: Spacing['4xl'],
    maxHeight: '80%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.lg },
  title: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.xs },
  subtitle: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  catBtn: {
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surfaceGray,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  catBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  catLabel: { fontSize: Typography.fontSize.md, color: Colors.textPrimary, fontWeight: Typography.fontWeight.medium },
  catLabelSelected: { color: Colors.primary, fontWeight: Typography.fontWeight.bold },
  checkmark: { fontSize: Typography.fontSize.md, color: Colors.primary, fontWeight: Typography.fontWeight.bold },
});
