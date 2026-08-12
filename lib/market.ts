import type { Market } from '../types';

export const MARKETS: readonly Market[] = ['JP', 'US', 'GLOBAL'];

export function isMarket(value: unknown): value is Market {
  return typeof value === 'string' && MARKETS.includes(value as Market);
}

export function marketFromRegion(regionCode: string | null | undefined): Market {
  const normalized = regionCode?.toUpperCase();
  if (normalized === 'JP') return 'JP';
  if (normalized === 'US') return 'US';
  return 'GLOBAL';
}

export function resolveUserMarket(value: unknown, inferredMarket: Market = 'GLOBAL'): Market {
  return isMarket(value) ? value : inferredMarket;
}

/** Existing public Battles without market are Japanese-market content. */
export function resolveBattleMarket(value: unknown): Market {
  return isMarket(value) ? value : 'JP';
}

export function isBattleVisibleInMarket(battleMarket: unknown, userMarket: Market): boolean {
  const market = resolveBattleMarket(battleMarket);
  return market === 'GLOBAL' || market === userMarket;
}
