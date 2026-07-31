import { validateUserContent } from './bannedWords';

export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 12;

/**
 * ニックネームの検証。ニックネームはチーム内ランキング・宣言・応援で他の利用者に
 * 常時表示される最も露出の高いUGCなので、チャレンジ名・宣言メモと同じ禁止語リストを適用する。
 */
export function validateDisplayName(name: string): { ok: boolean; reason?: string } {
  return validateUserContent(name, {
    label: 'ニックネーム', maxLength: DISPLAY_NAME_MAX_LENGTH, required: true,
  });
}
