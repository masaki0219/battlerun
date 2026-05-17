/**
 * RevenueCat ラッパー
 *
 * ⚠️  react-native-purchases はネイティブモジュールのため Expo Go では動作しない。
 *    EAS カスタムビルドが必要。
 *    EXPO_PUBLIC_REVENUECAT_API_KEY を .env に設定すること。
 *
 * セットアップ手順は MANUAL_SETUP_GUIDE.md を参照。
 */

import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

const API_KEY = process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'] ?? '';

export function initRevenueCat(userId: string): void {
  if (!API_KEY) {
    console.warn('[RevenueCat] API key が未設定です。MANUAL_SETUP_GUIDE.md を参照してください。');
    return;
  }
  Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: API_KEY, appUserID: userId });
}

/** Proプランのエンタイトルメントが有効かを確認 */
export async function checkProEntitlement(): Promise<boolean> {
  if (!API_KEY) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active['pro'] !== undefined;
  } catch {
    return false;
  }
}

/** Proプランを購入し、Firestoreのplan フィールドを更新 */
export async function purchasePro(userId: string): Promise<boolean> {
  if (!API_KEY) {
    console.warn('[RevenueCat] API key が未設定です');
    return false;
  }
  try {
    const offerings = await Purchases.getOfferings();
    const proPackage = offerings.current?.availablePackages[0];
    if (!proPackage) throw new Error('プランが見つかりません');

    const { customerInfo } = await Purchases.purchasePackage(proPackage);
    const isPro = customerInfo.entitlements.active['pro'] !== undefined;

    if (isPro) {
      await updateDoc(doc(db, 'users', userId), { plan: 'pro' });
    }
    return isPro;
  } catch (e: any) {
    // ユーザーがキャンセルした場合は静かに失敗
    if (!e.userCancelled) throw e;
    return false;
  }
}

/** サブスク復元（アプリ再インストール時など） */
export async function restorePurchases(userId: string): Promise<boolean> {
  if (!API_KEY) return false;
  try {
    const info = await Purchases.restorePurchases();
    const isPro = info.entitlements.active['pro'] !== undefined;
    if (isPro) {
      await updateDoc(doc(db, 'users', userId), { plan: 'pro' });
    }
    return isPro;
  } catch {
    return false;
  }
}
