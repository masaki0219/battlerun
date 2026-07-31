import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, Modal, FlatList, Pressable, Linking, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from 'firebase/auth';
import { auth, db, storage, functions } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { purchasePro, restorePurchases, getProPlanPrices, isStoreAvailable, type ProPackageInfo, type ProPlanPeriod } from '../../lib/revenuecat';
import { isPro } from '../../lib/pro';
import { SUBSCRIPTION_DISCLAIMER } from '../../lib/legal';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../../components/ui/Avatar';
import { useRecentActivities } from '../../hooks/useRecentActivities';
import { streakDays } from '../../utils/displayStats';
import { Colors, DarkColors, Typography, Spacing, BorderRadius, Shadow } from '../../design_tokens';
import type { UserTitle } from '../../types';
import { httpsCallable } from 'firebase/functions';
import { registerPushToken } from '../../lib/notifications';
import Constants from 'expo-constants';

function TitleBadge({ title, selected }: { title: UserTitle; selected: boolean }) {
  const rankLabel = title.rank === 1 ? '優勝チームメンバー' : title.rank === 2 ? '準優勝チームメンバー' : `${title.rank}位チームメンバー`;
  const awardedDate = new Date(title.awardedAt).toLocaleDateString('ja-JP', {
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
          {selected && <Text style={styles.titleSelectedLabel}>表示中</Text>}
        </View>
        <Text style={styles.titleBattle} numberOfLines={1}>{title.battleTitle}</Text>
        <Text style={styles.titleSeason} numberOfLines={1}>
          {/* seasonId は Firestore の内部IDなので表示しない（本番は自動生成の英数字になる） */}
          {[title.teamName, `${awardedDate}獲得`].filter(Boolean).join(' ・ ')}
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

const ANIMAL_EMOJIS = [
  '🐱','🐶','🐻','🐼','🐨','🐯','🦁','🐸',
  '🐰','🐹','🦊','🐺','🐮','🐷','🐧','🐬',
  '🦄','🦔','🦋','🦦','🐙','🦈','🐘','🦒',
];

export default function ProfileScreen() {
  const { user, proEntitlement, signOut, setRunningPresenceVisible } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [presenceSaving, setPresenceSaving] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [proPlans, setProPlans] = useState<Partial<Record<ProPlanPeriod, ProPackageInfo>>>({});
  const [proPlansLoading, setProPlansLoading] = useState(false);
  const [proPlansReloadKey, setProPlansReloadKey] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<ProPlanPeriod>('monthly');
  const [serverStats, setServerStats] = useState<{ totalDistanceKm: number; activityCount: number } | null>(null);

  // 自分の戦績（累計距離・ラン回数・ストリーク）
  const { activities } = useRecentActivities(50);
  const totalKm = serverStats?.totalDistanceKm ?? user?.totalDistanceKm ?? activities.reduce((sum, a) => sum + a.distanceKm, 0);
  const totalRuns = serverStats?.activityCount ?? user?.activityCount ?? activities.length;
  const streak = streakDays(activities);

  useEffect(() => {
    if (isPro(user?.plan, proEntitlement)) return;
    let cancelled = false;
    setProPlansLoading(true);
    getProPlanPrices()
      .then((plans) => {
        if (cancelled) return;
        setProPlans(plans);
        // 月額がOfferingに無い構成でも購入ボタンが機能するよう選択を補正する
        if (!plans.monthly && plans.annual) setSelectedPeriod('annual');
      })
      .catch(() => { if (!cancelled) setProPlans({}); })
      .finally(() => { if (!cancelled) setProPlansLoading(false); });
    return () => { cancelled = true; };
  }, [user?.plan, proEntitlement, proPlansReloadKey]);

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
    Alert.alert('アイコンを変更', undefined, [
      { text: '写真を選ぶ', onPress: handleAvatarPick },
      { text: 'イラストを選ぶ', onPress: () => setShowEmojiPicker(true) },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  }

  async function handlePresenceVisibility(visible: boolean) {
    setPresenceSaving(true);
    try {
      await setRunningPresenceVisible(visible);
      if (visible && user) void registerPushToken(user.id, false);
    } catch {
      Alert.alert('設定を更新できませんでした', '通信状態を確認して、もう一度お試しください。');
    } finally {
      setPresenceSaving(false);
    }
  }

  async function handleEmojiSelect(emoji: string) {
    if (!user) return;
    setShowEmojiPicker(false);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.id), { avatarEmoji: emoji, avatarUrl: null });
      batch.set(doc(db, 'publicProfiles', user.id), {
        name: user.name, avatarEmoji: emoji, avatarUrl: null, updatedAt: serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, avatarEmoji: emoji, avatarUrl: undefined } : null,
      }));
    } catch {
      Alert.alert('エラー', 'アイコンの更新に失敗しました');
    }
  }

  async function handlePurchasePro() {
    if (!user) return;
    if (!isStoreAvailable()) {
      Alert.alert(
        'この環境では購入できません',
        'アプリ内購入はExpo Goやシミュレータでは動作しません。実機のEASビルド（開発ビルド / TestFlight）でテストしてください。',
      );
      return;
    }
    setPurchasing(true);
    try {
      const ok = await purchasePro(selectedPeriod);
      if (ok) {
        Alert.alert('🎉 ありがとうございます！', 'Proプランが有効になりました。');
      }
    } catch (e: any) {
      // RevenueCat/StoreKit のエラー内容は原因切り分けに必須なのでそのまま見せる
      Alert.alert('購入に失敗しました', e?.message ?? '通信状態を確認してください。');
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    if (!user) return;
    if (!isStoreAvailable()) {
      Alert.alert(
        'この環境では復元できません',
        'アプリ内購入はExpo Goやシミュレータでは動作しません。実機のEASビルド（開発ビルド / TestFlight）でテストしてください。',
      );
      return;
    }
    setPurchasing(true);
    try {
      const ok = await restorePurchases();
      Alert.alert(ok ? '復元しました' : '購入履歴が見つかりませんでした');
    } catch {
      Alert.alert('エラー', '復元に失敗しました');
    } finally {
      setPurchasing(false);
    }
  }

  async function handleEnableNotifications() {
    if (!user) return;
    const enabled = await registerPushToken(user.id, true);
    Alert.alert(
      enabled ? '通知を有効にしました' : '通知を有効にできませんでした',
      enabled ? '順位変動やチャレンジ終了をお知らせします。' : '端末の設定からZELIOの通知を許可してください。',
    );
  }

  async function handleAvatarPick() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限が必要です', '写真へのアクセスを許可してください');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const uri = result.assets[0].uri;

      // React Native では fetch().blob() が不安定なため XMLHttpRequest で Blob を生成する
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response as Blob);
        xhr.onerror = () => reject(new Error('blob 生成失敗'));
        xhr.responseType = 'blob';
        xhr.open('GET', uri, true);
        xhr.send(null);
      });

      const storageRef = ref(storage, `avatars/${user!.id}`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);

      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user!.id), { avatarUrl: url, avatarEmoji: null });
      batch.set(doc(db, 'publicProfiles', user!.id), {
        name: user!.name, avatarUrl: url, avatarEmoji: null, updatedAt: serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, avatarUrl: url, avatarEmoji: undefined } : null,
      }));
    } catch {
      Alert.alert('エラー', 'アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  }

  async function doDeleteAccount(password: string) {
    if (!user) return;
    setDeleting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser?.email) throw new Error('認証情報が見つかりません');

      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, credential);

      // アバター画像を Storage から削除（認証が有効なうちに行う必要がある）
      if (user.avatarUrl) {
        try {
          await deleteObject(ref(storage, `avatars/${user.id}`));
        } catch {
          // 存在しない場合は無視
        }
      }

      // Firebase Auth ユーザー削除（onAuthStateChanged が user: null をセットする）。
      // Firestore側のデータ（users/{uid}本体・activities・participants・通知・バッジ）は
      // Cloud Functions（onUserDeleted）がAuthユーザー削除をトリガーに一括削除する。
      await deleteUser(currentUser);

      router.replace('/auth/login');
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        Alert.alert('エラー', 'パスワードが正しくありません');
      } else {
        Alert.alert('エラー', 'アカウントの削除に失敗しました。もう一度お試しください。');
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'アカウント削除',
      'アカウントを削除すると、すべてのデータが完全に失われます。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: () => {
            Alert.prompt(
              'パスワードを確認',
              '本人確認のためパスワードを入力してください。',
              [
                { text: 'キャンセル', style: 'cancel' },
                {
                  text: '削除',
                  style: 'destructive',
                  onPress: (password: string | undefined) => {
                    if (!password) {
                      Alert.alert('エラー', 'パスワードを入力してください');
                      return;
                    }
                    doDeleteAccount(password);
                  },
                },
              ],
              'secure-text',
            );
          },
        },
      ],
    );
  }

  async function handleSignOut() {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト', style: 'destructive', onPress: async () => {
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
    ? `称号：${titles[0].rank === 1 ? '優勝チームメンバー' : titles[0].rank === 2 ? '準優勝チームメンバー' : `${titles[0].rank}位チームメンバー`}`
    : 'チャレンジで称号を獲得しよう';
  const userIsPro = isPro(user.plan, proEntitlement);
  // 価格（期間つき）を提示できるときだけ購入導線を有効にする
  const hasProPrice = Boolean(proPlans.monthly || proPlans.annual);
  const canPurchasePro = hasProPrice && !purchasing && !proPlansLoading;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>ZELIO</Text>
        <Text style={styles.headerTitle}>プロフィール</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profileCard}>
          <View style={styles.userRow}>
            <TouchableOpacity onPress={handleAvatarOptions} disabled={uploading}>
              {uploading ? (
                <View style={styles.avatarLoading}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : (
                <View>
                  <Avatar name={user.name} uri={user.avatarUrl} emoji={user.avatarEmoji} size="lg" />
                  <View style={styles.editBadge}>
                    <Ionicons name="pencil" size={10} color={Colors.textOnPrimary} />
                  </View>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.userInfo}>
              <View style={styles.userNameRow}>
                <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
                <View style={[styles.planBadge, userIsPro && styles.planBadgePro]}>
                  {userIsPro && <Ionicons name="sparkles" size={10} color={Colors.accentYellow} />}
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
            <ProfileStat label="累計距離" value={totalKm.toFixed(1)} unit="km" />
            <View style={styles.statDivider} />
            <ProfileStat label="ラン回数" value={String(totalRuns)} unit="回" />
            <View style={styles.statDivider} />
            <ProfileStat label="連続日数" value={String(streak)} unit="日" accent />
          </View>
        </View>

        <View>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionHeading}>獲得称号</Text>
            <TouchableOpacity style={styles.showAllButton} onPress={() => router.push('/badges' as any)} activeOpacity={0.7}>
              <Text style={styles.showAllText}>すべて見る</Text>
              <Ionicons name="chevron-forward" size={15} color={Colors.primaryDark} />
            </TouchableOpacity>
          </View>
          <View style={styles.surfaceCard}>
            {titles.length === 0 ? (
              <Text style={styles.emptyText}>まだ称号がありません。チャレンジで上位入賞しよう！</Text>
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
            <View style={styles.freePlanBadge}><Text style={styles.freePlanText}>{userIsPro ? 'Proプラン' : 'Freeプラン'}</Text></View>
          </View>
          <View style={[styles.proCard, userIsPro && styles.proCardActive]}>
            {userIsPro ? (
              <View style={styles.proRow}>
                <View style={styles.proActiveRow}>
                  <Ionicons name="sparkles" size={16} color={Colors.accentYellow} />
                  <Text style={styles.proLabel}>Proプラン 有効中</Text>
                </View>
                <TouchableOpacity onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')} accessibilityRole="link">
                  <Text style={styles.manageLink}>管理する</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.proIntro}>
                  <View style={styles.proIcon}><Ionicons name="diamond-outline" size={20} color={Colors.accentDark} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.proUpsellTitle}>もっと走りを楽しむ</Text>
                    <Text style={styles.freeDesc}>友達チャレンジ作成、バトルテーマ、透かしなし共有を利用できます。</Text>
                  </View>
                </View>
                {(proPlans.monthly || proPlans.annual) && (
                  <View style={styles.planRow}>
                    {(['monthly', 'annual'] as const).map((period) => {
                      const plan = proPlans[period];
                      if (!plan) return null;
                      const selected = selectedPeriod === period;
                      return (
                        <TouchableOpacity
                          key={period}
                          style={[styles.planOption, selected && styles.planOptionSelected]}
                          onPress={() => setSelectedPeriod(period)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${plan.periodLabel || (period === 'monthly' ? '月額' : '年額')} ${plan.priceString}`}
                        >
                          <Text style={[styles.planPeriod, selected && styles.planPeriodSelected]}>{plan.periodLabel || (period === 'monthly' ? '月額' : '年額')}</Text>
                          <Text style={[styles.planPrice, selected && styles.planPriceSelected]}>{plan.priceString}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                {/* 価格・期間を提示できないまま購入導線を出さない（サブスクの表示要件）。
                    取得できていないときは非活性にして再試行を出す。 */}
                {!hasProPrice && !proPlansLoading && (
                  <View style={styles.priceErrorBox}>
                    <Text style={styles.priceErrorText}>価格を読み込めませんでした。通信状態を確認してください。</Text>
                    <TouchableOpacity onPress={() => setProPlansReloadKey((key) => key + 1)} accessibilityRole="button">
                      <Text style={styles.priceRetryText}>再読み込み</Text>
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
                  {purchasing || proPlansLoading
                    ? <ActivityIndicator color={Colors.textOnAccent} />
                    : <><Text style={styles.proStartText}>Proをはじめる</Text><Ionicons name="chevron-forward" size={16} color={Colors.textOnAccent} /></>}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRestore} style={styles.restoreButton}><Text style={styles.restoreText}>購入を復元する</Text></TouchableOpacity>
                <Text style={styles.subscriptionDisclaimer}>{SUBSCRIPTION_DISCLAIMER}</Text>
              </>
            )}
          </View>
        </View>

        <View>
          <Text style={styles.sectionHeading}>設定</Text>
          <View style={[styles.surfaceCard, styles.listCard]}>
            <View style={styles.profileRow}>
              <View style={styles.profileRowIcon}><Ionicons name="radio-outline" size={18} color={Colors.primaryDark} /></View>
              <View style={styles.profileRowBody}>
                <Text style={styles.profileRowTitle}>走行中の表示を仲間に公開</Text>
                <Text style={styles.profileRowDetail}>参加中のチャレンジに「ラン中」の事実だけを表示します。位置情報は共有しません。</Text>
              </View>
              <Switch
                value={user.runningPresenceVisible}
                onValueChange={(visible) => void handlePresenceVisibility(visible)}
                disabled={presenceSaving}
                trackColor={{ false: Colors.surfaceGray, true: Colors.primaryLight }}
                thumbColor={user.runningPresenceVisible ? Colors.primary : Colors.textTertiary}
                accessibilityLabel="走行中の表示を仲間に公開"
              />
            </View>
            <View style={styles.rowDivider} />
            <ProfileRow icon="notifications-outline" title="通知センター" detail="チャレンジ・ランの通知を確認する" onPress={() => router.push('/notifications' as any)} />
            <View style={styles.rowDivider} />
            <ProfileRow icon="notifications-circle-outline" title="プッシュ通知を有効にする" detail="順位変動や終了時刻を受け取る" onPress={handleEnableNotifications} />
            <View style={styles.rowDivider} />
            <ProfileRow icon="medal-outline" title="表示中の称号" detail={profileTitle.replace('称号：', '')} onPress={() => router.push('/badges' as any)} />
            <View style={styles.rowDivider} />
            <ProfileRow icon="person-outline" title="アカウント" detail="プロフィール画像を変更" onPress={handleAvatarOptions} />
            <View style={styles.rowDivider} />
            <ProfileRow icon="person-remove-outline" title="ブロック中のユーザー" detail="非表示にした相手の確認・解除" onPress={() => router.push('/blocked-users' as any)} />
          </View>
        </View>

        <View>
          <Text style={styles.sectionHeading}>ヘルプ・アプリ情報</Text>
          <View style={[styles.surfaceCard, styles.listCard]}>
            <ProfileRow icon="help-circle-outline" title="ヘルプ・お問い合わせ" onPress={() => router.push('/help' as any)} />
            <View style={styles.rowDivider} />
            <ProfileRow icon="information-circle-outline" title="ZELIOについて" detail={`バージョン ${Constants.expoConfig?.version ?? '—'}`} onPress={() => Alert.alert('ZELIO', '仲間と距離を競うチーム対抗ランニング・ウォーキングアプリです。')} />
          </View>
        </View>

        <View style={styles.legalRow}>
          <TouchableOpacity style={styles.legalButton} onPress={() => router.push('/legal/terms' as any)}>
            <Text style={styles.legalLink}>利用規約</Text><Ionicons name="open-outline" size={11} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.legalSeparator}>|</Text>
          <TouchableOpacity style={styles.legalButton} onPress={() => router.push('/legal/privacy' as any)}>
            <Text style={styles.legalLink}>プライバシーポリシー</Text><Ionicons name="open-outline" size={11} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* 管理者リンク */}
        {user.role === 'admin' && (
          <TouchableOpacity
            style={styles.adminBtn}
            onPress={() => router.push('/admin')}
          >
            <Ionicons name="settings-outline" size={15} color={Colors.info} />
            <Text style={styles.adminBtnText}>管理画面</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={17} color={Colors.primaryDark} />
          <Text style={styles.logoutText}>ログアウト</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDeleteAccount}
          disabled={deleting}
          style={styles.deleteAccountBtn}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={Colors.error} />
          ) : (
            <Text style={styles.deleteAccountText}>アカウントを削除する</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* 動物イラスト選択モーダル */}
      <Modal
        visible={showEmojiPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowEmojiPicker(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>アイコンを選ぶ</Text>
            <FlatList
              data={ANIMAL_EMOJIS}
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
  avatarLoading: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.surfaceGray, alignItems: 'center', justifyContent: 'center',
  },
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
  planTextPro: { color: Colors.accentYellow, fontWeight: Typography.fontWeight.bold },
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
  freePlanText: { fontSize: 10, color: Colors.accentDark, fontWeight: Typography.fontWeight.bold },
  proIntro: { flexDirection: 'row', gap: Spacing.md },
  proIcon: { width: 40, height: 40, borderRadius: BorderRadius.sm, backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  proUpsellTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary },
  freeDesc: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, lineHeight: 18, marginTop: 3 },
  planRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  planOption: { flex: 1, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm },
  planOptionSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentLight },
  planPeriod: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, fontWeight: Typography.fontWeight.semibold },
  planPeriodSelected: { color: Colors.accentDark },
  planPrice: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary },
  planPriceSelected: { color: Colors.accentDark },
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
  titleRankSelected: { color: Colors.accentDark },
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
  emojiGrid: { paddingVertical: Spacing.sm },
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
    color: Colors.accentYellow,
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
