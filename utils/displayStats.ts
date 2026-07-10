/**
 * 表示用の派生値を計算する純関数群。
 *
 * ★重要: このファイルは純関数のみ。Firestore / store / 副作用の import を禁止する。
 * 入力は各画面が既に取得済みの Activity[] / CategoryStats[] / Battle のみ。
 */
import type { Activity, CategoryStats } from '../types';

const DAY_MS = 86_400_000;
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** ローカルタイムでその日の 0:00 を返す（日付境界の判定に使う） */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** ISO 文字列を Date に。無効なら null */
function parseDate(iso: string): Date | null {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export interface WeeklyBucket {
  label: string;
  km: number;
  isToday: boolean;
}

/**
 * 直近7日（今日含む）の日別合計km。戻り値は古い→新しい順の7要素固定。
 * - startedAt はローカルタイムで日付境界を切る。
 * - label は曜日（日〜土）。isToday は今日のバケットのみ true。
 * - 空配列なら全 km=0 の7要素を返す（呼び出し側でプレースホルダー表示）。
 */
export function weeklyBuckets(activities: Activity[], now: Date = new Date()): WeeklyBucket[] {
  const today0 = startOfDay(now);
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today0);
    day.setDate(today0.getDate() - (6 - i)); // i=0 が6日前、i=6 が今日
    return { time: day.getTime(), label: WEEKDAY[day.getDay()], km: 0, isToday: 6 - i === 0 };
  });
  const index = new Map(buckets.map((b, i) => [b.time, i]));
  for (const a of activities) {
    const d = parseDate(a.startedAt);
    if (!d) continue;
    const key = startOfDay(d).getTime();
    const i = index.get(key);
    if (i != null) buckets[i].km += a.distanceKm || 0;
  }
  return buckets.map(({ label, km, isToday }) => ({ label, km, isToday }));
}

/**
 * 連続記録日数。今日走っていれば今日から、走っていなければ昨日から遡る。
 * - 同日複数ランは1日と数える。
 * - 昨日も今日も記録なしなら 0。
 * - 日付の増減はカレンダー単位で行い DST の影響を受けない。
 */
export function streakDays(activities: Activity[], now: Date = new Date()): number {
  const daySet = new Set<number>();
  for (const a of activities) {
    const d = parseDate(a.startedAt);
    if (d) daySet.add(startOfDay(d).getTime());
  }
  if (daySet.size === 0) return 0;

  const cursor = startOfDay(now);
  if (!daySet.has(cursor.getTime())) {
    cursor.setDate(cursor.getDate() - 1); // 今日が無ければ昨日から
    if (!daySet.has(startOfDay(cursor).getTime())) return 0;
  }
  let count = 0;
  while (daySet.has(startOfDay(cursor).getTime())) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

/**
 * 逆転（または逃げ切り）に必要な1日あたり距離。
 * - daysLeft = ceil((endAt - now) / 1日)、0以下なら null（終了済み）。
 * - isLeading=false（ビハインド）: 差を埋める距離 + 0.01km バッファ（並ぶでなく抜く）を daysLeft で割る。
 * - isLeading=true（リード中）: リードを守る「1日◯kmの貯金」= (mine - rival)/daysLeft を返す（0にしない）。
 */
export function dailyPaceToOvertake(params: {
  myTeamKm: number;
  rivalTeamKm: number;
  endAt: string;
  isLeading: boolean;
  now?: Date;
}): { kmPerDay: number; daysLeft: number } | null {
  const { myTeamKm, rivalTeamKm, endAt, isLeading, now = new Date() } = params;
  const end = parseDate(endAt);
  if (!end) return null;
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft <= 0) return null;

  const kmPerDay = isLeading
    ? Math.max(0, myTeamKm - rivalTeamKm) / daysLeft
    : (Math.max(0, rivalTeamKm - myTeamKm) + 0.01) / daysLeft;
  return { kmPerDay, daysLeft };
}

/**
 * 陣営内での自分の貢献率 0–1。
 * teamTotalKm <= 0 なら 0。範囲は clamp(0,1)。
 */
export function contributionShare(myKm: number, teamTotalKm: number): number {
  if (teamTotalKm <= 0) return 0;
  return Math.max(0, Math.min(1, myKm / teamTotalKm));
}

/**
 * 最新のアクティビティ1件（表示用）。空配列なら null。
 * 配列がソート済みでなくても startedAt が最大のものを返す。
 */
export function lastRun(activities: Activity[]): Activity | null {
  let best: Activity | null = null;
  let bestT = -Infinity;
  for (const a of activities) {
    const d = parseDate(a.startedAt);
    const t = d ? d.getTime() : -Infinity;
    if (t > bestT) {
      bestT = t;
      best = a;
    }
  }
  return best;
}

// ============================================================
// バトルカードの陣営ランキング表示用（CategoryStats の純計算）
// ============================================================

export type RankingType = 'average' | 'total';

/** rankingType に応じた比較値（total=合計 / average=1人あたり平均）。 */
export function statValue(s: CategoryStats, rankingType: RankingType): number {
  return rankingType === 'total' ? s.totalDistanceKm : s.avgDistanceKm;
}

/** 表示用の距離ラベル（total=「12.3km」/ average=「12.3km/人」）。 */
export function statLabel(s: CategoryStats, rankingType: RankingType): string {
  return rankingType === 'total'
    ? `${s.totalDistanceKm.toFixed(1)}km`
    : `${s.avgDistanceKm.toFixed(1)}km/人`;
}

/** 比較値の降順にソートした新配列を返す（元配列は変更しない）。 */
export function sortedStats(stats: CategoryStats[], rankingType: RankingType): CategoryStats[] {
  return [...stats].sort((a, b) => statValue(b, rankingType) - statValue(a, rankingType));
}

/** プログレスバーの分母に使う最大比較値（0 除算回避のため下限 0.01）。 */
export function maxStat(stats: CategoryStats[], rankingType: RankingType): number {
  return Math.max(...stats.map((s) => statValue(s, rankingType)), 0.01);
}

/** 終了日までの残り日数（0 未満は 0、endAt 空なら null）。 */
export function daysLeft(endAt: string, now: Date = new Date()): number | null {
  if (!endAt) return null;
  return Math.max(0, Math.ceil((new Date(endAt).getTime() - now.getTime()) / DAY_MS));
}

/**
 * 相対的な日付表示。「今日」「昨日」「N日前」（2〜6日）「M/D」（7日以上・不正時は空文字）。
 */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const d = parseDate(iso);
  if (!d) return '';
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY_MS);
  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '昨日';
  if (diffDays >= 2 && diffDays < 7) return `${diffDays}日前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
