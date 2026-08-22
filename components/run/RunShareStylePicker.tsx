import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, Colors } from '../../design_tokens';
import { useTranslation } from '../../lib/i18n';
import type { RunShareStyle } from '../../utils/runSharePreference';

const OPTIONS: { value: RunShareStyle; labelKey: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'map', labelKey: 'summary.shareStyleMap', icon: 'map' },
  { value: 'route', labelKey: 'summary.shareStyleRoute', icon: 'git-merge-outline' },
  { value: 'stats', labelKey: 'summary.shareStyleStats', icon: 'timer-outline' },
];

export function RunShareStylePicker({
  value,
  disabled,
  onChange,
}: {
  value: RunShareStyle;
  disabled: boolean;
  onChange: (value: RunShareStyle) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={s.wrapper}>
      <Text style={s.title}>{t('summary.shareStyleTitle')}</Text>
      <View style={s.options} accessibilityRole="radiogroup">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[s.option, selected && s.optionSelected]}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={t(option.labelKey)}
            >
              <Ionicons
                name={option.icon}
                size={16}
                color={selected ? Colors.primaryDark : Colors.textSecondary}
              />
              <Text numberOfLines={2} style={[s.optionText, selected && s.optionTextSelected]}>
                {t(option.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {value !== 'stats' && <Text style={s.hint}>{t('summary.routePrivacy')}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    gap: 7,
    padding: 11,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary },
  options: {
    flexDirection: 'row',
    gap: 5,
    padding: 4,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceGray,
  },
  option: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 4,
    borderRadius: BorderRadius.sm,
  },
  optionSelected: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  optionText: { fontSize: 10, lineHeight: 13, fontWeight: '700', textAlign: 'center', color: Colors.textSecondary },
  optionTextSelected: { color: Colors.primaryDark },
  hint: { fontSize: 9, lineHeight: 13, color: Colors.textSecondary },
});
