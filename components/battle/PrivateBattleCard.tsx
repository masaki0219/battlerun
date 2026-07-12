import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
}

/** 友達チャレンジの一覧カード（招待コード行つき）。表示専用。 */
export function PrivateBattleCard({
  battle, stats, myCategoryId, expanded, onToggleExpand, onPress, onCopyInvite,
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
              <TouchableOpacity
                style={styles.inviteRow}
                onPress={() => onCopyInvite(battle.inviteCode!)}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
              >
                <Text style={styles.inviteLabel}>招待コード: </Text>
                <Text style={styles.inviteCode}>{battle.inviteCode}</Text>
                <Text style={styles.inviteCopy}>📋</Text>
              </TouchableOpacity>
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
  inviteLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  inviteCode: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.primary, letterSpacing: 2 },
  inviteCopy: { fontSize: Typography.fontSize.sm, marginLeft: Spacing.xs },
  rankBadge: {
    backgroundColor: Colors.accentYellow + '22', borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  rankBadgeText: { fontSize: Typography.fontSize.xs, color: Colors.accentYellow, fontWeight: Typography.fontWeight.semibold },
});
