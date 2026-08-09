/**
 * 端末の言語設定に応じた装飾ラベルの出し分け。
 *
 * アプリの本文は日本語固定だが、セクション見出しの装飾ラベル
 * （「記録完了 / RUN COMPLETE」等の日英併記）は二重表記がくどいため、
 * 日本語端末では日本語のみ、それ以外の端末では英語のみを表示する。
 * 本格的な i18n を導入する場合はこのモジュールを置き換える。
 */

import { getLocales } from 'expo-localization';

function detectJapanese(): boolean {
  try {
    return getLocales()[0]?.languageCode?.toLowerCase() === 'ja';
  } catch {
    // 判定できない環境では日本語を既定にする（日本語ファーストのアプリのため）
    return true;
  }
}

/** 端末が日本語設定かどうか（起動時に1回判定） */
export const isJapaneseLocale = detectJapanese();

/** 装飾ラベル用: 日本語端末では ja、それ以外では en を返す */
export function decorLabel(ja: string, en: string): string {
  return isJapaneseLocale ? ja : en;
}
