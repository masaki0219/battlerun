# BattleRun 現行機能レポート

作成日: 2026-05-26  
対象: `battlerun/` 現行コード  
目的: タブごとの役割、画面機能、ページ遷移を再設計するための現状整理

---

## 1. 全体構成

BattleRun は Expo Router の file-based routing で構成されている。

現在のメインタブは 5 つ。

| タブ | ルート | 現在の主な役割 |
|---|---|---|
| ホーム | `/(tabs)/index` | 今日の状態、参加中チャレンジ、最近の自分の記録 |
| チャレンジ | `/(tabs)/battle` | パブリック/プライベートチャレンジの探索、参加、作成 |
| ラン | `/(tabs)/record` | GPS/歩数による記録開始・停止 |
| 記録 | `/(tabs)/stats` | 自分の統計、ラン履歴 |
| プロフィール | `/(tabs)/profile` | アカウント、Pro、バッジ/称号、管理画面導線 |

タブ外の Stack 画面は以下。

| 画面 | ルート | 主な役割 |
|---|---|---|
| オンボーディング | `/onboarding` | 初回説明、ログイン/登録導線 |
| ログイン | `/auth/login` | メール/パスワードログイン、パスワードリセット |
| 新規登録 | `/auth/signup` | ニックネーム、メール、パスワード登録 |
| チャレンジ詳細 | `/battle/[id]` | 陣営ランキング、残り時間、最近の活動 |
| チャレンジ結果 | `/battle/result/[id]` | 結果、個人成績、称号、シェア |
| テーマ選択 | `/battle/theme?id=...` | Pro 向けバトルテーマ選択 |
| 記録サマリー | `/record/summary` | 保存直後の結果、チャレンジ反映、獲得バッジ表示 |
| 通知 | `/notifications` | 通知一覧、既読化、関連画面への遷移 |
| バッジ/称号 | `/badges` | バッジ一覧、次に取れそうなバッジ、称号一覧 |
| アクティビティ詳細 | `/activity/[id]` | 個別ラン記録、ルート地図、リアクション |
| 管理画面 | `/admin` | admin 用チャレンジ一覧、status 変更 |
| パブリックラン作成 | `/admin/battle/new` | admin 用 public battle / season 作成 |

---

## 2. 現行データ概念

### ユーザー

`users/{uid}` に以下を持つ。

- `name`
- `avatarUrl`
- `avatarEmoji`
- `plan: 'free' | 'pro'`
- `role?: 'admin'`
- `battleIds: string[]`
- `titles?: UserTitle[]`

### チャレンジ / バトル

`battles/{battleId}` が中心。

- `type: 'public' | 'private'`
- `mode: 'team' | 'individual'`
  - `team` は常設チームではなく、バトル内の「陣営/区分」を選ぶ形式
  - `individual` は個人戦
- `categories`
  - 例: 理系/文系、星座、きのこ/たけのこ
- `rankingType: 'average' | 'total'`
- `startAt`
- `endAt`
- `status`
- `createdBy`
- `inviteCode`
- `seasonId`

### バトル参加

ユーザー単位で参加する。

```txt
battles/{battleId}/participants/{userId}
  categoryId: string | null
  totalDistanceKm: number
  joinedAt: Timestamp
```

陣営ごとの集計。

```txt
battles/{battleId}/category_stats/{categoryId}
  totalDistanceKm
  avgDistanceKm
  participantCount
```

### アクティビティ

`activities/{activityId}` にラン記録を保存する。

- `userId`
- `displayName`
- `battleId`
- `distanceKm`
- `steps`
- `durationSeconds`
- `measurementType`
- `route`
- `startedAt`
- `endedAt`

現在は activity の `battleId` は代表 1 件のみ。複数チャレンジ参加時の履歴表現には課題が残る。

### 常設チーム

常設 `teams/{teamId}` 機能は撤去済み。  
現在の友達/グループ相当の体験は、期限付き `private battle` に寄せている。

---

## 3. タブ別機能

## 3.1 ホームタブ

ルート: `app/(tabs)/index.tsx`

### 現在の役割

日々の入口。ユーザーがアプリを開いた直後に「今日どう動けばいいか」を見る画面。

### 主な表示

- 日付
- 挨拶
- 通知アイコン
- 今日のラン
  - 今日の距離
  - 今日の歩数
  - 目標距離
  - 今日の貢献距離
  - 週間目標風リング
