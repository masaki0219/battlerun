/**
 * フォームの YYYY-MM-DD 文字列とローカル日付の相互変換ヘルパー。
 * チャレンジ期間は端末のローカルタイムゾーンで解釈する
 * （new Date('YYYY-MM-DD') の UTC 解釈だと JST では締切が朝9:00になるため使わない）。
 */

export function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Date → 'YYYY-MM-DD'（ローカル日付） */
export function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 'YYYY-MM-DD' → ローカルタイムの Date。無効な形式・存在しない日付（2/30等）は null。
 * endOfDay 指定時は 23:59:59.999（終了日の締切用）。
 */
export function parseLocalDate(value: string, endOfDay = false): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }
  return parsed;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
