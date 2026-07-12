import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * battles/{battleId}/participants/{userId} の作成/更新/削除をトリガーに、
 * category_stats.participantCount をサーバー側で再計算する。
 *
 * 背景: 平均ランキング(avgDistanceKm) = totalDistanceKm / participantCount であるため、
 * participantCount をクライアントが直接書ける状態だと、他陣営の人数を水増しして
 * 平均を不正に下げる改ざんが可能だった。参加/離脱/カテゴリ変更はすべてこのトリガー
 * 経由でのみ人数に反映されるようにし、firestore.rules 側で category_stats.update を
 * 全面禁止する（見合いの実装は firestore.rules を参照）。
 */
export const participantCounter = onDocumentWritten(
  'battles/{battleId}/participants/{userId}',
  async (event) => {
    const { battleId } = event.params;
    const before = event.data?.before;
    const after = event.data?.after;

    const oldCategoryId = (before?.exists ? before.data()?.['categoryId'] : null) as
      | string
      | null
      | undefined;
    const newCategoryId = (after?.exists ? after.data()?.['categoryId'] : null) as
      | string
      | null
      | undefined;
    const oldDistance = (before?.exists ? before.data()?.['totalDistanceKm'] : 0) as number | undefined;
    const newDistance = (after?.exists ? after.data()?.['totalDistanceKm'] : 0) as number | undefined;

    if ((oldCategoryId ?? null) === (newCategoryId ?? null)) {
      // カテゴリに変化がない（無関係フィールドの更新、またはカテゴリ未所属のまま作成/削除）
      return;
    }

    const db = getFirestore();

    const targets: { categoryId: string; countDelta: 1 | -1; distanceDelta: number }[] = [];
    if (oldCategoryId) targets.push({ categoryId: oldCategoryId, countDelta: -1, distanceDelta: -Math.max(oldDistance ?? 0, 0) });
    if (newCategoryId) targets.push({ categoryId: newCategoryId, countDelta: 1, distanceDelta: Math.max(newDistance ?? 0, 0) });
    if (targets.length === 0) return;

    await db.runTransaction(async (tx) => {
      const refs = targets.map((t) =>
        db.doc(`battles/${battleId}/category_stats/${t.categoryId}`),
      );
      // トランザクションは読み取りをすべて書き込みより前に行う必要がある
      const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));

      snaps.forEach((snap, i) => {
        const target = targets[i];
        if (!snap.exists) {
          logger.warn('participantCounter: category_stats not found', {
            battleId,
            categoryId: target.categoryId,
          });
          return;
        }
        const stats = snap.data()!;
        const currentCount = (stats['participantCount'] as number) ?? 0;
        const newCount = Math.max(currentCount + target.countDelta, 0);
        const totalDistanceKm = (stats['totalDistanceKm'] as number) ?? 0;
        const newTotalDistanceKm = Math.max(totalDistanceKm + target.distanceDelta, 0);
        tx.update(refs[i], {
          participantCount: newCount,
          totalDistanceKm: newTotalDistanceKm,
          avgDistanceKm: newTotalDistanceKm / Math.max(newCount, 1),
        });
      });
    });
  },
);
