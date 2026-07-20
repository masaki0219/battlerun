/** 22:00以上または7:00未満は通知しない。端末のローカル時刻で判定する。 */
export function isQuietHours(date: Date): boolean {
  const hour = date.getHours();
  return hour >= 22 || hour < 7;
}
