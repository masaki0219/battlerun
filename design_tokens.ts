/**
 * BattleRun デザイントークン
 *
 * UIコンポーネントはすべてこのファイルの定数を使うこと。
 * ハードコードされた色・サイズは禁止。
 */

// ============================================================
// カラーパレット
// ============================================================

export const Colors = {
  // ブランドカラー（メインの緑系ティール）
  primary: '#00C49A',        // ボタン・アクティブ要素・プログレスバー
  primaryLight: '#E6FAF6',   // 背景ハイライト・選択状態
  primaryDark: '#00A07D',    // プレスド状態

  // アクセントカラー（ランキング・競争要素）
  accent: '#FF6B35',         // 1位・強調・UP矢印
  accentYellow: '#FFB800',   // 王冠アイコン・ゴールド

  // セマンティックカラー
  success: '#00C49A',        // 達成・完了（primaryと同じ）
  warning: '#FFB800',
  error: '#FF4444',
  info: '#4A90E2',

  // テキスト
  textPrimary: '#1A1A2E',    // メイン文字（ほぼ黒）
  textSecondary: '#6B7280',  // サブ文字（グレー）
  textTertiary: '#9CA3AF',   // プレースホルダー・補足
  textOnPrimary: '#FFFFFF',  // primaryカラー上の文字

  // 背景
  background: '#F8FAFB',     // アプリ全体の背景
  surface: '#FFFFFF',        // カード・モーダルの背景
  surfaceGray: '#F3F4F6',    // 入力フィールド・非アクティブ背景

  // ボーダー
  border: '#E5E7EB',         // 通常のボーダー
  borderLight: '#F3F4F6',    // 薄いセパレーター

  // チームランキング用（競争感を出す色）
  rank1: '#FFB800',          // 1位 ゴールド
  rank2: '#9CA3AF',          // 2位 シルバー
  rank3: '#CD7F32',          // 3位 ブロンズ

  // チームバーのカラー（他チームとの比較グラフ用）
  teamColors: [
    '#00C49A',  // 自チーム（primary）
    '#FF6B35',  // 2位チーム
    '#4A90E2',  // 3位チーム
    '#9B59B6',  // 4位チーム
  ],
} as const;

// ============================================================
// タイポグラフィ
// ============================================================

export const Typography = {
  // フォントファミリー（iOS標準）
  fontFamily: {
    regular: 'System',   // SF Pro Text
    bold: 'System',
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
