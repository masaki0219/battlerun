# BattleRun 現行設計・機能レポート

作成日: 2026-06-10  
対象: `/Users/takahashimasaki/Desktop/BattleRun/battlerun`  
確認方法: ソースコード読解、`npx tsc --noEmit` 実行

## 1. 概要

BattleRun は、ランニング/ウォーキングの距離を記録し、公開バトルまたは友達チャレンジに距離を加算して競う React Native / Expo アプリです。

現在の中心コンセプトは「チーム」ではなく `Battle` です。旧来の `team` 画面/ストアは削除され、`battles/{battleId}`、`participants/{uid}`、`category_stats/{categoryId}` を軸に、公開チャレンジ、招待コード付きプライベートチャレンジ、個人戦/陣営戦を扱う構成になっています。

型チェックは現時点で成功しています。

```bash
npx tsc --noEmit
# exit code 0
```

ただし、実装には「画面上は存在するが完成度・整合性に注意が必要な機能」が複数あります。特に個人戦表示、通知、Pro 課金、バックグラウンド GPS、Firestore セキュリティルールは再設計/修正候補です。

## 2. 技術スタック

- Expo SDK 54 / React Native 0.81 / React 19
- Expo Router によるファイルベースルーティング
- Firebase Auth / Firestore / Storage
- Zustand によるクライアント状態管理
- Expo Location / Task Manager / Sensors / Notifications / Speech
- RevenueCat (`react-native-purchases`) による Pro 課金
- `react-native-maps` による走行ルート表示

主な入口:

- `package.json`: `main` は `expo-router/entry`
- `app/_layout.tsx`: 認証、オンボーディング、RevenueCat、Push Token 登録、終了済みバトル結果への自動遷移
- `app/(tabs)/_layout.tsx`: 4タブ構成と記録中の位置情報/歩数フック起動

## 3. ルーティング/画面構成

### 3.1 認証・導線

- 初回起動時は `app/onboarding.tsx` を表示
- オンボーディング完了後、未ログインなら `/auth/login`
- ログイン済みなら `/(tabs)` へ遷移
- `app/(tabs)/index.tsx` は `/(tabs)/battle` にリダイレクト

認証画面:

- `app/auth/login.tsx`
  - メール/パスワードログイン
  - パスワードリセットメール送信
  - 新規登録画面への導線
- `app/auth/signup.tsx`
  - ニックネーム、メール、パスワードで登録

注意:

- README には Google / Apple サインインの記載がありますが、現在の画面コードには Google / Apple サインイン UI や処理は見当たりません。

### 3.2 タブ

`app/(tabs)/_layout.tsx` で以下の4タブを定義しています。

- バトル: `app/(tabs)/battle.tsx`
- ラン: `app/(tabs)/record.tsx`
- 記録: `app/(tabs)/stats.tsx`
- プロフィール: `app/(tabs)/profile.tsx`

中央の「ラン」タブだけアクセント色の丸ボタンとして強調されています。

### 3.3 サブ画面

- `app/battle/[id].tsx`: バトル詳細、ランキング、残り時間、最近の活動、テーマ変更/結果画面への導線
- `app/battle/result/[id].tsx`: バトル結果、最終ランキング、個人成績、称号付与、共有
- `app/battle/theme.tsx`: バトルテーマ選択。Pro 限定テーマあり
- `app/record/summary.tsx`: 記録完了後のサマリー、バトルへの影響表示
- `app/activity/[id].tsx`: 活動詳細、地図、バトル貢献、リアクション
- `app/badges.tsx`: バッジ/称号コレクション
- `app/notifications.tsx`: Firestore 通知一覧、既読処理
- `app/admin/index.tsx`: 管理画面トップ。バトル一覧、ステータス切替
- `app/admin/battle/new.tsx`: 管理者向け公開バトル/シーズン作成

## 4. データモデル

主要型は `types/index.ts` に集約されています。

### 4.1 User

