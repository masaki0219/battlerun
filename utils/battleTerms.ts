import type { Battle, BattleParticipation, Category, CategoryStats } from '../types';
import { resolveBattleMarket } from '../lib/market';

export const DEFAULT_TERM_COUNT = 3;
export const DEFAULT_TERM_LENGTH_DAYS = 14;
export const MAX_TERM_COUNT = 12;
export const MAX_TERM_LENGTH_DAYS = 31;

export interface BattleTermPeriod {
  termIndex: number;
  termCount: number;
  startAt: Date;
  endAt: Date;
}

function validInteger(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** 連続するタームを、開始日0:00〜終了日23:59:59.999で隙間なく作る。 */
export function buildBattleTermPeriods(
  firstStartAt: Date,
  termCount: number = DEFAULT_TERM_COUNT,
  termLengthDays: number = DEFAULT_TERM_LENGTH_DAYS,
): BattleTermPeriod[] {
  if (
    !Number.isFinite(firstStartAt.getTime())
    || !validInteger(termCount, 1, MAX_TERM_COUNT)
    || !validInteger(termLengthDays, 1, MAX_TERM_LENGTH_DAYS)
  ) {
    return [];
  }

  return Array.from({ length: termCount }, (_, index) => {
    const startAt = new Date(firstStartAt);
    startAt.setDate(firstStartAt.getDate() + index * termLengthDays);
    startAt.setHours(0, 0, 0, 0);

    const nextStart = new Date(startAt);
    nextStart.setDate(startAt.getDate() + termLengthDays);
    const endAt = new Date(nextStart.getTime() - 1);
    return { termIndex: index + 1, termCount, startAt, endAt };
  });
}

export function periodIsWithin(
  outerStartAt: Date,
  outerEndAt: Date,
  innerStartAt: Date,
  innerEndAt: Date,
): boolean {
  const values = [outerStartAt, outerEndAt, innerStartAt, innerEndAt].map((date) => date.getTime());
  return values.every(Number.isFinite)
    && innerStartAt.getTime() >= outerStartAt.getTime()
    && innerEndAt.getTime() <= outerEndAt.getTime();
}

function hasTermMetadata(battle: Battle): battle is Battle & { termIndex: number; termCount: number } {
  return Number.isInteger(battle.termIndex)
    && Number.isInteger(battle.termCount)
    && battle.termIndex! >= 1
    && battle.termCount! >= battle.termIndex!;
}

function isSamePublicTermSeries(left: Battle, right: Battle): boolean {
  return left.type === 'public'
    && right.type === 'public'
    && !!left.seasonId
    && left.seasonId === right.seasonId
    && hasTermMetadata(left)
    && hasTermMetadata(right)
    && left.termCount === right.termCount
    && resolveBattleMarket(left.market) === resolveBattleMarket(right.market);
}

/** 同じ公開テーマの「直前1ターム」だけを返す。前々タームへは遡らない。 */
export function findPreviousTermBattle(battles: Battle[], currentBattle: Battle): Battle | null {
  if (!hasTermMetadata(currentBattle) || currentBattle.termIndex <= 1) return null;
  const matches = battles.filter((candidate) => (
    candidate.id !== currentBattle.id
    && isSamePublicTermSeries(candidate, currentBattle)
    && candidate.termIndex === currentBattle.termIndex - 1
  ));
  return matches.length === 1 ? matches[0] : null;
}

/** 直前タームの参加チームが現タームにも存在するときだけ継続候補にする。 */
export function categoryForTermContinuation(
  currentBattle: Battle,
  previousParticipation: BattleParticipation | null,
): Category | null {
  if (!previousParticipation?.categoryId) return null;
  return currentBattle.categories.find(
    (category) => category.id === previousParticipation.categoryId,
  ) ?? null;
}

/** 継続参加CTAを出せるのは、開始済みの公開タームだけ。 */
export function canOfferTermContinuation(currentBattle: Battle, nowMs: number = Date.now()): boolean {
  return currentBattle.type === 'public'
    && !!currentBattle.seasonId
    && hasTermMetadata(currentBattle)
    && currentBattle.termIndex > 1
    && currentBattle.status === 'active'
    && new Date(currentBattle.startAt).getTime() <= nowMs
    && nowMs <= new Date(currentBattle.endAt).getTime();
}

/** 全タームが揃い、すべてfinishedのときだけ振り返り対象を番号順で返す。 */
export function completedTermBattles(battles: Battle[], referenceBattle: Battle): Battle[] | null {
  if (!hasTermMetadata(referenceBattle) || referenceBattle.type !== 'public' || !referenceBattle.seasonId) {
    return null;
  }

  const byTermIndex = new Map<number, Battle>();
  for (const candidate of battles) {
    if (!isSamePublicTermSeries(candidate, referenceBattle) || !hasTermMetadata(candidate)) continue;
    if (byTermIndex.has(candidate.termIndex)) return null;
    byTermIndex.set(candidate.termIndex, candidate);
  }

  const completed = Array.from({ length: referenceBattle.termCount }, (_, index) => byTermIndex.get(index + 1));
  return completed.every((battle): battle is Battle => !!battle && battle.status === 'finished')
    ? completed
    : null;
}

/** Battle単位の1位チーム名を導出する。0kmは結果なし、同値は複数1位として返す。 */
export function termWinnerLabels(battle: Battle, stats: CategoryStats[]): string[] {
  const valueOf = (stat: CategoryStats) => (
    battle.rankingType === 'average' ? stat.avgDistanceKm : stat.totalDistanceKm
  );
  const topValue = Math.max(0, ...stats.map(valueOf));
  if (topValue <= 0) return [];
  return stats
    .filter((stat) => valueOf(stat) === topValue)
    .map((stat) => battle.categories.find((category) => category.id === stat.categoryId)?.label ?? stat.label)
    .sort((left, right) => left.localeCompare(right));
}
