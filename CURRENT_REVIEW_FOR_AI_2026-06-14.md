# BattleRun 現行レビュー・改善相談用レポート

作成日: 2026-06-14  
対象: `/Users/takahashimasaki/Desktop/BattleRun/battlerun`  
目的: 別のAIと機能改善・UI改善・実装改善を議論するための現状共有  
確認方法: ソースコード読解、`npx tsc --noEmit`

## 1. 一言サマリー

BattleRun は、ランニング/ウォーキング記録を公開バトルまたは友達チャレンジへ加算し、陣営または個人で競う Expo / React Native アプリです。

現状は「ユーザーがバトルに参加し、ランを記録し、集計・ランキング・結果・称号を見る」体験の骨格が実装済みです。さらに、前回レポート時点よりも Cloud Functions / Firestore ルール側の本番化が進み、距離集計、RevenueCat Webhook、バトル自動終了、通知作成の一部がサーバー側へ移されています。

一方で、UI/実装の完成度にはまだ差があります。特に「個人戦」「複数バトル同時加算」「結果画面の称号ロジック」「テーマ選択」「統計の正確性」「巨大画面コンポーネント」は改善相談の主題にしやすいです。

型チェックは通っています。

```bash
npx tsc --noEmit
# exit code 0
```

## 2. 技術スタック

- Expo SDK 54 / React Native 0.81 / React 19
- Expo Router のファイルベースルーティング
- Firebase Auth / Firestore / Storage
- Firebase Cloud Functions v2
- Zustand
- Expo Location / Task Manager / Sensors / Notifications / Speech
- RevenueCat (`react-native-purchases`)
- `react-native-maps`

主な入口:

- `app/_layout.tsx`: 認証監視、オンボーディング振り分け、RevenueCat 初期化、Push Token 登録、終了済みバトル結果への誘導
- `app/(tabs)/_layout.tsx`: 4タブ、記録中の位置情報・歩数フック起動
- `stores/*`: Auth / Battle / Record のクライアント状態
- `functions/src/*`: 集計、課金Webhook、通知、バトルステータス自動遷移、タイトル検証

## 3. 現在の主要機能

### 3.1 認証・オンボーディング

実装済み:

- 初回オンボーディング
- メール/パスワードログイン
- 新規登録
- パスワードリセット
- Firebase Auth セッション監視
- Firestore `users/{uid}` の読み込み
- Google / Apple 等で Firestore ユーザーが未作成の場合の自動作成ロジック

注意:

- README には Google / Apple サインイン説明があるが、ログイン画面上のボタンや実処理は確認できない。
- `authStore` は現在 `titles` と `battleIds` を読み込んでいる。以前の「称号が読まれない」問題は改善済み。

### 3.2 タブ構成

タブは4つ。

- バトル: `app/(tabs)/battle.tsx`
- ラン: `app/(tabs)/record.tsx`
- 記録: `app/(tabs)/stats.tsx`
- プロフィール: `app/(tabs)/profile.tsx`

中央の「ラン」タブはオレンジの丸ボタンで強調されており、アプリの主行動が明確です。

### 3.3 バトル / チャレンジ

実装済み:

- 公開バトル一覧
- 友達チャレンジ一覧
- 参加中バトルのハイライト
- チーム戦の区分選択
- 個人戦への参加
- 招待コード検索・参加
- Pro 限定のプライベートチャレンジ作成
- 招待コードコピー
- 週次距離・回数表示
- `category_stats` のリアルタイム購読

注意:

- `app/(tabs)/battle.tsx` は 1239 行あり、一覧、参加、作成フォーム、モーダル、集計表示が1ファイルに密集している。
- 個人戦は参加できるが、主要表示は `category_stats` 前提の箇所が多い。
- 作成フォームの日付は `YYYY-MM-DD` 手入力。
- `createBattle` は `status: 'active'` で作成するため、開始前ステータス `upcoming` を使う設計とはズレがある。

### 3.4 ラン記録

実装済み:

- GPS モード
- 歩数モード
- START / STOP
- 記録中 HUD
- ルート地図
- 時間、距離、ペース、歩数
- 1km ごとの音声ガイド
- 記録完了サマリー
- 参加中の全アクティブバトルへ加算するため `activities.battleIds` を保存

重要な現状:

- クライアントは `activities` を作成するだけ。
- 距離の `participants.totalDistanceKm` と `category_stats` への反映は `functions/src/aggregateActivity.ts` が担当。
- Cloud Functions 反映前のサマリーでは、ローカルに加算後順位をシミュレーションして見せている。

