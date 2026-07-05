/**
 * BattleRun デザイントークン
 *
 * UIコンポーネントはすべてこのファイルの定数を使うこと。
 * ハードコードされた色・サイズは禁止。
 */
import { Platform, TextStyle } from 'react-native';

// ============================================================
// カラーパレット
// ============================================================

export const Colors = {
  // ブランドカラー（メインの緑系ティール）
  primary: '#00C49A',        // 明るい背景上のブランド色・ボタン・プログレスバー
  primaryBright: '#00D9A3',  // ダーク背景上で使う明るいティール
  primaryLight: '#E6FAF6',   // 背景ハイライト・選択状態
  primaryDark: '#00A07D',    // プレスド状態・深いティール

  // アクセントカラー（ランキング・競争要素）
  accent: '#FF6B35',         // 1位・強調・UP矢印（#FF5C2B もこれに統一）
  accentDark: '#E0431A',     // アクセントのプレスド状態
  accentLight: '#FFEDE5',    // accent の淡背景（チップ・バッジ・強調カード）
  accentYellow: '#FFB800',   // 王冠アイコン・ゴールド・称号

  // Pro（サブスク）
  pro: '#7C3AED',            // Pro バッジ・特別感

  // セマンティックカラー
  success: '#00C49A',        // 達成・完了（primaryと同じ）
  warning: '#FFB800',
  error: '#EF4444',
  info: '#4A90E2',

  // テキスト
  textPrimary: '#111827',    // メイン文字（純白背景でのコントラスト最適化。旧 #1A1A2E）
  textSecondary: '#6B7280',  // サブ文字（グレー）
  textTertiary: '#9CA3AF',   // プレースホルダー・補足
  textOnPrimary: '#FFFFFF',  // primaryカラー上の文字
  textOnAccent: '#FFFFFF',   // accentカラー上の文字（CTA）

  // 背景（白ベースのミニマル基調。旧・温かいベージュから移行）
  background: '#F7F8FA',     // アプリ全体の背景（旧 #F4F2EC / #F8FAFB を統一）
  surface: '#FFFFFF',        // カード・モーダルの背景
  surfaceGray: '#F1F3F5',    // 入力フィールド・非アクティブ背景
  /** @deprecated 温かいインセット面。白ベース移行に伴いクールグレーへ。新規は surfaceGray を使う */
  surfaceAlt: '#EEF1F5',

  // ボーダー
  border: '#E5E7EB',         // 通常のボーダー
  borderLight: '#F1F3F5',    // 薄いセパレーター

  // チームランキング用（競争感を出す色）
  rank1: '#FFB800',          // 1位 ゴールド
  rank2: '#9CA3AF',          // 2位 シルバー
  rank3: '#CD7F32',          // 3位 ブロンズ

  // 陣営バー用。自陣営は常に primary、敵陣営の筆頭は accent（VS の緊張感を色で作る）
  teamColors: [
    '#00C49A',  // 自陣営（primary）
    '#FF6B35',  // 敵筆頭（accent）
    '#4A90E2',
    '#9B59B6',
    '#F59E0B',
    '#64748B',
  ],

  // 陣営識別カラー（バトル詳細・一覧で最大6陣営を色分け）
  teamPalette: [
    '#3A86FF',
    '#FF4757',
    '#FFC23C',
    '#9B5CFF',
    '#00D9A3',
    '#FF6B35',
  ],

  // チャート用（WeeklyBarChart）
  chartBarActive: '#00C49A',    // データありの日
  chartBarInactive: '#E5E7EB',  // データ 0 の日・プレースホルダー
  chartToday: '#FF6B35',        // 今日のバーだけアクセント
} as const;

// ============================================================
// ダーク HUD 用カラー（記録中・結果・バトル詳細のダーク部）
// record.tsx / battle/result/[id].tsx の現行多数派の実値を採用
// ============================================================

