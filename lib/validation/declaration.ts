import { BANNED_WORDS } from './bannedWords';

export const DECLARATION_NOTE_MAX_LENGTH = 20;

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

export function validateDeclarationNote(note: string): { ok: boolean; reason?: string } {
  const trimmed = note.trim();
  if (trimmed.length > DECLARATION_NOTE_MAX_LENGTH) {
    return { ok: false, reason: `ひとことは${DECLARATION_NOTE_MAX_LENGTH}文字以内で入力してください` };
  }
  const normalized = normalize(trimmed);
  if (BANNED_WORDS.some((word) => normalized.includes(normalize(word)))) {
    return { ok: false, reason: 'このひとことは利用できません' };
  }
  return { ok: true };
}
