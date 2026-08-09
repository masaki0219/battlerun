import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatBlock } from '../ui/StatBlock';
import { FactionColumns } from '../viz/FactionColumns';
import { DarkColors, Typography, Spacing, BorderRadius, Shadow, teamColor, teamColorMap } from '../../design_tokens';
import { comebackTarget, sortedStats, statValue, remainingLabel } from '../../utils/displayStats';
import type { Battle, CategoryStats } from '../../types';
import { prioritizeTeams } from '../../utils/teamDisplay';

/** 自分の陣営内での立ち位置（useTeamRanking の結果を表示用に絞ったもの） */
export interface HeroTeamRank {
  myRank: number;
  teamSize: number;
  gapToNextKm: number | null;
}

interface Props {
  battle: Battle;
  stats: CategoryStats[];
  myCategoryId?: string | null;
  /** 自分のこのバトルでの累計距離 */
  myDist: number;
  /** 陣営内順位。取得前・未参加なら省略 */
  teamRank?: HeroTeamRank;
  /** 参加中バトル総数（>1 で「他N件」バッジ表示） */
  activeBattleCount: number;
  onPress: () => void;
}

/**
 * 参加中バトルのヒーローカード（ホームの主役）。
 * ディープパインのダーク面に、全陣営カラム・逆転ペース・陣営内での立ち位置を載せる。表示専用。
 */
