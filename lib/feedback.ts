import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { AppLanguage } from './language';
import { translateIn } from './translate';

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

export async function submitFeedback(params: { rating: number; message: string }, language: AppLanguage): Promise<void> {
  if (!isFeedbackConfigured()) {
    throw new Error(translateIn(language, 'feedback.notConfigured'));
  }
  const rating = Math.trunc(params.rating);
  if (rating < 1 || rating > 5) {
    throw new Error(translateIn(language, 'feedback.invalidRating'));
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
    throw new Error(translateIn(language, 'feedback.networkFailed'));
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(translateIn(language, 'feedback.statusFailed', { status: res.status }));
  }
}
