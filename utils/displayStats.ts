/**
 * 表示用の派生値を計算する純関数群。
 *
 * ★重要: このファイルは純関数のみ。Firestore / store / 副作用の import を禁止する。
 * 入力は各画面が既に取得済みの Activity[] / CategoryStats[] / Battle のみ。
 */
import type { Activity, CategoryStats, RoutePoint } from '../types';
import type { AppLanguage } from '../lib/language';
import { hasUsableAltitude } from './gpsQuality';

const DAY_MS = 86_400_000;
const WEEKDAY = {
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
} as const;

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

/** 「今週」の起点（ローカル月曜 0:00）。週間カード・週間目標・先週比の共通基準 */
export function calendarWeekStart(now: Date = new Date()): Date {
  const monday = startOfDay(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/**
 * 今週（月曜始まりのカレンダー週）の日別合計km。戻り値は月〜日の7要素固定。
 * - 「今週」表示・週間目標と一致させるためカレンダー週で切る（月曜にリセットされる）。
 * - startedAt はローカルタイムで日付境界を切る。
 * - label は曜日。isToday は今日のバケットのみ true（未来の曜日は km=0 のまま）。
 * - 空配列なら全 km=0 の7要素を返す（呼び出し側でプレースホルダー表示）。
 */
export function weeklyBuckets(
  activities: Activity[],
  now: Date,
  language: AppLanguage,
): WeeklyBucket[] {
  const monday = calendarWeekStart(now);
  const today0 = startOfDay(now).getTime();
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i); // i=0 が月曜、i=6 が日曜
    return { time: day.getTime(), label: WEEKDAY[language][day.getDay()], km: 0, isToday: day.getTime() === today0 };
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

/** 直近7日の日別合計km。今日を常に右端に置き、古い日から並べる。 */
export function rollingWeekBuckets(
  activities: Activity[],
  now: Date,
  language: AppLanguage,
): WeeklyBucket[] {
  const today = startOfDay(now);
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    return {
      time: day.getTime(),
      label: WEEKDAY[language][day.getDay()],
      km: 0,
      isToday: index === 6,
    };
  });
  const indexByDay = new Map(buckets.map((bucket, index) => [bucket.time, index]));
  for (const activity of activities) {
    const started = parseDate(activity.startedAt);
    if (!started) continue;
    const index = indexByDay.get(startOfDay(started).getTime());
    if (index != null) buckets[index].km += activity.distanceKm || 0;
  }
  return buckets.map(({ label, km, isToday }) => ({ label, km, isToday }));
}

/** 今週の起点（月曜）を「4月15日〜」形式で返す。週間カードの見出し用 */
export function weekStartLabel(now: Date, language: AppLanguage): string {
  const from = calendarWeekStart(now);
  return language === 'ja'
    ? `${from.getMonth() + 1}月${from.getDate()}日〜`
    : `${from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–`;
}

/** 同一週の既読管理に使う、ローカル月曜始まりの YYYY-MM-DD キー。 */
export function calendarWeekKey(now: Date = new Date()): string {
  const monday = startOfDay(now);
  const daysFromMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysFromMonday);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

/**
 * 今週（月曜始まり）と先週（先週月曜〜日曜）の合計km、および増減率。
 * - 「今週/先週比」の表示ラベルと一致するカレンダー週で比較する。
 *   週の前半は今週分が少なく比率が大きく振れるが、それが実態どおりの表示。
 * - 先週が 0km のときは比較できないので changeRatio は null（呼び出し側でチップを出さない）。
 * - 入力は取得済みの直近アクティビティのみ。2週分に満たなければその範囲での比較になる。
 */
export function weekOverWeek(
  activities: Activity[],
  now: Date = new Date(),
): { thisWeekKm: number; lastWeekKm: number; changeRatio: number | null } {
  const thisWeekFrom = calendarWeekStart(now).getTime();
  const lastWeekFrom = thisWeekFrom - 7 * DAY_MS;

  let thisWeekKm = 0;
  let lastWeekKm = 0;
  for (const a of activities) {
    const d = parseDate(a.startedAt);
    if (!d) continue;
    const day = startOfDay(d).getTime();
    if (day >= thisWeekFrom) thisWeekKm += a.distanceKm || 0;
    else if (day >= lastWeekFrom) lastWeekKm += a.distanceKm || 0;
  }
  return {
    thisWeekKm,
    lastWeekKm,
    changeRatio: lastWeekKm > 0 ? (thisWeekKm - lastWeekKm) / lastWeekKm : null,
  };
}

