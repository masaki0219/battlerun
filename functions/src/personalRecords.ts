export interface TimedRoutePoint {
  lat: number;
  lng: number;
  timestamp: number;
  alt?: number;
  seg?: true;
}

export type PersonalRecordKey =
  | 'fastest1kSec'
  | 'fastest5kSec'
  | 'fastest10kSec'
  | 'longestRunKm'
  | 'maxElevationGainM'
  | 'bestMonthKm';

export type PersonalRecords = Partial<Record<PersonalRecordKey, number>>;

interface DistanceSample {
  distanceKm: number;
  timestamp: number;
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: TimedRoutePoint, b: TimedRoutePoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180)
      * Math.cos((b.lat * Math.PI) / 180)
      * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(sin2));
}

function routeSegments(route: TimedRoutePoint[]): DistanceSample[][] {
  const segments: DistanceSample[][] = [];
  let current: DistanceSample[] = [];
  let previous: TimedRoutePoint | null = null;
  let cumulativeKm = 0;

  const finish = () => {
    if (current.length >= 2) segments.push(current);
    current = [];
    cumulativeKm = 0;
  };

  for (const point of route) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !Number.isFinite(point.timestamp)) continue;
    if (!previous || point.seg) {
      if (previous) finish();
      current = [{ distanceKm: 0, timestamp: point.timestamp }];
      previous = point;
      continue;
    }
    if (point.timestamp <= previous.timestamp) continue;
    const pairKm = haversineKm(previous, point);
    previous = point;
    if (!Number.isFinite(pairKm) || pairKm <= 0) continue;
    cumulativeKm += pairKm;
    current.push({ distanceKm: cumulativeKm, timestamp: point.timestamp });
  }
  finish();
  return segments;
}

function timestampAtDistance(samples: DistanceSample[], distanceKm: number): number | null {
  if (distanceKm < 0 || distanceKm > samples[samples.length - 1].distanceKm) return null;
  let low = 0;
  let high = samples.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const value = samples[middle].distanceKm;
    if (value === distanceKm) return samples[middle].timestamp;
    if (value < distanceKm) low = middle + 1;
    else high = middle - 1;
  }
  const after = samples[low];
  const before = samples[low - 1];
  if (!before || !after) return null;
  const fraction = (distanceKm - before.distanceKm) / (after.distanceKm - before.distanceKm);
  return before.timestamp + (after.timestamp - before.timestamp) * fraction;
}

/**
 * 同一セグメント内に完全に収まる最速区間を返す。
 * 距離境界は点間を線形補間し、seg 境界（手動/自動停止）は跨がない。
 */
export function fastestSegmentSeconds(route: TimedRoutePoint[], targetKm: number): number | null {
  if (!Number.isFinite(targetKm) || targetKm <= 0) return null;
  let bestMs = Infinity;
  for (const samples of routeSegments(route)) {
    const totalKm = samples[samples.length - 1].distanceKm;
    if (totalKm < targetKm) continue;

    // 最適窓の境界は、開始側または終了側のどちらかが必ず既存点に一致する。
    for (const end of samples) {
      if (end.distanceKm < targetKm) continue;
      const startedAt = timestampAtDistance(samples, end.distanceKm - targetKm);
      if (startedAt != null && end.timestamp > startedAt) {
        bestMs = Math.min(bestMs, end.timestamp - startedAt);
      }
    }
    for (const start of samples) {
      if (start.distanceKm + targetKm > totalKm) continue;
      const endedAt = timestampAtDistance(samples, start.distanceKm + targetKm);
      if (endedAt != null && endedAt > start.timestamp) {
        bestMs = Math.min(bestMs, endedAt - start.timestamp);
      }
    }
  }
  return Number.isFinite(bestMs) ? Math.round(bestMs / 1000) : null;
}

/** GPS高度の3m未満の揺れを除外した獲得標高。 */
export function elevationGainMeters(route: TimedRoutePoint[]): number | null {
  let base: number | null = null;
  let gain = 0;
  let hasAltitude = false;
  for (const point of route) {
    if (typeof point.alt !== 'number' || !Number.isFinite(point.alt)) continue;
    hasAltitude = true;
    if (base == null) {
      base = point.alt;
      continue;
    }
    const delta = point.alt - base;
    if (delta >= 3) {
      gain += delta;
      base = point.alt;
    } else if (delta < 0) {
      base = point.alt;
    }
  }
  return hasAltitude ? Math.round(gain) : null;
}

function finiteRecord(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function mergePersonalRecords(
  current: Record<string, unknown> | undefined,
  candidates: PersonalRecords,
): { records: PersonalRecords; newRecords: PersonalRecordKey[] } {
  const records: PersonalRecords = {};
  const keys: PersonalRecordKey[] = [
    'fastest1kSec', 'fastest5kSec', 'fastest10kSec',
    'longestRunKm', 'maxElevationGainM', 'bestMonthKm',
  ];
  for (const key of keys) {
    const value = finiteRecord(current?.[key]);
    if (value != null) records[key] = value;
  }

  const newRecords: PersonalRecordKey[] = [];
  for (const key of keys) {
    const candidate = finiteRecord(candidates[key]);
    if (candidate == null) continue;
    const existing = records[key];
    const fasterIsBetter = key.startsWith('fastest');
    if (existing == null || (fasterIsBetter ? candidate < existing : candidate > existing)) {
      records[key] = candidate;
      newRecords.push(key);
    }
  }
  return { records, newRecords };
}
