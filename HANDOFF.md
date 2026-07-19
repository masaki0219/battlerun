# HANDOFF

最終更新: 2026-07-19

## プロジェクトの目的

仲間と合計距離を競うチーム対抗ランニング・ウォーキングアプリ。React Native / Expo で実装し、Firebase（Firestore）をバックエンド、RevenueCat を課金に使う。GPS によるアクティビティ記録とバトル（対戦）機能が中心。認証は現状メール/パスワードのみ（Google サインインは未実装）。

## 現在の状態

`feat/ui-consolidation` ブランチで作業中。アプリ名（`expo.name` / `CFBundleDisplayName`、ランチャー表示）は `Zelio`、アプリ内UIの見出し等の表記は `ZELIO`、Bundle Identifier / Android package は `com.masaki.zelio`、ディープリンク scheme は `zelio`。

**Firebase は新プロジェクト `zelio-run` へ移行済み**（2026-07-19 に再度方針転換し移行を実施。`.env` / `eas.json` 3プロファイル / `.firebaserc` / `lib/legal.ts` を zelio-run へ更新し、ルール・インデックス・Hosting・Functions 全14関数・シークレット・Authユーザー2件を zelio-run へデプロイ/移行した）。旧 `battlerun-75eb6` は Firestore テストデータのコピー完了を確認するまで残しておくこと。残作業は「未解決・要確認」を参照。

**RevenueCat はダッシュボード設定が正**。コードを以下の既存設定へ合わせた: Entitlement `Zelio Pro` / Offering `default` / Package `$rc_monthly`・`$rc_annual` / Product `monthly`・`yearly`。APIキーは `.env` / `eas.json`（3プロファイル）とも設定済み。

Expo slug `battlerun` と EAS projectId、内部永続化キー（`@battlerun_*` 等）は従来値を維持している。

`inst_v3/BattleRunホーム画面作成.zip`（Figma Make のホーム画面デザイン・最終版）を反映し、パレットをディープパイン系に刷新した。レイアウトの作り直しはホームタブとランタブの2画面に限定し、他画面は `design_tokens.ts` 経由で色だけ追従している。

※ 同フォルダの `BattleRunホーム画面作成 (コピー).zip` は旧版。パレット（`theme.css`）は同一だが、ヒーローが2陣営のVSゲージで、チーム内ランキングが無い。**最終版はこちら（コピーでない方）**。

## 最後に完了したこと

### 未コミット差分のコードレビューと確定バグ修正（2026-07-19）

未コミット差分全体（29ファイル＋新規2ファイル）をレビューし、15件を指摘、うち確定バグを修正した。

- `functions/src/revenuecatWebhook.ts`: `entitlement_ids` が**明示的な空配列**のイベントを誤ってPro扱いする退行を修正。空配列はPro対象外、`entitlement_ids` / `entitlement_id` の両方が欠落しているときだけ従来どおりPro扱い。**修正は未デプロイ**（「未解決・要確認」参照）。
- `app/_layout.tsx`: `initRevenueCat` の完了を待ってから `checkProEntitlement` を実行するよう変更。コールドスタートで configure 前に `getCustomerInfo` が走り、Proユーザーでも entitlement が false 上書きされる競合を解消。
- `utils/dateInput.ts` を新設し、`pad2` / `formatDateInput` / `parseLocalDate` / `addDays` を共通化（`app/admin/battle/new.tsx`・`components/battle/PeriodPicker.tsx`・`app/(tabs)/battle.tsx` の3重複製を解消）。
- `app/(tabs)/battle.tsx` の私的チャレンジ作成: 日付を `new Date('YYYY-MM-DD')`（UTC解釈＝JSTで朝9時締切）からローカル解釈＋終了日23:59:59へ変更し、admin側・PeriodPickerの「23:59まで」表示と整合させた。「終了日≦開始日」の拒否も追加（従来はadmin側にのみ存在）。
- `components/battle/PeriodPicker.tsx`: 「1ヶ月」プリセットの月末繰り越しを修正（1/31開始→2/28。従来は3/2になった）。ネイティブピッカーがマウント時に落ちる環境（datetimepicker追加前のネイティブビルド）を手入力へフォールバックするエラーバウンダリを追加（遅延requireのtry/catchだけではマウント時エラーを拾えないため）。
- `lib/revenuecat.ts`: `purchasePro` / `restorePurchases` が購入不可環境で黙って false を返す代わりに、理由付きエラーを投げるよう変更（将来の呼び出し元で「押しても無反応」が再発しないように）。
- `app.json`: アプリ名を `Zelio` に統一（`expo.name` と `CFBundleDisplayName` の両方。従来は `Zelio` / `ZELIO` が混在し、iOSとAndroidで表示名が割れていた）。
- `scripts/migrate-firestore-to-zelio.js`: 鍵ファイル2つの `project_id` を検証し、不一致なら即終了・コピー方向を表示するよう変更（鍵の取り違えによる逆方向コピー防止）。

