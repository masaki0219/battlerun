import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../../design_tokens';
import type { KmSplit } from '../../utils/displayStats';

function formatSplitPace(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "--'--\"";
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

/** バーの最低の高さ（比率）。ラップ差が小さくても速い・遅いが読めるようにする */
const FLOOR = 0.35;

/**
 * 1kmごとのラップ一覧。**バーが長いほど速い**（最遅ラップを FLOOR、最速ラップを 100% とした相対表示）。
 * 端数区間（最後の1km未満）は距離を明示し、ペースに換算して表示する。
 *
 * ★配色の約束: 同じ画面に出る活動詳細マップの凡例（速い=primary / ゆっくり=accent）と揃える。
 * 最速ラップをアクセント（オレンジ）で塗ると、マップ上では「ゆっくり」を意味する色と衝突するため、
 * 色による強調はせず「最速」バッジで示す。
 */
export function KmSplitsCard({ splits }: { splits: KmSplit[] }) {
  if (splits.length === 0) return null;

  const paces = splits.map((s) => s.seconds / s.distanceKm);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  // ペースは「小さいほど速い」ため、速さ（1/ペース）に直してから正規化する
  const fastestSpeed = 1 / Math.max(fastest, 0.001);
  const slowestSpeed = 1 / Math.max(slowest, 0.001);
  const speedSpan = fastestSpeed - slowestSpeed;

  return (
    <View style={s.card}>
      {splits.map((split, i) => {
        const pace = paces[i];
        const isPartial = split.distanceKm < 1;
        const isFastest = splits.length > 1 && pace === fastest;
        const speed = 1 / Math.max(pace, 0.001);
        const ratio = speedSpan > 0 ? FLOOR + (1 - FLOOR) * ((speed - slowestSpeed) / speedSpan) : 1;
        return (
          <View key={i} style={[s.row, i > 0 && s.rowBorder]}>
            <Text style={s.kmLabel}>
              {isPartial ? split.km.toFixed(1) : String(Math.round(split.km))}
              <Text style={s.kmUnit}> km</Text>
            </Text>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${Math.round(ratio * 100)}%` }]} />
            </View>
            {isFastest && (
              <View style={s.fastestBadge}>
                <Text style={s.fastestBadgeText}>最速</Text>
              </View>
            )}
            <Text style={[s.paceLabel, isFastest && s.paceLabelFastest]}>
              {formatSplitPace(pace)}
              <Text style={s.paceUnit}>/km</Text>
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 10,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  kmLabel: {
    width: 44,
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  kmUnit: { fontSize: 10, fontWeight: '700', color: Colors.textTertiary },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceGray,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  paceLabel: {
    width: 76,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  paceLabelFastest: { color: Colors.primaryDark, fontWeight: '800' },
  paceUnit: { fontSize: 9, color: Colors.textTertiary },
  fastestBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  fastestBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.primaryDark,
    letterSpacing: 0.5,
  },
});
