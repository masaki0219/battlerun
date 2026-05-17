import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, BorderRadius, Shadow, Spacing, ComponentSize } from '../../design_tokens';

interface Props {
  children: React.ReactNode;
  padding?: number;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, padding = ComponentSize.cardPadding, style }: Props) {
  return (
    <View style={[styles.card, { padding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    ...Shadow.sm,
  },
});
