import React from 'react';
import { LegalDocument } from '../../components/legal/LegalDocument';
import { SUPPORT_CONTACT_URL } from '../../lib/legal';
import { useTranslation } from '../../lib/i18n';

export default function TokushoScreen() {
  const { t } = useTranslation();
  return (
    <LegalDocument
      title={t('tokusho.title')}
      updatedAt={t('tokusho.updated')}
      sections={[
        ...Array.from({ length: 3 }, (_, index) => ({
          heading: t(`tokusho.s${index + 1}h`),
          body: t(`tokusho.s${index + 1}b`),
        })),
        {
          heading: t('tokusho.s4h'),
          body: t('tokusho.s4b'),
          action: { label: t('tokusho.support'), url: SUPPORT_CONTACT_URL },
        },
        ...Array.from({ length: 7 }, (_, index) => ({
          heading: t(`tokusho.s${index + 5}h`),
          body: t(`tokusho.s${index + 5}b`),
        })),
      ]}
    />
  );
}
