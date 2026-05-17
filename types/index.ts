// BattleRun 型定義
// このファイルの型をアプリ全体で使うこと

export type Plan = 'free' | 'pro';
export type MeasurementType = 'gps' | 'steps';

export interface User {
  id: string;
  authId: string;
  name: string;
  avatarUrl?: string;
  plan: Plan;
  createdAt: string;
  titles?: UserTitle[];
}

export interface Team {
  id: string;
  name: string;
  inviteCode: string;
  isPublic: boolean;
  createdBy: string;
  createdAt: string;
  // Joinして取得
  totalDistanceKm?: number;
  memberCount?: number;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  joinedAt: string;
  // Joinして取得
  user?: User;
  totalDistanceKm?: number;
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
  teamId: string;
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

export interface BattleTeam {
  teamId: string;
  name: string;
}

export interface Battle {
  id: string;
  type: 'public' | 'private';
  seasonId: string | null;
  title: string;
  description: string;
  teams: BattleTeam[];
  rankingType: 'average' | 'total';
  startAt: string;
  endAt: string;
  status: 'upcoming' | 'active' | 'finished';
  createdBy: string;
  inviteCode: string | null;
  // 派生データ（参加状態）
  myTeamId?: string;
}

export interface BattleStats {
  id: string;             // battleId_teamId
  battleId: string;
  teamId: string;
  teamName: string;
  totalDistanceKm: number;
  memberCount: number;
  avgDistanceKm: number;
}

export interface UserTitle {
  seasonId: string;
  battleId: string;
  battleTitle: string;
  teamName: string;
  rank: number;
  awardedAt: string;
}

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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export interface TeamStore {
  currentTeam: Team | null;
  members: TeamMember[];
  setTeam: (team: Team) => void;
  fetchMembers: (teamId: string) => Promise<void>;
}
