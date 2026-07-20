export type VoiceCoachIntervalType = 'distance' | 'time';
export type VoiceCoachDistanceKm = 0.5 | 1 | 2;
export type VoiceCoachTimeMinutes = 5 | 10;

export interface VoiceCoachSettings {
  enabled: boolean;
  intervalType: VoiceCoachIntervalType;
  distanceKm: VoiceCoachDistanceKm;
  timeMinutes: VoiceCoachTimeMinutes;
  announceElapsed: boolean;
  announceDistance: boolean;
  announceLapPace: boolean;
  announceAveragePace: boolean;
}

export const DEFAULT_VOICE_COACH_SETTINGS: VoiceCoachSettings = {
  enabled: true,
  intervalType: 'distance',
  distanceKm: 1,
  timeMinutes: 5,
  announceElapsed: false,
  announceDistance: true,
  announceLapPace: false,
  announceAveragePace: true,
};

function spokenDuration(totalSeconds: number): string {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}時間`);
  if (minutes > 0) parts.push(`${minutes}分`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}秒`);
  return parts.join('');
}

export function spokenPace(secondsPerKm: number): string | null {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return null;
  const rounded = Math.round(secondsPerKm);
  return `キロ ${Math.floor(rounded / 60)}分${rounded % 60}秒`;
}

export function buildVoiceCoachAnnouncement(
  settings: VoiceCoachSettings,
  values: {
    elapsedSeconds: number;
    distanceKm: number;
    lapElapsedSeconds: number;
    lapDistanceKm: number;
  },
): string {
  const parts: string[] = [];
  if (settings.announceElapsed) parts.push(`経過時間、${spokenDuration(values.elapsedSeconds)}`);
  if (settings.announceDistance) parts.push(`距離、${values.distanceKm.toFixed(2)}キロメートル`);
  if (settings.announceLapPace) {
    const pace = spokenPace(values.lapElapsedSeconds / values.lapDistanceKm);
    if (pace) parts.push(`直近ラップペース、${pace}`);
  }
  if (settings.announceAveragePace) {
    const pace = spokenPace(values.elapsedSeconds / values.distanceKm);
    if (pace) parts.push(`平均ペース、${pace}`);
  }
  return parts.join('。');
}
