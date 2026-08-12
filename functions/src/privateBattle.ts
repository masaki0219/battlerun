import { randomInt } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { containsBannedWord } from './bannedWords';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 6;
const MAX_RESERVATION_ATTEMPTS = 20;
const MAX_TITLE_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_CATEGORY_LENGTH = 20;
const MAX_CATEGORY_COUNT = 20;
const MAX_CREATED_PRIVATE_BATTLES = 50;

interface CategoryInput {
  label: string;
  colorId?: string;
}

class InviteCodeCollision extends Error {}

function inviteCode(): string {
  return Array.from(
    { length: INVITE_CODE_LENGTH },
    () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)],
  ).join('');
}

function requiredText(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${label}が正しくありません。`);
  const normalized = value.trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > maxLength || containsBannedWord(normalized)) {
    throw new HttpsError('invalid-argument', `${label}が正しくありません。`);
  }
  return normalized;
}

function categories(value: unknown): CategoryInput[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_CATEGORY_COUNT) {
    throw new HttpsError('invalid-argument', 'チームは2〜20件で指定してください。');
  }
  return value.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new HttpsError('invalid-argument', 'チーム情報が正しくありません。');
    }
    const raw = item as Record<string, unknown>;
    const label = requiredText(raw['label'], 'チーム名', MAX_CATEGORY_LENGTH);
    const colorId = raw['colorId'];
    if (colorId != null && (typeof colorId !== 'string' || colorId.length < 1 || colorId.length > 40)) {
      throw new HttpsError('invalid-argument', 'チーム色が正しくありません。');
    }
    return { label, ...(typeof colorId === 'string' ? { colorId } : {}) };
  });
}

function resolveCategoryIds(input: CategoryInput[]): Array<CategoryInput & { id: string }> {
  const seen = new Set<string>();
  return input.map((category, index) => {
    const base = category.label
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20) || `cat_${index}`;
    let id = base;
    let suffix = 1;
    while (seen.has(id)) id = `${base}_${suffix++}`;
    seen.add(id);
    return { ...category, id };
  });
}

function millis(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpsError('invalid-argument', `${label}が正しくありません。`);
  }
  return Math.trunc(value);
}

/**
 * 非公開チャレンジをサーバー側で作成し、推測衝突や任意コードの上書きを防ぐ。
 * battleInviteCodes/{code} を予約するため、同時作成でも同じコードは確定しない。
 */
export const createPrivateBattle = onCall({ maxInstances: 20 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です。');

  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists || userSnap.data()?.['plan'] !== 'pro') {
    throw new HttpsError(
      'permission-denied',
      '非公開チャレンジの作成にはProプランが必要です。',
      { reason: 'pro-plan-not-synced' },
    );
  }

  const title = requiredText(request.data?.title, 'チャレンジ名', MAX_TITLE_LENGTH);
  const description = requiredText(
    request.data?.description ?? '',
    '説明',
    MAX_DESCRIPTION_LENGTH,
    true,
  );
  const resolvedCategories = resolveCategoryIds(categories(request.data?.categories));
  const rankingType = request.data?.rankingType;
  if (rankingType !== 'average' && rankingType !== 'total') {
    throw new HttpsError('invalid-argument', 'ランキング方式が正しくありません。');
  }
  const startAtMs = millis(request.data?.startAtMs, '開始日時');
  const endAtMs = millis(request.data?.endAtMs, '終了日時');
  if (endAtMs <= startAtMs) {
    throw new HttpsError('invalid-argument', '終了日時は開始日時より後にしてください。');
  }

  const battleRef = db.collection('battles').doc();
  for (let attempt = 0; attempt < MAX_RESERVATION_ATTEMPTS; attempt++) {
    const code = inviteCode();
    const reservationRef = db.doc(`battleInviteCodes/${code}`);
    const duplicateQuery = db.collection('battles')
      .where('type', '==', 'private')
      .where('inviteCode', '==', code)
      .limit(1);
    try {
      await db.runTransaction(async (tx) => {
        const [reservationSnap, duplicateSnap, transactionalUserSnap] = await Promise.all([
          tx.get(reservationRef),
          tx.get(duplicateQuery),
          tx.get(userRef),
        ]);
        if (reservationSnap.exists || !duplicateSnap.empty) throw new InviteCodeCollision();
        if (!transactionalUserSnap.exists || transactionalUserSnap.data()?.['plan'] !== 'pro') {
          throw new HttpsError(
            'permission-denied',
            '非公開チャレンジの作成にはProプランが必要です。',
            { reason: 'pro-plan-not-synced' },
          );
        }
        const createdBattleIds = transactionalUserSnap.data()?.['createdBattleIds'];
        if (Array.isArray(createdBattleIds) && createdBattleIds.length >= MAX_CREATED_PRIVATE_BATTLES) {
          throw new HttpsError('resource-exhausted', '作成できる非公開チャレンジ数の上限に達しました。');
        }

        tx.create(reservationRef, {
          battleId: battleRef.id,
          createdBy: uid,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.create(battleRef, {
          type: 'private',
          seasonId: null,
          title,
          description,
          categories: resolvedCategories,
          categoryIds: resolvedCategories.map((category) => category.id),
          rankingType,
          startAt: Timestamp.fromMillis(startAtMs),
          endAt: Timestamp.fromMillis(endAtMs),
          status: startAtMs <= Date.now() ? 'active' : 'upcoming',
          createdBy: uid,
          inviteCode: code,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(userRef, {
          createdBattleIds: FieldValue.arrayUnion(battleRef.id),
        });
        for (const category of resolvedCategories) {
          tx.create(battleRef.collection('category_stats').doc(category.id), {
            totalDistanceKm: 0,
            avgDistanceKm: 0,
            participantCount: 0,
          });
        }
      });
      return { battleId: battleRef.id, inviteCode: code };
    } catch (error) {
      if (error instanceof InviteCodeCollision) continue;
      throw error;
    }
  }
  throw new HttpsError('resource-exhausted', '招待コードを確保できませんでした。もう一度お試しください。');
});
