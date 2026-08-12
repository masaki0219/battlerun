const NOTIFICATION_ENTITY_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Push payload由来の値を画面パスへ連結する前にFirestore document IDとして検証する。 */
export function notificationEntityId(value: unknown): string | null {
  return typeof value === 'string' && NOTIFICATION_ENTITY_ID.test(value) ? value : null;
}