確認: `npx tsc --noEmit`、`functions` の `npm run build`、`npx expo export --platform ios` すべて成功。`addOneMonth` とWebhookのentitlement判定は node で境界ケース（1/31、空配列、旧形式単数など）を実測確認。`npm run test:rules` は未実行（今回ルール変更なし）。画面の実機目視は未実施。

### 購入不可環境で購入ボタンが無反応になる問題を修正（2026-07-19）

- Expo Go・シミュレータでは react-native-purchases が使えず `purchasePro()` が黙って false を返すため、Proカードの購入・復元ボタンが「押しても何も起こらない」状態だった。`lib/revenuecat.ts` に `isStoreAvailable()` を追加し、`profile.tsx` の購入・復元ハンドラで不可環境なら理由のアラート（実機EASビルドが必要）を表示するようにした。`npx tsc --noEmit` 成功。
- 購入フローの実テストは従来どおり「実機 + EAS ビルド + App Store Connect のサブスク商品登録 + Sandbox テスター」が必要（商品登録は未実施、「その次の候補」参照）。
- 追記: 再ビルド後の購入テストで「購入に失敗しました」となったのは、ASC に商品が無く Offering の availablePackages が空 →「プランが見つかりません」を汎用 catch が握りつぶしていたため。`profile.tsx` の購入エラーアラートに実際のエラーメッセージを表示するよう変更し、`purchasePro` のパッケージ未発見メッセージも原因（ASC 商品登録 / RevenueCat Offering）を示す文言にした。
- **追記2（重要バグ修正）**: エラー表示改善で「There is no singleton instance」が判明。`initRevenueCat` の `if (Purchases.isConfigured())` は Promise（v10 は非同期 API）を truthy 判定していたため常に logIn 分岐へ進み、**`configure()` が一度も呼ばれていなかった**。`await` を追加して修正。2026-07-19 のアカウント切替対応で入った退行で、それ以降 RevenueCat は実質未初期化だった。

### チャレンジ作成フォームの期間設定を刷新（2026-07-19）

- `YYYY-MM-DD` の手打ちテキスト2つを廃止し、共通コンポーネント `components/battle/PeriodPicker.tsx` に置き換えた（pro用の `PrivateBattleCreateForm` と admin の `app/admin/battle/new.tsx` の両方。admin のシーズン期間入力は従来どおりテキスト）。
- PeriodPicker の構成: 「いつから」（今日から/明日から/月曜から + カレンダー）×「どのくらい」（1週間/2週間/1ヶ月 + 終了日カレンダー）のチップ選択、常時表示の要約（`7月19日(土) 〜 8月1日(金)` + `14日間・終了日の23:59までの記録が集計されます`）、不正時（終了<開始）のインラインエラー。開始日を動かすと設定済みの日数を保って終了日が追従する。親フォームとの受け渡しは従来の `YYYY-MM-DD` 文字列のままなので、`battle.tsx` / `new.tsx` の送信ロジックとバリデーションは無変更。
- pro用フォームに補足文言を追加: 「区分リスト」→「チーム分け」に改称し1行説明を追加、ランキング方式の選択に応じた説明（平均=人数差があっても公平 / 合計=人数が多いほど有利）を表示。
- `@react-native-community/datetimepicker` を `npx expo install` で追加（Expo Go 対応。app.json の plugins にも自動追加済み）。iOS はインラインカレンダー、Android は標準ダイアログ表示。
- `npx tsc --noEmit` と `npx expo export --platform ios` は成功。**実機/シミュレータでの目視は未実施**（特に iOS インラインカレンダーの表示幅と、Android ダイアログの挙動は要確認）。
- **追記（クラッシュ対応）**: datetimepicker 追加前に生成した `ios/` のネイティブビルドには RNDateTimePicker が入っておらず起動時クラッシュした。PeriodPicker を遅延 require + try/catch に変更し、ネイティブが無い環境ではカレンダーの代わりに YYYY-MM-DD 手入力へフォールバックするようにした（チップと要約は全環境で動く）。ネイティブビルドでカレンダーを使うには `npx expo prebuild --platform ios --clean` で再生成してリビルドが必要。Expo Go は SDK 54 に 8.4.4 が同梱されているのでそのまま動く（`npm install` 後は Metro を `npx expo start -c` で再起動すること）。

