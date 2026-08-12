import assert from 'node:assert/strict';
import {
  buildBattleTermPeriods,
  canOfferTermContinuation,
  categoryForTermContinuation,
  completedTermBattles,
  DEFAULT_TERM_COUNT,
  DEFAULT_TERM_LENGTH_DAYS,
  findPreviousTermBattle,
  periodIsWithin,
  termWinnerLabels,
} from '../utils/battleTerms';
import type { Battle } from '../types';

const start = new Date(2026, 7, 3);
const periods = buildBattleTermPeriods(start);
assert.equal(periods.length, DEFAULT_TERM_COUNT);
assert.equal(DEFAULT_TERM_LENGTH_DAYS, 14);
assert.deepEqual(
  periods.map((period) => [
    period.termIndex,
    period.startAt.getFullYear(), period.startAt.getMonth() + 1, period.startAt.getDate(),
    period.endAt.getFullYear(), period.endAt.getMonth() + 1, period.endAt.getDate(),
  ]),
  [
    [1, 2026, 8, 3, 2026, 8, 16],
    [2, 2026, 8, 17, 2026, 8, 30],
    [3, 2026, 8, 31, 2026, 9, 13],
  ],
);
assert.equal(periods[0].endAt.getHours(), 23);
assert.equal(periods[0].endAt.getMilliseconds(), 999);
assert.equal(periods[0].endAt.getTime() + 1, periods[1].startAt.getTime(), 'ターム境界に空白を作らない');
assert.equal(periodIsWithin(start, periods[2].endAt, periods[0].startAt, periods[2].endAt), true);
assert.equal(periodIsWithin(periods[0].startAt, periods[1].endAt, periods[0].startAt, periods[2].endAt), false);
assert.deepEqual(buildBattleTermPeriods(start, 0, 14), []);
assert.deepEqual(buildBattleTermPeriods(start, 3, 32), []);

const termBattle = (termIndex: number, overrides: Partial<Battle> = {}): Battle => ({
  id: `term-${termIndex}`,
  type: 'public',
  status: termIndex === 2 ? 'active' : 'finished',
  title: `Term ${termIndex}`,
  description: '',
  categories: [{ id: 'a', label: 'Aチーム' }, { id: 'b', label: 'Bチーム' }],
  rankingType: 'total',
  inviteCode: null,
  createdBy: 'admin',
  seasonId: 'theme-1',
  market: 'JP',
  termIndex,
  termCount: 3,
  startAt: termIndex === 2 ? '2026-08-17T00:00:00.000Z' : '2026-08-03T00:00:00.000Z',
  endAt: termIndex === 2 ? '2026-08-30T23:59:59.999Z' : '2026-08-16T23:59:59.999Z',
  ...overrides,
});

const term1 = termBattle(1);
const term2 = termBattle(2);
const term3 = termBattle(3, { status: 'upcoming' });
assert.equal(findPreviousTermBattle([term1, term2, term3], term2)?.id, term1.id);
assert.equal(findPreviousTermBattle([term1, term2, term3], term3)?.id, term2.id);
assert.equal(findPreviousTermBattle([term1], term1), null, '第1タームには直前タームがない');
assert.equal(
  findPreviousTermBattle([term1], termBattle(2, { market: 'US' })),
  null,
  '別marketのBattleは同じ継続系列として扱わない',
);
assert.equal(
  findPreviousTermBattle([termBattle(1, { market: undefined })], termBattle(2, { market: 'JP' }))?.id,
  term1.id,
  'market未設定の既存public BattleはJPとして扱う',
);
assert.equal(findPreviousTermBattle([term1], termBattle(2, { type: 'private' })), null);
assert.equal(findPreviousTermBattle([term1], termBattle(2, { seasonId: null })), null);
assert.equal(
  findPreviousTermBattle([term1, termBattle(1, { id: 'duplicate-term-1' })], term2),
  null,
  '同じテーマに同番号タームが重複している場合は誤推測しない',
);

assert.equal(
  categoryForTermContinuation(term2, { battleId: term1.id, categoryId: 'a' })?.label,
  'Aチーム',
);
assert.equal(categoryForTermContinuation(term2, null), null, '直前ターム未参加なら候補を出さない');
assert.equal(
  categoryForTermContinuation(term2, { battleId: term1.id, categoryId: 'removed-team' }),
  null,
  '現タームに存在しないチームは継続候補にしない',
);
assert.equal(canOfferTermContinuation(term2, Date.parse('2026-08-20T00:00:00.000Z')), true);
assert.equal(canOfferTermContinuation(term3, Date.parse('2026-09-01T00:00:00.000Z')), false, 'upcomingでは参加CTAを出さない');
assert.equal(canOfferTermContinuation(termBattle(2, { type: 'private' }), Date.parse('2026-08-20T00:00:00.000Z')), false);
assert.equal(canOfferTermContinuation(termBattle(2, { seasonId: null }), Date.parse('2026-08-20T00:00:00.000Z')), false);
assert.equal(canOfferTermContinuation(term2, Date.parse('2026-09-01T00:00:00.000Z')), false, '期間終了後は参加CTAを出さない');

const finishedTerms = [
  term1,
  termBattle(2, { status: 'finished' }),
  termBattle(3, { status: 'finished' }),
];
assert.deepEqual(completedTermBattles(finishedTerms, finishedTerms[2])?.map((battle) => battle.termIndex), [1, 2, 3]);
assert.equal(completedTermBattles([finishedTerms[0], finishedTerms[2]], finishedTerms[2]), null, '欠けたタームは終了扱いにしない');
assert.equal(completedTermBattles([term1, term2, term3], term2), null, '開催中・開催前があれば振り返りを出さない');
assert.equal(completedTermBattles(finishedTerms, termBattle(3, { type: 'private' })), null);
assert.equal(
  completedTermBattles([...finishedTerms, termBattle(1, { id: 'duplicate-term-1' })], finishedTerms[2]),
  null,
  '同じ番号のタームが重複しているテーマは振り返りを誤表示しない',
);

const resultStats = [
  { categoryId: 'a', label: 'A', totalDistanceKm: 12, avgDistanceKm: 4, participantCount: 3 },
  { categoryId: 'b', label: 'B', totalDistanceKm: 8, avgDistanceKm: 8, participantCount: 1 },
];
assert.deepEqual(termWinnerLabels(termBattle(1, { rankingType: 'total' }), resultStats), ['Aチーム']);
assert.deepEqual(termWinnerLabels(termBattle(1, { rankingType: 'average' }), resultStats), ['Bチーム']);
assert.deepEqual(termWinnerLabels(termBattle(1), resultStats.map((stat) => ({ ...stat, totalDistanceKm: 0 }))), []);
assert.deepEqual(
  termWinnerLabels(termBattle(1), resultStats.map((stat) => ({ ...stat, totalDistanceKm: 12 }))),
  ['Aチーム', 'Bチーム'],
  '同率1位は単一の総合Winnerにまとめない',
);

console.log('battle term tests passed');
