import { validateUserContent } from './bannedWords';

export const DECLARATION_NOTE_MAX_LENGTH = 20;

export function validateDeclarationNote(note: string): { ok: boolean; reason?: string } {
  return validateUserContent(note, { label: 'ひとこと', maxLength: DECLARATION_NOTE_MAX_LENGTH });
}
