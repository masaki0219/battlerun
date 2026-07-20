# HANDOFF

最終更新: 2026-07-20

## プロジェクトの目的

仲間と合計距離を競うチーム対抗ランニング・ウォーキングアプリ。React Native / Expo で実装し、Firebase（Firestore）をバックエンド、RevenueCat を課金に使う。GPS によるアクティビティ記録とバトル（対戦）機能が中心。認証は現状メール/パスワードのみ（Google サインインは未実装）。

## 現在の状態

`feat/ui-consolidation` ブランチで作業中。アプリ名（`expo.name` / `CFBundleDisplayName`、ランチャー表示）は `Zelio`、アプリ内UIの見出し等の表記は `ZELIO`、Bundle Identifier / Android package は `com.masaki.zelio`、ディープリンク scheme は `zelio`。

**Firebase は新プロジェクト `zelio-run` へ移行済み**（2026-07-19 に再度方針転換し移行を実施。`.env` / `eas.json` 3プロファイル / `.firebaserc` / `lib/legal.ts` を zelio-run へ更新し、ルール・インデックス・Hosting・Functions 全14関数・シークレット・Authユーザー2件を zelio-run へデプロイ/移行した）。旧 `battlerun-75eb6` は Firestore テストデータのコピー完了を確認するまで残しておくこと。残作業は「未解決・要確認」を参照。

**RevenueCat はダッシュボード設定が正**。コードを以下の既存設定へ合わせた: Entitlement `Zelio Pro` / Offering `default` / Package `$rc_monthly`・`$rc_annual` / Product `monthly`・`yearly`。APIキーは `.env` / `eas.json`（3プロファイル）とも設定済み。

Expo slug `battlerun` と EAS projectId、内部永続化キー（`@battlerun_*` 等）は従来値を維持している。

**デプロイ方針（2026-07-20 ユーザー許可済み）**: 実装に伴う Firebase Functions / Firestore ルールは、必須テストとビルドが成功した後、Codexが `zelio-run` へデプロイしてよい。都度の再確認は不要。対象プロジェクトを明示し、完了・失敗を報告すること。commit / push / reset / rebase は従来どおり別途ユーザー許可が必要。

`inst_v3/BattleRunホーム画面作成.zip`（Figma Make のホーム画面デザイン・最終版）を反映し、パレットをディープパイン系に刷新した。レイアウトの作り直しはホームタブとランタブの2画面に限定し、他画面は `design_tokens.ts` 経由で色だけ追従している。

※ 同フォルダの `BattleRunホーム画面作成 (コピー).zip` は旧版。パレット（`theme.css`）は同一だが、ヒーローが2陣営のVSゲージで、チーム内ランキングが無い。**最終版はこちら（コピーでない方）**。

## 最後に完了したこと

### リリースレビュー Rev.2 の実装対応（2026-07-20）

- 作業開始前の既存差分を `10079b2 feat: ランニング体験とチーム機能を拡充` として `origin/feat/ui-consolidation` へpushした。その後の本節の変更は未コミット・未push。
- P0: オンボーディングの旧ブランドとCTAを修正し、オートポーズを初期OFFかつ「試験的」に変更。停止確認へ二重確認つき「破棄」を追加した。ZELIO Hosting用のサポートページ、アプリ内問い合わせ導線、同期したプライバシー文面、App Privacy回答案と英語審査ノートを `APP_STORE_SUBMISSION.md` に追加した。
- GPS: RoutePointとサーバー保存へ水平/垂直精度を追加。距離は80m超を端末・サーバーで除外、開始点は50m以内まで保留、オートポーズは35m以内だけで判定する。推定獲得標高は垂直精度20m超を除外し、3点移動平均と3mヒステリシスを適用。UI表記を「推定獲得標高」に統一した。閾値は暫定で、米沢市内の実走ログに基づく再調整が必要。
- 公平性: 歩数活動の個人履歴は全距離を残しつつ、チャレンジ加算は参加者・チャレンジ・東京時間の日付ごとに5kmを上限化した。Functionsのトランザクションで競合を防ぎ、活動削除時は実際の加算距離だけを戻す。日次加算値をクライアントから作成・改変できないルールテストも追加した。
- 招待: `https://zelio-run.web.app/invite?code=XXXXXX`、OS共有シート、`zelio://invite`、未認証時のコード一時保存、登録/ログイン後の参加フォーム自動入力を追加した。未インストール時のWebフォールバックはコードを表示・コピーする。App Storeの正式掲載URLが未確定のため、ストアへの直接誘導だけは未実装。
- チャレンジ運用: 新規ユーザーのおすすめを終了日時が最も近い1件へ決定的に集約し、少人数時の文言を改善。`OPERATIONS.md` に週次担当・作成期限・テストユーザー配置・参加者0〜2人の受け入れ基準を明文化した。実際の公式チャレンジ作成と担当者決定は運用作業として未実施。
- サマリー: 本人専用ルートチャンクを読み込み、ペース色・kmマーカーつき地図を画面と共有画像へ追加。旧デッドコードのルートモーダルを削除した。FunctionsランタイムをNode.js 22へ変更し、rootに `typecheck` / `test` scriptsを追加。`npm audit fix`（`--force`なし）をroot/functionsへ適用した。
- 確認は `npm run typecheck`、Functions build、unit tests（GPS品質・歩数上限・招待を追加）、Firestore rules tests **全72件**、Expo Doctor 18/18、iOS Expo export、`git diff --check` が成功。Node 22のFunctionsとHostingのデプロイは実行承認を得られず未反映。

