import type { Plan } from '../types';

/**
 * Proプラン判定を1箇所に集約する。
 *
 * Firestore の `users/{uid}.plan` は RevenueCat Webhook 経由で数秒遅れて反映されるため、
 * 購入直後は RevenueCat の entitlement（ローカル即時判定）も合わせて見る。
 * どちらかが Pro なら Pro として扱う。
 */
export function isPro(plan: Plan | undefined, proEntitlement: boolean): boolean {
  return plan === 'pro' || proEntitlement;
}
