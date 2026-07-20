export const PENDING_INVITE_CODE_KEY = '@zelio_pending_invite_code_v1';
export const INVITE_WEB_BASE_URL = 'https://zelio-run.web.app/invite';

export function normalizeInviteCode(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z0-9]{6}$/.test(normalized) ? normalized : null;
}

export function inviteWebUrl(code: string): string {
  const normalized = normalizeInviteCode(code);
  if (!normalized) throw new Error('招待コードの形式が不正です。');
  return `${INVITE_WEB_BASE_URL}?code=${encodeURIComponent(normalized)}`;
}

export function inviteAppUrl(code: string): string {
  const normalized = normalizeInviteCode(code);
  if (!normalized) throw new Error('招待コードの形式が不正です。');
  return `zelio://invite?code=${encodeURIComponent(normalized)}`;
}
