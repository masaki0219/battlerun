// BattleRun 型定義
// このファイルの型をアプリ全体で使うこと

export type Plan = 'free' | 'pro';
export type MeasurementType = 'gps' | 'steps';

export interface User {
  id: string;
  authId: string;
  name: string;
  avatarUrl?: string;
  avatarEmoji?: string;
  plan: Plan;
  role?: 'admin';
  createdAt: string;
  titles?: UserTitle[];
  battleIds: string[];   // 未参加なら [] （authListener が常に配列を返す）
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
  mode: 'team' | 'individual'; // team=区分選択あり、individual=個人戦
  status: 'upcoming' | 'active' | 'finished';
  title: string;
  description: string;
  categories: Category[];      // teamモードのみ使用。individualモードは空配列
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
  categoryId: string | null; // individualモードはnull
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

// ===== テーマ =====

export type BattleTheme =
  | 'sports'
  | 'rpg'
  | 'territory'
  | 'cyber'
  | 'casual'
  | 'school'
  | 'corporate';

// Zustand Store の型
export interface RecordStore {
  isRecording: boolean;
  measurementType: MeasurementType;
  distanceKm: number;
  steps: number;
  durationSeconds: number;
  route: RoutePoint[];
  startRecording: (type: MeasurementType) => void;
  stopRecording: () => Promise<Activity>;
  reset: () => void;
}

export interface AuthStore {
  user: User | null;
  isLoading: boolean;
  // RevenueCatの`pro` entitlementがアクティブかどうか（Firestoreのplanとは別管理）
  proEntitlement: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  setProEntitlement: (active: boolean) => void;
}