### リリースレビューレポートの作成とRev.2改訂（2026-07-20）

- コードベース全体を静的レビューしたレポートを作成し、ユーザーレビューを反映して Rev.2 へ改訂した。保存場所はユーザーがリポジトリ外の `Desktop/ZELIO/inst_v4/RELEASE_READINESS_REVIEW_2026-07-20.md` へ移動済み（リポジトリ内の docs/ には無い）。コード変更は行っていない。
- Rev.2 の要点: P0を「本当に公開を止める項目」だけに絞った（実機E2E一式 / オンボーディングの旧ブランド「BATTLERUN」表記 `app/onboarding.tsx:33` とCTA導線不一致 / サポート・プライバシー整備 / オートポーズ初期OFFへの変更 / 公式チャレンジ運用の確立 / iOS先行かAndroid同時かの決定）。分析基盤・Node 22移行（8〜9月中、P1最上位）・Apple/GoogleログインなどはP1〜P2へ整理。GPS改善は固定値変更ではなく「accuracy保存 → 米沢市内での実走ログ → 段階的フィルタ調整」の実走データ前提へ書き直し、速度上限35km/h緩和案は削除した。

### 機能ギャップ Sprint 4 / 5（T-12 プロセス貢献の可視化 / T-06 ルート表示強化）（2026-07-20）

- **T-12**: チーム内ランキングの各表示メンバーへ、今週の宣言達成数を「🔥 宣言 N」、活動した日数を「今週 N日」の小さな称賛バッジとして追加した。0件は表示せず、距離順位に影響しないこともカード内に明記した。ランキングの並び・距離・順位計算は既存 `useTeamRanking` のままで変更していない。
- 宣言は当週月曜〜当日の `battles/{battleId}/declarations`、参加日数は当週月曜以降の `public_v2` 活動を購読し、クライアントでユーザー別に集計する方式を採用した。同日複数活動は1日として数える。participant への集計書き込みを増やさず、活動クエリは既存の `battleIds + visibility + startedAt` 複合インデックスを使う。
- **T-06**: 活動詳細のGPSマップを、既存 `kmSplits()` のラップペースに応じた相対3段階（速い / 普通 / ゆっくり）へ分割描画した。色は新規 `RoutePaceColors` トークンだけを参照する。整数km境界は点間の実距離比で座標補間し、数字マーカーとして表示する。
- `seg` が付いた一時停止後の再開点へはポリラインを引かず、再開後を別セグメントとして描画する。ルートなし・歩数活動は従来どおりマップを表示しない。純関数テストでkm境界補間、3色分類、`seg` 分断、空ルートを確認した。
- 確認は `npx tsc --noEmit`、`cd functions && npm run build`、`npm run test:unit`、`npx expo export --platform ios`、`git diff --check` がすべて成功。Functions / Firestoreルール / インデックスの変更はないためFirebaseデプロイとルールテストは不要。実機でランキングバッジの折り返しと、実GPSルート上の色・マーカーの目視は未確認。

