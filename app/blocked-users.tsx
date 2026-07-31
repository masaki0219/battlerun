import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Avatar } from '../components/ui/Avatar';
import { BorderRadius, Colors, Shadow, Spacing, Typography } from '../design_tokens';
import { useBlockedUsers } from '../hooks/useBlockedUsers';
import { unblockUser } from '../lib/moderation';
import { useAuthStore } from '../stores/authStore';

export default function BlockedUsersScreen() {
  const { user } = useAuthStore();
  const { blockedUsers } = useBlockedUsers(user?.id);

  function confirmUnblock(blockedUid: string, displayName: string) {
    if (!user) return;
    Alert.alert(`${displayName}のブロックを解除しますか？`, undefined, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '解除する',
        onPress: async () => {
          try {
            await unblockUser(user.id, blockedUid);
          } catch {
            Alert.alert('解除できませんでした', '通信状態を確認して、もう一度お試しください。');
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="戻る">
          <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ブロック中のユーザー</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primaryDark} />
          <Text style={styles.infoText}>ブロックした相手の投稿・ランキング・公開記録は表示されず、相互の応援やリアクションも停止します。相手には通知されません。</Text>
        </View>
        {blockedUsers.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={32} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>ブロック中のユーザーはいません</Text>
            <Text style={styles.emptyDetail}>チャレンジ内の「…」から通報・ブロックできます</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {blockedUsers.map((item, index) => (
              <View key={item.blockedUid} style={[styles.row, index > 0 && styles.divider]}>
                <Avatar name={item.displayName} size="sm" />
                <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
                <TouchableOpacity
                  style={styles.unblockButton}
                  onPress={() => confirmUnblock(item.blockedUid, item.displayName)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.displayName}のブロックを解除`}
                >
                  <Text style={styles.unblockText}>解除</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  headerSpacer: { width: 22 },
  scroll: { padding: Spacing.lg, gap: Spacing.lg },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.lg, borderRadius: BorderRadius.lg, backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primaryBorder },
  infoText: { flex: 1, fontSize: Typography.fontSize.xs, lineHeight: 18, color: Colors.primaryDark },
  empty: { alignItems: 'center', paddingVertical: 64 },
  emptyTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginTop: Spacing.md },
  emptyDetail: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: Spacing.xs },
  list: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, ...Shadow.sm },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  name: { flex: 1, fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  unblockButton: { minWidth: 62, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border },
  unblockText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
});
