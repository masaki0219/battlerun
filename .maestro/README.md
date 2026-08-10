# Maestro 画面遷移テスト

iOSシミュレータ + Expo Go + ローカルFirebaseエミュレータで、画面遷移を自動操作して確認する。
**本番 `zelio-run` へは接続しない。**

## 必要なもの

- Maestro CLI: `brew tap mobile-dev-inc/tap && brew trust mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro`
  （Homebrewの `maestro` は同名の別製品なので、必ず `mobile-dev-inc/tap/maestro` を指定する）
- iOSシミュレータが1台起動していること
- Java（エミュレータ用）

## 実行手順

`lib/firebase.ts` には**エミュレータ接続コードが入っていない**。実行前に、
`EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1'` のときだけ
`connectAuthEmulator` / `connectFirestoreEmulator` / `connectFunctionsEmulator` を呼ぶ
一時ブロックを追加し、**確認後は必ず `git checkout -- lib/firebase.ts` で戻すこと**。

```bash
# 1. エミュレータ（別ターミナル）
npm run test:ui:emulators

# 2. 公開チャレンジをシード
#    アプリは .env の projectId (zelio-run) で接続するので、同じ名前空間へ入れる
npm run test:ui:seed

# 3. Expo Go でアプリを起動（別ターミナル）
npm run test:ui:app

# 4. フロー実行
npm run test:ui
```

## フロー

| ファイル | 内容 |
| --- | --- |
| `01-auth-screens.yaml` | 未ログイン。ログイン⇄利用規約／プライバシーポリシー／新規登録の往復。Expo Goでのソーシャルログイン非対応表示も確認する。 |
| `02-signup-and-tabs.yaml` | 新規登録 → アプリ本体 → 4タブ巡回 → チャレンジ一覧のチーム名・距離 → プロフィール → ログアウト。 |
| `03-app-screens.yaml` | チャレンジ詳細（VSゲージ・チームランキング・安全メニュー）、統計、通知センター、バッジ、ヘルプ。 |
| `04-record-screen.yaml` | ランタブの開始前状態。モード切替、目標選択、画面OFF位置情報の導線、**GPS未準備ではSTARTで記録が始まらないこと**。 |

各フローは冒頭でログイン状態を検出して未ログインへ揃える／必要なら登録するので、
どの順番・どの状態からでも流せる。

## 対象外（実機が必要）

- **GPS実走**（カウントダウン→記録中HUD→停止ダイアログ→保存→サマリー）。
  アプリは水平精度が基準を満たすまで「GPS 準備中…」でSTARTを受け付けず、
  `simctl location` の疑似位置ではこの基準を満たせない。`04` は代わりに
  「準備できていないあいだは記録を始めない」安全挙動を確認している。
- **Apple／Googleログイン**。Expo Goはネイティブモジュールを読み込まないため、
  `01` は「開発ビルドまたはストア版で利用できます」の表示までしか確認できない。
- Push実配送、RevenueCat購入／復元、バックグラウンド記録。

## 気づいたUI実装の性質

- 公開チャレンジのカードは、タイトル・残り日数・**参加するボタン**・チーム順位が
  **1つのアクセシビリティ要素へまとまっている**。そのため「参加する」だけを個別に
  指定して押すことができず、`03` はカード全体をタップして詳細を開いている。
  VoiceOver利用者から見ると参加ボタンが独立した操作対象にならないため、
  実機のVoiceOver確認時に挙動を見ておくとよい。

## この環境で踏んだ落とし穴

セレクタや手順を変更するときは以下に注意する。

- **テキストは完全一致**。行として結合される要素（`, ログアウト` や `1 朝ラン組 12.4km`）は
  `.*ログアウト.*` のように部分一致で書く。
- **`inputText` は非同期**。入力直後に次の欄をタップすると文字が落ちるので、
  各 `inputText` の後に `waitForAnimationToEnd` を入れる。
- **空欄への `eraseText` は禁止**。以降の `inputText` が1文字しか入らなくなる。
- **パスワード欄はiOSの「強力なパスワードを使用しますか？」シートに奪われる**。
  このシートはアプリのアクセシビリティツリー外のシステムUIでテキスト指定できないため、
  1度入力してシートを出し、右上×を座標（`90%,57%`）で閉じてから入力し直す。
  アプリの `textContentType="newPassword"` は実利用として正しいので変更しない。
- **RNのAlertはタイトルとボタンが同じ文字列**（例: ログアウト）。`text` でも `rightOf` でも
  実行ボタンを特定できないため座標（`68%,56%`）で押す。
- **`back` は効かない**。ヘッダーの「戻る」を明示的に押す。
- **`openLink` だけでは画面状態が残る**。`stopApp` を先に入れる。
- 座標指定は iPhone 17 / iOS 26.4（402x874pt）を前提にしている。別端末では取り直すこと。
