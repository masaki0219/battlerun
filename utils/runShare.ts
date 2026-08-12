import { LEGAL_URLS } from '../lib/legal';
import { formatRunDistanceKm } from './displayStats';
import type { AppLanguage } from '../lib/language';
import { translateIn } from '../lib/translate';

export const ZELIO_DISCOVERY_URL = LEGAL_URLS.support;

export interface RunShareMessageInput {
  distanceKm: number;
  durationSeconds: number;
  pace?: string | null;
  dateLabel?: string | null;
  impactLabel?: string | null;
  language: AppLanguage;
}

export function formatShareDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function usablePace(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && !normalized.includes('--') ? normalized : null;
}

/** SNS共有とテキスト共有のどちらでも同じ訴求・発見URLを使う。 */
export function buildRunShareMessage(input: RunShareMessageInput): string {
  const { language } = input;
  const safeDistance = Number.isFinite(input.distanceKm) ? Math.max(0, input.distanceKm) : 0;
  const title = input.dateLabel?.trim() || translateIn(language, 'summary.shareToday');
  const pace = usablePace(input.pace);
  const statParts = [translateIn(language, 'summary.shareTime', { duration: formatShareDuration(input.durationSeconds) })];
  if (pace) statParts.push(translateIn(language, 'summary.sharePace', { pace }));

  const lines = [
    translateIn(language, 'summary.shareRunLine', { date: title, distance: formatRunDistanceKm(safeDistance) }),
    statParts.join(translateIn(language, 'summary.separator')),
  ];
  if (input.impactLabel?.trim()) lines.push(input.impactLabel.trim());
  lines.push('#ZELIO', translateIn(language, 'summary.shareMessageTagline'), ZELIO_DISCOVERY_URL);
  return lines.join('\n');
}
