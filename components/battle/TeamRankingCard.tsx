import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import type { TeamRanking } from '../../hooks/useTeamRanking';
import type { ProcessContribution } from '../../utils/processContributions';
import { useTranslation } from '../../lib/i18n';

interface Props {
  ranking: TeamRanking;
  contributions?: Record<string, ProcessContribution>;
  currentUserId?: string;
  /** 「Top10を見る」の遷移先（バトル詳細） */
  onPressMore?: () => void;
  blockedUserIds?: ReadonlySet<string>;
  /** チャレンジ内で一貫して使う所属チーム色 */
  teamColor?: string;
}

/**
 * 自分の陣営内でのメンバーランキング（上位3名＋自分の行）。表示専用。
 * 自分が上位に入っている場合は、その行をハイライトして重複表示しない。
 */
export function TeamRankingCard({ ranking, contributions = {}, currentUserId, onPressMore, blockedUserIds, teamColor }: Props) {
  const { t } = useTranslation();
  if (ranking.error) {
    return (
      <Card style={styles.card} padding={Spacing.md}>
        <View style={styles.errorRow} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={18} color={Colors.error} />
          <Text style={styles.errorText}>{t('battle.rankingLoadFailed')}</Text>
          <TouchableOpacity
            onPress={ranking.retry}
            accessibilityRole="button"
            accessibilityLabel={t('battle.retryRankingA11y')}
          >
            <Text style={styles.errorRetry}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  }
  const { myRank, teamSize, myKm } = ranking;
  const top = ranking.top.filter((member) => member.isMe || !blockedUserIds?.has(member.userId));
  if (top.length === 0) return null;

  const meInTop = top.some((m) => m.isMe);
  const visibleUserIds = [...top.map((member) => member.userId), ...(!meInTop && currentUserId ? [currentUserId] : [])];
  const hasVisibleContribution = visibleUserIds.some((userId) => {
    const contribution = contributions[userId];
    return (contribution?.declarationsDone ?? 0) > 0 || (contribution?.activeDaysThisWeek ?? 0) > 0;
  });

  const processBadges = (userId: string) => {
    const contribution = contributions[userId];
    if (!contribution) return null;
    const declarationsDone = Math.max(0, Math.floor(contribution.declarationsDone));
    const activeDays = Math.max(0, Math.floor(contribution.activeDaysThisWeek));
    if (declarationsDone === 0 && activeDays === 0) return null;
    return (
      <View style={styles.processRow}>
        {declarationsDone > 0 && (
          <View style={[styles.processBadge, styles.declarationBadge]}>
            <Text style={styles.processEmoji}>🔥</Text>
            <Text style={[styles.processText, styles.declarationText]}>{t('battle.completedDeclarations', { count: declarationsDone })}</Text>
          </View>
        )}
        {activeDays > 0 && (
          <View style={[styles.processBadge, styles.activeDaysBadge]}>
            <Ionicons name="calendar-clear-outline" size={10} color={Colors.primary} />
            <Text style={[styles.processText, styles.activeDaysText]}>{t('battle.activeDaysThisWeek', { count: activeDays })}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Card
      style={[styles.card, teamColor ? { borderLeftWidth: 4, borderLeftColor: teamColor } : null]}
      padding={Spacing.md}
    >
      {top.map((m) => (
        <View key={m.userId} style={[styles.row, m.isMe && styles.rowMe]}>
          <Text style={[styles.rank, m.isMe && styles.textMe]}>{m.rank ?? '—'}</Text>
          <Avatar name={m.displayName} emoji={m.avatarEmoji} size="xs" />
          <View style={styles.nameColumn}>
            <Text style={[styles.name, m.isMe && styles.textMe]} numberOfLines={1}>
              {m.isMe ? t('common.you') : m.displayName}
            </Text>
            {processBadges(m.userId)}
          </View>
          <Text style={[styles.km, m.isMe && styles.textMe]}>{m.totalDistanceKm.toFixed(1)} km</Text>
        </View>
      ))}

      {/* 自分が上位に入っていないときだけ、自分の行を下に足す */}
      {!meInTop && myRank > 0 && (
        <>
          <View style={styles.divider} />
          <View style={[styles.row, styles.rowMe]}>
            <Text style={[styles.rank, styles.textMe]}>{myRank}</Text>
            <Avatar name={t('common.you')} emoji={ranking.myAvatarEmoji} size="xs" />
            <View style={styles.nameColumn}>
              <Text style={[styles.name, styles.textMe]}>{t('common.you')}</Text>
              {currentUserId ? processBadges(currentUserId) : null}
            </View>
            <Text style={[styles.km, styles.textMe]}>{myKm.toFixed(1)} km</Text>
          </View>
        </>
      )}

      {hasVisibleContribution && (
        <Text style={styles.processNote}>{t('battle.contributionNote')}</Text>
      )}

      {onPressMore && (
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={onPressMore}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('battle.teamRankingA11y', { count: teamSize })}
        >
          <Text style={styles.moreText}>
            {t('battle.viewTeamRanking', { count: teamSize })}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
        </TouchableOpacity>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  // 画面側が左右パディングを持つので Card のデフォルト marginHorizontal は打ち消す
  card: { marginBottom: 0, marginHorizontal: 0 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  errorText: { flex: 1, fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  errorRetry: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.primaryDark },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  rowMe: {
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
  },
  rank: {
    width: 20,
    textAlign: 'center',
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  nameColumn: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textPrimary,
  },
  km: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  textMe: { color: Colors.primary, fontWeight: Typography.fontWeight.bold },
  processRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  processBadge: {
    minHeight: 20,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  declarationBadge: { backgroundColor: Colors.accentLight },
  activeDaysBadge: { backgroundColor: Colors.primaryLight },
  processEmoji: { fontSize: 10 },
  processText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  declarationText: { color: Colors.accentText },
  activeDaysText: { color: Colors.primary },
  processNote: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: Spacing.xs,
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  moreText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
});
