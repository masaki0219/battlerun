import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../design_tokens';
import { remainingLabel, sortedStats, statValue } from '../../utils/displayStats';
import type { Battle, CategoryStats } from '../../types';

export interface ActiveBattleSwitcherItem {
  battle: Battle;
  stats: CategoryStats[];
  myCategoryId?: string | null;
}

interface Props {
  items: ActiveBattleSwitcherItem[];
  selectedBattleId: string | null;
  onSelect: (battleId: string) => void;
}

function battleMeta(item: ActiveBattleSwitcherItem): string {
  const { battle, stats, myCategoryId } = item;
  const remaining = remainingLabel(battle.endAt);
  const ranked = sortedStats(stats, battle.rankingType);
  const mine = ranked.find((stat) => stat.categoryId === myCategoryId);
  const hasDistance = ranked.some((stat) => statValue(stat, battle.rankingType) > 0);
  const myRank = mine && hasDistance
    ? 1 + ranked.filter(
        (stat) => statValue(stat, battle.rankingType) > statValue(mine, battle.rankingType),
      ).length
    : null;

  const parts: string[] = [];
  if (remaining) parts.push(remaining === '終了' ? remaining : `残り${remaining}`);
  parts.push(myRank ? `${myRank}位` : mine ? '順位なし' : '順位集計中');
  return parts.join('・');
}

/** 複数参加時に、閲覧中のチャレンジを切り替えるコンパクトカード列。 */
export function ActiveBattleSwitcher({ items, selectedBattleId, onSelect }: Props) {
  const { width } = useWindowDimensions();
  const availableWidth = width - Spacing.lg * 2;
  const cardWidth = Math.min(192, Math.max(144, (availableWidth - Spacing.sm) / 2));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>参加中のチャレンジ</Text>
        <Text style={styles.count}>{items.length}件</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        nestedScrollEnabled
      >
        {items.map((item, index) => {
          const { battle } = item;
          const selected = battle.id === selectedBattleId;
          const meta = battleMeta(item);
          return (
            <TouchableOpacity
              key={battle.id}
              style={[
                styles.card,
                { width: cardWidth },
                selected && styles.cardSelected,
                index < items.length - 1 && styles.cardSpacing,
              ]}
              activeOpacity={0.82}
              onPress={() => onSelect(battle.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${battle.title}、${meta}${selected ? '、表示中' : ''}`}
              accessibilityHint="このチャレンジの状況に切り替えます"
            >
              <View style={styles.cardTop}>
                <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={1.6}>{battle.title}</Text>
                {selected && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>表示中</Text>
                  </View>
                )}
              </View>
              <Text style={styles.meta}>{meta}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  heading: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  count: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  list: { paddingBottom: 2 },
  card: {
    minHeight: 100,
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadow.sm,
  },
  cardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  cardSpacing: { marginRight: Spacing.sm },
  cardTop: { gap: Spacing.xs },
  title: {
    minHeight: 38,
    fontSize: Typography.fontSize.sm,
    lineHeight: 19,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  selectedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  selectedBadgeText: {
    fontSize: 9,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textOnPrimary,
  },
  meta: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
