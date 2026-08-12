# App Store 提出情報（下書き）

最終更新: 2026-08-12

App Store Connectへ転記するための下書き。提出直前に、実際のビルド・有効なデモアカウント・連絡担当者情報と照合すること。

## 公開URL

- Support URL: https://masaki0219.github.io/app-support/zelio/
- Marketing URL: https://masaki0219.github.io/
- Privacy Policy URL: https://masaki0219.github.io/app-support/zelio/privacy.html
- Terms of Service URL: https://masaki0219.github.io/app-support/zelio/terms.html

GitHub Pagesのデプロイ後、ログアウト状態のSafariで4URLが表示できることを確認する。

## App Privacy 回答案

次のデータは「収集する」「ユーザーに関連付けられる」「トラッキングには使用しない」として申告する。利用目的は原則 **App Functionality**。不自然な記録の検証に使う位置・活動データは **Fraud Prevention, Security, and Compliance** も該当する。

| Appleのデータタイプ | ZELIOで扱う内容 |
|---|---|
| Contact Info / Email Address | Firebase Authenticationのメールアドレス |
| Contact Info / Name | Apple／Googleが提供する氏名（確定前の候補）、利用者が確定したニックネーム |
| Health & Fitness / Fitness | 走行・歩行距離、歩数、時間、ペース、活動統計 |
| Location / Precise Location | GPSルート、水平・垂直精度、高度 |
| User Content / Other User Content | 宣言メモ、リアクション、応援、チャレンジ名・説明、通報理由・補足・対象内容の控え |
| Identifiers / User ID | Firebase UID、アプリ内アカウントID、Apple／Googleの認証識別子 |
| Identifiers / Device ID | Expo Push Token（通知先端末の識別子） |
| Purchases / Purchase History | RevenueCat entitlement、商品・購入状態 |

次は現行実装では該当しない。

- Payment Info: 決済情報はApp Storeが処理し、ZELIOはカード番号等へアクセスしない
- User Content / Photos or Videos: 写真アップロード機能はなく、プロフィールはアプリ内アバターアイコンのみ
- Tracking: 広告・データブローカー・他社データとの広告目的の突合を行わない
- Diagnostics / Crash Data: 現時点でクラッシュSDK未導入。導入時は申告を更新する
- Usage Data / Product Interaction: 現時点で分析イベント基盤未導入。導入時は申告を更新する

Appleはアプリ本体だけでなく組み込んだ第三者SDKの収集も含めた申告を求めている。提出時はFirebase、Expo、RevenueCat、Purchases SDKのPrivacy Manifestと最新版の取扱いを再確認する。

参考:

- https://developer.apple.com/app-store/app-privacy-details/
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy

## App Review Information

### 必須入力

- Contact first / last name: `REPLACE_BEFORE_SUBMISSION`
- Contact phone: `REPLACE_BEFORE_SUBMISSION`
- Contact email: `REPLACE_BEFORE_SUBMISSION`
- Sign-in required: Yes
- Demo account username: `REPLACE_BEFORE_SUBMISSION`
- Demo account password: `REPLACE_BEFORE_SUBMISSION`

デモアカウントは審査期間中に失効・削除せず、開催中の公式チャレンジへ参加済みにする。別区分に配置した補助アカウントも維持し、相手がいるランキングを表示できる状態にする。

### Notes（転記用）

```text
ZELIO is a team-based running and walking activity app.

Location access is requested only when the reviewer starts a GPS activity. “Always” location access is used solely to continue recording an activity while the screen is locked or another app is in the foreground. Location collection stops when the activity is stopped or discarded. Detailed GPS routes are visible only to the activity owner.

For an indoor review, the Steps mode can be used without a GPS route. Please note that motion permission is required and challenge credit from Steps mode is capped at 5 km per user per day for fairness.

To test background GPS recording: open the Run tab, select GPS mode, tap START, allow foreground and background location access, then lock the screen or move ZELIO to the background. Return to ZELIO and tap Stop > Stop and Save.

The demo account is already participating in an active official challenge. A second test account has been placed in another faction so the team ranking is visible.

Guideline 1.2 safety features: objectionable text is filtered before profile names, challenge content, and declarations are posted. To report or block a user, open the Challenge tab and tap the ellipsis next to another member's declaration or live-running row. The same safety menu is available from another user's public activity and from challenge details. Choose a report reason and submit; reports are delivered privately to the admin moderation queue. Blocking immediately hides that user's declarations, live presence, ranking entries, and public activities, and prevents reactions, cheers, and related notifications in both directions. Blocked users can be reviewed or unblocked from Profile > Blocked Users. Published support contact: https://masaki0219.github.io/app-support/zelio/

ZELIO Pro is an auto-renewable monthly subscription. Only the monthly plan is offered in this initial release. Purchase restoration is available from Profile > Restore Purchases.

Authentication supports email/password, Sign in with Apple, and Google Sign-In. A social provider name is only suggested locally; the user must confirm a moderated nickname before any public profile is created. If the same email already exists, the app asks the user to authenticate with the existing method and explicitly consent before linking providers to the same Firebase UID.

Account deletion is available in Profile. The app requires recent authentication using the linked provider. For Sign in with Apple accounts, it obtains a fresh authorization code and revokes the Apple token through the native Firebase iOS SDK before deleting the Firebase account and related app data.

Support URL: https://masaki0219.github.io/app-support/zelio/
Marketing URL: https://masaki0219.github.io/
Privacy Policy: https://masaki0219.github.io/app-support/zelio/privacy.html
Terms of Service: https://masaki0219.github.io/app-support/zelio/terms.html
```

審査ノートへは、必要に応じてバックグラウンド記録の短い画面収録を添付する。デモアカウント情報はNotesへ重複記載せず、App Review Informationの専用欄へ入力する。

## 提出直前チェック

- [x] 初回リリース対象をiOSのみに確定（2026-08-12ユーザー決定）。Androidは今回の提出・実機ゲート対象外
- [ ] 現行差分からXcode 26 / iOS 26 SDKを使うArchiveを作成し、App Store Connectへアップロード（2026-04-28以降の必須要件）
- [ ] App Store Connectの更新後の年齢レーティング質問へ回答し、現行UGC・位置情報・課金機能と一致させる
- [ ] Support / Privacy / Termsの公開URLがログアウト状態で200を返す
- [ ] デモアカウントでログインでき、公式チャレンジと相手区分が表示される
- [x] monthly商品だけが審査対象ビルドに表示され、購入・復元できる（2026-08-12ユーザー確認済み）
- [ ] yearly商品は将来用として保持する場合も、App Store Connectで審査提出・販売対象にせず、RevenueCatのCurrent Offeringから外す
- [ ] App Privacy回答が本ファイルと実際のSDK構成に一致する
- [ ] Apple／Google新規登録、同一メールのproviderリンク、provider別再認証・アカウント削除をTestFlight実機で確認する
- [ ] Apple Private Email RelayへFirebase Authenticationの送信元を登録し、非公開メールへの配送を確認する
- [ ] Guideline 1.2の通報・ブロック・投稿前フィルタ・管理者キューを2アカウントで確認する
- [ ] EAS production build / TestFlightでGPS、画面ロック、最大2チャレンジ加算・退出、共有形式の復元、Dynamic Type、VoiceOverを確認する
- [ ] 初回リリースのPro説明・画面・審査ノートに、撤去済みのチャレンジテーマが残っていない
- [ ] 連絡担当者、電話、メール、デモ認証情報のプレースホルダーを置換
