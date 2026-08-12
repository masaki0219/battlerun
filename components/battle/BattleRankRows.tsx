import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '../ui/ProgressBar';
import { Colors, Typography, Spacing, teamColor, teamColorMap } from '../../design_tokens';
import { statValue, statLabel, maxStat } from '../../utils/displayStats';
import type { Battle, CategoryStats } from '../../types';
import { useTranslation } from '../../lib/i18n';

interface Props {
  battle: Battle;
  /** rankingType 降順に整列済みの陣営統計 */
  sorted: CategoryStats[];
  myCatId?: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onPressDetails?: () => void;
  detailsAccessibilityLabel?: string;
}

/**
 * 一覧カードの陣営ランキング行（上位3＋自陣営、残りは折りたたみ）。表示専用。
 * 展開状態は親が保持し expanded / onToggleExpand で受け渡す。
 */
export function BattleRankRows({
  battle,
  sorted,
  myCatId,
  expanded,
  onToggleExpand,
  onPressDetails,
  detailsAccessibilityLabel,
}: Props) {
  const { language, t } = useTranslation();
  if (sorted.length === 0) return null;
  const rt = battle.rankingType;
  const maxVal = maxStat(sorted, rt);
  const allZero = sorted.every((item) => statValue(item, rt) <= 0);
  const myIdx = sorted.findIndex((s) => s.categoryId === myCatId);
  const showMyExtra = !expanded && myIdx >= 3;
  const visible = expanded ? sorted : sorted.slice(0, 3);
  const hiddenCount = sorted.length - 3;
  const colorsByCategory = teamColorMap(battle.categories);

  const row = (s: CategoryStats) => {
    const isMine = s.categoryId === myCatId;
    const rank = allZero ? null : 1 + sorted.filter((item) => statValue(item, rt) > statValue(s, rt)).length;
    const barColor = colorsByCategory[s.categoryId] ?? teamColor(s.categoryId);
    return (
      <View key={s.categoryId} style={styles.rankRow}>
        <Text style={[styles.rankNum, isMine && styles.rankNumMine]}>{rank ?? '—'}</Text>
        <Text style={[styles.rankName, isMine && styles.rankNameMine]} numberOfLines={1}>
          {s.label}
        </Text>
        <View style={styles.rankBarArea}>
          <ProgressBar value={maxVal > 0 ? statValue(s, rt) / maxVal : 0} color={barColor} height={8} />
        </View>
        <Text style={[styles.rankValue, isMine && styles.rankValueMine]}>{statLabel(s, rt, language)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.rankSection}>
      <TouchableOpacity
        style={styles.rankDetails}
        activeOpacity={onPressDetails ? 0.7 : 1}
        onPress={onPressDetails}
        disabled={!onPressDetails}
        accessibilityRole={onPressDetails ? 'button' : undefined}
        accessibilityLabel={detailsAccessibilityLabel}
      >
        <View style={styles.rankRows}>
          {visible.map((s) => row(s))}
          {showMyExtra && (
            <>
              <Text style={styles.ellipsis}>⋯</Text>
              {row(sorted[myIdx])}
            </>
          )}
        </View>
      </TouchableOpacity>
      {hiddenCount > 0 && (
        <TouchableOpacity
          onPress={onToggleExpand}
          style={styles.collapseBtn}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
        >
          <Text style={styles.collapseText}>{expanded ? t('common.close') : t('battle.otherTeams', { count: hiddenCount })}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rankSection: { gap: Spacing.md, marginBottom: Spacing.sm },
  rankDetails: { paddingVertical: Spacing.xs, marginVertical: -Spacing.xs },
  rankRows: { gap: Spacing.md },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rankNum: { width: 16, fontSize: Typography.fontSize.sm, fontWeight: '700', color: Colors.textTertiary, textAlign: 'center', fontVariant: ['tabular-nums'] },
  rankNumMine: { color: Colors.primary },
  rankName: { width: 76, fontSize: Typography.fontSize.sm, color: Colors.textPrimary },
  rankNameMine: { fontWeight: '800', color: Colors.primary },
  rankBarArea: { flex: 1 },
  rankValue: { width: 62, fontSize: Typography.fontSize.xs, color: Colors.textSecondary, textAlign: 'right', fontVariant: ['tabular-nums'] },
  rankValueMine: { fontWeight: '800', color: Colors.textPrimary },
  ellipsis: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary, textAlign: 'center', marginTop: -4 },
  collapseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: Spacing.xs },
  collapseText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
});
