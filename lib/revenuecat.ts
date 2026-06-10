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
import Constants from 'expo-constants';
import { useAuthStore } from '../stores/authStore';

const API_KEY = process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'] ?? '';

if (!API_KEY) {
  console.warn('[RevenueCat] APIキーが設定されていません。.env の EXPO_PUBLIC_REVENUECAT_API_KEY を確認してください。');
}

// Expo Go では RevenueCat のネイティブストアが使えない
const isExpoGo = Constants.appOwnership === 'expo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPurchases(): any {
  if (isExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-purchases').default;
  } catch {
    console.warn('[RevenueCat] ネイティブモジュールが利用できません（EASビルドが必要）');
    return null;
  }
}

export function initRevenueCat(userId: string): void {
  if (isExpoGo || !API_KEY) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { LOG_LEVEL } = require('react-native-purchases');
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: API_KEY, appUserID: userId });
    // app_user_id が Firebase の uid と一致していることを保証する
    Purchases.logIn(userId);
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

/**
 * Proプランを購入する。
 *
 * Firestoreの`users/{uid}.plan`はRevenueCat Webhook経由で数秒遅れて反映されるため、
 * ここではFirestoreを直接更新せず、RevenueCat entitlementをauthStoreへ即時反映する。
 */
export async function purchasePro(): Promise<boolean> {
  if (!API_KEY) return false;
  const Purchases = getPurchases();
  if (!Purchases) return false;
  try {
    const offerings = await Purchases.getOfferings();
    const proPackage = offerings.current?.availablePackages[0];
    if (!proPackage) throw new Error('プランが見つかりません');

    const { customerInfo } = await Purchases.purchasePackage(proPackage);
    const proEntitlement = customerInfo.entitlements.active['pro'] !== undefined;
    useAuthStore.getState().setProEntitlement(proEntitlement);
    return proEntitlement;
  } catch (e: any) {
    if (!e.userCancelled) throw e;
    return false;
  }
}

/** 購入履歴を復元する。Webhookによる`plan`反映までの間はentitlementで即時判定する */
export async function restorePurchases(): Promise<boolean> {
  if (!API_KEY) return false;
  const Purchases = getPurchases();
  if (!Purchases) return false;
  try {
    const info = await Purchases.restorePurchases();
    const proEntitlement = info.entitlements.active['pro'] !== undefined;
    useAuthStore.getState().setProEntitlement(proEntitlement);
    return proEntitlement;
  } catch {
    return false;
  }
}
