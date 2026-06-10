# REDESIGN_SPEC 実装レビュー 2026-05-26

対象: Claude Code による `REDESIGN_SPEC.md` 実装後のレビュー

確認コマンド:

```bash
npx tsc --noEmit
```

結果: TypeScript 型チェックは成功。

---

## 総評

タブ構成の整理、ホーム廃止、Battle タブのランディング化、Stats 履歴行の `/activity/[id]` 遷移、Run タブのチャレンジ接続表示、`activities.battleIds[]` 保存は実装されています。

ただし、`battleIds[]` への移行が一部画面に残っています。特に Battle 詳細・結果・Activity 詳細がまだ `battleId` 単数を正として扱っているため、「1回のランを参加中の全バトルへ自動加算する」仕様と表示がずれます。

また、Firestore rules の `plan` 書き換え禁止は入っていますが、`role` の自己昇格と新規ユーザードキュメント作成時の `plan` / `role` 偽装がまだ防げていません。

---

## ブロッカー

### 1. Pro 購入・復元が Firestore rules で失敗する

該当:

- `firestore.rules:8`
- `lib/revenuecat.ts:77`
- `lib/revenuecat.ts:94`

`users/{uid}.plan` のクライアント更新を禁止した一方で、現在の Pro 購入・復元処理はクライアントから `updateDoc(doc(db, 'users', userId), { plan: 'pro' })` を実行しています。

このままだと RevenueCat の購入自体は成功しても、Firestore の `plan` 更新が拒否され、アプリ内では Pro になりません。

対応案:

- Cloud Functions 経由で `plan` を更新する
- まだ Cloud Functions が未実装なら、一時的に開発用の更新経路を別途用意する
- `lib/revenuecat.ts` は直接 `users.plan` を書き換えない

---

## 高優先度

### 2. `users/{uid}.role` を本人が変更できる

該当:

- `firestore.rules:8`
- `firestore.rules:19`
- `firestore.rules:35`

現在の rules は `plan` 変更だけを禁止していますが、`role` は本人が更新できます。悪意あるクライアントが自分の `role` を `admin` に変更すると、`seasons` 書き込みや public battle 作成が可能になります。

さらに `allow create` は本人なら無条件なので、新規作成時に `plan: 'pro'` や `role: 'admin'` を入れることも防げません。

対応案:

- `create` 時は `plan == 'free'`、`role` は未指定または通常ユーザー固定にする
- `update` 時は `plan` と `role` の両方をクライアント変更禁止にする
- 必要なら `createdAt` などの管理フィールドも保護する

例:

```javascript
allow create: if request.auth != null
  && request.auth.uid == userId
  && request.resource.data.plan == 'free'
  && !('role' in request.resource.data);

allow update: if request.auth != null
  && request.auth.uid == userId
  && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['plan', 'role']);
```

### 3. Battle 詳細の最近のアクティビティが `battleId` 単数のまま

該当:

- `app/battle/[id].tsx:137`
- `app/battle/[id].tsx:139`

`saveActivityToFirestore` は `battleIds[]` に全参加バトルを保存しますが、Battle 詳細の最近のアクティビティ取得は `where('battleId', '==', id)` のままです。

そのため、複数バトル参加中に保存したランは、代表バトル以外の Battle 詳細に表示されません。

対応:

```typescript
where('battleIds', 'array-contains', id)
```

必要なら `firestore.indexes.json` に `battleIds arrayConfig: CONTAINS + startedAt desc` の複合インデックスを追加してください。

### 4. Battle 結果の activity count が `battleId` 単数のまま

該当:

- `app/battle/result/[id].tsx:123`
- `app/battle/result/[id].tsx:125`

結果画面で参加者ごとの `activityCount` を計算するクエリが `where('battleId', '==', id)` のままです。

複数バトル自動加算では、代表バトル以外の結果画面で活動回数が少なく表示されます。

対応:

```typescript
where('battleIds', 'array-contains', id)
```

### 5. Activity 詳細が `battleIds[]` を読んでいない

該当:

- `app/activity/[id].tsx:70`
- `app/activity/[id].tsx:116`
- `app/activity/[id].tsx:127`

Activity 詳細は `battleId` 単数だけを読み、関連バトル名も1件しか表示しません。

複数バトルに自動加算されたランでは、「このランがどのバトルに反映されたか」が欠けます。

対応:

- `ActivityData` に `battleIds: string[]` を追加
- `battleIds` の各 battle title を取得
- 表示は「反映先バトル 3件」またはバトル名リストにする

---

## 中優先度

### 6. Record summary の CTA が複数バトル時も代表バトル詳細へ飛ぶ

該当:

- `app/record/summary.tsx:290`
- `app/record/summary.tsx:291`

`REDESIGN_SPEC.md` では、加算先が複数なら `/(tabs)/battle` に戻す方針です。現在は `primaryImpact` があれば常に `/battle/[id]` に遷移します。

対応:

- `impacts.length === 1` なら `/battle/[id]`
- `impacts.length > 1` なら `/(tabs)/battle`

### 7. Record summary が「実際に加算されたバトルID」を受け取っていない

該当:

- `app/(tabs)/record.tsx:161`
- `app/(tabs)/record.tsx:171`
- `app/record/summary.tsx:97`

保存時には `activeBattleIds` を渡していますが、summary にはそのID一覧が渡されていません。summary 側は `myMemberships` と現在の store から影響を推定しています。

このため、以下のケースで表示がずれる可能性があります。

- 記録保存直後に store のバトル一覧が未ロード
- `status: active` だが期間外のバトルがある
- 保存時点と summary 表示時点で参加状態が変わる

対応:

- `saveActivityToFirestore` の戻り値に `activityId` を使う
- summary に `activityId` または `battleIds` を渡す
- summary は保存済み activity の `battleIds[]` を正として表示する

### 8. 平均ランキングの before/after 計算が不正確

該当:

- `app/record/summary.tsx:123`
- `app/record/summary.tsx:129`

`rankingType === 'average'` の場合、summary の before シミュレーションは `totalDistanceKm` だけを戻しています。しかしソートは `avgDistanceKm` を使うため、before 順位が正しく戻りません。

対応:

- `avgDistanceKm = totalDistanceKm / participantCount` も再計算する

### 9. `saveActivityToFirestore` が activity 作成後に加算処理を行うため不整合が残り得る

該当:

- `stores/recordStore.ts:115`
- `stores/recordStore.ts:133`

現在は先に `activities` を作成し、その後で各バトルの `participants` / `category_stats` を更新しています。途中で失敗すると、activity は残るがバトル集計に反映されない状態になります。

対応案:

- 最低限、失敗時にユーザーへ「記録保存は成功したがバトル反映に失敗」と分けて通知する
- 可能なら Cloud Functions / バッチ / リトライキューで集計更新を保証する

---

## 実装確認済み

### Stats 履歴行の遷移

該当:

- `app/(tabs)/stats.tsx:190`
- `app/(tabs)/stats.tsx:193`

履歴行が `TouchableOpacity` でラップされ、`/activity/[id]` に遷移するようになっています。

### Run タブの複数バトル表示

該当:

- `app/(tabs)/record.tsx:258`
- `app/(tabs)/record.tsx:330`

開始前バッジと記録中HUDで、参加中バトル数に応じたメッセージが表示されます。

### Activity 保存時の `battleIds[]`

該当:

- `stores/recordStore.ts:118`
- `stores/recordStore.ts:119`

保存時に後方互換の `battleId` と、新仕様の `battleIds[]` の両方が保存されています。

### 全バトルへの距離加算

該当:

- `stores/recordStore.ts:133`
- `stores/recordStore.ts:142`
- `stores/recordStore.ts:157`

`activeBattleIds` の全件に対して `participants/{uid}.totalDistanceKm` と `category_stats/{categoryId}` が更新されます。

### タブ構成

該当:

- `app/(tabs)/_layout.tsx`
- `app/(tabs)/index.tsx`

タブは `battle / record / stats / profile` の4つに整理されています。`index.tsx` は実ファイルとして残っていますが、Battle へのリダイレクト用途なら問題ありません。

---

## Claude Code への追加修正指示案

以下を次の修正として依頼してください。

```text
REDESIGN_SPEC.md 実装後レビューの指摘を修正してください。

必須:
1. Firestore rules で users/{uid}.role もクライアント変更禁止にする。create 時に plan/role 偽装も防ぐ。
2. lib/revenuecat.ts の plan 更新はクライアント updateDoc ではなく Cloud Functions 等の安全な経路に変更する。未実装なら TODO ではなく、現状で購入/復元が失敗しない設計にする。
3. app/battle/[id].tsx の最近のアクティビティ取得を battleIds array-contains に変更する。
4. app/battle/result/[id].tsx の activityCount 集計を battleIds array-contains に変更する。
5. app/activity/[id].tsx で battleIds[] を読み、複数反映先バトルを表示する。
6. app/record/summary.tsx は保存済み activity の battleIds[] を正として反映先を表示する。複数件なら CTA は /(tabs)/battle に遷移する。
7. rankingType === 'average' の before/after 計算では avgDistanceKm も再計算する。

修正後に npx tsc --noEmit を実行し、結果を報告してください。
```
