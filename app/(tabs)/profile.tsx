import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, Modal, FlatList, Pressable, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from 'firebase/auth';
import { auth, db, storage } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { purchasePro, restorePurchases } from '../../lib/revenuecat';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import type { UserTitle } from '../../types';

function TitleBadge({ title }: { title: UserTitle }) {
  const rankLabel = title.rank === 1 ? '👑 MVP' : `TOP ${title.rank}`;
  const awardedDate = new Date(title.awardedAt).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short',
  });
  return (
    <View style={styles.titleBadge}>
      <View style={styles.titleRankWrap}>
        <Text style={styles.titleRank}>{rankLabel}</Text>
      </View>
      <View style={styles.titleInfo}>
        <Text style={styles.titleName} numberOfLines={1}>
          {title.battleTitle}　{title.teamName}
        </Text>
        <Text style={styles.titleSeason}>{title.seasonId}　{awardedDate}</Text>
      </View>
    </View>
  );
}

const ANIMAL_EMOJIS = [
  '🐱','🐶','🐻','🐼','🐨','🐯','🦁','🐸',
  '🐰','🐹','🦊','🐺','🐮','🐷','🐧','🐬',
  '🦄','🦔','🦋','🦦','🐙','🦈','🐘','🦒',
];

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  function handleAvatarOptions() {
    Alert.alert('アイコンを変更', undefined, [
      { text: '写真を選ぶ', onPress: handleAvatarPick },
      { text: 'イラストを選ぶ', onPress: () => setShowEmojiPicker(true) },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  }

  async function handleEmojiSelect(emoji: string) {
    if (!user) return;
    setShowEmojiPicker(false);
    try {
      await updateDoc(doc(db, 'users', user.id), { avatarEmoji: emoji, avatarUrl: null });
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, avatarEmoji: emoji, avatarUrl: undefined } : null,
      }));
    } catch {
      Alert.alert('エラー', 'アイコンの更新に失敗しました');
    }
  }

  async function handlePurchasePro() {
    if (!user) return;
    setPurchasing(true);
    try {
      const ok = await purchasePro(user.id);
      if (ok) {
        useAuthStore.setState((s) => ({
          user: s.user ? { ...s.user, plan: 'pro' } : null,
        }));
        Alert.alert('🎉 ありがとうございます！', 'Proプランが有効になりました。');
      }
    } catch {
      Alert.alert('エラー', '購入に失敗しました。通信状態を確認してください。');
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    if (!user) return;
    setPurchasing(true);
    try {
      const ok = await restorePurchases(user.id);
      Alert.alert(ok ? '復元しました' : '購入履歴が見つかりませんでした');
      if (ok) useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, plan: 'pro' } : null }));
    } catch {
      Alert.alert('エラー', '復元に失敗しました');
    } finally {
      setPurchasing(false);
    }
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

      await updateDoc(doc(db, 'users', user!.id), { avatarUrl: url, avatarEmoji: null });
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

      // Firestore のユーザーデータ削除
      await deleteDoc(doc(db, 'users', user.id));

      // アバター画像を Storage から削除
      if (user.avatarUrl) {
        try {
          await deleteObject(ref(storage, `avatars/${user.id}`));
        } catch {
          // 存在しない場合は無視
        }
      }

      // Firebase Auth ユーザー削除（onAuthStateChanged が user: null をセットする）
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerSub}>BATTLERUN / プロフィール</Text>
        <Text style={styles.headerTitle}>プロフィール</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ユーザー情報 */}
        <Card style={styles.card}>
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
                    <Text style={styles.editBadgeText}>編集</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.name}</Text>
              <View style={[styles.planBadge, user.plan === 'pro' && styles.planBadgePro]}>
                <Text style={[styles.planText, user.plan === 'pro' && styles.planTextPro]}>
                  {user.plan === 'pro' ? '✨ Pro' : 'Free'}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* サブスク管理 */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>サブスクリプション</Text>
          {user.plan === 'pro' ? (
            <View style={styles.proRow}>
              <Text style={styles.proLabel}>✨ Proプラン 有効中</Text>
              <TouchableOpacity
                onPress={() => Alert.alert('サブスク管理', 'App Store の設定からサブスクリプションを管理してください。')}
              >
                <Text style={styles.manageLink}>管理する</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.freeDesc}>
                Proプランにアップグレードすると、プライベートチャレンジの作成が無制限になります。
              </Text>
              <Button
                label={purchasing ? '処理中...' : 'Proにアップグレード'}
                onPress={handlePurchasePro}
                loading={purchasing}
                style={{ marginTop: Spacing.md }}
              />
              <TouchableOpacity onPress={handleRestore} style={{ alignSelf: 'center', marginTop: Spacing.sm }}>
                <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.textTertiary }}>購入を復元する</Text>
              </TouchableOpacity>
            </>
          )}
        </Card>

        {/* バッジ・称号リンク */}
        <TouchableOpacity
          style={styles.badgeLinkCard}
          onPress={() => router.push('/badges' as any)}
          activeOpacity={0.85}
        >
          <View style={styles.badgeLinkLeft}>
            <View style={styles.badgeLinkIcon}>
              <Text style={{ fontSize: 22 }}>🏅</Text>
            </View>
            <View>
              <Text style={styles.badgeLinkTitle}>バッジ・称号</Text>
              <Text style={styles.badgeLinkSub}>
                {titles.length > 0 ? `称号 ${titles.length}件獲得済み` : '走ってバッジを集めよう'}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 16, color: Colors.textTertiary }}>›</Text>
        </TouchableOpacity>

        {/* 獲得称号 */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>獲得称号</Text>
          {titles.length === 0 ? (
            <Text style={styles.emptyText}>
              まだ称号がありません。チャレンジで上位入賞しよう！
            </Text>
          ) : (
            <View style={styles.titleList}>
              {titles.map((t, i) => (
                <TitleBadge key={`${t.battleId}_${i}`} title={t} />
              ))}
            </View>
          )}
        </Card>

        {/* 管理者リンク */}
        {user.role === 'admin' && (
          <TouchableOpacity
            style={styles.adminBtn}
            onPress={() => router.push('/admin')}
          >
            <Text style={styles.adminBtnText}>⚙️ 管理画面</Text>
          </TouchableOpacity>
        )}

        {/* 開発用: 本番ビルドには含まれない */}
        {__DEV__ && (
          <TouchableOpacity
            style={styles.devToggle}
            onPress={async () => {
              const next = user.plan === 'pro' ? 'free' : 'pro';
              await updateDoc(doc(db, 'users', user.id), { plan: next });
              useAuthStore.setState((s) => ({
                user: s.user ? { ...s.user, plan: next } : null,
              }));
            }}
          >
            <Text style={styles.devToggleText}>
              [DEV] {user.plan === 'pro' ? 'Free に戻す' : 'Pro を有効にする'}
            </Text>
          </TouchableOpacity>
        )}

        <Button
          label="ログアウト"
          onPress={handleSignOut}
          variant="danger"
        />

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
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 2,
  },
  headerSub: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 9, fontWeight: '700' as const, letterSpacing: 2,
    color: Colors.textTertiary, textTransform: 'uppercase' as const,
  },
  headerTitle: { fontSize: 22, fontWeight: '900' as const, color: Colors.textPrimary },
  scroll: { padding: Spacing.lg, gap: Spacing['2xl'] },
  card: { marginBottom: 0 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  avatarLoading: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.surfaceGray, alignItems: 'center', justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute', bottom: -2, right: -2,
    backgroundColor: Colors.primary, borderRadius: 8,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  editBadgeText: { fontSize: 9, color: Colors.textOnPrimary, fontWeight: Typography.fontWeight.bold },
  userInfo: { flex: 1 },
  userName: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  planBadge: {
    alignSelf: 'flex-start', marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    backgroundColor: Colors.surfaceGray, borderRadius: 99,
  },
  planBadgePro: { backgroundColor: Colors.accentYellow + '33' },
  planText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  planTextPro: { color: Colors.accentYellow, fontWeight: Typography.fontWeight.bold },
  sectionTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: Colors.textSecondary, marginBottom: Spacing.md },
  proRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  proLabel: { fontSize: Typography.fontSize.md, color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  manageLink: { fontSize: Typography.fontSize.sm, color: Colors.primary },
  freeDesc: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  emptyText: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary, textAlign: 'center', paddingVertical: Spacing.md },
  titleList: { gap: Spacing.sm },
  titleBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  titleRankWrap: { backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4, minWidth: 64, alignItems: 'center' },
  titleRank: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.primary },
  titleInfo: { flex: 1 },
  titleName: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
  titleSeason: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 2 },
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
    color: Colors.textTertiary,
    marginTop: 1,
  },
});
