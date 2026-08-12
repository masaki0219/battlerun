import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { containsBannedWord } from './bannedWords';
import { notificationCopy, userUiLanguage } from './i18n';

const MAX_TITLE_LENGTH = 30;

function isTitleInvalid(title: string): boolean {
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) return true;
  return containsBannedWord(title);
}

function isBattleContentInvalid(data: FirebaseFirestore.DocumentData): boolean {
  const title = (data['title'] as string | undefined) ?? '';
  const description = (data['description'] as string | undefined) ?? '';
  const categories = (data['categories'] as { label?: unknown }[] | undefined) ?? [];
  return isTitleInvalid(title)
    || description.length > 200
    || containsBannedWord(description)
    || categories.some((category) => (
      typeof category.label !== 'string'
      || category.label.length === 0
      || category.label.length > 20
      || containsBannedWord(category.label)
    ));
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
    if (!isBattleContentInvalid(battle)) return;

    const { battleId } = event.params;
    logger.warn('validateBattleTitleOnCreate: invalid title, finishing battle', {
      battleId,
      title,
    });

    await snapshot.ref.update({ status: 'finished' });

    const createdBy = battle['createdBy'] as string | null | undefined;
    if (!createdBy) return;

    const db = getFirestore();
    const language = await userUiLanguage(db, createdBy);
    const copy = notificationCopy.battleRejected(language, title);

    await db
      .collection(`users/${createdBy}/notifications`)
      .add({
        type: 'battle_title_rejected',
        title: copy.title,
        body: copy.body,
        isRead: false,
        relatedBattleId: battleId,
        relatedActivityId: null,
        createdAt: FieldValue.serverTimestamp(),
      });
  },
);
