import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography } from '../../design_tokens';

export interface LegalSection {
  heading: string;
  body: string;
  action?: { label: string; url: string } | { label: string; route: string };
}

export function LegalDocument({ title, updatedAt, sections }: {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="戻る">
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>最終更新: {updatedAt}</Text>
        {sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.body}>{section.body}</Text>
            {section.action && (
              <TouchableOpacity
                style={styles.action}
                onPress={() => {
                  const action = section.action!;
                  if ('url' in action) {
                    void Linking.openURL(action.url);
                  } else {
                    router.push(action.route as never);
                  }
                }}
                accessibilityRole="link"
                accessibilityLabel={section.action.label}
              >
                <Text style={styles.actionText}>{section.action.label}</Text>
                <Ionicons
                  name={'url' in section.action ? 'open-outline' : 'chevron-forward'}
                  size={14}
                  color={Colors.primaryDark}
                />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  content: { padding: Spacing.xl, paddingBottom: Spacing['4xl'], gap: Spacing.xl },
  updated: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
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