- 次の目標
  - 参加中チャレンジで、上位陣営を抜くために必要な距離
- 参加中のチャレンジ
  - public/private 両方を表示
  - 陣営タグ
  - private タグ
  - 残り日数
  - 陣営順位
  - 逆転までの距離
- 最近の記録
  - 自分の直近 5 件
  - 距離、経過時間、リアクション数

### 主な遷移

| 操作 | 遷移先 |
|---|---|
| 通知アイコン | `/notifications` |
| 次の目標カード | `/battle/[id]` |
| 「すべて見る」 | `/(tabs)/battle` |
| 「チャレンジを探す」 | `/(tabs)/battle` |
| 参加中チャレンジカード | `/battle/[id]` |
| 最近の記録 | `/activity/[id]` |

### 現在の意味

ホームは「統計」よりも「今日の行動」に寄せた画面。  
ただし「最近の記録」は記録タブと重複しやすい。

### 設計検討メモ

- ホームの「最近の記録」は自分の記録のみ。
- 詳細な履歴は記録タブに寄せ、ホームでは直近 1 件または削除でもよい。
- ホームの価値は「今日の目標」「参加中チャレンジの次アクション」「今走る理由」にある。

---

## 3.2 チャレンジタブ

ルート: `app/(tabs)/battle.tsx`

### 現在の役割

チャレンジを探す、参加する、作る、招待コードで入る画面。

### セグメント

- パブリックラン
- プライベートラン

### パブリックラン

表示内容:

- 開催中の public battle 一覧
- タイトル
- 残り日数
- season 名
- 参加中バッジ
- 陣営ごとの順位バー
- 参加人数
- 未参加の場合:
  - 陣営戦: 区分選択モーダルから参加
  - 個人戦: 参加ボタン

主な操作:

- カードタップで `/battle/[id]`
- 区分選択で `joinBattle()`
- 終了通知のスケジュール

### プライベートラン

表示内容:

- 参加中の private battle 一覧
- タイトル
- 招待コード
- コピー操作
- 自分の順位
- 陣営ごとの順位バー
- 個人戦バッジ

操作:

- 新しいチャレンジを作る
  - Pro ユーザーのみ
  - タイトル、説明、モード、区分、ランキング方式、開始日、終了日を入力
- 招待コードで参加
  - 6 桁コード検索
  - 見つかったチャレンジで区分選択/個人参加

### 主な遷移

| 操作 | 遷移先 |
|---|---|
| public/private カード | `/battle/[id]` |
| Pro で private 作成 | 同タブ内フォーム |
| 招待コード検索 | 同タブ内 join_select |
| 区分選択参加 | 同タブ内モーダル |

### 現在の意味

ホームが「参加中の要約」なら、チャレンジタブは「探索・参加・作成・管理」。  
この役割分担は成立している。

---

## 3.3 ランタブ

ルート: `app/(tabs)/record.tsx`

### 現在の役割

ラン/ウォーキング記録の開始と停止。

### 記録前

表示/操作:

- GPS モード / 歩数モード切り替え
- 歩数センサー利用可否チェック
- 音声ガイド ON/OFF
- START ボタン
- 「バトルへ加算」プレビュー

### 記録中

表示/操作:

- 記録中 HUD
- 距離
- GPS 時: ペース、時間、地図、ルート Polyline
- 歩数時: 歩数、時間、歩数モード表示
- 音声ガイド
  - 1km ごとに読み上げ
- 停止ボタン

### 停止/保存

処理:

1. 参加中 battle 情報を再取得
2. `stopRecording()`
3. `saveActivityToFirestore()`
4. activity 保存
5. active 期間内の battle participant/category_stats に距離加算
6. `/record/summary` へ遷移

### 主な遷移

| 操作 | 遷移先 |
|---|---|
| 停止して保存 | `/record/summary` |

### 設計検討メモ

- ランタブは明確に「記録開始専用」として残す価値が高い。
- ホームの「今日のラン」とは役割が違う。

---

## 3.4 記録タブ

ルート: `app/(tabs)/stats.tsx`

### 現在の役割

自分の過去データを見る画面。

### 主な表示

- 累計距離
- 累計ラン回数
- 今週距離
- 最長ラン
- 簡易称号
  - 累計距離に応じてビギナー/ランナー/上級ランナー/ベテラン
