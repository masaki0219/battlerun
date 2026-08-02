import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_GPS_PROCESSING_CONFIG,
  replayGpsLog,
  type GpsInputPoint,
  type GpsProcessingConfig,
} from '../utils/gpsProcessing';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toInputPoint(value: unknown): GpsInputPoint {
  if (!isObject(value)) return { lat: undefined, lng: undefined, timestamp: undefined };
  return {
    lat: value.lat ?? value.latitude,
    lng: value.lng ?? value.longitude,
    timestamp: value.timestamp,
    accuracy: value.accuracy,
    alt: value.alt ?? value.altitude,
    altitudeAccuracy: value.altitudeAccuracy,
    speed: value.speed,
    seg: value.seg,
  };
}

function toInputPoints(values: unknown[]): GpsInputPoint[] {
  let previousSegmentId: number | null = null;
  return values.map((value) => {
    const point = toInputPoint(value);
    if (!isObject(value)) return point;
    const segmentId = value.segmentId;
    if (typeof segmentId === 'number' && Number.isFinite(segmentId)) {
      if (previousSegmentId !== null && segmentId > previousSegmentId) point.seg = true;
      previousSegmentId = segmentId;
    }
    return point;
  });
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown;
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npm run gps:replay -- <gps-log.json> [gps-config.json]');
  process.exitCode = 1;
} else {
  const input = readJson(inputPath);
  const rawPoints = Array.isArray(input)
    ? input
    : isObject(input) && Array.isArray(input.samples)
      ? input.samples
      : [];
  if (rawPoints.length === 0) throw new Error('GPS点の配列、または samples 配列が必要です。');

  const configInput = process.argv[3] ? readJson(process.argv[3]) : null;
  const config: Readonly<GpsProcessingConfig> = isObject(configInput)
    ? {
        distanceMaxAccuracyM: Number(configInput.distanceMaxAccuracyM),
        maxRunningSpeedMps: Number(configInput.maxRunningSpeedMps),
        gapSegmentMs: Number(configInput.gapSegmentMs),
        minCommitDistanceM: Number(configInput.minCommitDistanceM),
      }
    : DEFAULT_GPS_PROCESSING_CONFIG;
  if (Object.values(config).some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('すべてのGPS設定値は0より大きい有限数で指定してください。');
  }

  const result = replayGpsLog(toInputPoints(rawPoints), config);
  process.stdout.write(`${JSON.stringify({ config, ...result }, null, 2)}\n`);
}
