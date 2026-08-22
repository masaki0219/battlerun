export type RunShareStyle = 'map' | 'route' | 'stats';

export const DEFAULT_RUN_SHARE_STYLE: RunShareStyle = 'stats';

const STORAGE_PREFIX = '@zelio_run_share_include_route';

export function runSharePreferenceKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function parseRunSharePreference(value: string | null): RunShareStyle {
  if (value === 'map' || value === 'route' || value === 'stats') return value;
  // 旧設定のONは「地図付き」、OFFは「距離・時間のみ」として引き継ぐ。
  if (value === '1') return 'map';
  if (value === '0') return 'stats';
  return DEFAULT_RUN_SHARE_STYLE;
}

export function serializeRunSharePreference(value: RunShareStyle): string {
  return value;
}
