# HANDOFF

最終更新: 2026-08-10

## プロジェクトの目的

仲間と合計距離を競うチーム対抗ランニング・ウォーキングアプリ。React Native / Expo で実装し、Firebase（Firestore）をバックエンド、RevenueCat を課金に使う。GPS によるアクティビティ記録とバトル（対戦）機能が中心。認証は現状メール/パスワードのみ（Apple／GoogleのFirebaseプロバイダはユーザー報告で有効化済みだが、クライアントのサインイン処理は未実装）。

## 現在の状態

`feat/ui-consolidation` ブランチで作業中。アプリ名（`expo.name` / `CFBundleDisplayName`、ランチャー表示）とアプリ内UI表記は `ZELIO` に統一済み。Bundle Identifier / Android package は `com.masaki.zelio`、ディープリンク scheme は `zelio`。

**Firebase は新プロジェクト `zelio-run` へ移行済み**（2026-07-19 に再度方針転換し移行を実施。`.env` / `eas.json` 3プロファイル / `.firebaserc` / `lib/legal.ts` を zelio-run へ更新し、ルール・インデックス・Hosting・Functions 全14関数・シークレット・Authユーザー2件を zelio-run へデプロイ/移行した）。旧 `battlerun-75eb6` は Firestore テストデータのコピー完了を確認するまで残しておくこと。残作業は「未解決・要確認」を参照。

**RevenueCat はダッシュボード設定が正**。Entitlement は `Zelio Pro`、Offering は `default`。リリース初期は月額だけを販売する方針へ変更し、アプリは Package `$rc_monthly` / Product `monthly` だけを表示・購入する。年額商品 `yearly` は将来用に残してよいが、初期リリースでは審査提出・販売対象およびRevenueCatのCurrent Offeringから外す。APIキーは `.env` / `eas.json`（3プロファイル）とも設定済み。

Expo slug `battlerun` と EAS projectId、内部永続化キー（`@battlerun_*` 等）は従来値を維持している。

**デプロイ方針（2026-07-20 ユーザー許可済み）**: 実装に伴う Firebase Functions / Firestore ルールは、必須テストとビルドが成功した後、Codexが `zelio-run` へデプロイしてよい。都度の再確認は不要。対象プロジェクトを明示し、完了・失敗を報告すること。commit / push / reset / rebase は従来どおり別途ユーザー許可が必要。

`inst_v3/BattleRunホーム画面作成.zip`（Figma Make のホーム画面デザイン・最終版）を反映し、パレットをディープパイン系に刷新した。レイアウトの作り直しはホームタブとランタブの2画面に限定し、他画面は `design_tokens.ts` 経由で色だけ追従している。

※ 同フォルダの `BattleRunホーム画面作成 (コピー).zip` は旧版。パレット（`theme.css`）は同一だが、ヒーローが2陣営のVSゲージで、チーム内ランキングが無い。**最終版はこちら（コピーでない方）**。

## 最後に完了したこと

### 2026-08-10 v3レビュー／メタレビューを実コードで再判定し、リリース前修正を実装

- Claude Codeのv3レビューと、コード未確認のChatGPTメタレビューは参考資料として扱い、現行コード・ルール・依存・既存テストへ個別に照合した。Functions名の一致は本番コード同一性の証明にならないこと、未送信件数だけを根拠に30秒再送を止めるのは危険なこと、リージョン移行と大規模ランキング最適化は計測・段階移行が必要なことを踏まえ、今回は安全に閉じるクライアント修正へ絞った。
- 友達チャレンジの各チームへ利用者が選ぶ`colorId`を追加し、作成フォームの7色選択、Firestore保存、招待参加・参加モーダル・ホーム・詳細・結果の全表示へ接続した。保存済みの明示色を最優先し、旧データは「赤チーム」「BLUE TEAM」「白組」等の完全一致だけを補完して「赤ちゃん」「青森」の誤判定を避ける。旧ハッシュ色はパレット拡張後も変わらず、自チームは色の置換でなく白い縁と「あなた」で識別する。
- AX5対策として、友達チャレンジ詳細の招待コード行を大文字時に縦積み、STARTを1行中央寄せ＋自動縮小、タブラベルを非表示にせず2行表示へ変更した。`MonoLabel`は倍率上限1.6とし、日本語端末ではシステムフォント・通常字間に切り替えた。通知日時は`textSecondary`へ上げた。
- 未送信キューはAsyncStorageを起動時に復元し、記録タブ上部へ件数・再送ボタン・送信中状態を表示する。起動時／復帰時／30秒間隔のAsyncStorage確認は維持し、UI件数を送信可否には使わない。新規キューへFirebase UIDを保存し、アカウント切替時は別利用者の件数を表示せず、送信直前にもUIDを照合して誤送信を防ぐ。旧ownerなしキューは従来互換で現ログイン利用者の記録として扱う。
- 結果画面の「チャレンジを作る」はProなら作成フォームを直接開き、無料利用者には必要条件を説明する。公開カードへ平均戦／合計戦を明記し、音声コーチは初期OFF、未獲得バッジ文言は未来形、無料バッジからPro色を除外、通知の順位／リアクション色を意味に合うトークンへ変更した。
- `RELEASE_TEST_CHECKLIST.md`へAX5全画面、再起動をまたぐ未送信再送、選択色の全画面一貫性を追加した。`npm audit fix`（`--force`なし）もroot/functionsへ適用し、Functionsはhigh 1件を解消した。RulesテストSDKはFirebase 12前提のv5から、アプリのFirebase 10とpeer互換のある公式v3.0.4へ揃え、同構成でRules全件を再実行した。現時点の`npm audit --omit=dev`はroot 35件（high 12 / moderate 23。Expo/Firebaseのメジャー更新が必要）、Functions 9件（moderateのみ）。互換性を壊す強制更新は行っていない。
- 確認成功: `npx tsc --noEmit`、テストTS型検査、全unit、Functions build、Firestore Rules全件、Expo Doctor 18/18、iOS Expo export、ハードコードhex検査0件、`git diff --check`。Rulesは一時Temurin 21 JREと`zelio-run`名のローカルエミュレータで検証し、本番書き込みは0件。
- Functionsの依存ロック更新を含むため、ユーザー指示を受けて全24 Functionsを`zelio-run`へデプロイした。エラー0件で、デプロイ後の一覧でも24/24件すべて`ACTIVE`。Firestore Rules／インデックス／Hostingは変更・デプロイしていない。クライアント差分はEAS／TestFlightへ未配布。
- GitHub CLIを再認証し、現行差分を`feat/ui-consolidation`へcommit／pushして既存draft PR #1へ反映した。現行差分のAX5目視、GPS v3実走、バックグラウンド、画面ロック、オフライン再送、RevenueCat購入／復元、Push実配送はTestFlight／物理端末で未確認のため、リリース可とはまだ判定しない。
- Firebase ConsoleでApple／Googleプロバイダを有効化しただけではアプリのログイン経路は増えない。現行コードにはApple／Googleボタン、ネイティブ認証、Firebase credential交換、既存メールアカウントとのリンク／競合処理、再認証・Appleトークン失効処理がない。`expo-apple-authentication`は依存済みだが、`ios.usesAppleSignIn`とconfig pluginも未設定。Googleは公式Expo案内に沿ったネイティブSDK、FirebaseのiOS/Android構成ファイル、iOS URL scheme、Android署名SHA-1を整え、新しいEASビルドで検証する必要がある。Appleの非公開メールへFirebaseメールを届けるprivate email relay登録と、法務文面／App Privacyの認証プロバイダ追記も必要。現状のプロフィール自動生成はproviderの`displayName`を未検証のまま公開できるため、ソーシャル初回ログインでは既存の表示名検証を通すニックネーム確定画面を先に挟む。

### 2026-08-09 v2メタレビューを実コードで再判定し、局所修正を実装・本番Functions/Rulesへ反映

- `VersusGauge` は文字倍率1.6以上で2チームを縦積みし、チーム名と距離の1行省略をやめ、中央のVSバッジを隠す。差分テキストはティール／オレンジの勝敗色をやめて本文の中立色へ統一し、チーム色との意味衝突を解消した。
- 結果画面は `myMemberships` が未読込でも、同画面が取得する自分の participant から `categoryId` を復元する。Push直行で認証復元前のbattle readが失敗した場合も、ユーザー確定後に再試行するため、ローディングのまま止まらない。
- ラン開始画面は最大文字サイズ時だけ任意の宣言カードをSTARTの後へ移し、主操作を初期表示内へ戻した。通常文字サイズの並びは維持した。
- Day-0の公開チャレンジは「参加する」をオレンジの主CTAに変更した。招待コード入力は「招待コードをお持ちですか？」から開くセカンダリ導線へ畳み、「チャレンジに参加せず、まず走る」と友達チャレンジ作成もセカンダリ導線として追加・整理した。
- チーム色は閲覧者ごとに変えず、現行のcategoryIdベースの安定割当を維持した。「自チームをブランド色へ固定」は同一チャレンジの共通認識を壊すため採用していない。
- Firestore Rulesは名前欠落時も評価エラーにしない `data.get('name', '')` へ変更し、publicチャレンジ単品取得の回帰テストを追加した。`isAdmin()`の`exists()`案は、論理積・条件式のどちらでも欠落ユーザー時のエミュレータ評価エラーが残ることを実測したため採用せず、認可モデル変更なしでは未解決とした。
- 活動詳細の推定カロリーへ「体重60kg換算」を明記し、サマリーと表記を揃えた。
- iPhone 17 Simulator / iOS 26.4 / Expo Go / ローカルFirebase seedで目視確認した。AX5の結果でチーム名・距離が省略されないこと、AX5のラン画面でSTARTが初期表示内にあること、membership空でも優勝・貢献24%・チーム1位が復元されること、通常文字のDay-0でCTA階層が変わったことを確認した。一時的なFirebase接続コードは確認後に完全に戻し、この目視確認から本番への書き込みは行っていない。
- 確認成功: `npm run typecheck`、全unit、Functions build、Firestore Rules全件、iOS Expo export、`git diff --check`。
- ユーザーの明示指示を受け、`zelio-run`へ`submitActivity`、`aggregateActivity`、`recoverStaleActivityAggregations`、`retryPendingActivityAggregations`、`backfillMonthlyStats`、`awardBadgesOnActivityAggregated`、`syncMyBadges`とFirestore Rulesを限定デプロイした。Functionsは7件成功・0エラー。Rulesはruleset `projects/zelio-run/rulesets/ee197915-2848-40d3-9431-769085826115`として公開した。
- デプロイ後の`functions:list`で7件すべて`ACTIVE`、同一hash `62ac8531c9ebbded61c4d7e347a8b4dd12f26ab9`を確認した。新規2件は`recoverStaleActivityAggregations`が`asia-northeast1`、`retryPendingActivityAggregations`が`us-central1`。既存データへの手動復旧Callable実行と、新規実走による`battleCreditStatus`の実通信確認は行っていない。今回のクライアントUI差分もEAS/TestFlightへは配布していない。