### battles ルールの list 拒否バグ2件を修正（2026-07-19）

- 管理画面の「チャレンジの取得に失敗しました」の原因を修正。`allow read: if canReadBattle(battleId)` は関数内で対象ドキュメントを `get()` するため、ID が未確定な list（コレクションクエリ）では常に拒否されていた。`allow get`（従来どおり canReadBattle）と `allow list`（admin なら無条件、認証済みなら `resource.data.type == 'public'` の絞り込み必須）に分割した。ホームの公開チャレンジ一覧も同じ理由で壊れていたはず。
- あわせて `canReadBattle` 内の `battle.exists()`（ルール言語に存在しないメソッド。デプロイ時警告 `Invalid function name: exists` の正体）を `exists(パス)` 関数へ修正。これにより private チャレンジの単品取得が常に評価エラー→拒否になっていた問題も解消。
- `tests/firestore-rules.test.ts` に battles の get/list テスト5件（admin 全件一覧・public 絞り込み一覧・非 admin 全件拒否・参加者の単品取得・非参加者の拒否）と admin ユーザーのシードを追加。**ローカルに Java（openjdk 26）が入ったため `npm run test:rules` が実行可能になり、全32件成功**。修正済みルールは zelio-run へデプロイ済み。
- Gmail アカウント（users/taGT1I70igbLkf71NSm2Hx0Tsdh1）に `role: 'admin'` を設定済み（zelio-run と battlerun の両方。公開チャレンジ作成用）。

### Firebase を zelio-run へ移行（2026-07-19）

- `.env` / `eas.json`（3プロファイル）/ `.firebaserc`（default を zelio-run、alias `battlerun` を旧プロジェクトに）/ `lib/legal.ts` を zelio-run の設定値へ更新した。`npx tsc --noEmit` 成功。
- zelio-run へデプロイ済み: Firestore ルール＋インデックス、Storage ルール、Hosting 法務ページ（https://zelio-run.web.app/legal/terms.html / privacy.html）、Functions 全14関数（Webhook URL は https://us-central1-zelio-run.cloudfunctions.net/revenuecatWebhook に変わった）。
- シークレット `REVENUECAT_WEBHOOK_AUTH` を battlerun から zelio-run へコピーした（値は同一）。
- Auth ユーザー2件を UID・メール保持でインポートした。**パスワードハッシュはプロジェクト固有の SCRYPT パラメータ（コンソールのみで取得可）が必要なため未移行**。ログインには各アカウントでパスワード再設定が必要。
- battlerun の Storage バケットは空（オブジェクト0件）で移行不要。
- Firestore データ（activities 19 / battles 5 / publicProfiles 2 / seasons 6 / teams 2 / users 2）は `scripts/migrate-firestore-to-zelio.js` でコピーできる状態。実行には zelio-run のサービスアカウントキー（`service-account-zelio.json`）が必要で未実施。

### iOSネイティブプロジェクトの再生成（2026-07-19）

- `npx expo prebuild --platform ios --clean` で `ios/` を作り直した。旧 `BattleRun.xcworkspace` は削除され、以後は **`ios/ZELIO.xcworkspace`** を開くこと。
- 再生成後の確認済み項目: Bundle ID `com.masaki.zelio`、`CFBundleDisplayName` `ZELIO`、URLスキーム `zelio`、位置情報の使用目的文言、entitlements（`aps-environment` ＋ Sign in with Apple）。Pod は112依存すべてインストール成功。
- `ios/` はgit管理外（`.gitignore` 済み）。ネイティブ設定はすべて `app.json` が正であり、`ios/` 内を直接編集しないこと。

