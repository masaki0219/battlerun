import { validateUserContent } from './bannedWords';
import { translate } from '../translate';

export const DECLARATION_NOTE_MAX_LENGTH = 20;

export function validateDeclarationNote(note: string): { ok: boolean; reason?: string } {
  return validateUserContent(note, { label: translate('validation.note'), maxLength: DECLARATION_NOTE_MAX_LENGTH });
}
