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
  console.error('Usage: npm run gps:replay -- <gps-log.json> [gps-config.json] [--compare-v2]');
  process.exitCode = 1;
} else {
  const input = readJson(inputPath);
  const rawPoints = Array.isArray(input)
    ? input
    : isObject(input) && Array.isArray(input.samples)
      ? input.samples
      : [];
  if (rawPoints.length === 0) throw new Error('GPS点の配列、または samples 配列が必要です。');

  const configPath = process.argv.slice(3).find((value) => value !== '--compare-v2');
  const configInput = configPath ? readJson(configPath) : null;
  const configNumber = (
    data: JsonObject,
    key: keyof GpsProcessingConfig,
    fallback: number,
    legacyKey?: string,
  ): number => (
    Number(data[key] ?? (legacyKey ? data[legacyKey] : undefined) ?? fallback)
  );
  const config: Readonly<GpsProcessingConfig> = isObject(configInput)
    ? {
        highConfidenceAccuracyM: configNumber(configInput, 'highConfidenceAccuracyM', DEFAULT_GPS_PROCESSING_CONFIG.highConfidenceAccuracyM),
        conditionalAccuracyM: configNumber(configInput, 'conditionalAccuracyM', DEFAULT_GPS_PROCESSING_CONFIG.conditionalAccuracyM),
        maxAccuracyM: configNumber(configInput, 'maxAccuracyM', DEFAULT_GPS_PROCESSING_CONFIG.maxAccuracyM, 'distanceMaxAccuracyM'),
        maxRunningSpeedMps: configNumber(configInput, 'maxRunningSpeedMps', DEFAULT_GPS_PROCESSING_CONFIG.maxRunningSpeedMps),
        minCommitDistanceM: configNumber(configInput, 'minCommitDistanceM', DEFAULT_GPS_PROCESSING_CONFIG.minCommitDistanceM),
        gpsGapSegmentMs: configNumber(configInput, 'gpsGapSegmentMs', DEFAULT_GPS_PROCESSING_CONFIG.gpsGapSegmentMs, 'gapSegmentMs'),
        spikeMaxWindowMs: configNumber(configInput, 'spikeMaxWindowMs', DEFAULT_GPS_PROCESSING_CONFIG.spikeMaxWindowMs),
        spikeMinCrossTrackM: configNumber(configInput, 'spikeMinCrossTrackM', DEFAULT_GPS_PROCESSING_CONFIG.spikeMinCrossTrackM),
        spikeMinDetourM: configNumber(configInput, 'spikeMinDetourM', DEFAULT_GPS_PROCESSING_CONFIG.spikeMinDetourM),
        spikeAccuracyDifferenceM: configNumber(configInput, 'spikeAccuracyDifferenceM', DEFAULT_GPS_PROCESSING_CONFIG.spikeAccuracyDifferenceM),
      }
    : DEFAULT_GPS_PROCESSING_CONFIG;
  if (Object.values(config).some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('すべてのGPS設定値は0より大きい有限数で指定してください。');
  }
  if (
    config.highConfidenceAccuracyM > config.conditionalAccuracyM
    || config.conditionalAccuracyM > config.maxAccuracyM
  ) {
    throw new Error('accuracy設定は highConfidenceAccuracyM <= conditionalAccuracyM <= maxAccuracyM にしてください。');
  }

  const result = replayGpsLog(toInputPoints(rawPoints), config);
  const compareV2 = process.argv.includes('--compare-v2');
  process.stdout.write(`${JSON.stringify({
    config,
    ...result,
    ...(compareV2 ? {
      v2Comparison: {
        filteredDistanceM: result.v2FilteredDistanceM,
        differenceFromV2M: result.differenceFromV2M,
      },
    } : {}),
  }, null, 2)}\n`);
}