注意:

- バックグラウンド GPS は EAS カスタムビルド前提。
- `useLocation` はバックグラウンド権限が許可された場合 `startLocationUpdatesAsync` を呼ぶが、Expo Go などで失敗した時の foreground watch フォールバックが弱い。
- 距離の異常値除去はクライアントの保存時にもあるが、サーバー側は `MAX_ACTIVITY_DISTANCE_KM` の上限チェック中心。

### 3.5 記録・活動履歴

`app/(tabs)/stats.tsx`:

- 最近50件を取得
- 累計距離、過去7日距離、最長ラン、簡易称号を表示
- 表示する履歴は20件

注意:

- 「累計」は最大50件分の合計で、全期間累計ではない。
- 「今週」表示は取得済み20件に対する過去7日計算なので、記録が多いユーザーでは不正確になりうる。

`app/activity/[id].tsx`:

- 活動詳細
- ルート地図
- バトル貢献
- リアクション追加/解除

注意:

- 活動詳細は `battleId` を主に見ており、`battleIds` 複数加算への表示追従が限定的。
- Firestore ルール上、認証済みユーザーは全活動を読める。

### 3.6 バトル詳細・結果

`app/battle/[id].tsx`:

- 残り時間
- 2陣営 VS 表示
- 複数陣営ランキング
- 最近の活動
- テーマ変更導線
- 結果画面導線

注意:

- `category_stats` 前提なので、個人戦だと詳細画面のランキング表示が空になりやすい。
- 「陣営内 貢献ランキング」という見出しだが、実際は陣営ランキングを表示している。
- 最近の活動は `where('battleId', '==', id)` で、`battleIds` 配列に未対応。

`app/battle/result/[id].tsx`:

- 最終ランキング
- 個人成績
- 個人貢献ランキング上位5名
- MVP / 準MVP 表示
- 称号を `users/{uid}.titles` へ `arrayUnion`
- 共有プレビューと Share API

注意:

- 称号付与はまだクライアントの結果画面表示時。コード内にもサーバー移管 TODO がある。
- MVP / 準MVP の判定は `category_stats` 上の自分の陣営順位ベースだが、文言は「バトル内個人貢献距離1位/2位」。仕様と実装がズレている。
- 個人戦では `category_stats` が空になりやすく、結果ヒーロー・称号・最終ランキングが十分に成立しない。個人貢献ランキング自体は `participants` から表示される。

### 3.7 バッジ・称号

実装済み:

- 初陣ランナー
- 朝活兵
- 3日連続出撃
- 7日連続出撃
- 月間10km
- 月間30km
- 歩兵隊長
- 百里の旅人
- `users/{uid}/badges/{badgeId}` への獲得保存
- `user.titles` 由来の称号表示

注意:

- バッジ判定はクライアント実行なので改ざん耐性は弱い。
- 連続日数判定は簡易。
- 称号は結果画面を開いたユーザーだけ付与される設計で、全員一括付与ではない。

### 3.8 通知

実装済み:

- Push Token 保存
- ローカル通知: 終了24時間前 / 1時間前
- Firestore 通知一覧
- 既読化
- Cloud Functions によるリアクション通知
- Cloud Functions による称号獲得通知
- バトル自動終了時の終了通知
- NGワードタイトル無効化通知

改善済み:

- `users/{uid}/notifications` はクライアント create 禁止になっている。通知作成は Admin SDK 側に寄っている。

注意:

- 実際の Expo push 送信は未確認。現状は Firestore 通知中心に見える。
- 順位変動通知、メンバーが走った時の通知はまだ見当たらない。

### 3.9 Pro / 課金

実装済み:

- RevenueCat の遅延ロード
- Expo Go 無効化
- Pro 購入・復元
- RevenueCat entitlement による即時 Pro 判定
- RevenueCat Webhook による `users/{uid}.plan` 更新
- プライベートチャレンジ作成の Pro 制限
- Pro 限定テーマ
- 開発時のみ plan トグル

改善済み:

- クライアント購入処理は Firestore `plan` を直接更新しない。Webhook 反映まで entitlement を見る設計になっている。

注意:

- `profile.tsx` の開発用 plan トグルは Firestore ルール上、本番ルール下では拒否される可能性がある。ただし `__DEV__` 限定。
- Pro の提供価値は現在「プライベートチャレンジ作成」「テーマ」「透かしなし共有」中心で、課金理由としてやや薄い可能性がある。

### 3.10 管理機能

実装済み:

