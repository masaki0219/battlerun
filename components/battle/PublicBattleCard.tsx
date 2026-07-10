import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { BattleRankRows } from './BattleRankRows';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import { sortedStats, daysLeft } from '../../utils/displayStats';
import type { Battle, CategoryStats } from '../../types';

interface Props {
  battle: Battle;
  stats: CategoryStats[];
  myCategoryId?: string | null;
  joined: boolean;
  /** 所属シーズン名（あれば残り日数の後ろに併記） */
  seasonTitle?: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onPress: () => void;
  onPressJoin: () => void;
}

/** パブリックランの一覧カード。表示専用。 */
export function PublicBattleCard({
  battle, stats, myCategoryId, joined, seasonTitle, expanded, onToggleExpand, onPress, onPressJoin,
}: Props) {
  const days = daysLeft(battle.endAt);
  const sorted = sortedStats(stats, battle.rankingType);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.battleTitle}>{battle.title}</Text>
            <Text style={styles.battleMeta}>
              {days !== null ? `残り ${days} 日` : ''}
              {seasonTitle ? `　${seasonTitle}` : ''}
            </Text>
          </View>
          {joined && (
            <View style={styles.joinedBadge}>
              <Text style={styles.joinedBadgeText}>参加中</Text>
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

        {!joined && battle.categories.length > 0 && (
          <View style={styles.joinSection}>
            <Button
              label="区分を選んで参加"
              onPress={onPressJoin}
              size="sm"
              variant="secondary"
            />
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 0 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  battleTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  battleMeta: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  joinedBadge: {
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  joinedBadgeText: { fontSize: Typography.fontSize.xs, color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  joinSection: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md, alignItems: 'flex-start' },
});
