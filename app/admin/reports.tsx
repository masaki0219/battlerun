import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { REPORT_REASONS, type ReportReason, type ReportStatus, type ReportTargetType } from '../../lib/moderation';
import { useAuthStore } from '../../stores/authStore';
import { ActionColors, BorderRadius, Colors, Shadow, Spacing, Typography } from '../../design_tokens';
import { useTranslation } from '../../lib/i18n';

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
  pending: 'admin.status.pending', reviewing: 'admin.status.reviewing', resolved: 'admin.status.resolved', dismissed: 'admin.status.dismissed',
};
const TARGET_LABEL: Record<ReportTargetType, string> = {
  user: 'admin.target.user', battle: 'admin.target.battle', declaration: 'admin.target.declaration', presence: 'admin.target.presence', activity: 'admin.target.activity',
};

function timestampIso(value: unknown): string {
  const timestamp = value as { toDate?: () => Date } | undefined;
  return timestamp?.toDate?.().toISOString() ?? '';
}

export default function AdminReportsScreen() {
  const { language, t } = useTranslation();
  const { user } = useAuthStore();
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      Alert.alert(t('admin.noAccess'));
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
      Alert.alert(t('admin.fetchReportsFailed'), t('admin.fetchReportsBody'));
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
      Alert.alert(t('admin.updateFailed'), t('safety.retry'));
    } finally {
      setUpdatingId(null);
    }
  }

  const openCount = reports.filter((item) => item.status === 'pending' || item.status === 'reviewing').length;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button"><Ionicons name="chevron-back" size={22} color={Colors.textSecondary} /></TouchableOpacity>
        <Text style={styles.headerTitle}>{t('admin.reportsTitle')}</Text>
        <TouchableOpacity onPress={() => void loadReports()} accessibilityRole="button" accessibilityLabel={t('admin.reload')}><Ionicons name="refresh" size={20} color={Colors.primary} /></TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={styles.loader} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.summary}>
            <Text style={styles.summaryValue}>{openCount}</Text>
            <View><Text style={styles.summaryTitle}>{t('admin.needsAction')}</Text><Text style={styles.summaryDetail}>{t('admin.openReports')}</Text></View>
          </View>
          {reports.length === 0 ? (
            <Text style={styles.empty}>{t('admin.noReports')}</Text>
          ) : reports.map((report) => {
            const reasonKey = REPORT_REASONS.find((item) => item.value === report.reason)?.translationKey;
            const reasonLabel = reasonKey ? t(reasonKey) : report.reason;
            const isUpdating = updatingId === report.id;
            return (
              <View key={report.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.badges}>
                    <Text style={styles.typeBadge}>{t(TARGET_LABEL[report.targetType])}</Text>
                    <Text style={[styles.statusBadge, report.status === 'pending' && styles.pendingBadge]}>{t(STATUS_LABEL[report.status])}</Text>
                  </View>
                  <Text style={styles.date}>{report.createdAt ? new Date(report.createdAt).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US') : t('admin.sentNow')}</Text>
                </View>
                <Text style={styles.reason}>{reasonLabel}</Text>
                {!!report.contentSnapshot && <Text style={styles.snapshot}>「{report.contentSnapshot}」</Text>}
                {!!report.details && <Text style={styles.details}>{report.details}</Text>}
                <Text style={styles.meta}>{t('admin.targetId', { id: report.targetId })}</Text>
                {!!report.targetUid && <Text style={styles.meta}>{t('admin.targetUid', { id: report.targetUid })}</Text>}
                <Text style={styles.meta}>{t('admin.reporterUid', { id: report.reporterUid })}</Text>
                {isUpdating ? <ActivityIndicator color={Colors.primary} style={styles.updating} /> : (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.reviewButton} onPress={() => void setStatus(report.id, 'reviewing')}><Text style={styles.reviewText}>{t('admin.status.reviewing')}</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.dismissButton} onPress={() => void setStatus(report.id, 'dismissed')}><Text style={styles.dismissText}>{t('admin.status.dismissed')}</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.resolveButton} onPress={() => void setStatus(report.id, 'resolved')}><Text style={styles.resolveText}>{t('admin.status.resolved')}</Text></TouchableOpacity>
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
  pendingBadge: { backgroundColor: Colors.accentLight, color: Colors.accentText },
  date: { flexShrink: 1, textAlign: 'right', fontSize: 9, color: Colors.textTertiary },
  reason: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginTop: Spacing.md },
  snapshot: { fontSize: Typography.fontSize.sm, color: Colors.textPrimary, lineHeight: 20, marginTop: Spacing.sm, padding: Spacing.sm, backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.sm },
  details: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginTop: Spacing.sm },
  meta: { fontSize: 9, color: Colors.textTertiary, marginTop: 3 },
  updating: { marginTop: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  reviewButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm, backgroundColor: Colors.accentLight },
  reviewText: { fontSize: 10, fontWeight: Typography.fontWeight.bold, color: Colors.accentText },
  dismissButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm, backgroundColor: Colors.surfaceGray },
  dismissText: { fontSize: 10, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
  resolveButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm, backgroundColor: ActionColors.background },
  resolveText: { fontSize: 10, fontWeight: Typography.fontWeight.bold, color: ActionColors.foreground },
});
