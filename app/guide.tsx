import React from 'react';
import { LegalDocument } from '../components/legal/LegalDocument';
import { useTranslation } from '../lib/i18n';

export default function GuideScreen() {
  const { t } = useTranslation();
  return (
    <LegalDocument
      title={t('guide.title')}
      updatedAt={t('guide.updated')}
      sections={[
        ...Array.from({ length: 8 }, (_, index) => ({ heading: t(`guide.s${index + 1}h`), body: t(`guide.s${index + 1}b`) })),
        { heading: t('guide.s9h'), body: t('guide.s9b'), action: { label: t('guide.helpAction'), route: '/help' } },
        { heading: t('guide.s10h'), body: t('guide.s10b'), action: { label: t('guide.onboardingAction'), route: '/onboarding?replay=1' } },
      ]}
    />
  );
}
