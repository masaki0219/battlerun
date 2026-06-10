# Claude Code 実装指示: 常設チーム撤去後の残修正

## 目的

`CLAUDE_REMOVE_STANDING_TEAMS.md` に沿った常設チーム撤去後、レビューで見つかった残課題を修正する。

このファイルは追加修正用の指示書。まず `CLAUDE_REMOVE_STANDING_TEAMS.md` を前提として読み、そのうえで本ファイルの内容を実装すること。

## 現在の確認結果

TypeScript は通っている。

```bash
npx tsc --noEmit
```

常設チーム関連の大枠は削除済み。

- `hooks/useTeam.ts` 削除済み
- `stores/teamStore.ts` 削除済み
- `app/team/*` 削除済み
- `teams` コレクションへのアプリコード上の直接参照は概ね消えている

ただし、以下の仕様ズレが残っている。

## 修正 1: private battle 作成を Pro 限定にする

### 問題

UI では Free ユーザーに Pro ダイアログを出しているが、store と Firestore Rules はまだ Free 作成を許している。

該当箇所:

- `stores/battleStore.ts`
- `firestore.rules`
- 必要なら `firestore.indexes.json`

現在の `stores/battleStore.ts` は Free ユーザーに対して「月1回」「最大14日」の旧仕様を残している。

この旧仕様は削除する。

### 期待仕様

private battle 作成:

- Pro ユーザーのみ
- `startAt` / `endAt` 必須
- `inviteCode` あり
- 期限付きの友達チャレンジ相当として扱う

public battle 作成:

- admin のみ

### 実装指示

`stores/battleStore.ts` の `createBattle()` を修正する。

- `!isPublic && plan !== 'pro'` の場合は即 throw
- Free 月1回制限クエリを削除
- Free 最大14日制限を削除
- `createdBy`, `type`, `createdAt` の月次制限用クエリが不要になるため、関連 index 追加は不要

例:

```ts
if (!isPublic && plan !== 'pro') {
  throw new Error('PRO_REQUIRED: プライベートチャレンジの作成にはProプランが必要です。');
}
```

`firestore.rules` の `battles` create を修正する。

- `public` は admin のみ
- `private` は `users/{uid}.plan == 'pro'` のみ

例:

```txt
allow create: if request.auth != null && (
  (
    request.resource.data.type == 'private' &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.plan == 'pro' &&
    request.resource.data.createdBy == request.auth.uid
  ) ||
  (
    request.resource.data.type == 'public' &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
  )
);
```

必要なら create 時の必須フィールドも軽く制約する。ただし複雑にしすぎない。

## 修正 2: 終了済み/開始前バトルへ記録距離を加算しない

### 問題

`getActiveBattleIds()` が `myMemberships` をそのまま返しているため、終了済みや開始前のバトルにも記録距離が加算される。

該当箇所:

- `stores/battleStore.ts`
- `app/(tabs)/record.tsx`
- `stores/recordStore.ts`

### 期待仕様

記録保存時に距離加算するのは、現在日時が以下を満たすバトルだけ。

```txt
status == 'active'
startAt <= now <= endAt
```

public/private 両方を対象にする。

### 実装方針

どちらかの方針で実装する。

推奨 A:

- `BattleStore.getActiveBattleIds()` が `publicBattles + privateBattles` の battle metadata を見て、期間内の active battle id のみ返す
- `myMemberships` との intersection を取る

推奨 B:

- `fetchMyMemberships()` の段階で battle metadata を取得し、active/period 内だけに絞る
- ただし結果画面通知などで finished membership が必要になる可能性があるため、A の方が安全

注意:

- `fetchMyPrivateBattles(userId)` もホーム/記録前に呼ばれるようにする
- private battle も `getActiveBattleIds()` の対象に含める

疑似コード:

```ts
getActiveBattleIds: () => {
  const now = Date.now();
  const battles = [...get().publicBattles, ...get().privateBattles];
  const activeBattleIds = new Set(
    battles
      .filter((b) =>
        b.status === 'active' &&
        new Date(b.startAt).getTime() <= now &&
        now <= new Date(b.endAt).getTime()
      )
      .map((b) => b.id)
  );

  return get().myMemberships
    .map((m) => m.battleId)
    .filter((id) => activeBattleIds.has(id));
}
```

`app/(tabs)/record.tsx` では、停止保存前に以下を呼ぶ。

```ts
await Promise.all([
  fetchMyMemberships(user.id),
  fetchMyPrivateBattles(user.id),
  fetchPublicBattles(),
]);
```

実際の store API に合わせて import/selector を調整する。

## 修正 3: ホーム画面に private battle も表示する

### 問題

常設チーム撤去後、private battle が友達チャレンジ相当になる。しかしホーム画面は `publicBattles` しか見ていない。

該当箇所:

- `app/(tabs)/index.tsx`

