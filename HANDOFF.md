# HANDOFF

最終更新: 2026-07-12

## プロジェクトの目的

仲間と合計距離を競うチーム対抗ランニング・ウォーキングアプリ。React Native / Expo で実装し、Firebase（Firestore）をバックエンド、RevenueCat を課金、Google サインインを認証に使う。GPS によるアクティビティ記録とバトル（対戦）機能が中心。

## 現在の状態

`feat/ui-consolidation` ブランチで作業中。inst_v3 のデザイン刷新に加え、リリース前レビューで見つかったプライバシー・記録保全・集計整合性・法務・UX修正が未コミットで乗っている。このブランチは origin へ push されていない。既存変更を破棄せず、この状態から継続すること。

`inst_v3/BattleRunホーム画面作成.zip`（Figma Make のホーム画面デザイン・最終版）を反映し、パレットをディープパイン系に刷新した。レイアウトの作り直しはホームタブとランタブの2画面に限定し、他画面は `design_tokens.ts` 経由で色だけ追従している。

※ 同フォルダの `BattleRunホーム画面作成 (コピー).zip` は旧版。パレット（`theme.css`）は同一だが、ヒーローが2陣営のVSゲージで、チーム内ランキングが無い。**最終版はこちら（コピーでない方）**。

## 最後に完了したこと（未コミット）

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

## 次にやること

Firebaseのstaging環境へ Functions / Firestore rules / indexes / Storage rules / Hosting をまとめてデプロイし、`RELEASE_TEST_CHECKLIST.md` のDay-0、GPS保存、再送、ランキング反映、アカウント削除を2アカウントの実機で通す。

## その次の候補

- `feat/ui-consolidation` を origin へ push し、`main` へマージするか判断する
- 使われていないブランチ `feat/ui-refresh` / `feat/ui-redesign` を整理する
- `package.json` に `typecheck` / `lint` スクリプトを追加する（現在は `test:rules` のみ）
- バックグラウンドGPS を EAS development build で確認する（Expo Go ではフォアグラウンドのみ）
- `RELEASE_TEST_CHECKLIST.md` に沿ったリリース前確認

## 未解決・要確認

- Firebase資産は未デプロイ。クライアントだけ先に配布すると新しいCallableが存在せず記録保存できないため、必ずサーバーを先にデプロイする。
- 法務ページHTMLは用意済みだがHosting未デプロイ。App Store Connectへ登録するプライバシーポリシーURLとサポート窓口の実アドレスは公開後に確認する。
- Expo依存は `expo ~54.0.35`、`expo-font ~14.0.12`、`expo-router ~6.0.24` へ更新済み。Expo Doctorは18/18合格。
- `npm audit --omit=dev` は34件（critical 1 / high 4）。Criticalの`shell-quote`とHighの`@grpc/grpc-js` / `protobufjs` / `ws`は親依存の許容範囲内に修正版があり、`npm audit fix`（`--force`なし）で更新可能。Highの`undici`はFirebase 10.14.1が6.19.7へ固定しており、完全解消にはFirebase 12系へのメジャー更新と回帰検証が必要。開発依存込みでは`form-data`が加わりcritical 1 / high 5。`npm audit fix --force`は未適用。
- Firestoreルールテストはテストコードの型チェックまで成功。ローカル環境にJavaがなくエミュレータ実行は未完了。
- ブラウザ操作環境へ接続できず、今回追加・変更した画面は実機目視が必要。
- `submitActivity` はサーバーで距離を再計算するが、Firebase App Checkのネイティブ導入は未実施。stagingで動作確認後、改造クライアント対策として導入を検討する。

- **画面の目視確認が未実施**。今回実行したのは `npx tsc --noEmit`（エラーなし）と `npx expo export --platform ios`（バンドル成功）のみ。レイアウト崩れの有無は未確認。
- `FactionColumns` のバー高さは **0起点ではなく「最下位〜首位」で正規化**している（僅差だと全部同じ高さに潰れて順位が読めないため。最下位でも 32% は残す）。各バーの上に実数値 km を出して誤読を防いでいるが、スケールの妥当性は要レビュー。
- `useTeamRanking` は participants サブコレクションを全件読む（既存の `useBattleParticipants` と同じ方式）。大規模バトルでは読み取り件数が増える。上位3名の users 読みは3件に固定。
- ダーク面（記録中HUD・結果画面）がパイン系に変わったため、`battle/result/[id].tsx` など今回レイアウトを触っていないダーク画面の見え方は要確認。
- `app/battle/theme.tsx` の `sports` テーマだけ新ブランド色に合わせた。他テーマ（RPG / ホラー等）の hex は意図的にそのまま。
- `feat/ui-consolidation` を `main` へマージする予定かどうかは不明。31 コミット分が未 push のままローカルにのみ存在する。
- `npm run test:rules` は Firebase エミュレータ（`firebase emulators:exec`）が必要。未実行（今回の変更は UI のみでルールに影響しない）。
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

2026-07-12 時点: `npx tsc --noEmit` と `npx expo export --platform ios` は成功。`npm run test:rules` は未実行。

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