- `role: 'admin'` 判定
- 管理画面
- 公開バトル作成
- シーズン作成・選択
- バトル status の手動切替

注意:

- バトルステータスは Cloud Scheduler でも自動遷移する。
- 手動 status 切替と自動遷移・通知・結果閲覧の関係は、運用仕様として明文化した方がよい。

## 4. 表示・デザインの現状

全体の印象:

- 明るい背景 `#F4F2EC`、白カード、ティール、オレンジが基調。
- 記録中・結果・一部カードはダーク HUD 風。
- 小さな等幅ラベル `BATTLERUN / ...`、`RUN COMPLETE`、`NEXT MOVE` などでスポーツ大会・作戦画面の雰囲気を出している。
- 絵文字、称号、メダル表現が多い。

良い点:

- 中央のランボタンが明確。
- 記録画面は「開始する」行動が分かりやすい。
- 2陣営バトルの VS 表示と「あと何kmで逆転」はアプリの核に合っている。
- 結果画面は達成感を作れている。

改善候補:

- `design_tokens.ts` と各画面ローカル `BR` パレットが混在している。
- カード角丸が画面ごとに大きく、全体が少しアプリ内デザインシステムとして散らばっている。
- 「陣営ランキング」「個人貢献ランキング」「称号」「バッジ」の概念が近く、初見ユーザーには違いが分かりにくい。
- 個人戦とチーム戦で表示パターンを分けきれていない。
- 通知一覧、テーマ、バッジ、管理機能などの導線がプロフィールや詳細画面に点在している。

## 5. データモデル・集計

主な Firestore 構造:

```text
users/{uid}
users/{uid}/notifications/{notificationId}
users/{uid}/badges/{badgeId}

seasons/{seasonId}

battles/{battleId}
battles/{battleId}/participants/{uid}
battles/{battleId}/category_stats/{categoryId}

activities/{activityId}
activities/{activityId}/reactions/{uid}
```

重要な設計:

- ユーザー参加バトルは `users/{uid}.battleIds` で管理。
- 活動には `battleId` と `battleIds` の両方が保存される。
- `battleId` は後方互換・代表バトル。
- `battleIds` が本来の複数加算対象。
- 実集計は `aggregateActivity` が `activities` 作成をトリガーに実行。

Cloud Functions:

- `aggregateActivity`: 活動作成後、参加中バトルの `participants` と `category_stats` を更新。
- `revenuecatWebhook`: RevenueCat Webhook で `plan` 更新。
- `battleStatusScheduler`: 60分ごとに `upcoming -> active`、`active -> finished`。終了通知も作成。
- `onReactionCreated`: リアクション通知。
- `onUserTitlesUpdated`: 称号獲得通知。
- `validateBattleTitleOnCreate`: NGタイトルの private battle を終了し通知。

## 6. Firestore ルールの現状

良い点:

- ユーザー本人による `plan` 更新は禁止。
- 通知 create はクライアント禁止。
- `activities` update/delete 禁止。
- `activities` 作成時に `aggregated` 混入禁止。
- `participants.totalDistanceKm` と `activityCount` は本人 update でも変更不可。
- `category_stats.totalDistanceKm` と `avgDistanceKm` はクライアント update 不可。
- ルールテストがある。

残る懸念:

- `category_stats.participantCount` は認証済みユーザーなら更新可能。カテゴリ変更のために開いているが、人数改ざん余地がある。
- `participants.categoryId` は本人が更新できるため、バトル期間中の陣営変更をどこまで許すか仕様確認が必要。
- `activities` の距離・ルート・歩数は本人作成なら受け付けるため、活動データ自体の改ざん対策は限定的。
- `users/{uid}` は認証済みなら read 可。プロフィール情報の公開範囲を検討する余地あり。

## 7. 優先度付き改善候補

### 高優先度

1. 個人戦の表示と集計を完成させる
   - 詳細画面・結果画面・サマリーが `category_stats` 前提。
   - 個人戦では `participants` ランキングを主表示にする必要がある。

2. `battleId` 参照を `battleIds` 対応に広げる
   - 最近の活動、活動詳細、結果画面の記録回数などが代表 `battleId` に寄っている。
   - 複数バトル同時加算時に表示漏れが起きる。

3. 称号仕様を決め直す
   - 現在は「陣営順位」で称号付与しているが、文言は「個人貢献距離」。
   - 結果画面を開いた本人だけに付与される。
   - Cloud Functions で終了時に一括付与する方が自然。

4. `app/(tabs)/battle.tsx` を分割する
   - 1239 行で変更リスクが高い。
   - 画面、リスト、カード、作成フォーム、参加モーダル、集計購読を分けたい。