### 期待仕様

ホームの「参加中のチャレンジ」には public/private 両方の active battle を表示する。

### 実装指示

`app/(tabs)/index.tsx` を修正する。

- `privateBattles` と `fetchMyPrivateBattles` を `useBattleStore()` から取得する
- 初回ロード時に `fetchMyPrivateBattles(user.id)` も呼ぶ
- `myActiveBattles` の探索元を `publicBattles` だけでなく `allBattles = [...publicBattles, ...privateBattles]` にする
- `category_stats` 購読も public/private 両方を対象にする
- 表示上、private battle に小さく「PRIVATE」などのタグを付けてもよい

現在の問題例:

```ts
const { publicBattles, myMemberships, fetchPublicBattles, fetchMyMemberships } = useBattleStore();
...
const battle = publicBattles.find((b) => b.id === m.battleId);
```

これを private も含む形にする。

## 修正 4: 記録サマリーの旧チーム文言を陣営/チャレンジに変更する

### 問題

常設チームを撤去したが、記録サマリーに旧チーム文言が残っている。

該当箇所:

- `app/record/summary.tsx`

残っている例:

- `チーム貢献者`
- `チームがN位に上昇`
- `チームに距離を加算しました`
- `チーム加算`
- `累計10km チームに貢献達成`
- `チーム活動履歴に表示されました`

### 期待仕様

バトル内 category は「陣営」または「区分」と呼ぶ。

置き換え例:

- `チーム貢献者` → `陣営貢献者`
- `チームがN位に上昇` → `陣営がN位に上昇`
- `チームに距離を加算しました` → `陣営に距離を加算しました`
- `チーム加算` → `陣営加算`
- `累計10km チームに貢献達成` → `累計10km 陣営に貢献達成`
- `チーム活動履歴に表示されました` → `最近の記録に表示されました` または削除

注意:

`app/badges.tsx` 側の常設チーム依存バッジは既に削除済みに見える。`summary.tsx` の一時表示だけが残っている可能性が高い。

## 修正 5: 旧「チーム」文言を必要範囲で整理する

### 問題

常設チーム撤去後も、UI 上の `チーム` が多数残っている。

すべてを一気に内部型名まで変える必要はないが、ユーザーが常設チームと誤解する画面文言は修正する。

優先修正対象:

- `app/battle/[id].tsx`
  - `あなたのチーム` → `あなたの陣営`
  - `チームランキング` → `陣営ランキング`
  - `チーム内 貢献ランキング` → `陣営内 貢献ランキング`
- `app/battle/result/[id].tsx`
  - `チーム内順位` → `陣営内順位`
  - `チームランキング` → `陣営ランキング`
- `app/(tabs)/battle.tsx`
  - `👥 チーム` → `👥 陣営戦` または `区分戦`
- `app/admin/battle/new.tsx`
  - admin 作成画面も同様
- `app/onboarding.tsx`
  - 必要なら「チーム」を「陣営」または「チャレンジ」に変更

内部型の `mode: 'team' | 'individual'` は今回は残してよい。

## 受け入れ条件

以下を確認する。

```bash
npx tsc --noEmit
```

以下の検索で、常設チームの Firestore 参照が残っていないこと。

```bash
rg "collection\\(db, 'teams'\\)|doc\\(db, 'teams'"
```

以下の検索で、ユーザー向けに不自然な旧チーム文言が残っていないか確認する。

```bash
rg -n "チーム|TEAM RANK|あなたのチーム|チーム活動履歴" app
```

残す場合は「バトル陣営の意味であえて残している」理由をコメントまたは報告に明記する。ただしできるだけ「陣営」に寄せる。

private battle の作成制限を確認する。

- Free ユーザーは UI だけでなく store/rules でも作成できない
- Pro ユーザーは private battle を作成できる
- admin は public battle を作成できる

記録保存の確認観点:

- active 期間内の public/private battle には距離が加算される
- ended/upcoming battle には距離が加算されない
- `activities` は作成される
- `teams` は更新されない

## Claude Code に渡す短縮プロンプト

```txt
常設チーム撤去後のレビューで残課題が見つかりました。

必ず battlerun/CLAUDE_POST_TEAM_REMOVAL_FIXES.md を読んで、その内容を実装してください。

主な修正:
1. private battle 作成を UI だけでなく store と firestore.rules でも Pro 限定にする。Free 月1回/14日制限の旧仕様は削除。
2. 記録保存時に終了済み/開始前バトルへ距離加算しない。status active かつ startAt/endAt 期間内の public/private battle だけ加算。
3. ホーム画面の参加中チャレンジに private battle も表示する。
4. record summary と battle/result/detail/admin/onboarding の旧「チーム」文言を「陣営」または「チャレンジ」に整理する。

最後に npx tsc --noEmit と rg で teams/teamId/チーム文言の残りを確認してください。
```
