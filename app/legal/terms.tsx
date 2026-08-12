import React from 'react';
import { LegalDocument } from '../../components/legal/LegalDocument';
import { useTranslation } from '../../lib/i18n';

export default function TermsScreen() {
  const { t } = useTranslation();
  return (
    <LegalDocument
      title={t('terms.title')}
      updatedAt={t('terms.updated')}
      sections={Array.from({ length: 12 }, (_, index) => ({
        heading: t(`terms.s${index + 1}h`),
        body: t(`terms.s${index + 1}b`),
      }))}
    />
  );
}
