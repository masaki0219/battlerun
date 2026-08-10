import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  configureGoogleSignIn,
  isNativeAuthBuild,
  type SocialProviderId,
} from '../../lib/socialAuth';
import { BorderRadius, Colors, Spacing, Typography } from '../../design_tokens';

interface GoogleAuthButtonProps {
  onPress: () => Promise<void> | void;
  loading?: boolean;
  disabled?: boolean;
}

export function GoogleAuthButton({ onPress, loading, disabled }: GoogleAuthButtonProps) {
  const result = useMemo(() => {
    if (!isNativeAuthBuild()) return null;
    try {
      return { google: configureGoogleSignIn(), error: null };
    } catch (error) {
      return { google: null, error };
    }
  }, []);

  if (!result) return null;
  if (!result.google) {
    return <Text style={styles.configurationError}>Googleログインの設定を読み込めませんでした。</Text>;
  }

  const NativeGoogleButton = result.google.GoogleSignInButton;
  return (
    <View style={styles.googleButtonWrap}>
      <NativeGoogleButton
        colorScheme="light"
        size="standard"
        signInBehavior="none"
        onPress={onPress}
        loading={loading}
        disabled={!!disabled}
        accessibilityLabel="Googleで続ける"
      />
    </View>
  );
}

interface AppleAuthButtonProps {
  onPress: () => void;
  mode?: 'sign-in' | 'sign-up' | 'continue';
  disabled?: boolean;
}

const APPLE_BUTTON_TYPES: Record<NonNullable<AppleAuthButtonProps['mode']>, AppleAuthentication.AppleAuthenticationButtonType> = {
  'sign-in': AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN,
  'sign-up': AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP,
  continue: AppleAuthentication.AppleAuthenticationButtonType.CONTINUE,
};

export function AppleAuthButton({ onPress, mode = 'continue', disabled }: AppleAuthButtonProps) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (Platform.OS === 'ios' && isNativeAuthBuild()) {
      void AppleAuthentication.isAvailableAsync().then((value) => {
        if (mounted) setAvailable(value);
      });
    }
    return () => { mounted = false; };
  }, []);

  if (!available) return null;
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={APPLE_BUTTON_TYPES[mode]}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={BorderRadius.full}
      onPress={onPress}
      style={[styles.appleButton, disabled && styles.disabled]}
      pointerEvents={disabled ? 'none' : 'auto'}
      accessibilityState={{ disabled: !!disabled }}
    />
  );
}

export function providerLabel(providerId: SocialProviderId): string {
  return providerId === 'apple.com' ? 'Apple' : 'Google';
}

const styles = StyleSheet.create({
  googleButtonWrap: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
  disabled: {
    opacity: 0.55,
  },
  configurationError: {
    color: Colors.error,
    fontSize: Typography.fontSize.xs,
    lineHeight: Typography.fontSize.xs * Typography.lineHeight.normal,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
});