- ラン履歴
  - 最新 20 件
  - 距離
  - 時間
  - 歩数
  - 何分前/何日前
  - GPS/歩数アイコン

### 主な遷移

現状、この画面のラン履歴行は詳細画面へ遷移していない。  
ホームの「最近の記録」は `/activity/[id]` に遷移する。

### 現在の意味

記録タブは「過去の振り返り」画面。  
ただし現状はホームの「最近の記録」と一部重複している。

### 設計検討メモ

記録タブを残すなら、ホームより深い情報に寄せるとよい。

- 週/月推移
- ペース推移
- GPS/歩数の比率
- 自己ベスト
- 連続記録日数
- 月間目標達成率
- 全履歴
- activity detail への遷移

---

## 3.5 プロフィールタブ

ルート: `app/(tabs)/profile.tsx`

### 現在の役割

アカウント管理、Pro、称号/バッジへの入口。

### 主な表示/操作

- ユーザー情報
  - avatar
  - name
  - plan badge
- avatar 変更
  - 写真アップロード
  - 絵文字アイコン選択
- サブスクリプション
  - Free: Pro アップグレード
  - Pro: Pro 有効表示、管理リンク
  - 購入復元
- バッジ/称号リンク
- 獲得称号リスト
- admin ユーザーの場合:
  - 管理画面リンク
- ログアウト
- アカウント削除
- 開発時のみ:
  - plan の dev toggle

### 主な遷移

| 操作 | 遷移先 |
|---|---|
| バッジ・称号 | `/badges` |
| 管理画面 | `/admin` |
| ログアウト | `/auth/login` |

---

## 4. タブ外ページ

## 4.1 オンボーディング

ルート: `app/onboarding.tsx`

役割:

- 初回体験説明
- ログイン/新規登録への導線
- AsyncStorage の `ONBOARDING_KEY` で表示済み管理

Root layout は未ログインかつ未オンボーディングなら `/onboarding` に送る。

---

## 4.2 認証

### ログイン

ルート: `app/auth/login.tsx`

機能:

- メール/パスワードログイン
- パスワードリセットメール送信
- 新規登録画面への遷移

### 新規登録

ルート: `app/auth/signup.tsx`

機能:

- ニックネーム
- メール
- パスワード
- Firebase Auth 作成
- Firestore `users/{uid}` 作成

---

## 4.3 記録サマリー

ルート: `app/record/summary.tsx`

役割:

保存直後のラン結果表示。

表示:

- 距離
- 時間
- ペース
- 歩数
- バトル反映
  - 記録前/後の陣営順位
  - 陣営への加算距離
- 獲得バッジ
  - 現状は `陣営貢献者` の即時表示あり
- CTA
  - チャレンジ詳細を見る

遷移:

- close: `/(tabs)`
- primary CTA:
  - 反映対象あり: `/battle/[id]`
  - 反映対象なし: `/(tabs)/battle`

---

## 4.4 チャレンジ詳細

ルート: `app/battle/[id].tsx`

役割:

参加中/対象チャレンジの詳細、リアルタイムランキング、次アクション。

表示:

- 戻る
- RESULT ボタン
- THEME ボタン
- 招待コード
- タイトル
- 残り時間
- theme に応じた表示
- 2 陣営の場合:
  - VS 表示
  - ゲージ
  - NEXT MOVE
  - ラン CTA
- 3 陣営以上の場合:
  - 自分の陣営
  - 陣営ランキング
  - 上位/下位との差
- 陣営内貢献ランキング
- 最近の活動

遷移:

- RESULT: `/battle/result/[id]`
- THEME: `/battle/theme?id=...`
- ラン CTA: `/(tabs)/record`
- 戻る: previous

---

## 4.5 チャレンジ結果

ルート: `app/battle/result/[id].tsx`

役割:

終了済み/対象チャレンジの結果画面。

表示:

- バトル名
- 開催期間
- 自分の順位
- MVP/準MVP 表示
- 称号獲得
- 個人成績
  - 貢献距離
  - 記録回数
  - 陣営内順位
- 最終ランキング
- 個人貢献ランキング TOP 5
- 結果シェア
  - Free は watermark 表示
  - Pro 導線
- 次のアクション
  - 次のバトルを探す
  - バトルを作る

処理:

- バトル終了済み、かつ自分の陣営が上位なら `users/{uid}.titles` に称号追加
- `title_earned` 通知作成

---

## 4.6 テーマ選択

ルート: `app/battle/theme.tsx`

役割:

バトル表示テーマを選ぶ Pro 機能。

テーマ:

- スポーツ大会風: Free
- RPGギルド風: Pro
- 陣取り合戦風: Pro
- 近未来サイバー風: Pro
- ゆる散歩風: Pro
- 学校/サークル風: Pro
- 企業イベント風: Pro

操作:

- テーマ選択
- Pro 限定テーマ選択時は alert
- 保存で `battles/{id}.theme` 更新

遷移:

- 戻る
- Pro 詳細: `/(tabs)/profile`

---

## 4.7 アクティビティ詳細

ルート: `app/activity/[id].tsx`

役割:

個別ラン記録の詳細。

表示:

- 日付
- 距離
- 時間
- ペース
- 歩数
- 開始/終了時刻
- GPS ルート地図
- 関連バトル名
- リアクション

操作:

- リアクション追加/削除
  - 👏 ナイス
  - 🔥 すごい
  - 💪 助かった
  - ⚡ 速い
- 自分以外の記録にリアクションした場合は通知作成

遷移:

- 関連バトルがある場合 `/battle/[id]`
- 戻る

---

## 4.8 通知

ルート: `app/notifications.tsx`

役割:

通知一覧。

通知タイプ:

- `rank_change`
- `battle_end_soon`
- `title_earned`
- `battle_ended`
- `reaction`

表示:

- 通知アイコン
- タイトル
- 本文
- 経過時間
- 未読表示

処理:

- 最大 50 件取得
- 表示時に未読を一括既読化

遷移:

- `relatedBattleId` があれば `/battle/[id]`
- `relatedActivityId` があれば `/activity/[id]`

---

## 4.9 バッジ・称号

ルート: `app/badges.tsx`

役割:

ゲーム的な収集要素。

バッジ:

- 初陣ランナー
- 朝活兵
- 3日連続出撃
- 7日連続出撃
- 月間10km
- 月間30km
- 歩兵隊長
- 百里の旅人

表示:

- 獲得済みバッジ
- 次に取れそうなバッジ
- 未獲得バッジ
- 獲得称号一覧

処理:

- `activities` 直近 200 件から stats 計算
- 条件達成したバッジを `users/{uid}/badges/{badgeId}` に保存

---

## 4.10 管理画面

### 管理トップ

ルート: `app/admin/index.tsx`

権限:

- `user.role === 'admin'` のみ

機能:

- 全チャレンジ一覧
- public/private 表示
- 陣営戦/個人戦表示
- status 表示
- status 切り替え
  - active / finished
- パブリックラン新規作成への遷移

### パブリックラン作成

ルート: `app/admin/battle/new.tsx`

権限:

- `user.role === 'admin'`

機能:

- public battle 作成
- season 連携
  - 新規作成
  - 既存を使う
  - なし
- タイトル
- 説明
- モード
  - 陣営戦
  - 個人戦
- 区分リスト
- rankingType
  - 1人あたり平均
  - 合計距離
- 開始日
- 終了日

---

## 5. 現在の主要ユーザーフロー

## 5.1 初回利用

```txt
起動
  -> onboarding 未完了なら /onboarding
  -> ログイン or 新規登録
  -> /(tabs)
```

## 5.2 ラン記録

```txt
ホーム or タブバー
  -> ラン
  -> GPS/歩数選択
  -> START
  -> 記録中
  -> 停止して保存
  -> /record/summary
  -> /battle/[id] or /battle tab
```

## 5.3 パブリックチャレンジ参加

```txt
チャレンジタブ
  -> パブリックラン
  -> チャレンジカード
  -> 区分を選んで参加
  -> /battle/[id]
```

## 5.4 プライベートチャレンジ作成

```txt
チャレンジタブ
  -> プライベートラン
  -> 新しいチャレンジを作る
  -> Pro でなければプロフィール導線
  -> Pro なら作成フォーム
  -> 作成
  -> プライベートラン一覧
```

## 5.5 プライベートチャレンジ参加

```txt
チャレンジタブ
  -> プライベートラン
  -> 招待コードで参加
  -> 6桁コード入力
  -> チャレンジ確認
  -> 区分選択 or 個人参加
```