### 2026-08-09 総合レビュー／メタレビューの優先指摘を修正（Functionsは同日反映済み）

- 追加メタレビューを実コードへ照合し、バッジの「次に取れそう／未獲得」二重表示、不完全な招待リンクのログイン済み遷移、端数ラップの最速判定、距離表示の小数1桁統一、順位据え置き時の`3→3`表示、称号名の不一致を修正した。
- 逆転目安は切り上げ日数で割るのをやめ、実残り時間から24時間あたりを算出する。ホーム／詳細とも「チーム全体であとXkm・1日Ykmが目安」と主語と総量を明記した。
- チーム識別色を順位・CTA色と重複しない専用6色へ変更し、categoryIdのハッシュ衝突時は同一チャレンジ内で未使用色へずらす安定割当を追加した。全色はダークカード背景とのコントラスト3:1超を計算確認した。
- 最大文字サイズではチャレンジ切替見出し・カード幅、ヒーローのタイトル／残り時間／順位／フッター、ラン画面の目標／宣言カードを縦配置へ切り替え、主要文言の1行切り捨てを外した。React Nativeの非推奨`SafeAreaView`もsafe-area-contextへ移行した。
- オンボーディング、スタート、ライブ表示、ラン結果／共有画像などの装飾英語を`decorLabel()`へ接続し、共有タグラインを「歩いても走っても、チームが強くなる。」へ統一した。
- Firestore Rulesの`isAdmin()`はrole欠落時に評価エラーを出さない`data.get('role', '')`へ変更した。ローカルRulesテストはJava Runtime不在で開始できず未実行（コード失敗ではない）。本番ルール変更・Functions変更ともデプロイしていない。
- 追加確認成功: `npx tsc --noEmit`、全unit（逆転計算・距離・端数ラップ・称号・色衝突テストを追加）、Functions build、iOS Expo export、`git diff --check`。
- Firebase Authの直接依存`@firebase/auth ^1.13.1`を削除し、初期化・永続化・認証APIをすべて`firebase/auth`へ統一した。SDK実装の1.13.1/1.7.9混在を解消し、Fast Refresh時は`auth/already-initialized`だけ既存インスタンスへフォールバックする。`npm ls @firebase/auth --all`ではアプリ側はFirebase 10.14.1配下の1.7.9系だけになった（compat側にも同一1.7.9があるが、直接依存していた異版本は消えた）。
- `submitActivity`の「記録終了から10分以内だけチャレンジ加算」を廃止した。活動の開始・終了がチャレンジ期間内で、送信時点が終了10分後の結果確定前なら、開催中のオフライン記録を12時間後等でも加算する。結果確定後は個人記録だけに保存し、活動へ`battleCreditStatus` / `battleCreditReason`を残してサマリーに「結果確定後」「期間外」等の理由を表示する。ヘルプ・オフライン保存ダイアログ・リリース確認シナリオも同期した。
- 月次サーバー値と直近活動の突合を`reconcileMonthlyStats`へ一本化し、年間・生涯・今月およびプロフィール累計が同じ月次下限を使うようにした。「年間累計 > 生涯累計」の表示矛盾を防ぐテストを追加した。`backfillMonthlyStats`は同一ユーザーにつきアプリセッション中1回だけ呼び、失敗時だけ次回マウントで再試行する。
- `expo-localization 17.0.9`を追加し、装飾ラベルの言語判定を`getLocales()[0].languageCode`へ変更した。`BATTLE / ACTIVE`とサマリーの`BEFORE / AFTER`は日本語化した。
- ホーム／チャレンジ詳細のチーム成績とチーム内ランキングで、Firestore購読失敗を0km・空ランキングとして表示せず、「取得できませんでした／再試行」へ分離した。上位プロフィール取得は5分TTL・200件上限・同時要求共有の共通キャッシュにし、プレゼンスのプロフィール／応援キャッシュも無期限から5分TTL・上限付きへ変更した。
- 最大文字サイズへの対応は文字倍率を制限せず、ラン画面を「モード → 目標 → START → 音声コーチ／オートポーズ」の順に変更した。共有画像のルートは新規既定OFF、ダーク面の最弱チーム色は背景とのコントラスト3:1超へ変更し、自チームへ色以外の「あなた」表示を追加した。
- 確認成功: `npm run typecheck`、テストTS型検査、全unit、Functions build、iOS Expo export、Expo Doctor 18/18、`git diff --check`。`npm audit --omit=dev`はroot 37件（high 14 / moderate 23）、Functions 9件（high 1 / moderate 8）。強制更新は未適用。
- 当初は本番`zelio-run`への限定デプロイが明示承認不足で拒否されたが、同日のユーザー明示指示後に`submitActivity`＋集計復旧6 FunctionsとFirestore Rulesの反映を完了した。結果は上記セクションを参照。

### 2026-08-05 活動集計停止の原因修正と自動復旧を実装（2026-08-09 Functions反映済み）

- 本番`zelio-run`のFunctionsログとFirestoreインデックスを読み取り検証した。2026-08-04までの`aggregateActivity`失敗はすべて`FAILED_PRECONDITION`で、`monthDistanceKm`の`userId ==`＋`startedAt`範囲クエリが暗黙ASCを要求する一方、本番・ローカルとも`userId ASC + startedAt DESC`だけが存在していた。未集計は6活動・2ユーザーで、全件バトル反映済み、個人集計・月次impactは未反映だった。保存済み全活動8.331kmに対し`users`累計合計は0.989kmで、該当2ユーザーはサーバー累計が集計済み活動だけに一致していた。
- 原因分析の主要部分は正しかったが、ASCインデックスを重複追加せず、月距離クエリへ`orderBy('startedAt', 'desc')`を明示して既存本番インデックスを使う方が即時性・保守性とも高い。修正版クエリが本番で成功することも実測した。また「デプロイ手順にインデックスが一度もない」は不正確で、README/OPERATIONSには以前から記載があったが、最近の関連Functions限定デプロイでインデックス依存を同時確認していなかった点が運用上の穴だった。
- `aggregateActivity`を共通の冪等集計本体へ分離し、作成トリガーの`retry: true`、試行回数・最終試行時刻・サニタイズした`aggregationError`、15分ごとに30分超の未集計を最大50件回収する`recoverStaleActivityAggregations`、admin限定の`retryPendingActivityAggregations`を追加した。バトルは`aggregatedBattleIds`、個人は`userStatsAggregated`で二重加算を防ぐ。
- 月次バックフィル済みの未集計活動を単純再処理すると月次だけ二重加算になる追加脆弱性を発見した。活動のimpact・保存時刻とユーザーのバックフィル時刻を比較して加算要否を決め、バックフィルをv2へ上げて月次・累計距離・回数を絶対値で再構築する。復旧処理後は対象ユーザーへこの再構築も実行する。
- バッジ処理から`users.totalDistanceKm` / `activityCount`の絶対値上書きを削除した。統計・プロフィールUIはサーバー値が取得済み活動より小さい矛盾時にローカル確認値を下限とし、月次・年間も直近50件分との最大値で0表示を避ける。最速PRはルートが必要なので推測せず、未集計活動のサーバー再処理で復元する。
- `firestore.indexes.json`へ滞留回収用`aggregated ASC + submittedAt ASC`を追加し、AGENTS/OPERATIONS/RELEASE_TEST_CHECKLISTへインデックス先行デプロイ、障害復旧、アラート、回帰確認を追記した。確認成功: `npm run typecheck`、全unit、Functions build、全Firestore Rules、集計統合テスト（再実行の二重加算なし・v1月次の二重加算なし・v2絶対値再構築）、テストTS型検査、`git diff --check`。
- **本番Functions反映済み（2026-08-09）**: 2026-08-05にREADY確認済みのFirestoreインデックスに続き、`--force`付き限定デプロイで集計復旧6 Functionsと`submitActivity`を`zelio-run`へ反映した。7件すべて`ACTIVE`。未集計6件への手動復旧Callable実行と匿名集計監査は引き続き未実施。

