/**
 * Keeps app-authored validation messages, while preventing Firebase/Functions
 * implementation details (which may be in a different language) from reaching UI.
 */
export function userFacingError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;

  const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && code.length > 0) return fallback;

  const message = 'message' in error ? (error as { message?: unknown }).message : undefined;
  return typeof message === 'string' && message.trim().length > 0 ? message : fallback;
}
