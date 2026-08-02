import { MAX_RUNNING_SPEED_MPS } from '../utils/gpsProcessing';

export const REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '';

export const MAX_SPEED_KMH = MAX_RUNNING_SPEED_MPS * 3.6;
export const DAILY_GOAL_KM = 5;
/** 歩数モードが1つのチャレンジへ加算される1人あたりの日次上限。 */
export const STEP_BATTLE_DAILY_CAP_KM = 5;
