import { translate } from './translate';

const REASON_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
  'auth-required': 'battle.joinError.authRequired',
  'invalid-request': 'battle.joinError.invalidRequest',
  'user-not-found': 'battle.joinError.userNotFound',
  'battle-not-found': 'battle.joinError.battleNotFound',
  'battle-not-active': 'battle.joinError.battleNotActive',
  'invite-code-incorrect': 'battle.joinError.inviteCodeIncorrect',
  'category-not-found': 'battle.joinError.categoryNotFound',
  'team-change-locked': 'battle.joinError.teamChangeLocked',
  'membership-data-too-large': 'battle.joinError.membershipDataTooLarge',
  'active-limit': 'battle.joinError.activeLimit',
  'credited-battle-cannot-leave': 'battle.joinError.creditedBattleCannotLeave',
  'invite-code-format': 'battle.joinError.inviteCodeFormat',
  'invite-lookup-limit': 'battle.joinError.inviteLookupLimit',
  'invite-code-not-found': 'battle.joinError.inviteCodeNotFound',
  'invite-code-duplicate': 'battle.joinError.inviteCodeDuplicate',
};

export function userErrorReason(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const details = 'details' in error ? (error as { details?: unknown }).details : null;
  if (!details || typeof details !== 'object') return null;
  const reason = 'reason' in details ? (details as { reason?: unknown }).reason : null;
  return typeof reason === 'string' && reason.length > 0 ? reason : null;
}

/**
 * Keeps app-authored validation messages, while preventing Firebase/Functions
 * implementation details (which may be in a different language) from reaching UI.
 */
export function userFacingError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;

  const reason = userErrorReason(error);
  const translationKey = reason ? REASON_TRANSLATION_KEYS[reason] : undefined;
  if (translationKey) return translate(translationKey);

  const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && code.length > 0) return fallback;

  const message = 'message' in error ? (error as { message?: unknown }).message : undefined;
  return typeof message === 'string' && message.trim().length > 0 ? message : fallback;
}
