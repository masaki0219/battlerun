# OPERATIONS

BattleRun のローンチ・運用手順。デプロイ手順の詳細は [README.md](./README.md) を参照。

---

## 1. ローンチ前チェックリスト

### 1-1. デプロイコマンド一覧

順番に実行する（rulesとindexesはFirestoreの整合性に関わるため、機能追加前に必ず反映すること）。

```bash
# Firestore セキュリティルール
firebase deploy --only firestore:rules

# Firestore インデックス（category_stats.participantCount の collectionGroup 検索用など）
firebase deploy --only firestore:indexes

# Cloud Functions（ビルドしてからデプロイ）
cd functions && npm install && npm run build && cd ..
firebase deploy --only functions
```

インデックスの反映には数分〜数十分かかる場合がある。デプロイ直後に該当クエリを叩くと
`FAILED_PRECONDITION` エラーになることがあるため、Firebaseコンソールの
「Firestore → インデックス」でステータスが「有効」になったことを確認してから
本番トラフィックを流すこと。

### 1-2. RevenueCat Webhook のシークレット設定

1. `firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH` で任意のランダム文字列を設定する。
2. RevenueCat ダッシュボード → Project settings → Integrations → Webhooks に、
   デプロイ後の `revenuecatWebhook` のURLと、手順1で設定した値を
   Authorization ヘッダーとして登録する。
3. 詳細手順は [README.md](./README.md) の「RevenueCat Webhook の設定」を参照。

この設定が漏れると、購入は成立してもFirestoreの`users/{uid}.plan`が`pro`に
反映されず、アプリ再起動後にPro表示が消える不具合につながるため、
ローンチ前に必ずサンドボックス購入で疎通確認すること
（[RELEASE_TEST_CHECKLIST.md](./RELEASE_TEST_CHECKLIST.md) シナリオ5）。

### 1-3. 公開バトルは必ず admin 画面から作成する

`app/admin/battle/new.tsx` の作成フロー（`useBattleStore().createBattle`）は、
バトル本体の作成と同時に各区分の `category_stats/{categoryId}` を
`totalDistanceKm: 0, avgDistanceKm: 0, participantCount: 0` でゼロ初期化する。

Firebaseコンソールから直接 `battles` ドキュメントを作成すると、この
ゼロ初期化が行われない。`category_stats` が存在しない状態で参加者が
参加すると、`participantCounter`（Cloud Functions）が
「category_stats not found」の警告を出して人数カウントに反映されず、
ランキングが正しく計算されない。**公開バトルは必ず admin 画面から作成すること。**

---

## 2. 開催中の公開バトルを常に最低1つ用意する

ホーム（バトルタブ）の未参加ユーザー向け導線（Day-0レイアウト）は、
「開催中の作戦に参加しよう」カードの表示に開催中の公開バトルの存在を前提にしている。
開催中バトルが1つも無い状態でローンチすると、新規ユーザーが
参加先を提示されない「何もないアプリ」を見ることになり、離脱に直結する。

**運用ルール**: 現在開催中のバトルの `endAt` が近づいたら、終了前に
次のバトルを admin 画面から作成し、開催中バトルが0件になる期間を作らない。

---

## 3. シーズン1のバトルローテーション案

2週間×3本を目安に、「どちらかに必ず所属意識がある」感情的な対立軸をテーマにする。
SNS化・健康アプリ化はしない方針のため、テーマは軽い遊び心のある二項対立に留める。

| # | 期間目安 | テーマ例 | 陣営例 |
|---|---|---|---|
| 1 | 2週間 | きのこ/たけのこ型 | きのこ派 vs たけのこ派 |
| 2 | 2週間 | 朝型/夜型 | 朝ラン部 vs 夜ラン部 |
| 3 | 2週間 | 文系/理系 | 文系チーム vs 理系チーム |

テーマ選定の指針:
- 明確な「自分はどちら側か」が即答できるもの（迷うテーマは陣営選択が進まない）
- 優劣がつく能力の対立軸にしない（走力とは無関係な軸にすることで初心者が萎縮しない）
- 次シーズンにテーマを使い回してもマンネリ化しにくい、母数の大きい対立軸を選ぶ

次シーズン以降のストックとして、朝食のご飯/パン派、犬派/猫派、雨の日は好き/嫌い、
などの候補も検討可能。

---

## 4. 障害時の手動復旧手順

### 4-1. 称号が付与されなかった場合（`scripts/award-titles.ts`）

`battleStatusScheduler`（60分毎のスケジューラ）が何らかの理由で実行されず、
バトル終了時に称号が付与されなかった場合の手動復旧スクリプト。

```bash
# 初回のみ
npm install -D firebase-admin ts-node

# Firebase Console → プロジェクト設定 → サービスアカウント → 「新しい秘密鍵の生成」
# でサービスアカウントJSONをダウンロードしてから実行
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
  npx ts-node scripts/award-titles.ts <battleId>
```

- 選出ロジックは `battleScheduler.ts` と統一されている（区分ありバトルは上位2陣営全員、
  個人戦レガシーデータは上位2名）。
- 冪等性: `user.titles` に同一 `battleId` の称号が既にあればスキップされるため、
  誤って複数回実行しても二重付与にはならない。
- シーズンの `archived` 更新はこのスクリプトの責務ではない。必要であれば
  Firebase Console または管理画面から別途行うこと。

### 4-2. admin画面での status 手動切替の注意点

`app/admin/index.tsx` の「終了にする」ボタンは `battles/{id}.status` を
直接 `updateDoc` で `finished` に書き換えるだけであり、
**`battleStatusScheduler` の称号付与ロジックは発火しない**
（スケジューラは cron 実行時に `endAt` を過ぎた `active` バトルを自分でクエリして
処理するものであり、Firestoreの書き込みをトリガーにした関数ではないため）。

そのため、admin画面から手動でバトルを終了させた場合は、
**直後に `scripts/award-titles.ts` を実行して称号付与を行うこと。**
実行を忘れると、参加者に称号が付与されないまま気づかれずに残ってしまう。

### 4-3. participantCount / avgDistanceKm がずれていると思われる場合

`category_stats.participantCount` と `avgDistanceKm` は
`functions/src/participantCounter.ts`（`battles/{battleId}/participants/{userId}` の
書き込みをトリガー）が自動計算する。ズレを見つけた場合は、まず
該当 `participants` サブコレクションの実ドキュメント数と `category_stats` の値を
Firebaseコンソールで突き合わせ、Functionsログ（`firebase functions:log`）で
`participantCounter` のエラー（category_stats not found 等）が出ていないか確認する。
手動修正が必要な場合は Firebase Console から `category_stats` を直接書き換えるのではなく、
原因（大抵は category_stats の未初期化、または上記1-3のバトル作成経路違反）を先に特定すること。