```ts
interface User {
  id: string;
  authId: string;
  name: string;
  avatarUrl?: string;
  avatarEmoji?: string;
  plan: 'free' | 'pro';
  role?: 'admin';
  createdAt: string;
  titles?: UserTitle[];
  battleIds: string[];
}
```

役割:

- `plan` で Free / Pro 制御
- `role: 'admin'` で管理画面・公開バトル作成を制御
- `battleIds` で参加中バトルを O(k) 取得
- `titles` は称号配列

### 4.2 Battle

```ts
interface Battle {
  id: string;
  type: 'public' | 'private';
  mode: 'team' | 'individual';
  status: 'upcoming' | 'active' | 'finished';
  title: string;
  description: string;
  categories: Category[];
  rankingType: 'average' | 'total';
  inviteCode: string | null;
  createdBy: string | null;
  seasonId: string | null;
  startAt: string;
  endAt: string;
}
```

設計意図:

- `type: public`: 管理者が作る公開チャレンジ
- `type: private`: Pro ユーザーが作る友達チャレンジ
- `mode: team`: 区分/陣営を選んで参加
- `mode: individual`: `categoryId` なしで参加。ただし表示側には未整備な箇所あり
- `rankingType: average`: 人数差を均す平均距離
- `rankingType: total`: 総距離

### 4.3 Firestore 想定構造

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

活動記録は `battleId` と `battleIds` の両方を保存します。

- `battleId`: 後方互換用。先頭のアクティブバトル
- `battleIds`: 距離を加算した全バトル

ただし、一部画面はまだ `battleId` しか見ていないため、複数バトル同時加算時の履歴表示にズレが出る可能性があります。

## 5. 状態管理

### 5.1 authStore

`stores/authStore.ts`

- Firebase Auth のログイン/登録/ログアウト
- `onAuthStateChanged` で Firestore の `users/{uid}` を読み込み
- Google/Apple 等で Firestore ユーザーが存在しない場合の自動作成処理はある
- `battleIds` は未設定なら `[]` として扱う

注意:

- `createdAt` を Firestore へ `new Date()` で保存しており、型上は Timestamp として読む想定です。
- `titles` は `User` 型にあるものの、authStore で読み込んでいません。そのためプロフィールやバッジ画面の `user.titles` が最新称号を表示できない可能性があります。

### 5.2 battleStore

`stores/battleStore.ts`

機能:

- 公開バトル取得
- 自分の参加情報取得
- 自分のプライベートバトル取得
- シーズン取得
- バトル参加
- バトル作成
- 招待コード検索
- アクティブ参加バトルID算出

特徴:

- 参加時に `participants/{uid}` を作成/更新
- 参加時に `users/{uid}.battleIds` を `arrayUnion` 更新
- チーム戦では `category_stats/{categoryId}.participantCount` を更新
- プライベート作成は Pro のみ
- Free 作成者のプライベートバトルは参加上限10名というチェックがあるが、そもそも Free は作成不可なので現在の設計では実質的に到達しにくい条件です。

### 5.3 recordStore

`stores/recordStore.ts`

機能:

- 記録開始/停止/リセット
- GPS ルートから距離再計算
- 歩数モード距離の保持
- GPS 異常点を最大速度 `MAX_SPEED_KMH` で除外
- Firestore へのアクティビティ保存
- 参加中の全アクティブバトルに距離加算
- チーム戦では `category_stats` を再集計

注意:

- `activities` の作成と各バトル加算は一体のトランザクションではありません。途中失敗時に活動だけ保存される、または一部バトルだけ加算される可能性があります。
- 個人戦では `categoryId` が null のため `category_stats` 更新がありません。個人戦ランキング表示の別ロジックが必要です。

## 6. 主要機能

### 6.1 バトル/チャレンジ

`app/(tabs)/battle.tsx`

実装済み:

- 公開バトル一覧
- 友達チャレンジ一覧
- 参加中バトルのハイライトカード
- 区分選択モーダル
- 個人戦への参加
- 招待コード検索/参加
- プライベートチャレンジ作成
- 招待コードコピー
- 週次距離/回数の表示
- `category_stats` のリアルタイム購読

設計:

- 参加中バトルがある場合、メインカードに自分の距離、順位、逆転までの距離を表示
- ラン開始ボタンから `/(tabs)/record` に移動
- 公開/友達チャレンジをタブ切替

注意:

- `battle.tsx` は 1200 行超で、UI、データ取得、作成フォーム、モーダル、集計表示が1ファイルに密集しています。再設計時は分割候補です。
- 個人戦は参加処理こそありますが、ランキング表示は `category_stats` 前提の箇所が多く、見せ方が未完成です。
- 作成フォームの日付入力は `YYYY-MM-DD` のテキスト入力で、DatePicker は未導入です。

### 6.2 ラン記録

`app/(tabs)/record.tsx`

実装済み:

- GPS モード/歩数モード選択
- 歩数センサー対応チェック
- START / STOP
- 記録中 HUD
- GPS ルート地図表示
- ペース/時間/距離表示
- 音声ガイド
- 参加中バトルへの加算プレビュー
- 保存後にサマリー画面へ遷移

連携:

- `app/(tabs)/_layout.tsx` が記録中に `useLocation` と `useStepCounter` を起動
- GPS は `hooks/useLocation.ts`
- バックグラウンドタスクは `lib/locationTask.ts`
- 歩数は `hooks/useStepCounter.ts`

注意:

- バックグラウンド GPS は Expo Go では動作しません。EAS カスタムビルド前提です。
- `useLocation` はバックグラウンド権限が許可された場合 `startLocationUpdatesAsync` を試します。Expo Go では失敗する可能性がありますが、その場合にフォアグラウンド watch へ明示的にフォールバックする実装には見えません。
- 記録画面内に保存後ルート表示用モーダル状態がありますが、実際は保存後すぐ `record/summary` に遷移するため、現在は使われにくい導線です。

### 6.3 記録/活動履歴

`app/(tabs)/stats.tsx`

実装済み:

- 最近50件の活動を取得
- 累計距離、今週距離、最長ラン、簡易称号表示
- 活動履歴20件
- 活動詳細への遷移

注意:

- 「累計」は取得した50件分の合計です。全期間累計ではありません。
- 「今週」は `activities` state の20件または50件由来のローカル計算に依存しており、大量記録ユーザーでは正確性が落ちます。

`app/activity/[id].tsx`

実装済み:

- 活動詳細
- ルート地図表示
- バトル貢献表示
- リアクション追加/解除
- リアクション通知

注意:

- 活動の閲覧権限は Firestore ルール上、認証済みなら全活動を読めます。
- `battleIds` 複数加算には表示が十分追従していません。

### 6.4 バトル詳細/結果

`app/battle/[id].tsx`

実装済み:

- バトル詳細
- 残り時間カウントダウン
- 2陣営専用 VS 表示
- 複数陣営ランキング
- 最近の活動
- テーマ変更導線
- 結果画面導線

注意:

- 「陣営内 貢献ランキング」と表示しつつ、実際は `category_stats` を並べているため、ユーザー個人ランキングではなく陣営ランキングです。
- `activities` 取得は `battleId == id` のみなので、複数バトル加算時の `battleIds` 配列には未対応です。
- 個人戦のランキングモデルとは合っていません。

`app/battle/result/[id].tsx`

実装済み:

- 最終ランキング
- 個人成績
- 個人貢献ランキング上位5名
- MVP/準MVP 表示
- 称号を `users/{uid}.titles` に自動書き込み
- Firestore 通知を書き込み
- Share API で結果共有

注意:

- 称号付与の判定は「自分の陣営順位」を見ているように見えますが、画面文言には「バトル内個人貢献距離1位/2位」とあります。仕様と実装の不一致候補です。
- `user.titles` が authStore で読み込まれていないため、称号を付与してもプロフィール側に即時反映されない可能性があります。

### 6.5 バッジ/称号

`app/badges.tsx`

実装済みバッジ:

- 初陣ランナー
- 朝活兵
- 3日連続出撃
- 7日連続出撃
- 月間10km
- 月間30km
- 歩兵隊長
- 百里の旅人