### RevenueCatダッシュボード設定へのコード追従（2026-07-19）

- Entitlement 判定を `'pro'` → `'Zelio Pro'` へ変更（`lib/revenuecat.ts` の `PRO_ENTITLEMENT_ID` 定数と `functions/src/revenuecatWebhook.ts`）。Firestore の `users/{uid}.plan` の値 `'pro' | 'free'` は内部値なので変更していない。
- Webhook は `event.entitlement_ids`（配列）と `event.entitlement_id`（旧形式・単数）の両方を安全に確認する。どちらも無いイベントは従来どおり Pro 対象として扱う。
- `availablePackages[0]` による購入を廃止し、`$rc_monthly` / `$rc_annual` を Package identifier で明示取得する構成へ変更（`getProPlanPrices()` / `purchasePro(period)`）。
- プロフィールの Pro カードに月額/年額の選択UI（ラジオ型の2択、価格はストアから動的取得）を追加。Offering に片方しか無い場合は自動でそちらへフォールバックする。
- Firebase 設定を `battlerun-75eb6` へ戻した（`.env` / `eas.json` 3プロファイル / `.firebaserc` / `lib/legal.ts` の法務ページURL）。
- `npx tsc --noEmit`、`functions` の `npm run build`、`npx expo export --platform ios` すべて成功。

### ZELIOへのブランド名変更とFirebase新プロジェクト移行（2026-07-18）

- `app.json`: `expo.name` / `CFBundleDisplayName` を `ZELIO`、`ios.bundleIdentifier` と `android.package` を `com.masaki.zelio`、`scheme` を `zelio` へ変更した。slug と EAS projectId は据え置き。
- アプリ内UI、共有テキスト・透かし（`#ZELIO`）、通知文、アプリ内法務ページ、Hosting用HTML の表示ブランドを `ZELIO` へ統一した。
- Firebase 新規プロジェクト `zelio-run`（表示名 ZELIO）を CLI で作成し、Webアプリを登録した。
- Firestore `(default)` を asia-northeast1 に作成し、`firestore.rules` / `firestore.indexes.json` をデプロイした。
- Hosting へ法務ページをデプロイした（https://zelio-run.web.app/legal/terms.html / privacy.html）。`lib/legal.ts` のURLも更新した。
- `.firebaserc` / `eas.json`（3プロファイル）/ `.env` を zelio-run の設定値へ更新した。RevenueCat APIキーは新プロジェクト未作成のため空にした。
- `npx tsc --noEmit` と `npx expo export --platform ios` はエラーなしで完了した。

### リリース前レビュー対応

- 活動の公開メタデータと本人専用GPSルートを分離。旧形式で route を含む活動は本人だけ読めるルールへ変更した。
- クライアントからの activities 直接作成を禁止し、`submitActivity` Callableで認証、時刻、速度、GPSルート、歩数、反映先チャレンジをサーバー検証する構成へ変更した。
- GPSルートを500点単位のチャンクへ分割し、Firestore 1MiB上限を回避した。
- 記録中セッションをAsyncStorageへ5秒間隔で保全し、停止後の未送信記録をキューへ保存。通信失敗後は次回オンライン時に再送する。
- `aggregateActivity` をバトル単位で冪等化。Functions再試行時の二重加算を防ぎ、サーバー確定の順位 before/after を活動へ保存する。
- `users` を本人・admin限定へ変更し、ランキング用の最小公開情報を `publicProfiles` に分離した。
- `storage.rules` を追加し、アバターの本人書き込み、画像形式、5MB上限を定義した。
- バッジ付与・累計値再計算をFunctionsへ移し、クライアント自己付与を禁止した。
- 陣営変更は未記録時だけ許可し、過去距離と平均値が別陣営へ残る不整合を防止した。
- チーム内順位・自分の距離・直近活動をリアルタイム購読へ変更。ラン直後にホームが古い値のまま残る問題を修正した。
- 開催中チャレンジから結果画面へ入れないようにし、終了後通知は結果画面へ遷移するよう変更した。
- 同率順位と全陣営0km時の「順位なし」を導入。平均戦の逆転目安を個人が必要な距離へ補正し、相手が増やさない場合の目安であることを明記した。
- 称号表示を「MVP」から「優勝／準優勝陣営メンバー」へ修正し、サーバー側も同率順位を公平に扱うよう変更した。
- チーム内ランキングの遷移先に実際の陣営内Top10を追加した。
- 通知権限をログイン直後に要求せず、参加直後またはプロフィールの明示操作で要求するよう変更した。終了前ローカル通知のディープリンクキーも修正した。
- 利用規約、プライバシーポリシー、ヘルプをアプリ内へ追加。Firebase Hosting用HTMLとhosting設定も追加した。
- iOS/Androidの位置情報・モーション権限を明示し、iOSネイティブInfo.plistの不要なカメラ・マイク・HealthKit文言を除去した。
- 共通ボタン、タブ、開始・停止、主要アイコンへアクセシビリティ属性を追加し、「バトル／作戦／出撃」の主要文言を「チャレンジ／ラン」へ整理した。
- RevenueCat Webhookにイベント順序・重複チェックを追加し、SDKのアカウント切替初期化も修正した。
- アカウント削除で公開プロフィール、GPSルートチャンク、旧参加データ、Storage画像まで削除するよう強化した。