export function ActiveBattleHero({
  battle, stats, myCategoryId, myDist, teamRank, activeBattleCount, onPress,
}: Props) {
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.6;
  const rt = battle.rankingType;
  const sorted = sortedStats(stats, rt);
  const myIndex = sorted.findIndex((s) => s.categoryId === myCategoryId);
  const allZero = sorted.every((item) => statValue(item, rt) <= 0);
  const totalTeams = sorted.length;
  const remaining = remainingLabel(battle.endAt);

  const myStat = myIndex >= 0 ? sorted[myIndex] : undefined;
  const myKm = myStat ? statValue(myStat, rt) : 0;
  const myRank = myStat && !allZero
    ? 1 + sorted.filter((item) => statValue(item, rt) > myKm).length
    : 0;
  const leader = sorted[0];
  const runnerUp = sorted.find((item) => statValue(item, rt) < myKm);
  const hasFactions = !!myStat && totalTeams > 1;
  const leading = myRank === 1;

  // 首位（自分が首位なら2位）との差
  const rivalStat = leading ? runnerUp : leader;
  const rivalKm = rivalStat ? statValue(rivalStat, rt) : 0;
  const diffKm = Math.abs(rivalKm - myKm);
  const bothZero = hasFactions && myKm <= 0 && rivalKm <= 0;

  const gapToOvertakeKm = !leading && myStat && rivalStat
    ? (rt === 'average'
      ? Math.max(0, rivalStat.avgDistanceKm * Math.max(myStat.participantCount, 1) - myStat.totalDistanceKm)
      : Math.max(0, rivalKm - myKm))
    : null;
  const comeback = gapToOvertakeKm != null
    ? comebackTarget(gapToOvertakeKm, battle.endAt)
    : null;

  const colorsByCategory = teamColorMap(battle.categories.map((category) => category.id));
  const columns = prioritizeTeams(sorted, myCategoryId).map((s) => ({
    id: s.categoryId,
    label: s.label,
    km: statValue(s, rt),
    rank: allZero ? null : 1 + sorted.filter((item) => statValue(item, rt) > statValue(s, rt)).length,
    isMine: s.categoryId === myCategoryId,
    color: colorsByCategory[s.categoryId] ?? teamColor(s.categoryId),
  }));

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress}>
      <View style={styles.shadow}>
        <View style={styles.clip}>
          <View style={[styles.body, largeText && styles.bodyLargeText]}>
            <View style={[styles.topRow, largeText && styles.topRowLargeText]}>
              <View style={[styles.topLeft, largeText && styles.topLeftLargeText]}>
                <Text style={styles.title} numberOfLines={largeText ? undefined : 2}>{battle.title}</Text>
              </View>
              {remaining !== null && (
                <View style={[styles.daysPill, largeText && styles.daysPillLargeText]}>
                  <Text style={styles.daysPillLabel}>残り</Text>
                  <Text style={styles.daysPillValue}>{remaining}</Text>
                </View>
              )}
            </View>

            {hasFactions ? (
              <>
                <View style={[styles.standingRow, largeText && styles.standingRowLargeText]}>
                  <View style={styles.standingLeft}>
                    <Text style={styles.teamLabel} numberOfLines={1}>{myStat!.label}</Text>
                    <View style={styles.rankLine}>
                      <Text style={styles.rankNum}>{myRank || '—'}</Text>
                      <Text style={styles.rankUnit}>{myRank ? `位 / ${totalTeams}` : '順位なし'}</Text>
                    </View>
                  </View>
                  <View style={[styles.standingRight, largeText && styles.standingRightLargeText]}>
                    <Text style={styles.teamKm}>{myKm.toFixed(1)} {rt === 'average' ? 'km/人' : 'km'}</Text>
                    <Text style={styles.gapText}>
                      {bothZero
                        ? 'まだ勝負は始まっていない'
                        : leading
                        ? `2位に +${diffKm.toFixed(1)} km`
                        : `首位まで ${diffKm.toFixed(1)} km`}
                    </Text>
                  </View>
                </View>

                <FactionColumns factions={columns} valueSuffix={rt === 'average' ? 'km/人' : 'km'} />

                {comeback != null && !bothZero && (
                  <View style={[styles.insight, largeText && styles.insightLargeText]}>
                    <Ionicons name="speedometer-outline" size={15} color={DarkColors.accent} />
                    <Text style={styles.insightText}>
                      相手が伸びなければ、チーム全体であと {comeback.totalKm.toFixed(1)}km。{' '}
                      <Text style={styles.insightStrong}>1日 {comeback.kmPerDay.toFixed(1)}km</Text> が逆転の目安
                    </Text>
                  </View>
                )}
              </>
            ) : (
              /* 陣営データが不足（1陣営のみ等）: 自分の合計距離にフォールバック */
              <View style={styles.fallback}>
                <StatBlock dark label="自分の合計距離" value={myDist.toFixed(1)} unit="km" hero />
              </View>
            )}

            {activeBattleCount > 1 && (
              <View style={styles.multiInfo}>
                <Ionicons name="information-circle-outline" size={14} color={DarkColors.textSecondary} />
                <Text style={styles.multiText} maxFontSizeMultiplier={1.3}>
                  ランの距離は参加中の{activeBattleCount}件すべてに反映されます
                </Text>
              </View>
            )}
          </View>

          {/* フッター帯（自分の貢献と陣営内での立ち位置） */}
          <View style={styles.footer}>
            <View style={[styles.footerCols, largeText && styles.footerColsLargeText]}>
              <View style={[styles.footerCol, largeText && styles.footerColLargeText]}>
                <Text style={styles.footerLabel}>あなた</Text>
                <Text style={styles.footerValue}>{myDist.toFixed(1)} km</Text>
              </View>

              {teamRank && teamRank.myRank > 0 && (
                <View style={[styles.footerCol, largeText && styles.footerColLargeText]}>
                  <Text style={styles.footerLabel}>チーム内</Text>
                  <Text style={styles.footerValue}>
                    {teamRank.myRank}位 / {teamRank.teamSize}人
                  </Text>
                </View>
              )}

              {teamRank && teamRank.gapToNextKm != null && (
                <View style={[styles.footerCol, largeText && styles.footerColLargeText]}>
                  <Text style={styles.footerLabel}>{teamRank.myRank - 1}位まで</Text>
                  <Text style={[styles.footerValue, styles.footerValueAccent]}>
                    あと {teamRank.gapToNextKm.toFixed(1)} km
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.footerLink}>
              <Text style={styles.footerLinkText} maxFontSizeMultiplier={1.3}>詳細を見る</Text>
              <Ionicons name="chevron-forward" size={14} color={DarkColors.primary} />
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // 影は clip する外側に置く（overflow:hidden で影が切れるのを避ける）
  shadow: {
    borderRadius: BorderRadius['2xl'],
    backgroundColor: DarkColors.surface,
    ...Shadow.lg,
  },
  clip: {
    borderRadius: BorderRadius['2xl'],
    overflow: 'hidden',
  },
  body: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  bodyLargeText: { padding: Spacing.lg, gap: Spacing.md },

  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md },
  topRowLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  topLeft: { flex: 1 },
  topLeftLargeText: { flex: 0 },
  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: DarkColors.textPrimary,
  },
  daysPill: {
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: DarkColors.lineStrong,
    backgroundColor: DarkColors.chip,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  daysPillLargeText: { alignSelf: 'flex-start', flexDirection: 'row', gap: Spacing.xs },
  daysPillLabel: { fontSize: 9, fontWeight: Typography.fontWeight.medium, color: DarkColors.textSecondary },
  daysPillValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.extrabold,
    color: DarkColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  standingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  standingRowLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  standingLeft: { flex: 1 },
  standingRight: { alignItems: 'flex-end' },
  standingRightLargeText: { alignItems: 'flex-start' },
  teamLabel: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: DarkColors.textSecondary,
    letterSpacing: 0.8,
  },
  rankLine: { flexDirection: 'row', alignItems: 'baseline', marginTop: 3 },
  rankNum: {
    fontSize: 29,
    fontWeight: Typography.fontWeight.extrabold,
    color: DarkColors.textPrimary,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  rankUnit: {
    marginLeft: 3,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: DarkColors.textSecondary,
  },
  teamKm: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: DarkColors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  gapText: {
    marginTop: 3,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: DarkColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  insight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: DarkColors.surfaceDeep,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  insightLargeText: { alignItems: 'flex-start' },
  insightText: { flex: 1, fontSize: Typography.fontSize.sm, color: DarkColors.textSecondary },
  insightStrong: {
    fontWeight: Typography.fontWeight.extrabold,
    color: DarkColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  fallback: { paddingVertical: Spacing.sm },

  multiInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  multiText: { flex: 1, fontSize: Typography.fontSize.xs, color: DarkColors.textSecondary },

  footer: {
    backgroundColor: DarkColors.surfaceAlt,
    borderTopWidth: 1,
    borderTopColor: DarkColors.line,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  footerCols: { flexDirection: 'row', gap: Spacing.xl },
  footerColsLargeText: { flexDirection: 'column', gap: Spacing.md },
  footerCol: { flex: 1 },
  footerColLargeText: { flex: 0 },
  footerLabel: { fontSize: 10, color: DarkColors.textSecondary },
  footerValue: {
    marginTop: 2,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: DarkColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  footerValueAccent: { color: DarkColors.accentTint },
  footerLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: Spacing.md },
  footerLinkText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: DarkColors.primary,
  },
});