機能:

- 活動履歴から進捗計算
- 達成済みバッジを `users/{uid}/badges/{badgeId}` に保存
- 未獲得/次に取れそうなバッジ表示
- `user.titles` 由来の称号一覧

注意:

- バッジ判定はクライアント実行です。改ざん耐性は高くありません。
- 連続日数計算は簡易的です。
- 称号一覧は authStore が `titles` を読んでいない問題の影響を受けます。

### 6.6 通知

`lib/notifications.ts` と `app/notifications.tsx`

実装済み:

- Expo Push Token を `users/{uid}.expoPushToken` に保存
- ローカル通知: バトル終了24時間前
- ローカル通知: バトル終了1時間前
- Firestore 通知作成ユーティリティ
- 通知一覧表示
- 通知を開いたら一括既読
- リアクション/称号獲得通知

未完成/注意:

- コメント上、メンバーが走った時・順位変動通知は Cloud Functions 移行後予定とされています。
- `notifyBattleEnded` はクライアントから全参加者へ通知を書ける設計ですが、実際にどこで呼ぶかは明確ではありません。
- Firestore ルールで `users/{userId}/notifications` は認証済みなら誰でも create 可能です。スパム/なりすまし通知のリスクがあります。

### 6.7 Pro/課金

`lib/revenuecat.ts` と `app/(tabs)/profile.tsx`

実装済み:

- RevenueCat 遅延ロード
- Expo Go では無効
- Pro 購入/復元
- Pro 成功時に `users/{uid}.plan = 'pro'`
- プライベートチャレンジ作成を Pro 限定
- Pro 限定テーマ
- 開発時のみ plan トグル

注意:

- RevenueCat entitlement と Firestore `plan` の同期はクライアント依存です。
- Firestore ルールでは通常ユーザーが自分の `plan` を update できないよう制限していますが、RevenueCat のクライアント処理も `updateDoc(users/{uid}, { plan: 'pro' })` を呼ぶため、ルール適用環境では失敗する可能性があります。
- 本番では Cloud Functions / trusted backend で entitlement を検証して `plan` を更新する設計が望ましいです。

### 6.8 プロフィール

`app/(tabs)/profile.tsx`

実装済み:

- 名前/アバター表示
- 写真アップロード
- 絵文字アイコン選択
- Pro 購入/復元
- バッジ画面への導線
- 称号一覧
- 管理者リンク
- ログアウト
- アカウント削除

注意:

- アカウント削除は Firestore `users/{uid}` と Storage アバター、Firebase Auth ユーザーを削除しますが、activities、battle participants、reactions など関連データは残ります。
- `Alert.prompt` は iOS 専用挙動のため、Android でのアカウント削除フローは要確認です。

### 6.9 管理機能

`app/admin/index.tsx`, `app/admin/battle/new.tsx`

実装済み:

- `user.role === 'admin'` チェック
- バトル一覧取得
- バトル status の active/finished 切替
- 公開バトル作成
- シーズン作成/既存選択/なし
- チーム戦/個人戦
- 平均/合計ランキング

注意:

- 管理者チェックはクライアントでも行い、Firestore ルールでも public battle / season write を admin 限定にしています。
- バトル終了時の称号付与・通知は管理画面で status を切り替えた時に一括処理されるわけではありません。結果画面を各ユーザーが開いた時に称号が付く設計です。

## 7. UI/デザインの現状

### 7.1 デザイントークン

`design_tokens.ts` に色、タイポグラフィ、スペーシング、角丸、シャドウ、タブバー、コンポーネントサイズがあります。

基調:

- primary: ティール/グリーン `#00C49A` または画面個別の `#00D9A3`
- accent: オレンジ/レッド `#FF6B35` または `#FF5C2B`
- 背景: 明るいベージュ寄り `#F4F2EC` と白
- 記録中/結果系: ダークネイビー `#0A0E1A`

### 7.2 実装上のデザイン傾向

