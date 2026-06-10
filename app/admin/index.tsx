import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { collection, getDocs, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import type { Battle } from '../../types';
import { Timestamp } from 'firebase/firestore';

function mapBattle(id: string, data: Record<string, any>): Battle {
  return {
    id,
    type: data['type'] as 'public' | 'private',
    seasonId: data['seasonId'] ?? null,
    title: data['title'] as string,
    description: (data['description'] as string) ?? '',
    mode: (data['mode'] as 'team' | 'individual') ?? 'team',
    categories: (data['categories'] ?? []),
    rankingType: (data['rankingType'] as 'average' | 'total') ?? 'average',
    startAt: (data['startAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
    endAt: (data['endAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
    status: (data['status'] as 'upcoming' | 'active' | 'finished') ?? 'active',
    createdBy: data['createdBy'] ?? null,
    inviteCode: data['inviteCode'] ?? null,
  };
}

export default function AdminIndexScreen() {
  const { user } = useAuthStore();
  const [battles, setBattles] = useState<Battle[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // 管理者権限チェック
  useEffect(() => {
    if (user && user.role !== 'admin') {
      Alert.alert('アクセス権限がありません');
      router.replace('/(tabs)');
    }
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    loadBattles();
  }, [user]);

  async function loadBattles() {
    setLoading(true);
    try {
      const q = query(collection(db, 'battles'), orderBy('startAt', 'desc'));
      const snap = await getDocs(q);
      setBattles(snap.docs.map((d) => mapBattle(d.id, d.data())));
    } catch {
      Alert.alert('エラー', 'チャレンジの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(battle: Battle) {
    const next = battle.status === 'active' ? 'finished' : 'active';
    Alert.alert(
      `ステータスを「${next === 'active' ? '開催中' : '終了'}」に変更`,
      '変更しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '変更する',
          onPress: async () => {
            setUpdatingId(battle.id);
            try {
              await updateDoc(doc(db, 'battles', battle.id), { status: next });
              setBattles((prev) =>
                prev.map((b) => b.id === battle.id ? { ...b, status: next } : b)
              );
            } catch {
              Alert.alert('エラー', '更新に失敗しました');
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ]
    );
  }

  function statusLabel(status: Battle['status']): string {
    return status === 'active' ? '開催中' : status === 'upcoming' ? '開催前' : '終了';
  }

  function statusColor(status: Battle['status']): string {
    return status === 'active' ? Colors.primary : status === 'upcoming' ? Colors.warning : Colors.textTertiary;
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⚙️ 管理画面</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Button
          label="＋ パブリックランを新規作成"
          onPress={() => router.push('/admin/battle/new')}
          style={styles.createBtn}
        />

        <Text style={styles.sectionTitle}>チャレンジ一覧（{battles.length}件）</Text>

        {battles.length === 0 ? (
          <Card style={styles.card}>
            <Text style={styles.emptyText}>チャレンジがありません</Text>
          </Card>
        ) : (
          battles.map((battle) => (
            <Card key={battle.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.battleTitle} numberOfLines={1}>{battle.title}</Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.typeBadge, { backgroundColor: battle.type === 'public' ? Colors.primaryLight : Colors.surfaceGray }]}>
                      <Text style={[styles.typeBadgeText, { color: battle.type === 'public' ? Colors.primary : Colors.textSecondary }]}>
                        {battle.type === 'public' ? '公開' : 'プライベート'}
                      </Text>
                    </View>
                    <View style={[styles.typeBadge, { backgroundColor: battle.mode === 'team' ? Colors.info + '22' : Colors.accentYellow + '22' }]}>
                      <Text style={[styles.typeBadgeText, { color: battle.mode === 'team' ? Colors.info : Colors.accentYellow }]}>
                        {battle.mode === 'team' ? '陣営戦' : '個人戦'}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={[styles.statusText, { color: statusColor(battle.status) }]}>
                  {statusLabel(battle.status)}
                </Text>
              </View>

              {battle.categories.length > 0 && (
                <Text style={styles.catList}>
                  区分: {battle.categories.map((c) => c.label).join(' / ')}
                </Text>
              )}

              {battle.startAt && (
                <Text style={styles.dateText}>
                  {new Date(battle.startAt).toLocaleDateString('ja-JP')} 〜{' '}
                  {battle.endAt ? new Date(battle.endAt).toLocaleDateString('ja-JP') : '未定'}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.toggleBtn, { borderColor: statusColor(battle.status) }]}
                onPress={() => handleToggleStatus(battle)}
                disabled={updatingId === battle.id}
              >
                {updatingId === battle.id
                  ? <ActivityIndicator size="small" color={statusColor(battle.status)} />
                  : <Text style={[styles.toggleBtnText, { color: statusColor(battle.status) }]}>
                      {battle.status === 'active' ? '終了にする' : '開催中にする'}
                    </Text>
                }
              </TouchableOpacity>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  back: { fontSize: Typography.fontSize.md, color: Colors.primary },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
  scroll: { padding: Spacing.lg, gap: Spacing.lg },
  createBtn: { marginBottom: Spacing.sm },
  sectionTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: Colors.textSecondary },
  card: { marginBottom: 0 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  battleTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  badgeRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs },
  typeBadge: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  typeBadgeText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold },
  statusText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold },
  catList: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.xs },
  dateText: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginBottom: Spacing.sm },
  toggleBtn: {
    borderWidth: 1, borderRadius: BorderRadius.sm, paddingVertical: Spacing.sm,
    alignItems: 'center', marginTop: Spacing.xs,
  },
  toggleBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold },
  emptyText: { textAlign: 'center', color: Colors.textSecondary, padding: Spacing.lg },
});
