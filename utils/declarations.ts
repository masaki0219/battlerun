function localCalendarDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function isValidTimeZone(timezone: string): boolean {
  if (!timezone || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** 端末のIANAタイムゾーン。取得できない環境ではUTCへ安全にフォールバックする。 */
export function deviceTimeZone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone && isValidTimeZone(timezone)) return timezone;
  } catch {
    // Intlが限定的な実行環境ではUTCを使う。
  }
  return 'UTC';
}

/** 指定した瞬間をIANAタイムゾーンのカレンダー日へ変換する。 */
export function dateKeyAtTimeZone(date: Date, timezone: string): string {
  if (Number.isNaN(date.getTime())) return '';
  if (!isValidTimeZone(timezone)) return localCalendarDateKey(date);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values['year'] && values['month'] && values['day']) {
      return `${values['year']}${values['month']}${values['day']}`;
    }
  } catch {
    // 下の端末ローカル日付へフォールバックする。
  }
  return localCalendarDateKey(date);
}

export function localDateKey(date: Date = new Date()): string {
  return dateKeyAtTimeZone(date, deviceTimeZone());
}

export const DECLARATION_RETENTION_MS = 48 * 60 * 60 * 1_000;

export function declarationDocumentId(
  userId: string,
  date: Date = new Date(),
  timezone: string = deviceTimeZone(),
): string {
  return `${userId}_${dateKeyAtTimeZone(date, timezone)}`;
}

/** 世界中のどのIANAタイムゾーンでも、同じ瞬間の日付はUTC日付の前後1日以内に収まる。 */
export function candidateDeclarationDateKeys(date: Date): string[] {
  if (Number.isNaN(date.getTime())) return [];
  const dayMs = 24 * 60 * 60 * 1_000;
  return [...new Set([-dayMs, 0, dayMs].map((offset) => dateKeyAtTimeZone(
    new Date(date.getTime() + offset),
    'UTC',
  )))];
}

export function declarationMatchesActivityStart(params: {
  dateKey: string;
  timezone?: string;
  activityStartedAt: Date;
  fallbackTimezone?: string;
}): boolean {
  const timezone = params.timezone && isValidTimeZone(params.timezone)
    ? params.timezone
    : params.fallbackTimezone && isValidTimeZone(params.fallbackTimezone)
      ? params.fallbackTimezone
      : deviceTimeZone();
  return dateKeyAtTimeZone(params.activityStartedAt, timezone) === params.dateKey;
}

export function shouldCompleteDeclaration(params: {
  status: string;
  dateKey: string;
  timezone?: string;
  activityStartedAt: Date;
  fallbackTimezone?: string;
}): boolean {
  return params.status === 'planned' && declarationMatchesActivityStart(params);
}

export function cheerCountAfterCreate(currentCount: number, created: boolean): number {
  return Math.max(0, Math.floor(currentCount)) + (created ? 1 : 0);
}

export function isVisibleTodayDeclarationStatus(status: string): boolean {
  return status === 'planned' || status === 'done';
}

export function declarationTimeLabel(iso: string, timezone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (timezone && isValidTimeZone(timezone)) {
    try {
      const parts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      if (values['hour'] && values['minute']) return `${values['hour']}:${values['minute']}ごろ`;
    } catch {
      // 旧データと同じ端末ローカル表示へフォールバックする。
    }
  }
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}ごろ`;
}