/**
 * 休息を勧める情報カードの対象か（直近7日が前の7日より50%超増え、かつ15km超）。
 * 生理的な負荷の判定なのでカレンダー週ではなく移動7日窓のまま。
 * （カレンダー週だと週明けに必ず判定不能になり、ガードレールとして機能しない）
 */
export function hasHighTrainingLoad(activities: Activity[], now: Date = new Date()): boolean {
  const today0 = startOfDay(now).getTime();
  const thisFrom = today0 - 6 * DAY_MS;
  const prevFrom = today0 - 13 * DAY_MS;
  let thisKm = 0;
  let prevKm = 0;
  for (const a of activities) {
    const d = parseDate(a.startedAt);
    if (!d) continue;
    const day = startOfDay(d).getTime();
    if (day >= thisFrom && day <= today0) thisKm += a.distanceKm || 0;
    else if (day >= prevFrom && day < thisFrom) prevKm += a.distanceKm || 0;
  }
  return thisKm > 15 && prevKm > 0 && (thisKm - prevKm) / prevKm > 0.5;
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

/** 週間・月間・累計・チーム合計など、合計距離を100m単位で表示する。 */
export function formatTotalDistanceKm(distanceKm: number): string {
  const safeDistance = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  return safeDistance.toFixed(1);
}

/** 1回のランの距離を10m単位で表示する。異常値は安全に0へ丸める。 */
export function formatRunDistanceKm(distanceKm: number): string {
  const safeDistance = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  return safeDistance.toFixed(2);
}

/** rankingType に応じた比較値（total=合計 / average=1人あたり平均）。 */
export function statValue(s: CategoryStats, rankingType: RankingType): number {
  return rankingType === 'total' ? s.totalDistanceKm : s.avgDistanceKm;
}

/** 表示用の距離ラベル（total=「12.3km」/ average=「12.3km/人」）。 */
export function statLabel(
  s: CategoryStats,
  rankingType: RankingType,
  language: AppLanguage,
): string {
  return rankingType === 'total'
    ? `${formatTotalDistanceKm(s.totalDistanceKm)} km`
    : `${formatTotalDistanceKm(s.avgDistanceKm)} ${language === 'ja' ? 'km/人' : 'km/person'}`;
}

/** 比較値の降順にソートした新配列を返す（元配列は変更しない）。 */
export function sortedStats(stats: CategoryStats[], rankingType: RankingType): CategoryStats[] {
  return [...stats].sort((a, b) => statValue(b, rankingType) - statValue(a, rankingType));
}

export interface AdjacentRankRival {
  stat: CategoryStats;
  rank: number;
  /** 自チームから見て、相手が上位か下位か。 */
  direction: 'ahead' | 'behind';
}

/**
 * 自チームに最も近い「別スコア」の相手を返す。
 * 後方なら直上、首位（同率首位を含む）なら次の別スコアを対象にする。
 */
export function adjacentRankRival(
  stats: CategoryStats[],
  myCategoryId: string | null | undefined,
  rankingType: RankingType,
): AdjacentRankRival | null {
  if (!myCategoryId) return null;
  const sorted = sortedStats(stats, rankingType);
  const mine = sorted.find((item) => item.categoryId === myCategoryId);
  if (!mine) return null;

  const myValue = statValue(mine, rankingType);
  const higher = sorted.filter((item) => statValue(item, rankingType) > myValue);
  const stat = higher.length > 0
    ? higher[higher.length - 1]
    : sorted.find((item) => statValue(item, rankingType) < myValue);
  if (!stat) return null;

  const rivalValue = statValue(stat, rankingType);
  return {
    stat,
    rank: 1 + sorted.filter((item) => statValue(item, rankingType) > rivalValue).length,
    direction: higher.length > 0 ? 'ahead' : 'behind',
  };
}

/** プログレスバーの分母に使う最大比較値（0 除算回避のため下限 0.01）。 */
export function maxStat(stats: CategoryStats[], rankingType: RankingType): number {
  return Math.max(...stats.map((s) => statValue(s, rankingType)), 0.01);
}

/** 終了日までの残り日数を切り上げで返す（0 未満は0、endAt空ならnull）。 */
export function daysLeft(endAt: string, now: Date = new Date()): number | null {
  const end = parseDate(endAt);
  if (!end) return null;
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
}

export interface ComebackTarget {
  totalKm: number;
  kmPerDay: number;
}

/**
 * 逆転までのチーム合計距離と24時間あたりの目安。
 * 切り上げた「残り日数」で割ると画面のカウントダウンと食い違うため、残り時間を小数日で使う。
 */
export function comebackTarget(
  distanceGapKm: number,
  endAt: string,
  now: Date = new Date(),
): ComebackTarget | null {
  const end = parseDate(endAt);
  if (!end || !Number.isFinite(distanceGapKm) || distanceGapKm < 0) return null;
  const remainingMs = end.getTime() - now.getTime();
  if (remainingMs <= 0) return null;
  const totalKm = distanceGapKm + 0.01;
  return {
    totalKm,
    kmPerDay: totalKm / (remainingMs / DAY_MS),
  };
}

/**
 * 残り時間の表示ラベル。チャレンジ詳細のカウントダウン（日 / 時 / 分＝切り捨て）と
 * 同じ基準で丸める。切り上げ日数を表示へ流用すると、ホーム「残り5日」／詳細
 * 「4日23時間」のように食い違うため、この関数は切り捨てで揃える。
 */
export function remainingLabel(
  endAt: string,
  now: Date,
  language: AppLanguage,
): string | null {
  const end = parseDate(endAt);
  if (!end) return null;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return language === 'ja' ? '終了' : 'Ended';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  if (days >= 1) return language === 'ja' ? `${days}日` : `${days}d`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 1) return language === 'ja' ? `${hours}時間` : `${hours}h`;
  return language === 'ja' ? `${Math.max(1, totalMinutes)}分` : `${Math.max(1, totalMinutes)}m`;
}

