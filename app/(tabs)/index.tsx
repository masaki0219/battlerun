import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  doc, onSnapshot, collection, query, where,
  getDocs, orderBy, Timestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { useBattleStore } from '../../stores/battleStore';
import { useTeam } from '../../hooks/useTeam';
import { Card } from '../../components/ui/Card';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius, Shadow, ComponentSize } from '../../design_tokens';
import { DAILY_GOAL_KM } from '../../lib/constants';
import type { Team, BattleStats } from '../../types';

const TEAM_GOAL_KM = 500;

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { currentTeam, members } = useTeamStore();
  const { publicBattles, myMemberships, fetchPublicBattles, fetchMyMemberships } = useBattleStore();
  const { isLoading } = useTeam();
  const [todayKm, setTodayKm] = useState(0);
  const [todaySteps, setTodaySteps] = useState(0);
  const [liveTeam, setLiveTeam] = useState<Team | null>(null);
  const [teamRank, setTeamRank] = useState<number | null>(null);
  const [totalTeams, setTotalTeams] = useState(0);
  const [battleStatsMap, setBattleStatsMap] = useState<Record<string, BattleStats[]>>({});

  // 今日のアクティビティ（userId のみでフィルタ → 複合インデックス不要、クライアント側で日付絞り込み）
  useEffect(() => {
    if (!user) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const q = query(
      collection(db, 'activities'),
      where('userId', '==', user.id),
    );
    getDocs(q).then((snap) => {
      let km = 0;
      let steps = 0;
      snap.forEach((d) => {
        const data = d.data();
        const startedAt = data['startedAt'];
        const ts: number =
          startedAt?.toMillis?.() ?? (startedAt?.seconds ? startedAt.seconds * 1000 : 0);
        if (ts >= todayMs) {
          km += (data['distanceKm'] as number) ?? 0;
          steps += (data['steps'] as number) ?? 0;
        }
      });
      setTodayKm(km);
      setTodaySteps(steps);
    });
  }, [user]);

  // チームドキュメントをリアルタイム購読（totalDistanceKm の更新を即時反映）
  useEffect(() => {
    if (!currentTeam) return;
    const unsub = onSnapshot(doc(db, 'teams', currentTeam.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLiveTeam({
          id: snap.id,
          name: data['name'] as string,
          inviteCode: data['inviteCode'] as string,
          isPublic: data['isPublic'] as boolean,
          createdBy: data['createdBy'] as string,
          createdAt: (data['createdAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
          totalDistanceKm: data['totalDistanceKm'] as number ?? 0,
        });
      }
    });
    return unsub;
  }, [currentTeam?.id]);

  // 全チーム取得してランキング計算（onSnapshot で全チームを購読）
  useEffect(() => {
    if (!currentTeam) return;
    const unsub = onSnapshot(
      query(collection(db, 'teams'), orderBy('totalDistanceKm', 'desc')),
      (snap) => {
        setTotalTeams(snap.size);
        const idx = snap.docs.findIndex((d) => d.id === currentTeam.id);
        setTeamRank(idx >= 0 ? idx + 1 : null);
      }
    );
    return unsub;
  }, [currentTeam?.id]);

  // 参加中パブリック戦を取得してリアルタイム購読
  useEffect(() => {
    if (!user) return;
    fetchPublicBattles();
    fetchMyMemberships(user.id);
  }, [user]);

  useEffect(() => {
    const myPublicBattleIds = myMemberships
      .filter((m) => publicBattles.some((b) => b.id === m.battleId))
      .map((m) => m.battleId);
    if (myPublicBattleIds.length === 0) return;

    const unsubs = myPublicBattleIds.map((battleId) => {
      const q = query(collection(db, 'battle_stats'), where('battleId', '==', battleId));
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
        setBattleStatsMap((prev) => ({ ...prev, [battleId]: stats }));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [myMemberships, publicBattles]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const displayTeam = liveTeam ?? currentTeam;
  const teamDist = displayTeam?.totalDistanceKm ?? 0;
  const rankColor =
    teamRank === 1 ? Colors.rank1
    : teamRank === 2 ? Colors.rank2
    : teamRank === 3 ? Colors.rank3
    : Colors.textPrimary;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.logo}>🏃 BattleRun</Text>
        <TouchableOpacity onPress={() => Alert.alert('お知らせ', 'プッシュ通知は近日公開予定です。\nバトルに参加して仲間と記録を競いましょう！')}>
          <Text style={styles.bell}>🔔</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 今日のアクティビティ */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>今日のアクティビティ</Text>
          <View style={styles.distanceRow}>
            <Text style={styles.distanceIcon}>👟</Text>
            <Text style={styles.distanceValue}>{todayKm.toFixed(2)}</Text>
            <Text style={styles.distanceUnit}> km</Text>
          </View>
          <Text style={styles.steps}>{todaySteps.toLocaleString()} 歩</Text>
          <ProgressBar value={Math.min(todayKm / DAILY_GOAL_KM, 1)} />
          <Text style={styles.goalText}>目標 {DAILY_GOAL_KM.toFixed(2)} km</Text>
        </Card>

        {/* チームランキング */}
        {displayTeam ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>チームランキング（全体）</Text>
            <View style={styles.rankRow}>
              <Text style={[styles.rankNum, { color: rankColor }]}>
                {teamRank === 1 ? '👑 ' : ''}{teamRank ?? '-'}位
              </Text>
              <Text style={styles.rankSub}> / {totalTeams}チーム中</Text>
            </View>
            <Text style={[styles.upArrow, { color: Colors.primary }]}>▲ ランキング参加中</Text>
            <Text style={styles.teamName}>{displayTeam.name}</Text>
            <ProgressBar value={Math.min(teamDist / TEAM_GOAL_KM, 1)} />
            <Text style={styles.goalText}>
              合計 {teamDist.toFixed(1)} km　目標 {TEAM_GOAL_KM} km
            </Text>
            <TouchableOpacity
              style={styles.detailLink}
              onPress={() => router.push(`/team/${displayTeam.id}`)}
            >
              <Text style={styles.detailLinkText}>メンバー・活動履歴を見る →</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <Card style={styles.card}>
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏃</Text>
              <Text style={styles.emptyText}>まだチームに入っていません</Text>
              <Button label="チームを作る" onPress={() => router.push('/team/create')} style={{ marginBottom: Spacing.sm }} />
              <Button label="招待コードで参加" onPress={() => router.push('/team/join')} variant="ghost" />
            </View>
          </Card>
        )}

        {/* 参加中のパブリック戦 */}
        {myMemberships
          .filter((m) => publicBattles.some((b) => b.id === m.battleId))
          .map((membership) => {
            const battle = publicBattles.find((b) => b.id === membership.battleId);
            if (!battle) return null;
            const stats = battleStatsMap[battle.id] ?? [];
            const sorted = [...stats].sort((a, b) => b.avgDistanceKm - a.avgDistanceKm);
            const myRank = sorted.findIndex((s) => s.teamId === membership.teamId) + 1;
            const myStats = sorted.find((s) => s.teamId === membership.teamId);
            const rankColor =
              myRank === 1 ? Colors.rank1
              : myRank === 2 ? Colors.rank2
              : myRank === 3 ? Colors.rank3
              : Colors.textPrimary;
            const days = battle.endAt
              ? Math.max(0, Math.ceil((new Date(battle.endAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
              : null;
            return (
              <Card key={battle.id} style={styles.card}>
                <Text style={styles.cardTitle}>🏆 {battle.title}</Text>
                <View style={styles.rankRow}>
                  <Text style={[styles.rankNum, { color: rankColor }]}>
                    {myRank === 1 ? '👑 ' : ''}{myRank > 0 ? `${myRank}位` : '-位'}
                  </Text>
                  <Text style={styles.rankSub}> / {sorted.length}チーム中</Text>
                </View>
                {myStats && (
                  <Text style={styles.upArrow}>
                    {myStats.teamName}　{myStats.avgDistanceKm.toFixed(1)} km/人
                  </Text>
                )}
                {days !== null && (
                  <Text style={styles.goalText}>残り {days} 日</Text>
                )}
              </Card>
            );
          })}

        {/* メンバー */}
        {displayTeam && members.length > 0 && (
          <Card style={styles.cardLast}>
            <Text style={styles.cardTitle}>メンバー</Text>
            <View style={styles.avatarRow}>
              {members.slice(0, 5).map((m) => (
                <Avatar key={m.userId} name={m.user?.name ?? '?'} uri={m.user?.avatarUrl} size="sm" />
              ))}
              {members.length > 5 && (
                <View style={styles.moreAvatars}>
                  <Text style={styles.moreText}>+{members.length - 5}</Text>
                </View>
              )}
            </View>
            <Text style={styles.activeText}>{members.length}人がアクティブ！</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  logo: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.extrabold, color: Colors.primary },
  bell: { fontSize: 22 },
  scroll: { paddingTop: Spacing['2xl'], gap: Spacing['2xl'] },
  card: { marginBottom: 0 },
  cardLast: {
    marginBottom: Spacing['3xl'], marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    ...Shadow.sm, padding: ComponentSize.cardPadding,
  },
  cardTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: Colors.textSecondary, marginBottom: Spacing.md },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline' },
  distanceIcon: { fontSize: 28, marginRight: Spacing.sm },
  distanceValue: { fontSize: Typography.fontSize['4xl'], fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary },
  distanceUnit: { fontSize: Typography.fontSize.xl, color: Colors.textSecondary, fontWeight: Typography.fontWeight.medium },
  steps: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  goalText: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: Spacing.xs },
  rankRow: { flexDirection: 'row', alignItems: 'baseline' },
  rankNum: { fontSize: Typography.fontSize['3xl'], fontWeight: Typography.fontWeight.extrabold },
  rankSub: { fontSize: Typography.fontSize.md, color: Colors.textSecondary },
  upArrow: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, marginVertical: Spacing.xs },
  teamName: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyState: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: Typography.fontSize.md, color: Colors.textSecondary },
  avatarRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm },
  moreAvatars: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surfaceGray, alignItems: 'center', justifyContent: 'center',
  },
  moreText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  activeText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  detailLink: { marginTop: Spacing.md, alignSelf: 'flex-end' },
  detailLinkText: { fontSize: Typography.fontSize.sm, color: Colors.primary, fontWeight: Typography.fontWeight.medium },
});
