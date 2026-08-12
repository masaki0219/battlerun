import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { BorderRadius, Colors, Spacing, Typography } from '../../design_tokens';
import type { Category } from '../../types';
import { useTranslation } from '../../lib/i18n';

interface Props {
  category: Category;
  upcoming?: boolean;
  loading?: boolean;
  onContinue?: () => void;
  onChooseTeam?: () => void;
}

/** 直前タームの参加チームを案内するだけのUI。参加処理は親の既存joinBattle経路へ委譲する。 */
export function TermContinuationActions({
  category,
  upcoming = false,
  loading = false,
  onContinue,
  onChooseTeam,
}: Props) {
  const { t } = useTranslation();

  if (upcoming) {
    return (
      <View style={styles.previousTeamInfo}>
        <Text style={styles.previousTeamText}>{t('battle.previousTeam', { team: category.label })}</Text>
        <Text style={styles.upcomingNote}>{t('battle.joinAfterTermStarts')}</Text>
      </View>
    );
  }

  if (!onContinue || !onChooseTeam) return null;

  return (
    <View style={styles.actions}>
      <Text style={styles.heading}>{t('battle.joinWithPreviousTeam')}</Text>
      <Button
        label={t('battle.continueWithTeam', { team: category.label })}
        onPress={onContinue}
        loading={loading}
        size="sm"
      />
      <Button
        label={t('battle.chooseTeamAgain')}
        onPress={onChooseTeam}
        disabled={loading}
        variant="ghost"
        size="sm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accentLight,
  },
  heading: {
    marginBottom: Spacing.xs,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.accentText,
    textAlign: 'center',
  },
  previousTeamInfo: {
    gap: 2,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceGray,
  },
  previousTeamText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  upcomingNote: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
});