### 機能ギャップ Sprint 4（T-11 ライブプレゼンス + 走行中応援）（2026-07-20）

- プロフィールへ「走行中の表示を仲間に公開」トグルを追加した。既定OFFで、本人がopt-inした場合だけ、記録中クライアントが参加中の主チャレンジ1件の `battles/{battleId}/presence/{uid}` へ60秒ごとに心拍を書き込む。フォアグラウンド限定で、位置・距離・ペースは保存しない。停止/opt-out時は即時非表示を試み、バックグラウンド移行などで書けない場合も3分の鮮度判定で一覧から消える。
- チャレンジタブが表示中の間だけ、3分以内の心拍を購読する「いま走っている仲間」カードを追加した。プロフィールはキャッシュし、初回クエリも直近3分へ限定する。同じランへ1人1回だけ応援でき、セッションIDが変わった次のランでは再度応援できる。応援文書にも位置情報は含めない。
- ランナーの記録HUDは現在のランへの応援だけを購読し、8秒の画面内バナー、`expo-haptics` の触覚フィードバック、音声コーチON時の「◯◯さんから応援が届きました」読み上げを行う。新規 `onPresenceCheerWritten` は通知センターとExpo Pushへも配信する。`onUserDeleted` は本人のプレゼンス、受信/送信した応援も削除する。
- Firestoreルールはopt-in本人だけの心拍作成、参加者だけのread、位置情報等の余分なフィールド拒否、3分以内・本人以外・同一ラン1回の応援を保証する。鮮度境界の純関数テストと、opt-in/参加者/位置情報拒否/重複応援/次ラン再応援/opt-outのルールテストを追加した。確認は `npx tsc --noEmit`、`cd functions && npm run build`、`npm run test:unit`、`npm run test:rules`（Homebrew OpenJDKをPATH指定、全70件）、`npx expo export --platform ios` がすべて成功。`git diff --check` もクリーン。
- **デプロイ済み/未確認**: 2026-07-20 に `firebase deploy --only functions:onPresenceCheerWritten,functions:onUserDeleted,firestore:rules --project zelio-run --non-interactive` を実行。Firestoreルールを公開し、対象Functions 2件がACTIVEであることを確認した。2台の実機を使ったopt-in→走行中表示→応援→HUD触覚/音声/Pushと、バックグラウンド後3分失効は未確認。

### 機能ギャップ Sprint 3（T-03 / T-04）（2026-07-20）

