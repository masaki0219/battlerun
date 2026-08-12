import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../stores/authStore';
import { DISPLAY_NAME_MAX_LENGTH, validateDisplayName } from '../../lib/validation/displayName';
import { BorderRadius, Colors, Spacing, Typography } from '../../design_tokens';
import { Avatar } from '../../components/ui/Avatar';
import { AVATAR_EMOJI_CATEGORIES } from '../../lib/avatarEmojis';
import { useTranslation } from '../../lib/i18n';
import { userFacingError } from '../../lib/userError';

export default function ProfileSetupScreen() {
  const { t } = useTranslation();
  const {
    suggestedProfileName,
    completeProfileSetup,
    signOut,
    isLoading,
  } = useAuthStore();
  const [name, setName] = useState(suggestedProfileName);
  const [avatarEmoji, setAvatarEmoji] = useState('🏃');
  const [categoryId, setCategoryId] = useState(AVATAR_EMOJI_CATEGORIES[1].id);
  const category = AVATAR_EMOJI_CATEGORIES.find((item) => item.id === categoryId)
    ?? AVATAR_EMOJI_CATEGORIES[0];

  useEffect(() => {
    if (!name && suggestedProfileName) setName(suggestedProfileName);
  }, [suggestedProfileName, name]);

  async function handleComplete() {
    const validation = validateDisplayName(name);
    if (!validation.ok) {
      Alert.alert(t('auth.nicknameCheck'), validation.reason);
      return;
    }
    try {
      await completeProfileSetup(name, avatarEmoji);
    } catch (error) {
      Alert.alert(
        t('auth.profileCreateFailed'),
        userFacingError(error, t('connection.tryAgain')),
      );
    }
  }

  async function handleCancel() {
    await signOut();
    router.replace('/auth/login');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.eyebrow}>ZELIO PROFILE</Text>
            <Text style={styles.title}>{t('auth.chooseNickname')}</Text>
            <Text style={styles.body}>
              {t('auth.nicknameExplanation')}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t('auth.nicknamePlaceholder', { count: DISPLAY_NAME_MAX_LENGTH })}
              placeholderTextColor={Colors.textTertiary}
              value={name}
              onChangeText={setName}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              textContentType="nickname"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => { void handleComplete(); }}
            />
            <View style={styles.avatarPreview}>
              <Avatar name={name || t('common.you')} emoji={avatarEmoji} size="lg" />
              <View style={styles.avatarPreviewCopy}>
                <Text style={styles.avatarTitle}>{t('auth.chooseIcon')}</Text>
                <Text style={styles.avatarHint}>{t('auth.iconExplanation')}</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {AVATAR_EMOJI_CATEGORIES.map((item) => {
                const selected = item.id === category.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                    onPress={() => setCategoryId(item.id)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>{t(`avatarCategories.${item.id}`)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.emojiGrid}>
              {category.emojis.map((emoji) => {
                const selected = emoji === avatarEmoji;
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.emojiCell, selected && styles.emojiCellSelected]}
                    onPress={() => setAvatarEmoji(emoji)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t('auth.iconA11y', { emoji })}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Button
              label={t('auth.startWithNickname')}
              onPress={() => { void handleComplete(); }}
              loading={isLoading}
            />
            <Button
              label={t('auth.logoutAndBack')}
              onPress={() => { void handleCancel(); }}
              variant="ghost"
              disabled={isLoading}
            />
            <View style={styles.legalRow}>
              <TouchableOpacity onPress={() => router.push('/legal/terms')} accessibilityRole="link">
                <Text style={styles.legalText}>{t('common.terms')}</Text>
              </TouchableOpacity>
              <Text style={styles.legalDivider}>・</Text>
              <TouchableOpacity onPress={() => router.push('/legal/privacy')} accessibilityRole="link">
                <Text style={styles.legalText}>{t('common.privacy')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboard: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  card: {
    gap: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    letterSpacing: 1.2,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    lineHeight: Typography.fontSize['2xl'] * Typography.lineHeight.tight,
  },
  body: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.lg,
  },
  avatarPreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarPreviewCopy: { flex: 1 },
  avatarTitle: { color: Colors.textPrimary, fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold },
  avatarHint: { marginTop: 2, color: Colors.textSecondary, fontSize: Typography.fontSize.xs },
  categoryRow: { gap: Spacing.sm },
  categoryChip: { minHeight: 34, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  categoryChipSelected: { backgroundColor: Colors.primary },
  categoryText: { color: Colors.textSecondary, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold },
  categoryTextSelected: { color: Colors.textOnPrimary },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  emojiCell: { width: 42, height: 42, borderRadius: BorderRadius.md, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  emojiCellSelected: { borderWidth: 2, borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  emoji: { fontSize: 24 },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legalText: {
    color: Colors.primary,
    fontSize: Typography.fontSize.xs,
  },
  legalDivider: {
    color: Colors.textTertiary,
    marginHorizontal: Spacing.sm,
  },
});
