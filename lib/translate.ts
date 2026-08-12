import { I18n, type TranslateOptions } from 'i18n-js';
import type { AppLanguage } from './language';
import { en } from './translations/en';
import { ja } from './translations/ja';

const i18n = new I18n({ ja, en });
i18n.defaultLocale = 'en';
i18n.enableFallback = true;
i18n.locale = 'en';

export type { TranslateOptions } from 'i18n-js';

export function setTranslationLanguage(language: AppLanguage): void {
  i18n.locale = language;
}

export function getTranslationLanguage(): AppLanguage {
  return i18n.locale === 'ja' ? 'ja' : 'en';
}

export function translate(scope: string, options?: TranslateOptions): string {
  return i18n.t(scope, options);
}

export function translateIn(language: AppLanguage, scope: string, options?: TranslateOptions): string {
  return i18n.t(scope, { ...options, locale: language });
}
