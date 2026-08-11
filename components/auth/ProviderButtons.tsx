import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  configureGoogleSignIn,
  isNativeAuthBuild,
  type SocialProviderId,
} from '../../lib/socialAuth';
import { BorderRadius, Colors, ComponentSize, Spacing, Typography } from '../../design_tokens';
import { GoogleGLogo } from './GoogleGLogo';

interface GoogleAuthButtonProps {
  onPress: () => Promise<void> | void;
  loading?: boolean;
  disabled?: boolean;
  mode?: 'sign-in' | 'sign-up' | 'continue';
}

const GOOGLE_BUTTON_LABELS: Record<NonNullable<GoogleAuthButtonProps['mode']>, string> = {
  'sign-in': 'Googleでログイン',
  'sign-up': 'Googleで登録',
  continue: 'Googleで続ける',
};

export function GoogleAuthButton({ onPress, loading, disabled, mode = 'continue' }: GoogleAuthButtonProps) {
  const configured = useMemo(() => {
    if (!isNativeAuthBuild()) return null;
    try {
      configureGoogleSignIn();
      return true;
    } catch {
      return false;
    }
  }, []);

  if (configured === null) return null;
  if (!configured) {
    return <Text style={styles.configurationError}>Googleログインの設定を読み込めませんでした。</Text>;
  }

  const unavailable = !!disabled || !!loading;
  const label = GOOGLE_BUTTON_LABELS[mode];
  return (
    <Pressable
      onPress={() => { void onPress(); }}
      disabled={unavailable}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable, busy: !!loading }}
      style={({ pressed }) => [
        styles.googleButton,
        pressed && !unavailable && styles.googleButtonPressed,
        unavailable && styles.disabled,
      ]}
    >
      <GoogleGLogo />
      {loading ? (
        <ActivityIndicator color={Colors.googleButtonText} />
      ) : (
        <Text style={styles.googleButtonText}>{label}</Text>
      )}
    </Pressable>
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
  googleButton: {
    width: '100%',
    height: ComponentSize.buttonHeight.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.googleButtonBorder,
    borderRadius: BorderRadius.full,
  },
  googleButtonPressed: {
    backgroundColor: Colors.surfaceGray,
  },
  googleButtonText: {
    color: Colors.googleButtonText,
    fontSize: Typography.fontSize.md,
    lineHeight: Typography.fontSize.md * Typography.lineHeight.normal,
    fontWeight: Typography.fontWeight.semibold,
  },
  appleButton: {
    width: '100%',
    height: ComponentSize.buttonHeight.md,
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
