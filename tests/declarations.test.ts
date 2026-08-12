import assert from 'node:assert/strict';
import {
  candidateDeclarationDateKeys,
  cheerCountAfterCreate,
  dateKeyAtTimeZone,
  declarationMatchesActivityStart,
  declarationTimeLabel,
  isVisibleTodayDeclarationStatus,
  shouldCompleteDeclaration,
} from '../utils/declarations';
import {
  declarationDateKey as serverDeclarationDateKey,
  normalizedTimeZone,
} from '../functions/src/declarations';

const declaration = {
  dateKey: '20260720',
  timezone: 'Asia/Tokyo',
};

assert.equal(dateKeyAtTimeZone(new Date('2026-07-20T14:30:00.000Z'), 'Asia/Tokyo'), '20260720');
assert.equal(dateKeyAtTimeZone(new Date('2026-07-20T15:30:00.000Z'), 'Asia/Tokyo'), '20260721');
assert.equal(serverDeclarationDateKey(new Date('2026-07-20T15:30:00.000Z'), 'Asia/Tokyo'), '20260721');
assert.equal(normalizedTimeZone('not/a timezone'), 'UTC');
assert.equal(declarationTimeLabel('2026-07-20T11:00:00.000Z', 'Asia/Tokyo', 'ja'), '20:00ごろ');

// 宣言時刻そのものは達成条件ではない。同じ宣言日なら前後どちらも達成する。
assert.equal(shouldCompleteDeclaration({
  ...declaration,
  status: 'planned',
  activityStartedAt: new Date('2026-07-20T08:00:00.000Z'), // 17:00 JST
}), true);
assert.equal(shouldCompleteDeclaration({
  ...declaration,
  status: 'planned',
  activityStartedAt: new Date('2026-07-20T12:00:00.000Z'), // 21:00 JST
}), true);

// 23時台開始・翌日終了でも、判定入力は開始日時なので開始日側を達成する。
assert.equal(shouldCompleteDeclaration({
  ...declaration,
  status: 'planned',
  activityStartedAt: new Date('2026-07-20T14:30:00.000Z'), // 23:30 JST
}), true);
assert.equal(shouldCompleteDeclaration({
  ...declaration,
  status: 'planned',
  activityStartedAt: new Date('2026-07-20T15:30:00.000Z'), // 翌日 00:30 JST
}), false);

// timezoneがない旧データは活動端末のtimezoneへフォールバックし、不正値でもクラッシュしない。
assert.equal(declarationMatchesActivityStart({
  dateKey: '20260720',
  activityStartedAt: new Date('2026-07-20T14:30:00.000Z'),
  fallbackTimezone: 'Asia/Tokyo',
}), true);
assert.doesNotThrow(() => declarationMatchesActivityStart({
  dateKey: '20260720',
  timezone: 'not/a timezone',
  activityStartedAt: new Date('2026-07-20T14:30:00.000Z'),
  fallbackTimezone: 'Asia/Tokyo',
}));

assert.equal(shouldCompleteDeclaration({
  ...declaration,
  status: 'done',
  activityStartedAt: new Date('2026-07-20T08:00:00.000Z'),
}), false);
assert.equal(shouldCompleteDeclaration({
  ...declaration,
  status: 'cancelled',
  activityStartedAt: new Date('2026-07-20T08:00:00.000Z'),
}), false);

assert.deepEqual(candidateDeclarationDateKeys(new Date('2026-07-20T14:30:00.000Z')), [
  '20260719', '20260720', '20260721',
]);
assert.equal(isVisibleTodayDeclarationStatus('planned'), true);
assert.equal(isVisibleTodayDeclarationStatus('done'), true);
assert.equal(isVisibleTodayDeclarationStatus('cancelled'), false);
assert.equal(cheerCountAfterCreate(0, true), 1);
assert.equal(cheerCountAfterCreate(1, false), 1);

console.log('declaration date/time, cancellation visibility, and cheer count tests passed');
