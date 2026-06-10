# BattleRun デバッグ・テスト調査レポート

作成日: 2026-05-23  
対象: `battlerun/`  
方針: 修正なし。調査・テスト・静的レビューのみ。

---

## 1. 実施した確認

### コマンド確認

| コマンド | 結果 |
|---|---|
| `git status --short` | 未コミット変更多数あり |
| `git diff --stat` | 23ファイル変更、3286 insertions / 1099 deletions |
| `npx tsc --noEmit` | 成功。TypeScript 型エラーなし |
| `npm ls --depth=0` | 成功。依存関係の欠落なし |
| `rg` による TODO/FIXME/Firestore query/例外処理検索 | 実行済み |

### 確認対象の主な領域

- 記録開始・停止フロー
- GPS/歩数モード
- アクティビティ保存
- バトル参加・作成
- バトル詳細・結果画面
- チーム詳細・ホームの活動履歴
- 通知・リアクション
- Firestore indexes / rules
- RevenueCat / 通知 / バックグラウンド位置情報の初期化まわり

---

## 2. 総評

現状は TypeScript と依存関係のレベルでは成立しています。  
ただし、実行時・Firestore・データ整合性の観点では、MVPリリース前に止めるべき問題が複数あります。

特に重要なのは以下です。

1. 歩数モードの記録距離が保存時に 0km になる可能性が高い
2. 通知・リアクションの Firestore Rules が不足しており、機能が権限エラーで動かない可能性が高い
3. バトル参加処理が非トランザクションで、人数・参加状態がずれる可能性がある
4. バトル詳細画面がストア依存で、直リンクや再読み込みに弱い
5. `activities.startedAt` の保存形式と読み取り側の期待形式が揃っていない

---

## 3. 重大度 High

### H-1. 歩数モードの距離が保存時に 0km になる可能性

対象:

- `stores/recordStore.ts:55-83`
- `hooks/useStepCounter.ts:31-40`
- `app/(tabs)/record.tsx:130-155`

内容:

`useStepCounter` は歩数モード中に `distanceKm` を加算していますが、`stopRecording()` は停止時に常に `route` から距離を再計算しています。

歩数モードでは `route` が空なので、保存される `activity.distanceKm` は 0 になります。

影響:

- 歩数モードの記録が実質保存されない
- チーム距離に加算されない
- バトル貢献に反映されない
- 記録サマリーで 0.0km 表示になる

推奨:

`measurementType === 'steps'` の場合は `state.distanceKm` を採用し、GPS の場合のみ route から再計算する。

---

### H-2. 通知サブコレクションの Firestore Rules がない

対象:

- `firestore.rules:5-8`
- `firestore.rules:56-60`
- `lib/notifications.ts:142-164`
- `app/notifications.tsx:72-96`
- `stores/recordStore.ts:177-196`

内容:

通知は `users/{uid}/notifications` に書き込まれますが、`firestore.rules` には `users/{userId}/notifications/{notificationId}` の match がありません。

Firestore Rules は親ドキュメントの `match /users/{userId}` がサブコレクションへ自動適用されません。

影響:

- 通知作成が permission denied になる
- 通知一覧の取得が permission denied になる
- 未読の既読化 batch update も失敗する
- 多くの通知作成処理がサイレント catch されるため、UI上は気づきにくい

推奨:

`match /users/{userId}/notifications/{notificationId}` を追加し、本人 read/update、必要な create 条件を明示する。

---

### H-3. リアクションサブコレクションの Firestore Rules がない

対象:

- `firestore.rules:56-60`
- `app/activity/[id].tsx:136-149`
- `app/activity/[id].tsx:157-182`
- `app/(tabs)/index.tsx:270-285`

内容:

リアクションは `activities/{activityId}/reactions/{userId}` を読み書きしていますが、`firestore.rules` には reactions の match がありません。

影響:

- アクティビティ詳細でリアクション取得に失敗する
- リアクション追加・削除が permission denied になる
- ホームのチーム活動リアクション数取得も失敗する

推奨:

`match /activities/{activityId}/reactions/{userId}` を追加し、認証済みユーザーの read と本人 write を許可する。

---

### H-4. バトル参加処理が非トランザクションで整合性が崩れる

対象:

- `stores/battleStore.ts:158-207`

内容:

`joinBattle()` は以下を個別に実行しています。

- participants 作成
- category_stats participantCount increment
- users battleIds arrayUnion
- Zustand store 更新

途中で失敗すると、参加者だけ作られて `battleIds` がない、または人数だけ増える、といった中途半端な状態になります。

