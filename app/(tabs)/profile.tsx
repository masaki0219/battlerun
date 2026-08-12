import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, Modal, FlatList, Pressable, Linking, Switch, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { deleteField, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from 'firebase/auth';
import { auth, db, functions } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { purchasePro, restorePurchases, getProMonthlyPlan, isStoreAvailable, type ProPackageInfo } from '../../lib/revenuecat';
import { isPro } from '../../lib/pro';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../../components/ui/Avatar';
import { useRecentActivities } from '../../hooks/useRecentActivities';
import { useMonthlyStats } from '../../hooks/useMonthlyStats';
import { streakDays } from '../../utils/displayStats';
import { monthlyDistanceLowerBound, reconcileMonthlyStats } from '../../utils/monthlyStats';
import { Colors, DarkColors, Typography, Spacing, BorderRadius, Shadow } from '../../design_tokens';
import type { Market, UserTitle } from '../../types';
import { httpsCallable } from 'firebase/functions';
import { registerPushToken } from '../../lib/notifications';
import Constants from 'expo-constants';
import { teamTitleLabel } from '../../lib/teamTitle';
import {
  requestAppleCredential,
  requestGoogleCredential,
  revokeAppleAuthorizationCode,
  revokeGoogleAccess,
  SocialAuthError,
  socialAuthErrorMessage,
} from '../../lib/socialAuth';
import { AVATAR_EMOJI_CATEGORIES } from '../../lib/avatarEmojis';
import { MARKETS } from '../../lib/market';
import { intlLocale, useTranslation } from '../../lib/i18n';
import { useBattleStore } from '../../stores/battleStore';
import { userFacingError } from '../../lib/userError';

function TitleBadge({ title, selected }: { title: UserTitle; selected: boolean }) {
  const { language, t } = useTranslation();
  const rankLabel = teamTitleLabel(title.rank, language);
  const awardedDate = new Date(title.awardedAt).toLocaleDateString(intlLocale(language), {
    year: 'numeric', month: 'short',
  });
  return (
    <View style={styles.titleBadge}>
      <View style={[styles.titleRankWrap, selected && styles.titleRankWrapSelected]}>
        <Text style={[styles.titleRank, selected && styles.titleRankSelected]}>{title.rank === 1 ? '👑' : title.rank}</Text>
      </View>
      <View style={styles.titleInfo}>
        <View style={styles.titleNameRow}>
          <Text style={styles.titleName}>{rankLabel}</Text>
          {selected && <Text style={styles.titleSelectedLabel}>{t('profile.selected')}</Text>}
        </View>
        <Text style={styles.titleBattle} numberOfLines={1}>{title.battleTitle}</Text>
        <Text style={styles.titleSeason} numberOfLines={1}>
          {/* seasonId は Firestore の内部IDなので表示しない（本番は自動生成の英数字になる） */}
          {[title.teamName, t('profile.awarded', { date: awardedDate })].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </View>
  );
}

function ProfileStat({ label, value, unit, accent = false }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}<Text style={styles.statUnit}>{unit}</Text></Text>
    </View>
  );
}

function ProfileRow({ icon, title, detail, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; title: string; detail?: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.profileRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.profileRowIcon}><Ionicons name={icon} size={18} color={Colors.primaryDark} /></View>
      <View style={styles.profileRowBody}>
        <Text style={styles.profileRowTitle}>{title}</Text>
        {detail && <Text style={styles.profileRowDetail}>{detail}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={17} color={Colors.textTertiary} />
    </TouchableOpacity>
  );
}