- `users/{uid}.personalRecords` に最速1km/5km/10km、最長距離、最高獲得標高、最高月間距離をFunctionsだけが保存するようにした。GPSルートを停止境界ごとのセグメントへ分け、累積距離のスライディングウィンドウと点間時刻の線形補間で最速区間を算出するため、一時停止区間は距離にも時間にも含めず、`seg` を跨いだ記録も作らない。
- `aggregateActivity` は新記録だけを既存値へマージし、更新したキーを活動の `newRecords` に保存する。削除時の自己ベスト巻き戻しはバッジと同じ方針で行わない。既存ユーザーで `personalRecords` が欠ける場合は直近50件の最長距離・月間距離へフォールバックし、速度/標高記録はダッシュ表示にする。
- サマリーへ「自己ベスト更新！ 🎉」カード、記録タブへ6項目の「自己ベスト」セクションを追加した。活動履歴のBEST表示はサーバー確定の最長記録と一致する活動だけにした。クライアントから `personalRecords` を作成・更新できないFirestoreルールとテストも追加した。
- 最速区間の純関数テスト（距離不足、`seg` 跨ぎ除外、線形補間）に加え、獲得標高と記録マージをテストした。確認は `npx tsc --noEmit`、`cd functions && npm run build`、`npm run test:unit`、`npm run test:rules`（Homebrew OpenJDKをPATH指定、全50件）、`npx expo export --platform ios` がすべて成功。`git diff --check` もクリーン。
- **デプロイ済み/未確認**: 2026-07-20 に `firebase deploy --only functions,firestore:rules --project zelio-run --non-interactive` を実行し、FirestoreルールとFunctions 16件をデプロイ（エラー0件）。新しいランでのPR集計、サマリー祝福、記録タブ表示は実機で未確認。過去活動のバックフィルは行わず、デプロイ後の新規活動から記録を積み上げる。
- **T-04 月間・年間統計**: `aggregateActivity` が東京時間の `users/{uid}/monthlyStats/{YYYY-MM}` へ距離・記録回数・実走時間・獲得標高を既存の集計トランザクション内で加算し、活動へ減算用スナップショットを保存するようにした。`deleteActivity` は同じ月次値をトランザクションで減算し0未満へ落とさず、集計済み活動の再処理や同時削除でも二重反映しない。`onUserDeleted` は月次サブコレクションも削除する。公開前の活動はバックフィルせず、減算用スナップショットが無い旧活動の削除でも月次値は変更しない。
- 記録タブへ、サーバー集計値を使う現在年の累計、直近12ヶ月の選択可能なバーチャート、選択月の距離・回数・時間・獲得標高を追加した。過去分を追加集計しない旨も画面内に注記した。月次ドキュメントは本人だけが読め、クライアントからは書けないFirestoreルールを追加した。
- 東京時間の月境界・年跨ぎ・集計スナップショット解析の純関数テストと、月次統計の本人read可 / 他人read拒否 / クライアントwrite拒否のルールテストを追加した。確認は `npx tsc --noEmit`、`cd functions && npm run build`、`npm run test:unit`、`npm run test:rules`（Homebrew OpenJDKをPATH指定、全53件）、`npx expo export --platform ios` がすべて成功。`git diff --check` もクリーン。
- **デプロイ済み/未確認**: 2026-07-20 に `firebase deploy --only functions:aggregateActivity,functions:deleteActivity,functions:onUserDeleted,firestore:rules --project zelio-run --non-interactive` を実行し、対象Functions 3件とFirestoreルールをデプロイ（エラー0件）。新しい活動の月次加算・削除時の減算と、月間・年間UIは実機で未確認。

### 機能ギャップ Sprint 2（T-10 / T-13）（2026-07-20）

- **T-10 出撃宣言**: 参加中の主チャレンジへ1日1件、当日の予定時刻（まもなく/朝/昼/夕方/夜）と任意の20字メモを宣言できるカードをホームへ追加。メモは既存の禁止語リストを再利用して検証する。宣言は `battles/{battleId}/declarations/{uid_YYYYMMDD}` に保存し、同じチャレンジの参加者による今日の宣言をリアルタイム表示する。本人以外は1人1回だけ🔥応援でき、`onDeclarationCheerCreated` が宣言者の通知センターとプッシュへ「応援が届きました」を送る。
- 宣言時刻のローカル通知は宣言・チャレンジ単位で1回だけ登録し、タップでランタブへ直接遷移する。記録保存成功後はサーバーが確定した対象チャレンジの当日宣言を `done` にし、サマリーとホームで「宣言達成！」を祝福する。日付を過ぎた宣言は取得対象から外すため、未実行の表示や通知は出さない。
- declarations / cheers の Firestore ルールを追加。宣言は開催中チャレンジの参加者本人だけが作成・達成更新でき、参加者だけが閲覧できる。応援は参加者が自分のUIDで他者の宣言にだけ作成できる。`onUserDeleted` は本人の宣言、その宣言に付いた応援、本人が送った応援も削除する。
- **T-13 健全性ガードレール**: 直近7日が前の7日より50%超増え、かつ15km超のとき、記録タブに休息を肯定する情報カードを同一カレンダー週に1回だけ表示する。全ローカル通知（チャレンジ終了24時間前/1時間前、宣言）は22:00〜7:00をスケジュール対象外にした。終了通知と順位変動プッシュの焦りを誘う文言も中立化した。
- 確認は `npx tsc --noEmit`、`cd functions && npm run build`、`npm run test:unit`、`npm run test:rules`（Homebrew OpenJDKをPATH指定、全47件）、`npx expo export --platform ios` がすべて成功。禁止文言grepと `git diff --check` もクリーン。
- **デプロイ済み/未確認**: 2026-07-20 に `firebase deploy --only functions,firestore:rules --project zelio-run --non-interactive` を実行し、FirestoreルールとFunctions 16件（新規 `onDeclarationCheerCreated` を含む、エラー0件）をデプロイ済み。宣言カード、ローカル通知タップ、応援プッシュ、達成サマリー、過負荷カードは実機で未確認。