- 画面ごとに `BR` というローカルパレットを定義している箇所が多い
- `design_tokens.ts` と画面ローカル色が混在
- 軍用/スポーツ HUD 風の小さな等幅ラベル `Tac` / `MonoLabel` が多用されている
- 記録中画面と結果画面はダーク HUD
- バトル一覧・統計・プロフィールは明るいカード中心
- 絵文字を UI 表現に多用

再設計時の観点:

- 色とタイポグラフィを `design_tokens.ts` に再統合する
- 画面ごとの `BR` 重複を共通化する
- 競争感を残す画面と日常的な記録画面で、情報密度とトーンを整理する
- `battle.tsx` の巨大コンポーネントを UI 部品に分割する

## 8. Firestore ルール/インデックス

### 8.1 ルール

`firestore.rules`

現在の主な制御:

- `users/{uid}` は本人作成/更新。ただし `plan` 変更は禁止
- `users/{uid}` は認証済みなら read 可
- `seasons` write は admin のみ
- `battles` public 作成は admin、private 作成は Pro
- `battles` update は private 作成者または admin
- `participants/{uid}` は本人のみ write
- `category_stats` は認証済みなら誰でも write
- `activities` は本人だけ create、認証済みなら read
- `reactions/{uid}` は本人のみ write

重要リスク:

- `category_stats` が認証済みなら誰でも書けるため、ランキング改ざんが可能です。
- `participants/{uid}` が本人なら write できるため、自分の `totalDistanceKm` 改ざんも可能です。
- `activities` の update/delete ルールはありません。修正/削除フローを作る場合は追加が必要です。
- `notifications` create が認証済み全員に開いています。
- `users/{uid}` read が認証済み全員に開いているため、プロフィール情報の公開範囲を検討すべきです。

### 8.2 インデックス

`firestore.indexes.json`

定義済み:

- `battles`: `type ASC`, `status ASC`
- `activities`: `userId ASC`, `startedAt DESC`
- `activities`: `battleId ASC`, `startedAt DESC`

追加検討:

- `activities` の `battleIds` array-contains + startedAt
- 管理画面の `battles orderBy startAt desc` が必要な場合の単体/複合確認
- 週次集計など期間クエリ用の `userId + startedAt ASC/DESC`

## 9. 既知の整合性問題・修正候補

### 高優先度

1. Pro 購入後の `plan` 更新が Firestore ルールで拒否される可能性
   - ルールは本人による `plan` update を禁止
   - クライアントの RevenueCat 成功処理は本人権限で `plan` を update
   - 本番設計では Cloud Functions など trusted backend が必要

2. ランキング改ざん耐性が低い
   - `category_stats` write が認証済み全員
   - `participants/{uid}` write が本人なら自由
   - `saveActivityToFirestore` のクライアント加算を信用する設計

3. 個人戦が UI/集計で未完成
   - `mode: individual` は参加できる
   - しかしランキング表示は `category_stats` 前提の箇所が多い
   - 個人戦用の `participants` ランキング取得/表示が必要

4. 複数バトル同時加算と活動表示の不一致
   - 保存時は `battleIds` に全対象を保存
   - 詳細/結果/活動表示の一部は `battleId` のみ参照
   - `array-contains` ベースのクエリに移行が必要

5. 称号が authStore に読み込まれていない
   - `User` 型とプロフィール/バッジ画面は `user.titles` を期待
   - `authStore` のユーザー構築で `titles` をセットしていない
   - 結果画面で付与した称号が表示されない/重複判定できない可能性

### 中優先度

6. バトル終了処理が自動化されていない
   - status を `finished` にする処理は管理者手動
   - 終了通知や称号付与は各クライアント依存
   - Cloud Functions / scheduled job が必要

7. `battle.tsx` が巨大で変更リスクが高い
   - 1200 行超
   - データ取得、フォーム、表示、モーダルが密結合
   - 再設計時は `components/battle/*` などへ分割推奨

8. 統計値が限定取得ベース
   - `stats.tsx` は最大50件取得
   - 累計や今週距離の精度がユーザー活動数に依存
   - 集計ドキュメントまたはサーバー集計を検討

