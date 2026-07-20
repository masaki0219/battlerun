import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { BattleRankRows } from './BattleRankRows';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import { sortedStats } from '../../utils/displayStats';
import type { Battle, CategoryStats } from '../../types';

interface Props {
  battle: Battle;
  stats: CategoryStats[];
  myCategoryId?: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onPress: () => void;
  /** 招待コードのコピー（Clipboard 書き込み・トーストは親で実施） */
  onCopyInvite: (code: string) => void;
  /** 招待リンクをOSの共有シートで送る */
  onShareInvite: (battle: Battle) => void;
}

/** 友達チャレンジの一覧カード（招待コード行つき）。表示専用。 */
export function PrivateBattleCard({
  battle, stats, myCategoryId, expanded, onToggleExpand, onPress, onCopyInvite, onShareInvite,
}: Props) {
  const sorted = sortedStats(stats, battle.rankingType);
  const myRank = sorted.findIndex((s) => s.categoryId === myCategoryId) + 1;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.battleTitle}>{battle.title}</Text>
            {battle.inviteCode && (
              <View style={styles.inviteActions}>
                <TouchableOpacity
                  style={styles.inviteRow}
                  onPress={(event) => {
                    event.stopPropagation();
                    onCopyInvite(battle.inviteCode!);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`招待コード ${battle.inviteCode} をコピー`}
                >
                  <Text style={styles.inviteLabel}>招待コード: </Text>
                  <Text style={styles.inviteCode}>{battle.inviteCode}</Text>
                  <Ionicons name="copy-outline" size={14} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={(event) => {
                    event.stopPropagation();
                    onShareInvite(battle);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="チャレンジの招待リンクを共有"
                >
                  <Ionicons name="share-outline" size={14} color={Colors.primaryDark} />
                  <Text style={styles.shareText}>招待</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {myRank > 0 && (
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeText}>{myRank === 1 ? '👑 1位' : `${myRank}位`}</Text>
            </View>
          )}
        </View>

        <BattleRankRows
          battle={battle}
          sorted={sorted}
          myCatId={myCategoryId}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
        />
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // 画面側が左右パディングを持つので Card のデフォルト marginHorizontal は打ち消す
  card: { marginBottom: 0, marginHorizontal: 0 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  battleTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  inviteRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs },
  inviteActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  inviteLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  inviteCode: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.primary, letterSpacing: 2 },
  shareButton: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: BorderRadius.full, backgroundColor: Colors.primaryLight,
  },
  shareText: { fontSize: Typography.fontSize.xs, fontWeight: '700', color: Colors.primaryDark },
  rankBadge: {
    backgroundColor: Colors.accentYellow + '22', borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  rankBadgeText: { fontSize: Typography.fontSize.xs, color: Colors.accentYellow, fontWeight: Typography.fontWeight.semibold },
});
