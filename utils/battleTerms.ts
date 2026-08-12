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
