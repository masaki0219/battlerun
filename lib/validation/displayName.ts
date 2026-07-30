import { BANNED_WORDS } from './bannedWords';

export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 12;

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

/**
 * ニックネームの検証。ニックネームはチーム内ランキング・宣言・応援で他の利用者に
 * 常時表示される最も露出の高いUGCなので、チャレンジ名・宣言メモと同じ禁止語リストを適用する。
 */
export function validateDisplayName(name: string): { ok: boolean; reason?: string } {
  const trimmed = name.trim();
  if (trimmed.length < DISPLAY_NAME_MIN_LENGTH) {
    return { ok: false, reason: 'ニックネームを入力してください' };
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, reason: `ニックネームは${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください` };
  }
  // 制御文字・改行はランキングの表示を壊すため拒否する
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, reason: 'ニックネームに使用できない文字が含まれています' };
  }
  const normalized = normalize(trimmed);
  if (BANNED_WORDS.some((word) => normalized.includes(normalize(word)))) {
    return { ok: false, reason: 'このニックネームは利用できません' };
  }
  return { ok: true };
}
