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
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Battle } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isQuietHours } from '../utils/notificationTiming';

const DECLARATION_REMINDERS_KEY = '@battlerun_declaration_reminders_v1';

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

  const projectId =
    (Constants.expoConfig?.extra as Record<string, any>)?.eas?.projectId as string | undefined;
  if (!projectId) {
    console.warn('[Notifications] EAS projectId が未設定のため Push Token を取得できません');
    return false;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await updateDoc(doc(db, 'users', userId), { expoPushToken: token });
    return true;
  } catch (e) {
    console.warn('[Notifications] Push Token の取得・保存に失敗:', e);
    return false;
  }
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
        title: 'チャレンジ終了まで24時間',
        body: `「${battle.title}」は明日終了します。参加できるタイミングがあれば、いつものペースでどうぞ。`,
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
        title: 'チャレンジ終了まで1時間',
        body: `「${battle.title}」はまもなく終了します。これまでのランが記録されています。`,
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

/** ラン宣言時刻のリマインド。宣言ごとに一度だけ、静音時間外に限り登録する。 */
export async function scheduleDeclarationReminder(params: {
  declarationId: string;
  battleId: string;
  plannedAt: Date;
}): Promise<string | null> {
  if (params.plannedAt <= new Date() || isQuietHours(params.plannedAt)) return null;
  const reminders = await declarationReminderMap();
  const reminderKey = `${params.battleId}/${params.declarationId}`;
  if (reminders[reminderKey]) return reminders[reminderKey];
  if (!(await requestNotificationPermission())) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '宣言した時間になりました',
        body: '準備ができたらスタート！',
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
    await AsyncStorage.setItem(DECLARATION_REMINDERS_KEY, JSON.stringify(reminders));
    return id;
  } catch (error) {
    console.warn('[Notifications] 宣言リマインドの登録に失敗:', error);
    return null;
  }
}

/** スケジュール済みの通知をキャンセルする */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {});
}

/** 全スケジュール済み通知を取得する（デバッグ用） */
export async function getScheduledNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}
