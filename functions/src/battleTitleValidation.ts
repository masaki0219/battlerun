import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { BANNED_WORDS } from './bannedWords';

const MAX_TITLE_LENGTH = 30;

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

function isTitleInvalid(title: string): boolean {
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) return true;
  const normalized = normalize(title);
  return BANNED_WORDS.some((word) => normalized.includes(normalize(word)));
}

/**
 * battles/{battleId} の作成をトリガーに、private バトルのタイトルを検証する。
 * クライアント側バリデーション（lib/validation/battleTitle.ts）の回避対策として、
 * NGワード・空文字・30文字超のタイトルで作成されたバトルを強制的に終了させる。
 */
export const validateBattleTitleOnCreate = onDocumentCreated(
  'battles/{battleId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const battle = snapshot.data();
    if (battle['type'] !== 'private') return;

    const title = (battle['title'] as string | undefined) ?? '';
    if (!isTitleInvalid(title)) return;

    const { battleId } = event.params;
    logger.warn('validateBattleTitleOnCreate: invalid title, finishing battle', {
      battleId,
      title,
    });

    await snapshot.ref.update({ status: 'finished' });

    const createdBy = battle['createdBy'] as string | null | undefined;
    if (!createdBy) return;

    await getFirestore()
      .collection(`users/${createdBy}/notifications`)
      .add({
        type: 'battle_title_rejected',
        title: 'チャレンジが無効化されました',
        body: `「${title}」はバトル名に使用できない単語が含まれているため終了しました`,
        isRead: false,
        relatedBattleId: battleId,
        relatedActivityId: null,
        createdAt: FieldValue.serverTimestamp(),
      });
  },
);
