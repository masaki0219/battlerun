/**
 * RevenueCat ラッパー
 *
 * ⚠️  react-native-purchases はネイティブモジュールのため Expo Go では動作しない。
 *    EAS カスタムビルドが必要。
 *    EXPO_PUBLIC_REVENUECAT_API_KEY を EAS 環境変数に設定すること。
 *
 * セットアップ手順は README.md を参照。
 */

// トップレベルで import するとネイティブモジュール未登録時にクラッシュするため
// require を使って各関数内で遅延ロードする。
import Constants from 'expo-constants';
import { useAuthStore } from '../stores/authStore';

const API_KEY = process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'] ?? '';

// RevenueCatダッシュボードの既存設定に合わせた識別子。ダッシュボード側を正とする。
const PRO_ENTITLEMENT_ID = 'Zelio Pro';

export type ProPlanPeriod = 'monthly' | 'annual';

const PACKAGE_IDS: Record<ProPlanPeriod, string> = {
  monthly: '$rc_monthly',
  annual: '$rc_annual',
};

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

/** この実行環境でアプリ内購入が使えるか。Expo Go・シミュレータ等ネイティブモジュール未リンク環境では false */
export function isStoreAvailable(): boolean {
  return Boolean(API_KEY) && getPurchases() !== null;
}

export async function initRevenueCat(userId: string): Promise<void> {
  if (isExpoGo || !API_KEY) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { LOG_LEVEL } = require('react-native-purchases');
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    // isConfigured() は Promise を返すため await 必須（truthy 判定すると configure が永久に呼ばれない）
    if (await Purchases.isConfigured()) {
      // アカウント切替時は既存SDKセッションへ明示的にログインする。
      await Purchases.logIn(userId);
    } else {
      Purchases.configure({ apiKey: API_KEY, appUserID: userId });
    }
  } catch (e) {
    console.warn('[RevenueCat] 初期化エラー:', e);
  }
}

export interface ProPackageInfo {
  /** ストアがローカライズ済みの価格表記（例: "¥480"） */
  priceString: string;
  /** 課金周期の日本語ラベル（例: "月額"）。パースできない場合は空文字 */
  periodLabel: string;
}

function periodLabelFromIso(period: string | null | undefined): string {
  if (!period) return '';
  if (period.includes('Y')) return '年額';
  if (period.includes('M')) return '月額';
  if (period.includes('W')) return '週額';
  return '';
}

/**
 * Proプラン（月額・年額）の価格・課金周期を取得する（購入ボタン周辺の表示用）。
 * Apple審査ガイドライン3.1.2で、購入前に価格・期間の明示が求められるため。
 * Offering に存在しない周期は結果に含まれない。
 */
export async function getProPlanPrices(): Promise<Partial<Record<ProPlanPeriod, ProPackageInfo>>> {
  if (!API_KEY) return {};
  const Purchases = getPurchases();
  if (!Purchases) return {};
  try {
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    const plans: Partial<Record<ProPlanPeriod, ProPackageInfo>> = {};
    for (const period of Object.keys(PACKAGE_IDS) as ProPlanPeriod[]) {
      const pkg = packages.find((p: { identifier: string }) => p.identifier === PACKAGE_IDS[period]);
      if (pkg) {
        plans[period] = {
          priceString: pkg.product.priceString,
          periodLabel: periodLabelFromIso(pkg.product.subscriptionPeriod),
        };
      }
    }
    return plans;
  } catch {
    return {};
  }
}

export async function checkProEntitlement(): Promise<boolean> {
  if (!API_KEY) return false;
  const Purchases = getPurchases();
  if (!Purchases) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
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
export async function purchasePro(period: ProPlanPeriod): Promise<boolean> {
  const Purchases = getPurchases();
  if (!API_KEY || !Purchases) {
    // 黙って false を返すと呼び出し元がガードを忘れたとき「押しても無反応」に戻るため、理由付きで失敗させる
    throw new Error('この環境ではアプリ内購入を利用できません。実機のEASビルド（開発ビルド / TestFlight）でお試しください。');
  }
  try {
    const offerings = await Purchases.getOfferings();
    const proPackage = offerings.current?.availablePackages.find(
      (p: { identifier: string }) => p.identifier === PACKAGE_IDS[period],
    );
    if (!proPackage) {
      throw new Error(
        'ストアで販売中のプランが見つかりません。App Store Connect のサブスク商品登録と、RevenueCat の Offering 設定を確認してください。',
      );
    }

    const { customerInfo } = await Purchases.purchasePackage(proPackage);
    const proEntitlement = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
    useAuthStore.getState().setProEntitlement(proEntitlement);
    return proEntitlement;
  } catch (e: any) {
    if (!e.userCancelled) throw e;
    return false;
  }
}

/** 購入履歴を復元する。Webhookによる`plan`反映までの間はentitlementで即時判定する */
export async function restorePurchases(): Promise<boolean> {
  const Purchases = getPurchases();
  if (!API_KEY || !Purchases) {
    throw new Error('この環境では購入の復元を利用できません。実機のEASビルド（開発ビルド / TestFlight）でお試しください。');
  }
  try {
    const info = await Purchases.restorePurchases();
    const proEntitlement = info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
    useAuthStore.getState().setProEntitlement(proEntitlement);
    return proEntitlement;
  } catch {
    return false;
  }
}
