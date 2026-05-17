/**
 * RevenueCat ラッパー
 *
 * ⚠️  react-native-purchases はネイティブモジュールのため Expo Go では動作しない。
 *    EAS カスタムビルドが必要。
 *    EXPO_PUBLIC_REVENUECAT_API_KEY を EAS 環境変数に設定すること。
 *
 * セットアップ手順は MANUAL_SETUP_GUIDE.md を参照。
 */

// トップレベルで import するとネイティブモジュール未登録時にクラッシュするため
// require を使って各関数内で遅延ロードする。
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

const API_KEY = process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'] ?? '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPurchases(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-purchases').default;
  } catch {
    console.warn('[RevenueCat] ネイティブモジュールが利用できません（EASビルドが必要）');
    return null;
  }
}

export function initRevenueCat(userId: string): void {
  if (!API_KEY) {
    console.warn('[RevenueCat] API key が未設定です。EAS 環境変数を確認してください。');
    return;
  }
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { LOG_LEVEL } = require('react-native-purchases');
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: API_KEY, appUserID: userId });
  } catch (e) {
    console.warn('[RevenueCat] 初期化エラー:', e);
  }
}

export async function checkProEntitlement(): Promise<boolean> {
  if (!API_KEY) return false;
  const Purchases = getPurchases();
  if (!Purchases) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active['pro'] !== undefined;
  } catch {
    return false;
  }
}

export async function purchasePro(userId: string): Promise<boolean> {
  if (!API_KEY) return false;
  const Purchases = getPurchases();
  if (!Purchases) return false;
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
    if (!e.userCancelled) throw e;
    return false;
  }
}

export async function restorePurchases(userId: string): Promise<boolean> {
  if (!API_KEY) return false;
  const Purchases = getPurchases();
  if (!Purchases) return false;
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
