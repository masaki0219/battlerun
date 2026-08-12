import { getLocales } from 'expo-localization';
import type { AppLanguage } from './language';
import { resolveAppLanguage } from './language';
import type { Market } from '../types';
import { marketFromRegion } from './market';

export function detectAppLanguage(): AppLanguage {
  try {
    return resolveAppLanguage(getLocales()[0]?.languageCode);
  } catch {
    return 'en';
  }
}

export function inferMarket(): Market {
  try {
    return marketFromRegion(getLocales()[0]?.regionCode);
  } catch {
    return 'GLOBAL';
  }
}
