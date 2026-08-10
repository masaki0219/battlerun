/**
 * Firebase Auth のエラーを日本語のユーザー向け文言へ変換する。
 * `e.message` をそのまま出すと「Firebase: Error (auth/invalid-credential).」のような
 * 英語の生メッセージが日本語UIに出てしまうため、必ずこの関数を通す。
 */
const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'メールアドレスまたはパスワードが正しくありません。',
  'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
  'auth/user-not-found': 'このメールアドレスのアカウントは見つかりませんでした。',
  'auth/wrong-password': 'パスワードが正しくありません。',
  'auth/user-disabled': 'このアカウントは現在利用できません。お問い合わせください。',
  'auth/too-many-requests': '試行回数が多いため、一時的に制限されています。しばらく待ってからお試しください。',
  'auth/network-request-failed': '通信に失敗しました。電波状況を確認して、もう一度お試しください。',
  'auth/email-already-in-use': 'このメールアドレスは既に登録されています。ログインをお試しください。',
  'auth/weak-password': 'パスワードは6文字以上で設定してください。',
  'auth/operation-not-allowed': 'この方法でのログインは現在利用できません。',
  'auth/requires-recent-login': '安全のため、もう一度ログインしてからお試しください。',
  'auth/user-mismatch': '同じメールアドレスのアカウントを選んでください。',
  'auth/credential-already-in-use': 'このログイン方法は別のアカウントで既に使用されています。',
  'auth/provider-already-linked': 'このログイン方法は既に連携されています。',
};

export function authErrorMessage(error: unknown, fallback = '時間をおいて、もう一度お試しください。'): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === 'string' && MESSAGES[code]) return MESSAGES[code];
  return fallback;
}
