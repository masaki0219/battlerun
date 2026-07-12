import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Colors, Typography, Spacing, BorderRadius } from '../../design_tokens';
import type { TeamRanking } from '../../hooks/useTeamRanking';

interface Props {
  ranking: TeamRanking;
  /** 「Top10を見る」の遷移先（バトル詳細） */
  onPressMore?: () => void;
}

/**
 * 自分の陣営内でのメンバーランキング（上位3名＋自分の行）。表示専用。
 * 自分が上位に入っている場合は、その行をハイライトして重複表示しない。
 */
export function TeamRankingCard({ ranking, onPressMore }: Props) {
  const { top, myRank, teamSize, myKm } = ranking;
  if (top.length === 0) return null;

  const meInTop = top.some((m) => m.isMe);

  return (
    <Card style={styles.card} padding={Spacing.md}>
      {top.map((m) => (
        <View key={m.userId} style={[styles.row, m.isMe && styles.rowMe]}>
          <Text style={[styles.rank, m.isMe && styles.textMe]}>{m.rank ?? '—'}</Text>
          <View style={[styles.avatar, m.isMe && styles.avatarMe]}>
            <Text style={[styles.avatarText, m.isMe && styles.avatarTextMe]}>
              {m.displayName.slice(0, 1)}
            </Text>
          </View>
          <Text style={[styles.name, m.isMe && styles.textMe]} numberOfLines={1}>
            {m.isMe ? 'あなた' : m.displayName}
          </Text>
          <Text style={[styles.km, m.isMe && styles.textMe]}>{m.totalDistanceKm.toFixed(1)} km</Text>
        </View>
      ))}

      {/* 自分が上位に入っていないときだけ、自分の行を下に足す */}
      {!meInTop && myRank > 0 && (
        <>
          <View style={styles.divider} />
          <View style={[styles.row, styles.rowMe]}>
            <Text style={[styles.rank, styles.textMe]}>{myRank}</Text>
            <View style={[styles.avatar, styles.avatarMe]}>
              <Text style={[styles.avatarText, styles.avatarTextMe]}>あ</Text>
            </View>
            <Text style={[styles.name, styles.textMe]}>あなた</Text>
            <Text style={[styles.km, styles.textMe]}>{myKm.toFixed(1)} km</Text>
          </View>
        </>
      )}

      {onPressMore && (
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={onPressMore}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`陣営${teamSize}人のランキングを見る`}
        >
          <Text style={styles.moreText}>
            陣営 {teamSize}人 のランキングを見る
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
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMe: { backgroundColor: Colors.primary },
  avatarText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
  avatarTextMe: { color: Colors.textOnPrimary },
  name: {
    flex: 1,
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
