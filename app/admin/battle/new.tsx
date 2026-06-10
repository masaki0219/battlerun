import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  addDoc, collection, getDocs, orderBy, query, Timestamp,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuthStore } from '../../../stores/authStore';
import { useBattleStore } from '../../../stores/battleStore';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Colors, Typography, Spacing, BorderRadius } from '../../../design_tokens';
import type { Category, Season } from '../../../types';

type SeasonDraftMode = 'existing' | 'new' | 'none';

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseLocalDate(value: string, endOfDay = false): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }
  return parsed;
}

function mapSeason(id: string, data: Record<string, any>): Season {
  return {
    id,
    title: (data['title'] as string) ?? '',
    startAt: (data['startAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
    endAt: (data['endAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
    status: (data['status'] as 'active' | 'archived') ?? 'active',
  };
}

export default function NewPublicBattleScreen() {
  const { user } = useAuthStore();
  const { createBattle } = useBattleStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'team' | 'individual'>('team');
  const [categories, setCategories] = useState<Category[]>([
    { id: '', label: '' },
    { id: '', label: '' },
  ]);
  const [rankingType, setRankingType] = useState<'average' | 'total'>('average');
  const today = useMemo(() => new Date(), []);
  const defaultStartAt = useMemo(() => formatDateInput(today), [today]);
  const defaultEndAt = useMemo(() => formatDateInput(addDays(today, 41)), [today]);
  const [startAt, setStartAt] = useState(defaultStartAt);
  const [endAt, setEndAt] = useState(defaultEndAt);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonMode, setSeasonMode] = useState<SeasonDraftMode>('new');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [newSeasonTitle, setNewSeasonTitle] = useState('');
  const [newSeasonStartAt, setNewSeasonStartAt] = useState(defaultStartAt);
  const [newSeasonEndAt, setNewSeasonEndAt] = useState(defaultEndAt);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    loadSeasons();
  }, [user]);

  useEffect(() => {
    if (!newSeasonTitle.trim()) {
      setNewSeasonTitle(`第${seasons.length + 1}シーズン`);
    }
  }, [seasons.length]);

  async function loadSeasons() {
    setLoadingSeasons(true);
    try {
      const q = query(collection(db, 'seasons'), orderBy('startAt', 'desc'));
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => mapSeason(d.id, d.data()));
      setSeasons(items);
      const activeSeason = items.find((season) => season.status === 'active');
      if (activeSeason) {
        setSeasonMode('existing');
        applySeason(activeSeason);
      }
    } catch {
      Alert.alert('エラー', 'シーズン一覧の取得に失敗しました');
    } finally {
      setLoadingSeasons(false);
    }
  }

  function applySeason(season: Season) {
    setSelectedSeasonId(season.id);
    if (season.startAt) setStartAt(formatDateInput(new Date(season.startAt)));
    if (season.endAt) setEndAt(formatDateInput(new Date(season.endAt)));
  }

  function syncSeasonDatesWithBattle() {
    setNewSeasonStartAt(startAt);
    setNewSeasonEndAt(endAt);
  }

  function addCategory() {
    setCategories((prev) => [...prev, { id: '', label: '' }]);
  }

  function removeCategory(index: number) {
    setCategories((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLabel(index: number, label: string) {
    setCategories((prev) => prev.map((c, i) => i === index ? { ...c, label } : c));
  }

  async function handleCreate() {
    if (!user || user.role !== 'admin') {
      Alert.alert('権限エラー');
      return;
    }
    if (!title.trim()) {
      Alert.alert('入力エラー', 'チャレンジ名を入力してください');
      return;
    }
    if (mode === 'team') {
      const validCats = categories.filter((c) => c.label.trim());
      if (validCats.length < 2) {
        Alert.alert('入力エラー', '区分を2つ以上入力してください');
        return;
      }
    }
    if (!startAt || !endAt) {
      Alert.alert('入力エラー', '開始日と終了日を入力してください（YYYY-MM-DD）');
      return;
    }
    const startDate = parseLocalDate(startAt);
    const endDate = parseLocalDate(endAt, true);
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
      let resolvedSeasonId: string | null = null;
      if (seasonMode === 'existing') {
        if (!selectedSeasonId) {
          Alert.alert('入力エラー', 'シーズンを選択してください');
          return;
        }
        resolvedSeasonId = selectedSeasonId;
      }
      if (seasonMode === 'new') {
        if (!newSeasonTitle.trim()) {
          Alert.alert('入力エラー', 'シーズン名を入力してください');
          return;
        }
        const seasonStartDate = parseLocalDate(newSeasonStartAt);
        const seasonEndDate = parseLocalDate(newSeasonEndAt, true);
        if (!seasonStartDate || !seasonEndDate) {
          Alert.alert('入力エラー', 'シーズン期間の形式が正しくありません（例: 2026-06-01）');
          return;
        }
        if (seasonEndDate <= seasonStartDate) {
          Alert.alert('入力エラー', 'シーズン終了日は開始日より後にしてください');
          return;
        }
        const seasonRef = await addDoc(collection(db, 'seasons'), {
          title: newSeasonTitle.trim(),
          startAt: Timestamp.fromDate(seasonStartDate),
          endAt: Timestamp.fromDate(seasonEndDate),
          status: 'active',
        });
        resolvedSeasonId = seasonRef.id;
      }

      const validCats: Category[] = mode === 'team'
        ? categories.filter((c) => c.label.trim()).map((c, i) => ({
            id: c.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || `cat${i}`,
            label: c.label.trim(),
          }))
        : [];

      await createBattle({
        title: title.trim(),
        description: description.trim(),
        mode,
        categories: validCats,
        rankingType,
        startAt: startDate,
        endAt: endDate,
        userId: user.id,
        isPublic: true,
        seasonId: resolvedSeasonId,
      });

      Alert.alert('作成完了', 'パブリックランを作成しました', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '作成に失敗しました');
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>パブリックラン 新規作成</Text>
        <View style={{ width: 48 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            {/* チャレンジ名 */}
            <Text style={styles.label}>チャレンジ名 *</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle}
              placeholder="例: 春のランニングチャレンジ2026" placeholderTextColor={Colors.textTertiary} maxLength={40} />

            {/* 説明 */}
            <Text style={styles.label}>説明</Text>
            <TextInput style={[styles.input, styles.inputMulti]} value={description} onChangeText={setDescription}
              placeholder="チャレンジの説明..." placeholderTextColor={Colors.textTertiary} multiline maxLength={200} />

            {/* シーズン */}
            <Text style={styles.label}>シーズン</Text>
            {loadingSeasons ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.helpText}>シーズンを読み込み中...</Text>
              </View>
            ) : (
              <>
                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, seasonMode === 'new' && styles.toggleBtnActive]}
                    onPress={() => setSeasonMode('new')}
                  >
                    <Text style={[styles.toggleBtnText, seasonMode === 'new' && styles.toggleBtnTextActive]}>
                      新規作成
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, seasonMode === 'existing' && styles.toggleBtnActive]}
                    onPress={() => setSeasonMode('existing')}
                  >
                    <Text style={[styles.toggleBtnText, seasonMode === 'existing' && styles.toggleBtnTextActive]}>
                      既存を使う
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, seasonMode === 'none' && styles.toggleBtnActive]}
                    onPress={() => setSeasonMode('none')}
                  >
                    <Text style={[styles.toggleBtnText, seasonMode === 'none' && styles.toggleBtnTextActive]}>
                      なし
                    </Text>
                  </TouchableOpacity>
                </View>

                {seasonMode === 'new' && (
                  <View style={styles.seasonPanel}>
                    <TextInput style={styles.input} value={newSeasonTitle} onChangeText={setNewSeasonTitle}
                      placeholder="例: 第2シーズン" placeholderTextColor={Colors.textTertiary} maxLength={30} />
                    <View style={styles.dateGrid}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>開始日</Text>
                        <TextInput style={styles.input} value={newSeasonStartAt} onChangeText={setNewSeasonStartAt}
                          placeholder="2026-06-01" placeholderTextColor={Colors.textTertiary} maxLength={10} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>終了日</Text>
                        <TextInput style={styles.input} value={newSeasonEndAt} onChangeText={setNewSeasonEndAt}
                          placeholder="2026-07-12" placeholderTextColor={Colors.textTertiary} maxLength={10} />
                      </View>
                    </View>
                    <TouchableOpacity style={styles.linkBtn} onPress={syncSeasonDatesWithBattle}>
                      <Text style={styles.linkBtnText}>チャレンジ期間と同期</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {seasonMode === 'existing' && (
                  <View style={styles.seasonList}>
                    {seasons.length === 0 ? (
                      <Text style={styles.helpText}>既存シーズンがありません。新規作成を選んでください。</Text>
                    ) : (
                      seasons.map((season) => (
                        <TouchableOpacity
                          key={season.id}
                          style={[
                            styles.seasonOption,
                            selectedSeasonId === season.id && styles.seasonOptionActive,
                          ]}
                          onPress={() => applySeason(season)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[
                              styles.seasonTitle,
                              selectedSeasonId === season.id && styles.seasonTitleActive,
                            ]}>
                              {season.title || season.id}
                            </Text>
                            <Text style={styles.seasonMeta}>
                              {season.startAt ? new Date(season.startAt).toLocaleDateString('ja-JP') : '未定'} 〜{' '}
                              {season.endAt ? new Date(season.endAt).toLocaleDateString('ja-JP') : '未定'}
                            </Text>
                          </View>
                          <Text style={[
                            styles.seasonStatus,
                            season.status === 'active' ? styles.seasonStatusActive : styles.seasonStatusArchived,
                          ]}>
                            {season.status === 'active' ? '開催中' : '終了'}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </>
            )}

            {/* モード */}
            <Text style={styles.label}>モード *</Text>
            <View style={styles.toggleRow}>
              {(['team', 'individual'] as const).map((m) => (
                <TouchableOpacity key={m}
                  style={[styles.toggleBtn, mode === m && styles.toggleBtnActive]}
                  onPress={() => setMode(m)}
                >
                  <Text style={[styles.toggleBtnText, mode === m && styles.toggleBtnTextActive]}>
                    {m === 'team' ? '👥 陣営戦' : '🏃 個人戦'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 区分リスト（陣営戦のみ） */}
            {mode === 'team' && (
              <>
                <Text style={styles.label}>区分リスト *（最低2つ）</Text>
                {categories.map((cat, i) => (
                  <View key={i} style={styles.catRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={cat.label}
                      onChangeText={(v) => updateLabel(i, v)}
                      placeholder={`区分 ${i + 1}（例: きのこの山）`}
                      placeholderTextColor={Colors.textTertiary}
                      maxLength={20}
                    />
                    {categories.length > 2 && (
                      <TouchableOpacity style={styles.removeBtn} onPress={() => removeCategory(i)}>
                        <Text style={styles.removeText}>×</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity style={styles.addBtn} onPress={addCategory}>
                  <Text style={styles.addText}>＋ 区分を追加</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ランキング方式 */}
            <Text style={styles.label}>ランキング方式</Text>
            <View style={styles.toggleRow}>
              {(['average', 'total'] as const).map((t) => (
                <TouchableOpacity key={t}
                  style={[styles.toggleBtn, rankingType === t && styles.toggleBtnActive]}
                  onPress={() => setRankingType(t)}
                >
                  <Text style={[styles.toggleBtnText, rankingType === t && styles.toggleBtnTextActive]}>
                    {t === 'average' ? '1人あたり平均' : '合計距離'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 開始日・終了日 */}
            <Text style={styles.label}>開始日 *（YYYY-MM-DD）</Text>
            <TextInput style={styles.input} value={startAt} onChangeText={setStartAt}
              placeholder="例: 2026-06-01" placeholderTextColor={Colors.textTertiary} maxLength={10} />

            <Text style={styles.label}>終了日 *（YYYY-MM-DD）</Text>
            <TextInput style={styles.input} value={endAt} onChangeText={setEndAt}
              placeholder="例: 2026-06-30" placeholderTextColor={Colors.textTertiary} maxLength={10} />

            <Button
              label="パブリックランを作成する"
              onPress={handleCreate}
              loading={creating}
              style={{ marginTop: Spacing.xl }}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scroll: { padding: Spacing.lg },
  card: { marginBottom: 0 },
  label: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, fontWeight: Typography.fontWeight.medium, marginTop: Spacing.lg, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.md, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  helpText: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary },
  toggleRow: { flexDirection: 'row', gap: Spacing.sm },
  toggleBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceGray, borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  toggleBtnText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  toggleBtnTextActive: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  removeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.error + '15', alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: Typography.fontSize.lg, color: Colors.error, fontWeight: Typography.fontWeight.bold },
  addBtn: { padding: Spacing.sm, alignItems: 'center', marginTop: Spacing.xs },
  addText: { fontSize: Typography.fontSize.sm, color: Colors.primary, fontWeight: Typography.fontWeight.medium },
  seasonPanel: { gap: Spacing.sm, marginTop: Spacing.sm },
  dateGrid: { flexDirection: 'row', gap: Spacing.sm },
  subLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginBottom: Spacing.xs,
  },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: Spacing.xs },
  linkBtnText: { fontSize: Typography.fontSize.sm, color: Colors.primary, fontWeight: Typography.fontWeight.medium },
  seasonList: { gap: Spacing.sm, marginTop: Spacing.sm },
  seasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceGray,
  },
  seasonOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  seasonTitle: { fontSize: Typography.fontSize.sm, color: Colors.textPrimary, fontWeight: Typography.fontWeight.semibold },
  seasonTitleActive: { color: Colors.primary },
  seasonMeta: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  seasonStatus: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  seasonStatusActive: { color: Colors.primary, backgroundColor: Colors.surface },
  seasonStatusArchived: { color: Colors.textTertiary, backgroundColor: Colors.surface },
});
