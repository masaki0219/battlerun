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
import { useTranslation } from '../../lib/i18n';

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
  targetDisplayName,
  onClose,
  onBlocked,
}: Props) {
  const { t } = useTranslation();
  const displayName = targetDisplayName ?? t('safety.defaultUser');
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
      Alert.alert(t('safety.reportAccepted'), t('safety.reportAcceptedBody'));
    } catch {
      Alert.alert(t('safety.reportFailed'), t('safety.retry'));
      setSaving(false);
    }
  }

  function confirmBlock() {
    if (!resolvedTarget.targetUid) return;
    Alert.alert(
      t('safety.blockConfirm', { name: displayName }),
      t('safety.blockBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('safety.block'),
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await blockUser({
                blockerUid: currentUserId,
                blockedUid: resolvedTarget.targetUid!,
                displayName,
              });
              onBlocked?.(resolvedTarget.targetUid!);
              onClose();
              Alert.alert(t('safety.blocked'), t('safety.blockedBody'));
            } catch {
              Alert.alert(t('safety.blockFailed'), t('safety.retry'));
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
              <Text style={styles.title}>{showReasons ? t('safety.reasonTitle') : t('safety.menuTitle')}</Text>
              <Text style={styles.subtitle}>{t('safety.privateAction')}</Text>
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
                    accessibilityRole="radio"
                    accessibilityState={{ checked: reason === item.value, disabled: saving }}
                  >
                    <Text style={[styles.reasonText, reason === item.value && styles.reasonTextActive]}>{t(item.translationKey)}</Text>
                    {reason === item.value && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.detailsInput}
                value={details}
                onChangeText={setDetails}
                placeholder={t('safety.details')}
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
                  : <Text style={styles.submitText}>{t('safety.submit')}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowReasons(false)} disabled={saving} accessibilityRole="button">
                <Text style={styles.cancelText}>{t('common.back')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionButton} onPress={() => setShowReasons(true)} disabled={saving} accessibilityRole="button">
                <View style={[styles.actionIcon, styles.reportIcon]}>
                  <Ionicons name="flag-outline" size={20} color={Colors.error} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>{t('safety.reportContent')}</Text>
                  <Text style={styles.actionDetail}>{t('safety.reportDetail')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
              {canBlock && (
                <TouchableOpacity style={styles.actionButton} onPress={confirmBlock} disabled={saving} accessibilityRole="button">
                  <View style={[styles.actionIcon, styles.blockIcon]}>
                    <Ionicons name="person-remove-outline" size={20} color={Colors.textPrimary} />
                  </View>
                  <View style={styles.actionCopy}>
                    <Text style={styles.actionTitle}>{t('safety.blockName', { name: displayName })}</Text>
                    <Text style={styles.actionDetail}>{t('safety.blockDetail')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={saving} accessibilityRole="button">
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
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