5. バックグラウンド GPS 失敗時のフォールバックを強化する
   - `startLocationUpdatesAsync` 失敗時に foreground watch へ落とす。
   - ユーザーへ「バックグラウンドでは記録されない可能性」を明示する。

### 中優先度

6. 統計を正確にする
   - `stats.tsx` の累計は最大50件分。
   - ユーザー別集計ドキュメントや Cloud Functions 集計を検討。

7. Pro 価値を再設計する
   - 現在はプライベート作成、テーマ、透かしなし共有が中心。
   - 友達チャレンジの上限、詳細分析、カスタムテーマ、チーム管理などを検討。

8. テーマ画面を現在値から初期化する
   - 現在は `selected` の初期値が常に `sports`。
   - 保存済みテーマを読み込む必要がある。

9. 日付入力 UI を改善する
   - `YYYY-MM-DD` 手入力はミスが出やすい。
   - DatePicker またはプリセット期間がよい。

10. `createBattle` の status 設計を整理する
   - `startAt` が未来でも `active` 作成。
   - `upcoming` と Scheduler を使う設計に寄せるなら作成時 status を調整する。

### 低優先度

11. UIトークンを統合する
   - 画面ローカル `BR` を `design_tokens.ts` / テーマトークンへ整理。

12. 通知導線を整理する
   - `app/notifications.tsx` はあるが、日常導線が弱い。

13. アカウント削除の関連データ整理
   - 現在は users / avatar / Auth が中心。activities / participants / reactions などは残る。

14. Google / Apple サインインのREADME差分を解消する
   - 実装するか、READMEから消す。

## 8. 別AIへ投げるとよい質問

機能設計:

- 個人戦とチーム戦を同じ Battle モデルで扱い続けるべきか、表示・集計モデルを分けるべきか。
- 複数バトル同時加算はアプリの強みとして前面に出すべきか、混乱を避けて1回のランは1バトルに絞るべきか。
- 称号は「陣営順位」「個人貢献順位」「参加賞」「期間達成」のどれを軸にするべきか。

UI/UX:

- 初見ユーザーに「何に参加して、走ると何が変わるか」を最短で理解させる導線はどうするか。
- バトル一覧で、公開/友達/参加中/終了済みをどう整理するか。
- 結果画面で共有したくなる見せ方をどう作るか。

実装:

- `battle.tsx` をどの粒度で分割するか。
- `activities.battleIds` 対応に必要なクエリ・インデックス・画面改修をどう進めるか。
- 称号付与を Cloud Functions に移す場合の冪等性とテストをどう設計するか。
- 位置情報の信頼性とバッテリー消費のバランスをどう取るか。

収益化:

- Pro の価値を「チャレンジ作成」だけでなく、継続利用したくなる機能に広げるなら何がよいか。
- Free ユーザーにも体験を損なわず、Pro に自然に進みたくなる制限はどこか。

## 9. 読む優先度が高いファイル

1. `app/(tabs)/battle.tsx`
2. `app/(tabs)/record.tsx`
3. `app/battle/[id].tsx`
4. `app/battle/result/[id].tsx`
5. `app/record/summary.tsx`
6. `stores/battleStore.ts`
7. `stores/recordStore.ts`
8. `stores/authStore.ts`
9. `functions/src/aggregateActivity.ts`
10. `functions/src/battleScheduler.ts`
11. `functions/src/revenuecatWebhook.ts`
12. `functions/src/notifications.ts`
13. `firestore.rules`
14. `app/(tabs)/stats.tsx`
15. `app/(tabs)/profile.tsx`
16. `app/battle/theme.tsx`
17. `hooks/useLocation.ts`
18. `lib/locationTask.ts`

## 10. 検証状況

実行済み:

```bash
npx tsc --noEmit
```

結果:

- TypeScript 型チェック成功。

未実行:

- Firestore ルールテスト `npm run test:rules`
- Expo 実機/シミュレータでの画面確認
- EAS カスタムビルドでのバックグラウンド GPS / RevenueCat 確認
- Cloud Functions エミュレータでの集計・通知 E2E

## 11. 改善着手のおすすめ順

1. 個人戦表示を成立させる。
2. `battleId` 依存表示を `battleIds` 対応にする。
3. 称号付与を仕様確定し、サーバー側へ移す。
4. `battle.tsx` を分割して、以後の改善速度を上げる。
5. 統計とサマリーの正確性を Cloud Functions 集計へ寄せる。
6. UIトークンと導線を整理する。

