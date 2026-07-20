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

/**
 * 1kmごとのラップ一覧。バーは最も遅い区間ペースを100%とした相対表示。
 * 端数区間（最後の1km未満）は距離を明示し、ペースに換算して表示する。
 */
export function KmSplitsCard({ splits }: { splits: KmSplit[] }) {
  if (splits.length === 0) return null;

  const paces = splits.map((s) => s.seconds / s.distanceKm);
  const slowest = Math.max(...paces, 1);
  const fastest = Math.min(...paces);

  return (
    <View style={s.card}>
      {splits.map((split, i) => {
        const pace = paces[i];
        const isPartial = split.distanceKm < 1;
        const isFastest = splits.length > 1 && pace === fastest;
        return (
          <View key={i} style={[s.row, i > 0 && s.rowBorder]}>
            <Text style={s.kmLabel}>
              {isPartial ? split.km.toFixed(1) : String(Math.round(split.km))}
              <Text style={s.kmUnit}> km</Text>
            </Text>
            <View style={s.barTrack}>
              <View
                style={[
                  s.barFill,
                  { width: `${Math.max(8, Math.round((pace / slowest) * 100))}%` },
                  isFastest && { backgroundColor: Colors.accent },
                ]}
              />
            </View>
            <Text style={[s.paceLabel, isFastest && { color: Colors.accentDark }]}>
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
  paceUnit: { fontSize: 9, color: Colors.textTertiary },
});
