import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { BattleRankRows } from './BattleRankRows';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import { sortedStats, remainingLabel, statValue } from '../../utils/displayStats';
import type { Battle, CategoryStats } from '../../types';

interface Props {
  battle: Battle;
  stats: CategoryStats[];
  myCategoryId?: string | null;
  joined: boolean;
  /** 所属シーズン名（あれば残り日数の後ろに併記） */
  seasonTitle?: string;
  expanded: boolean;
  prominentJoin?: boolean;
  onToggleExpand: () => void;
  onPress: () => void;
  onPressJoin: () => void;
}

/** パブリックランの一覧カード。参加導線はヘッダー右のボタンに集約。表示専用。 */
export function PublicBattleCard({
  battle, stats, myCategoryId, joined, seasonTitle, expanded, prominentJoin = false,
  onToggleExpand, onPress, onPressJoin,
}: Props) {
  const remaining = remainingLabel(battle.endAt);
  const sorted = sortedStats(stats, battle.rankingType);
  const mine = sorted.find((s) => s.categoryId === myCategoryId);
  const allZero = sorted.every((item) => statValue(item, battle.rankingType) <= 0);
  const myRank = mine && !allZero
    ? 1 + sorted.filter((item) => statValue(item, battle.rankingType) > statValue(mine, battle.rankingType)).length
    : 0;
  const participantCount = stats.reduce((sum, item) => sum + Math.max(0, item.participantCount), 0);

  const meta = [
    remaining !== null ? `残り ${remaining}` : null,
    `${participantCount}人参加`,
    joined && myRank > 0 ? `${myRank}位 / ${sorted.length}チーム` : null,
    seasonTitle ?? null,
  ].filter(Boolean).join('　・　');

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerText}>
            <Text style={styles.battleTitle} numberOfLines={2}>{battle.title}</Text>
            {meta ? <Text style={styles.battleMeta}>{meta}</Text> : null}
          </View>

          {joined ? (
            <View style={styles.joinedChip}>
              <Text style={styles.joinedChipText}>参加中</Text>
            </View>
          ) : battle.categories.length > 0 ? (
            <TouchableOpacity
              style={[styles.joinBtn, prominentJoin && styles.joinBtnProminent]}
              onPress={onPressJoin}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[styles.joinBtnText, prominentJoin && styles.joinBtnTextProminent]}>参加する</Text>
            </TouchableOpacity>
          ) : null}
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  headerText: { flex: 1 },
  battleTitle: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  battleMeta: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  joinBtn: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  joinBtnText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  joinBtnProminent: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  joinBtnTextProminent: {
    color: Colors.textOnAccent,
  },
  joinedChip: {
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  joinedChipText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
});
