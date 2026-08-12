import React from 'react';
import { LegalDocument } from '../../components/legal/LegalDocument';
import { SUPPORT_CONTACT_URL } from '../../lib/legal';
import { useTranslation } from '../../lib/i18n';

export default function PrivacyScreen() {
  const { t } = useTranslation();
  return (
    <LegalDocument
      title={t('privacy.title')}
      updatedAt={t('privacy.updated')}
      sections={[
        ...Array.from({ length: 10 }, (_, index) => ({
          heading: t(`privacy.s${index + 1}h`),
          body: t(`privacy.s${index + 1}b`),
        })),
        {
          heading: t('privacy.s11h'),
          body: t('privacy.s11b'),
          action: { label: t('privacy.support'), url: SUPPORT_CONTACT_URL },
        },
      ]}
    />
  );
}
