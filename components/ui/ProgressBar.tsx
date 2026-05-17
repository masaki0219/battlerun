import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Colors, BorderRadius, ComponentSize } from '../../design_tokens';

interface Props {
  value: number;
  color?: string;
  height?: number;
}

export function ProgressBar({ value, color = Colors.primary, height = ComponentSize.progressBarHeight }: Props) {
  const anim = useRef(new Animated.Value(value)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value, duration: 400, useNativeDriver: false }).start();
  }, [value]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.track, { height }]}>
      <Animated.View style={[styles.fill, { width, height, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: BorderRadius.full,
  },
});
