import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { finishBattle } from './finishBattle';

/**
 * battles/{id}.status が finished へ手動変更された時に finishBattle を発火する。
 * これにより admin画面の「終了にする」ボタン（status 直書き）でも
 * 称号付与・終了通知がスケジューラと同一ロジックで実行される。
 *
 * スケジューラ経由の終了は同一 write 内で titlesAwardedAt がセットされるため、
 * その write に対してこのトリガーが発火しても即 no-op になり二重実行しない。
 */
export const onBattleFinished = onDocumentUpdated('battles/{battleId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after) return;
  if (before?.['status'] === 'finished') return; // すでに finished からの更新は対象外
  if (after['status'] !== 'finished') return;     // finished への遷移以外は無視
  if (after['titlesAwardedAt']) return;            // スケジューラが同時確定済み
  await finishBattle(event.params.battleId);
});
