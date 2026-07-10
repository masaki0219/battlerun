import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RankChip } from '../ui/RankChip';
import { StatBlock } from '../ui/StatBlock';
import { VersusGauge } from '../viz/VersusGauge';
import { ProgressRing } from '../viz/ProgressRing';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../design_tokens';
import { sortedStats, statValue, daysLeft, dailyPaceToOvertake, contributionShare } from '../../utils/displayStats';
import type { Battle, CategoryStats } from '../../types';

interface Props {
  battle: Battle;
  stats: CategoryStats[];
  myCategoryId?: string | null;
  /** 自分のこのバトルでの累計距離 */
  myDist: number;
  /** 参加中バトル総数（>1 で「他N件」バッジ表示） */
  activeBattleCount: number;
  onPress: () => void;
}

/** 参加中バトルのハイライトカード（VSゲージ・逆転ペース・貢献リング）。表示専用。 */
export function ActiveBattleHero({ battle, stats, myCategoryId, myDist, activeBattleCount, onPress }: Props) {
  const rt = battle.rankingType;
  const sorted = sortedStats(stats, rt);
  const myIndex = sorted.findIndex((s) => s.categoryId === myCategoryId);
  const myRank = myIndex + 1;
  const totalTeams = sorted.length;
  const days = daysLeft(battle.endAt);

  const myStat = myIndex >= 0 ? sorted[myIndex] : undefined;
  const rivalStat = myIndex > 0 ? sorted[myIndex - 1] : myIndex === 0 ? sorted[1] : undefined;
  const hasVersus = !!myStat && !!rivalStat;
  const bothZero = hasVersus && statValue(myStat!, rt) <= 0 && statValue(rivalStat!, rt) <= 0;
  const leading = myIndex === 0;

  const pace = hasVersus
    ? dailyPaceToOvertake({
        myTeamKm: statValue(myStat!, rt),
        rivalTeamKm: statValue(rivalStat!, rt),
        endAt: battle.endAt,
        isLeading: leading,
      })
    : null;
  const share = myStat ? contributionShare(myDist, myStat.totalDistanceKm) : 0;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      <View style={styles.heroCard}>
        {/* ヘッダー */}
        <View style={styles.acHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.acTitle} numberOfLines={1}>{battle.title}</Text>
            {days !== null && <Text style={styles.acDays}>残り {days} 日</Text>}
          </View>
          {myRank > 0 && <RankChip rank={myRank} total={totalTeams} totalUnit="陣営" />}
        </View>

        {hasVersus ? (
          <>
            <VersusGauge
              left={{ label: myStat!.label, km: statValue(myStat!, rt), isMine: true }}
              right={{ label: rivalStat!.label, km: statValue(rivalStat!, rt), isMine: false }}
              size="md"
            />

            {/* 逆転／逃げ切りペース */}
            {pace && !bothZero && (
              <View style={styles.paceRow}>
                <Ionicons name="flash" size={14} color={Colors.accent} />
                <Text style={styles.paceText}>
                  1日 {pace.kmPerDay.toFixed(1)}km 走れば{leading ? '逃げ切り' : '逆転'}
                </Text>
              </View>
            )}

            {/* 貢献リング */}
            {myStat && (
              <View style={styles.contribRow}>
                <ProgressRing progress={share} size={52} strokeWidth={7}>
                  <Text style={styles.ringPct}>{Math.round(share * 100)}%</Text>
                </ProgressRing>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contribLabel}>あなたの貢献</Text>
                  <Text style={styles.contribValue}>
                    {myDist.toFixed(1)}km / {myStat.totalDistanceKm.toFixed(1)}km
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : (
          /* 陣営データが不足（1陣営のみ等）: 自分の合計距離にフォールバック */
          <View style={styles.fallbackRow}>
            <StatBlock label="自分の合計距離" value={myDist.toFixed(1)} unit="km" hero />
          </View>
        )}

        {/* 複数バトル参加中 */}
        {activeBattleCount > 1 && (
          <View style={styles.multiBattleBadge}>
            <Ionicons name="flash" size={11} color={Colors.primary} />
            <Text style={styles.multiBattleText}>
              他 {activeBattleCount - 1} 件のバトルにも参加中
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.lg,
    ...Shadow.sm,
  },
  acHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  acTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  acDays: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  paceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accentLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  paceText: { fontSize: Typography.fontSize.sm, color: Colors.accent, fontWeight: Typography.fontWeight.bold, fontVariant: ['tabular-nums'] },
  contribRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.md,
  },
  ringPct: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  contribLabel: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  contribValue: { fontSize: Typography.fontSize.md, fontWeight: '800', color: Colors.textPrimary, fontVariant: ['tabular-nums'], marginTop: 2 },
  fallbackRow: { paddingVertical: Spacing.sm },
  multiBattleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  multiBattleText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
});