さらに同じユーザーが同じバトルに再参加した場合、participant は上書きされますが `participantCount` は再度 increment されます。

影響:

- category_stats の人数が実参加者数とずれる
- average ranking が壊れる
- 再参加・連打・通信失敗時にデータ不整合が残る

推奨:

`runTransaction` で participant 既存確認、category 変更時の旧 category decrement、新 category increment、users.battleIds 更新を一括処理する。

---

### H-5. バトル詳細が store に存在しない battle を表示できない

対象:

- `app/battle/[id].tsx:66-78`
- `app/battle/[id].tsx:144-160`

内容:

バトル詳細画面は `publicBattles` と `privateBattles` の Zustand store から battle を探しています。Firestore から battle 本体を fallback 取得していません。

影響:

- 詳細画面を直接開いた場合に「チャレンジが見つかりませんでした」になりやすい
- アプリ再起動後の通知遷移・深いリンク・リロードに弱い
- `category_stats` は購読しているのに、battle metadata がないため label が categoryId 表示になる

推奨:

`id` から `battles/{id}` を取得する fallback を追加する。`battle/result/[id].tsx` には類似実装があるため流用可能。

---

## 4. 重大度 Medium

### M-1. `activities.startedAt` の保存形式と読み取り側の期待が不一致

対象:

- 保存: `stores/recordStore.ts:112-123`
- 読み取り: `app/team/[id].tsx:136-145`
- 読み取り: `app/activity/[id].tsx:104-125`
- 読み取り: `app/(tabs)/index.tsx:289-302`
- 読み取り: `app/battle/[id].tsx:121-130`

内容:

保存時は `startedAt` / `endedAt` を ISO string として保存しています。  
一方、複数の読み取り側は Firestore `Timestamp` を期待して `toMillis()` や `seconds` を参照しています。

影響:

- チーム詳細の活動履歴日付が 1970年扱いになる可能性
- ホームの活動履歴 `ago` 表示が不正になる可能性
- アクティビティ詳細の開始/終了時刻が現在時刻にフォールバックされる可能性
- Firestore の `orderBy('startedAt')` は string でも動くが、Timestamp と混在すると並びが壊れる

推奨:

保存形式を `Timestamp` に統一するか、読み取り側を ISO string 対応に統一する。新規データは `Timestamp.fromDate(new Date(activity.startedAt))` が望ましい。

---

### M-2. 複数バトル参加時、活動履歴が代表バトルにしか紐づかない

対象:

- `stores/recordStore.ts:110-117`
- `stores/recordStore.ts:140-175`
- `app/battle/[id].tsx:107-141`
- `app/battle/result/[id].tsx:123-130`

内容:

記録保存時、距離加算は `activeBattleIds` 全件に対して行われます。  
しかし `activities` ドキュメントの `battleId` は `activeBattleIds[0]` のみです。

影響:

- 2つ目以降の参加バトルでは距離は増えるが、最近の活動に出ない
- バトル結果画面の activityCount が代表バトル以外で少なくなる
- 通知や履歴の整合性が落ちる

推奨:

`battleIds: string[]` を activity に保存する、または `battle_activity_links` のようなサブデータを作る。

---

### M-3. `activities` の `battleId + startedAt` 複合インデックスが不足

対象:

- `app/battle/[id].tsx:110-115`
- `firestore.indexes.json:1-29`

内容:

バトル詳細画面で `where('battleId', '==', id)` と `orderBy('startedAt', 'desc')` を組み合わせています。  
`firestore.indexes.json` には `teamId + startedAt` と `userId + startedAt` はありますが、`battleId + startedAt` がありません。

影響:

- Firestore 本番環境で最近の活動取得が index error になる可能性
- 現在 catch で握りつぶされるため、単に活動履歴が空に見える

推奨:

`activities` collectionGroup に `battleId ASC + startedAt DESC` を追加する。

---

### M-4. Free作成制限チェック用の複合インデックスが不足する可能性

対象:

- `stores/battleStore.ts:219-226`
- `firestore.indexes.json:1-29`

内容:

Freeプランの月1回制限で `createdBy == userId`, `type == private`, `createdAt >=`, `createdAt <=` の複合クエリを使っています。  
対応する複合インデックスがありません。

影響:

- Freeユーザーに private battle 作成を許可する設計に戻した場合、作成時に index error になる
- 現 UI は Free 作成をブロックしているため、現時点の露出は限定的

推奨:

仕様として Free 作成を許可するなら `createdBy ASC + type ASC + createdAt ASC` を追加する。Pro限定にするなら store 側の Free 月1回ロジックは削除または整理する。

