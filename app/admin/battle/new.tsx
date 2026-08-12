import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  collection, doc, getDocs, orderBy, query, Timestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuthStore } from '../../../stores/authStore';
import { useBattleStore } from '../../../stores/battleStore';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { PeriodPicker } from '../../../components/battle/PeriodPicker';
import { Colors, Typography, Spacing, BorderRadius } from '../../../design_tokens';
import { formatDateInput, addDays, parseLocalDate } from '../../../utils/dateInput';
import type { Category, Season, Market } from '../../../types';
import { MARKETS } from '../../../lib/market';
import { useTranslation } from '../../../lib/i18n';
import { userFacingError } from '../../../lib/userError';
import {
  buildBattleTermPeriods,
  DEFAULT_TERM_COUNT,
  DEFAULT_TERM_LENGTH_DAYS,
  MAX_TERM_COUNT,
  MAX_TERM_LENGTH_DAYS,
  periodIsWithin,
} from '../../../utils/battleTerms';

type SeasonDraftMode = 'existing' | 'new' | 'none';
type CreationMode = 'series' | 'single';

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
  const { language, t } = useTranslation();
  const { user } = useAuthStore();
  const { createPublicBattleSeries } = useBattleStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<Category[]>([
    { id: '', label: '' },
    { id: '', label: '' },
  ]);
  const [rankingType, setRankingType] = useState<'average' | 'total'>('average');
  const [market, setMarket] = useState<Market>('JP');
  const [creationMode, setCreationMode] = useState<CreationMode>('series');
  const [termCountInput, setTermCountInput] = useState(String(DEFAULT_TERM_COUNT));
  const [termLengthInput, setTermLengthInput] = useState(String(DEFAULT_TERM_LENGTH_DAYS));
  const today = useMemo(() => new Date(), []);
  const defaultStartAt = useMemo(() => formatDateInput(today), [today]);
  // 初期運用は2週間ローテーション。開始日を含め14日間になるよう13日後を既定にする。
  const defaultEndAt = useMemo(() => formatDateInput(addDays(today, 13)), [today]);
  // 3ターム×14日=42日。開始日を含めるためシーズン終了日は41日後。
  const defaultSeasonEndAt = useMemo(() => formatDateInput(addDays(today, 41)), [today]);
  const [startAt, setStartAt] = useState(defaultStartAt);
  const [endAt, setEndAt] = useState(defaultEndAt);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonMode, setSeasonMode] = useState<SeasonDraftMode>('new');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [newSeasonTitle, setNewSeasonTitle] = useState('');
  const [newSeasonStartAt, setNewSeasonStartAt] = useState(defaultStartAt);
  const [newSeasonEndAt, setNewSeasonEndAt] = useState(defaultSeasonEndAt);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    loadSeasons();
  }, [user]);

  const termCount = Number(termCountInput);
  const termLengthDays = Number(termLengthInput);
  const firstTermStart = useMemo(() => parseLocalDate(startAt), [startAt]);
  const termPeriods = useMemo(() => (
    creationMode === 'series' && firstTermStart
      ? buildBattleTermPeriods(firstTermStart, termCount, termLengthDays)
      : []
  ), [creationMode, firstTermStart?.getTime(), termCount, termLengthDays]);
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? null;

  async function loadSeasons() {
    setLoadingSeasons(true);
    try {
      const q = query(collection(db, 'seasons'), orderBy('startAt', 'desc'));
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => mapSeason(d.id, d.data()));
      setSeasons(items);
    } catch {
      Alert.alert(t('common.error'), t('admin.seasonsFailed'));
    } finally {
      setLoadingSeasons(false);
    }
  }

  function selectSeason(season: Season) {
    if (season.status !== 'active') return;
    setSelectedSeasonId(season.id);
  }

  function syncSeasonDatesWithBattle() {
    if (creationMode === 'series' && termPeriods.length > 0) {
      setNewSeasonStartAt(formatDateInput(termPeriods[0].startAt));
      setNewSeasonEndAt(formatDateInput(termPeriods[termPeriods.length - 1].endAt));
      return;
    }
    setNewSeasonStartAt(startAt);
    setNewSeasonEndAt(endAt);
  }

  function applySelectedSeasonPeriod() {
    if (!selectedSeason?.startAt || !selectedSeason.endAt) return;
    setStartAt(formatDateInput(new Date(selectedSeason.startAt)));
    if (creationMode === 'single') {
      setEndAt(formatDateInput(new Date(selectedSeason.endAt)));
    }
  }

  function archiveSeason(season: Season) {
    Alert.alert(
      t('admin.archiveSeasonTitle'),
      t('admin.archiveSeasonBody', { title: season.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.archive'),
          style: 'destructive',
          onPress: () => {
            void updateDoc(doc(db, 'seasons', season.id), { status: 'archived' })
              .then(() => {
                setSeasons((current) => current.map((item) => (
                  item.id === season.id ? { ...item, status: 'archived' } : item
                )));
                if (selectedSeasonId === season.id) setSelectedSeasonId('');
              })
              .catch((error) => Alert.alert(
                t('common.error'),
                userFacingError(error, t('admin.archiveFailed')),
              ));
          },
        },
      ],
    );
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
      Alert.alert(t('admin.permissionError'));
      return;
    }
    if (!title.trim()) {
      Alert.alert(t('admin.inputError'), t('admin.titleRequired'));
      return;
    }
    const validCats = categories.filter((c) => c.label.trim());
    if (validCats.length < 2) {
      Alert.alert(t('admin.inputError'), t('admin.teamsRequired'));
      return;
    }
    let battleDrafts: Array<{
      title: string;
      startAt: Date;
      endAt: Date;
      termIndex?: number;
      termCount?: number;
    }> = [];
    if (creationMode === 'series') {
      if (
        !Number.isInteger(termCount) || termCount < 2 || termCount > MAX_TERM_COUNT
        || !Number.isInteger(termLengthDays) || termLengthDays < 1 || termLengthDays > MAX_TERM_LENGTH_DAYS
        || termPeriods.length !== termCount
      ) {
        Alert.alert(t('admin.inputError'), t('admin.invalidTerms', {
          maxCount: MAX_TERM_COUNT,
          maxDays: MAX_TERM_LENGTH_DAYS,
        }));
        return;
      }
      battleDrafts = termPeriods.map((period) => ({
        title: title.trim(),
        startAt: period.startAt,
        endAt: period.endAt,
        termIndex: period.termIndex,
        termCount: period.termCount,
      }));
    } else {
      if (!startAt || !endAt) {
        Alert.alert(t('admin.inputError'), t('admin.datesRequired'));
        return;
      }
      const startDate = parseLocalDate(startAt);
      const endDate = parseLocalDate(endAt, true);
      if (!startDate || !endDate) {
        Alert.alert(t('admin.inputError'), t('admin.invalidDate'));
        return;
      }
      if (endDate <= startDate) {
        Alert.alert(t('admin.inputError'), t('admin.endAfterStart'));
        return;
      }
      battleDrafts = [{ title: title.trim(), startAt: startDate, endAt: endDate }];
    }

    setCreating(true);
    try {
      let resolvedSeasonId: string | null = null;
      let newSeason: { title: string; startAt: Date; endAt: Date } | undefined;
      if (seasonMode === 'existing') {
        if (!selectedSeasonId || selectedSeason?.status !== 'active') {
          Alert.alert(t('admin.inputError'), t('admin.selectSeason'));
          return;
        }
        resolvedSeasonId = selectedSeasonId;
      }
      if (seasonMode === 'new') {
        if (!newSeasonTitle.trim()) {
          Alert.alert(t('admin.inputError'), t('admin.seasonTitleRequired'));
          return;
        }
        const seasonStartDate = parseLocalDate(newSeasonStartAt);
        const seasonEndDate = parseLocalDate(newSeasonEndAt, true);
        if (!seasonStartDate || !seasonEndDate) {
          Alert.alert(t('admin.inputError'), t('admin.invalidSeasonDate'));
          return;
        }
        if (seasonEndDate <= seasonStartDate) {
          Alert.alert(t('admin.inputError'), t('admin.seasonEndAfterStart'));
          return;
        }
        newSeason = {
          title: newSeasonTitle.trim(),
          startAt: seasonStartDate,
          endAt: seasonEndDate,
        };
      }

      const seasonPeriod = newSeason ?? (seasonMode === 'existing' && selectedSeason ? {
        title: selectedSeason.title,
        startAt: new Date(selectedSeason.startAt),
        endAt: new Date(selectedSeason.endAt),
      } : null);
      if (seasonPeriod && !periodIsWithin(
        seasonPeriod.startAt,
        seasonPeriod.endAt,
        battleDrafts[0].startAt,
        battleDrafts[battleDrafts.length - 1].endAt,
      )) {
        Alert.alert(t('admin.inputError'), t('admin.termOutsideSeason'));
        return;
      }

      await createPublicBattleSeries({
        battles: battleDrafts,
        description: description.trim(),
        // ID生成は createBattle 側に集約。ラベルのみ渡す（id は無視される）。
        categories: validCats.map((c) => ({ id: '', label: c.label.trim() })),
        rankingType,
        userId: user.id,
        seasonId: resolvedSeasonId,
        newSeason,
        market,
      });

      Alert.alert(t('admin.created'), t(
        creationMode === 'series' ? 'admin.createdSeriesBody' : 'admin.createdBody',
        { count: battleDrafts.length },
      ), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(t('common.error'), userFacingError(e, t('admin.createFailed')));
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('admin.newTitle')}</Text>
        <View style={{ width: 48 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            {/* チャレンジ名 */}
            <Text style={styles.label}>{t('admin.titleLabel')}</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle}
              placeholder={t('admin.titleExample')} placeholderTextColor={Colors.textTertiary} maxLength={30} />

            {/* 説明 */}
            <Text style={styles.label}>{t('admin.description')}</Text>
            <TextInput style={[styles.input, styles.inputMulti]} value={description} onChangeText={setDescription}
              placeholder={t('admin.descriptionPlaceholder')} placeholderTextColor={Colors.textTertiary} multiline maxLength={200} />

            <Text style={styles.label}>{t('profile.region')} *</Text>
            <Text style={styles.helpText}>{t('profile.regionDescription')}</Text>
            <View style={styles.toggleRow}>
              {MARKETS.map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.toggleBtn, market === value && styles.toggleBtnActive]}
                  onPress={() => setMarket(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: market === value }}
                >
                  <Text style={[styles.toggleBtnText, market === value && styles.toggleBtnTextActive]}>
                    {t(`market.${value}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 作成単位と期間 */}
            <Text style={styles.label}>{t('admin.creationMode')}</Text>
            <Text style={styles.helpText}>{t('admin.termPurpose')}</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, creationMode === 'series' && styles.toggleBtnActive]}
                onPress={() => setCreationMode('series')}
              >
                <Text style={[styles.toggleBtnText, creationMode === 'series' && styles.toggleBtnTextActive]}>
                  {t('admin.createTermsTogether')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, creationMode === 'single' && styles.toggleBtnActive]}
                onPress={() => setCreationMode('single')}
              >
                <Text style={[styles.toggleBtnText, creationMode === 'single' && styles.toggleBtnTextActive]}>
                  {t('admin.createSingle')}
                </Text>
              </TouchableOpacity>
            </View>

            {creationMode === 'series' ? (
              <View style={styles.termPanel}>
                <Text style={styles.subLabel}>{t('admin.firstTermStart')}</Text>
                <TextInput
                  style={styles.input}
                  value={startAt}
                  onChangeText={setStartAt}
                  placeholder="2026-06-01"
                  placeholderTextColor={Colors.textTertiary}
                  maxLength={10}
                />
                <View style={styles.dateGrid}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subLabel}>{t('admin.termCount')}</Text>
                    <TextInput
                      style={styles.input}
                      value={termCountInput}
                      onChangeText={setTermCountInput}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subLabel}>{t('admin.termLengthDays')}</Text>
                    <TextInput
                      style={styles.input}
                      value={termLengthInput}
                      onChangeText={setTermLengthInput}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                </View>
                <Text style={styles.termSummary}>
                  {termPeriods.length > 0
                    ? t('admin.termSummary', {
                        count: termPeriods.length,
                        days: termLengthDays,
                        total: termPeriods.length * termLengthDays,
                      })
                    : t('admin.termPreviewUnavailable')}
                </Text>
                {termPeriods.map((period) => (
                  <View key={period.termIndex} style={styles.termPreviewRow}>
                    <Text style={styles.termPreviewLabel}>
                      {t('battle.termLabel', { index: period.termIndex, count: period.termCount })}
                    </Text>
                    <Text style={styles.termPreviewDates}>
                      {period.startAt.toLocaleDateString(language === 'ja' ? 'ja-JP' : 'en-US')} –{' '}
                      {period.endAt.toLocaleDateString(language === 'ja' ? 'ja-JP' : 'en-US')}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <>
                <Text style={styles.label}>{t('admin.period')}</Text>
                <PeriodPicker
                  startAt={startAt}
                  endAt={endAt}
                  onChangeStartAt={setStartAt}
                  onChangeEndAt={setEndAt}
                />
              </>
            )}

            {/* シーズン */}
            <Text style={styles.label}>{t('admin.season')}</Text>
            <Text style={styles.helpText}>{t('admin.seasonMeaning')}</Text>
            {loadingSeasons ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.helpText}>{t('admin.loadingSeasons')}</Text>
              </View>
            ) : (
              <>
                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, seasonMode === 'new' && styles.toggleBtnActive]}
                    onPress={() => setSeasonMode('new')}
                  >
                    <Text style={[styles.toggleBtnText, seasonMode === 'new' && styles.toggleBtnTextActive]}>
                      {t('admin.seasonNew')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, seasonMode === 'existing' && styles.toggleBtnActive]}
                    onPress={() => setSeasonMode('existing')}
                  >
                    <Text style={[styles.toggleBtnText, seasonMode === 'existing' && styles.toggleBtnTextActive]}>
                      {t('admin.seasonExisting')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, seasonMode === 'none' && styles.toggleBtnActive]}
                    onPress={() => setSeasonMode('none')}
                  >
                    <Text style={[styles.toggleBtnText, seasonMode === 'none' && styles.toggleBtnTextActive]}>
                      {t('admin.none')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {seasonMode === 'new' && (
                  <View style={styles.seasonPanel}>
                    <TextInput style={styles.input} value={newSeasonTitle} onChangeText={setNewSeasonTitle}
                      placeholder={t('admin.seasonExample')} placeholderTextColor={Colors.textTertiary} maxLength={30} />
                    <View style={styles.dateGrid}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>{t('admin.startDate')}</Text>
                        <TextInput style={styles.input} value={newSeasonStartAt} onChangeText={setNewSeasonStartAt}
                          placeholder="2026-06-01" placeholderTextColor={Colors.textTertiary} maxLength={10} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>{t('admin.endDate')}</Text>
                        <TextInput style={styles.input} value={newSeasonEndAt} onChangeText={setNewSeasonEndAt}
                          placeholder="2026-07-12" placeholderTextColor={Colors.textTertiary} maxLength={10} />
                      </View>
                    </View>
                    <TouchableOpacity style={styles.linkBtn} onPress={syncSeasonDatesWithBattle}>
                      <Text style={styles.linkBtnText}>{t('admin.syncThemeToTerms')}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {seasonMode === 'existing' && (
                  <View style={styles.seasonList}>
                    {seasons.length === 0 ? (
                      <Text style={styles.helpText}>{t('admin.noSeasons')}</Text>
                    ) : (
                      seasons.map((season) => (
                        <View key={season.id} style={styles.seasonOptionRow}>
                          <TouchableOpacity
                            style={[
                              styles.seasonOption,
                              selectedSeasonId === season.id && styles.seasonOptionActive,
                              season.status === 'archived' && styles.seasonOptionDisabled,
                            ]}
                            onPress={() => selectSeason(season)}
                            disabled={season.status === 'archived'}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[
                                styles.seasonTitle,
                                selectedSeasonId === season.id && styles.seasonTitleActive,
                              ]}>
                                {season.title || season.id}
                              </Text>
                              <Text style={styles.seasonMeta}>
                                {season.startAt ? new Date(season.startAt).toLocaleDateString(language === 'ja' ? 'ja-JP' : 'en-US') : t('admin.undecided')} –{' '}
                                {season.endAt ? new Date(season.endAt).toLocaleDateString(language === 'ja' ? 'ja-JP' : 'en-US') : t('admin.undecided')}
                              </Text>
                            </View>
                            <Text style={[
                              styles.seasonStatus,
                              season.status === 'active' ? styles.seasonStatusActive : styles.seasonStatusArchived,
                            ]}>
                              {season.status === 'active' ? t('admin.active') : t('admin.archived')}
                            </Text>
                          </TouchableOpacity>
                          {season.status === 'active' && (
                            <TouchableOpacity style={styles.archiveBtn} onPress={() => archiveSeason(season)}>
                              <Text style={styles.archiveBtnText}>{t('admin.archive')}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ))
                    )}
                    {selectedSeason && (
                      <>
                        <Text style={styles.selectionNote}>{t('admin.existingSelectionOnly')}</Text>
                        <TouchableOpacity style={styles.linkBtn} onPress={applySelectedSeasonPeriod}>
                          <Text style={styles.linkBtnText}>{t('admin.applySeasonPeriod')}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </>
            )}

            {/* チームリスト */}
            <Text style={styles.label}>{t('admin.teamsMin')}</Text>
            {categories.map((cat, i) => (
              <View key={i} style={styles.catRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={cat.label}
                  onChangeText={(v) => updateLabel(i, v)}
                  placeholder={i === 0 ? t('admin.teamOne') : i === 1 ? t('admin.teamTwo') : t('admin.teamN', { count: i + 1 })}
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
              <Text style={styles.addText}>{t('admin.addTeam')}</Text>
            </TouchableOpacity>

            {/* ランキング方式 */}
            <Text style={styles.label}>{t('admin.rankingType')}</Text>
            <View style={styles.toggleRow}>
              {(['average', 'total'] as const).map((rankingOption) => (
                <TouchableOpacity key={rankingOption}
                  style={[styles.toggleBtn, rankingType === rankingOption && styles.toggleBtnActive]}
                  onPress={() => setRankingType(rankingOption)}
                >
                  <Text style={[styles.toggleBtnText, rankingType === rankingOption && styles.toggleBtnTextActive]}>
                    {rankingOption === 'average' ? t('admin.average') : t('admin.total')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button
              label={creationMode === 'series'
                ? t('admin.createSeriesButton', { count: termCount })
                : t('admin.createButton')}
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
  helpText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
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
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: Spacing.xs },
  linkBtnText: { fontSize: Typography.fontSize.sm, color: Colors.primary, fontWeight: Typography.fontWeight.medium },
  termPanel: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceGray,
  },
  termSummary: {
    fontSize: Typography.fontSize.sm,
    lineHeight: 20,
    color: Colors.textPrimary,
    fontWeight: Typography.fontWeight.semibold,
  },
  termPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  termPreviewLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
  },
  termPreviewDates: { flex: 1, textAlign: 'right', fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  seasonList: { gap: Spacing.sm, marginTop: Spacing.sm },
  seasonOptionRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.xs },
  seasonOption: {
    flex: 1,
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
  seasonOptionDisabled: { opacity: 0.55 },
  seasonTitle: { fontSize: Typography.fontSize.sm, color: Colors.textPrimary, fontWeight: Typography.fontWeight.semibold },
  seasonTitleActive: { color: Colors.primary },
  seasonMeta: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 2 },
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
  archiveBtn: {
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  archiveBtnText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, fontWeight: Typography.fontWeight.semibold },
  selectionNote: { fontSize: Typography.fontSize.xs, lineHeight: 18, color: Colors.textSecondary },
});
