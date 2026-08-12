export type AppLanguage = 'ja' | 'en';

export function resolveAppLanguage(languageCode: string | null | undefined): AppLanguage {
  return languageCode?.toLowerCase() === 'ja' ? 'ja' : 'en';
}
