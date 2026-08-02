/**
 * BattleRun デザイントークン
 *
 * UIコンポーネントはすべてこのファイルの定数を使うこと。
 * ハードコードされた色・サイズは禁止。
 */
import { Platform, TextStyle } from 'react-native';
import { pickOtherTeamColor, pickTeamColor } from './utils/teamColors';

// ============================================================
// カラーパレット
// ============================================================

export const Colors = {
  // ブランドカラー（ディープパイン・ティール。inst_v3 世代）
  primary: '#087B73',        // 明るい背景上のブランド色・ボタン・プログレスバー
  primaryBright: '#4FD0C2',  // ダーク背景上で使う明るいティール（ダーク面のゲージ・アイコン）
  primaryLight: '#E9F6F3',   // 背景ハイライト・選択状態
  primaryBorder: '#B8D9D4',  // primaryLight 面のボーダー（ブランド強調カード）
  primaryDark: '#066B64',    // プレスド状態・白背景上の小さなテキスト

  // アクセントカラー（CTA・今日・競争要素）
  accent: '#EF7136',         // 主 CTA・今日のバー・1位強調
  accentDark: '#D65E25',     // アクセントのプレスド状態
  accentLight: '#FFF0E7',    // accent の淡背景（チップ・バッジ・強調カード）
  accentYellow: '#E5A13A',   // 王冠アイコン・ゴールド・称号

  // Pro（サブスク）
  pro: '#6B4FC9',            // Pro バッジ・特別感

  // セマンティックカラー
  success: '#0F9187',        // 達成・完了（ブランドのティール系）
  warning: '#E5A13A',
  error: '#D92D20',
  info: '#3A86FF',

  // テキスト（パイン寄りのインク。ニュートラルグレーより背景と馴染む）
  textPrimary: '#112523',    // メイン文字
  textSecondary: '#60716F',  // サブ文字（白地 5.1:1、WCAG AA適合。読ませる補足・注記はこちらを使う）
  // 白地 2.7:1 / 背景上 2.5:1 で AA 不適合。プレースホルダー・非活性状態・単位・装飾ラベルなど
  // 「読めなくても操作に支障がない要素」専用。文章として読ませるテキストには使わない。
  textTertiary: '#8FA09D',
  textOnPrimary: '#FFFFFF',  // primaryカラー上の文字
  textOnAccent: '#112523',   // accentカラー上の文字（CTA）。通常本文のAAコントラストを確保

  // 背景（ごくわずかに緑に振ったオフホワイト）
  background: '#F3F6F5',     // アプリ全体の背景
  surface: '#FFFFFF',        // カード・モーダルの背景
  surfaceGray: '#EDF2F1',    // 入力フィールド・非アクティブ背景・セグメントのトラック
  /** @deprecated 温かいインセット面。白ベース移行に伴いクールグレーへ。新規は surfaceGray を使う */
  surfaceAlt: '#E6EDEB',

  // ボーダー
  border: '#DBE5E3',         // 通常のボーダー
  borderLight: '#E9EFED',    // 薄いセパレーター

  // チームランキング用（競争感を出す色）
  rank1: '#E5A13A',          // 1位 ゴールド
  rank2: '#9AAAA7',          // 2位 シルバー
  rank3: '#C08552',          // 3位 ブロンズ
  // 金銀銅の淡背景（RankBadge の 1〜3 位バッジ地）
  rank1Bg: '#FDF3E2',
  rank2Bg: '#EDF2F1',
  rank3Bg: '#F6EAE0',

  // チーム識別色。categoryId のハッシュから決定論的に割り当てる。
  // 自チームの強調は色の置換ではなく、枠線・背景・ラベルで行う。
  teamColors: [
    '#087B73',  // 自陣営（primary）
    '#EF7136',  // 敵筆頭（accent）
    '#3A86FF',
    '#9B5CFF',
    '#E5A13A',
    '#5E7C77',
  ],

  // 陣営識別カラー（バトル詳細・一覧で最大6陣営を色分け）
  teamPalette: [
    '#0F9187',
    '#EF7136',
    '#3A86FF',
    '#9B5CFF',
    '#E5A13A',
    '#5E7C77',
  ],

  // チャート用（WeeklyBarChart）
  chartBarActive: '#168D83',    // データありの日
  chartBarInactive: '#DDE5E3',  // データ 0 の日・プレースホルダー
  chartToday: '#F07A3E',        // 今日のバーだけアクセント
  chartTrack: '#EDF2F1',        // バーの下地トラック（棒の背景レーン）
} as const;

