/**
 * プッシュ通知ユーティリティ
 *
 * 通知タイミング（実装済み）:
 *   1. チャレンジの終了24時間前（ローカル通知）
 *
 * 通知タイミング（TASK-18 / Cloud Functions 移行後に実装予定）:
 *   2. チームメンバーが走ったとき
 *   3. 順位が変動したとき
 *
 * ⚠️ 実機または EASビルドが必要。Expo Go では一部制限あり。
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { deleteField, doc, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Battle } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isQuietHours } from '../utils/notificationTiming';
import { translate } from './translate';

const DECLARATION_REMINDERS_KEY = '@battlerun_declaration_reminders_v1';
const EXPO_PUSH_TOKEN_KEY = '@battlerun_expo_push_token_v1';
export const DECLARATION_REMINDER_MIN_LEAD_MS = 15 * 60_000;

async function currentExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const current = await Notifications.getPermissionsAsync();
  if (current.status !== 'granted') return null;
  const projectId =
    (Constants.expoConfig?.extra as Record<string, any>)?.eas?.projectId as string | undefined;
  if (!projectId) return null;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

// フォアグラウンドでも通知を表示する
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** 通知権限をリクエストする。granted なら true を返す */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) {
    console.warn('[Notifications] 実機以外では通知を送信できません');
    return false;
  }

  const { status: current } = await Notifications.getPermissionsAsync();
  if (current === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Expo Push Token を取得して Firestore の users/{uid}.expoPushToken に保存する
 *
 * サーバーサイド（Cloud Functions）からプッシュ通知を送る際に使用する。
 */
export async function registerPushToken(userId: string, askPermission = false): Promise<boolean> {
  if (!Device.isDevice) return false;
  const current = await Notifications.getPermissionsAsync();
  const granted = current.status === 'granted'
    ? true
    : askPermission ? await requestNotificationPermission() : false;
  if (!granted) return false;

  try {
    const token = await currentExpoPushToken();
    if (!token) {
      console.warn('[Notifications] EAS projectId または通知権限がないため Push Token を取得できません');
      return false;
    }
    // ログアウト時にExpoへ再問い合わせせず、この端末のtokenだけを削除できるよう保持する。
    await AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, token).catch((error) => {
      console.warn('[Notifications] Push Token の端末保存に失敗:', error);
    });
    await updateDoc(doc(db, 'users', userId), { expoPushToken: token });
    return true;
  } catch (e) {
    console.warn('[Notifications] Push Token の取得・保存に失敗:', e);
    return false;
  }
}

/** 保存値がこの端末のtokenと一致する場合だけ削除し、別端末のtokenを消さない。 */
export async function removeCurrentPushTokenForSignOut(userId: string): Promise<void> {
  // getExpoPushTokenAsync() は通信待ちになるため、ログアウト経路では呼ばない。
  const token = await AsyncStorage.getItem(EXPO_PUSH_TOKEN_KEY).catch(() => null);
  if (!token) return;
  const userRef = doc(db, 'users', userId);
  await runTransaction(db, async (transaction) => {
    const user = await transaction.get(userRef);
    if (user.data()?.['expoPushToken'] === token) {
      transaction.update(userRef, { expoPushToken: deleteField() });
    }
  });
}

/**
 * ログアウト時に、この端末へ紐づいたリモート／ローカル通知を解除する。
 * Firestore のトークン削除は認証が必要なため authStore 側で先に行う。
 */
export async function clearDeviceNotificationsForSignOut(): Promise<void> {
  const results = await Promise.allSettled([
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
    Notifications.unregisterForNotificationsAsync(),
    AsyncStorage.removeItem(DECLARATION_REMINDERS_KEY),
    AsyncStorage.removeItem(EXPO_PUSH_TOKEN_KEY),
  ]);
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.warn('[Notifications] ログアウト時の通知解除に失敗:', result.reason);
    }
  });
}

/**
 * チャレンジ終了24時間前にローカル通知をスケジュールする
 *
 * @returns スケジュールされた通知ID（キャンセル時に使用）。スキップ時は null
 */
export async function scheduleBattleEndNotification(battle: Battle): Promise<string | null> {
  if (!battle.endAt) return null;

  const endTime = new Date(battle.endAt).getTime();
  const notifyAt = new Date(endTime - 24 * 60 * 60 * 1000); // 24時間前

  if (notifyAt <= new Date() || isQuietHours(notifyAt)) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: translate('push.battle24Title'),
        body: translate('push.battle24Body', { title: battle.title }),
        data: { relatedBattleId: battle.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notifyAt,
      },
    });
    return id;
  } catch (e) {
    console.warn('[Notifications] 通知スケジュールに失敗:', e);
    return null;
  }
}

/**
 * チャレンジ終了1時間前にローカル通知をスケジュールする
 */
export async function scheduleBattleEnd1hNotification(battle: Battle): Promise<string | null> {
  if (!battle.endAt) return null;
  const notifyAt = new Date(new Date(battle.endAt).getTime() - 60 * 60 * 1000);
  if (notifyAt <= new Date() || isQuietHours(notifyAt)) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: translate('push.battle1hTitle'),
        body: translate('push.battle1hBody', { title: battle.title }),
        data: { relatedBattleId: battle.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notifyAt,
      },
    });
  } catch {
    return null;
  }
}

async function declarationReminderMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(DECLARATION_REMINDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveDeclarationReminderMap(reminders: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(DECLARATION_REMINDERS_KEY, JSON.stringify(reminders));
}

/** ラン宣言時刻のリマインド。宣言ごとに一度だけ、静音時間外に限り登録する。 */
export async function scheduleDeclarationReminder(params: {
  declarationId: string;
  battleId: string;
  plannedAt: Date;
}): Promise<string | null> {
  if (
    params.plannedAt.getTime() - Date.now() <= DECLARATION_REMINDER_MIN_LEAD_MS
    || isQuietHours(params.plannedAt)
  ) return null;
  const reminders = await declarationReminderMap();
  const reminderKey = `${params.battleId}/${params.declarationId}`;
  if (reminders[reminderKey]) return reminders[reminderKey];
  if (!(await requestNotificationPermission())) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: translate('push.declarationTitle'),
        body: translate('push.declarationBody'),
        data: {
          type: 'declaration_reminder',
          openRecord: true,
          relatedBattleId: params.battleId,
          url: 'zelio://record',
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: params.plannedAt,
      },
    });
    reminders[reminderKey] = id;
    await saveDeclarationReminderMap(reminders);
    return id;
  } catch (error) {
    console.warn('[Notifications] 宣言リマインドの登録に失敗:', error);
    return null;
  }
}

/** 宣言の変更・取り消し時に、以前のリマインドだけを解除する。 */
export async function cancelDeclarationReminder(params: {
  declarationId: string;
  battleId: string;
}): Promise<void> {
  const reminders = await declarationReminderMap();
  const reminderKey = `${params.battleId}/${params.declarationId}`;
  const notificationId = reminders[reminderKey];
  if (notificationId) {
    await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {});
    delete reminders[reminderKey];
    await saveDeclarationReminderMap(reminders).catch((error) => {
      console.warn('[Notifications] 宣言リマインド情報の削除に失敗:', error);
    });
  }
}

export async function rescheduleDeclarationReminder(params: {
  declarationId: string;
  battleId: string;
  plannedAt: Date;
}): Promise<string | null> {
  await cancelDeclarationReminder(params);
  return scheduleDeclarationReminder(params);
}

/** スケジュール済みの通知をキャンセルする */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {});
}

/** 全スケジュール済み通知を取得する（デバッグ用） */
export async function getScheduledNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}
