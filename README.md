# BattleRun

仲間と合計距離を競うチーム対抗ランニング・ウォーキングアプリ（React Native / Expo）

---

## セットアップ

```bash
npm install
cp .env.example .env  # 各APIキーを設定
npx expo start
```

---

## 環境変数（.env）

| キー | 説明 |
|---|---|
| `EXPO_PUBLIC_FIREBASE_*` | Firebase プロジェクト設定 |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Firebaseと連携するGoogle Web OAuthクライアントID |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | RevenueCat iOS APIキー |

---

## バックグラウンドGPS に関する注意

### Expo Go（開発中）
- **フォアグラウンドのみ**動作します
- アプリをバックグラウンドに移動すると GPS 追跡が停止します
- 開発・テストには問題なく使用できます

### EASカスタムビルド（本番相当）
バックグラウンド追跡を有効にするには以下が必要です：

1. `eas build --profile development` でビルドする
2. `app.json` の `UIBackgroundModes: ["location"]` が有効であること（設定済み）
3. `expo-task-manager` がインストールされていること（インストール済み）

```bash
# EAS Development Build の作成
eas build --profile development --platform ios
```

### なぜ Expo Go でバックグラウンドが動かないか
Expo Go はサンドボックス環境のため、`startLocationUpdatesAsync` が
`LocationTaskManagerError` を返します。カスタムビルドが必須です。

---

## 課金（RevenueCat）

RevenueCat はネイティブモジュールのため **Expo Go では動作しません**。
EASビルド後に動作確認してください。

`.env` の `EXPO_PUBLIC_REVENUECAT_API_KEY` に iOS 用のキーを設定してください。

`users/{uid}.plan` の更新は RevenueCat Webhook（`functions/src/revenuecatWebhook.ts`）が
行います。クライアントは購入直後、RevenueCat の entitlement を `authStore.proEntitlement`
に即時反映して Pro UI を表示します（`lib/pro.ts` の `isPro()` を参照）。
Firestore の `plan` は Webhook 経由で数秒遅れて追従します。

### RevenueCat Webhook の設定

1. シークレットを設定する（本番）:
   ```bash
   firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH
   ```
   任意のランダムな文字列を設定してください（RevenueCat側のAuthorizationヘッダと一致させる）。

2. RevenueCat ダッシュボード → Project settings → Integrations → Webhooks で:
   - URL: デプロイ後に表示される `revenuecatWebhook` のURL
     （例: `https://asia-northeast1-<project-id>.cloudfunctions.net/revenuecatWebhook`）
   - Authorization header: 手順1で設定した値

3. ローカルエミュレータでは `functions/.secret.local`（gitignore済み）の
   `REVENUECAT_WEBHOOK_AUTH=dev-placeholder-token` が使われます。

---

## Cloud Functions / エミュレータ

```bash
cd functions && npm install && npm run build
cd .. && firebase emulators:start --only functions,firestore,auth
```

Firestore ルールのテスト:

```bash
npm run test:rules
```

---

## Expo Push 通知

`functions/src/push.ts` の `sendPushToUser` が `users/{uid}.expoPushToken` 宛に
Expo Push通知を送信する（リアクション・バトル終了・称号獲得・順位変動）。

⚠️ **Expo Go では受信テストできません。** 実機 + EASビルド（development/preview）が必要です。
`registerPushToken`（`lib/notifications.ts`）は `Device.isDevice` と EAS `projectId` の
両方が揃わないとトークンを取得しないため、シミュレータ/Expo Goでは
`users/{uid}.expoPushToken` が保存されず、送信自体がスキップされます。

---

## 認証（メール／Apple／Google）

メールアドレスとパスワードに加え、iOSはApple／Google、AndroidはGoogleに対応します。
ソーシャル初回ログイン時は認証サービスの表示名を直接公開せず、既存の禁止語・12文字制限を通すニックネーム確定画面を挟みます。同一メールの既存アカウントがある場合は、既存の方法で本人確認してFirebase UIDを維持したまま認証方法をリンクします。

ネイティブ認証はExpo Goに含まれないため、development buildまたはTestFlight／ストア版で確認してください。設定には`GoogleService-Info.plist`、`google-services.json`、`app.json`のconfig plugin、`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`が必要です。Androidは利用するEAS／Play署名証明書のSHA-1をFirebaseのAndroidアプリへ登録し、更新後の`google-services.json`を反映してください。

Appleの非公開メールへFirebase Authenticationのメールを届ける場合は、Apple DeveloperでFirebaseの送信元ドメイン／メールアドレスをPrivate Email Relayへ登録します。アカウント削除ではproviderごとに再認証し、Appleは認可コードをFirebase iOS SDKへ渡してトークンを失効してから削除します。

---

## Firestore インデックス

インデックスの変更後は以下でデプロイしてください：

```bash
firebase deploy --only firestore:indexes
```

## Firestore セキュリティルール

```bash
firebase deploy --only firestore:rules
```

写真アップロード停止用のStorageルールと法務ページも同時に反映する場合:

```bash
firebase deploy --only storage,hosting
```
