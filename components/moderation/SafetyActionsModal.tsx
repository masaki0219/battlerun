import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionColors, BorderRadius, Colors, Shadow, Spacing, Typography } from '../../design_tokens';
import {
  blockUser,
  REPORT_REASONS,
  submitContentReport,
  type ReportReason,
  type ReportTarget,
} from '../../lib/moderation';

interface Props {
  visible: boolean;
  currentUserId: string;
  target: ReportTarget | null;
  targetDisplayName?: string;
  onClose: () => void;
  onBlocked?: (uid: string) => void;
}

export function SafetyActionsModal({
  visible,
  currentUserId,
  target,
  targetDisplayName = 'このユーザー',
  onClose,
  onBlocked,
}: Props) {
  const [showReasons, setShowReasons] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowReasons(false);
      setReason(null);
      setDetails('');
      setSaving(false);
    }
  }, [visible]);

  if (!target) return null;
  const resolvedTarget = target;
  const canBlock = !!resolvedTarget.targetUid && resolvedTarget.targetUid !== currentUserId;

  async function report() {
    if (!reason) return;
    setSaving(true);
    try {
      await submitContentReport({ reporterUid: currentUserId, target: resolvedTarget, reason, details });
      onClose();
      Alert.alert('通報を受け付けました', '運営が内容を確認し、必要な対応を行います。');
    } catch {
      Alert.alert('通報できませんでした', '通信状態を確認して、もう一度お試しください。');
      setSaving(false);
    }
  }

  function confirmBlock() {
    if (!resolvedTarget.targetUid) return;
    Alert.alert(
      `${targetDisplayName}をブロックしますか？`,
      '相手の宣言・走行中表示・ランキング・公開記録を表示せず、相互の応援やリアクションも停止します。相手には通知されません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'ブロックする',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await blockUser({
                blockerUid: currentUserId,
                blockedUid: resolvedTarget.targetUid!,
                displayName: targetDisplayName,
              });
              onBlocked?.(resolvedTarget.targetUid!);
              onClose();
              Alert.alert('ブロックしました', 'プロフィールの「ブロック中のユーザー」から解除できます。');
            } catch {
              Alert.alert('ブロックできませんでした', '通信状態を確認して、もう一度お試しください。');
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={saving ? undefined : onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View style={styles.shieldIcon}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primaryDark} />
            </View>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>{showReasons ? '通報する理由' : '安全メニュー'}</Text>
              <Text style={styles.subtitle}>通報者やブロックしたことは相手に表示されません</Text>
            </View>
          </View>

          {showReasons ? (
            <>
              <View style={styles.reasonGrid}>
                {REPORT_REASONS.map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={[styles.reasonButton, reason === item.value && styles.reasonButtonActive]}
                    onPress={() => setReason(item.value)}
                    disabled={saving}
                  >
                    <Text style={[styles.reasonText, reason === item.value && styles.reasonTextActive]}>{item.label}</Text>
                    {reason === item.value && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.detailsInput}
                value={details}
                onChangeText={setDetails}
                placeholder="補足（任意・300文字まで）"
                placeholderTextColor={Colors.textTertiary}
                multiline
                maxLength={300}
                editable={!saving}
              />
              <TouchableOpacity
                style={[styles.submitButton, !reason && styles.disabledButton]}
                onPress={() => void report()}
                disabled={!reason || saving}
                accessibilityRole="button"
              >
                {saving
                  ? <ActivityIndicator color={Colors.textOnPrimary} />
                  : <Text style={styles.submitText}>運営へ送信</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowReasons(false)} disabled={saving}>
                <Text style={styles.cancelText}>戻る</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionButton} onPress={() => setShowReasons(true)} disabled={saving}>
                <View style={[styles.actionIcon, styles.reportIcon]}>
                  <Ionicons name="flag-outline" size={20} color={Colors.error} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>この内容を通報</Text>
                  <Text style={styles.actionDetail}>運営が確認し、規約に基づいて対応します</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
              {canBlock && (
                <TouchableOpacity style={styles.actionButton} onPress={confirmBlock} disabled={saving}>
                  <View style={[styles.actionIcon, styles.blockIcon]}>
                    <Ionicons name="person-remove-outline" size={20} color={Colors.textPrimary} />
                  </View>
                  <View style={styles.actionCopy}>
                    <Text style={styles.actionTitle}>{targetDisplayName}をブロック</Text>
                    <Text style={styles.actionDetail}>相手の投稿を非表示にし、相互の反応を止めます</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={saving}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16, 24, 20, 0.42)' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, paddingBottom: 34, ...Shadow.lg },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.lg },
  titleRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center', marginBottom: Spacing.lg },
  shieldIcon: { width: 42, height: 42, borderRadius: BorderRadius.full, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  titleCopy: { flex: 1 },
  title: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 3 },
  actions: { gap: Spacing.sm },
  actionButton: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceGray, borderWidth: 1, borderColor: Colors.border },
  actionIcon: { width: 38, height: 38, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center' },
  reportIcon: { backgroundColor: Colors.error + '12' },
  blockIcon: { backgroundColor: Colors.borderLight },
  actionCopy: { flex: 1 },
  actionTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  actionDetail: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 3 },
  reasonGrid: { gap: 7 },
  reasonButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm, backgroundColor: Colors.surfaceGray, borderWidth: 1, borderColor: Colors.border },
  reasonButtonActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  reasonText: { fontSize: Typography.fontSize.sm, color: Colors.textPrimary },
  reasonTextActive: { color: Colors.primaryDark, fontWeight: Typography.fontWeight.bold },
  detailsInput: { height: 74, marginTop: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.sm, backgroundColor: Colors.surfaceGray, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, textAlignVertical: 'top', fontSize: Typography.fontSize.sm },
  submitButton: { minHeight: 48, marginTop: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: ActionColors.background, alignItems: 'center', justifyContent: 'center' },
  disabledButton: { opacity: 0.4 },
  submitText: { color: ActionColors.foreground, fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold },
  cancelButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
  cancelText: { color: Colors.textSecondary, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium },
});
