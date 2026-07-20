import type { RoutePoint } from '../types';
import { kmSplits } from './displayStats';

const EARTH_RADIUS_KM = 6371;
const DISTANCE_EPSILON_KM = 1e-9;

export type RoutePaceBand = 'fast' | 'steady' | 'slow';

export interface RouteMapCoordinate {
  latitude: number;
  longitude: number;
}

export interface RoutePaceSegment {
  id: string;
  band: RoutePaceBand;
  paceSecondsPerKm: number | null;
  coordinates: RouteMapCoordinate[];
}

export interface RouteKmMarker extends RouteMapCoordinate {
  km: number;
}

export interface RouteVisualization {
  segments: RoutePaceSegment[];
  kmMarkers: RouteKmMarker[];
}

interface PaceRange {
  fromKm: number;
  toKm: number;
  paceSecondsPerKm: number;
}

function isValidPoint(point: RoutePoint): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(sin2));
}

function interpolate(a: RoutePoint, b: RoutePoint, fraction: number): RouteMapCoordinate {
  return {
    latitude: a.lat + (b.lat - a.lat) * fraction,
    longitude: a.lng + (b.lng - a.lng) * fraction,
  };
}

function paceRanges(route: RoutePoint[]): PaceRange[] {
  let fromKm = 0;
  return kmSplits(route).flatMap((split) => {
    const paceSecondsPerKm = split.distanceKm > 0 ? split.seconds / split.distanceKm : 0;
    const range = paceSecondsPerKm > 0 && Number.isFinite(paceSecondsPerKm)
      ? [{ fromKm, toKm: split.km, paceSecondsPerKm }]
      : [];
    fromKm = split.km;
    return range;
  });
}

function paceAt(distanceKm: number, ranges: PaceRange[]): number | null {
  const range = ranges.find((item) => distanceKm <= item.toKm + DISTANCE_EPSILON_KM)
    ?? ranges[ranges.length - 1];
  return range?.paceSecondsPerKm ?? null;
}

function paceBand(pace: number | null, ranges: PaceRange[]): RoutePaceBand {
  if (pace == null) return 'steady';
  const values = ranges.map((range) => range.paceSecondsPerKm);
  if (values.length < 2) return 'steady';
  const fastest = Math.min(...values);
  const slowest = Math.max(...values);
  if (slowest - fastest < 1) return 'steady';
  const third = (slowest - fastest) / 3;
  if (pace <= fastest + third) return 'fast';
  if (pace >= slowest - third) return 'slow';
  return 'steady';
}

/**
 * 地図描画用に、ルートを1kmラップのペース帯とkm境界で分割する。
 * seg が付いた再開点へは線をつながず、kmマーカーは実距離で座標補間する。
 */
export function buildRouteVisualization(route: RoutePoint[]): RouteVisualization {
  const ranges = paceRanges(route);
  const segments: RoutePaceSegment[] = [];
  const kmMarkers: RouteKmMarker[] = [];
  let cumulativeKm = 0;
  let nextKm = 1;
  let activeSegment: RoutePaceSegment | null = null;

  const appendPiece = (
    from: RouteMapCoordinate,
    to: RouteMapCoordinate,
    midpointKm: number,
  ) => {
    const pace = paceAt(midpointKm, ranges);
    const band = paceBand(pace, ranges);
    if (activeSegment?.band === band && activeSegment.paceSecondsPerKm === pace) {
      activeSegment.coordinates.push(to);
      return;
    }
    activeSegment = {
      id: `route-segment-${segments.length}`,
      band,
      paceSecondsPerKm: pace,
      coordinates: [from, to],
    };
    segments.push(activeSegment);
  };

  for (let index = 1; index < route.length; index += 1) {
    const fromPoint = route[index - 1];
    const toPoint = route[index];
    if (toPoint.seg || !isValidPoint(fromPoint) || !isValidPoint(toPoint)) {
      activeSegment = null;
      continue;
    }

    const pairDistanceKm = haversineKm(fromPoint, toPoint);
    if (!Number.isFinite(pairDistanceKm) || pairDistanceKm <= DISTANCE_EPSILON_KM) continue;

    const pairStartKm = cumulativeKm;
    const pairEndKm = pairStartKm + pairDistanceKm;
    let pieceStartKm = pairStartKm;
    let pieceStart = interpolate(fromPoint, toPoint, 0);

    while (nextKm <= pairEndKm + DISTANCE_EPSILON_KM) {
      const fraction = Math.min(1, Math.max(0, (nextKm - pairStartKm) / pairDistanceKm));
      const markerCoordinate = interpolate(fromPoint, toPoint, fraction);
      if (nextKm > pieceStartKm + DISTANCE_EPSILON_KM) {
        appendPiece(pieceStart, markerCoordinate, (pieceStartKm + nextKm) / 2);
      }
      kmMarkers.push({ km: nextKm, ...markerCoordinate });
      pieceStart = markerCoordinate;
      pieceStartKm = nextKm;
      nextKm += 1;
    }

    if (pairEndKm > pieceStartKm + DISTANCE_EPSILON_KM) {
      appendPiece(pieceStart, interpolate(fromPoint, toPoint, 1), (pieceStartKm + pairEndKm) / 2);
    }
    cumulativeKm = pairEndKm;
  }

  return { segments, kmMarkers };
}