### 2026-08-04 GPS距離処理v3と獲得標高の初期リリース非表示

- GPS処理をv3へ上げ、水平精度を高信頼15m以内・条件付き15m超25m以内・除外25m超へ分類した。正式点A・保留点B・新規点Cによる単発スパイク判定、条件付き点の軌跡整合性判定、活動終了時の純粋なfinalize、各種セグメント境界での保留点・速度履歴リセットを共通純粋関数へ追加した。しきい値は `GpsProcessingConfig` に集約し、JSON replayで上書き可能。
- 距離用の正式`route`とライブ地図用`displayRoute`を分離した。Functionsへ送る座標は従来どおりクライアント採用済みcommit点だけで、フィールドも拡張していない。Functionsはv3を正式点として検証し、旧v2は従来の35mしきい値で受理し、versionなし/その他はv1互換を維持する。過去活動は再計算しない。
- `gpsQuality`へ高信頼・条件付き・条件付き採否・3点スパイク・終了時破棄の集計を追加した。replayは処理version、採否理由、精度統計、距離、設定値に加え、`--compare-v2`で同一ログのv2との差を出す。テストは直線、曲線、90度、Uターン、折り返し、低速方向転換、静止ドリフト、横飛び、終了時ノイズ、各境界、クライアント/Functions一致、v2互換を含む。
- Expo SDKはインストール済み54.0.36、`expo-location`は19.0.8。後者の公開型とネイティブ応答はiOSのfull/reduced accuracyを公開していないため、unsafe castは追加せず、iOSは実測accuracyによる開始判定を維持した。Androidのfine/approximate判定と設定導線は維持。
- 獲得標高・高低差は記録結果、活動詳細、統計、自己ベスト表示から外した。共有カードには元から表示がなかった。Firestoreフィールド、既存活動の読み込み、型、受信altitude、サーバー集計は互換性のため維持する。
- 検証手順と暫定合格基準を `docs/GPS_DISTANCE_VALIDATION.md`、リリース確認項目を `RELEASE_TEST_CHECKLIST.md` へ同期した。確認成功: `npm run lint`、`npm run typecheck`、全unit、Functions build、JSON replay（v2比較）、iOS Expo export、`git diff --check`。Firestore Rulesは変更していない。**物理端末でのv3実走と本番Functionsデプロイは未実施**。

### 2026-08-03 旧avatarUrl掃除の失敗でログインが完全にブロックされる問題を修正

- 症状は「プロフィール情報へのアクセス権限を確認できませんでした。」の全画面表示。`initAuthListener` の旧`avatarUrl`削除バッチが`permission-denied`で落ちると`catch`へ入り、`onSnapshot`の購読が張られないまま`profileError`だけが立つ。`app/_layout.tsx:112` は `authSessionActive && profileError && !user` でアプリ本体でなくリカバリ画面を出すため、ログインが通らなくなる。
- `avatarUrl` は `stores/authStore.ts` と `app/(tabs)/profile.tsx` の削除処理以外どこからも読まれておらず、掃除は純粋なデータ衛生でログインの前提条件ではない。掃除バッチだけを `try/catch` で包み、失敗時は `console.warn` を残してプロフィール購読へ進むようにした。掃除が失敗しても表示は内蔵アイコンのままで、写真が復活することはない。
- デプロイ済みルールを Rules API で取得して照合済み。`projects/zelio-run/releases/cloud.firestore` は ruleset `cd35b9f2-3fa7-497e-8a69-4259b667b5dd`（2026-08-02T08:36:58Z）で、ローカル `firestore.rules` と**完全一致**。前回の「旧アプリ互換を含む」ruleset `85fbf497-...` との差分は declarations cheers の `allow update/delete` だけで、avatarUrl/アバター関連の互換条項は失われていない。ルール側の退行ではない。
- Firestoreエミュレータでの実測: 現行コードのログインバッチは、写真URL残存・publicProfiles欠落・Functions集計フィールド持ち・pro・admin のいずれの`users`形状でも成功する。一方、以下の`users`ドキュメントはログインバッチが恒久的に`permission-denied`になり、修正前は該当ユーザーが締め出される — `plan`が`free`/`pro`以外または欠落、`name`が欠落/41文字以上/NGワード、`avatarEmoji`が内蔵24種以外、`weeklyGoal`がキー違いまたは範囲外、`runningPresenceVisible`が非bool。
- 同エミュレータで、**旧アプリ（写真機能あり版）の書き込みは現行ルールで拒否される**ことも確認した。旧ビルドの新規登録は`users` createの`!('avatarUrl' in ...)`で、旧ビルドのログイン時`publicProfiles`書き戻しは`avatarUrl`フィールドを持たないドキュメントに対して`keepsOrRemovesLegacyAvatarUrl()`で落ちる。旧ビルドが残っている端末は再ビルド配布が必要。
- 確認成功: `npm run typecheck`、`npm run test:unit`（全件）、`npm run test:rules`（117 PASS / 0 FAIL）。**未確認**: 実機での再現と修正後のログイン成功。本番`users`コレクションの実データ形状監査（どのアカウントが上記の非適合形状かの特定）は未実施で、ユーザー許可が要る。ルール・Functionsのデプロイは行っていない（今回はクライアント修正のみ）。

### 2026-08-02 「今日のラン宣言」の編集・取り消し・日付整合性・応援数を改善

- 当日かつ`planned`の自分の宣言へ「変更」「取り消す」を追加した。変更は予定時刻と20字以内のひとこと、取り消しは確認ダイアログ付き。取り消しは`cancelled`へ更新して当日一覧から隠し、チーム通知・ペナルティは発生しない。同日中の再宣言時は旧cheersを本人権限で清掃してから同じ日次ドキュメントを再利用する。
- 宣言へ作成時のIANA `timezone`と`dateKey`を保存する。活動側は記録開始時の端末timezoneをセッション復旧対象として保持し、達成判定は終了日時でなく活動開始日時を使う。保存timezone付き宣言とtimezoneなし旧宣言の両方に対応し、23時台開始・翌日終了でも開始日側を達成する。
- 達成確定は新規Callable `completeRunDeclarationsForActivity` と活動作成トリガー `completeDeclarationOnActivityCreated` の共通トランザクションへ分離した。活動ドキュメントから本人・開始時刻・反映先をサーバー確定し、`planned`だけを`done`にする。活動へ`declarationAchieved`を残して再送・Callable/トリガー競合を冪等化し、クライアントの既存更新は新Function未到達時の後方互換フォールバックとして維持した。未承認のGPS距離処理を含む`submitActivity`自体には差分を残していない。
- 応援数は既存`declarations/{id}/cheers/{uid}`をFirestore集約countで取得し、全cheerドキュメントの通常読み込みや親ドキュメントへの非正規化を増やさない。応援成功時はローカル件数も1増やし、重複作成はUID固定ID＋ルールで拒否する。取消済みへの応援と通知も拒否する。
- ランタブのSTARTより上へ、選択中チャレンジに連動する高さ48ptの小型宣言導線を追加した。未宣言・予定あり・達成済みを短く表示し、既存のチャレンジタブ宣言作成/編集UIへ移動する。複数参加時はユーザー別に保存された閲覧中チャレンジだけを対象にする。
- Firebase Analytics等の分析SDK/基盤はプロジェクトに存在しないことを確認した。新しい外部分析サービスや名目だけのイベント送信は追加していない。将来SDK導入時は作成/変更/取消/達成/応援、リマインド登録/開封/記録開始の各確定箇所へ自由入力を含まないイベントを接続する。
- Firestoreルールは本人のplanned編集/取消、他人・done・許可外フィールドの変更拒否、取消済み応援拒否、再宣言前の旧応援清掃だけを許可する。ルールテストへ時刻経過後のひとこと編集、重複応援、取消・再宣言まで追加した。
- 確認成功: `npm run typecheck`、`npm run lint`、`npm run test:unit`、Functions build、Firestore Rules全件、iOS Expo export、`git diff --check`。日付テストは予定時刻前後、23時台開始、翌日開始、旧timezoneなし、cancelled/done、応援件数の重複抑止を含む。実機での編集フォーム、確認ダイアログ、通知再登録、ランタブ導線、2アカウント応援表示は未確認。
- **本番デプロイ済み（2026-08-02）**: ユーザーの明示指示を受け、`zelio-run`へ`completeDeclarationOnActivityCreated`（asia-northeast1、新規・retry有効）/ `completeRunDeclarationsForActivity`（us-central1、新規）/ `onDeclarationCheerCreated`（asia-northeast1、更新）とFirestore Rulesだけを限定デプロイした。Functionsは3件成功・エラー0件で、デプロイ後の一覧でも3件すべてACTIVE。Firestore rulesetは`projects/zelio-run/rulesets/cd35b9f2-3fa7-497e-8a69-4259b667b5dd`。未承認のGPS距離処理を含む`submitActivity`はデプロイしていない。

### 2026-08-02 写真アップロードを廃止し、内蔵アバターへ統一

