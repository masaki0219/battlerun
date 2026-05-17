import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  doc, getDoc, getDocs, collection, deleteDoc,
  query, where, orderBy, limit, Timestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { RankBadge } from '../../components/ui/RankBadge';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';

const TEAM_GOAL_KM = 500;

interface TeamDetail {
  name: string;
  inviteCode: string;
  totalDistanceKm: number;
}

interface Member {
  userId: string;
  name: string;
  avatarUrl?: string;
  totalDistanceKm: number;
}

interface Activity {
  id: string;
  userId: string;
  userName: string;
  distanceKm: number;
  durationSeconds: number;
  measurementType: string;
  startedAt: number;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  return `${m}分`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'members' | 'history' | 'settings'>('members');
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { user } = useAuthStore();
  const teamStore = useTeamStore();

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      await Promise.all([loadTeam(), loadMembers(), loadActivities()]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTeam() {
    const snap = await getDoc(doc(db, 'teams', id));
    if (!snap.exists()) return;
    const d = snap.data();
    setTeam({
      name: d['name'] as string,
      inviteCode: d['inviteCode'] as string,
      totalDistanceKm: (d['totalDistanceKm'] as number) ?? 0,
    });
  }

  async function loadMembers() {
    const membersSnap = await getDocs(collection(db, 'teams', id, 'members'));
    const list: Member[] = await Promise.all(
      membersSnap.docs.map(async (memberDoc) => {
        const userSnap = await getDoc(doc(db, 'users', memberDoc.id));
        const u = userSnap.data();
        return {
          userId: memberDoc.id,
          name: u ? (u['name'] as string) : '不明',
          avatarUrl: u?.['avatarUrl'] as string | undefined,
          totalDistanceKm: (memberDoc.data()['totalDistanceKm'] as number) ?? 0,
        };
      })
    );
    list.sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);
    setMembers(list);
  }

