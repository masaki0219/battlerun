import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { BorderRadius, Colors, Shadow, Spacing, Typography } from '../../design_tokens';
import type { RunningPresence } from '../../types';

export function RunningPresenceCard({
  presences,
  currentUserId,
  onCheer,
}: {
  presences: RunningPresence[];
  currentUserId: string;
  onCheer: (presence: RunningPresence) => Promise<void>;
}) {
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  if (presences.length === 0) return null;

  async function cheer(presence: RunningPresence) {
    const key = `${presence.uid}:${presence.sessionId}`;
    setSendingKey(key);
    try {
      await onCheer(presence);
    } finally {
      setSendingKey(null);
    }
  }

  return (
    <View>
      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionTitle}>いま走っている仲間</Text>
          <Text style={styles.sectionSubtitle}>{presences.length}人が走っています</Text>
        </View>
        <View style={styles.liveChip}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>
      <View style={styles.card}>
        {presences.map((presence, index) => {
          const own = presence.uid === currentUserId;
          const key = `${presence.uid}:${presence.sessionId}`;
          return (
            <View key={key} style={[styles.row, index > 0 && styles.divider]}>
              <Avatar name={presence.displayName} emoji={presence.avatarEmoji} size="sm" />
              <View style={styles.copy}>
                <Text style={styles.name} numberOfLines={1}>{own ? 'あなた' : presence.displayName}</Text>
                <Text style={styles.state}>ラン中</Text>
              </View>
              {!own && (
                <TouchableOpacity
                  style={[styles.cheerButton, presence.cheeredByMe && styles.cheeredButton]}
                  onPress={() => void cheer(presence)}
                  disabled={presence.cheeredByMe || sendingKey === key}
                  accessibilityRole="button"
                  accessibilityLabel={`${presence.displayName}さんへ応援を送る`}
                  accessibilityState={{ disabled: presence.cheeredByMe || sendingKey === key }}
                >
                  {sendingKey === key
                    ? <ActivityIndicator size="small" color={Colors.accentDark} />
                    : (
                      <>
                        <Ionicons name="flame" size={14} color={presence.cheeredByMe ? Colors.textTertiary : Colors.accentDark} />
                        <Text style={[styles.cheerText, presence.cheeredByMe && styles.cheeredText]}>
                          {presence.cheeredByMe ? '応援済み' : '応援'}
                        </Text>
                      </>
                    )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        <View style={styles.privacyRow}>
          <Ionicons name="shield-checkmark-outline" size={13} color={Colors.textTertiary} />
          <Text style={styles.privacyText}>位置・距離・ペースは共有されません</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  sectionTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  sectionSubtitle: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  liveChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: BorderRadius.full, backgroundColor: Colors.primaryLight },
  liveDot: { width: 7, height: 7, borderRadius: BorderRadius.full, backgroundColor: Colors.primary },
  liveText: { fontSize: 9, fontWeight: Typography.fontWeight.extrabold, color: Colors.primaryDark, letterSpacing: 0.7 },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, ...Shadow.sm },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  state: { fontSize: Typography.fontSize.xs, color: Colors.primaryDark, marginTop: 2, fontWeight: Typography.fontWeight.medium },
  cheerButton: { minWidth: 72, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10, borderRadius: BorderRadius.full, backgroundColor: Colors.accentLight },
  cheeredButton: { backgroundColor: Colors.surfaceGray },
  cheerText: { fontSize: 10, fontWeight: Typography.fontWeight.bold, color: Colors.accentDark },
  cheeredText: { color: Colors.textTertiary },
  privacyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingVertical: Spacing.sm },
  privacyText: { fontSize: 9, color: Colors.textTertiary },
});
