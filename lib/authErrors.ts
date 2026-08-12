/**
 * Firebase Auth のエラーを日本語のユーザー向け文言へ変換する。
 * `e.message` をそのまま出すと「Firebase: Error (auth/invalid-credential).」のような
 * 英語の生メッセージが日本語UIに出てしまうため、必ずこの関数を通す。
 */
import { translate } from './translate';

const MESSAGE_KEYS: Record<string, string> = {
  'auth/invalid-credential': 'authErrors.invalidCredential',
  'auth/invalid-email': 'authErrors.invalidEmail',
  'auth/user-not-found': 'authErrors.userNotFound',
  'auth/wrong-password': 'authErrors.wrongPassword',
  'auth/user-disabled': 'authErrors.userDisabled',
  'auth/too-many-requests': 'authErrors.tooManyRequests',
  'auth/network-request-failed': 'authErrors.networkFailed',
  'auth/email-already-in-use': 'authErrors.emailInUse',
  'auth/weak-password': 'authErrors.weakPassword',
  'auth/operation-not-allowed': 'authErrors.operationNotAllowed',
  'auth/requires-recent-login': 'authErrors.recentLogin',
  'auth/user-mismatch': 'authErrors.userMismatch',
  'auth/credential-already-in-use': 'authErrors.credentialInUse',
  'auth/provider-already-linked': 'authErrors.providerLinked',
};

export function authErrorMessage(error: unknown, fallback = translate('authErrors.fallback')): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === 'string' && MESSAGE_KEYS[code]) return translate(MESSAGE_KEYS[code]);
  return fallback;
}