### 機能ギャップ Sprint 1（T-01 / T-02 / T-05）（2026-07-20）

- **T-01 オートポーズ**: `recordStore` に `pauseKind: 'manual' | 'auto' | null` と永続化されるオートポーズ設定（既定ON）を追加。GPS速度が 0.55m/s 未満で5秒続くと自動停止し、1.2m/s 超で自動再開する。低速判定中の点は一時バッファに置き、自動停止成立時はルート・距離へ入れない。自動停止中はGPS追跡を継続する一方、手動停止へ切り替えると追跡を止めるため、手動操作が常に優先される。HUDは「自動停止中」と手動停止を区別する。foreground/background の両方が同じ判定を通り、GPSの速度値が無い場合は点間速度へフォールバックする。
- **T-02 音声コーチ**: ON/OFFだけだった音声ガイドを、距離（0.5/1/2km）または時間（5/10分）の間隔と、経過時間・距離・直近ラップペース・平均ペースの内容選択へ拡張。設定はボトムシートから変更し AsyncStorage へ保存する。既定値は「1kmごと・距離+平均ペース」。一時停止中は読み上げず、開始・目標達成・終了の既存音声は維持した。ペース読み上げは「キロ 6分12秒」形式。
- **T-05 週間目標**: `users/{uid}.weeklyGoal`（距離/日数）をリアルタイム購読し、記録タブから設定・変更・解除できるようにした。既定提案は 10km / 週3日。記録タブとホーム週間カードに `ProgressRing` を使った進捗を表示し、達成時は画面内だけで穏やかに祝福する。Firestoreルールは本人の有効値（距離1〜500km、日数1〜7の整数）のみ許可し、本人許可/他人拒否/不正値拒否のテストを追加した。
- 純関数テストへオートポーズ（5秒停止・ヒステリシス・短い低速区間の復帰）と音声文組み立てを追加。確認は `npx tsc --noEmit`、`npm run test:unit`、`npm run test:rules`（Homebrew OpenJDKをPATH指定、全38件）、`npx expo export --platform ios` がすべて成功。Functionsは変更していないため Functions build は未実行。
- **デプロイ済み/未確認**: 週間目標用 `firestore.rules` は2026-07-20にデプロイ済み。オートポーズのバックグラウンド動作は EAS development build、音声と各ボトムシートの見た目は実機で未確認。

### 記録停止・オフライン再送フローの堅牢化（2026-07-20）

- 停止時にチャレンジ一覧の通信を待たず、最初に `stopRecording()` で計測を止めてからローカルキューへ保存する順序へ変更。オフライン停止時の記録消失と、低速回線で停止後も時間・距離が伸びる問題を解消した。
- 未送信記録の `localId` を `submitActivity` へ渡し、その値を `activities` のドキュメントIDに使用。同じIDが既に本人の記録として存在する場合は既存結果を返すため、Functions の commit 後に応答が失われても再送で二重登録・二重集計されない。
- AsyncStorageキューの read-modify-write を短い排他区間に直列化。ネットワーク送信中はロックせず、flush中に新しい記録が追加されても古いスナップショットで消さない方式へ変更した。flush自体の重複実行も共有Promiseで抑止している。
- Callable の `invalid-argument` / `failed-precondition` / `permission-denied` は恒久エラーとしてキューから除外し、ユーザーへ通知。一時的な通信エラーだけを再送対象に残す。再送はログイン時に加え、foreground復帰時・アプリ使用中30秒間隔・次回保存成功時にも行う。
- 停止連打ガードと `stopRecording` の二重停止ガードを追加。距離0は完了画面へ遷移せず未保存を通知し、ローカルキューへの書き込み自体が失敗した場合は記録をメモリ上の一時停止状態へ戻す。
- HUDのGPS点追加にも保存時と同じ速度フィルタを適用。サマリーの主チャレンジは順位上昇幅→battleIdで決定的に選択し、集計待ちは15秒で「あとで活動詳細から確認」にフォールバックする。
- 確認: `npx tsc --noEmit`、`npm run test:unit`、Functions の `npm run build`、`npx expo export --platform ios` はすべて成功。ルール変更はないため `npm run test:rules` は未実行。Functions の変更は2026-07-20にデプロイ済み。