## 5.6 チャレンジ詳細から走る

```txt
/battle/[id]
  -> NEXT MOVE / ラン CTA
  -> ランタブ
```

## 5.7 結果確認

```txt
バトル終了後ログイン
  -> RootLayout が finished battle を検知
  -> /battle/result/[id]
```

または:

```txt
/battle/[id]
  -> RESULT
  -> /battle/result/[id]
```

---

## 6. 機能重複とタブ再設計の論点

## 6.1 ホームと記録タブの重複

ホーム:

- 今日の距離
- 今日の歩数
- 最近の記録 5 件

記録タブ:

- 累計距離
- 今週距離
- 最長ラン
- ラン履歴 20 件

重複しているのは「最近の記録/履歴」。  
ホームは「今日の行動」、記録タブは「過去の分析」に寄せると整理しやすい。

整理案:

- ホームの最近の記録は直近 1 件だけ、または削除
- 記録タブに activity detail 遷移を追加
- 記録タブに週/月推移、自己ベスト、連続日数を追加

## 6.2 ホームとチャレンジタブの役割

ホーム:

- 参加中チャレンジの要約
- 次の目標
- 今走る理由

チャレンジ:

- 探す
- 参加する
- 作る
- 招待コードで入る
- 管理する

この分担は成立している。  
チャレンジタブをなくすと、未参加チャレンジの探索や private 作成導線がホームに混ざって重くなる。

## 6.3 ランタブの独立性

ランタブは記録開始専用として明確。  
ホームの「今日のラン」とは別役割。

## 6.4 プロフィールとバッジ/称号

プロフィールからバッジ/称号へ遷移する構造。  
バッジ/称号を継続的なモチベーション要素にするなら、ホームにも「次に取れそうなバッジ」を 1 件だけ出す案がある。

---

## 7. 現在の Pro / Free 差分

Free:

- public battle 参加
- private battle 参加
- ラン記録
- バッジ/称号
- 結果シェア時 watermark あり

Pro:

- private battle 作成
- Pro 専用テーマ
- 結果シェア watermark なし

注意:

- Firestore Rules では `users/{uid}.plan` を参照して Pro 判定している。
- ただし `users/{uid}` の write 制限次第では plan 改ざんリスクがあるため、権限制御は別途確認が必要。

---

## 8. 画面遷移マップ

```txt
Root
├─ onboarding
│  ├─ auth/login
│  └─ auth/signup
├─ auth/login
│  └─ auth/signup
├─ auth/signup
│  └─ back/login
└─ (tabs)
   ├─ ホーム /(tabs)/index
   │  ├─ notifications
   │  ├─ battle/[id]
   │  ├─ activity/[id]
   │  └─ /(tabs)/battle
   ├─ チャレンジ /(tabs)/battle
   │  ├─ battle/[id]
   │  ├─ private create form
   │  ├─ invite code join form
   │  └─ category select modal
   ├─ ラン /(tabs)/record
   │  └─ record/summary
   │     ├─ battle/[id]
   │     └─ /(tabs)/battle
   ├─ 記録 /(tabs)/stats
   └─ プロフィール /(tabs)/profile
      ├─ badges
      ├─ admin
      └─ auth/login

battle/[id]
├─ battle/result/[id]
├─ battle/theme?id=...
└─ /(tabs)/record

battle/result/[id]
├─ /(tabs)/battle
└─ /(tabs)/profile

activity/[id]
└─ battle/[id]

notifications
├─ battle/[id]
└─ activity/[id]

admin
└─ admin/battle/new
```

---

## 9. 現時点の整理候補

優先度順。

1. ホームの「最近の記録」を残すか削るか決める
   - 残すなら直近 1 件程度にする
   - 詳細履歴は記録タブに寄せる

2. 記録タブを「分析」に寄せる
   - 月間/週間推移
   - 平均ペース
   - 連続日数
   - activity detail 遷移

3. チャレンジタブは維持する
   - 探す/参加/作る/招待コードの操作置き場として必要

4. ホームは「今日走る理由」に集中する
   - 次の目標
   - 逆転までの距離
   - 今日の目標
   - 参加中チャレンジ要約

5. private battle を「友達チャレンジ」と呼ぶか検討する
   - 現在の「プライベートラン」は少し機能が伝わりづらい可能性がある

