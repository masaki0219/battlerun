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
export async function registerPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  const projectId =
    (Constants.expoConfig?.extra as Record<string, any>)?.eas?.projectId as string | undefined;
  if (!projectId) {
    console.warn('[Notifications] EAS projectId が未設定のため Push Token を取得できません');
    return;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await updateDoc(doc(db, 'users', userId), { expoPushToken: token });
  } catch (e) {
    console.warn('[Notifications] Push Token の取得・保存に失敗:', e);
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

  if (notifyAt <= new Date()) return null; // 既に通知タイミングを過ぎている

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🏃 チャレンジ終了まで24時間！',
        body: `「${battle.title}」の終了が近づいています。最後の追い込みを！`,
        data: { battleId: battle.id },
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
  if (notifyAt <= new Date()) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚡ チャレンジ終了まで1時間！',
        body: `「${battle.title}」があと1時間で終了します。最後の一走りを！`,
        data: { battleId: battle.id },
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

/** スケジュール済みの通知をキャンセルする */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {});
}

/** 全スケジュール済み通知を取得する（デバッグ用） */
export async function getScheduledNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Firestoreに通知を書き込む汎用ユーティリティ
 * バトル終了・称号獲得・順位変動・リアクションなどに使用
 */
export async function writeFirestoreNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedBattleId?: string;
  relatedActivityId?: string;
}): Promise<void> {
  try {
    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('./firebase');
    await addDoc(collection(db, 'users', params.userId, 'notifications'), {
      type: params.type,
      title: params.title,
      body: params.body,
      isRead: false,
      relatedBattleId: params.relatedBattleId ?? null,
      relatedActivityId: params.relatedActivityId ?? null,
      createdAt: serverTimestamp(),
    });
  } catch {
    // サイレント失敗
  }
}

/**
 * バトル終了通知をFirestoreに書き込む
 * Cloud FunctionsがないためクライアントからFreeで全参加者に送信する
 */
export async function notifyBattleEnded(params: {
  battleId: string;
  battleTitle: string;
  participantIds: string[];
}): Promise<void> {
  await Promise.all(
    params.participantIds.map((uid) =>
      writeFirestoreNotification({
        userId: uid,
        type: 'battle_ended',
        title: `「${params.battleTitle}」が終了しました`,
        body: '最終結果を確認しましょう！',
        relatedBattleId: params.battleId,
      })
    )
  );
}

/**
 * 順位変動通知をFirestoreに書き込む
 * saveActivityToFirestore 後に category_stats 再取得して前後比較で呼ぶ
 */
export async function notifyRankChange(params: {
  userId: string;
  battleId: string;
  battleTitle: string;
  newRank: number;
  oldRank: number;
}): Promise<void> {
  if (params.newRank === params.oldRank) return;
  const up = params.newRank < params.oldRank;
  await writeFirestoreNotification({
    userId: params.userId,
    type: 'rank_change',
    title: up
      ? `あなたのチームが${params.newRank}位に上昇しました！`
      : `あなたのチームが${params.newRank}位に下降しました`,
    body: `「${params.battleTitle}」での順位変動です`,
    relatedBattleId: params.battleId,
  });
}

/**
 * リアクション通知をFirestoreに書き込む
 * activity/[id].tsx でリアクション保存時に呼ぶ
 */
export async function notifyReaction(params: {
  activityOwnerId: string;
  reactorName: string;
  activityId: string;
  reactionType: string;
}): Promise<void> {
  await writeFirestoreNotification({
    userId: params.activityOwnerId,
    type: 'reaction',
    title: `${params.reactorName}さんがリアクションしました`,
    body: `あなたの記録に ${params.reactionType} がつきました`,
    relatedActivityId: params.activityId,
  });
}