// ============================================================
// ダーク面用カラー（記録中HUD・結果・ホームのヒーローカード）
// inst_v3 のディープパイン系。ライト面のブランド色と地続きの色相にする
// ============================================================

export const DarkColors = {
  background: '#0B2724',                    // ダーク画面の背景（記録中HUD・結果）
  surface: '#123B37',                       // ダークカード・ヒーローカードの地
  surfaceAlt: '#103530',                    // ダークパネル・ヒーローのフッター帯
  surfaceDeep: '#0C2D2A',                   // ダーク面のさらに沈んだ帯（ヒーロー内のインサイト行）
  chip: 'rgba(255,255,255,0.10)',           // ダーク面のチップ・ピル背景
  modalBackdrop: 'rgba(11,39,36,0.48)',      // ボトムシート背面のオーバーレイ
  marker: 'rgba(255,255,255,0.75)',         // ダーク面のゲージ境界線
  decor: '#1D5C55',                         // 装飾リング（太）
  decorLine: '#57938B',                     // 装飾リング（細）
  line: 'rgba(255,255,255,0.10)',           // 区切り線
  lineStrong: 'rgba(255,255,255,0.16)',     // 強めの区切り線
  textPrimary: '#FFFFFF',                   // メイン文字
  textSecondary: '#B7DAD5',                 // サブ文字（ティール寄りの淡色）
  textTertiary: '#7FA9A3',                  // 補足文字
  primary: '#4FD0C2',                       // ダーク上の明るいティール
  primaryTint: '#8EF1E6',                   // 自陣営の数値・ラベル（primary より明るい）
  primaryRing: 'rgba(142,241,230,0.35)',    // 自陣営バーのリング
  primarySoft: 'rgba(79,208,194,0.14)',     // primary の淡背景（貢献バナー）
  accent: '#F08648',                        // アクセント（ダーク上で沈まないオレンジ）
  accentTint: '#F5B080',                    // ダーク面の淡いオレンジ文字（次順位までの差）
  accentSoft: 'rgba(240,134,72,0.16)',      // accent の淡背景（警告バナー）
  barMuted: '#779490',                      // 他陣営のバー（陣営カラム）
  markStrong: '#BAF4EC',                    // 自陣営マークの地
  markStrongText: '#0C514A',                // 自陣営マークの文字
  stop: '#FF5A5F',                          // STOP ボタン
} as const;

/**
 * 自チーム以外のバーに割り当てる色。`Colors.teamColors[0]` は自チーム（primary）専用なので
 * 常に index 1 以降を循環させる。`order` は 0 始まりの表示順（順位-1 など）。
 */
export function otherTeamColor(order: number): string {
  return pickOtherTeamColor(Colors.teamColors, order);
}

export function teamColor(categoryId: string): string {
  return pickTeamColor(Colors.teamPalette, categoryId);
}

/** 活動詳細マップの相対ラップペース（速い・通常・ゆっくり）。 */
export const RoutePaceColors = {
  fast: Colors.primary,
  steady: DarkColors.decorLine,
  slow: Colors.accent,
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
  '2xl': 22,   // ヒーローカード（ホームの参加中バトル）
  full: 9999,  // 完全な丸（ボタン・アイコン）
} as const;

// ============================================================
// シャドウ
// ============================================================

// 影は黒ではなくパイン系のインクで落とす（背景の緑みと喧嘩しない）
export const Shadow = {
  sm: {
    shadowColor: '#112523',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#112523',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0B423C',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 26,
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
