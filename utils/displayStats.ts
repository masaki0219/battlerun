/**
 * 表示用の派生値を計算する純関数群。
 *
 * ★重要: このファイルは純関数のみ。Firestore / store / 副作用の import を禁止する。
 * 入力は各画面が既に取得済みの Activity[] / CategoryStats[] / Battle のみ。
 */
import type { Activity, CategoryStats, RoutePoint } from '../types';

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

/** 直近7日の起点（6日前）を「4月15日〜」形式で返す。週間カードの見出し用 */
export function weekStartLabel(now: Date = new Date()): string {
  const from = startOfDay(now);
  from.setDate(from.getDate() - 6);
  return `${from.getMonth() + 1}月${from.getDate()}日〜`;
}

/**
 * 直近7日 と その前の7日 の合計km、および増減率。
 * - 前週が 0km のときは比較できないので changeRatio は null（呼び出し側でチップを出さない）。
 * - 入力は取得済みの直近アクティビティのみ。14日分に満たなければその範囲での比較になる。
 */
export function weekOverWeek(
  activities: Activity[],
  now: Date = new Date(),
): { thisWeekKm: number; lastWeekKm: number; changeRatio: number | null } {
  const today0 = startOfDay(now).getTime();
  const thisWeekFrom = today0 - 6 * DAY_MS; // 今日を含む7日
  const lastWeekFrom = today0 - 13 * DAY_MS;

  let thisWeekKm = 0;
  let lastWeekKm = 0;
  for (const a of activities) {
    const d = parseDate(a.startedAt);
    if (!d) continue;
    const day = startOfDay(d).getTime();
    if (day >= thisWeekFrom && day <= today0) thisWeekKm += a.distanceKm || 0;
    else if (day >= lastWeekFrom && day < thisWeekFrom) lastWeekKm += a.distanceKm || 0;
  }
  return {
    thisWeekKm,
    lastWeekKm,
    changeRatio: lastWeekKm > 0 ? (thisWeekKm - lastWeekKm) / lastWeekKm : null,
  };
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
  const end = parseDate(endAt);
  if (!end) return null;
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
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

// ============================================================
// GPSルートの派生値（1kmラップ・獲得標高・推定カロリー）
// ============================================================

function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(sin2));
}

export interface KmSplit {
  /** 区間の終端距離（km）。整数区間は 1, 2, …、最後の端数区間のみ小数 */
  km: number;
  /** この区間にかかった秒数 */
  seconds: number;
  /** 区間の実距離（km）。整数区間は 1、端数区間のみ 1 未満 */
  distanceKm: number;
}

/**
 * ルートから1kmごとのラップを計算する。
 * - km境界はペア内を時間で線形補間する。
 * - seg 付きの点（一時停止跨ぎ）は距離・時間とも積まない。
 * - 末尾の端数区間は 0.05km 以上のときだけ返す。
 */
export function kmSplits(route: RoutePoint[]): KmSplit[] {
  const splits: KmSplit[] = [];
  let cumDist = 0;
  let splitSeconds = 0;
  let nextMark = 1;
  for (let i = 1; i < route.length; i++) {
    const pt = route[i];
    if (pt.seg) continue;
    const prev = route[i - 1];
    let pairDist = haversineKm(prev, pt);
    let pairTime = Math.max(0, (pt.timestamp - prev.timestamp) / 1000);
    while (pairDist > 0 && cumDist + pairDist >= nextMark) {
      const need = nextMark - cumDist;
      const frac = need / pairDist;
      splitSeconds += pairTime * frac;
      splits.push({ km: nextMark, seconds: Math.round(splitSeconds), distanceKm: 1 });
      cumDist = nextMark;
      pairDist -= need;
      pairTime *= 1 - frac;
      splitSeconds = 0;
      nextMark += 1;
    }
    cumDist += pairDist;
    splitSeconds += pairTime;
  }
  const partialKm = cumDist - (nextMark - 1);
  if (partialKm >= 0.05 && splitSeconds > 0) {
    splits.push({ km: cumDist, seconds: Math.round(splitSeconds), distanceKm: partialKm });
  }
  return splits;
}

/**
 * 獲得標高（上りの合計、m）。GPS高度はノイズが大きいので3m以上の上昇だけを積む。
 * 高度情報が1点も無ければ null。
 */
export function elevationGainM(route: RoutePoint[]): number | null {
  let base: number | null = null;
  let gain = 0;
  let hasAlt = false;
  for (const p of route) {
    if (typeof p.alt !== 'number' || !Number.isFinite(p.alt)) continue;
    hasAlt = true;
    if (base === null) {
      base = p.alt;
      continue;
    }
    const delta = p.alt - base;
    if (delta >= 3) {
      gain += delta;
      base = p.alt;
    } else if (delta < 0) {
      base = p.alt;
    }
  }
  return hasAlt ? Math.round(gain) : null;
}

/** 推定カロリー計算の想定体重（kg）。プロフィールに体重が無いため固定値で近似する */
export const CALORIE_WEIGHT_KG = 60;

/**
 * 推定消費カロリー（kcal）。体重60kg換算の概算で、平均速度 7km/h 以上を走行
 * （係数1.05）、未満を歩行（係数0.55）として距離に掛ける。distanceKm<=0 は null。
 */
export function estimatedCalories(distanceKm: number, durationSeconds: number): number | null {
  if (distanceKm <= 0) return null;
  const speedKmh = durationSeconds > 0 ? distanceKm / (durationSeconds / 3600) : 0;
  const factor = speedKmh >= 7 ? 1.05 : 0.55;
  return Math.round(distanceKm * CALORIE_WEIGHT_KG * factor);
}
