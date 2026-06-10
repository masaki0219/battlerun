import { BANNED_WORDS } from './bannedWords';

export const BATTLE_TITLE_MAX_LENGTH = 30;

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

export function validateBattleTitle(title: string): { ok: boolean; reason?: string } {
  if (title.length === 0) {
    return { ok: false, reason: 'バトル名を入力してください' };
  }
  if (title.length > BATTLE_TITLE_MAX_LENGTH) {
    return { ok: false, reason: `バトル名は${BATTLE_TITLE_MAX_LENGTH}文字以内で入力してください` };
  }

  const normalized = normalize(title);
  const hasBannedWord = BANNED_WORDS.some((word) => normalized.includes(normalize(word)));
  if (hasBannedWord) {
    return { ok: false, reason: 'このチーム名は利用できません' };
  }

  return { ok: true };
}
