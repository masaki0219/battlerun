# Claude Code 実装指示: 常設チーム機能の撤去とバトル中心設計への整理

## 目的

BattleRun から「常設の所属チーム / 友達グループ」機能をいったん撤去する。

今後、友達・フレンド機能は別設計で追加する予定。現時点では `teams/{teamId}` を使った常設グループは不要。

一方で、バトル内の「理系 vs 文系」「星座別」「きのこ vs たけのこ」のような参加先は残す。これは常設チームではなく、各バトル内の一時的な陣営/区分として扱う。

## 用語整理

現在混同しやすい用語があるため、実装では以下の意味に統一する。

- 常設チーム: `teams/{teamId}` と `teams/{teamId}/members/{userId}`。これは撤去対象。
- バトル陣営: `battles/{battleId}.categories` と `battles/{battleId}/category_stats/{categoryId}`。これは残す。
- バトル参加者: `battles/{battleId}/participants/{userId}`。ユーザー単位で参加する。これは残す。

例:

```txt
理系 vs 文系:
  battles/{battleId}.categories = [
    { id: "science", label: "理系" },
    { id: "humanities", label: "文系" }
  ]
  participants/{userId}.categoryId = "science"

星座別:
  battles/{battleId}.categories = [
    { id: "aries", label: "おひつじ座" },
    { id: "taurus", label: "おうし座" },
    ...
  ]
  participants/{userId}.categoryId = ユーザーが選んだ星座
```

## 現状確認

現行コードでは `teams` が常設所属グループとして残っている。

主な該当箇所:

- `hooks/useTeam.ts`
- `stores/teamStore.ts`
- `app/team/create.tsx`
- `app/team/join.tsx`
- `app/team/[id].tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/record.tsx`
- `stores/recordStore.ts`
- `types/index.ts`
- `firestore.rules`
- `firestore.indexes.json`

現在の `teams` は以下の挙動になっている。

- Free/Pro を問わず誰でも作成できる
- 期限フィールドがない
- `users/{uid}.teamId` により常設所属として扱われる
- 記録保存時に `activities.teamId` と `teams.totalDistanceKm` が更新される
- ホーム画面に常設チームランキングや活動履歴が表示される

この挙動は現在の仕様とは違う。

## 仕様

### 残すもの

- 公開バトル / プライベートバトル
- バトル作成時の `startAt` / `endAt`
- Pro ユーザーによるプライベートバトル作成
- バトル参加時の category 選択
- `battles/{battleId}/participants/{userId}`
- `battles/{battleId}/category_stats/{categoryId}`
- `activities/{activityId}` の userId, battleId, distanceKm, startedAt など
- 通知、リアクション、バッジ、称号。ただし常設チーム依存部分は調整する。

### 撤去または無効化するもの

- 常設チームの作成
- 常設チームへの招待コード参加
- 常設チーム詳細画面
- `users/{uid}.teamId`
- `activities.teamId`
- `teams.totalDistanceKm`
- `teams/{teamId}/members/{userId}`
- ホーム画面の常設チームランキング
- ホーム画面の常設チーム活動履歴
- チームメンバーへの活動通知
- バッジ条件のうち「チーム貢献距離」に依存するもの

## 実装方針

### 1. 型定義を整理する

`types/index.ts` から常設チーム依存を削る。

削除候補:

- `User.teamId`
- `Team`
- `TeamMember`
- `TeamStore`
- `Activity.teamId`

注意:

- `Battle.mode: 'team' | 'individual'` は残してよい。ただしこの `team` は常設チームではなく「category を選ぶバトル形式」を意味する。
- 可能なら UI 表記では `team` を「陣営」または「区分」に寄せる。内部型名は大規模変更になるなら後回しでよい。

### 2. 常設チーム関連ファイルを撤去する

削除またはルーティングから外す候補:

- `hooks/useTeam.ts`
- `stores/teamStore.ts`
- `app/team/create.tsx`
- `app/team/join.tsx`
- `app/team/[id].tsx`

