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
import { useTranslation } from '../../lib/i18n';
import type { AppLanguage } from '../../lib/language';
import type { TranslateOptions } from '../../lib/translate';

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

function battleMeta(
  item: ActiveBattleSwitcherItem,
  language: AppLanguage,
  t: (scope: string, options?: TranslateOptions) => string,
): string {
  const { battle, stats, myCategoryId } = item;
  const remaining = remainingLabel(battle.endAt, new Date(), language);
  const ranked = sortedStats(stats, battle.rankingType);
  const mine = ranked.find((stat) => stat.categoryId === myCategoryId);
  const hasDistance = ranked.some((stat) => statValue(stat, battle.rankingType) > 0);
  const myRank = mine && hasDistance
    ? 1 + ranked.filter(
        (stat) => statValue(stat, battle.rankingType) > statValue(mine, battle.rankingType),
      ).length
    : null;

  const parts: string[] = [];
  if (remaining) parts.push(remaining === t('common.ended') ? remaining : t('battle.remaining', { value: remaining }));
  parts.push(myRank ? t('common.rank', { rank: myRank }) : mine ? t('battle.noRank') : t('battle.rankingPending'));
  return parts.join('・');
}

/** 複数参加時に、閲覧中のチャレンジを切り替えるコンパクトカード列。 */
export function ActiveBattleSwitcher({ items, selectedBattleId, onSelect }: Props) {
  const { language, t } = useTranslation();
  const { width, fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.6;
  const availableWidth = width - Spacing.lg * 2;
  const cardWidth = largeText
    ? Math.min(300, availableWidth * 0.84)
    : Math.min(192, Math.max(144, (availableWidth - Spacing.sm) / 2));

  return (
    <View style={styles.container}>
      <View style={[styles.header, largeText && styles.headerLargeText]}>
        <Text style={styles.heading}>{t('battle.activeChallenges')}</Text>
        <Text style={styles.count}>{t('common.items', { count: items.length })}</Text>
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
          const meta = battleMeta(item, language, t);
          return (
            <TouchableOpacity
              key={battle.id}
              style={[
                styles.card,
                { width: cardWidth },
                largeText && styles.cardLargeText,
                selected && styles.cardSelected,
                index < items.length - 1 && styles.cardSpacing,
              ]}
              activeOpacity={0.82}
              onPress={() => onSelect(battle.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t('battle.switchA11y', {
                title: battle.title,
                meta,
                selected: selected ? `, ${t('battle.selected')}` : '',
              })}
              accessibilityHint={t('battle.switchHint')}
            >
              <View style={styles.cardTop}>
                <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={1.6}>{battle.title}</Text>
                {selected && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>{t('battle.selected')}</Text>
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
  headerLargeText: { flexDirection: 'column', alignItems: 'flex-start', gap: Spacing.xs },
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
  cardLargeText: { minHeight: 132 },
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
