import { useCallback } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { detectAppLanguage } from './deviceLocale';
import type { AppLanguage } from './language';
import {
  getTranslationLanguage,
  setTranslationLanguage,
  translateIn,
  type TranslateOptions,
} from './translate';
export type { AppLanguage } from './language';
export { translate } from './translate';

setTranslationLanguage(detectAppLanguage());

interface LanguageState {
  language: AppLanguage;
  refresh: () => void;
}

const useLanguageStore = create<LanguageState>((set, get) => ({
  language: getTranslationLanguage(),
  refresh: () => {
    const language = detectAppLanguage();
    if (language === get().language) return;
    setTranslationLanguage(language);
    set({ language });
  },
}));

export function getAppLanguage(): AppLanguage {
  return useLanguageStore.getState().language;
}

export function refreshAppLanguage(): void {
  useLanguageStore.getState().refresh();
}

export function startAppLanguageListener(): () => void {
  refreshAppLanguage();
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') refreshAppLanguage();
  });
  return () => subscription.remove();
}

export function useTranslation(): {
  language: AppLanguage;
  t: (scope: string, options?: TranslateOptions) => string;
} {
  const language = useLanguageStore((state) => state.language);
  const t = useCallback(
    (scope: string, options?: TranslateOptions) => translateIn(language, scope, options),
    [language],
  );
  return { language, t };
}

export function intlLocale(language: AppLanguage = getAppLanguage()): 'ja-JP' | 'en-US' {
  return language === 'ja' ? 'ja-JP' : 'en-US';
}