`app/_layout.tsx` から以下を削除する。

- `team/create`
- `team/join`
- `team/[id]`

関連 import が残らないようにする。

### 3. ホーム画面をバトル中心にする

`app/(tabs)/index.tsx` から常設チーム依存を削る。

削除するもの:

- `useTeamStore`
- `useTeam`
- `currentTeam`
- `members`
- `liveTeam`
- `teamRank`
- `totalTeams`
- `teamActivities`
- `teams` コレクションの購読
- `activities where teamId == currentTeam.id`
- チームカード、チーム順位カード、チーム活動タイムライン
- `/team/${id}` への遷移

残す/置き換えるもの:

- 今日の距離と歩数
- 参加中バトルのカード
- 次に走るべきバトル/陣営差分
- 通知入口
- バトル参加導線

ホームは「自分の今日の記録 + 参加中バトルの状況」に寄せる。

### 4. 記録保存から常設チーム更新を外す

`app/(tabs)/record.tsx`:

- `useTeamStore` の import と `currentTeam` 利用を削除
- `saveActivityToFirestore` 呼び出しから `teamId: currentTeam?.id` を削除

`stores/recordStore.ts`:

- `saveActivityToFirestore` の params から `teamId` を削除
- `activities` 保存データから `teamId` を削除
- `teams/{teamId}` の `totalDistanceKm` 更新を削除
- `teams/{teamId}/members/{userId}` の `totalDistanceKm` 更新を削除
- チームメンバーへの `member_activity` 通知作成を削除

残す:

- activity 作成
- activeBattleIds への距離加算
- `participants/{userId}.totalDistanceKm` 更新
- `category_stats/{categoryId}` 更新

注意:

現行の `activity.battleId` は `activeBattleIds[0]` だけを保存している。今回の主目的ではないが、可能なら `battleIds: string[]` 保存へ拡張すると複数バトル参加時の履歴整合性が改善する。

### 5. Firestore rules を整理する

`firestore.rules` から `teams` match を削除する。

削除候補:

```txt
match /teams/{teamId} {
  ...
  match /members/{userId} { ... }
}
```

`users/{userId}` の write では `teamId` を前提にしない。

注意:

`category_stats` は現在だれでも write できるため、リリース前には別途強化が必要。ただし今回の常設チーム撤去とは別タスクとして扱ってよい。

### 6. Firestore indexes を整理する

`firestore.indexes.json` から `activities.teamId + startedAt` の index を削除する。

残す:

- `activities.userId + startedAt`
- `activities.battleId + startedAt`
- `battles.type + status`

追加検討:

- private battle 作成制限を残す場合、`battles.createdBy + type + createdAt` index が必要。

### 7. バッジ/通知/活動詳細を調整する

`app/badges.tsx`:

- `teamContributionKm` の計算を削除または 0 固定にする
- 「チーム貢献者」など常設チーム依存バッジを削除するか、バトル貢献バッジに置き換える

`types/index.ts`:

- `NotificationType.member_activity` は不要なら削除
- 残す場合でも常設チーム通知には使わない

`app/activity/[id].tsx`:

- `teamId` 表示や型があれば削除
- battle 関連表示は残す

### 8. プライベートバトル作成の Pro 仕様を確認する

「友達グループは Pro ユーザーのみが期限付きで設置する」という仕様は、今後は常設 `teams` ではなく private battle として扱う。

`app/(tabs)/battle.tsx` の UI は Pro で作成導線になっている。

確認・調整すること:

- Free ユーザーは private battle 作成画面に入れない
- `stores/battleStore.ts` の Free 月1回・14日制限ロジックを残すか削除するか判断する
- 仕様が「Pro のみ作成」なら Free 月1回ロジックは削除し、store 側でも `plan !== 'pro'` は throw する
- Firestore rules でも private battle create を Pro のみに寄せる

推奨:

