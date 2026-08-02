import { LEGAL_URLS } from '../lib/legal';

export const ZELIO_DISCOVERY_URL = LEGAL_URLS.marketing;

export interface RunShareMessageInput {
  distanceKm: number;
  durationSeconds: number;
  pace?: string | null;
  dateLabel?: string | null;
  impactLabel?: string | null;
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
  const safeDistance = Number.isFinite(input.distanceKm) ? Math.max(0, input.distanceKm) : 0;
  const title = input.dateLabel?.trim() || '今日';
  const pace = usablePace(input.pace);
  const statParts = [`タイム ${formatShareDuration(input.durationSeconds)}`];
  if (pace) statParts.push(`平均ペース ${pace}/km`);

  const lines = [
    `${title}のラン: ${safeDistance.toFixed(1)}km`,
    statParts.join(' ・ '),
  ];
  if (input.impactLabel?.trim()) lines.push(input.impactLabel.trim());
  lines.push('#ZELIO', '仲間と走ると、もっと続く。', ZELIO_DISCOVERY_URL);
  return lines.join('\n');
}
