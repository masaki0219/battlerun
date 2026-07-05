import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Animation } from '../../design_tokens';

interface Props {
  /** 0–1。範囲外は clamp */
  progress: number;
  /** default 72 */
  size?: number;
  /** default 8 */
  strokeWidth?: number;
  /** default Colors.primary */
  color?: string;
  /** default Colors.surfaceGray */
  trackColor?: string;
  /** 中央表示（例:「34%」） */
  children?: React.ReactNode;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * 貢献率・目標達成率の円形リング。react-native-svg 使用。
 * 12時起点・時計回り。中央 children を絶対配置で重ねる。
 */
export function ProgressRing({
  progress,
  size = 72,
  strokeWidth = 8,
  color = Colors.primary,
  trackColor = Colors.surfaceGray,
  children,
}: Props) {
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const anim = useRef(new Animated.Value(clamped)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: clamped,
      duration: Animation.countUpDuration,
      useNativeDriver: false,
    }).start();
  }, [clamped]);

  const dashoffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          // 12時起点にするため中心で -90度回転
          originX={size / 2}
          originY={size / 2}
          rotation={-90}
        />
      </Svg>
      {children ? <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