9. バックグラウンド GPS のフォールバック
   - Expo Go で `startLocationUpdatesAsync` が失敗した場合に foreground watch へ落ちる保証が薄い
   - try/catch と明示的フォールバックが必要

10. アカウント削除が関連データを消さない
    - users と avatar/Auth は消す
    - activities、participants、reactions、notifications、badges などは残る

### 低優先度/UX改善

11. 日付入力が手入力
    - バトル作成・管理者作成とも `YYYY-MM-DD`
    - DatePicker 導入で入力ミスを減らせる

12. Google/Apple サインインの README と実装差分
    - README には説明あり
    - UI 実装は未確認

13. 通知一覧への入口が見つかりにくい
    - ルートはあるがタブやプロフィールに明確な導線が少ない

14. テーマの初期選択
    - `battle/theme.tsx` は現在のテーマを読み込まず、初期値が常に `sports`

15. ローカル色定義が多い
    - デザイン統一・アクセシビリティ調整のコストが高い

## 10. 別AIに渡すための改善方針メモ

### 10.1 まず直すと効果が高い箇所

- `authStore` に `titles` を読み込む
- 個人戦用の参加者ランキングを `participants` から表示する
- `activities.battleIds` を利用した表示/クエリに統一する
- `battle.tsx` を表示単位に分割する
- `battle/theme.tsx` で現在テーマを取得して初期選択する

### 10.2 本番化に必要な設計変更

- RevenueCat Webhook / Cloud Functions で Pro entitlement を検証し `users.plan` を更新
- 活動記録・参加者距離・category_stats 更新をサーバー側で検証/集計
- バトル終了の定期ジョブ化
- 終了通知、順位変動通知、称号付与をサーバー側へ移動
- Firestore ルールを「クライアントは生データ作成のみ、集計値はサーバーのみ」に寄せる

### 10.3 UI 再設計の方向性

現状の個性:

- 競争感、スポーツ HUD、軍用/大会風の雰囲気
- ティール + オレンジ + ダークネイビー
- 大きな距離数値、ランキングバー、称号/バッジ

再設計時に残すとよい核:

- 「走った距離がすぐ陣営に加算される」感覚
- 「あと何kmで逆転」の行動喚起
- ラン開始の明快さ
- 結果画面の達成感

改善余地:

- 初心者向けには「どのバトルに加算されるか」をもっと明確にする
- 個人戦/陣営戦/公開/友達チャレンジの概念を整理する
- バッジと称号の違いをわかりやすくする
- 通知、結果、テーマ、管理者機能の導線を整理する

## 11. 主要ファイル一覧

読む優先度が高い順:

1. `app/_layout.tsx`
2. `app/(tabs)/_layout.tsx`
3. `types/index.ts`
4. `stores/authStore.ts`
5. `stores/battleStore.ts`
6. `stores/recordStore.ts`
7. `app/(tabs)/battle.tsx`
8. `app/(tabs)/record.tsx`
9. `app/battle/[id].tsx`
10. `app/battle/result/[id].tsx`
11. `app/(tabs)/stats.tsx`
12. `app/activity/[id].tsx`
13. `app/(tabs)/profile.tsx`
14. `app/badges.tsx`
15. `lib/notifications.ts`
16. `hooks/useLocation.ts`
17. `lib/locationTask.ts`
18. `lib/revenuecat.ts`
19. `firestore.rules`
20. `firestore.indexes.json`

## 12. 現在の作業ツリー注意

このリポジトリは確認時点で Git の変更が多数あります。別AIが修正を始める前に、現在の差分を確認してください。

主な状態:

- `app/team/*`, `stores/teamStore.ts`, `hooks/useTeam.ts` は削除済み
- バトル/記録/プロフィール/ルール/RevenueCat など多数が変更済み
- 新規ファイルとして `app/battle/*`, `app/admin/*`, `app/activity/*`, `app/badges.tsx`, `app/notifications.tsx`, `app/onboarding.tsx` などが存在

未コミット差分を前提に作業する場合、既存変更を巻き戻さないこと。

