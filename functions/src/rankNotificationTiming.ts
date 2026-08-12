function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function fallbackTimeZone(market: unknown): string {
  if (market === 'JP') return 'Asia/Tokyo';
  if (market === 'US') return 'America/New_York';
  return 'UTC';
}

export function notificationTimeZone(
  user: Record<string, unknown>,
  battleMarket?: unknown,
): string {
  return validTimeZone(user['timezone'])
    ? user['timezone']
    : fallbackTimeZone(user['market'] ?? battleMarket);
}

export function notificationLocalState(
  date: Date,
  timezone: string,
): { dateKey: string; quietHours: boolean } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: validTimeZone(timezone) ? timezone : 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values['hour']);
  return {
    dateKey: `${values['year']}-${values['month']}-${values['day']}`,
    quietHours: hour >= 22 || hour < 7,
  };
}
