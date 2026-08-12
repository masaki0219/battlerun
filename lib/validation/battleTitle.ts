import { validateUserContent } from './bannedWords';
import { translate } from '../translate';

export const BATTLE_TITLE_MAX_LENGTH = 30;
export const BATTLE_DESCRIPTION_MAX_LENGTH = 200;
export const BATTLE_CATEGORY_MAX_LENGTH = 20;

export function validateBattleTitle(title: string): { ok: boolean; reason?: string } {
  return validateUserContent(title, {
    label: translate('validation.battleTitle'), maxLength: BATTLE_TITLE_MAX_LENGTH, required: true,
  });
}

export function validateBattleDescription(description: string): { ok: boolean; reason?: string } {
  return validateUserContent(description, {
    label: translate('validation.description'), maxLength: BATTLE_DESCRIPTION_MAX_LENGTH,
  });
}

export function validateBattleCategory(label: string): { ok: boolean; reason?: string } {
  return validateUserContent(label, {
    label: translate('validation.teamName'), maxLength: BATTLE_CATEGORY_MAX_LENGTH, required: true,
  });
}
