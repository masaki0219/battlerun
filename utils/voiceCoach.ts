import type { AppLanguage } from '../lib/language';
import { translateIn } from '../lib/translate';

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
  // 初回ランで予期せず音声が出ないよう、利用者が明示的に有効化する。
  enabled: false,
  intervalType: 'distance',
  distanceKm: 1,
  timeMinutes: 5,
  announceElapsed: false,
  announceDistance: true,
  announceLapPace: false,
  announceAveragePace: true,
};

function spokenDuration(totalSeconds: number, language: AppLanguage): string {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(translateIn(language, 'voice.hours', { count: hours }));
  if (minutes > 0) parts.push(translateIn(language, 'voice.minutes', { count: minutes }));
  if (seconds > 0 || parts.length === 0) parts.push(translateIn(language, 'voice.seconds', { count: seconds }));
  return parts.join(language === 'ja' ? '' : ' ');
}

export function spokenPace(secondsPerKm: number, language: AppLanguage): string | null {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return null;
  const rounded = Math.round(secondsPerKm);
  return translateIn(language, 'voice.pace', {
    minutes: Math.floor(rounded / 60),
    seconds: rounded % 60,
  });
}

export function buildVoiceCoachAnnouncement(
  settings: VoiceCoachSettings,
  values: {
    elapsedSeconds: number;
    distanceKm: number;
    lapElapsedSeconds: number;
    lapDistanceKm: number;
  },
  language: AppLanguage,
): string {
  const parts: string[] = [];
  if (settings.announceElapsed) parts.push(translateIn(language, 'voice.elapsed', { value: spokenDuration(values.elapsedSeconds, language) }));
  if (settings.announceDistance) parts.push(translateIn(language, 'voice.distance', { value: values.distanceKm.toFixed(2) }));
  if (settings.announceLapPace) {
    const pace = spokenPace(values.lapElapsedSeconds / values.lapDistanceKm, language);
    if (pace) parts.push(translateIn(language, 'voice.lapPace', { value: pace }));
  }
  if (settings.announceAveragePace) {
    const pace = spokenPace(values.elapsedSeconds / values.distanceKm, language);
    if (pace) parts.push(translateIn(language, 'voice.averagePace', { value: pace }));
  }
  return parts.join(translateIn(language, 'voice.separator'));
}
