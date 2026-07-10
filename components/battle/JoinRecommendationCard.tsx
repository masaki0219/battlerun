import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { VersusGauge } from '../viz/VersusGauge';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import { sortedStats, statValue } from '../../utils/displayStats';
import type { Battle, CategoryStats, Category } from '../../types';

interface Props {
  battle: Battle;
  stats: CategoryStats[];
  /** 人数が最も少ない区分（援軍募集の訴求に使う。なければ非表示） */
  shortageCategory: Category | null;
  onPress: () => void;
}

/** Day-0 アクティベーション用の「開催中の作戦に参加しよう」カード。表示専用。 */
export function JoinRecommendationCard({ battle, stats, shortageCategory, onPress }: Props) {
  const sorted = sortedStats(stats, battle.rankingType);
  const top = sorted[0];
  const second = sorted[1];
  const hasVs = !!top && !!second;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      <Card variant="highlight" style={styles.card}>
        <View style={styles.recommendHeader}>
          <Ionicons name="flash" size={16} color={Colors.accent} />
          <Text style={styles.recommendHeaderText}>開催中の作戦に参加しよう</Text>
        </View>
        <Text style={styles.recommendTitle} numberOfLines={1}>{battle.title}</Text>
        {hasVs && (
          <View style={{ marginTop: Spacing.md }}>
            <VersusGauge
              left={{ label: top.label, km: statValue(top, battle.rankingType), isMine: false }}
              right={{ label: second.label, km: statValue(second, battle.rankingType), isMine: false }}
              size="md"
            />
          </View>
        )}
        {shortageCategory && (
          <View style={styles.recommendShortageRow}>
            <Text style={styles.recommendShortageText}>
              「{shortageCategory.label}」は援軍募集中！
            </Text>
          </View>
        )}
        <View style={styles.recommendCta}>
          <Text style={styles.recommendCtaText}>区分を選んで参加する</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.accent} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 0 },
  recommendHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  recommendHeaderText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.accentDark },
  recommendTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, marginTop: Spacing.xs },
  recommendShortageRow: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginTop: Spacing.md,
  },
  recommendShortageText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.accent },
  recommendCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  recommendCtaText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.accent },
});
