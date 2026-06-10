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
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | RevenueCat iOS APIキー |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google サインイン用 Web クライアントID |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google サインイン用 iOS クライアントID |

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

---

## Google / Apple サインイン

### Google サインイン
Firebase Console → Authentication → Sign-in method → Google を有効化し、
Web クライアントID と iOS クライアントID を `.env` に設定してください。

### Apple サインイン
Firebase Console → Authentication → Sign-in method → Apple を有効化してください。
Apple サインインは実機（iOS デバイス）での動作確認が必要です。

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
