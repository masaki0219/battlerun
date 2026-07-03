/**
 * 法的情報・App Store審査対応まわりの文言を集約する定数ファイル。
 *
 * URLはプレースホルダー。Masakiが正式な利用規約・プライバシーポリシーの
 * URLに差し替えること。プライバシーポリシーには、位置情報（GPSルート・歩数）と
 * 購入情報（RevenueCat経由のサブスクリプション状態）の取り扱いについて
 * 記載する必要がある（App Store審査ガイドライン 5.1.1 対応）。
 */
export const LEGAL_URLS = {
  termsOfService: 'https://battlerun.app/legal/terms',
  privacyPolicy: 'https://battlerun.app/legal/privacy',
};

/**
 * サブスクリプション購入ボタン周辺に表示する自動更新の説明文。
 * Apple審査ガイドライン 3.1.2（自動更新サブスクリプションの表示要件）対応。
 */
export const SUBSCRIPTION_DISCLAIMER =
  '購入すると自動更新サブスクリプションが開始されます。期間終了の24時間前までにキャンセルしない限り自動的に更新され、更新料金がApple IDに請求されます。App Storeの「サブスクリプション」設定からいつでも管理・キャンセルできます。';