### ランニングアプリ基本機能の拡充（2026-07-19）

単体のランニングアプリとして不足していた機能（一時停止・記録削除・1kmラップ・目標・カウントダウン・開始前GPS状態・生涯累計・推定カロリー・獲得標高）を実装した。**Functions は2026-07-20にデプロイ済み、実機目視は未実施**（「未解決・要確認」参照）。

- **一時停止/再開**: `recordStore` に `isPaused` / `pausedAt` / `pausedTotalMs` / `appendRoutePoint` を追加。停止中は `(tabs)/_layout.tsx` で GPS・歩数の追跡自体を止め、再開後の最初の点に `seg: true`（セグメント先頭マーク）を付けて、停止中の移動距離と時間を距離・ペース・ラップから除外する。実走時間は `activeDurationSeconds()`（開始時刻差分から pausedMs を引く）で計算。記録中セッションの AsyncStorage 保全・復旧にも停止状態を含めた。復旧時は `segmentPending: true` にして再起動ギャップの直線距離を数えない（従来は数えていた）。
- **サーバー側の対応** (`functions/src/submitActivity.ts`): `pausedMs` を受け取り実走時間で保存・平均速度検査（過大申告は検査が厳しくなる方向なのでチート不可）。`parseRoute` は `seg` / `alt`（高度）を保持し、seg 点が検証で落ちた場合は境界を次の採用点へ引き継ぐ。`routeDistance` は seg 跨ぎペアを距離に数えない（seg はセグメント内の速度検査対象外だが、距離にも数えないので水増しには使えない）。活動ドキュメントに `pausedMs` を保存。
- **記録の削除**: `functions/src/deleteActivity.ts` を新設（index.ts で export 済み）。本人確認・`aggregated === true` 必須（集計との競合防止）。`aggregationImpacts` を基に **status が active のバトルだけ** participant / category_stats を減算（終了済みは結果確定のため戻さない）。`reversedBattleIds` の arrayUnion でバトル単位に冪等化。ルートチャンク→リアクション→（ユーザー累計減算＋本体削除）の順で削除し、途中失敗はリトライで完遂できる。UI は `app/activity/[id].tsx` ヘッダーのゴミ箱アイコン（本人のみ）＋確認ダイアログ。ルール変更は不要（Callable は Admin SDK）。
- **1kmラップ**: `utils/displayStats.ts` に `kmSplits()`（km境界をペア内の時間で線形補間、seg 跨ぎは距離・時間とも不算入）。`components/run/KmSplitsCard.tsx`（最遅区間を100%とする相対バー、最速区間はアクセント色）をサマリーと活動詳細に表示。サマリーへはルートを渡さず、record.tsx で計算した splits を JSON パラメータで渡す。
- **目標とカウントダウン**: 開始前に目標チップ（なし/3km/5km/10km/30分/60分）を選択。START→3・2・1 のオーバーレイカウントダウン（タップでキャンセル、音声ONなら「スタート」読み上げ）→記録開始。記録中HUDに目標プログレスバーと残り表示、達成時に一度だけ読み上げ。目標は `recordStore.goal` として保持・永続化。
- **開始前GPS状態**: ラン画面（GPSモード・開始前）で権限を**要求せず**確認し、許可済みなら測位を1回試して「GPS 準備OK / 確認中 / 位置情報は開始時に許可できます / 取得できません」のチップを表示。
- **生涯累計**: 記録タブの「距離」カードを `users.totalDistanceKm`（aggregateActivity がサーバー集計、authStore が onSnapshot 購読）優先に変更。無ければ従来どおり直近50件合算で「直近50件」表記。
- **推定カロリー・獲得標高**: `estimatedCalories()`（体重60kg換算、平均7km/h以上は走行係数1.05・未満は歩行0.55）と `elevationGainM()`（3m閾値のヒステリシスでGPSノイズを抑制）。高度は `RoutePoint.alt` として foreground/background 両方の追跡で取得し、サーバーがチャンクへ保存。サマリーのヒーローカード下段と活動詳細の時刻行に表示。
- 確認: `npx tsc --noEmit`、`functions` の `npm run build`、`npx expo export --platform ios` すべて成功。`kmSplits` / `elevationGainM` / `estimatedCalories`（16項目）とコンパイル済みサーバー `parseRoute` / `routeDistance`（seg跨ぎ距離除外・後方互換・境界引き継ぎ・ワープ除外・alt保持の7項目）を node で実測し全て成功。`npm run test:rules` は未実行（ルール変更なし）。

