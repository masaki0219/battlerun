// BattleRun 型定義
// このファイルの型をアプリ全体で使うこと

import type { GpsQualitySummary } from '../functions/src/gpsProcessing';
export type { GpsQualitySummary } from '../functions/src/gpsProcessing';

export type Plan = 'free' | 'pro';
export type MeasurementType = 'gps' | 'steps';
export type PauseKind = 'manual' | 'auto' | null;

export interface WeeklyGoal {
  type: 'distance' | 'days';
  /** distance は km、days は日数 */
  value: number;
}

export type PersonalRecordKey =
  | 'fastest1kSec'
  | 'fastest5kSec'
  | 'fastest10kSec'
  | 'longestRunKm'
  | 'maxElevationGainM'
  | 'bestMonthKm';

export interface PersonalRecords {
  fastest1kSec?: number;
  fastest5kSec?: number;
  fastest10kSec?: number;
  longestRunKm?: number;
  maxElevationGainM?: number;
  bestMonthKm?: number;
}

export interface MonthlyStat {
  monthKey: string;
  km: number;
  count: number;
  durationSec: number;
  elevationM: number;
}

export type DeclarationStatus = 'planned' | 'done' | 'cancelled' | 'expired';

export interface RunDeclaration {
  id: string;
  battleId: string;
  uid: string;
  dateKey: string;
  timezone?: string;
  plannedAt: string;
  note?: string;
  status: DeclarationStatus;
  createdAt: string;
  displayName: string;
  avatarEmoji?: string;
  cheeredByMe?: boolean;
  cheerCount: number;
}

export interface RunningPresence {
  uid: string;
  sessionId: string;
  startedAt: string;
  lastBeatAt: string;
  displayName: string;
  avatarEmoji?: string;
  cheeredByMe: boolean;
}

export interface LiveRunCheer {
  id: string;
  senderId: string;
  senderName: string;
  receivedAt: string;
}

export interface User {
  id: string;
  authId: string;
  name: string;
  avatarEmoji?: string;
  plan: Plan;
  role?: 'admin';
  createdAt: string;
  titles?: UserTitle[];
  battleIds: string[];   // 未参加なら [] （authListener が常に配列を返す）
  totalDistanceKm?: number;
  activityCount?: number;
  weeklyGoal?: WeeklyGoal | null;
  personalRecords?: PersonalRecords;
  /** 走行中であることだけを同じチャレンジの参加者へ公開する。既定OFF。 */
  runningPresenceVisible: boolean;
}

export interface Event {
  id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  isOfficial: boolean;
  createdBy: string;
  thumbnailUrl?: string;
  // 派生データ
  participatingTeamCount?: number;
  isJoined?: boolean;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  timestamp: number; // Unix ms
  /** 水平精度（m）。端末から取得できた場合のみ */
  accuracy?: number;
  /** 高度（m）。取得できた場合のみ */
  alt?: number;
  /** 高度の精度（m）。端末から取得できた場合のみ */
  altitudeAccuracy?: number;
  /** 一時停止から再開した直後の点。前の点との間は距離・時間とも集計しない */
  seg?: true;
}

export type GpsPointSource = 'warmup' | 'foreground' | 'background';

/** 記録開始時から5秒以内の場合だけ最初の基準点として使う。 */
export interface GpsWarmupSeed {
  point: RoutePoint;
  warmupDurationMs: number;
  readyAccuracyM: number;
}

/** ラン開始前に設定する任意目標 */
export interface RunGoal {
  type: 'distance' | 'duration';
  /** distance なら km、duration なら秒 */
  value: number;
}

export interface Activity {
  id: string;
  userId: string;
  eventId?: string;
  distanceKm: number;
  steps?: number;
  durationSeconds: number;
  measurementType: MeasurementType;
  route?: RoutePoint[];
  startedAt: string;
  endedAt: string;
  /** 活動開始時の端末IANAタイムゾーン。旧キューでは未設定の場合がある。 */
  timezone?: string;
  /** 一時停止していた合計時間（ms）。durationSeconds には含まれない */
  pausedMs?: number;
  /** GPS距離処理方式。未設定は旧方式のオフライン記録としてサーバー互換処理を行う。 */
  gpsProcessingVersion?: number;
  /** 座標を含まない活動単位のGPS品質集計。正式距離の計算には使わない。 */
  gpsQuality?: GpsQualitySummary;
  /** この活動によって更新された自己ベスト。サーバー集計後に設定される */
  newRecords?: PersonalRecordKey[];
}