- プロフィールの写真選択・権限要求・Blob変換・Firebase Storageアップロード・写真表示を削除し、プロフィールカードと設定行から24種類の内蔵動物アイコン選択を直接開くようにした。写真URLが旧データに残っていてもUIでは使用しない。
- `expo-image-picker`、クライアントのFirebase Storage初期化、Storage bucket環境変数、`User.avatarUrl`を削除した。生成済みiOSプロジェクトもImagePicker Podとカメラ・マイク・写真ライブラリ権限文言を除去した。
- 新規ユーザーは`avatarUrl`を保存しない。既存ユーザーはログイン時とアイコン変更時に`users` / `publicProfiles`の旧`avatarUrl`を`deleteField()`で除去する。Firestoreルールは写真URLと内蔵24種以外のアイコンを拒否し、Storageルールはクライアントの全ファイル読み書きを拒否する。
- アプリ内・Firebase Hostingの利用規約／プライバシーポリシー、App Store提出資料、リリース確認項目を内蔵アバター仕様へ同期した。App Store Connect参照先のPublicリポジトリ `masaki0219/app-support` もPR [#2](https://github.com/masaki0219/app-support/pull/2)、main commit `a071f195417bc9bdce47656d4fbb328082968ccc` で更新し、GitHub PagesのSupport / Privacy / Termsすべてで旧「プロフィール画像」表記が消えたことと新本文を公開確認した。
- Admin SDKで本番プロジェクト `zelio-run`、Storage bucket `zelio-run.firebasestorage.app` の `avatars/` を走査した結果、既存オブジェクトは0件・0 bytesで削除対象はなかった。旧クライアント由来データへの安全策として、`onUserDeleted`の旧画像清掃は当面維持する。
- 確認成功: `npm run typecheck`、全unit、Functions build、Firestore Rules全件、iOS Expo export、CocoaPods再生成、`git diff --check`。`zelio-run`へ旧アプリ互換を含むFirestore ruleset `projects/zelio-run/rulesets/85fbf497-3ebb-4940-a31f-28372fbfe216`、Storage ruleset `projects/zelio-run/rulesets/b356d2ef-a45e-4af5-b884-16b7c22b55b4`、Hosting version `5b82c51bce9175fb`をデプロイし、Firebase Hostingの法務ページ本文も公開確認した。FunctionsとGPS関連はデプロイしていない。

### 2026-08-02 GPS距離の系統的な水増しを抑制

- 実コードを再調査し、Expo SDKはインストール済み54.0.36、`expo-location` 19.0.8、foreground/backgroundとも `BestForNavigation`、従来は採用可能な全点間のHaversineを逐次加算、水平精度80m、速度25km/hまで許可していたことを確認した。サーバーの `submitActivity` が再計算した距離が活動・個人記録・チャレンジの正式値、送信ルートはクライアント採用済み点だけである。
- `functions/src/gpsProcessing.ts` をReact Native/Firebase非依存の共通純粋関数とし、アプリは `utils/gpsProcessing.ts` から同じ実装を使う。基本値検証→水平精度35m→GPS空白15秒→点間速度7.0m/s→commitAnchorから3mの順で処理し、低品質点・ワープ・3m未満ジッターは正式基準点を更新しない。GPS空白、手動/自動停止再開、セッション復旧、ウォッチドッグ復帰は `seg` 境界に統一した。
- 記録画面は表示時から本番と同じ `BestForNavigation` / `distanceInterval: 0` で連続ウォームアップし、35m以内の新鮮な点でacceptable、25m以内3点連続でreadyとする。開始点は5秒以内だけ引き継ぎ、通常監視の同一timestampは重複除外する。Androidはforeground permissionの `fine` を必須にし、概算位置と位置情報サービスOFFには別メッセージと設定導線を出す。`expo-location` 19.0.8のiOS公開型にfull/reduced accuracy判定項目が無いため、iOSは型キャストを使わず実測accuracyで開始を守る。
- foreground/backgroundは `BestForNavigation` / `distanceInterval: 0`、backgroundは追加で `ActivityType.Fitness` / `pausesUpdatesAutomatically: false`、Androidだけ `timeInterval: 1000`。オートポーズOFFでも距離フィルタは常時有効である。自動再開は1点でなく、1.2m/s超が3点連続し、候補窓の変位が3m以上の場合だけにした。
- Functionsはクライアント採用済みcommit点を共通関数で再生し、明示済み `seg` を空白/停止境界とする。中間のMICRO_JITTERは送信されないため、Functionsは疎なcommit timestampからGPS空白を再推定しない。サーバー応答の正式距離を完了画面に使う既存経路は維持した。旧オフラインキューはversion 1互換処理で保存可能。過去活動の再計算は行わない。
- 座標を含まない活動単位品質集計を `gpsQuality` として保存する。全生点は既定OFFの `EXPO_PUBLIC_GPS_DEBUG_EXPORT=1` 時だけ端末内の最新1活動とMetroログへJSON出力し、サーバーへは送らない。`npm run gps:replay -- <log> [config]` で同じ純粋関数を再生できる。詳細とトラック/建物沿い/静止/background/停止の実走手順は `docs/GPS_DISTANCE_VALIDATION.md`。
- 新規GPSfixtureは1km直線、小刻みジッター、100m/1秒ワープ、80m精度、20秒空白、timestamp逆転、重複、手動停止再開、自動停止中ジャンプ、0.8m/s歩行、クライアント/Functions整合、3m未満終了端数、長時間統計上限を含む。確認成功: `npm run lint`、`npm run typecheck`、全unit、Functions build、Firestore Rules全件、JSON replay、iOS Expo export、`git diff --check`。実走・EAS development buildでのbackground追跡は未実施。
- **本番デプロイ未実施**: `submitActivity` / `aggregateActivity` の `zelio-run` への限定デプロイは、共有本番環境の距離計算を変える明示承認が必要と安全審査で判定され、実行されなかった。クライアントv2を配布する前に、ユーザーの明示承認後にこの2関数をデプロイする。

### 2026-08-01 メタレビュー必須項目を実装

- 初回リリースからチャレンジテーマを完全撤去し、Pro訴求・画面ルート・型・保存権限・未使用実装を削除した。軍事系のユーザー文言も「ラン宣言」「はじめの一歩」「朝活ランナー」「ウォークマスター」へ統一した。
- 月間統計は、認証ユーザーの保存済み活動を東京時間基準で一度だけ全件バックフィルする `backfillMonthlyStats` と、以後のサーバー増減集計を共通の正とした。上段「今月」と月別内訳は同じ `monthlyStats` を読む。
- オレンジCTAを濃色文字へ統一し、記録中のタブバー非表示、最大文字サイズで消えていた通知・残り日数/順位・前回ラン情報、共有形式のユーザー別端末保存、共有画像からのGitHubドメイン削除を実装した。
- 同時参加は最大2件とし、`joinBattle` / `leaveBattle` Callableのトランザクション、`users.battleIds`とparticipantsの直接更新禁止、記録加算先の2件制限を追加した。距離・活動回数・歩数加算が0の間だけ退出でき、旧データの3件目以降は「他のチャレンジ」へ残す。
- チーム色を`categoryId`基準で決定し、3チーム以上は自チームと近い順位を先に全件横スクロール表示、距離バーは首位100%の実比率へ変更した。Day-0は単一推薦を廃止し、公開チャレンジ2〜3件を並列表示する。
- Firebase AuthセッションとFirestoreプロフィール取得エラーを分離し、一時障害でログイン画面へ落とさず、原因別メッセージと再試行を表示する。App CheckはネイティブSDK組み込み・debug token・正規リクエスト率監視が先に必要なため、直前のenforcementは見送った。
- `npm audit fix`（`--force`なし）で安全に更新できる推移依存を更新。確認成功: `npm run typecheck`、全unit、Functions build、Firestore Rules全件、Expo Doctor 18/18、iOS Expo export、`git diff --check`。2026-08-01にユーザー指示を受け、`joinBattle` / `leaveBattle` / `backfillMonthlyStats` と関連Functions 4件（`submitActivity` / `deleteActivity` / `awardBadgesOnActivityAggregated` / `syncMyBadges`）を `zelio-run` へデプロイ（7件成功、エラー0件）。Firestore Rulesも ruleset `projects/zelio-run/rulesets/6e98658c-a883-47f6-bd12-69b55f49257d` として公開済み。EAS/TestFlight配布は未実施。

### ラン結果のSNS共有導線を拡張（2026-08-01）

- 記録直後のサマリーにあった共有カードを、距離・時間・平均ペース・チャレンジ貢献を含むSNS向け縦長カードへ刷新した。Freeの透かしとProの透かしなし仕様は維持し、発見用URLは画像ではなく共有文面だけに含める。
- 自分の過去アクティビティ詳細にも同じ共有プレビューと共有ボタンを追加し、ヘッダーからも即座に共有シートを開けるようにした。他ユーザーの活動には共有導線を出さない。
- GPSルートは共有プレビュー上で表示/非表示を切り替え可能にし、自宅付近などが映り得ることを共有前に明示した。iOSでは画像と文面、Androidでは画像をOS共有シートへ渡し、画像共有が使えない環境ではURL付きテキスト共有へフォールバックする。
- 共有文面生成を純関数化し、距離・時間・平均ペース・貢献・`#ZELIO`・Marketing URLの出力と異常値フォールバックを単体テストへ追加。`npm run typecheck`、`npm run test:unit`、iOS Expo export、`git diff --check` が成功。実際のSNSアプリを使った画像/文面の受け渡しと共有カードの実機目視は未実施。

### 参加中チャレンジの閲覧切替（2026-08-01）

- チャレンジ画面で参加中が2件以上の場合、大きな濃緑ヒーローカードの上に横スクロール可能なコンパクト切替カードを追加した。選択中はミント枠・淡背景・「表示中」ラベルで示し、長いタイトルは2行で省略する。
- 閲覧中IDをユーザー別のAsyncStorageキー `@zelio_selected_battle_id:{uid}` に保存する。参加中チャレンジは終了日時が近い順（同時刻・不明時は既存順）に安定表示し、保存IDが終了・退出等で無効なら先頭へ自動フォールバックする。
- ヒーロー、ラン宣言、走行中メンバー、チーム内ランキング、過程データ、詳細遷移をすべて閲覧中チャレンジへ連動した。切替直後に前のチャレンジの購読結果が一瞬残らないよう、関連フックもデータのチャレンジIDを照合する。
- ヒーロー内の「他N件にも参加中」は「ランの距離は参加中のN件すべてに反映されます」へ変更した。その後のメタレビュー対応で参加・距離加算とも最大2件をサーバー保証した。
- 0件・1件・2件・3件および保存ID無効時のソート/選択を単体テストへ追加。`npm run typecheck`、`npm run test:unit`、iOS Expo export、`git diff --check` が成功。実データを使った通常/最大文字サイズでの画面目視は未実施。

### Proプランを月額のみに限定（2026-07-31）

- リリース初期の運用リスクを避けるため、プロフィールのPro購入UIから年額の表示・選択を削除した。ストア取得価格は月額1件だけを表示する。
- RevenueCatラッパーは `$rc_monthly` だけを明示取得・購入するAPIへ変更した。Current Offeringに `$rc_annual` が残っていても、アプリから新規購入されない。既存購入の復元と `Zelio Pro` entitlement判定は周期を問わず維持する。
- `APP_STORE_SUBMISSION.md` の審査ノートと提出チェックを月額のみの構成へ同期した。年額商品は将来用に保持してよいが、初期リリースではApp Store Connectの審査・販売対象およびRevenueCatのCurrent Offeringから外す運用とする。
- `npm run typecheck`、`npm run test:unit`、iOS Expo export、`git diff --check` が成功。RevenueCat / App Store Connectの外部設定変更とSandbox購入・復元は未実施。

### 画面OFF記録の設定フロー明確化（2026-07-31）

- GPS開始時の「設定する」が権限結果を確認しないままカウントダウンへ進んでいた問題を修正した。「設定する」は位置情報の設定だけを行い、成功・未完了を明示して開始前画面に留まる。記録は利用者が状態を確認してSTARTをもう一度押したときだけ始まる。
- ランタブのSTART下に「画面OFFの位置情報：許可済み／未設定」を常時表示し、未設定時は同じ場所から設定できるようにした。端末設定からアプリへ戻った際も権限状態を再取得する。記録開始後は、バックグラウンドGPSが実際に稼働した場合だけ「画面OFFでも記録できます」と表示する。
- OSの権限制約上「常に許可」は利用者による初回設定が必要だが、許可済みなら以後のSTARTでは案内を出さない。未設定のまま使う場合の選択肢も「あとで」ではなく「画面を開いたまま開始」と実際の制約が分かる文言へ変更した。
- `npm run typecheck`、`npm run test:unit`、`git diff --check` が成功。バックグラウンドGPSの実動作確認はEAS development buildの実機で行う必要がある。

### App Store Review Guideline 1.2 対応（2026-07-31）

- ニックネーム、チャレンジ名・説明・チーム名、出撃宣言メモへ共通の不適切表現フィルターを適用し、NFKC正規化と区切り文字除去で単純なすり抜けも抑制した。クライアント検証に加え、非公開チャレンジ作成FunctionとFirestoreルールにも防御を追加した。
- 宣言、ライブ参加、アクティビティ、非公開チャレンジから「通報・ブロック」を開ける共通セーフティモーダルを実装した。通報は理由・任意詳細・対象スナップショットを非公開の `contentReports` へ保存し、ブロックした相手の投稿・ランキング・ライブ表示・非公開チャレンジを非表示にする。双方間の応援/リアクションはFirestoreルールと通知Functionの両方で遮断し、相手へブロック通知は送らない。
- 管理者専用の通報キュー `app/admin/reports.tsx` を追加し、未対応・確認中・対応済み・却下を監査UID/日時付きで更新できるようにした。アカウント削除Functionはブロック参照も清掃する。`OPERATIONS.md` に1日2回以上の確認、原則24時間以内の一次対応、緊急エスカレーション、証跡記録を定義した。
- アプリ内ヘルプ・利用規約・プライバシーポリシー、`APP_STORE_SUBMISSION.md`、`RELEASE_TEST_CHECKLIST.md` を同期した。Publicリポジトリ `masaki0219/app-support` のZELIOページも更新し、commit `619bd72` をmainへpush済み（新規/privateリポジトリは作成していない）。Support / Privacy / Terms は公開後の本文とHTTP 200を確認済み。
- `npm run typecheck`、`npm run test:unit`、Functions build、Firestore Rulesテスト、iOS Expo export、`git diff --check` が成功。Firestore ruleset `projects/zelio-run/rulesets/3260ff5c-1392-4b04-8067-2d00ed892558` と関連Functions 5件（`onReactionCreated` / `onDeclarationCheerCreated` / `onPresenceCheerWritten` / `validateBattleTitleOnCreate` / `onUserDeleted`）を `zelio-run` へデプロイ済み（エラー0件）。ZELIO本体の差分は未コミット・未push。
- Xcode実機確認に備えて `npx expo prebuild --platform ios --clean` でGit管理外の `ios/` を再生成し、CocoaPods 115件を導入した。生成後は表示名 `ZELIO`、Bundle ID `com.masaki.zelio`、新AppIconを確認し、`ios/ZELIO.xcworkspace` をXcodeで開いた。Metroは同プロジェクトの8081番で応答中。接続履歴のあるiPhone 15はCoreDevice上で `unavailable` のため、端末のUSB接続・ロック解除・信頼/Developer Mode確認後、XcodeでSigning Teamを選択して実行するのが直近手順。

### ZELIOブランドアセット・公開URL整備（2026-07-31）

- ユーザー追加の `assets/zelio_icon_1024.png`（1024×1024）をiOS/共通アイコンへ採用し、`icon.png` を1024×1024・不透明・角丸なしへ置換した。Android用 `adaptive-icon.png` は提供画像の背景だけを透明化し、図柄を中央へ75%縮小して1024×1024の安全領域内へ配置。Android 13のテーマアイコン用 `monochrome-icon.png`（1024×1024・白＋透明）と通知用 `notification-icon.png`（96×96・白＋透明）、Web用 `favicon.png`（256×256）も作成した。縦長の提供画像を `splash-background.png` として追加し、iOSはfull-screen cover、Androidは中央ロゴ＋背景色のプラットフォーム別 `expo-splash-screen` 設定へ変更した。アプリ表示名も `ZELIO` に統一。
- 画像編集スキルで通知用モノクロ案も生成したが、元のZ形状を正確に保てなかったため不採用。アプリが参照する画像は提供素材を決定的にリサイズ・余白調整したものだけ。元の2画像は削除せず保持している。
- 既存のPublicリポジトリ `masaki0219/app-support`（Pages: `main/docs`）を確認し、`docs/zelio/index.html`・`privacy.html`・`terms.html` とサポート一覧/READMEを追加して `79893d2` をmainへpush。旧 `/battlerun/` はリンク切れ防止のため残した。Publicリポジトリ `masaki0219/masaki0219.github.io` へZELIOカードを追加して `72c1a6f` をmainへpush。新規リポジトリは作成していない。
- 公開URLはすべてHTTP 200と本文を確認済み: Support `https://masaki0219.github.io/app-support/zelio/`、Marketing `https://masaki0219.github.io/`、Privacy `https://masaki0219.github.io/app-support/zelio/privacy.html`、Terms `https://masaki0219.github.io/app-support/zelio/terms.html`。`lib/legal.ts` と `APP_STORE_SUBMISSION.md` も同URLへ更新した。
- 公開プライバシーポリシーとアプリ内文面を、メールアドレス、GPS精度/高度、宣言・応援等のUGC、Supabaseフィードバックまで含む現行実装へ同期。利用規約も利用者投稿・禁止事項・サービス変更を補った。
- 確認成功: アセット寸法/alpha確認、`npx expo config --type introspect`、Expo Doctor 18/18、`npm run typecheck`、`npm run test:unit`、`npx expo export --platform ios`。Expoの仕様上、スプラッシュの最終見た目はExpo Go/dev buildでは再現できないため、preview/production buildでの確認が残る。ZELIOリポジトリの変更は未コミット・未push。

### 全体レビュー v3（2026-07-30・シミュレータ＋静的確認）

- iPhone 17 / iOS 26.4 Simulator、Expo Go、ローカル Firebase Emulator のみを使い、ホーム、公開/非公開チャレンジ、統計、GPS記録、停止、通知、プロフィール、ヘルプ、活動詳細、テーマを実操作した。最大 Dynamic Type とテーマ画面のアクセシビリティツリーも確認。本番 Firebase への書き込みはなく、試験GPS記録は破棄した。起動用の一時変更はすべて復元済み。
- 総合レポートとスクリーンショットを `Desktop/ZELIO/review_report/20260730_v1/` に作成した。結論は「アプリ内のビジュアルとコア記録体験は良質だが、現状のApp Store提出は非推奨」。P0は、Expo初期アイコン/スプラッシュ、Support URL 404と提出情報プレースホルダー、UGC通報/ブロック不足、Proテーマの表示不反映・状態未復元、ネイティブbuild経路未解決。
- 新規P1は、複数の開催中チャレンジの一部が一覧から隠れる、最大文字サイズでランタブが崩れる、オレンジCTAの白文字が2.96:1、テーマ画面のVoiceOver情報不足、統計の「今月」が直近50件/端末月とサーバー月次集計で不一致になり得る、App Check未導入、依存脆弱性の再トリアージ。
- テーマは公開チャレンジで保存すると一般エラー、Pro作成者の非公開チャレンジで保存しても詳細へ反映されず、再訪すると `sports` に戻ることを再現した。テーマ定義は主要画面から消費されず、`Battle` 型/store mappingにもthemeがない。
- 2026-07-30の公開確認: `https://zelio-run.web.app/support.html` は404、privacy/termsはリダイレクト後200。`APP_STORE_SUBMISSION.md` の担当者・デモアカウントは未入力。
- 確認成功: `npm run typecheck`、`npm run test:unit`、Functions build、Firestore Rules全72チェック、Expo Doctor 18/18、iOS Expo export。`npm audit --omit=dev` はrootが critical 0 / high 21 / moderate 25、functionsが critical 0 / high 0 / moderate 9 / low 1。コード修正・Firebaseデプロイ・commit/pushは行っていない。

### ブランド/仕様判断の反映実装（2026-07-29・ユーザー決裁済み）

v2 レポートで「判断待ち」だった6件をユーザーが決裁し、すべて実装した。確認: `npx tsc --noEmit`・`npm run test:unit`（カレンダー週の境界テスト追加、全件成功）・`cd functions && npm run build`・`npx expo export --platform ios` 成功。**Functions 全17関数を `zelio-run` へデプロイ済み（エラー0件）**。実機/シミュレータでの目視は未実施。

- **語彙「チーム」統一（決裁: チームに統一）**: ユーザー向け表示の「陣営」30箇所を「チーム」へ（オンボーディング見出し・チャレンジ詳細/結果/サマリー・称号名「優勝チームメンバー/優勝チームの一員」・Functions通知文言）。「援軍募集中」→「仲間募集中」、Functions「バトルが無効化されました」→「チャレンジが無効化されました」。**軍事フレーバーはPro「陣取り合戦風」テーマとバッジ名（朝活兵等）へ退避**し、「出撃宣言」は既定方針どおり存続。コメント内の「陣営」は据え置き。
- **絵文字ロゴ削除（決裁: 削除）**: ログイン/新規登録の「🏃 ZELIO」→「ZELIO」。結果画面の🏃（rankMedal 4位以下/フォールバック）は据え置き。
- **日英併記ラベル（決裁: 端末言語に追従）**: `lib/locale.ts` を新設（`Intl` で端末ロケール判定、判定不能時は日本語既定）。結果画面7ラベル+サマリー「記録完了/RUN COMPLETE」+記録HUDの状態表示（記録中/一時停止中/自動停止中）を、日本語端末では日本語のみ・他言語端末では英語のみ表示に。オンボーディングのSTEPラベルとテーマ由来ラベル（BATTLE等）は対象外。**英語端末での表示確認は未実施**（Intl のロケール値は実機で要確認）。
- **カレンダー週化（決裁: 月曜始まり）**: `weeklyBuckets`/`weekOverWeek`/`weekStartLabel` を月曜始まりの暦週へ変更（新ヘルパー `calendarWeekStart`）。週間目標が月曜にリセットされ、「今週/先週比」の表示と実態が一致。stats の記録回数も暦週へ。**過負荷ガードレール（`hasHighTrainingLoad`）は生理的負荷判定のため移動7日窓を維持**し、カード文言を「この1週間はよく走っています」へ変更。境界テスト（日曜→月曜リセット・月曜始まりラベル）を追加。
- **N-17 チーム変更導線（決裁: チャレンジ詳細に設置）**: チームランキングカード下部に「チームを変更」リンク（参加中・開催中・**距離0の間のみ**表示 = Firestoreルールの許可条件と一致）。既存 CategorySelectModal を再利用し、失敗時は store のエラー文言（「一度記録した後はチームを変更できません。」）を表示。
- **Courier New 置換（判断不要分）**: オンボーディングの4箇所を `Typography.fontFamily.mono`（Menlo/monospace）へ。

### v2 レビュー Rev.2 の実装対応（2026-07-29）

v2 レポート（Rev.2）の指摘のうち、仕様判断が不要な11件を実装した。**ブランド判断を要するもの（陣営vsチーム語彙・絵文字ロゴ・日英併記・チーム退出導線の露出先・週表示ラベル）は未着手のまま判断待ち。**

- **N-1 停止ダイアログ** (`app/(tabs)/record.tsx`): 「停止して保存」を default で先頭へ、「破棄する」のみ destructive、「キャンセル」は cancel で末尾へ。保存が赤字で破棄より下にある逆転を解消。
- **N-4 ランタブ Dynamic Type** (`record.tsx`): 「試験的」バッジ行に flexWrap + バッジ倍率上限1.3（スイッチへの重なり解消）、装飾英字 START のみ倍率上限1.2（「STA」切れ解消。意味は accessibilityLabel とヒント文が担保）。
- **N-16 コントラスト**: 読ませるテキスト（注記・説明・空状態・法務文・フォームラベル等）**50箇所**を `textTertiary` → `textSecondary` へ置換（22ファイル）。単位・非活性・プレースホルダー・装飾ラベルは tertiary のまま。`design_tokens.ts` に使い分け方針をコメント化（tertiary は白地2.7:1でAA不適合、読ませる文字は secondary=5.1:1）。
- **N-5 通知** (`app/notifications.tsx`): ヘッダー「N件未読」→「新着N件」（開いた時点でDB既読化する実態と表示を一致。行ハイライトは新着表示として維持）。
- **N-6 文言** (`lib/validation/battleTitle.ts`, `stores/battleStore.ts`): 「バトル名/このチーム名」→「チャレンジ名/このチャレンジ名」。
- **N-7 記入例** (`PrivateBattleCreateForm.tsx`, `app/admin/battle/new.tsx`): 禁止語収載の「たけのこの里」と重複例を廃し「朝ラン組 vs よる歩き隊」へ（チーム1/2で別例、3つ目以降は例なし）。
- **N-8 PeriodPicker**: 未入力時の赤エラー枠をグレーの案内表示へ（赤は終了<開始の実エラー時のみ。`summaryGuide` スタイル追加）。
- **N-9 バッジ進捗** (`app/badges.tsx`): 「あと0.0日/9.0回」→ 日・回は切り上げ整数、kmのみ小数維持。
- **N-11 チーム選択モーダル** (`CategorySelectModal.tsx`, `battle.tsx`): `stats` prop を追加し各行に「N人が参加中」、最少人数チームに「いま入ると貢献が大きい」を表示。平均kmは意図的に出さない（初心者萎縮の懸念）。accessibilityLabel にも人数を含めた。
- **N-15 サマリー** (`app/record/summary.tsx`): GPSラン（歩数0）では「歩数 ---」セルを区切り線ごと非表示。
- **結果画面のラベル不一致修正** (`app/battle/result/[id].tsx`): 「陣営内順位」ラベルに陣営同士の最終順位（myRank）が入っていたため「陣営順位」へ。**あわせて v2 の N-14（優勝時もお疲れさまでした）はシード不備による誤指摘と判明し撤回**（アプリは 🥇優勝！/🥈準優勝/🥉3位入賞 の `rankMedal()` 分岐を実装済み。レビュー用シードの `users.battleIds` に終了チャレンジ未登録 → membership 未解決でフォールバックが出ていただけ）。
- 確認: `npx tsc --noEmit`、`npm run test:unit`（全件成功）、`npx expo export --platform ios` 成功。Firestoreルール・Functions無変更のため `npm run test:rules` は対象外。**画面目視（通常/特大文字）は未実施** — 次回シミュレータで N-1/N-4/N-8/N-11 の見た目確認を推奨。

### 全体レビュー v2（AI感・万人受け観点、シミュレータ実操作）（2026-07-29）

- v1 と同じ環境（iOSシミュレータ + Expo Go + ローカルFirebaseエミュレータ `demo-zelio`、**本番接続なし**）で、今回は idb により**新規登録 → チーム参加 → GPSラン実走（位置シミュレーション）→ 一時停止 → 停止 → オフライン保存**まで実操作した。61画面を撮影し、レポートを `Desktop/ZELIO/review_report/20260729_v2/` に作成。**コード変更はなし**（起動用に一時変更した `lib/firebase.ts` は復元済み、`git status` は作業前と同一。シミュレータの Expo Go はテストラン再送防止のためアンインストール済み — 次回 `npx expo start` で自動再インストールされる）。
- v1 修正13件のうち画面確認可能な11件はすべて意図どおり動作（権限フロー・Pro価格フォールバック・色衝突解消・ラップ表示・残り日数統一・タブバーa11y等）。手戻りゼロ。
- 新規指摘に P0 はなし。主な新規 P1: **停止ダイアログの「停止して保存」が destructive（赤）で破棄が先頭**（`record.tsx`）、ランタブの Dynamic Type 破綻（START が「STA」に切れる・「試験的」バッジ重なり）、textTertiary のコントラスト不足（実測 白地2.73:1）、チームの退出・変更導線なし。**禁止語まわりの精査結果（リストが商標のみで不適切語ゼロ / サーバー側適用はチャレンジ名のみでニックネーム・宣言メモはクライアントのみ / チーム名ラベルは未検証）は既存P0「通報・ブロック」を「UGC対策一式」へ拡張する形で統合**した。
- レポートは同日中に **Rev.2 へ改訂**（第三者レビュー反映）: 「AI感」（絵文字ロゴ🏃 / 日英併記 / Courier New の3点、P2）・「万人受け」（軍事語彙をProテーマへ退避する案はブランド判断の一材料）・ペルソナ・競合比較を**未検証の仮説として明示**し、優先順位を整理（通知既読はP2へ、コントラスト・チーム退出はP1へ）。
- ライブプレゼンスカードは鮮度内データを投入しても表示を確認できず（不具合とは断定せず、実機2台での確認項目へ）。

### UI/UXレビュー（シミュレータ実行）と指摘対応（2026-07-29）

- **初めてアプリを起動して画面を確認した**。iOSシミュレータ（iPhone 17 Pro / iOS 26.5）+ Expo Go + **ローカルFirebaseエミュレータ**（Auth/Firestore にダミーデータ投入）で24画面/状態のスクリーンショットを取得し、レポートを `Desktop/ZELIO/review_report/20260729_v1/` に作成した（Rev.2 で第三者レビューの指摘を反映済み）。**本番 `zelio-run` には一切書き込んでいない**。起動用に一時変更した `lib/firebase.ts` 等はすべて元へ戻し済み。
- **ネイティブ dev build (`npx expo run:ios`) は SwiftUICore のリンクエラーで失敗**（`useFrameworks: static` 環境で「cannot link directly with 'SwiftUICore'」）。今回は Expo Go で代替した。実機/EASビルドでの確認は引き続き必要。
- 実装した修正（すべて画面で再現を確認したもの、または明確なコード欠陥）:
  - **記録開始フロー**: 位置情報の権限確認を START直後・カウントダウン前へ移動（`ensureLocationPermission()`）。使用中の許可が取れなければ**記録を開始しない**（従来はカウントダウン後にダイアログが2枚出て、その間もタイマーだけ進んでいた）。「常に許可」は理由説明つきで任意要求し、`useLocation` 側は `getBackgroundPermissionsAsync`（確認のみ）へ変更。
  - **記録中の自動ロック抑止**: `expo-keep-awake` を `package.json` へ明示依存として追加し、記録中のみ有効化。※バックグラウンド記録（`startLocationUpdatesAsync`）は元から実装済みで、これは「使用中のみ許可」でフォアグラウンド監視に落ちた場合の保険。
  - **ヒーローの表示崩れ**: `ActiveBattleHero` の負マージンを除去し、`FactionColumns` は値ラベル分（17px）を差し引いた領域でバーを描画。首位の数値と「N位/M」の重なりを解消。
  - **チーム色の衝突**: `Colors.teamColors[0]` は `Colors.primary` と同値のため、自分が1位でないと1位のバーが自チーム色と同じになっていた。純関数 `utils/teamColors.ts` の `pickOtherTeamColor()` を追加し `design_tokens.ts` の `otherTeamColor()` 経由で `BattleRankRows` / `battle/[id]` を差し替え。
  - **ラップ表示**: 最速ラップのオレンジ強調を廃止（同じ画面の地図凡例では「ゆっくり=オレンジ」で矛盾していた）。ティールの「最速」バッジに変更し、バー長を**速さ基準**（最遅35%〜最速100%）へ。
  - **残り時間の丸め統一**: 表示用 `remainingLabel()` を追加し、詳細画面のカウントダウンと同じ切り捨て基準へ（ホーム「残り5日」／詳細「4日23時間」の食い違いを解消）。`daysLeft()`（切り上げ）は逆転ペース計算用に残す。
  - **Pro購入導線**: 価格が1件も取得できないときは購入ボタンを非活性にし「価格を読み込めませんでした／再読み込み」を表示。
  - **認証**: `textContentType`/`autoComplete` を追加（iOSのパスワード自動入力が効くように）、パスワード表示切替、Firebaseの英語生メッセージを `lib/authErrors.ts` の日本語文言へ、登録画面の「ログインに戻る」を `router.replace` へ（オンボーディングから来ると `back()` が無反応だった）。
  - **ニックネーム検証**: `lib/validation/displayName.ts` を追加（禁止語・12文字・制御文字）。公開ランキングに出る唯一のUGCのため。
  - **Dynamic Type**: ヒーローの固定 `lineHeight` を除去、タブバーは `fontScale >= 1.3` でアイコンのみ表示（`accessibilityLabel` は維持）、補助ラベルのみ `maxFontSizeMultiplier={1.3}`。「さらに大きな文字」で文字が途中で切れる崩れは解消。
  - **通信失敗の扱い**: ホームの初期取得失敗を握り潰さず「読み込めませんでした／再試行」バナーを表示（従来は空状態と区別できなかった）。
  - **重複表示**: 「他のチャレンジ」から参加中のチャレンジを除外。
  - **用語**: ユーザー向け表示の「区分」をすべて「チーム」へ（Day-0の主CTA「チームを選んで参加する」等）。
  - **その他**: 称号カードの `seasonId` 生表示を削除。オンボーディングのダークカード上の文字を `DarkColors.primary` へ（コントラスト 2.6:1 → 適合）。
- 新規テスト `tests/reviewFixes.test.ts`（`remainingLabel` の境界、`validateDisplayName`、`pickOtherTeamColor` が自チーム色を返さないこと）を追加し `tests/unit.test.ts` へ登録。
- 確認: `npx tsc --noEmit`、`npm run test:unit`（全件成功）、`npx expo export --platform ios` 成功。Firestoreルール・Functionsは無変更のため `npm run test:rules` は未実行。**実機での確認は未実施**。
- **未対応で残した主なもの**（レポート付録A参照）: 通報・ブロック（仕様判断が必要）、一時停止中の視認性、記録中のタブバー、記録中マップの追従・再センター、週の定義（移動7日窓 vs カレンダー週）、体重設定、`textTertiary` のコントラスト、「陣営 vs チーム」の統一先決定、Android公開時の削除Modal + Web削除申請ページ。

### アプリ内評価・ご要望フォーム（Supabase共通受信箱）（2026-07-21）

- ユーザーが運営する複数アプリ共通のSupabaseプロジェクト（問題集アプリで稼働中）の `public.feedbacks` テーブルへ、アプリ内から星評価（1〜5必須）と本文（任意・1000字上限）を送信するフォームを追加した。`app_id: 'zelio'` で他アプリと区別する。送信は `@supabase/supabase-js` を使わず `lib/feedback.ts` の `fetch`（PostgREST・15秒タイムアウト）のみで、依存追加なし。`source: 'settings'` / `screen_name: 'help'` / `app_version` / `os` を併送する。
- フォームはヘルプページ（プロフィール→「ヘルプ・お問い合わせ」）の**最上部へ直接埋め込み**、その下にFAQを表示する構成（ユーザー指定。当初の別画面 `app/feedback.tsx` + リンク方式は「タップして開くのが面倒でわかりづらい」とのことで廃止・削除済み）。実体は `components/feedback/FeedbackForm.tsx`（星タップ+ラベル、複数行入力、送信中状態、送信後は同カード内でお礼表示に切替＝二重送信防止）。`LegalDocument` に `topContent` propとKeyboardAvoidingViewを追加して埋め込んでいる。GitHub Issues窓口は「返信が必要な報告」用として残した。ヘルプは公開ルートのため未ログインでも送信できる。
- 設定は `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` を `.env` / `.env.example` / `eas.json`（3プロファイル）へ追加。未設定時はヘルプのセクション自体が非表示になる。**anonキーはクライアント埋め込み前提の公開キーだが、eas.json はgit管理下なのでリポジトリを公開する場合は EAS Secrets へ移すこと。**
- 確認: `npx tsc --noEmit`、`npx expo export --platform ios` 成功。curl による実インサートで HTTP 201（受信箱にテスト行1件あり、削除してよい）、anonキーでのSELECTはRLSにより空配列（他ユーザーの投稿は読めない）を確認済み。Firestoreルール・Functionsは無変更のため `npm run test:rules` は不要。実機/シミュレータでの画面目視は未実施。

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

1. **Apple／Googleログインをクライアントへ実装し、初回ニックネーム検証、既存メールアカウントとのリンク、削除前のprovider再認証／Appleトークン失効まで含めて実機検証する。**

## その次の候補
- 現行差分とApple／Googleログインを含むTestFlightビルドを作成し、`RELEASE_TEST_CHECKLIST.md`を2台の物理端末で全項目通して、GPS実走（バックグラウンド／画面ロック／オフライン復帰）、RevenueCat購入／復元、Push実配送、AX5全画面を確認する
- 同一端末・同一コースでGPS v3を最低5回実走し、既知距離の中央値誤差±2%以内・単発±5%以内・10分静止20m未満と、90度/Uターンを削りすぎないことを確認する
- シミュレータまたは実機で参加中チャレンジ切替（0〜3件、長いタイトル、最大文字サイズ、再起動、終了時フォールバック）を目視確認する
- 2アカウントの実機またはTestFlightで、宣言作成→変更→応援→取消→再宣言→活動達成と通知を一連で確認する
- RevenueCatのCurrent Offeringから年額を外し、App Store Connectでyearlyを審査・販売対象外にしたうえで、月額だけのSandbox購入・復元をTestFlightで確認する
- 現行差分からEAS preview buildを作成し、物理端末でホーム画面アイコン、iOS full-screen splash、Android adaptive icon/Android 12 splashを確認する
- 実機でオフライン停止→端末キュー保存→オンライン復帰後30秒以内の再送と、サマリー集計の15秒フォールバックを確認する
- 実機で新機能を目視確認する: 一時停止/再開、カウントダウン、目標バー、1kmラップ、記録削除、開始前GPSチップ
- `RELEASE_TEST_CHECKLIST.md` の通し確認（Day-0、GPS保存、再送、ランキング反映、アカウント削除を2アカウントの実機で）を行う
- 旧 `battlerun-75eb6` プロジェクトの削除（または凍結）を検討する
- ローカル `ios/` は表示名等が旧設定のまま。ローカルでネイティブビルドする場合は `npx expo prebuild --platform ios --clean` で再生成する
- masaki0219/app-support（GitHub Pages）の docs/battlerun/ 配下サポートページをZelio表記へ同期する
- `feat/ui-consolidation` を `main` へマージするか判断する（origin へは push 済み）
- 使われていないブランチ `feat/ui-refresh` / `feat/ui-redesign` を整理する
- バックグラウンドGPS を EAS development build で確認する（Expo Go ではフォアグラウンドのみ）
- 機能ギャップ Phase 3 の T-20「インターバルワークアウト」を実装する

## 未解決・要確認

- **Apple／GoogleログインはFirebase側だけ有効でクライアント未実装（2026-08-10）**: Appleは`ios.usesAppleSignIn`、config plugin、Apple App ID capability、nonce付きID token→Firebase credential、初回だけ返る氏名の保存、private email relay登録、削除時の再認証／トークン失効が必要。GoogleはネイティブSDKとconfig plugin、Firebase構成ファイル、iOS URL scheme、AndroidのEAS/Play署名SHA-1、ID token→Firebase credentialが必要。providerの表示名を直接公開せず既存フィルターを通す初回ニックネーム画面、既存メールアカウントと同一メールになった場合の安全なリンク方針、法務文面とApp Privacyも更新・テストする。
- ~~外部法務ページの同期が必要~~ **GitHub Pagesは解決済み（2026-08-02）**: `masaki0219/app-support` のPrivacy / Terms / Supportを内蔵アバター仕様へ更新し、Pagesデプロイ成功と公開本文を確認した。App Store ConnectのApp Privacy変更だけは人手で必要。
- ~~旧Storage画像の確認・削除が必要~~ **解決済み（2026-08-02）**: 本番bucketの `avatars/` は0件・0 bytesで、削除対象はなかった。新規アクセスはStorageルールで全面拒否済み。
- ~~UGCの通報・ブロックが未実装~~ **解決済み（2026-07-31）**: 投稿前フィルター、投稿別の通報、ユーザーブロック、相互インタラクション/通知遮断、管理者通報キュー、公開連絡先、運用手順まで実装・デプロイ済み。実際に原則24時間以内の一次対応を継続する運用と、提出前の2アカウント実機確認は人手で必要。
- ~~軍事系ユーザー文言が残る~~ **解決済み（2026-08-01）**: テーマ撤去と同時に、出撃・初陣・兵・隊長・歩兵・援軍に当たる表示、通知、バッジ、fixtureを中立表現へ変更した。
- **GPS距離フィルタv3の物理端末検証が未実施（2026-08-04）**: 既知距離の誤差/再現性、10分静止の増加、iOS/Androidの権限表示、画面ON/OFF、foreground/background切替、OS強制停止・ウォッチドッグ復帰、オートポーズの停止/低速歩行をEAS development buildの実機で確認する。v2ログとのreplay比較も行う。しきい値は暫定で、この確認前に「解決」と断定しない。
- **ネイティブ dev build がローカルで通らない（2026-07-29）**: `npx expo run:ios` が `cannot link directly with 'SwiftUICore'` で失敗する（`useFrameworks: static` 環境）。EASビルドで再現するかは未確認。ローカルで実機確認する場合はここが先に必要。

- **ランニング基本機能・Sprint 1〜4（T-11まで）の実機確認が未実施（2026-07-20）**: 記録系Functions、自己ベスト・月次統計集計、出撃宣言・ライブ応援Functions、関連ルールは `zelio-run` へデプロイ済み。実機/シミュレータでの目視（一時停止HUD・オートポーズ・音声コーチ・週間目標・自己ベスト祝福/一覧・月間/年間統計・出撃宣言・通知タップ・宣言/ライブ応援プッシュ・ライブプレゼンス3分失効・HUD触覚/音声・宣言達成・過負荷カード・オフライン再送・カウントダウン・目標バー・ラップ表示・削除フロー）は未実施。新規活動の月次加算と削除時の減算も実データでは未確認。バックグラウンドのオートポーズは EAS development build が必要。
- 今回の新規3件と関連4件（`submitActivity` を含む）はNode.js 22で `zelio-run` へデプロイ済み。Support / Invite / Privacy のHosting変更は今回の対象外で、引き続きローカルのみ。
- 一時停止まわりの設計メモ: 終了済みバトルの集計は削除時に減算しない（結果確定のため）。バッジは削除しても剥奪しない。セッション復旧時（アプリ再起動）は `segmentPending: true` でギャップ距離を数えない仕様に変えた。
- `EXPO_PUBLIC_REVENUECAT_API_KEY` は `appl_RRF…`（.env側の値）が正と確認され、`eas.json` 3プロファイルを統一済み（2026-07-19）。
- 修正済み `revenuecatWebhook` のデプロイと zelio-run 残作業（Auth メール/パスワード有効化、Firestore データコピー、RevenueCat Webhook URL 変更）はユーザー報告により完了（2026-07-19）。
- 実機での画面目視（PeriodPicker・月額/年額選択UI等）はユーザー報告により完了（2026-07-19）。
- 2026-07-19 の functions デプロイで `revenuecatWebhook` が「No changes detected」でスキップされた＝それ以前に現行ソースでデプロイ済みだったことを意味する（他13関数は今回更新）。Webhook が us-central1 なのに対し Firestore トリガー系は asia-northeast1 と、リージョンが混在している点は把握しておく。
- RevenueCat 側 Webhook 設定の URL（us-central1 の revenuecatWebhook）と Authorization ヘッダが `REVENUECAT_WEBHOOK_AUTH` シークレットと一致しているかは、ダッシュボードで要確認（コード側からは確認不可）。
- zelio-run 移行の残作業（Auth メール/パスワード有効化・Firestore データコピー・Webhook URL 変更）はユーザー報告により完了。移行した Auth ユーザー2件のパスワード再設定は各アカウントの「パスワードを忘れた」から行う（未実施の場合）。
- サポート窓口は `https://github.com/masaki0219/app-support/issues` を使用し、ZELIO Hostingの `/support.html` から案内する。個人情報を含む問い合わせを公開Issueへ書かせない注意文を表示済み。非公開窓口として2026-07-21にSupabase評価・ご要望フォームをヘルプへ併設した（返信不可のため、返信が必要な報告はGitHub Issueを継続使用）。
- Supabase評価・ご要望フォームの実機/Expo Goでの目視（ヘルプ最上部のフォーム表示・星タップ・キーボードと送信ボタンの重なり・送信後のお礼表示・未設定時の非表示）は未実施。Hosting `/support.html` からのフォーム案内追記も未実施。
- Expo依存は `expo ~54.0.35`、`expo-font ~14.0.12`、`expo-router ~6.0.24` へ更新済み。Expo Doctorは18/18合格。
- `npm audit fix`（`--force`なし）適用後、rootの `npm audit --omit=dev` は high 12 / moderate 23（合計35）。主なhighはExpo/Metro配下の`image-size`・`postcss`とFirebase配下の`undici`で、npm提示の解消はExpo/Firebaseのメジャー更新を伴う。functionsはhigh 0 / moderate 9で、残りはfirebase-admin配下の`uuid`系。互換性を壊す強制更新は未適用。
- Firestore Rulesテストは一時Temurin 21 JREとローカルエミュレータで2026-08-01に全件成功。JREは`/tmp`だけに配置し、システムへインストールしていない。
- `submitActivity` はサーバーで距離を再計算するが、Firebase App Checkのネイティブ導入は未実施。Firebase Apple/Android SDKの導入、App Attest/DeviceCheck・Play Integrity登録、debug token整備、メトリクス監視後に距離送信系から段階的にenforcementする。
- クラッシュ監視・分析イベントはSDK/送信先・プライバシー申告を決める外部設定が必要なため未導入。App CheckもApple App Attest / DeviceCheck、Android Play Integrity、Firebase Console設定とdevelopment buildでの確認が必要。
- リリース対象（iOS先行 / Android同時）はプロダクト判断のため未決定。公式チャレンジの実データ作成、テストユーザー配置、App Store Connectへの回答転記も人手の運用作業として残る。
- `FactionColumns` のバー高さは首位100%の実距離比。正の小値だけ15%の最低表示、0kmは基線のみとし、各バー上に実数値を表示する。
- `useTeamRanking` は participants サブコレクションを全件読む（既存の `useBattleParticipants` と同じ方式）。大規模バトルでは読み取り件数が増える。上位3名の users 読みは3件に固定。
- ダーク面（記録中HUD・結果画面）がパイン系に変わったため、`battle/result/[id].tsx` など今回レイアウトを触っていないダーク画面の見え方は要確認。
- チャレンジテーマ画面・定義・導線は初回リリースから完全撤去済み。
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
npm run typecheck               # TypeScript型チェック
npm run test:unit               # 純関数・バリデーションテスト
cd functions && npm run build   # Functionsビルド
cd ..
npx expo export --platform ios  # Metro でバンドルが通るかの確認（シミュレータ不要）
npm run test:rules              # Firestore ルールのテスト（Firebase エミュレータ必要）
```

2026-08-02 時点: `npm run lint`、`npm run typecheck`、`npm run test:unit`、Functions build、Firestore Rulesテスト、`npx expo export --platform ios`、`git diff --check` がすべて成功。

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
