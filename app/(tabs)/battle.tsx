import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../design_tokens';
import type { Battle, BattleStats, BattleTeam } from '../../types';

type Tab = 'public' | 'private';
type PrivateView = 'list' | 'create' | 'join_code' | 'join_team';

export default function BattleScreen() {
  const { user } = useAuthStore();
  const {
    publicBattles, privateBattles, myMemberships, seasons, isLoading,
    fetchPublicBattles, fetchMyMemberships, fetchMyPrivateBattles, fetchSeason,
    joinPublicBattle, joinPrivateBattle, createPrivateBattle, findBattleByInviteCode,
  } = useBattleStore();

  const [activeTab, setActiveTab] = useState<Tab>('public');
  const [statsMap, setStatsMap] = useState<Record<string, BattleStats[]>>({});
  const [joining, setJoining] = useState<string | null>(null);

  // プライベート戦UI状態
  const [privateView, setPrivateView] = useState<PrivateView>('list');
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createTeamA, setCreateTeamA] = useState('');
  const [createTeamB, setCreateTeamB] = useState('');
  const [createRankingType, setCreateRankingType] = useState<'average' | 'total'>('average');
  const [inviteCode, setInviteCode] = useState('');
  const [foundBattle, setFoundBattle] = useState<Battle | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetchPublicBattles();
    if (user) {
      fetchMyMemberships(user.id);
      fetchMyPrivateBattles(user.id);
    }
  }, [user]);

  // パブリック戦に紐づくシーズンを取得（キャッシュ済みはスキップ）
  useEffect(() => {
    const ids = [...new Set(
      publicBattles.map((b) => b.seasonId).filter((id): id is string => !!id)
    )];
    ids.forEach((id) => fetchSeason(id));
  }, [publicBattles]);

  // 各パブリックバトルの stats をリアルタイム購読
  useEffect(() => {
    if (publicBattles.length === 0) return;
    const unsubs = publicBattles.map((battle) => {
      const q = query(
        collection(db, 'battle_stats'),
        where('battleId', '==', battle.id)
      );
      return onSnapshot(q, (snap) => {
        const stats: BattleStats[] = snap.docs.map((d) => ({
          id: d.id,
          battleId: d.data()['battleId'] as string,
          teamId: d.data()['teamId'] as string,
          teamName: d.data()['teamName'] as string,
          totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
          memberCount: (d.data()['memberCount'] as number) ?? 0,
          avgDistanceKm: (d.data()['avgDistanceKm'] as number) ?? 0,
        }));
        setStatsMap((prev) => ({ ...prev, [battle.id]: stats }));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [publicBattles]);

  // プライベートバトルの stats もリアルタイム購読
  useEffect(() => {
    if (privateBattles.length === 0) return;
    const unsubs = privateBattles.map((battle) => {
      const q = query(
        collection(db, 'battle_stats'),
        where('battleId', '==', battle.id)
      );
      return onSnapshot(q, (snap) => {
        const stats: BattleStats[] = snap.docs.map((d) => ({
          id: d.id,
          battleId: d.data()['battleId'] as string,
          teamId: d.data()['teamId'] as string,
          teamName: d.data()['teamName'] as string,
          totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
          memberCount: (d.data()['memberCount'] as number) ?? 0,
          avgDistanceKm: (d.data()['avgDistanceKm'] as number) ?? 0,
        }));
        setStatsMap((prev) => ({ ...prev, [battle.id]: stats }));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [privateBattles]);

  function myTeamIdFor(battleId: string): string | undefined {
    return myMemberships.find((m) => m.battleId === battleId)?.teamId;
  }

  function daysLeft(endAt: string): number | null {
    if (!endAt) return null;
    const diff = new Date(endAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  async function handleJoinPublic(battle: Battle, team: BattleTeam) {
    if (!user) return;
    setJoining(battle.id);
    try {
      await joinPublicBattle(battle.id, team.teamId, user.id);
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '参加に失敗しました');
    } finally {
      setJoining(null);
    }
  }

  async function handleJoinPrivate(battleId: string, teamId: string) {
    if (!user) return;
    setJoining(battleId);
    try {
      await joinPrivateBattle(battleId, teamId, user.id);
      setPrivateView('list');
      setFoundBattle(null);
      setInviteCode('');
      await fetchMyPrivateBattles(user.id);
      Alert.alert('参加完了', 'バトルに参加しました！');
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '参加に失敗しました');
    } finally {
      setJoining(null);
    }
  }

  async function handleSearchInviteCode() {
    if (!inviteCode.trim()) return;
    setSearching(true);
    try {
      const battle = await findBattleByInviteCode(inviteCode);
      setFoundBattle(battle);
      setPrivateView('join_team');
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '招待コードが見つかりません');
    } finally {
      setSearching(false);
    }
  }

  async function handleCreateBattle() {
    if (!user) return;
    if (!createTitle.trim() || !createTeamA.trim() || !createTeamB.trim()) {
      Alert.alert('入力エラー', 'タイトルとチーム名を入力してください');
      return;
    }
    setCreating(true);
    try {
      const battleId = await createPrivateBattle({
        title: createTitle.trim(),
        description: createDesc.trim(),
        teamAName: createTeamA.trim(),
        teamBName: createTeamB.trim(),
        rankingType: createRankingType,
        userId: user.id,
      });
      await fetchMyPrivateBattles(user.id);
      setPrivateView('list');
      setCreateTitle('');
      setCreateDesc('');
      setCreateTeamA('');
      setCreateTeamB('');
      Alert.alert('作成完了', `バトルを作成しました！\n\n招待コードはバトル詳細から確認できます`);
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '作成に失敗しました');
    } finally {
      setCreating(false);
    }
  }

  function renderPublicBattle(battle: Battle) {
    const stats = statsMap[battle.id] ?? [];
    const myTeamId = myTeamIdFor(battle.id);
    const maxAvg = Math.max(...stats.map((s) => s.avgDistanceKm), 0.01);
    const days = daysLeft(battle.endAt);

    return (
      <Card key={battle.id} style={styles.battleCard}>
        <View style={styles.battleHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.battleTitle}>{battle.title}</Text>
            <Text style={styles.battleMeta}>
              {days !== null ? `残り ${days} 日` : ''}
              {battle.seasonId && seasons[battle.seasonId]
                ? `　${seasons[battle.seasonId].title}`
                : ''}
            </Text>
          </View>
          {myTeamId && (
            <View style={styles.joinedBadge}>
              <Text style={styles.joinedBadgeText}>参加中</Text>
            </View>
          )}
        </View>

        <View style={styles.statsSection}>
          {stats
            .sort((a, b) => b.avgDistanceKm - a.avgDistanceKm)
            .map((s, i) => {
              const isMine = s.teamId === myTeamId;
              const barColor = isMine
                ? Colors.primary
                : Colors.teamColors[Math.min(i, Colors.teamColors.length - 1)];
              return (
                <View key={s.teamId} style={styles.teamRow}>
                  <Text style={[styles.teamName, isMine && styles.teamNameMine]} numberOfLines={1}>
                    {i === 0 ? '👑 ' : ''}{s.teamName}
                  </Text>
                  <View style={styles.barArea}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${(s.avgDistanceKm / maxAvg) * 100}%`, backgroundColor: barColor },
                        ]}
                      />
                    </View>
                    <Text style={styles.avgText}>{s.avgDistanceKm.toFixed(1)}km/人</Text>
                  </View>
                  <Text style={styles.memberCount}>{s.memberCount}人</Text>
                </View>
              );
            })}
        </View>

        {!myTeamId && (
          <View style={styles.joinSection}>
            <Text style={styles.joinLabel}>チームを選んで参加</Text>
            <View style={styles.joinButtons}>
              {battle.teams.map((team) => (
                <Button
                  key={team.teamId}
                  label={team.name}
                  onPress={() => handleJoinPublic(battle, team)}
                  loading={joining === battle.id}
                  size="sm"
                  variant="secondary"
                  style={styles.joinBtn}
                />
              ))}
            </View>
          </View>
        )}
      </Card>
    );
  }

  function renderPrivateBattleItem(battle: Battle) {
    const stats = statsMap[battle.id] ?? [];
    const myTeamId = myTeamIdFor(battle.id);
    const sorted = [...stats].sort((a, b) => b.avgDistanceKm - a.avgDistanceKm);
    const myRank = sorted.findIndex((s) => s.teamId === myTeamId) + 1;

    return (
      <Card key={battle.id} style={styles.battleCard}>
        <View style={styles.battleHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.battleTitle}>{battle.title}</Text>
            {battle.inviteCode && (
              <TouchableOpacity
                style={styles.inviteCodeRow}
                onPress={() => {
                  Clipboard.setString(battle.inviteCode!);
                  Alert.alert('コピーしました', `招待コード: ${battle.inviteCode}`);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.inviteCodeLabel}>招待コード: </Text>
                <Text style={styles.inviteCodeText}>{battle.inviteCode}</Text>
                <Text style={styles.inviteCodeCopy}>📋</Text>
              </TouchableOpacity>
            )}
          </View>
          {myRank > 0 && (
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeText}>{myRank === 1 ? '👑 1位' : `${myRank}位`}</Text>
            </View>
          )}
        </View>
        <View style={styles.statsSection}>
          {sorted.map((s, i) => {
            const isMine = s.teamId === myTeamId;
            const maxAvg = Math.max(...sorted.map((x) => x.avgDistanceKm), 0.01);
            return (
              <View key={s.teamId} style={styles.teamRow}>
                <Text style={[styles.teamName, isMine && styles.teamNameMine]} numberOfLines={1}>
                  {i === 0 ? '👑 ' : ''}{s.teamName}
                </Text>
                <View style={styles.barArea}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${(s.avgDistanceKm / maxAvg) * 100}%`,
                          backgroundColor: isMine ? Colors.primary : Colors.teamColors[Math.min(i, Colors.teamColors.length - 1)],
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.avgText}>{s.avgDistanceKm.toFixed(1)}km/人</Text>
                </View>
                <Text style={styles.memberCount}>{s.memberCount}人</Text>
              </View>
            );
          })}
        </View>
      </Card>
    );
  }

  function renderCreateForm() {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Card style={styles.battleCard}>
          <Text style={styles.formTitle}>新しいプライベート戦を作る</Text>

          <Text style={styles.inputLabel}>バトルタイトル</Text>
          <TextInput
            style={styles.input}
            value={createTitle}
            onChangeText={setCreateTitle}
            placeholder="例: 春の部活対決"
            placeholderTextColor={Colors.textTertiary}
            maxLength={40}
          />

          <Text style={styles.inputLabel}>説明（任意）</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={createDesc}
            onChangeText={setCreateDesc}
            placeholder="バトルの説明を入力..."
            placeholderTextColor={Colors.textTertiary}
            multiline
            maxLength={200}
          />

          <Text style={styles.inputLabel}>チームA の名前</Text>
          <TextInput
            style={styles.input}
            value={createTeamA}
            onChangeText={setCreateTeamA}
            placeholder="例: 赤チーム"
            placeholderTextColor={Colors.textTertiary}
            maxLength={20}
          />

          <Text style={styles.inputLabel}>チームB の名前</Text>
          <TextInput
            style={styles.input}
            value={createTeamB}
            onChangeText={setCreateTeamB}
            placeholder="例: 青チーム"
            placeholderTextColor={Colors.textTertiary}
            maxLength={20}
          />

          <Text style={styles.inputLabel}>ランキング方式</Text>
          <View style={styles.rankingRow}>
            {(['average', 'total'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.rankingOption, createRankingType === t && styles.rankingOptionActive]}
                onPress={() => setCreateRankingType(t)}
              >
                <Text style={[styles.rankingOptionText, createRankingType === t && styles.rankingOptionTextActive]}>
                  {t === 'average' ? '1人あたり平均' : '合計距離'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.formActions}>
            <Button
              label="キャンセル"
              onPress={() => setPrivateView('list')}
              variant="ghost"
              style={styles.formBtn}
            />
            <Button
              label="作成する"
              onPress={handleCreateBattle}
              loading={creating}
              style={styles.formBtn}
            />
          </View>
        </Card>
      </KeyboardAvoidingView>
    );
  }

  function renderJoinCodeForm() {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Card style={styles.battleCard}>
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
            <Button
              label="キャンセル"
              onPress={() => { setPrivateView('list'); setInviteCode(''); }}
              variant="ghost"
              style={styles.formBtn}
            />
            <Button
              label="検索"
              onPress={handleSearchInviteCode}
              loading={searching}
              style={styles.formBtn}
            />
          </View>
        </Card>
      </KeyboardAvoidingView>
    );
  }

  function renderJoinTeamForm() {
    if (!foundBattle) return null;
    return (
      <Card style={styles.battleCard}>
        <Text style={styles.formTitle}>チームを選んで参加</Text>
        <Text style={styles.battleTitle}>{foundBattle.title}</Text>
        <Text style={styles.battleMeta}>{foundBattle.description}</Text>
        <View style={styles.joinButtons} >
          {foundBattle.teams.map((team) => (
            <Button
              key={team.teamId}
              label={team.name}
              onPress={() => handleJoinPrivate(foundBattle.id, team.teamId)}
              loading={joining === foundBattle.id}
              variant="secondary"
              style={{ flex: 1, marginTop: Spacing.lg }}
            />
          ))}
        </View>
        <Button
          label="戻る"
          onPress={() => { setPrivateView('join_code'); setFoundBattle(null); }}
          variant="ghost"
          style={{ marginTop: Spacing.md }}
        />
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>バトル</Text>
      </View>

      {/* セグメントコントロール */}
      <View style={styles.segmentRow}>
        {(['public', 'private'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.segment, activeTab === tab && styles.segmentActive]}
            onPress={() => { setActiveTab(tab); setPrivateView('list'); }}
          >
            <Text style={[styles.segmentLabel, activeTab === tab && styles.segmentLabelActive]}>
              {tab === 'public' ? '🏆 パブリック戦' : '🔒 プライベート戦'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {activeTab === 'public' ? (
            <>
              {publicBattles.length === 0 ? (
                <Card style={styles.battleCard}>
                  <Text style={styles.emptyText}>開催中のパブリック戦はありません</Text>
                </Card>
              ) : (
                publicBattles.map(renderPublicBattle)
              )}
            </>
          ) : (
            <>
              {privateView === 'list' && (
                <>
                  {privateBattles.length > 0 ? (
                    privateBattles.map(renderPrivateBattleItem)
                  ) : (
                    <Card style={styles.battleCard}>
                      <Text style={styles.emptyText}>参加中のプライベート戦はありません</Text>
                    </Card>
                  )}
                  <Button
                    label={user?.plan === 'pro' ? '+ 新しいバトルを作る' : '+ 新しいバトルを作る（Pro）'}
                    onPress={() => {
                      if (user?.plan !== 'pro') {
                        Alert.alert('Proプランが必要です', 'プライベートバトルの作成にはProプランへのアップグレードが必要です。\n\nプロフィール画面からアップグレードできます。');
                        return;
                      }
                      setPrivateView('create');
                    }}
                    style={{ marginTop: Spacing.sm }}
                  />
                  <Button
                    label="招待コードで参加"
                    onPress={() => setPrivateView('join_code')}
                    variant="secondary"
                    style={{ marginTop: Spacing.sm }}
                  />
                </>
              )}
              {privateView === 'create' && renderCreateForm()}
              {privateView === 'join_code' && renderJoinCodeForm()}
              {privateView === 'join_team' && renderJoinTeamForm()}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  segmentRow: {
    flexDirection: 'row', backgroundColor: Colors.surfaceGray,
    margin: Spacing.lg, borderRadius: BorderRadius.md, padding: 4,
  },
  segment: {
    flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.sm,
  },
  segmentActive: { backgroundColor: Colors.surface, ...Shadow.sm },
  segmentLabel: {
    fontSize: Typography.fontSize.sm, color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  segmentLabelActive: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.lg },
  battleCard: { marginBottom: 0 },
  battleHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  battleTitle: {
    fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  battleMeta: {
    fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 2,
  },
  inviteCodeRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs,
  },
  inviteCodeLabel: {
    fontSize: Typography.fontSize.sm, color: Colors.textSecondary,
  },
  inviteCodeText: {
    fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold,
    color: Colors.primary, letterSpacing: 2,
  },
  inviteCodeCopy: {
    fontSize: Typography.fontSize.sm, marginLeft: Spacing.xs,
  },
  joinedBadge: {
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  joinedBadgeText: {
    fontSize: Typography.fontSize.xs, color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },
  rankBadge: {
    backgroundColor: Colors.accentYellow + '22', borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  rankBadgeText: {
    fontSize: Typography.fontSize.xs, color: Colors.accentYellow,
    fontWeight: Typography.fontWeight.semibold,
  },
  statsSection: { gap: Spacing.md, marginBottom: Spacing.md },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  teamName: { width: 80, fontSize: Typography.fontSize.sm, color: Colors.textPrimary },
  teamNameMine: { fontWeight: Typography.fontWeight.bold, color: Colors.primary },
  barArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  barTrack: {
    flex: 1, height: 8, backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.full, overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: BorderRadius.full },
  avgText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, width: 58 },
  memberCount: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, width: 28 },
  joinSection: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  joinLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  joinButtons: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  joinBtn: { flex: 1 },
  emptyText: {
    fontSize: Typography.fontSize.md, color: Colors.textSecondary,
    textAlign: 'center', padding: Spacing.lg,
  },
  formTitle: {
    fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary, marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: Typography.fontSize.sm, color: Colors.textSecondary,
    marginBottom: Spacing.xs, marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.md, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  codeInput: {
    fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.bold,
    textAlign: 'center', letterSpacing: 4,
  },
  rankingRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  rankingOption: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceGray, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  rankingOptionActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  rankingOptionText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  rankingOptionTextActive: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  formActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xl },
  formBtn: { flex: 1 },
});
