import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { collection, getDocs, query, orderBy, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Colors, DarkColors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import type { Battle, CategoryStats } from '../../types';

type BattleSection = {
  status: Battle['status'];
  title: string;
  emptyLabel: string;
};

const BATTLE_SECTIONS: BattleSection[] = [
  { status: 'active', title: '開催中', emptyLabel: '開催中のチャレンジはありません' },
  { status: 'upcoming', title: '開催前', emptyLabel: '開催前のチャレンジはありません' },
  { status: 'finished', title: '終了', emptyLabel: '終了したチャレンジはありません' },
];

function remainingLabel(battle: Battle, nowMs: number): string {
  if (battle.status === 'finished') return '終了済み';
  const target = new Date(battle.status === 'upcoming' ? battle.startAt : battle.endAt).getTime();
  if (!Number.isFinite(target)) return battle.status === 'upcoming' ? '開始日時未設定' : '終了日時未設定';
  const remainingMinutes = Math.max(0, Math.ceil((target - nowMs) / 60_000));
  const days = Math.floor(remainingMinutes / (24 * 60));
  const hours = Math.floor((remainingMinutes % (24 * 60)) / 60);
  const minutes = remainingMinutes % 60;
  const parts = [days > 0 ? `${days}日` : '', hours > 0 ? `${hours}時間` : '', `${minutes}分`].filter(Boolean);
  return `${battle.status === 'upcoming' ? '開始まで' : '終了まで'} ${parts.join(' ')}`;
}

function mapBattle(id: string, data: Record<string, any>): Battle {
  return {
    id,
    type: data['type'] as 'public' | 'private',
    seasonId: data['seasonId'] ?? null,
    title: data['title'] as string,
    description: (data['description'] as string) ?? '',
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [endingBattle, setEndingBattle] = useState<Battle | null>(null);
  const [endingTitle, setEndingTitle] = useState('');
  const [endingStats, setEndingStats] = useState<CategoryStats[]>([]);
  const [endingStatsLoading, setEndingStatsLoading] = useState(false);

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

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

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

  async function handleStartNow(battle: Battle) {
    Alert.alert(
      '今すぐ開始しますか？',
      '設定した開始日時より前に、例外として手動開始します。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '開始する',
          onPress: async () => {
            setUpdatingId(battle.id);
            try {
              const startedAt = Timestamp.now();
              await updateDoc(doc(db, 'battles', battle.id), {
                status: 'active',
                startAt: startedAt,
              });
              setBattles((prev) =>
                prev.map((b) => b.id === battle.id
                  ? { ...b, status: 'active', startAt: startedAt.toDate().toISOString() }
                  : b)
              );
            } catch {
              Alert.alert('エラー', '開始処理に失敗しました');
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ]
    );
  }

  async function openEndConfirmation(battle: Battle) {
    setEndingBattle(battle);
    setEndingTitle('');
    setEndingStats([]);
    setEndingStatsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'battles', battle.id, 'category_stats'));
      setEndingStats(snap.docs.map((statsDoc) => ({
        categoryId: statsDoc.id,
        label: battle.categories.find((category) => category.id === statsDoc.id)?.label ?? statsDoc.id,
        totalDistanceKm: (statsDoc.data()['totalDistanceKm'] as number) ?? 0,
        avgDistanceKm: (statsDoc.data()['avgDistanceKm'] as number) ?? 0,
        participantCount: (statsDoc.data()['participantCount'] as number) ?? 0,
      })).sort((a, b) => (
        battle.rankingType === 'total'
          ? b.totalDistanceKm - a.totalDistanceKm
          : b.avgDistanceKm - a.avgDistanceKm
      )));
    } catch {
      Alert.alert('順位を取得できませんでした', '終了前にチャレンジ詳細で現在の順位を確認してください。');
    } finally {
      setEndingStatsLoading(false);
    }
  }

  function closeEndConfirmation() {
    if (updatingId) return;
    setEndingBattle(null);
    setEndingTitle('');
    setEndingStats([]);
  }

  async function handleFinishNow() {
    if (!endingBattle || endingTitle !== endingBattle.title) return;
    setUpdatingId(endingBattle.id);
    try {
      const endedAt = Timestamp.now();
      await updateDoc(doc(db, 'battles', endingBattle.id), {
        status: 'finished',
        endAt: endedAt,
      });
      setBattles((prev) => prev.map((battle) => battle.id === endingBattle.id
        ? { ...battle, status: 'finished', endAt: endedAt.toDate().toISOString() }
        : battle));
      setEndingBattle(null);
      setEndingTitle('');
      setEndingStats([]);
    } catch {
      Alert.alert('エラー', '終了処理に失敗しました');
    } finally {
      setUpdatingId(null);
    }
  }

  function statusColor(status: Battle['status']): string {
    return status === 'active' ? Colors.primary : status === 'upcoming' ? Colors.warningText : Colors.textTertiary;
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
        <TouchableOpacity style={styles.reportQueue} onPress={() => router.push('/admin/reports' as any)}>
          <View style={styles.reportQueueIcon}><Text style={styles.reportQueueEmoji}>🛡️</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportQueueTitle}>通報キュー</Text>
            <Text style={styles.reportQueueDetail}>ユーザーからの安全に関する通報を確認・処理</Text>
          </View>
          <Text style={styles.reportQueueArrow}>›</Text>
        </TouchableOpacity>
        <Button
          label="＋ パブリックランを新規作成"
          onPress={() => router.push('/admin/battle/new')}
          style={styles.createBtn}
        />

        <View style={styles.manualNotice}>
          <Text style={styles.manualNoticeTitle}>手動操作は緊急時のみ</Text>
          <Text style={styles.manualNoticeText}>
            通常は開始・終了日時で自動的に切り替わります。ここでは例外として今すぐ開始・終了できます。
          </Text>
        </View>

        {BATTLE_SECTIONS.map((section) => {
          const sectionBattles = battles.filter((battle) => battle.status === section.status);
          return (
            <View key={section.status} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionCount}>{sectionBattles.length}件</Text>
              </View>
              {sectionBattles.length === 0 ? (
                <Text style={styles.sectionEmpty}>{section.emptyLabel}</Text>
              ) : sectionBattles.map((battle) => (
                <Card key={battle.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.battleTitle} numberOfLines={2}>{battle.title}</Text>
                      <View style={styles.badgeRow}>
                        <View style={[styles.typeBadge, { backgroundColor: battle.type === 'public' ? Colors.primaryLight : Colors.surfaceGray }]}>
                          <Text style={[styles.typeBadgeText, { color: battle.type === 'public' ? Colors.primary : Colors.textSecondary }]}>
                            {battle.type === 'public' ? '公開' : 'プライベート'}
                          </Text>
                        </View>
                        <Text style={[styles.timeBadge, { color: statusColor(battle.status) }]}>
                          {remainingLabel(battle, nowMs)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {battle.categories.length > 0 && (
                    <Text style={styles.catList}>
                      チーム: {battle.categories.map((c) => c.label).join(' / ')}
                    </Text>
                  )}

                  {battle.startAt && (
                    <Text style={styles.dateText}>
                      {new Date(battle.startAt).toLocaleString('ja-JP')} 〜{' '}
                      {battle.endAt ? new Date(battle.endAt).toLocaleString('ja-JP') : '未定'}
                    </Text>
                  )}

                  {battle.status === 'finished' ? (
                    <TouchableOpacity
                      style={styles.resultBtn}
                      onPress={() => router.push(`/battle/result/${battle.id}` as any)}
                    >
                      <Text style={styles.resultBtnText}>結果を見る</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.toggleBtn, { borderColor: statusColor(battle.status) }]}
                      onPress={() => battle.status === 'upcoming'
                        ? handleStartNow(battle)
                        : openEndConfirmation(battle)}
                      disabled={updatingId === battle.id}
                    >
                      {updatingId === battle.id
                        ? <ActivityIndicator size="small" color={statusColor(battle.status)} />
                        : <Text style={[styles.toggleBtnText, { color: statusColor(battle.status) }]}>
                            {battle.status === 'upcoming' ? '今すぐ開始' : '今すぐ終了'}
                          </Text>
                      }
                    </TouchableOpacity>
                  )}
                </Card>
              ))}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={endingBattle !== null} transparent animationType="slide" onRequestClose={closeEndConfirmation}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>チャレンジを今すぐ終了</Text>
            <Text style={styles.modalWarning}>
              称号が付与され、参加者全員に通知が飛びます。この操作は取り消せません。
            </Text>

            <Text style={styles.previewTitle}>現在の順位（この順位で称号を付与）</Text>
            {endingStatsLoading ? (
              <ActivityIndicator color={Colors.primary} style={styles.previewLoading} />
            ) : endingStats.length === 0 ? (
              <Text style={styles.previewEmpty}>順位データがありません</Text>
            ) : endingStats.map((stats, index) => {
              const value = endingBattle?.rankingType === 'total'
                ? stats.totalDistanceKm
                : stats.avgDistanceKm;
              return (
                <View key={stats.categoryId} style={styles.previewRow}>
                  <Text style={styles.previewRank}>{index + 1}位</Text>
                  <Text style={styles.previewLabel} numberOfLines={1}>{stats.label}</Text>
                  <Text style={styles.previewValue}>{value.toFixed(2)}km</Text>
                </View>
              );
            })}

            <Text style={styles.inputLabel}>確認のためチャレンジ名を入力</Text>
            <Text style={styles.confirmTitle}>{endingBattle?.title}</Text>
            <TextInput
              value={endingTitle}
              onChangeText={setEndingTitle}
              placeholder="チャレンジ名を正確に入力"
              placeholderTextColor={Colors.textTertiary}
              style={styles.confirmInput}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!updatingId}
            />
            <TouchableOpacity
              style={[
                styles.finishBtn,
                endingTitle !== endingBattle?.title && styles.finishBtnDisabled,
              ]}
              onPress={handleFinishNow}
              disabled={endingTitle !== endingBattle?.title || updatingId !== null}
            >
              {updatingId
                ? <ActivityIndicator color={Colors.textOnPrimary} />
                : <Text style={styles.finishBtnText}>取り消せないことを理解して終了</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={closeEndConfirmation} disabled={updatingId !== null}>
              <Text style={styles.cancelBtnText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  reportQueue: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primaryBorder },
  reportQueueIcon: { width: 42, height: 42, borderRadius: BorderRadius.full, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  reportQueueEmoji: { fontSize: 20 },
  reportQueueTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.primaryDark },
  reportQueueDetail: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  reportQueueArrow: { fontSize: 26, color: Colors.primary },
  manualNotice: { padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.accentLight, borderWidth: 1, borderColor: Colors.warningText },
  manualNoticeTitle: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  manualNoticeText: { marginTop: Spacing.xs, fontSize: Typography.fontSize.xs, lineHeight: 18, color: Colors.textSecondary },
  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  sectionCount: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  sectionEmpty: { paddingVertical: Spacing.md, textAlign: 'center', fontSize: Typography.fontSize.sm, color: Colors.textTertiary },
  card: { marginBottom: 0 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  battleTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  badgeRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs },
  typeBadge: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  typeBadgeText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold },
  timeBadge: { alignSelf: 'center', fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold },
  catList: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.xs },
  dateText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.sm },
  toggleBtn: {
    borderWidth: 1, borderRadius: BorderRadius.sm, paddingVertical: Spacing.sm,
    alignItems: 'center', marginTop: Spacing.xs,
  },
  toggleBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold },
  resultBtn: { borderRadius: BorderRadius.sm, paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.xs, backgroundColor: Colors.surfaceGray },
  resultBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.primary },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: DarkColors.modalBackdrop },
  modalSheet: { maxHeight: '92%', padding: Spacing.lg, paddingBottom: Spacing.xl, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, backgroundColor: Colors.surface },
  modalHandle: { width: 40, height: 4, alignSelf: 'center', marginBottom: Spacing.lg, borderRadius: BorderRadius.full, backgroundColor: Colors.border },
  modalTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  modalWarning: { marginTop: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.accentLight, fontSize: Typography.fontSize.sm, lineHeight: 21, color: Colors.error },
  previewTitle: { marginTop: Spacing.lg, marginBottom: Spacing.sm, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  previewLoading: { marginVertical: Spacing.lg },
  previewEmpty: { paddingVertical: Spacing.sm, fontSize: Typography.fontSize.sm, color: Colors.textTertiary },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  previewRank: { width: 36, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
  previewLabel: { flex: 1, fontSize: Typography.fontSize.sm, color: Colors.textPrimary },
  previewValue: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.primary },
  inputLabel: { marginTop: Spacing.lg, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
  confirmTitle: { marginTop: Spacing.xs, fontSize: Typography.fontSize.sm, color: Colors.error },
  confirmInput: { minHeight: 48, marginTop: Spacing.sm, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, fontSize: Typography.fontSize.md, color: Colors.textPrimary, backgroundColor: Colors.background },
  finishBtn: { minHeight: 56, marginTop: Spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md, backgroundColor: Colors.error },
  finishBtnDisabled: { opacity: 0.4 },
  finishBtnText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textOnPrimary },
  cancelBtn: { minHeight: 48, marginTop: Spacing.sm, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: Typography.fontSize.md, color: Colors.textSecondary },
});
