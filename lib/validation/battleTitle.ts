import { validateUserContent } from './bannedWords';

export const BATTLE_TITLE_MAX_LENGTH = 30;
export const BATTLE_DESCRIPTION_MAX_LENGTH = 200;
export const BATTLE_CATEGORY_MAX_LENGTH = 20;

export function validateBattleTitle(title: string): { ok: boolean; reason?: string } {
  return validateUserContent(title, {
    label: 'チャレンジ名', maxLength: BATTLE_TITLE_MAX_LENGTH, required: true,
  });
}

export function validateBattleDescription(description: string): { ok: boolean; reason?: string } {
  return validateUserContent(description, {
    label: '説明', maxLength: BATTLE_DESCRIPTION_MAX_LENGTH,
  });
}

export function validateBattleCategory(label: string): { ok: boolean; reason?: string } {
  return validateUserContent(label, {
    label: 'チーム名', maxLength: BATTLE_CATEGORY_MAX_LENGTH, required: true,
  });
}
