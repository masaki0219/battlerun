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
  /** 人数が最も少ないチーム（援軍募集の訴求に使う。なければ非表示） */
  shortageCategory: Category | null;
  onPress: () => void;
}

/** Day-0 アクティベーション用の「開催中の作戦に参加しよう」カード。表示専用。 */
export function JoinRecommendationCard({ battle, stats, shortageCategory, onPress }: Props) {
  const sorted = sortedStats(stats, battle.rankingType);
  const top = sorted[0];
  const second = sorted[1];
  const hasVs = !!top && !!second;
  const totalParticipants = stats.reduce((sum, stat) => sum + stat.participantCount, 0);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      <Card variant="brand" style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="location" size={16} color={Colors.primary} />
          <Text style={styles.headerText}>開催中のチャレンジに参加しよう</Text>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{battle.title}</Text>
          {shortageCategory && (
            <View style={styles.shortageBadge}>
              <Text style={styles.shortageText}>仲間募集中</Text>
            </View>
          )}
        </View>

        {shortageCategory && (
          <Text style={styles.shortageHint} numberOfLines={1}>
            {totalParticipants <= 2
              ? `「${shortageCategory.label}」の最初のメンバーになろう`
              : `「${shortageCategory.label}」は人数が少なく、いま入ると効きやすい`}
          </Text>
        )}

        {hasVs && (
          <View style={styles.gauge}>
            <VersusGauge
              left={{ label: top.label, km: statValue(top, battle.rankingType), isMine: false }}
              right={{ label: second.label, km: statValue(second, battle.rankingType), isMine: false }}
              size="md"
              unit={battle.rankingType === 'average' ? 'km/人' : 'km'}
            />
          </View>
        )}

        <View style={styles.cta}>
          <Text style={styles.ctaText}>チームを選んで参加する</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textOnPrimary} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // 画面側が左右パディングを持つので Card のデフォルト marginHorizontal は打ち消す
  card: { marginBottom: 0, marginHorizontal: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  headerText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  title: {
    flex: 1,
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  // 不足陣営は「オレンジ＝競争の熱」で拾う
  shortageBadge: {
    backgroundColor: Colors.accentLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  shortageText: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.accentDark,
    letterSpacing: 0.4,
  },
  shortageHint: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  gauge: { marginTop: Spacing.lg },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  ctaText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textOnPrimary,
  },
});
