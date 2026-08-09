import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { Colors, DarkColors, Spacing, BorderRadius, Animation } from '../../design_tokens';

interface Side {
  label: string;
  km: number;
  isMine: boolean;
  color?: string;
}

interface Props {
  /** 自陣営（呼び出し側で常に左へ並べ替える） */
  left: Side;
  /** 相手陣営 */
  right: Side;
  /** md: 一覧カード内 / lg: 詳細画面 */
  size?: 'md' | 'lg';
  /** ダーク演出内で使う場合 */
  dark?: boolean;
  unit?: 'km' | 'km/人';
}

/**
 * 2陣営の対向ゲージ。このリデザインのシグネチャ要素。
 * 左陣営(primary) と 右陣営(accent) が1本のトラックを取り合う。
 * 比率 = leftKm / (leftKm + rightKm)、両方0なら 0.5。
 */
export function VersusGauge({ left, right, size = 'md', dark = false, unit = 'km' }: Props) {
  const { fontScale } = useWindowDimensions();
  const isLg = size === 'lg';
  const largeText = fontScale >= 1.6;
  const trackHeight = isLg ? 16 : 12;

  const total = left.km + right.km;
  const ratio = total > 0 ? left.km / total : 0.5;

  const anim = useRef(new Animated.Value(ratio)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: ratio,
      duration: Animation.countUpDuration,
      useNativeDriver: false,
    }).start();
  }, [ratio]);

  const leftWidth = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const sepLeft = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  // 差分は自陣営視点。isMine を優先し、無ければ左を自陣営とみなす
  const mine = right.isMine && !left.isMine ? right : left;
  const rival = mine === left ? right : left;
  const diff = Math.abs(mine.km - rival.km);
  const leading = mine.km >= rival.km;

  const txtPrimary = dark ? DarkColors.textPrimary : Colors.textPrimary;
  const txtSecondary = dark ? DarkColors.textSecondary : Colors.textSecondary;
  const trackBg = dark ? DarkColors.line : Colors.surfaceGray;
  const sepColor = dark ? DarkColors.marker : Colors.surface;
  const leftColor = left.color ?? (dark ? DarkColors.primary : Colors.primary);
  const rightColor = right.color ?? (dark ? DarkColors.accent : Colors.accent);

  return (
    <View>
      {/* 上部ラベル */}
      {largeText ? (
        <View style={styles.largeLabelColumn}>
          {[left, right].map((side, index) => (
            <View
              key={index === 0 ? 'left' : 'right'}
              style={styles.largeLabelBlock}
              accessible
              accessibilityLabel={`${side.label}、${side.km.toFixed(1)}${unit}${side.isMine ? '、あなたのチーム' : ''}`}
            >
              <View style={[styles.teamMarker, { backgroundColor: side.color ?? (side === left ? leftColor : rightColor) }]} />
              <View style={styles.largeLabelCopy}>
                <Text style={[styles.largeTeamLabel, { color: txtPrimary, fontWeight: side.isMine ? '800' : '600' }]}>
                  {side.label}{side.isMine ? '（あなた）' : ''}
                </Text>
                <Text style={[styles.largeKm, { color: txtPrimary }]}>
                  {side.km.toFixed(1)}<Text style={styles.largeUnit}>{unit}</Text>
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.labelRow}>
          <Text
            style={[
              styles.sideLabel,
              { color: txtPrimary, fontWeight: left.isMine ? '800' : '600' },
            ]}
            numberOfLines={1}
          >
            {left.label}{' '}
            <Text style={styles.km}>{left.km.toFixed(1)}{unit}</Text>
          </Text>
          <Text
            style={[
              styles.sideLabel,
              styles.rightLabel,
              { color: txtPrimary, fontWeight: right.isMine ? '800' : '600' },
            ]}
            numberOfLines={1}
          >
            <Text style={styles.km}>{right.km.toFixed(1)}{unit}</Text>{' '}
            {right.label}
          </Text>
        </View>
      )}

      {/* トラック */}
      <View style={[styles.gaugeWrap, { height: trackHeight }]}>
        <View style={[styles.track, { height: trackHeight, backgroundColor: trackBg }]}>
          <View style={[styles.rightFill, { backgroundColor: rightColor }]} />
          <Animated.View
            style={[styles.leftFill, { width: leftWidth, backgroundColor: leftColor }]}
          />
          <Animated.View
            style={[styles.separator, { left: sepLeft, backgroundColor: sepColor }]}
          />
        </View>
        {isLg && !largeText ? (
          <View
            style={[
              styles.vsBadge,
              {
                backgroundColor: dark ? DarkColors.surface : Colors.surface,
                borderColor: dark ? DarkColors.lineStrong : Colors.border,
              },
            ]}
          >
            <Text style={[styles.vsText, { color: txtSecondary }]}>VS</Text>
          </View>
        ) : null}
      </View>

      {/* 下部差分 */}
      <View style={styles.diffRow}>
        <Text
          style={[
            styles.diffText,
            { color: txtSecondary },
          ]}
        >
          {total <= 0
            ? 'まだ勝負は始まっていない'
            : leading
            ? `+${diff.toFixed(1)}${unit} リード`
            : `あと ${diff.toFixed(1)}${unit}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sideLabel: {
    flex: 1,
    fontSize: 14,
  },
  rightLabel: {
    textAlign: 'right',
  },
  km: {
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  largeLabelColumn: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  largeLabelBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  teamMarker: {
    width: 10,
    height: 10,
    borderRadius: BorderRadius.full,
    marginTop: 7,
  },
  largeLabelCopy: {
    flex: 1,
    minWidth: 0,
  },
  largeTeamLabel: {
    fontSize: 14,
  },
  largeKm: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  largeUnit: {
    fontSize: 12,
    fontWeight: '600',
  },
  gaugeWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  track: {
    width: '100%',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  leftFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: BorderRadius.full,
  },
  rightFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.full,
  },
  separator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
  },
  vsBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -14,
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  diffRow: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  diffText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