export const DarkColors = {
  background: '#0A0E1A',                    // ダーク画面の背景
  surface: '#161D33',                       // ダークカード（旧 BR.darkCard）
  surfaceAlt: '#11172A',                    // ダークパネル（旧 BR.darkPanel）
  line: 'rgba(255,255,255,0.08)',           // 区切り線（旧 BR.darkLine）
  lineStrong: 'rgba(255,255,255,0.14)',     // 強めの区切り線（旧 BR.darkLine2）
  textPrimary: '#FFFFFF',                   // メイン文字（旧 BR.paper）
  textSecondary: 'rgba(255,255,255,0.68)',  // サブ文字（旧 BR.paper2）
  textTertiary: 'rgba(255,255,255,0.40)',   // 補足文字（旧 BR.paper3）
  primary: '#00D9A3',                       // ダーク上の明るいティール
  accent: '#FF6B35',                        // アクセント（#FF5C2B から統一）
  stop: '#FF3D58',                          // STOP ボタン
} as const;

// ============================================================
// タイポグラフィ
// ============================================================

export const Typography = {
  // フォントファミリー（iOS標準）
  fontFamily: {
    regular: 'System',   // SF Pro Text
    bold: 'System',
    mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
  },

  // フォントサイズ
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,     // 本文（iOSのデフォルト）
    lg: 17,     // 強調本文
    xl: 20,     // セクションタイトル
    '2xl': 24,
    '3xl': 32,  // 大きな数値（距離表示など）
    '4xl': 48,  // ヒーロー数値（ホーム画面の距離）
  },

  // フォントウェイト
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },

  // 行の高さ
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;

// ============================================================
// テキストスタイル（HUD ラベルとヒーロー数値）
// ============================================================

export const TextStyles = {
  // 等幅ラベル。★ダーク画面（記録中HUD・結果）専用。ライト画面では SectionHeader を使う
  tacLabel: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  } as TextStyle,
  // 距離などの大きな数値。桁が揃うよう tabular-nums を必ず付ける
  heroNumber: {
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
    color: Colors.textPrimary,
  } as TextStyle,
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    color: Colors.textPrimary,
  } as TextStyle,
  // ライト画面のセクション見出し（MonoLabel の代替）
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  } as TextStyle,
} as const;

// ============================================================
// スペーシング（4の倍数ベース）
// ============================================================

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

// ============================================================
// ボーダーラディウス
// ============================================================

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,  // 完全な丸（ボタン・アイコン）
} as const;

// ============================================================
// シャドウ
// ============================================================

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

// ============================================================
// タブバー
// ============================================================

export const TabBar = {
  height: 83,              // iPhoneのホームインジケーター込みの高さ
  iconSize: 24,
  labelSize: Typography.fontSize.xs,
  activeColor: Colors.primary,
  inactiveColor: Colors.textTertiary,
  backgroundColor: Colors.surface,
  borderTopColor: Colors.border,
} as const;

// ============================================================
// 共通コンポーネントサイズ
// ============================================================

export const ComponentSize = {
  // ボタン
  buttonHeight: {
    sm: 36,
    md: 48,   // 標準ボタン
    lg: 56,   // CTAボタン（記録開始など）
  },

  // 記録開始ボタン（大きな丸ボタン）
  recordButtonSize: 120,

  // アバター
  avatarSize: {
    xs: 28,
    sm: 36,
    md: 44,
    lg: 56,
  },

  // カードの内側のパディング
  cardPadding: Spacing.lg,

  // 画面の左右マージン
  screenPadding: Spacing.lg,

  // リストアイテムの高さ
  listItemHeight: 60,

  // プログレスバーの高さ
  progressBarHeight: 8,
} as const;

// ============================================================
// アニメーション
// ============================================================

export const Animation = {
  // 数値カウントアップのduration（ランキング更新時）
  countUpDuration: 600,
  // 画面遷移
  screenTransition: 250,
} as const;
