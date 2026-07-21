import { Platform } from 'react-native';
import Constants from 'expo-constants';

// 全アプリ共通のSupabase受信箱（feedbacksテーブル）へ評価・ご要望をinsertする。
// anonキーはINSERTのみ許可のRLS前提。読み取りは運営がダッシュボードから行う。
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const APP_ID = 'zelio';
const REQUEST_TIMEOUT_MS = 15000;

export const FEEDBACK_MESSAGE_MAX = 1000;

export function isFeedbackConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

export async function submitFeedback(params: { rating: number; message: string }): Promise<void> {
  if (!isFeedbackConfigured()) {
    throw new Error('フィードバックの送信先が設定されていません。');
  }
  const rating = Math.trunc(params.rating);
  if (rating < 1 || rating > 5) {
    throw new Error('評価は1〜5で選択してください。');
  }
  const message = params.message.trim().slice(0, FEEDBACK_MESSAGE_MAX);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/feedbacks`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        app_id: APP_ID,
        source: 'settings',
        rating,
        message: message.length > 0 ? message : null,
        app_version: Constants.expoConfig?.version ?? null,
        os: Platform.OS,
        screen_name: 'help',
      }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error('送信できませんでした。通信環境を確認して、もう一度お試しください。');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`送信に失敗しました（${res.status}）。時間をおいて、もう一度お試しください。`);
  }
}