- **パレット刷新**: `Colors.primary` `#00D9A3` → `#087B73`（ディープパイン）、`Colors.accent` `#FF5C2B` → `#EF7136`、背景 `#F3F6F5`、テキストをパイン寄りのインクへ。`DarkColors` もネイビー系からパイン系（`#0B2724` / `#123B37`）へ移行し、ライト面とダーク面の色相を地続きにした。
- **ホームタブ** `app/(tabs)/battle.tsx`: ヘッダーを背景と地続きの2段組（BATTLE RUN + 大見出し）に、通知ボタンを白の角丸ボタン化。週間カードに「週合計距離」の大数値と先週比チップを追加。「他のバトル」の点線ディバイダーを見出し＋セグメントに整理。
- **ヒーローカード** `ActiveBattleHero`: 白カード → ディープパインのダークカード。中身は「全陣営の縦棒チャート（`components/viz/FactionColumns.tsx` 新規）＋ 自陣営の順位・首位との差 ＋ 逆転ペース ＋ フッター3列（あなた / チーム内順位 / 次順位までの差）」。2陣営のVSゲージから全陣営表示に変更した。
- **チーム内ランキング**（新規セクション）: `components/battle/TeamRankingCard.tsx` ＋ `hooks/useTeamRanking.ts`。自陣営の上位3名と自分の行を表示。participants サブコレクション（`categoryId` / `totalDistanceKm`）を読んで陣営内で並べ替え、名前解決は上位3件のみに限定している（全員分 users を引かないため）。
- **一覧カード** `PublicBattleCard`: 参加導線をカード下部のボタンからヘッダー右の「参加する」ボタンへ集約。`JoinRecommendationCard` はオレンジ強調からブランド（ティール）カードへ。
- **ランタブ** `app/(tabs)/record.tsx`: 見出しをホームと同じスケールに。START ボタンとモード切替を新パレットへ。記録中HUDはダーク面トークン追従でパイン系に。
- **タブバー** `app/(tabs)/_layout.tsx`: 中央のランボタンを背景色のリングで浮かせる表現に。
- 新規トークン: `Colors.primaryBorder` / `chartTrack`、`DarkColors.surfaceDeep` / `chip` / `marker` / `decor` / `decorLine` / `primarySoft` / `accentSoft`、`BorderRadius['2xl']`、`Card` の `brand` variant。
- 新規純関数: `utils/displayStats.ts` の `weekOverWeek()`（先週比チップ用）と `weekStartLabel()`（「4月15日〜」の見出し用）。
- `VersusGauge` はヒーローから外れたが、`JoinRecommendationCard` と `battle/[id]` で引き続き使用中。

## 次にやること

App Store Connect で Bundle ID `com.masaki.zelio` のアプリ「Zelio」を登録してサブスク商品 `monthly` / `yearly` を作成し、`eas build --profile production --platform ios` → Sandbox テスターで購入・復元と `users/{uid}.plan` が `pro` になることを確認する。

