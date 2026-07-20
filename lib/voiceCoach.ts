import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_VOICE_COACH_SETTINGS,
  type VoiceCoachSettings,
} from '../utils/voiceCoach';

const VOICE_COACH_SETTINGS_KEY = '@battlerun_voice_coach_settings_v1';

function isSettings(value: unknown): value is VoiceCoachSettings {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<VoiceCoachSettings>;
  return typeof item.enabled === 'boolean'
    && (item.intervalType === 'distance' || item.intervalType === 'time')
    && (item.distanceKm === 0.5 || item.distanceKm === 1 || item.distanceKm === 2)
    && (item.timeMinutes === 5 || item.timeMinutes === 10)
    && typeof item.announceElapsed === 'boolean'
    && typeof item.announceDistance === 'boolean'
    && typeof item.announceLapPace === 'boolean'
    && typeof item.announceAveragePace === 'boolean';
}

export async function loadVoiceCoachSettings(): Promise<VoiceCoachSettings> {
  try {
    const raw = await AsyncStorage.getItem(VOICE_COACH_SETTINGS_KEY);
    if (!raw) return DEFAULT_VOICE_COACH_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    return isSettings(parsed) ? parsed : DEFAULT_VOICE_COACH_SETTINGS;
  } catch {
    return DEFAULT_VOICE_COACH_SETTINGS;
  }
}

export async function saveVoiceCoachSettings(settings: VoiceCoachSettings): Promise<void> {
  await AsyncStorage.setItem(VOICE_COACH_SETTINGS_KEY, JSON.stringify(settings));
}
