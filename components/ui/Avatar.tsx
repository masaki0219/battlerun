import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors, ComponentSize, Typography } from '../../design_tokens';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

interface Props {
  uri?: string;
  name: string;
  size?: AvatarSize;
}

export function Avatar({ uri, name, size = 'md' }: Props) {
  const dim = ComponentSize.avatarSize[size];
  const fontSize = dim * 0.4;
  const initial = name.charAt(0).toUpperCase();

  return (
    <View style={[styles.container, { width: dim, height: dim, borderRadius: dim / 2 }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: dim, height: dim, borderRadius: dim / 2 }} />
      ) : (
        <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
  },
});