  async function loadActivities() {
    const q = query(
      collection(db, 'activities'),
      where('teamId', '==', id),
      orderBy('startedAt', 'desc'),
      limit(20)
    );
    const snap = await getDocs(q);

    const userNames: Record<string, string> = {};
    const list: Activity[] = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const uid = data['userId'] as string;
        if (!userNames[uid]) {
          const u = await getDoc(doc(db, 'users', uid));
          userNames[uid] = u.exists() ? (u.data()['name'] as string) : '不明';
        }
        const startedAt = data['startedAt'] as Timestamp | null;
        return {
          id: d.id,
          userId: uid,
          userName: userNames[uid],
          distanceKm: (data['distanceKm'] as number) ?? 0,
          durationSeconds: (data['durationSeconds'] as number) ?? 0,
          measurementType: (data['measurementType'] as string) ?? 'gps',
          startedAt: startedAt?.toMillis?.() ?? 0,
        };
      })
    );
    setActivities(list);
  }

  async function handleRename() {
    if (!newName.trim()) { Alert.alert('チーム名を入力してください'); return; }
    setRenaming(true);
    try {
      await updateDoc(doc(db, 'teams', id), { name: newName.trim() });
      setTeam((prev) => prev ? { ...prev, name: newName.trim() } : null);
      teamStore.setTeam(teamStore.currentTeam ? { ...teamStore.currentTeam, name: newName.trim() } : teamStore.currentTeam!);
      setNewName('');
      Alert.alert('変更しました');
    } catch {
      Alert.alert('エラー', '変更に失敗しました');
    } finally {
      setRenaming(false);
    }
  }

  async function handleLeave() {
    if (!user) return;
    Alert.alert('チームを退出', 'チームから退出しますか？\n記録は残りますが、ランキングから外れます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '退出する', style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          try {
            await deleteDoc(doc(db, 'teams', id, 'members', user.id));
            useTeamStore.setState({ currentTeam: null, members: [] });
            router.replace('/(tabs)');
          } catch {
            Alert.alert('エラー', '退出に失敗しました');
            setLeaving(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const teamDist = team?.totalDistanceKm ?? 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{team?.name ?? 'チーム詳細'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* チームサマリー */}
      <Card style={styles.summaryCard}>
        <Text style={styles.teamName}>{team?.name}</Text>
        <Text style={styles.distanceValue}>{teamDist.toFixed(1)} km</Text>
        <ProgressBar value={Math.min(teamDist / TEAM_GOAL_KM, 1)} />
        <Text style={styles.goalText}>目標 {TEAM_GOAL_KM} km　{Math.round((teamDist / TEAM_GOAL_KM) * 100)}%</Text>
      </Card>

      {/* タブ */}
      <View style={styles.tabRow}>
        {([['members', 'メンバー'], ['history', '活動履歴'], ['settings', '設定']] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && styles.tabActive]}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[styles.tabLabel, activeTab === key && styles.tabLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {activeTab === 'members' ? (
          <Card style={styles.card}>
            {members.length === 0 ? (
              <Text style={styles.emptyText}>メンバーがいません</Text>
            ) : (
              members.map((m, i) => (
                <View key={m.userId} style={styles.memberRow}>
                  <RankBadge rank={i + 1} />
                  <Avatar name={m.name} uri={m.avatarUrl} size="sm" />
                  <Text style={styles.memberName}>{m.name}</Text>
                  <Text style={styles.memberDist}>{m.totalDistanceKm.toFixed(1)} km</Text>
                </View>
              ))
            )}
          </Card>
        ) : activeTab === 'settings' ? (
          <Card style={styles.card}>
            <Text style={styles.settingsLabel}>チーム名を変更</Text>
            <TextInput
              style={styles.settingsInput}
              value={newName}
              onChangeText={setNewName}
              placeholder={team?.name ?? 'チーム名'}
              placeholderTextColor={Colors.textTertiary}
              maxLength={30}
            />
            <TouchableOpacity
              style={[styles.settingsBtn, styles.settingsBtnPrimary]}
              onPress={handleRename}
              disabled={renaming}
            >
              <Text style={styles.settingsBtnTextPrimary}>{renaming ? '変更中...' : '名前を変更する'}</Text>
            </TouchableOpacity>
            <View style={styles.settingsDivider} />
            <TouchableOpacity
              style={[styles.settingsBtn, styles.settingsBtnDanger]}
              onPress={handleLeave}
              disabled={leaving}
            >
              <Text style={styles.settingsBtnTextDanger}>{leaving ? '処理中...' : 'チームから退出する'}</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <Card style={styles.card}>
            {activities.length === 0 ? (
              <Text style={styles.emptyText}>
                まだ記録がありません。{'\n'}走って記録を貯めよう！
              </Text>
            ) : (
              activities.map((a) => (
                <View key={a.id} style={styles.activityRow}>
                  <View style={styles.activityLeft}>
                    <Text style={styles.activityIcon}>
                      {a.measurementType === 'gps' ? '📍' : '👟'}
                    </Text>
                    <View>
                      <Text style={styles.activityName}>{a.userName}</Text>
                      <Text style={styles.activityMeta}>
                        {formatDate(a.startedAt)}　{formatDuration(a.durationSeconds)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.activityDist}>{a.distanceKm.toFixed(2)} km</Text>
                </View>
              ))
            )}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  back: { fontSize: Typography.fontSize.md, color: Colors.primary },
  title: {
    flex: 1, textAlign: 'center',
    fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  summaryCard: { margin: Spacing.lg, marginBottom: 0 },
  teamName: {
    fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary, marginBottom: Spacing.sm,
  },
  distanceValue: {
    fontSize: Typography.fontSize['3xl'], fontWeight: Typography.fontWeight.extrabold,
    color: Colors.textPrimary, marginBottom: Spacing.sm,
  },
  goalText: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: Spacing.xs },
  tabRow: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border, marginTop: Spacing.lg,
  },
  tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  tabLabelActive: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  scroll: { paddingTop: Spacing.lg, paddingBottom: Spacing['3xl'] },
  card: { marginBottom: 0 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  memberName: { flex: 1, fontSize: Typography.fontSize.md, color: Colors.textPrimary },
  memberDist: {
    fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
  },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  activityLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  activityIcon: { fontSize: 20 },
  activityName: { fontSize: Typography.fontSize.md, color: Colors.textPrimary, fontWeight: Typography.fontWeight.medium },
  activityMeta: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  activityDist: {
    fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  settingsLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, fontWeight: Typography.fontWeight.medium, marginBottom: Spacing.sm },
  settingsInput: {
    height: 48, backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, fontSize: Typography.fontSize.md,
    color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border,
  },
  settingsBtn: {
    height: 48, borderRadius: BorderRadius.sm, alignItems: 'center',
    justifyContent: 'center', marginTop: Spacing.sm,
  },
  settingsBtnPrimary: { backgroundColor: Colors.primaryLight },
  settingsBtnDanger: { backgroundColor: Colors.error + '15', borderWidth: 1, borderColor: Colors.error },
  settingsBtnTextPrimary: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  settingsBtnTextDanger: { color: Colors.error, fontWeight: Typography.fontWeight.semibold },
  settingsDivider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.lg },
  emptyText: {
    fontSize: Typography.fontSize.sm, color: Colors.textTertiary,
    textAlign: 'center', paddingVertical: Spacing.xl, lineHeight: 22,
  },
});
