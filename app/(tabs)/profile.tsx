import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
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

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();

      const storageRef = ref(storage, `avatars/${user!.id}`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);

      await updateDoc(doc(db, 'users', user!.id), { avatarUrl: url });
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, avatarUrl: url } : null,
      }));
    } catch {
      Alert.alert('エラー', 'アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
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
        <Text style={styles.headerTitle}>プロフィール</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ユーザー情報 */}
        <Card style={styles.card}>
          <View style={styles.userRow}>
            <TouchableOpacity onPress={handleAvatarPick} disabled={uploading}>
              {uploading ? (
                <View style={styles.avatarLoading}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : (
                <View>
                  <Avatar name={user.name} uri={user.avatarUrl} size="lg" />
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
                Proプランにアップグレードすると、プライベートバトルの作成が無制限になります。
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

        {/* 獲得称号 */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>獲得称号</Text>
          {titles.length === 0 ? (
            <Text style={styles.emptyText}>
              まだ称号がありません。バトルで上位入賞しよう！
            </Text>
          ) : (
            <View style={styles.titleList}>
              {titles.map((t, i) => (
                <TitleBadge key={`${t.battleId}_${i}`} title={t} />
              ))}
            </View>
          )}
        </Card>

        <Button
          label="ログアウト"
          onPress={handleSignOut}
          variant="danger"
          style={{ marginBottom: Spacing['3xl'] }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
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
});
