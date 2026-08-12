import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendPushToToken } from './push';
import { notificationCopy, resolveUiLanguage } from './i18n';
import { notificationLocalState, notificationTimeZone } from './rankNotificationTiming';
export { notificationLocalState, notificationTimeZone } from './rankNotificationTiming';

// 1ユーザー・1バトルあたりのrank_change通知は現地日付で1日3回まで。
const MAX_DAILY_NOTIFY_COUNT = 3;

interface RankedCategory {
  categoryId: string;
  value: number;
  rank: number;
}

/**
 * 60分ごとに全activeバトルの陣営順位を計算し、前回スナップショット
 * （battle.lastRankSnapshot）と比較して順位変動を通知する。
 * battleStatusScheduler とは別関数として分離している。
 *
 * - 初回実行時（lastRankSnapshotが無い）は通知せずスナップショットのみ保存する
 * - 順位が変わった陣営には、比較や行動を煽らない中立的な更新通知を送る
 * - 1ユーザー・1バトルあたり現地日付で1日3回まで（participant上の状態で制御）
 */
export async function runRankChangeScan(): Promise<void> {
  const db = getFirestore();
  const scanTime = new Date();

  const activeSnap = await db.collection('battles').where('status', '==', 'active').get();

  for (const battleDoc of activeSnap.docs) {
    const battle = battleDoc.data();
    const categories = (battle['categories'] as Array<{ id: string; label: string }> | undefined) ?? [];
    if (categories.length < 2) continue;

    const rankingType = (battle['rankingType'] as string | undefined) ?? 'total';
    const statsSnap = await battleDoc.ref.collection('category_stats').get();
    if (statsSnap.size < 2) continue;

    const ranked: RankedCategory[] = statsSnap.docs
      .map((s) => ({
        categoryId: s.id,
        value: (rankingType === 'average'
          ? (s.data()['avgDistanceKm'] as number)
          : (s.data()['totalDistanceKm'] as number)) ?? 0,
      }))
      .sort((a, b) => b.value - a.value || a.categoryId.localeCompare(b.categoryId))
      .map((c, i) => ({ ...c, rank: i + 1 }));

    const newSnapshot: Record<string, number> = Object.fromEntries(ranked.map((r) => [r.categoryId, r.rank]));
    const prevSnapshot = battle['lastRankSnapshot'] as Record<string, number> | undefined;

    if (!prevSnapshot) {
      // 初回実行: 比較対象が無いため通知せずスナップショットのみ保存する
      await battleDoc.ref.update({ lastRankSnapshot: newSnapshot });
      continue;
    }

    const changes = ranked.filter((r) => {
      const oldRank = prevSnapshot[r.categoryId];
      return oldRank !== undefined && oldRank !== r.rank;
    });

    if (changes.length === 0) continue;

    let notificationCount = 0;
    let quietPushCount = 0;
    await Promise.all(changes.map(async (change) => {
      const participantsSnap = await battleDoc.ref
        .collection('participants')
        .where('categoryId', '==', change.categoryId)
        .get();

      await Promise.all(participantsSnap.docs.map(async (participant) => {
        const userSnap = await db.doc(`users/${participant.id}`).get();
        if (!userSnap.exists) return;
        const user = userSnap.data()!;
        const timezone = notificationTimeZone(user, battle['market']);
        const local = notificationLocalState(scanTime, timezone);
        const previousDate = participant.data()['rankChangeNotifyDate'];
        const previousCount = participant.data()['rankChangeNotifyCount'];
        const count = previousDate === local.dateKey && typeof previousCount === 'number'
          ? Math.max(0, Math.floor(previousCount))
          : 0;
        if (count >= MAX_DAILY_NOTIFY_COUNT) return;

        const language = resolveUiLanguage(user['uiLanguage']);
        const { title, body } = notificationCopy.rankChanged(language, change.rank);
        await db.collection(`users/${participant.id}/notifications`).add({
          type: 'rank_change',
          title,
          body,
          isRead: false,
          relatedBattleId: battleDoc.id,
          relatedActivityId: null,
          createdAt: FieldValue.serverTimestamp(),
        });
        // 静音時間中も通知センターには残すが、端末を鳴らすPushは送らない。
        if (local.quietHours) {
          quietPushCount += 1;
        } else {
          await sendPushToToken(
            participant.id,
            user['expoPushToken'] as string | undefined,
            title,
            body,
            { type: 'rank_change', relatedBattleId: battleDoc.id },
          );
        }
        await participant.ref.update({
          rankChangeNotifyDate: local.dateKey,
          rankChangeNotifyCount: count + 1,
        });
        notificationCount += 1;
      }));
    }));

    logger.info('rankChangeScheduler: processed rank changes', {
      battleId: battleDoc.id,
      changes: changes.length,
      notifications: notificationCount,
      quietPushesSkipped: quietPushCount,
    });

    await battleDoc.ref.update({
      lastRankSnapshot: newSnapshot,
    });
  }
}

export const rankChangeScheduler = onSchedule('every 60 minutes', runRankChangeScan);
