# UI リフレッシュ 旧値 → 新トークン 対応表

`UI_REFRESH_SPEC.md` フェーズ1の棚卸し結果。各画面ローカルの `const BR` パレットと
ハードコード色を、意味でグルーピングして `design_tokens.ts` のトークンへ寄せる台帳。

棚卸しコマンド:
```bash
grep -rn "const BR" app/ components/
grep -rnE "#[0-9A-Fa-f]{6}" app/ components/ --include="*.tsx" | grep -v design_tokens
grep -rn "Tac\|MonoLabel" app/ components/
```

`const BR` は 8 ファイルに存在（record / stats / badges / notifications / theme / activity /
record/summary / battle/result）。値はほぼ統一されており、多数派を正とする。
ダーク値は record.tsx / battle/result/[id].tsx / record/summary.tsx の実値を正とした。

## ライト画面のパレット

| 旧値 | 旧キー | 出現箇所 | 新トークン |
|---|---|---|---|
| `#F4F2EC` | `BR.light` | 全ライト画面 | `Colors.background` |
| `#EDEAE2` | `BR.lightSurf2` | 全ライト画面 | `Colors.surfaceAlt`（新規・温かいインセット） |
| `rgba(10,14,26,0.08)` | `BR.lightLine` | 多数 | `Colors.border` |
| `#0A0E1A` | `BR.ink` | 多数 | `Colors.textPrimary` |
| `#5A6477` | `BR.ink2` | 多数 | `Colors.textSecondary` |
| `#9AA4B5` | `BR.ink3` | 多数 | `Colors.textTertiary` |
| `#00D9A3` | `BR.primary`（ライト画面） | 多数 | `Colors.primary`（`#00C49A` に統一） |
| `#06B189` | `BR.primaryDeep` | record ほか | `Colors.primaryDark` |
| `#FF5C2B` | `BR.accent` | 多数 | `Colors.accent`（`#FF6B35` に統一） |
| `#E0431A` | `BR.accentDeep` | record | `Colors.accentDark`（新規） |
| `#FFC23C` | `BR.gold` | 多数 | `Colors.accentYellow`（`#FFB800`） |
| `#C2CBD6` | `BR.silver` | stats/result | `Colors.rank2` |
| `#CB7B3A` / `#CD7F32` | `BR.bronze` / `BRONZE` | stats/result/battle詳細 | `Colors.rank3` |
| `#FFFFFF` | `BR.paper`（ライト画面） | 多数 | `Colors.surface` |
| `#7C3AED` | `BR.pro` | theme | `Colors.pro`（新規） |

## ダーク HUD のパレット（record / result / summary）

| 旧値 | 旧キー | 新トークン |
|---|---|---|
| `#0A0E1A` | `BR.dark` | `DarkColors.background` |
| `#161D33` | `BR.darkCard` | `DarkColors.surface`（多数派の実値を採用） |
| `#11172A` | `BR.darkPanel` | `DarkColors.surfaceAlt` |
| `rgba(255,255,255,0.08)` | `BR.darkLine` | `DarkColors.line` |
| `rgba(255,255,255,0.14)` | `BR.darkLine2` | `DarkColors.lineStrong` |
| `#FFFFFF` | `BR.paper`（ダーク画面の文字） | `DarkColors.textPrimary` |
| `rgba(255,255,255,0.68)` | `BR.paper2` | `DarkColors.textSecondary` |
| `rgba(255,255,255,0.40)` | `BR.paper3` | `DarkColors.textTertiary` |
| `#00D9A3` | `BR.primary`（ダーク画面） | `DarkColors.primary` |
| `#FF5C2B` | `BR.accent`（ダーク画面） | `DarkColors.accent`（`#FF6B35`） |
| `#FF3D58` | record STOP 四角 | `DarkColors.stop` |

## Tac / MonoLabel

| 旧 | 出現箇所 | 新 |
|---|---|---|
| ローカル `function Tac(...)` | record / stats / badges / notifications / theme / activity / summary / result | `components/ui/MonoLabel`（`<MonoLabel>`）へ一本化 |

`Tac` は 8 ファイルにローカル定義。等幅・太字・大文字・字間広めの小ラベル。
`MonoLabel`（`TextStyles.tacLabel` ベース、`color` / `size` props）へ統合する。

## 形状・影の統一

- カード角丸 → `BorderRadius.lg (16)` / モーダル・ボトムシート → `BorderRadius.xl (20)`
- ライトカード → `Shadow.sm` ＋ `borderWidth:1, borderColor: Colors.border`
- ダークカード → シャドウ無し、`DarkColors.line` の 1px ボーダー
