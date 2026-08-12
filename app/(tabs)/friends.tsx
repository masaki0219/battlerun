import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { InviteCodeJoinView } from '../../components/battle/InviteCodeJoinView';
import { PrivateBattleCard } from '../../components/battle/PrivateBattleCard';
import { PrivateBattleCreateForm } from '../../components/battle/PrivateBattleCreateForm';
import { useBattleCategoryStats } from '../../hooks/useBattleCategoryStats';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';
import { inviteWebUrl, normalizeInviteCode, PENDING_INVITE_CODE_KEY } from '../../lib/invite';
import { registerPushToken, scheduleBattleEnd1hNotification, scheduleBattleEndNotification } from '../../lib/notifications';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import { parseLocalDate } from '../../utils/dateInput';
import { BorderRadius, Colors, Shadow, Spacing, TeamColorOptions, Typography } from '../../design_tokens';
import type { Battle, Category, TeamColorId } from '../../types';
import { useTranslation } from '../../lib/i18n';
import { userFacingError, userErrorReason } from '../../lib/userError';

type PrivateView = 'list' | 'create' | 'join_code' | 'join_select';

export default function FriendsScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ inviteCode?: string; open?: string }>();
  const { user, proEntitlement } = useAuthStore();
  const userIsPro = user?.plan === 'pro' || proEntitlement;
  const {
    publicBattles,
    privateBattles,
    myMemberships,
    isLoading,
    fetchPublicBattles,
    fetchMyMemberships,
    fetchMyPrivateBattles,
    joinBattle,
    createBattle,
    findBattleByInviteCode,
  } = useBattleStore();
  const { blockedUserIds } = useBlockedUsers(user?.id);
  const privateStats = useBattleCategoryStats(privateBattles);

  const [privateView, setPrivateView] = useState<PrivateView>('list');
  const [inviteCode, setInviteCode] = useState('');
  const [foundBattle, setFoundBattle] = useState<Battle | null>(null);
  const [searching, setSearching] = useState(false);
  const [joiningBattleId, setJoiningBattleId] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedBattles, setExpandedBattles] = useState<Set<string>>(new Set());

  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createCategories, setCreateCategories] = useState<Category[]>([
    { id: '', label: '', colorId: TeamColorOptions[0].id },
    { id: '', label: '', colorId: TeamColorOptions[1].id },
  ]);
  const [createRankingType, setCreateRankingType] = useState<'average' | 'total'>('average');
  const [createStartAt, setCreateStartAt] = useState('');
  const [createEndAt, setCreateEndAt] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLocalLoading(true);
    setLoadFailed(false);
    Promise.all([
      fetchPublicBattles(),
      fetchMyMemberships(user.id),
      fetchMyPrivateBattles(user.id),
    ])
      .catch((error) => {
        console.warn('[FriendsScreen] initial load failed:', error);
        setLoadFailed(true);
      })
      .finally(() => setLocalLoading(false));
  }, [user?.id, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fromParam = normalizeInviteCode(params.inviteCode);
      const fromStorage = fromParam
        ? null
        : normalizeInviteCode(await AsyncStorage.getItem(PENDING_INVITE_CODE_KEY));
      const pendingCode = fromParam ?? fromStorage;
      if (!pendingCode || cancelled) return;
      setInviteCode(pendingCode);
      setFoundBattle(null);
      setPrivateView('join_code');
      await AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
    })();
    return () => { cancelled = true; };
  }, [params.inviteCode]);

  useEffect(() => {
    if (params.open !== 'create' || !user) return;
    if (!userIsPro) {
      Alert.alert(
        t('friends.proRequiredTitle'),
        t('friends.proRequiredBody'),
      );
      router.setParams({ open: '' });
      return;
    }
    setPrivateView('create');
    router.setParams({ open: '' });
  }, [params.open, user?.id, userIsPro]);

  const visiblePrivateBattles = privateBattles.filter((battle) => (
    battle.createdBy === user?.id || !battle.createdBy || !blockedUserIds.has(battle.createdBy)
  ));
  const membershipIds = new Set(myMemberships.map((membership) => membership.battleId));
  const now = Date.now();
  const activeMembershipCount = [...publicBattles, ...privateBattles].filter((battle) => (
    membershipIds.has(battle.id)
    && battle.status === 'active'
    && new Date(battle.startAt).getTime() <= now
    && now <= new Date(battle.endAt).getTime()
  )).length;

  function myCategoryId(battleId: string): string | null {
    return myMemberships.find((membership) => membership.battleId === battleId)?.categoryId ?? null;
  }

  function toggleExpanded(battleId: string) {
    setExpandedBattles((previous) => {
      const next = new Set(previous);
      if (next.has(battleId)) next.delete(battleId);
      else next.add(battleId);
      return next;
    });
  }

  async function handleSearchInviteCode() {
    if (!inviteCode.trim()) return;
    setSearching(true);
    try {
      const battle = await findBattleByInviteCode(inviteCode);
      setFoundBattle(battle);
      setPrivateView('join_select');
    } catch (error: any) {
      Alert.alert(t('common.error'), userFacingError(error, t('friends.inviteNotFound')));
    } finally {
      setSearching(false);
    }
  }

  async function handleJoin(battle: Battle, categoryId: string) {
    if (!user) return;
    if (activeMembershipCount >= 2 && !membershipIds.has(battle.id)) {
      Alert.alert(t('battle.participationLimitTitle'), t('battle.participationLimitBody'));
      return;
    }
    setJoiningBattleId(battle.id);
    try {
      await joinBattle(battle.id, categoryId, user.id, battle.inviteCode);
      await Promise.all([fetchMyMemberships(user.id), fetchMyPrivateBattles(user.id)]);
      void registerPushToken(user.id, true);
      void scheduleBattleEndNotification(battle);
      void scheduleBattleEnd1hNotification(battle);
      setPrivateView('list');
      setFoundBattle(null);
      setInviteCode('');
      Alert.alert(
        t('battle.joinComplete'),
        t('friends.joinedAs', { team: battle.categories.find((category) => category.id === categoryId)?.label ?? '' }),
        [
          { text: t('friends.viewList'), style: 'cancel' },
          { text: t('battle.startRun'), onPress: () => router.push('/(tabs)/record' as any) },
        ],
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), userFacingError(error, t('battle.joinFailed')));
    } finally {
      setJoiningBattleId(null);
    }
  }

  function resetCreateForm() {
    setCreateTitle('');
    setCreateDesc('');
    setCreateCategories([
      { id: '', label: '', colorId: TeamColorOptions[0].id },
      { id: '', label: '', colorId: TeamColorOptions[1].id },
    ]);
    setCreateRankingType('average');
    setCreateStartAt('');
    setCreateEndAt('');
  }

  async function handleCreateBattle() {
    if (!user) return;
    if (proEntitlement && user.plan !== 'pro') {
      Alert.alert(t('friends.proSyncTitle'), t('friends.proSyncBody'));
      return;
    }
    if (!createTitle.trim()) {
      Alert.alert(t('friends.inputError'), t('friends.titleRequired'));
      return;
    }
    const validCategories = createCategories.filter((category) => category.label.trim());
    if (validCategories.length < 2) {
      Alert.alert(t('friends.inputError'), t('friends.twoTeamsRequired'));
      return;
    }
    if (!createStartAt || !createEndAt) {
      Alert.alert(t('friends.inputError'), t('friends.periodRequired'));
      return;
    }
    const startDate = parseLocalDate(createStartAt);
    const endDate = parseLocalDate(createEndAt, true);
    if (!startDate || !endDate) {
      Alert.alert(t('friends.inputError'), t('friends.invalidDate'));
      return;
    }
    if (endDate <= startDate) {
      Alert.alert(t('friends.inputError'), t('friends.endAfterStart'));
      return;
    }

    setCreating(true);
    try {
      await createBattle({
        title: createTitle.trim(),
        description: createDesc.trim(),
        categories: validCategories.map((category) => ({
          id: '',
          label: category.label.trim(),
          colorId: category.colorId,
        })),
        rankingType: createRankingType,
        startAt: startDate,
        endAt: endDate,
        userId: user.id,
        isPublic: false,
      });
      await Promise.all([fetchMyMemberships(user.id), fetchMyPrivateBattles(user.id)]);
      resetCreateForm();
      setPrivateView('list');
      Alert.alert(t('friends.createdTitle'), t('friends.createdBody'));
    } catch (error: any) {
      if (userErrorReason(error) === 'pro-plan-not-synced' && proEntitlement) {
        Alert.alert(t('friends.proSyncTitle'), t('friends.proSyncBody'));
      } else {
        Alert.alert(t('common.error'), userFacingError(error, t('friends.createFailed')));
      }
    } finally {
      setCreating(false);
    }
  }

  function addCategory() {
    setCreateCategories((previous) => {
      const used = new Set(previous.map((category) => category.colorId));
      const nextColor = TeamColorOptions.find((option) => !used.has(option.id))
        ?? TeamColorOptions[previous.length % TeamColorOptions.length];
      return [...previous, { id: '', label: '', colorId: nextColor.id }];
    });
  }

  function updateCategoryColor(index: number, colorId: TeamColorId) {
    setCreateCategories((previous) => previous.map((category, currentIndex) => {
      if (currentIndex === index) return { ...category, colorId };
      if (category.colorId !== colorId) return category;
      const previousColor = previous[index]?.colorId;
      return previousColor ? { ...category, colorId: previousColor } : category;
    }));
  }

  function copyInvite(code: string) {
    void Clipboard.setStringAsync(code);
    Alert.alert(t('friends.copied'), t('friends.inviteCodeValue', { code }));
  }

  async function shareInvite(battle: Battle) {
    if (!battle.inviteCode) return;
    try {
      await Share.share({
        title: t('friends.shareTitle', { title: battle.title }),
        message: t('friends.shareMessage', {
          title: battle.title,
          url: inviteWebUrl(battle.inviteCode),
          code: battle.inviteCode,
        }),
      });
    } catch (error) {
      console.warn('[FriendsScreen] invite share failed:', error);
      Alert.alert(t('friends.shareFailedTitle'), t('friends.shareFailedBody'));
    }
  }

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
      onRemoveCategory={(index) => setCreateCategories((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
      onChangeCategoryLabel={(index, label) => setCreateCategories((previous) => previous.map((category, itemIndex) => (
        itemIndex === index ? { ...category, label } : category
      )))}
      onChangeCategoryColor={updateCategoryColor}
      onChangeRankingType={setCreateRankingType}
      onChangeStartAt={setCreateStartAt}
      onChangeEndAt={setCreateEndAt}
      onSubmit={handleCreateBattle}
      onCancel={() => { resetCreateForm(); setPrivateView('list'); }}
    />
  );

  const inviteJoinView = (view: 'join_code' | 'join_select') => (
    <InviteCodeJoinView
      view={view}
      inviteCode={inviteCode}
      onChangeInviteCode={setInviteCode}
      searching={searching}
      onSearch={handleSearchInviteCode}
      onCancelCode={() => { setInviteCode(''); setFoundBattle(null); setPrivateView('list'); }}
      foundBattle={foundBattle}
      joining={joiningBattleId === foundBattle?.id}
      onJoinCategory={(categoryId) => foundBattle && void handleJoin(foundBattle, categoryId)}
      onBackToCode={() => { setFoundBattle(null); setPrivateView('join_code'); }}
    />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>ZELIO</Text>
        <Text style={styles.headerTitle}>{t('friends.title')}</Text>
      </View>

      {loadFailed && (
        <View style={styles.loadErrorBanner} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={16} color={Colors.error} />
          <Text style={styles.loadErrorText}>{t('friends.loadFailed')}</Text>
          <TouchableOpacity onPress={() => setReloadKey((key) => key + 1)} accessibilityRole="button">
            <Text style={styles.loadErrorRetry}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {localLoading || isLoading ? (
        <ActivityIndicator color={Colors.primary} style={styles.loading} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {privateView === 'join_code' && inviteJoinView('join_code')}
          {privateView === 'join_select' && inviteJoinView('join_select')}
          {privateView === 'create' && createForm}

          {privateView === 'list' && (
            <>
              <View style={styles.introCard}>
                <View style={styles.introIcon}>
                  <Ionicons name="key-outline" size={22} color={Colors.primaryDark} />
                </View>
                <View style={styles.introCopy}>
                  <Text style={styles.introTitle}>{t('friends.haveCode')}</Text>
                  <Text style={styles.introBody}>{t('friends.codeIntro')}</Text>
                </View>
                <Button label={t('battle.join')} onPress={() => setPrivateView('join_code')} style={styles.introButton} />
              </View>

              <View>
                <Text style={styles.sectionTitle}>{t('friends.friendChallenges')}</Text>
                <Text style={styles.sectionHint}>{t('friends.joinedOrCreated')}</Text>
              </View>
              {visiblePrivateBattles.length === 0 ? (
                <EmptyState
                  icon="people-outline"
                  title={t('friends.emptyTitle')}
                  hint={t('friends.emptyHint')}
                />
              ) : visiblePrivateBattles.map((battle) => (
                <PrivateBattleCard
                  key={battle.id}
                  battle={battle}
                  stats={privateStats.statsMap[battle.id] ?? []}
                  myCategoryId={myCategoryId(battle.id)}
                  expanded={expandedBattles.has(battle.id)}
                  onToggleExpand={() => toggleExpanded(battle.id)}
                  onPress={() => router.push(`/battle/${battle.id}` as any)}
                  onCopyInvite={copyInvite}
                  onShareInvite={shareInvite}
                />
              ))}

              <View style={styles.createSection}>
                <View style={styles.createHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>{t('friends.createNew')}</Text>
                    <Text style={styles.sectionHint}>{t('friends.createHint')}</Text>
                  </View>
                  {!userIsPro && <Text style={styles.proBadge}>PRO</Text>}
                </View>
                <Button
                  label={t(userIsPro ? 'friends.create' : 'friends.createPro')}
                  variant="secondary"
                  onPress={() => {
                    if (!userIsPro) {
                      Alert.alert(
                        t('friends.proRequiredTitle'),
                        t('friends.proRequiredBody'),
                      );
                      return;
                    }
                    setPrivateView('create');
                  }}
                />
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1 },
  header: {
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
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.xl },
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
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    ...Shadow.sm,
  },
  introIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
  introCopy: { flex: 1, minWidth: 0 },
  introTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  introBody: { marginTop: 2, fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  introButton: { minWidth: 88, marginTop: 0 },
  sectionTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  sectionHint: { marginTop: 3, fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  createSection: { gap: Spacing.md },
  createHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md },
  proBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    color: Colors.primaryDark,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.extrabold,
  },
});
