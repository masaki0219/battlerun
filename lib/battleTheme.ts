import type { BattleTheme } from '../types';

export interface ThemeTokens {
  primary: string;
  primaryDeep: string;
  accent: string;
  bg: string;
  surfaceCard: string;
  headerBg: string;
  rankLabel: string;      // "RANK" / "STAGE" / etc.
  teamLabel: string;      // "TEAM" / "GUILD" / etc.
  battleLabel: string;    // "BATTLE" / "QUEST" / etc.
  vsLabel: string;        // "VS" / "vs" / "対決" / etc.
}

const THEME_MAP: Record<BattleTheme, ThemeTokens> = {
  sports: {
    primary:    '#00D9A3',
    primaryDeep:'#06B189',
    accent:     '#FF5C2B',
    bg:         '#F4F2EC',
    surfaceCard:'#FFFFFF',
    headerBg:   '#0A0E1A',
    rankLabel:  'RANK',
    teamLabel:  'TEAM',
    battleLabel:'BATTLE',
    vsLabel:    'VS',
  },
  rpg: {
    primary:    '#7C3AED',
    primaryDeep:'#6D28D9',
    accent:     '#F59E0B',
    bg:         '#F5F3FF',
    surfaceCard:'#FFFFFF',
    headerBg:   '#2E1065',
    rankLabel:  'STAGE',
    teamLabel:  'GUILD',
    battleLabel:'QUEST',
    vsLabel:    'vs',
  },
  territory: {
    primary:    '#EF4444',
    primaryDeep:'#DC2626',
    accent:     '#1D4ED8',
    bg:         '#FEF2F2',
    surfaceCard:'#FFFFFF',
    headerBg:   '#7F1D1D',
    rankLabel:  '陣地',
    teamLabel:  '軍',
    battleLabel:'合戦',
    vsLabel:    '対',
  },
  cyber: {
    primary:    '#06B6D4',
    primaryDeep:'#0891B2',
    accent:     '#A855F7',
    bg:         '#0F172A',
    surfaceCard:'#1E293B',
    headerBg:   '#0F172A',
    rankLabel:  'SCORE',
    teamLabel:  'UNIT',
    battleLabel:'MISSION',
    vsLabel:    'VS',
  },
  casual: {
    primary:    '#F59E0B',
    primaryDeep:'#D97706',
    accent:     '#10B981',
    bg:         '#FFFBEB',
    surfaceCard:'#FFFFFF',
    headerBg:   '#92400E',
    rankLabel:  '順位',
    teamLabel:  'チーム',
    battleLabel:'イベント',
    vsLabel:    'vs',
  },
  school: {
    primary:    '#3B82F6',
    primaryDeep:'#2563EB',
    accent:     '#EF4444',
    bg:         '#EFF6FF',
    surfaceCard:'#FFFFFF',
    headerBg:   '#1E3A8A',
    rankLabel:  '順位',
    teamLabel:  'チーム',
    battleLabel:'大会',
    vsLabel:    'vs',
  },
  corporate: {
    primary:    '#475569',
    primaryDeep:'#334155',
    accent:     '#0EA5E9',
    bg:         '#F8FAFC',
    surfaceCard:'#FFFFFF',
    headerBg:   '#0F172A',
    rankLabel:  'RANK',
    teamLabel:  'DEPT',
    battleLabel:'EVENT',
    vsLabel:    'VS',
  },
};

export function getThemeTokens(theme?: BattleTheme | null): ThemeTokens {
  return THEME_MAP[theme ?? 'sports'] ?? THEME_MAP.sports;
}

/** Firestore の battle ドキュメントの theme フィールドを ThemeTokens に変換 */
export function themeFromDoc(data: Record<string, unknown>): ThemeTokens {
  return getThemeTokens((data['theme'] as BattleTheme | undefined) ?? 'sports');
}