## その次の候補
- App Store ConnectでBundle ID `com.masaki.zelio` のアプリ「ZELIO」を登録し、サブスク商品 `monthly` / `yearly` を作成する（プライバシーポリシーURLは https://zelio-run.web.app/legal/privacy.html）
- `eas build --profile production --platform ios` で本番ビルドを作成する（初回は新Bundle ID用の証明書・プロビジョニング作成を求められる。RevenueCat APIキー設定後に行うこと）
- Sandboxテスターで月額・年額それぞれの購入と復元を確認し、`users/{uid}.plan` が `pro` になることを確認する
- Firestore データ移行と動作確認の完了後、旧 `battlerun-75eb6` プロジェクトの削除（または凍結）を検討する
- ローカル `ios/` は旧設定（com.battlerun.app）のまま。ローカルでネイティブビルドする場合は `npx expo prebuild --platform ios --clean` で再生成する
- masaki0219/app-support（GitHub Pages）の docs/battlerun/ 配下サポートページをZELIO表記へ同期する
- `RELEASE_TEST_CHECKLIST.md` のDay-0、GPS保存、再送、ランキング反映、アカウント削除を2アカウントの実機で通す
- `feat/ui-consolidation` を origin へ push し、`main` へマージするか判断する
- 使われていないブランチ `feat/ui-refresh` / `feat/ui-redesign` を整理する
- `package.json` に `typecheck` / `lint` スクリプトを追加する（現在は `test:rules` のみ）
- バックグラウンドGPS を EAS development build で確認する（Expo Go ではフォアグラウンドのみ）
- `RELEASE_TEST_CHECKLIST.md` に沿ったリリース前確認

## 未解決・要確認

- `EXPO_PUBLIC_REVENUECAT_API_KEY` は `appl_RRF…`（.env側の値）が正と確認され、`eas.json` 3プロファイルを統一済み（2026-07-19）。
- 修正済み `revenuecatWebhook` のデプロイと zelio-run 残作業（Auth メール/パスワード有効化、Firestore データコピー、RevenueCat Webhook URL 変更）はユーザー報告により完了（2026-07-19）。
- PeriodPicker のエラーバウンダリ（ネイティブ欠落時の手入力フォールバック）は実機未確認。datetimepicker 追加前のネイティブビルドで「日付を選ぶ」をタップして手入力に切り替わることを確認するとよい。
- 2026-07-19 の functions デプロイで `revenuecatWebhook` が「No changes detected」でスキップされた＝それ以前に現行ソースでデプロイ済みだったことを意味する（他13関数は今回更新）。Webhook が us-central1 なのに対し Firestore トリガー系は asia-northeast1 と、リージョンが混在している点は把握しておく。
- RevenueCat 側 Webhook 設定の URL（us-central1 の revenuecatWebhook）と Authorization ヘッダが `REVENUECAT_WEBHOOK_AUTH` シークレットと一致しているかは、ダッシュボードで要確認（コード側からは確認不可）。
- zelio-run 移行の残作業（Auth メール/パスワード有効化・Firestore データコピー・Webhook URL 変更）はユーザー報告により完了。移行した Auth ユーザー2件のパスワード再設定は各アカウントの「パスワードを忘れた」から行う（未実施の場合）。
- 月額/年額選択UIは実機目視未確認。RevenueCat の Offering に `$rc_monthly` / `$rc_annual` の両方が存在する前提（片方のみでも動作するが要確認）。
- サポート窓口の実アドレスと App Store Connect 登録情報は公開後に確認する。
- Expo依存は `expo ~54.0.35`、`expo-font ~14.0.12`、`expo-router ~6.0.24` へ更新済み。Expo Doctorは18/18合格。
- `npm audit --omit=dev` は34件（critical 1 / high 4）。Criticalの`shell-quote`とHighの`@grpc/grpc-js` / `protobufjs` / `ws`は親依存の許容範囲内に修正版があり、`npm audit fix`（`--force`なし）で更新可能。Highの`undici`はFirebase 10.14.1が6.19.7へ固定しており、完全解消にはFirebase 12系へのメジャー更新と回帰検証が必要。開発依存込みでは`form-data`が加わりcritical 1 / high 5。`npm audit fix --force`は未適用。
- Firestoreルールテストはローカルの Java（openjdk 26）でエミュレータ実行できるようになった。2026-07-19 時点で全32件成功。
- ブラウザ操作環境へ接続できず、今回追加・変更した画面は実機目視が必要。
- `submitActivity` はサーバーで距離を再計算するが、Firebase App Checkのネイティブ導入は未実施。stagingで動作確認後、改造クライアント対策として導入を検討する。