```txt
private battle 作成:
  Pro のみ
  startAt/endAt 必須
  inviteCode あり

public battle 作成:
  admin のみ
```

### 9. 画面文言の整理

混乱を避けるため、ユーザー向け文言は以下に寄せる。

- 常設チーム: 使わない
- バトル内 category: 「陣営」または「区分」
- `mode === 'team'`: 画面上は「陣営戦」または「区分戦」
- `mode === 'individual'`: 「個人戦」

例:

- 「区分を選んで参加」: OK
- 「あなたのチーム」: 「あなたの陣営」に変更推奨
- 「チームが距離を加算」: 「陣営に距離を加算」に変更推奨

## 受け入れ条件

以下を満たすこと。

1. TypeScript が通る。

```bash
npx tsc --noEmit
```

2. 常設チーム関連ルートが存在しない、またはどこからも遷移できない。

```txt
app/team/create.tsx
app/team/join.tsx
app/team/[id].tsx
```

3. `teams` コレクションへの書き込みがアプリコードから消えている。

確認コマンド例:

```bash
rg "collection\\(db, 'teams'\\)|doc\\(db, 'teams'"
```

4. `users/{uid}.teamId` への読み書きがアプリコードから消えている。

確認コマンド例:

```bash
rg "teamId"
```

ただし `battle category` の意味では `categoryId` を使うこと。`teamId` が残る場合は理由を明記する。

5. 記録保存後、以下が更新される。

- `activities/{activityId}`
- `battles/{battleId}/participants/{userId}.totalDistanceKm`
- `battles/{battleId}/category_stats/{categoryId}`

6. 記録保存後、以下は更新されない。

- `teams/{teamId}`
- `teams/{teamId}/members/{userId}`
- `activities.teamId`

7. ホーム画面が常設チーム前提ではなく、個人記録と参加中バトル中心になっている。

8. Firestore rules に `teams` match が残っていない。

## 実装時の注意

- 既存の `DEBUG_TEST_REPORT_2026-05-23.md` は古い指摘も含む。現行コードを必ず確認してから変更する。
- `CLAUDE.md` は Supabase 前提の古い内容を含むため、今回の実装ではこのファイルより本指示書を優先する。
- `CLAUDE_V2.md` は参考になるが、`teams` という名称がバトル陣営と常設チームで混ざっているので注意する。
- Firestore の本番データ移行は別タスク。今回のコード変更では旧 `teams` データを削除しない。
- 不要ファイルを削除する場合でも、import と route 登録の残りを必ず確認する。

## Claude Code にそのまま渡す短縮プロンプト

```txt
BattleRun から常設チーム機能を撤去してください。

必ず battlerun/CLAUDE_REMOVE_STANDING_TEAMS.md を読んで、その内容を優先してください。

目的:
- teams/{teamId} と teams/{teamId}/members/{userId} を使った常設の友達グループは今は不要。
- 今後フレンド機能として別設計で作るため、現時点では削除/無効化する。
- バトル内の categories は残す。これは「理系 vs 文系」「星座別」など、参加時にユーザーが選ぶ一時的な陣営。

やること:
- hooks/useTeam.ts, stores/teamStore.ts, app/team/* の利用を撤去。
- ホーム画面から常設チームランキング/活動履歴/チーム詳細導線を削除し、個人記録と参加中バトル中心にする。
- 記録保存から teamId, teams totalDistanceKm, teams members 更新、チームメンバー通知を削除。
- types/index.ts から常設 Team/TeamMember/TeamStore/User.teamId/Activity.teamId を整理。
- firestore.rules から teams match を削除。
- firestore.indexes.json から activities.teamId + startedAt index を削除。
- private battle は期限付きの友達チャレンジとして残す。作成は Pro のみになるよう UI/store/rules を確認して整える。
- UI 文言では常設チームと混同しないよう、battle.categories は「陣営」または「区分」と呼ぶ。

最後に npx tsc --noEmit を実行し、残っている teamId/teams 参照を rg で確認してください。
```