---

### M-5. 個人戦バトルの詳細表示が未完成

対象:

- `stores/recordStore.ts:150-173`
- `app/battle/[id].tsx:88-175`
- `app/(tabs)/battle.tsx:447-520`

内容:

個人戦では `participants/{uid}.totalDistanceKm` は更新されますが、バトル詳細画面は `category_stats` を中心に表示しています。個人戦では `category_stats` が空なので、ランキング表示が成立しません。

影響:

- 個人戦に参加しても詳細画面で順位・進捗が見えない
- private battle list でも個人戦はランキングバーが出ない
- BattleRun の中心体験である「あと何kmで逆転」が個人戦で欠落する

推奨:

`mode === 'individual'` の場合は `participants` を購読/取得して個人ランキングを表示する。

---

### M-6. バトルテーマ更新の権限が緩い

対象:

- `firestore.rules:36-39`
- `app/battle/theme.tsx:116-128`

内容:

Firestore Rules は private battle なら認証済みユーザー全員に update を許可しています。  
UI上は Pro 判定のみで、作成者かどうかの確認もありません。

影響:

- 任意のログインユーザーが任意の private battle のテーマや他フィールドを更新できる可能性
- クライアント改ざんで title/status/categories なども更新可能

推奨:

private battle update は `createdBy == request.auth.uid` に制限し、更新可能フィールドも絞る。

---

## 5. 重大度 Low / 設計整理

### L-1. UIのPro制限とStoreのFree制限ロジックが矛盾

対象:

- `app/(tabs)/battle.tsx` の private battle 作成ボタン
- `stores/battleStore.ts:210-237`

内容:

UIでは Free ユーザーに private battle 作成を許可していません。  
一方 store には Free の月1回・14日制限ロジックがあります。

推奨:

仕様をどちらかに統一する。Pro限定なら store 側でも明示的に拒否する。Free制限付き許可なら UI 側のブロックを外す。

---

### L-2. 多数の catch がサイレントで、実機デバッグが難しい

対象例:

- `lib/notifications.ts:162-164`
- `app/notifications.tsx:198-207`
- `app/(tabs)/index.tsx:307-308`
- `stores/recordStore.ts:196-198`

内容:

通知・活動履歴・リアクションの失敗が UI に出ず、ログも出ない箇所があります。

推奨:

開発ビルドでは `console.warn` を出す、または debug flag 付きの logger を用意する。

---

### L-3. セキュリティルールがMVPとしても広い

対象:

- `firestore.rules:10-18`
- `firestore.rules:50-52`

内容:

teams は認証済みユーザー全員が update 可能、category_stats も認証済みユーザー全員が write 可能です。

影響:

- クライアント改ざんに弱い
- ランキング値を直接変更できる

推奨:

短期: update 可能フィールド・本人性・参加者性を rules で制限する。  
中期: 集計更新は Cloud Functions へ移行する。

---

## 6. 推奨修正順

1. `stopRecording()` の歩数モード距離保存バグを修正
2. Firestore Rules に notifications / reactions を追加
3. `activities.startedAt` / `endedAt` の形式を Timestamp へ統一
4. `joinBattle()` を transaction 化し、再参加・カテゴリ変更を安全にする
5. `battle/[id].tsx` に Firestore fallback 取得を追加
6. `activities battleId + startedAt` index を追加
7. 個人戦の participants ランキング表示を追加
8. private battle update 権限を owner/admin に制限
9. 複数バトル参加時の activity 紐づけ方式を見直す
10. サイレント catch を開発時に見える形へ整理

---

## 7. 次回テストで見るべき手動シナリオ

### 記録

- GPSモードで 0.1km 以上記録し、activity / team / battle に反映されるか
- 歩数モードで歩数と距離が保存されるか
- 保存後サマリーの距離・歩数・バトル影響が正しいか
- アクティビティ詳細の日付が正しいか

### バトル

- パブリックバトル参加
- private battle 招待コード参加
- 同一バトルへの再参加/連打
- 個人戦参加後の詳細・結果表示
- 複数バトル参加中に1回記録したときの距離加算と履歴表示

### Firestore

- 通知一覧取得
- 通知作成
- リアクション追加・削除
- バトル詳細の最近の活動
- チーム詳細の活動履歴

### ナビゲーション

- 通知から `/battle/{id}` へ直接遷移
- アプリ再起動後に battle detail を開く
- result/theme/activity detail の direct route

---

## 8. 今回修正しなかったこと

ユーザー指示に従い、今回はコード修正を行っていません。  
作成したファイルはこのレポートのみです。

