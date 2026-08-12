import React from 'react';
import { LegalDocument } from '../components/legal/LegalDocument';
import { FeedbackForm } from '../components/feedback/FeedbackForm';
import { SUPPORT_CONTACT_URL } from '../lib/legal';
import { isFeedbackConfigured } from '../lib/feedback';
import { useTranslation } from '../lib/i18n';

export default function HelpScreen() {
  const { t } = useTranslation();
  return <LegalDocument
    title={t('help.title')}
    updatedAt={t('help.updated')}
    topContent={isFeedbackConfigured() ? <FeedbackForm /> : undefined}
    sections={[
    ...Array.from({ length: 5 }, (_, index) => ({ heading: t(`help.s${index + 1}h`), body: t(`help.s${index + 1}b`) })),
    { heading: t('help.s6h'), body: t('help.s6b'), action: { label: t('help.contact'), url: SUPPORT_CONTACT_URL } },
    { heading: t('help.s7h'), body: t('help.s7b') },
  ]} />;
}
