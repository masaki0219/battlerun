# Claude Code Instructions

このリポジトリで作業するときは、最初に以下を読んで従うこと。

1. `AGENTS.md`
2. `HANDOFF.md`

実装終了時には、テスト結果を確認し、必ず `HANDOFF.md` を更新すること。

## プロジェクト概要

チーム対抗ランニング・ウォーキングアプリ「BattleRun」。React Native / Expo、Firebase（Firestore）、RevenueCat、Google サインイン。

## よく使うコマンド

```bash
npx expo start        # 開発サーバー
npx tsc --noEmit      # 型チェック（npmスクリプト未定義）
npm run test:rules    # Firestore ルールのテスト（Firebase エミュレータ必要）
```

実行していない確認を成功と報告しないこと。
