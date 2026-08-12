import React from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography } from '../../design_tokens';
import { useTranslation } from '../../lib/i18n';

export interface LegalSection {
  heading: string;
  body: string;
  action?: { label: string; url: string; route?: never } | { label: string; route: string; url?: never };
}

export function LegalDocument({ title, updatedAt, sections, topContent }: {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
  topContent?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {topContent}
        <Text style={styles.updated}>{t('legalDocument.updated', { date: updatedAt })}</Text>
        {sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.body}>{section.body}</Text>
            {section.action && (
              <TouchableOpacity
                style={styles.action}
                onPress={() => {
                  const action = section.action!;
                  if (action.route) router.push(action.route as never);
                  else if (action.url) void Linking.openURL(action.url);
                }}
                accessibilityRole={section.action.route ? 'button' : 'link'}
                accessibilityLabel={section.action.label}
              >
                <Text style={styles.actionText}>{section.action.label}</Text>
                <Ionicons name={section.action.route ? 'chevron-forward' : 'open-outline'} size={14} color={Colors.primaryDark} />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  content: { padding: Spacing.xl, paddingBottom: Spacing['4xl'], gap: Spacing.xl },
  updated: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  section: { gap: Spacing.sm },
  heading: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  body: { fontSize: Typography.fontSize.sm, lineHeight: 22, color: Colors.textSecondary },
  action: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: 999, backgroundColor: Colors.primaryLight,
  },
  actionText: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: Colors.primaryDark },
});
