import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  GpsDebugSample,
  GpsProcessingConfig,
  GpsQualitySummary,
} from '../utils/gpsProcessing';

const GPS_DEBUG_EXPORT_KEY = '@zelio_latest_gps_debug_export_v1';

/**
 * 正確な座標を含むため既定OFF。本番サーバーへは送らない。
 * 開発ビルドで EXPO_PUBLIC_GPS_DEBUG_EXPORT=1 を設定した場合だけ端末内へ1活動分を残す。
 */
export const GPS_DEBUG_EXPORT_ENABLED = process.env.EXPO_PUBLIC_GPS_DEBUG_EXPORT === '1';

export interface GpsDebugExport {
  schemaVersion: 1;
  startedAt: string;
  endedAt: string;
  config: Readonly<GpsProcessingConfig>;
  summary: GpsQualitySummary;
  samples: GpsDebugSample[];
}

export async function saveLatestGpsDebugExport(value: GpsDebugExport): Promise<void> {
  if (!GPS_DEBUG_EXPORT_ENABLED) return;
  const json = JSON.stringify(value);
  await AsyncStorage.setItem(GPS_DEBUG_EXPORT_KEY, json);
  // Metroログから gps-log.json へコピーし、npm run gps:replay -- gps-log.json で再生できる。
  console.info('[GPS_DEBUG_EXPORT]', json);
}

/** 開発者メニューや一時的なデバッグUIから取得するための読み取り口。 */
export async function readLatestGpsDebugExport(): Promise<string | null> {
  return AsyncStorage.getItem(GPS_DEBUG_EXPORT_KEY);
}