### 未コミット差分のコードレビューと確定バグ修正（2026-07-19）

未コミット差分全体（29ファイル＋新規2ファイル）をレビューし、15件を指摘、うち確定バグを修正した。

- `functions/src/revenuecatWebhook.ts`: `entitlement_ids` が**明示的な空配列**のイベントを誤ってPro扱いする退行を修正。空配列はPro対象外、`entitlement_ids` / `entitlement_id` の両方が欠落しているときだけ従来どおりPro扱い。修正は2026-07-20にデプロイ済み。
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

リリース準備のユーザー作業は完了済み（2026-07-19、ユーザー報告）: App Store Connect のアプリ登録とサブスク商品 `monthly` / `yearly` 作成、本番EASビルド、Sandbox での購入・復元確認、実機での画面目視（PeriodPicker・月額/年額選択UI含む）。

## 次にやること

1. iOS先行かAndroid同時公開かを決定し、対象OSのTestFlight/development buildで `RELEASE_TEST_CHECKLIST.md` シナリオ1〜8を完走する。

## その次の候補
- 実機でオフライン停止→端末キュー保存→オンライン復帰後30秒以内の再送と、サマリー集計の15秒フォールバックを確認する
- 実機で新機能を目視確認する: 一時停止/再開、カウントダウン、目標バー、1kmラップ、記録削除、開始前GPSチップ
- `RELEASE_TEST_CHECKLIST.md` の通し確認（Day-0、GPS保存、再送、ランキング反映、アカウント削除を2アカウントの実機で）を行う
- 旧 `battlerun-75eb6` プロジェクトの削除（または凍結）を検討する
- ローカル `ios/` は表示名等が旧設定のまま。ローカルでネイティブビルドする場合は `npx expo prebuild --platform ios --clean` で再生成する
- masaki0219/app-support（GitHub Pages）の docs/battlerun/ 配下サポートページをZelio表記へ同期する
- `feat/ui-consolidation` を `main` へマージするか判断する（origin へは push 済み）
- 使われていないブランチ `feat/ui-refresh` / `feat/ui-redesign` を整理する
- `package.json` に `lint` スクリプトを追加する（`typecheck` / `test` は追加済み）
- バックグラウンドGPS を EAS development build で確認する（Expo Go ではフォアグラウンドのみ）
- 機能ギャップ Phase 3 の T-20「インターバルワークアウト」を実装する

## 未解決・要確認