/**
 * 相対的な日付表示。「今日」「昨日」「N日前」（2〜6日）「M/D」（7日以上・不正時は空文字）。
 */
export function relativeDay(
  iso: string,
  now: Date,
  language: AppLanguage,
): string {
  const d = parseDate(iso);
  if (!d) return '';
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY_MS);
  if (diffDays === 0) return language === 'ja' ? '今日' : 'Today';
  if (diffDays === 1) return language === 'ja' ? '昨日' : 'Yesterday';
  if (diffDays >= 2 && diffDays < 7) return language === 'ja' ? `${diffDays}日前` : `${diffDays} days ago`;
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

/** 端数区間を除いた1kmラップのうち最速の配列index。比較対象が2本未満ならnull。 */
export function fastestFullKmSplitIndex(splits: KmSplit[]): number | null {
  let fullLapCount = 0;
  let fastestIndex: number | null = null;
  let fastestPace = Number.POSITIVE_INFINITY;
  splits.forEach((split, index) => {
    if (split.distanceKm < 1 || split.seconds <= 0) return;
    fullLapCount += 1;
    const pace = split.seconds / split.distanceKm;
    if (pace < fastestPace) {
      fastestPace = pace;
      fastestIndex = index;
    }
  });
  return fullLapCount >= 2 ? fastestIndex : null;
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
  let window: number[] = [];
  for (const p of route) {
    if (p.seg) {
      base = null;
      window = [];
    }
    if (!hasUsableAltitude(p)) continue;
    hasAlt = true;
    window = [...window.slice(-2), p.alt!];
    const smoothedAltitude = window.reduce((sum, altitude) => sum + altitude, 0) / window.length;
    if (base === null) {
      base = smoothedAltitude;
      continue;
    }
    const delta = smoothedAltitude - base;
    if (delta >= 3) {
      gain += delta;
      base = smoothedAltitude;
    } else if (delta < 0) {
      base = smoothedAltitude;
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
