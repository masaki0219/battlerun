import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { REPORT_REASONS, type ReportReason, type ReportStatus, type ReportTargetType } from '../../lib/moderation';
import { useAuthStore } from '../../stores/authStore';
import { BorderRadius, Colors, Shadow, Spacing, Typography } from '../../design_tokens';

interface ModerationReport {
  id: string;
  reporterUid: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUid?: string;
  battleId?: string;
  contentSnapshot?: string;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  createdAt: string;
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  pending: '未確認', reviewing: '確認中', resolved: '対応済み', dismissed: '違反なし',
};
const TARGET_LABEL: Record<ReportTargetType, string> = {
  user: 'ユーザー', battle: 'チャレンジ', declaration: '宣言', presence: '走行中表示', activity: '公開記録',
};

function timestampIso(value: unknown): string {
  const timestamp = value as { toDate?: () => Date } | undefined;
  return timestamp?.toDate?.().toISOString() ?? '';
}

export default function AdminReportsScreen() {
  const { user } = useAuthStore();
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      Alert.alert('アクセス権限がありません');
      router.replace('/(tabs)');
      return;
    }
    if (user?.role === 'admin') void loadReports();
  }, [user?.id, user?.role]);

  async function loadReports() {
    setLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'contentReports'), orderBy('createdAt', 'desc')));
      setReports(snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          reporterUid: data['reporterUid'] as string,
          targetType: data['targetType'] as ReportTargetType,
          targetId: data['targetId'] as string,
          targetUid: data['targetUid'] as string | undefined,
          battleId: data['battleId'] as string | undefined,
          contentSnapshot: data['contentSnapshot'] as string | undefined,
          reason: data['reason'] as ReportReason,
          details: data['details'] as string | undefined,
          status: (data['status'] as ReportStatus | undefined) ?? 'pending',
          createdAt: timestampIso(data['createdAt']),
        };
      }));
    } catch {
      Alert.alert('取得できませんでした', '通信状態または管理者権限を確認してください。');
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(reportId: string, status: ReportStatus) {
    if (!user || user.role !== 'admin') return;
    setUpdatingId(reportId);
    try {
      await updateDoc(doc(db, 'contentReports', reportId), {
        status,
        reviewedBy: user.id,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setReports((current) => current.map((item) => item.id === reportId ? { ...item, status } : item));
    } catch {
      Alert.alert('更新できませんでした', '通信状態を確認して、もう一度お試しください。');
    } finally {
      setUpdatingId(null);
    }
  }

  const openCount = reports.filter((item) => item.status === 'pending' || item.status === 'reviewing').length;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button"><Ionicons name="chevron-back" size={22} color={Colors.textSecondary} /></TouchableOpacity>
        <Text style={styles.headerTitle}>通報キュー</Text>
        <TouchableOpacity onPress={() => void loadReports()} accessibilityRole="button" accessibilityLabel="再読み込み"><Ionicons name="refresh" size={20} color={Colors.primary} /></TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={styles.loader} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.summary}>
            <Text style={styles.summaryValue}>{openCount}</Text>
            <View><Text style={styles.summaryTitle}>要対応</Text><Text style={styles.summaryDetail}>未確認・確認中の通報</Text></View>
          </View>
          {reports.length === 0 ? (
            <Text style={styles.empty}>通報はありません</Text>
          ) : reports.map((report) => {
            const reasonLabel = REPORT_REASONS.find((item) => item.value === report.reason)?.label ?? report.reason;
            const isUpdating = updatingId === report.id;
            return (
              <View key={report.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.badges}>
                    <Text style={styles.typeBadge}>{TARGET_LABEL[report.targetType]}</Text>
                    <Text style={[styles.statusBadge, report.status === 'pending' && styles.pendingBadge]}>{STATUS_LABEL[report.status]}</Text>
                  </View>
                  <Text style={styles.date}>{report.createdAt ? new Date(report.createdAt).toLocaleString('ja-JP') : '送信直後'}</Text>
                </View>
                <Text style={styles.reason}>{reasonLabel}</Text>
                {!!report.contentSnapshot && <Text style={styles.snapshot}>「{report.contentSnapshot}」</Text>}
                {!!report.details && <Text style={styles.details}>{report.details}</Text>}
                <Text style={styles.meta}>対象ID: {report.targetId}</Text>
                {!!report.targetUid && <Text style={styles.meta}>対象UID: {report.targetUid}</Text>}
                <Text style={styles.meta}>通報者UID: {report.reporterUid}</Text>
                {isUpdating ? <ActivityIndicator color={Colors.primary} style={styles.updating} /> : (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.reviewButton} onPress={() => void setStatus(report.id, 'reviewing')}><Text style={styles.reviewText}>確認中</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.dismissButton} onPress={() => void setStatus(report.id, 'dismissed')}><Text style={styles.dismissText}>違反なし</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.resolveButton} onPress={() => void setStatus(report.id, 'resolved')}><Text style={styles.resolveText}>対応済み</Text></TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  loader: { flex: 1 },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  scroll: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 44 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, borderRadius: BorderRadius.lg, backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primaryBorder },
  summaryValue: { fontSize: 34, lineHeight: 36, fontWeight: Typography.fontWeight.extrabold, color: Colors.primaryDark },
  summaryTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.primaryDark },
  summaryDetail: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  empty: { textAlign: 'center', color: Colors.textSecondary, paddingVertical: 60 },
  card: { padding: Spacing.lg, borderRadius: BorderRadius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  badges: { flexDirection: 'row', gap: Spacing.xs },
  typeBadge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceGray, color: Colors.textSecondary, fontSize: 10, fontWeight: Typography.fontWeight.bold },
  statusBadge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.full, backgroundColor: Colors.borderLight, color: Colors.textSecondary, fontSize: 10, fontWeight: Typography.fontWeight.bold },
  pendingBadge: { backgroundColor: Colors.accentLight, color: Colors.accentDark },
  date: { flexShrink: 1, textAlign: 'right', fontSize: 9, color: Colors.textTertiary },
  reason: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginTop: Spacing.md },
  snapshot: { fontSize: Typography.fontSize.sm, color: Colors.textPrimary, lineHeight: 20, marginTop: Spacing.sm, padding: Spacing.sm, backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.sm },
  details: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginTop: Spacing.sm },
  meta: { fontSize: 9, color: Colors.textTertiary, marginTop: 3 },
  updating: { marginTop: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  reviewButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm, backgroundColor: Colors.accentLight },
  reviewText: { fontSize: 10, fontWeight: Typography.fontWeight.bold, color: Colors.accentDark },
  dismissButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm, backgroundColor: Colors.surfaceGray },
  dismissText: { fontSize: 10, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
  resolveButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm, backgroundColor: Colors.primary },
  resolveText: { fontSize: 10, fontWeight: Typography.fontWeight.bold, color: Colors.textOnPrimary },
});