- **画面の目視確認が未実施**。今回実行したのは `npx tsc --noEmit`（エラーなし）と `npx expo export --platform ios`（バンドル成功）のみ。レイアウト崩れの有無は未確認。
- `FactionColumns` のバー高さは **0起点ではなく「最下位〜首位」で正規化**している（僅差だと全部同じ高さに潰れて順位が読めないため。最下位でも 32% は残す）。各バーの上に実数値 km を出して誤読を防いでいるが、スケールの妥当性は要レビュー。
- `useTeamRanking` は participants サブコレクションを全件読む（既存の `useBattleParticipants` と同じ方式）。大規模バトルでは読み取り件数が増える。上位3名の users 読みは3件に固定。
- ダーク面（記録中HUD・結果画面）がパイン系に変わったため、`battle/result/[id].tsx` など今回レイアウトを触っていないダーク画面の見え方は要確認。
- `app/battle/theme.tsx` の `sports` テーマだけ新ブランド色に合わせた。他テーマ（RPG / ホラー等）の hex は意図的にそのまま。
- `feat/ui-consolidation` を `main` へマージする予定かどうかは不明。31 コミット分が未 push のままローカルにのみ存在する。
- `npm run test:rules` は Firebase エミュレータ（`firebase emulators:exec`）が必要。未実行（今回の変更は UI のみでルールに影響しない）。
- `firestore-debug.log` がリポジトリ直下にあるが gitignore 済み。

## 起動方法

```bash
npm install
cp .env.example .env   # 各APIキーを設定
npx expo start
```

バックグラウンドGPS を確認する場合は EAS development build が必要。

```bash
eas build --profile development --platform ios
```

## 確認方法

```bash
npx tsc --noEmit                # 型チェック（npmスクリプト未定義）
npx expo export --platform ios  # Metro でバンドルが通るかの確認（シミュレータ不要）
npm run test:rules              # Firestore ルールのテスト（Firebase エミュレータ必要）
```

2026-07-19 時点: `npx tsc --noEmit`、`functions` の `npm run build`、`npx expo export --platform ios` 成功（レビュー後の修正込み）。`npm run test:rules` は全32件成功（ルール最終変更時に実行。以後ルール変更なし）。

## 重要なファイル

- `app/battle/`: バトル画面。Phase 4 で表示を分割した箇所。
- `app/(tabs)/`, `app/record/`, `app/activity/`: 記録・アクティビティ画面。
- `design_tokens.ts`: 色・スペーシングなどのデザイントークン。UI 統合の基準。
- `firestore.rules`: Firestore セキュリティルール。`tests/` にルールテストがある。
- `stores/`, `hooks/`, `lib/`: 状態管理とロジック。
- `OPERATIONS.md`: 運用手順。
- `RELEASE_TEST_CHECKLIST.md`: リリース前チェックリスト。

## 実装上の決定事項

- 色は `design_tokens.ts` から参照し、コンポーネントに hex リテラルを直接書かない。直近のコミットはコメント中の hex まで除去して「受け入れ grep」をクリーンに保っている。
- 環境変数は `EXPO_PUBLIC_*` プレフィックスで `.env` から読む（Firebase / RevenueCat / Google サインイン）。
- バックグラウンド位置情報は `UIBackgroundModes: ["location"]` と `expo-task-manager` で対応済み。Expo Go では動作しない。

## 作業再開時の注意

- `main` ではなく `feat/ui-consolidation` にいる。ブランチを確認してから作業を始める。
- `service-account.json`、`.env`、`firestore-debug.log` は gitignore 済み。**中身をコードやドキュメントへ転記しない。**
- `ios/` はネイティブプロジェクトが生成済み。prebuild をやり直すと手を入れた設定を上書きする可能性がある。