// ===== v2.0 型定義 =====

export interface Season {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: 'active' | 'archived';
}

/** バトル内の区分（チーム戦の陣営、公開バトルの選択肢） */
export interface Category {
  id: string;    // FirestoreドキュメントのサブコレクションIDとして使用
  label: string; // 表示名（例: "きのこの山"、"さそり座"）
}

export interface Battle {
  id: string;
  type: 'public' | 'private';
  status: 'upcoming' | 'active' | 'finished';
  title: string;
  description: string;
  categories: Category[];      // 陣営の一覧（最低2つ）
  rankingType: 'average' | 'total';
  inviteCode: string | null;   // privateのみ6桁英数字、publicはnull
  createdBy: string | null;    // privateは作成者uid、publicは管理者uid
  seasonId: string | null;     // publicバトルが属するシーズン（任意、なければnull）
  startAt: string;
  endAt: string;
}

/** battles/{battleId}/participants/{uid} の型 */
export interface BattleParticipation {
  battleId: string;
  categoryId: string | null; // 参加中の陣営ID（常に設定される）
}

/** battles/{battleId}/category_stats/{categoryId} の型（表示用にlabelを結合） */
export interface CategoryStats {
  categoryId: string;
  label: string;
  totalDistanceKm: number;
  avgDistanceKm: number;
  participantCount: number;
}

export interface UserTitle {
  seasonId: string;
  battleId: string;
  battleTitle: string;
  teamName: string;
  rank: number;
  awardedAt: string;
}

// ===== 通知 =====

export type NotificationType =
  | 'rank_change'           // 自分の陣営順位変動
  | 'battle_end_soon'       // バトル終了前（24h / 1h）
  | 'title_earned'          // 称号獲得
  | 'battle_ended'          // バトル終了
  | 'reaction'              // 自分の記録にリアクション
  | 'declaration_cheer'     // ラン宣言への応援
  | 'presence_cheer'        // 記録中に届いたライブ応援
  | 'battle_title_rejected'; // バトル名NGワードによる強制終了

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  relatedBattleId?: string;
  relatedActivityId?: string;
  createdAt: string;
}

// ===== リアクション =====

export type ReactionType = '👏' | '🔥' | '💪' | '⚡';

export interface Reaction {
  userId: string;
  type: ReactionType;
  createdAt: string;
}

// ===== バッジ =====

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  condition: (stats: UserActivityStats) => boolean;
  progress?: (stats: UserActivityStats) => { current: number; target: number; unit: string };
}

export interface UserActivityStats {
  totalDistanceKm: number;
  activityCount: number;
  monthlyDistanceKm: number;
  consecutiveDays: number;
  earlyMorningCount: number;
  stepsModeCount: number;
  earnedBadgeIds: string[];
}

export interface EarnedBadge {
  badgeId: string;
  earnedAt: string;
}

// Zustand Store の型
export interface RecordStore {
  isRecording: boolean;
  isPaused: boolean;
  pauseKind: PauseKind;
  autoPauseEnabled: boolean;
  measurementType: MeasurementType;
  distanceKm: number;
  steps: number;
  durationSeconds: number;
  route: RoutePoint[];
  goal: RunGoal | null;
  startRecording: (type: MeasurementType, goal?: RunGoal | null, warmupSeed?: GpsWarmupSeed | null) => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  setAutoPauseEnabled: (enabled: boolean) => void;
  stopRecording: () => Promise<Activity>;
  reset: () => void;
}

export interface AuthStore {
  user: User | null;
  isLoading: boolean;
  /** Firebase Auth のセッション自体は有効か。Firestoreプロフィール取得失敗とログアウトを区別する。 */
  authSessionActive: boolean;
  /** 認証済みプロフィールを読み込めなかった場合の復旧可能なエラー。 */
  profileError: string | null;
  // RevenueCatの`pro` entitlementがアクティブかどうか（Firestoreのplanとは別管理）
  proEntitlement: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  setProEntitlement: (active: boolean) => void;
  setWeeklyGoal: (goal: WeeklyGoal | null) => Promise<void>;
  setRunningPresenceVisible: (visible: boolean) => Promise<void>;
}
