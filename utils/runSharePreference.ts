export const DEFAULT_INCLUDE_ROUTE_IN_SHARE = false;

const STORAGE_PREFIX = '@zelio_run_share_include_route';

export function runSharePreferenceKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function parseRunSharePreference(value: string | null): boolean {
  if (value === '0') return false;
  if (value === '1') return true;
  return DEFAULT_INCLUDE_ROUTE_IN_SHARE;
}

export function serializeRunSharePreference(value: boolean): string {
  return value ? '1' : '0';
}