function nonNegativeStat(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export default function ProfileScreen() {
  const { language, t } = useTranslation();
  const {
    user,
    proEntitlement,
    signOut,
    setRunningPresenceVisible,
    setRunDeclarationVisible,
    setMarket,
  } = useAuthStore();
  const fetchPublicBattles = useBattleStore((state) => state.fetchPublicBattles);
  const [purchasing, setPurchasing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [presenceSaving, setPresenceSaving] = useState(false);
  const [declarationVisibilitySaving, setDeclarationVisibilitySaving] = useState(false);
  const [showMarketPicker, setShowMarketPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [avatarCategoryId, setAvatarCategoryId] = useState(AVATAR_EMOJI_CATEGORIES[0].id);
  const [showDeletePasswordPrompt, setShowDeletePasswordPrompt] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [proMonthlyPlan, setProMonthlyPlan] = useState<ProPackageInfo | null>(null);
  const [proPlanLoading, setProPlanLoading] = useState(false);
  const [proPlanReloadKey, setProPlanReloadKey] = useState(0);
  const [serverStats, setServerStats] = useState<{ totalDistanceKm: number; activityCount: number } | null>(null);
  const avatarCategory = AVATAR_EMOJI_CATEGORIES.find((category) => category.id === avatarCategoryId)
    ?? AVATAR_EMOJI_CATEGORIES[0];

  // 自分の戦績（累計距離・ラン回数・ストリーク）
  const { activities } = useRecentActivities(50);
  const { months: monthlyStats } = useMonthlyStats();
  const reconciledMonths = reconcileMonthlyStats(monthlyStats, activities);
  const recentTotalKm = activities.reduce(
    (sum, activity) => sum + nonNegativeStat(activity.distanceKm),
    0,
  );
  // 集計遅延中にサーバーが0でも、取得済み活動と矛盾する0を確定値として表示しない。
  const totalKm = Math.max(
    recentTotalKm,
    nonNegativeStat(user?.totalDistanceKm),
    nonNegativeStat(serverStats?.totalDistanceKm),
    monthlyDistanceLowerBound(reconciledMonths),
  );
  const totalRuns = Math.max(
    activities.length,
    Math.floor(nonNegativeStat(user?.activityCount)),
    Math.floor(nonNegativeStat(serverStats?.activityCount)),
  );
  const streak = streakDays(activities);

  useEffect(() => {
    if (isPro(user?.plan, proEntitlement)) return;
    let cancelled = false;
    setProPlanLoading(true);
    getProMonthlyPlan()
      .then((plan) => {
        if (cancelled) return;
        setProMonthlyPlan(plan);
      })
      .catch(() => { if (!cancelled) setProMonthlyPlan(null); })
      .finally(() => { if (!cancelled) setProPlanLoading(false); });
    return () => { cancelled = true; };
  }, [user?.plan, proEntitlement, proPlanReloadKey]);

  useEffect(() => {
    if (!user) return;
    setServerStats(null);
    httpsCallable(functions, 'syncMyBadges')({})
      .then((result) => {
        const data = result.data as { stats?: { totalDistanceKm?: number; activityCount?: number } };
        if (data.stats) setServerStats({
          totalDistanceKm: data.stats.totalDistanceKm ?? 0,
          activityCount: data.stats.activityCount ?? 0,
        });
      })
      .catch(() => {});
  }, [user?.id]);

  function handleAvatarOptions() {
    setShowEmojiPicker(true);
  }

  async function handlePresenceVisibility(visible: boolean) {
    setPresenceSaving(true);
    try {
      await setRunningPresenceVisible(visible);
      if (visible && user) void registerPushToken(user.id, false);
    } catch {
      Alert.alert(t('profile.updateFailed'), t('connection.tryAgain'));
    } finally {
      setPresenceSaving(false);
    }
  }

  async function handleDeclarationVisibility(visible: boolean) {
    setDeclarationVisibilitySaving(true);
    try {
      await setRunDeclarationVisible(visible);
    } catch (error) {
      Alert.alert(
        t('profile.updateFailed'),
        userFacingError(error, t('connection.tryAgain')),
      );
    } finally {
      setDeclarationVisibilitySaving(false);
    }
  }

  async function handleMarketChange(market: Market) {
    setShowMarketPicker(false);
    if (!user || user.market === market) return;
    try {
      await setMarket(market);
      await fetchPublicBattles(market);
      Alert.alert(t('profile.regionUpdated'));
    } catch {
      Alert.alert(t('profile.regionUpdateFailed'), t('connection.tryAgain'));
    }
  }

  function showMarketOptions() {
    setShowMarketPicker(true);
  }

  async function handleEmojiSelect(emoji: string) {
    if (!user) return;
    setShowEmojiPicker(false);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.id), { avatarEmoji: emoji, avatarUrl: deleteField() });
      batch.set(doc(db, 'publicProfiles', user.id), {
        name: user.name, avatarEmoji: emoji, avatarUrl: deleteField(), updatedAt: serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, avatarEmoji: emoji } : null,
      }));
    } catch {
      Alert.alert(t('common.error'), t('profile.iconUpdateFailed'));
    }
  }

  async function handlePurchasePro() {
    if (!user) return;
    if (!isStoreAvailable()) {
      Alert.alert(
        t('profile.purchaseUnavailableTitle'),
        t('profile.storeUnavailableBody'),
      );
      return;
    }
    setPurchasing(true);
    try {
      const ok = await purchasePro();
      if (ok) {
        Alert.alert(t('profile.purchaseThanks'), t('profile.proEnabled'));
      }
    } catch (e: any) {
      // RevenueCat/StoreKit のエラー内容は原因切り分けに必須なのでそのまま見せる
      Alert.alert(t('profile.purchaseFailed'), e?.message ?? t('profile.connectionCheck'));
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    if (!user) return;
    if (!isStoreAvailable()) {
      Alert.alert(
        t('profile.restoreUnavailableTitle'),
        t('profile.storeUnavailableBody'),
      );
      return;
    }
    setPurchasing(true);
    try {
      const ok = await restorePurchases();
      Alert.alert(t(ok ? 'profile.restored' : 'profile.noPurchaseHistory'));
    } catch {
      Alert.alert(t('common.error'), t('profile.restoreFailed'));
    } finally {
      setPurchasing(false);
    }
  }

  async function handleEnableNotifications() {
    if (!user) return;
    const enabled = await registerPushToken(user.id, true);
    Alert.alert(
      t(enabled ? 'profile.notificationsEnabled' : 'profile.notificationsEnableFailed'),
      t(enabled ? 'profile.notificationsEnabledBody' : 'profile.notificationsPermissionBody'),
    );
  }

  async function deleteFirebaseAccountAfter(task: () => Promise<void>) {
    if (!user) return;
    setDeleting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error(t('profile.authMissing'));

      await task();

      // Firebase Auth ユーザー削除（onAuthStateChanged が user: null をセットする）。
      // Firestore側のデータ（users/{uid}本体・activities・participants・通知・バッジ）は
      // Cloud Functions（onUserDeleted）がAuthユーザー削除をトリガーに一括削除する。
      await deleteUser(currentUser);

      router.replace('/auth/login');
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      const socialMessage = socialAuthErrorMessage(error);
      if (socialMessage === null) {
        return;
      }
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        Alert.alert(t('common.error'), t('profile.wrongPassword'));
      } else if (socialMessage) {
        Alert.alert(t('profile.accountDeleteFailedTitle'), socialMessage);
      } else {
        Alert.alert(t('common.error'), t('profile.accountDeleteFailed'));
      }
    } finally {
      setDeleting(false);
    }
  }

  async function doDeleteWithPassword(password: string) {
    const currentUser = auth.currentUser;
    if (!currentUser?.email) {
      Alert.alert(t('common.error'), t('profile.emailAuthMissing'));
      return;
    }
    await deleteFirebaseAccountAfter(async () => {
      const credential = EmailAuthProvider.credential(currentUser.email!, password);
      await reauthenticateWithCredential(currentUser, credential);
    });
  }

  async function doDeleteWithGoogle() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    await deleteFirebaseAccountAfter(async () => {
      const bundle = await requestGoogleCredential();
      await reauthenticateWithCredential(currentUser, bundle.credential);
      const accountId = bundle.googleAccountId ?? bundle.email;
      if (accountId) await revokeGoogleAccess(accountId);
    });
  }

  async function doDeleteWithApple() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    await deleteFirebaseAccountAfter(async () => {
      const bundle = await requestAppleCredential();
      await reauthenticateWithCredential(currentUser, bundle.credential);
      if (!bundle.appleAuthorizationCode) {
        throw new SocialAuthError(
          'social/apple-missing-authorization-code',
          t('profile.appleCodeMissing'),
        );
      }
      await revokeAppleAuthorizationCode(bundle.appleAuthorizationCode);
    });
  }

  function beginProviderReauthentication() {
    const providers = auth.currentUser?.providerData.map((provider) => provider.providerId) ?? [];
    if (providers.includes('apple.com')) {
      void doDeleteWithApple();
    } else if (providers.includes('google.com')) {
      void doDeleteWithGoogle();
    } else {
      setDeletePassword('');
      setShowDeletePasswordPrompt(true);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      t('profile.deleteAccount'),
      t('profile.deleteWarning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.deleteAction'),
          style: 'destructive',
          onPress: beginProviderReauthentication,
        },
      ],
    );
  }

  async function handleSignOut() {
    Alert.alert(t('profile.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout'), style: 'destructive', onPress: async () => {
          await signOut();
          router.replace('/auth/login');
        },
      },
    ]);
  }

  if (!user) return null;

  const titles = [...(user.titles ?? [])].sort(
    (a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime()
  );
  const profileTitle = titles[0]
    ? t('profile.titlePrefix', { title: teamTitleLabel(titles[0].rank, language) })
    : t('profile.earnTitle');
  const displayedTitle = titles[0] ? teamTitleLabel(titles[0].rank, language) : t('profile.earnTitle');
  const userIsPro = isPro(user.plan, proEntitlement);
  // 価格（期間つき）を提示できるときだけ購入導線を有効にする
  const hasProPrice = proMonthlyPlan !== null;
  const canPurchasePro = hasProPrice && !purchasing && !proPlanLoading;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>ZELIO</Text>
        <Text style={styles.headerTitle}>{t('profile.pageTitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profileCard}>
          <View style={styles.userRow}>
            <TouchableOpacity
              onPress={handleAvatarOptions}
              accessibilityRole="button"
              accessibilityLabel={t('profile.changeAvatarA11y')}
            >
              <View>
                <Avatar name={user.name} emoji={user.avatarEmoji} size="lg" />
                <View style={styles.editBadge}>
                  <Ionicons name="pencil" size={10} color={Colors.textOnPrimary} />
                </View>
              </View>
            </TouchableOpacity>
            <View style={styles.userInfo}>
              <View style={styles.userNameRow}>
                <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
                <View style={[styles.planBadge, userIsPro && styles.planBadgePro]}>
                  {userIsPro && <Ionicons name="sparkles" size={10} color={Colors.goldText} />}
                  <Text style={[styles.planText, userIsPro && styles.planTextPro]}>{userIsPro ? 'Pro' : 'Free'}</Text>
                </View>
              </View>
              <Text style={styles.profileTitle}>{profileTitle}</Text>
            </View>
            <TouchableOpacity style={styles.profileEditButton} onPress={handleAvatarOptions} activeOpacity={0.7}>
              <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.statTrio}>
            <ProfileStat label={t('profile.totalDistance')} value={totalKm.toFixed(1)} unit="km" />
            <View style={styles.statDivider} />
            <ProfileStat label={t('profile.runCount')} value={String(totalRuns)} unit={t('profile.times')} />
            <View style={styles.statDivider} />
            <ProfileStat label={t('profile.streak')} value={String(streak)} unit={t('profile.dayUnit')} accent />
          </View>
        </View>

        <View>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionHeading}>{t('profile.earnedTitles')}</Text>
            <TouchableOpacity style={styles.showAllButton} onPress={() => router.push('/badges' as any)} activeOpacity={0.7}>
              <Text style={styles.showAllText}>{t('profile.viewAll')}</Text>
              <Ionicons name="chevron-forward" size={15} color={Colors.primaryDark} />
            </TouchableOpacity>
          </View>
          <View style={styles.surfaceCard}>
            {titles.length === 0 ? (
              <Text style={styles.emptyText}>{t('profile.noTitles')}</Text>
            ) : (
              titles.map((title, index) => (
                <React.Fragment key={`${title.battleId}_${index}`}>
                  {index > 0 && <View style={styles.titleDivider} />}
                  <TitleBadge title={title} selected={index === 0} />
                </React.Fragment>
              ))
            )}
          </View>
        </View>

        <View>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionHeading}>ZELIO Pro</Text>
            <View style={styles.freePlanBadge}><Text style={styles.freePlanText}>{t(userIsPro ? 'profile.proPlan' : 'profile.freePlan')}</Text></View>
          </View>
          <View style={[styles.proCard, userIsPro && styles.proCardActive]}>
            {userIsPro ? (
              <View style={styles.proRow}>
                <View style={styles.proActiveRow}>
                  <Ionicons name="sparkles" size={16} color={Colors.goldText} />
                  <Text style={styles.proLabel}>{t('profile.proActive')}</Text>
                </View>
                <TouchableOpacity onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')} accessibilityRole="link">
                  <Text style={styles.manageLink}>{t('profile.manage')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.proIntro}>
                  <View style={styles.proIcon}><Ionicons name="diamond-outline" size={20} color={Colors.accentText} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.proUpsellTitle}>{t('profile.enjoyMore')}</Text>
                    <Text style={styles.freeDesc}>{t('profile.proFeatures')}</Text>
                  </View>
                </View>
                {proMonthlyPlan && (
                  <View style={styles.planRow}>
                    <View
                      style={[styles.planOption, styles.planOptionSelected]}
                      accessible
                      accessibilityLabel={t('profile.monthlyPriceA11y', { price: proMonthlyPlan.priceString })}
                    >
                      <Text style={[styles.planPeriod, styles.planPeriodSelected]}>{t('profile.monthly')}</Text>
                      <Text style={[styles.planPrice, styles.planPriceSelected]}>{proMonthlyPlan.priceString}</Text>
                    </View>
                  </View>
                )}
                {/* 価格・期間を提示できないまま購入導線を出さない（サブスクの表示要件）。
                    取得できていないときは非活性にして再試行を出す。 */}
                {!hasProPrice && !proPlanLoading && (
                  <View style={styles.priceErrorBox}>
                    <Text style={styles.priceErrorText}>{t('profile.priceLoadFailed')}</Text>
                    <TouchableOpacity onPress={() => setProPlanReloadKey((key) => key + 1)} accessibilityRole="button">
                      <Text style={styles.priceRetryText}>{t('profile.reload')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.proStartButton, !canPurchasePro && styles.proStartButtonDisabled]}
                  onPress={handlePurchasePro}
                  disabled={!canPurchasePro}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canPurchasePro }}
                >
                  {purchasing || proPlanLoading
                    ? <ActivityIndicator color={Colors.textOnAccent} />
                    : <><Text style={styles.proStartText}>{t('profile.startMonthlyPro')}</Text><Ionicons name="chevron-forward" size={16} color={Colors.textOnAccent} /></>}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRestore} style={styles.restoreButton}><Text style={styles.restoreText}>{t('profile.restorePurchase')}</Text></TouchableOpacity>
                <Text style={styles.subscriptionDisclaimer}>{t('profile.subscriptionDisclaimer')}</Text>
              </>
            )}
          </View>
        </View>

        <View>
          <Text style={styles.sectionHeading}>{t('profile.settings')}</Text>
          <View style={[styles.surfaceCard, styles.listCard]}>
            <ProfileRow
              icon="globe-outline"
              title={t('profile.region')}
              detail={t('profile.regionCurrent', { market: t(`market.${user.market}`) })}
              onPress={showMarketOptions}
            />
            <View style={styles.rowDivider} />
            <View style={styles.profileRow}>
              <View style={styles.profileRowIcon}><Ionicons name="radio-outline" size={18} color={Colors.primaryDark} /></View>
              <View style={styles.profileRowBody}>
                <Text style={styles.profileRowTitle}>{t('profile.presenceTitle')}</Text>
                <Text style={styles.profileRowDetail}>{t('profile.presenceDetail')}</Text>
              </View>
              <Switch
                value={user.runningPresenceVisible}
                onValueChange={(visible) => void handlePresenceVisibility(visible)}
                disabled={presenceSaving}
                trackColor={{ false: Colors.surfaceGray, true: Colors.primaryLight }}
                thumbColor={user.runningPresenceVisible ? Colors.primary : Colors.textTertiary}
                accessibilityLabel={t('profile.presenceTitle')}
              />
            </View>
            <View style={styles.rowDivider} />
            <View style={styles.profileRow}>
              <View style={styles.profileRowIcon}><Ionicons name="flag-outline" size={18} color={Colors.primaryDark} /></View>
              <View style={styles.profileRowBody}>
                <Text style={styles.profileRowTitle}>{t('profile.declarationTitle')}</Text>
                <Text style={styles.profileRowDetail}>{t('profile.declarationDetail')}</Text>
              </View>
              <Switch
                value={user.runDeclarationVisible}
                onValueChange={(visible) => void handleDeclarationVisibility(visible)}
                disabled={declarationVisibilitySaving}
                trackColor={{ false: Colors.surfaceGray, true: Colors.primaryLight }}
                thumbColor={user.runDeclarationVisible ? Colors.primary : Colors.textTertiary}
                accessibilityLabel={t('profile.declarationTitle')}
              />
            </View>
            <View style={styles.rowDivider} />
            <ProfileRow icon="notifications-outline" title={t('profile.notificationCenter')} detail={t('profile.notificationCenterDetail')} onPress={() => router.push('/notifications' as any)} />
            <View style={styles.rowDivider} />
            <ProfileRow icon="notifications-circle-outline" title={t('profile.enablePush')} detail={t('profile.enablePushDetail')} onPress={handleEnableNotifications} />
            <View style={styles.rowDivider} />
            <ProfileRow icon="medal-outline" title={t('profile.displayedTitle')} detail={displayedTitle} onPress={() => router.push('/badges' as any)} />
            <View style={styles.rowDivider} />
            <ProfileRow icon="person-outline" title={t('profile.avatarIcon')} detail={t('profile.avatarDetail')} onPress={handleAvatarOptions} />
            <View style={styles.rowDivider} />
            <ProfileRow icon="person-remove-outline" title={t('profile.blockedUsers')} detail={t('profile.blockedUsersDetail')} onPress={() => router.push('/blocked-users' as any)} />
          </View>
        </View>

        <View>
          <Text style={styles.sectionHeading}>{t('profile.helpInfo')}</Text>
          <View style={[styles.surfaceCard, styles.listCard]}>
            <ProfileRow icon="book-outline" title={t('profile.guide')} detail={t('profile.guideDetail')} onPress={() => router.push('/guide' as any)} />
            <View style={styles.rowDivider} />
            <ProfileRow icon="help-circle-outline" title={t('profile.helpContact')} onPress={() => router.push('/help' as any)} />
            <View style={styles.rowDivider} />
            <ProfileRow icon="information-circle-outline" title={t('profile.about')} detail={t('profile.version', { version: Constants.expoConfig?.version ?? '—' })} onPress={() => Alert.alert('ZELIO', t('profile.aboutBody'))} />
          </View>
        </View>

        <View style={styles.legalRow}>
          <TouchableOpacity style={styles.legalButton} onPress={() => router.push('/legal/terms' as any)}>
            <Text style={styles.legalLink}>{t('common.terms')}</Text><Ionicons name="open-outline" size={11} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.legalSeparator}>|</Text>
          <TouchableOpacity style={styles.legalButton} onPress={() => router.push('/legal/privacy' as any)}>
            <Text style={styles.legalLink}>{t('common.privacy')}</Text><Ionicons name="open-outline" size={11} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* 管理者リンク */}
        {user.role === 'admin' && (
          <TouchableOpacity
            style={styles.adminBtn}
            onPress={() => router.push('/admin')}
          >
            <Ionicons name="settings-outline" size={15} color={Colors.info} />
            <Text style={styles.adminBtnText}>{t('profile.admin')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={17} color={Colors.primaryDark} />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDeleteAccount}
          disabled={deleting}
          style={styles.deleteAccountBtn}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={Colors.error} />
          ) : (
            <Text style={styles.deleteAccountText}>{t('profile.deleteAccount')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* AndroidのAlertは最大3ボタンのため、3地域＋キャンセルは共通Modalで表示する。 */}
      <Modal
        visible={showMarketPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMarketPicker(false)}
      >
        <Pressable style={styles.marketModalOverlay} onPress={() => setShowMarketPicker(false)}>
          <Pressable
            style={styles.marketModalCard}
            onPress={() => {}}
            accessibilityViewIsModal
          >
            <Text style={styles.marketModalTitle}>{t('profile.region')}</Text>
            <Text style={styles.marketModalBody}>{t('profile.regionDescription')}</Text>
            <View style={styles.marketOptions}>
              {MARKETS.map((market) => {
                const selected = user.market === market;
                return (
                  <TouchableOpacity
                    key={market}
                    style={[styles.marketOption, selected && styles.marketOptionSelected]}
                    onPress={() => { void handleMarketChange(market); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={selected ? Colors.primary : Colors.textTertiary}
                    />
                    <Text style={[styles.marketOptionText, selected && styles.marketOptionTextSelected]}>
                      {t(`market.${market}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.marketModalCancel}
              onPress={() => setShowMarketPicker(false)}
              accessibilityRole="button"
            >
              <Text style={styles.marketModalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* アプリ内アバターアイコン選択モーダル */}
      <Modal
        visible={showEmojiPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowEmojiPicker(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('profile.chooseIcon')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.avatarCategories}
            >
              {AVATAR_EMOJI_CATEGORIES.map((category) => {
                const selected = category.id === avatarCategory.id;
                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[styles.avatarCategoryChip, selected && styles.avatarCategoryChipSelected]}
                    onPress={() => setAvatarCategoryId(category.id)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.avatarCategoryText, selected && styles.avatarCategoryTextSelected]}>
                      {t(`avatarCategories.${category.id}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <FlatList
              data={[...avatarCategory.emojis]}
              numColumns={6}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.emojiCell,
                    user.avatarEmoji === item && styles.emojiCellSelected,
                  ]}
                  onPress={() => handleEmojiSelect(item)}
                >
                  <Text style={styles.emojiText}>{item}</Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.emojiGrid}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Alert.promptはAndroid非対応のため、パスワード再認証は共通Modalで行う。 */}
      <Modal
        visible={showDeletePasswordPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeletePasswordPrompt(false)}
      >
        <Pressable style={styles.deleteModalOverlay} onPress={() => setShowDeletePasswordPrompt(false)}>
          <Pressable style={styles.deleteModalCard} onPress={() => {}}>
            <Text style={styles.deleteModalTitle}>{t('profile.verifyPassword')}</Text>
            <Text style={styles.deleteModalBody}>{t('profile.verifyPasswordBody')}</Text>
            <TextInput
              style={styles.deletePasswordInput}
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder={t('profile.passwordPlaceholder')}
              placeholderTextColor={Colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!deletePassword) return;
                setShowDeletePasswordPrompt(false);
                void doDeleteWithPassword(deletePassword);
              }}
            />
            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteModalCancel}
                onPress={() => setShowDeletePasswordPrompt(false)}
              >
                <Text style={styles.deleteModalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteModalConfirm, !deletePassword && styles.deleteModalConfirmDisabled]}
                disabled={!deletePassword}
                onPress={() => {
                  setShowDeletePasswordPrompt(false);
                  void doDeleteWithPassword(deletePassword);
                }}
              >
                <Text style={styles.deleteModalConfirmText}>{t('profile.deleteAction')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
    backgroundColor: Colors.background,
    gap: 2,
  },
  headerEyebrow: { fontSize: 10, fontWeight: Typography.fontWeight.bold, letterSpacing: 1.8, color: Colors.textSecondary },
  headerTitle: { fontSize: 26, fontWeight: '900' as const, color: Colors.textPrimary },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 110, gap: Spacing['2xl'] },
  card: { marginBottom: 0 },
  profileCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  statTrio: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  statItem: { flex: 1, paddingHorizontal: Spacing.sm },
  statLabel: { fontSize: 10, color: Colors.textSecondary },
  statValue: { fontSize: 18, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary, marginTop: 3, fontVariant: ['tabular-nums'] },
  statValueAccent: { color: Colors.primaryDark },
  statUnit: { fontSize: 10, fontWeight: Typography.fontWeight.medium, color: Colors.textSecondary, marginLeft: 2 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: Colors.borderLight, marginVertical: 2 },
  rowDivider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 48 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  editBadge: {
    position: 'absolute', bottom: -2, right: -2,
    backgroundColor: Colors.primary, borderRadius: 8,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  userName: { fontSize: 18, fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary, flexShrink: 1 },
  profileTitle: { fontSize: 11, fontWeight: Typography.fontWeight.medium, color: Colors.textSecondary, marginTop: 4 },
  profileEditButton: { width: 36, height: 36, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  planBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.sm,
  },
  planBadgePro: { backgroundColor: Colors.accentYellow + '33' },
  planText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  planTextPro: { color: Colors.goldText, fontWeight: Typography.fontWeight.bold },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  sectionHeading: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.md },
  surfaceCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  showAllButton: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  showAllText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.primaryDark },
  proRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  proActiveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  proLabel: { fontSize: Typography.fontSize.md, color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  manageLink: { fontSize: Typography.fontSize.sm, color: Colors.primary },
  proCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.accent, padding: Spacing.lg, ...Shadow.sm },
  proCardActive: { borderColor: Colors.border },
  freePlanBadge: { backgroundColor: Colors.accentLight, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4, marginBottom: Spacing.md },
  freePlanText: { fontSize: 10, color: Colors.accentText, fontWeight: Typography.fontWeight.bold },
  proIntro: { flexDirection: 'row', gap: Spacing.md },
  proIcon: { width: 40, height: 40, borderRadius: BorderRadius.sm, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  proUpsellTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary },
  freeDesc: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, lineHeight: 18, marginTop: 3 },
  planRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  planOption: { flex: 1, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm },
  planOptionSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentLight },
  planPeriod: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, fontWeight: Typography.fontWeight.semibold },
  planPeriodSelected: { color: Colors.accentText },
  planPrice: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary },
  planPriceSelected: { color: Colors.accentText },
  proStartButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, backgroundColor: Colors.accent, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, marginTop: Spacing.md },
  proStartButtonDisabled: { backgroundColor: Colors.textTertiary, opacity: 0.6 },
  proStartText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.extrabold, color: Colors.textOnAccent },
  priceErrorBox: { marginTop: Spacing.md, gap: Spacing.xs, alignItems: 'center' },
  priceErrorText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  priceRetryText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.primaryDark },
  restoreButton: { alignSelf: 'center', marginTop: Spacing.sm },
  restoreText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  subscriptionDisclaimer: { fontSize: 10, color: Colors.textSecondary, lineHeight: 15, marginTop: Spacing.sm, textAlign: 'center' },
  freeDescDark: { fontSize: Typography.fontSize.sm, color: DarkColors.textSecondary, lineHeight: 20, marginTop: Spacing.sm },
  priceTextDark: { fontSize: Typography.fontSize.sm, color: DarkColors.textPrimary, fontWeight: Typography.fontWeight.semibold, marginTop: Spacing.sm },
  subscriptionDisclaimerDark: { fontSize: 10, color: DarkColors.textTertiary, lineHeight: 15, marginTop: Spacing.sm },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: Spacing.xs },
  legalButton: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legalLink: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  legalSeparator: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginHorizontal: Spacing.xs },
  emptyText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center', paddingVertical: Spacing.md },
  titleBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  titleDivider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 68 },
  titleRankWrap: { width: 40, height: 40, backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  titleRankWrapSelected: { backgroundColor: Colors.accentLight },
  titleRank: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.primaryDark },
  titleRankSelected: { color: Colors.accentText },
  titleInfo: { flex: 1 },
  titleNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  titleName: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  titleSelectedLabel: { fontSize: 9, fontWeight: Typography.fontWeight.bold, color: Colors.primaryDark, backgroundColor: Colors.primaryLight, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  titleBattle: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  titleSeason: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  listCard: { marginTop: 0 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  profileRowIcon: { width: 36, height: 36, borderRadius: BorderRadius.sm, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  profileRowBody: { flex: 1 },
  profileRowTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  profileRowDetail: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  deleteAccountBtn: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing['3xl'],
    minHeight: 36,
    justifyContent: 'center' as const,
  },
  deleteAccountText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
  },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface, paddingVertical: Spacing.md,
  },
  logoutText: { fontSize: Typography.fontSize.md, color: Colors.primaryDark, fontWeight: Typography.fontWeight.extrabold },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: Spacing['3xl'],
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  marketModalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: DarkColors.modalBackdrop,
  },
  marketModalCard: {
    width: '100%',
    maxWidth: 420,
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surface,
  },
  marketModalTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    textAlign: 'center',
  },
  marketModalBody: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.normal,
    textAlign: 'center',
  },
  marketOptions: {
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  marketOption: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
  },
  marketOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  marketOptionText: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
  },
  marketOptionTextSelected: {
    color: Colors.primaryDark,
    fontWeight: Typography.fontWeight.bold,
  },
  marketModalCancel: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  marketModalCancelText: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
  },
  deleteModalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: DarkColors.modalBackdrop,
  },
  deleteModalCard: {
    width: '100%',
    maxWidth: 420,
    gap: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surface,
  },
  deleteModalTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    textAlign: 'center',
  },
  deleteModalBody: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.normal,
    textAlign: 'center',
  },
  deletePasswordInput: {
    minHeight: 50,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.md,
  },
  deleteModalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  deleteModalCancel: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deleteModalCancelText: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
  },
  deleteModalConfirm: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.error,
  },
  deleteModalConfirmDisabled: {
    opacity: 0.5,
  },
  deleteModalConfirmText: {
    color: Colors.textOnPrimary,
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.bold,
  },
  emojiGrid: { paddingVertical: Spacing.sm },
  avatarCategories: { gap: Spacing.sm, paddingBottom: Spacing.md },
  avatarCategoryChip: { minHeight: 34, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceGray },
  avatarCategoryChipSelected: { backgroundColor: Colors.primary },
  avatarCategoryText: { fontSize: 11, color: Colors.textSecondary, fontWeight: Typography.fontWeight.bold },
  avatarCategoryTextSelected: { color: Colors.textOnPrimary },
  emojiCell: {
    flex: 1, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    margin: Spacing.xs,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceGray,
  },
  emojiCellSelected: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 2, borderColor: Colors.primary,
  },
  emojiText: { fontSize: 32 },
  adminBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.info,
    backgroundColor: Colors.info + '15',
  },
  adminBtnText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.info,
    fontWeight: Typography.fontWeight.semibold,
  },
  devToggle: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.accentYellow,
    backgroundColor: Colors.accentYellow + '22',
  },
  devToggleText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.goldText,
    fontWeight: Typography.fontWeight.semibold,
  },
  badgeLinkCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeLinkLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.md,
  },
  badgeLinkIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.accentYellow + '20',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  badgeLinkTitle: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  badgeLinkSub: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 1,
  },
});