- **ランニング基本機能・Sprint 1〜4（T-11まで）の実機確認が未実施（2026-07-20）**: 記録系Functions、自己ベスト・月次統計集計、出撃宣言・ライブ応援Functions、関連ルールは `zelio-run` へデプロイ済み。実機/シミュレータでの目視（一時停止HUD・オートポーズ・音声コーチ・週間目標・自己ベスト祝福/一覧・月間/年間統計・出撃宣言・通知タップ・宣言/ライブ応援プッシュ・ライブプレゼンス3分失効・HUD触覚/音声・宣言達成・過負荷カード・オフライン再送・カウントダウン・目標バー・ラップ表示・削除フロー）は未実施。新規活動の月次加算と削除時の減算も実データでは未確認。バックグラウンドのオートポーズは EAS development build が必要。
- Functionsのランタイム指定はNode.js 22へ更新してビルド済みだが、`zelio-run` への再デプロイは未実施。歩数チャレンジ上限のFunctionsとSupport/Invite/PrivacyのHostingも同じくローカルのみ。
- 一時停止まわりの設計メモ: 終了済みバトルの集計は削除時に減算しない（結果確定のため）。バッジは削除しても剥奪しない。セッション復旧時（アプリ再起動）は `segmentPending: true` でギャップ距離を数えない仕様に変えた。
- `EXPO_PUBLIC_REVENUECAT_API_KEY` は `appl_RRF…`（.env側の値）が正と確認され、`eas.json` 3プロファイルを統一済み（2026-07-19）。
- 修正済み `revenuecatWebhook` のデプロイと zelio-run 残作業（Auth メール/パスワード有効化、Firestore データコピー、RevenueCat Webhook URL 変更）はユーザー報告により完了（2026-07-19）。
- 実機での画面目視（PeriodPicker・月額/年額選択UI等）はユーザー報告により完了（2026-07-19）。
- 2026-07-19 の functions デプロイで `revenuecatWebhook` が「No changes detected」でスキップされた＝それ以前に現行ソースでデプロイ済みだったことを意味する（他13関数は今回更新）。Webhook が us-central1 なのに対し Firestore トリガー系は asia-northeast1 と、リージョンが混在している点は把握しておく。
- RevenueCat 側 Webhook 設定の URL（us-central1 の revenuecatWebhook）と Authorization ヘッダが `REVENUECAT_WEBHOOK_AUTH` シークレットと一致しているかは、ダッシュボードで要確認（コード側からは確認不可）。
- zelio-run 移行の残作業（Auth メール/パスワード有効化・Firestore データコピー・Webhook URL 変更）はユーザー報告により完了。移行した Auth ユーザー2件のパスワード再設定は各アカウントの「パスワードを忘れた」から行う（未実施の場合）。
- サポート窓口は `https://github.com/masaki0219/app-support/issues` を使用し、ZELIO Hostingの `/support.html` から案内する。個人情報を含む問い合わせを公開Issueへ書かせない注意文を表示済み。非公開窓口を用意できたら差し替える。
- Expo依存は `expo ~54.0.35`、`expo-font ~14.0.12`、`expo-router ~6.0.24` へ更新済み。Expo Doctorは18/18合格。
- `npm audit fix`（`--force`なし）適用後、rootの `npm audit --omit=dev` は critical 0 / high 1 / moderate 34。残るhighの`undici`はFirebase 12系が必要。functionsはhigh 0 / moderate 9で、残りはfirebase-admin配下の`uuid`系。いずれも破壊的な `--force` は未適用。
- Firestoreルールテストはローカルの Java（openjdk 26）でエミュレータ実行できる。2026-07-20 時点で全72件成功。
- `submitActivity` はサーバーで距離を再計算するが、Firebase App Checkのネイティブ導入は未実施。改造クライアント対策として導入を検討する。
- クラッシュ監視・分析イベントはSDK/送信先・プライバシー申告を決める外部設定が必要なため未導入。App CheckもApple App Attest / DeviceCheck、Android Play Integrity、Firebase Console設定とdevelopment buildでの確認が必要。
- リリース対象（iOS先行 / Android同時）はプロダクト判断のため未決定。公式チャレンジの実データ作成、テストユーザー配置、App Store Connectへの回答転記も人手の運用作業として残る。
- `FactionColumns` のバー高さは **0起点ではなく「最下位〜首位」で正規化**している（僅差だと全部同じ高さに潰れて順位が読めないため。最下位でも 32% は残す）。各バーの上に実数値 km を出して誤読を防いでいるが、スケールの妥当性は要レビュー。
- `useTeamRanking` は participants サブコレクションを全件読む（既存の `useBattleParticipants` と同じ方式）。大規模バトルでは読み取り件数が増える。上位3名の users 読みは3件に固定。
- ダーク面（記録中HUD・結果画面）がパイン系に変わったため、`battle/result/[id].tsx` など今回レイアウトを触っていないダーク画面の見え方は要確認。
- `app/battle/theme.tsx` の `sports` テーマだけ新ブランド色に合わせた。他テーマ（RPG / ホラー等）の hex は意図的にそのまま。
- `feat/ui-consolidation` を `main` へマージする予定かどうかは不明。`10079b2` まではoriginへpush済みで、リリースレビュー対応差分は未コミット・未push。
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

2026-07-20 時点: `npx tsc --noEmit`、`functions` の `npm run build`、`npm run test:unit`、`npx expo export --platform ios` 成功。`npm run test:rules` は全70件成功。

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
