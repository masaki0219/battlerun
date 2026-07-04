import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Colors, BorderRadius, ComponentSize, Animation } from '../../design_tokens';

interface Props {
  /** 0〜1 の進捗 */
  value: number;
  color?: string;
  /** トラック（背景）色。ダーク画面で上書きする */
  trackColor?: string;
  height?: number;
  /** アニメーションを無効化 */
  animated?: boolean;
}

/**
 * ランキングバーの統一。高さ progressBarHeight、角丸 full。
 * width をアニメーションさせて数値更新を滑らかに見せる。
 */
export function ProgressBar({
  value,
  color = Colors.primary,
  trackColor = Colors.surfaceGray,
  height = ComponentSize.progressBarHeight,
  animated = true,
}: Props) {
  const clamped = Math.max(0, Math.min(1, value));
  const anim = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    if (!animated) {
      anim.setValue(clamped);
      return;
    }
    Animated.timing(anim, {
      toValue: clamped,
      duration: Animation.countUpDuration,
      useNativeDriver: false,
    }).start();
  }, [clamped, animated]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.track, { height, backgroundColor: trackColor }]}>
      <Animated.View style={[styles.fill, { width, height, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: BorderRadius.full,
  },
});
