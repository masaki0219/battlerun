import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendPushToUser } from './push';

// 1バトルあたりのrank_change通知は1日3回まで（通知過多によるアンインストールを防ぐため）
const MAX_DAILY_NOTIFY_COUNT = 3;

interface RankedCategory {
  categoryId: string;
  value: number;
  rank: number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 60分ごとに全activeバトルの陣営順位を計算し、前回スナップショット
 * （battle.lastRankSnapshot）と比較して順位変動を通知する。
 * battleStatusScheduler とは別関数として分離している。
 *
 * - 初回実行時（lastRankSnapshotが無い）は通知せずスナップショットのみ保存する
 * - 順位が下がった陣営には「抜かれた」通知、上がった陣営には「浮上」通知を送る
 * - 1バトルあたり1日3回まで（rankChangeNotifyCount/rankChangeNotifyDateで制御）
 */
export const rankChangeScheduler = onSchedule('every 60 minutes', async () => {
  const db = getFirestore();

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

    const today = todayStr();
    let notifyCount = battle['rankChangeNotifyCount'] as number | undefined ?? 0;
    let notifyDate = battle['rankChangeNotifyDate'] as string | undefined ?? '';
    if (notifyDate !== today) {
      notifyCount = 0;
      notifyDate = today;
    }

    if (notifyCount < MAX_DAILY_NOTIFY_COUNT) {
      const labelOf = (categoryId: string) => categories.find((c) => c.id === categoryId)?.label ?? categoryId;

      await Promise.all(changes.map(async (change) => {
        const oldRank = prevSnapshot[change.categoryId];
        const dropped = change.rank > oldRank;

        let title: string;
        let body: string;
        if (dropped) {
          // 自分の以前の順位を今占めている陣営が「抜いた」相手
          const overtaker = ranked.find((r) => r.rank === oldRank);
          const aboveTeam = ranked.find((r) => r.rank === change.rank - 1);
          const gap = aboveTeam ? Math.max(aboveTeam.value - change.value, 0).toFixed(1) : '0.0';
          title = `⚔「${labelOf(overtaker?.categoryId ?? '')}」に抜かれました！`;
          body = `逆転まであと${gap}km`;
        } else {
          title = `🎉 陣営が${change.rank}位に浮上！`;
          body = 'この勢いで守り切ろう';
        }

        const participantsSnap = await battleDoc.ref
          .collection('participants')
          .where('categoryId', '==', change.categoryId)
          .get();

        await Promise.all(participantsSnap.docs.map(async (p) => {
          await db.collection(`users/${p.id}/notifications`).add({
            type: 'rank_change',
            title,
            body,
            isRead: false,
            relatedBattleId: battleDoc.id,
            relatedActivityId: null,
            createdAt: FieldValue.serverTimestamp(),
          });
          await sendPushToUser(p.id, title, body, { type: 'rank_change', relatedBattleId: battleDoc.id });
        }));
      }));

      notifyCount += 1;
      logger.info('rankChangeScheduler: notified rank changes', { battleId: battleDoc.id, changes: changes.length });
    }

    await battleDoc.ref.update({
      lastRankSnapshot: newSnapshot,
      rankChangeNotifyCount: notifyCount,
      rankChangeNotifyDate: notifyDate,
    });
  }
});
