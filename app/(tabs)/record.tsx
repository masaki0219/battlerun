import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, Pressable, Switch, Animated, Easing, AppState, Linking,
  Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Pedometer } from 'expo-sensors';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivitySaveError,
  activeDurationSeconds,
  saveActivityToFirestore,
  useRecordStore,
} from '../../stores/recordStore';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import { useRecentActivities } from '../../hooks/useRecentActivities';
import type { Activity, GpsWarmupSeed, MeasurementType, RoutePoint, RunGoal } from '../../types';
import { Colors, DarkColors, Spacing, BorderRadius, Shadow, TextStyles } from '../../design_tokens';
import { MonoLabel } from '../../components/ui/MonoLabel';
import { StatBlock } from '../../components/ui/StatBlock';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { ListRow } from '../../components/ui/ListRow';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { WeeklyBarChart } from '../../components/viz/WeeklyBarChart';
import { StreakChip } from '../../components/viz/StreakChip';
import { weeklyBuckets, streakDays, lastRun, relativeDay, kmSplits, elevationGainM } from '../../utils/displayStats';
import { loadVoiceCoachSettings, saveVoiceCoachSettings } from '../../lib/voiceCoach';
import { useRunCheers } from '../../hooks/useRunCheers';
import {
  buildVoiceCoachAnnouncement,
  DEFAULT_VOICE_COACH_SETTINGS,
  type VoiceCoachSettings,
} from '../../utils/voiceCoach';
import {
  GPS_ANDROID_TIME_INTERVAL_MS,
  GPS_DISTANCE_INTERVAL_M,
  START_ACCEPTABLE_ACCURACY_M,
  START_READY_ACCURACY_M,
  WARMUP_GOOD_POINT_COUNT,
  WARMUP_POINT_MAX_AGE_MS,
} from '../../utils/gpsProcessing';
import { STEP_BATTLE_DAILY_CAP_KM } from '../../lib/constants';
import { decorLabel } from '../../lib/locale';
import {
  resolveDisplayedBattle,
  selectedBattleStorageKey,
  sortActiveBattlesForDisplay,
} from '../../utils/battleSelection';
import { declarationTimeLabel } from '../../utils/declarations';

function useElapsedTime(): number {
  const isRecording = useRecordStore((s) => s.isRecording);
  const isPaused = useRecordStore((s) => s.isPaused);
  const startedAt = useRecordStore((s) => s.startedAt);
  const pausedAt = useRecordStore((s) => s.pausedAt);
  const pausedTotalMs = useRecordStore((s) => s.pausedTotalMs);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isRecording || !startedAt) { setElapsed(0); return; }
    const compute = () => setElapsed(activeDurationSeconds({ startedAt, pausedAt, pausedTotalMs }));
    compute();
    if (isPaused) return; // 停止中は時間が進まないのでタイマー不要
    const iv = setInterval(compute, 1000);
    return () => clearInterval(iv);
  }, [isRecording, isPaused, startedAt, pausedAt, pausedTotalMs]);
  return elapsed;
}

const GOAL_OPTIONS: { label: string; goal: RunGoal | null }[] = [
  { label: '目標なし', goal: null },
  { label: '3km', goal: { type: 'distance', value: 3 } },
  { label: '5km', goal: { type: 'distance', value: 5 } },
  { label: '10km', goal: { type: 'distance', value: 10 } },
  { label: '30分', goal: { type: 'duration', value: 1800 } },
  { label: '60分', goal: { type: 'duration', value: 3600 } },
];

function goalLabel(goal: RunGoal): string {
  return goal.type === 'distance' ? `${goal.value}km` : `${Math.round(goal.value / 60)}分`;
}

type GpsReadiness =
  | 'preparing'
  | 'acceptable'
  | 'ready'
  | 'no-permission'
  | 'approximate'
  | 'services-disabled'
  | 'unavailable';

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formatPace(distKm: number, sec: number): string {
  if (distKm < 0.01) return "--'--\"";
  const sPerKm = sec / distKm;
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}'${String(s).padStart(2,'0')}"`;
}

export default function RecordScreen() {
  const { fontScale } = useWindowDimensions();
  const { user } = useAuthStore();
  const {
    publicBattles, privateBattles, myMemberships,
    getActiveBattleIds, fetchMyMemberships, fetchMyPrivateBattles, fetchPublicBattles,
    declarationsByBattle, subscribeDeclarations,
  } = useBattleStore();
  const {
    isRecording, isPaused, pauseKind, autoPauseEnabled, measurementType, distanceKm, steps, route, locationMode, gpsWarning, goal, startedAt,
    startRecording, pauseRecording, resumeRecording, stopRecording, reset, setAutoPauseEnabled,
  } = useRecordStore();
  const elapsed = useElapsedTime();

  // 画面マウント時にバトルデータをロード（battle タブ未訪問の場合に備えて）
  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetchMyMemberships(user.id),
      fetchMyPrivateBattles(user.id),
      fetchPublicBattles(),
    ]).catch(() => {});
  }, [user?.id]);

  // 参加中のアクティブバトル
  const nowMs = Date.now();
  const allBattles = [...publicBattles, ...privateBattles];
  const activeBattleIds = getActiveBattleIds();
  const currentActiveBattles = activeBattleIds
    .map((id) => allBattles.find((b) => b.id === id))
    .filter(Boolean) as typeof allBattles;
  const [selectedDeclarationBattleId, setSelectedDeclarationBattleId] = useState<string | null>(null);
  const declarationBattle = resolveDisplayedBattle(
    sortActiveBattlesForDisplay(currentActiveBattles),
    selectedDeclarationBattleId,
  );
  const ownDeclaration = declarationBattle && user
    ? (declarationsByBattle[declarationBattle.id] ?? []).find((item) => item.uid === user.id)
    : undefined;
  const primaryPresenceBattleId = allBattles.find((battle) => activeBattleIds.includes(battle.id))?.id;

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (!user?.id) {
      setSelectedDeclarationBattleId(null);
      return () => { cancelled = true; };
    }
    void AsyncStorage.getItem(selectedBattleStorageKey(user.id))
      .then((battleId) => {
        if (!cancelled) setSelectedDeclarationBattleId(battleId);
      })
      .catch((error) => console.warn('[RecordScreen] selected battle restore failed:', error));
    return () => { cancelled = true; };
  }, [user?.id]));

  useEffect(() => {
    if (!declarationBattle || !user) return;
    return subscribeDeclarations(declarationBattle.id, user.id);
  }, [declarationBattle?.id, user?.id]);

  // 開始前の下段データ（前回のラン・週間ミニバー・ストリーク）
  const { activities: recentActivities, loading: recentLoading } = useRecentActivities(20);
  const last = lastRun(recentActivities);
  const weekBuckets = weeklyBuckets(recentActivities);
  const streak = streakDays(recentActivities);

  const [selectedMode, setSelectedMode] = useState<MeasurementType>('gps');
  const [isSaving, setIsSaving] = useState(false);
  const [isStepAvailable, setIsStepAvailable] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceCoachSettings>(DEFAULT_VOICE_COACH_SETTINGS);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [selectedGoalIdx, setSelectedGoalIdx] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gpsReadiness, setGpsReadiness] = useState<GpsReadiness | null>(null);
  const [gpsWarmupRestartKey, setGpsWarmupRestartKey] = useState(0);
  const [backgroundPermissionGranted, setBackgroundPermissionGranted] = useState<boolean | null>(null);
  const [hudCheerName, setHudCheerName] = useState<string | null>(null);
  const spokenIntervalRef = useRef(0);
  const lastVoiceDistanceRef = useRef(0);
  const lastVoiceElapsedRef = useRef(0);
  const goalAnnouncedRef = useRef(false);
  const stopGuardRef = useRef(false);
  const warmupSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const warmupStartedAtRef = useRef<number | null>(null);
  const warmupReadyCountRef = useRef(0);
  const lastWarmupPointRef = useRef<RoutePoint | null>(null);
  const latestRunCheer = useRunCheers({
    battleId: primaryPresenceBattleId,
    runnerId: user?.id,
    startedAt,
    enabled: isRecording && user?.runningPresenceVisible === true,
  });

  // REC ドット点滅（opacity 1↔0.3、1秒周期）
  const recDotAnim = useRef(new Animated.Value(1)).current;
  // START リングの呼吸スケール
  const ringAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Pedometer.isAvailableAsync().then(setIsStepAvailable).catch(() => {});
    void loadVoiceCoachSettings().then(setVoiceSettings);
  }, []);

  const voiceGuide = voiceSettings.enabled;

  useEffect(() => {
    if (!latestRunCheer) return;
    setHudCheerName(latestRunCheer.senderName);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (voiceSettings.enabled) {
      Speech.speak(`${latestRunCheer.senderName}さんから応援が届きました`, { language: 'ja-JP', rate: 1.0 });
    }
    const timer = setTimeout(() => setHudCheerName(null), 8_000);
    return () => clearTimeout(timer);
  }, [latestRunCheer?.id]);

  function updateVoiceSettings(patch: Partial<VoiceCoachSettings>) {
    setVoiceSettings((current) => {
      const next = { ...current, ...patch };
      void saveVoiceCoachSettings(next);
      return next;
    });
  }

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(recDotAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(recDotAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    // 破線リングをゆっくり回転（20秒 / 周）
    const loop = Animated.loop(
      Animated.timing(ringAnim, { toValue: 1, duration: 20000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const ringRotate = ringAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // 音声コーチ: 設定した距離または時間の間隔で、選択された統計を読み上げる。
  useEffect(() => {
    if (!isRecording || isPaused || !voiceSettings.enabled) return;
    const intervalCount = voiceSettings.intervalType === 'distance'
      ? Math.floor((distanceKm + 0.0001) / voiceSettings.distanceKm)
      : Math.floor(elapsed / (voiceSettings.timeMinutes * 60));
    if (intervalCount <= 0 || intervalCount <= spokenIntervalRef.current) return;

    spokenIntervalRef.current = intervalCount;
    const message = buildVoiceCoachAnnouncement(voiceSettings, {
      elapsedSeconds: elapsed,
      distanceKm,
      lapElapsedSeconds: elapsed - lastVoiceElapsedRef.current,
      lapDistanceKm: distanceKm - lastVoiceDistanceRef.current,
    });
    lastVoiceElapsedRef.current = elapsed;
    lastVoiceDistanceRef.current = distanceKm;
    if (message) Speech.speak(message, { language: 'ja-JP', rate: 1.0 });
  }, [distanceKm, elapsed, isPaused, isRecording, voiceSettings]);

  // 目標達成を一度だけアナウンス
  useEffect(() => {
    if (!isRecording) { goalAnnouncedRef.current = false; return; }
    if (!goal || goalAnnouncedRef.current) return;
    const achieved = goal.type === 'distance' ? distanceKm >= goal.value : elapsed >= goal.value;
    if (achieved) {
      goalAnnouncedRef.current = true;
      if (voiceGuide) {
        Speech.speak(`目標の${goal.type === 'distance' ? `${goal.value}キロメートル` : `${Math.round(goal.value / 60)}分`}を達成しました`, { language: 'ja-JP', rate: 1.0 });
      }
    }
  }, [distanceKm, elapsed, isRecording, goal, voiceGuide]);

  // 記録停止時に音声リセット
  useEffect(() => {
    if (!isRecording) {
      spokenIntervalRef.current = 0;
      lastVoiceDistanceRef.current = 0;
      lastVoiceElapsedRef.current = 0;
    }
  }, [isRecording]);

  // 記録開始前から本番と同じBestForNavigationでウォームアップする。
  // distanceIntervalは更新通知条件であり、記録中の3mジッター除去とは別の処理。
  useEffect(() => {
    if (isRecording || selectedMode !== 'gps') { setGpsReadiness(null); return; }
    let cancelled = false;
    let expiryTimer: ReturnType<typeof setInterval> | null = null;
    let localSubscription: Location.LocationSubscription | null = null;
    setGpsReadiness('preparing');
    warmupStartedAtRef.current = Date.now();
    warmupReadyCountRef.current = 0;
    lastWarmupPointRef.current = null;

    const stopWarmup = () => {
      localSubscription?.remove();
      if (warmupSubscriptionRef.current === localSubscription) warmupSubscriptionRef.current = null;
      localSubscription = null;
      if (expiryTimer) clearInterval(expiryTimer);
      expiryTimer = null;
    };

    (async () => {
      const provider = await Location.getProviderStatusAsync().catch(() => null);
      if (cancelled) return;
      if (!provider) {
        setGpsReadiness('unavailable');
        return;
      }
      if (!provider.locationServicesEnabled) {
        setGpsReadiness('services-disabled');
        return;
      }
      const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (cancelled) return;
      if (!permission?.granted) { setGpsReadiness('no-permission'); return; }
      if (Platform.OS === 'android' && permission.android?.accuracy !== 'fine') {
        setGpsReadiness('approximate');
        return;
      }

      try {
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            distanceInterval: GPS_DISTANCE_INTERVAL_M,
            // expo-location 19ではtimeIntervalはAndroid専用。iOSの頻度制御には使わない。
            ...(Platform.OS === 'android' ? { timeInterval: GPS_ANDROID_TIME_INTERVAL_MS } : {}),
          },
          (location) => {
            if (cancelled) return;
            const accuracy = location.coords.accuracy;
            const ageMs = Date.now() - location.timestamp;
            if (
              typeof accuracy !== 'number'
              || !Number.isFinite(accuracy)
              || accuracy <= 0
              || accuracy > START_ACCEPTABLE_ACCURACY_M
              || ageMs < 0
              || ageMs > WARMUP_POINT_MAX_AGE_MS
            ) {
              warmupReadyCountRef.current = 0;
              lastWarmupPointRef.current = null;
              setGpsReadiness('preparing');
              return;
            }

            const point: RoutePoint = {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
              timestamp: location.timestamp,
              accuracy,
            };
            if (typeof location.coords.altitude === 'number' && Number.isFinite(location.coords.altitude)) {
              point.alt = location.coords.altitude;
            }
            if (
              typeof location.coords.altitudeAccuracy === 'number'
              && Number.isFinite(location.coords.altitudeAccuracy)
            ) {
              point.altitudeAccuracy = Math.max(0, location.coords.altitudeAccuracy);
            }
            lastWarmupPointRef.current = point;
            warmupReadyCountRef.current = accuracy <= START_READY_ACCURACY_M
              ? warmupReadyCountRef.current + 1
              : 0;
            setGpsReadiness(
              warmupReadyCountRef.current >= WARMUP_GOOD_POINT_COUNT ? 'ready' : 'acceptable',
            );
          },
        );
        if (cancelled) {
          subscription.remove();
          return;
        }
        localSubscription = subscription;
        warmupSubscriptionRef.current = subscription;
        expiryTimer = setInterval(() => {
          const last = lastWarmupPointRef.current;
          if (last && Date.now() - last.timestamp > WARMUP_POINT_MAX_AGE_MS) {
            lastWarmupPointRef.current = null;
            warmupReadyCountRef.current = 0;
            setGpsReadiness('preparing');
          }
        }, 1_000);
      } catch {
        if (!cancelled) setGpsReadiness('unavailable');
      }
    })();
    return () => {
      cancelled = true;
      stopWarmup();
    };
  }, [isRecording, selectedMode, gpsWarmupRestartKey]);

  // 画面OFF時の記録可否を開始前に見える状態にする。
  // 端末設定から戻った場合も再確認し、表示だけが古いまま残らないようにする。
  useEffect(() => {
    if (isRecording || selectedMode !== 'gps') {
      setBackgroundPermissionGranted(null);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const permission = await Location.getBackgroundPermissionsAsync().catch(() => null);
      if (!cancelled) setBackgroundPermissionGranted(permission?.granted === true);
    };
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
        setGpsWarmupRestartKey((value) => value + 1);
      }
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [isRecording, selectedMode]);

  // カウントダウン: 3→2→1→開始
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      let warmupSeed: GpsWarmupSeed | null = null;
      if (selectedMode === 'gps') {
        const point = lastWarmupPointRef.current;
        const pointAgeMs = point ? Date.now() - point.timestamp : Infinity;
        if (
          !point
          || typeof point.accuracy !== 'number'
          || point.accuracy <= 0
          || point.accuracy > START_ACCEPTABLE_ACCURACY_M
          || pointAgeMs < 0
          || pointAgeMs > WARMUP_POINT_MAX_AGE_MS
        ) {
          Alert.alert('GPSを準備しています', '正確な開始地点を取得できませんでした。空が見える場所でGPS状態が更新されてから、もう一度STARTを押してください。');
          return;
        }
        warmupSeed = {
          point,
          warmupDurationMs: Math.max(0, Date.now() - (warmupStartedAtRef.current ?? Date.now())),
          readyAccuracyM: point.accuracy,
        };
      }
      startRecording(selectedMode, GOAL_OPTIONS[selectedGoalIdx]?.goal ?? null, warmupSeed);
      if (voiceGuide) Speech.speak('スタート', { language: 'ja-JP', rate: 1.0 });
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((current) => (current === null ? null : current - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, selectedMode, selectedGoalIdx, voiceGuide]);

  async function ensureForegroundLocationPermission(): Promise<boolean> {
    const provider = await Location.getProviderStatusAsync().catch(() => null);
    if (!provider) {
      Alert.alert(
        '位置情報を確認できません',
        '端末の位置情報状態を確認できませんでした。少し待ってからもう一度お試しください。',
      );
      return false;
    }
    if (!provider.locationServicesEnabled) {
      Alert.alert(
        '位置情報サービスがOFFです',
        'GPS距離を記録するには、端末の位置情報サービスをONにしてください。',
        [
          { text: '閉じる', style: 'cancel' },
          { text: '端末設定を開く', onPress: () => { void Linking.openSettings(); } },
        ],
      );
      return false;
    }

    let foreground = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (!foreground?.granted) {
      if (foreground && !foreground.canAskAgain) {
        Alert.alert(
          '位置情報の許可が必要です',
          'GPSモードで距離を計測するには、端末の設定から ZELIO の位置情報を「使用中のみ許可」以上にしてください。歩数モードなら位置情報なしで記録できます。',
        );
        return false;
      }
      foreground = await Location.requestForegroundPermissionsAsync().catch(() => null);
      setGpsWarmupRestartKey((value) => value + 1);
    }
    if (!foreground?.granted) {
      Alert.alert(
        '位置情報を許可すると記録できます',
        'GPSモードは走行ルートから距離を計算します。許可せずに記録すると距離が0のままになるため、開始しませんでした。歩数モードなら位置情報なしで記録できます。',
      );
      return false;
    }

    if (Platform.OS === 'android' && foreground.android?.accuracy !== 'fine') {
      Alert.alert(
        '正確な位置情報が必要です',
        '概算位置では走行距離とチーム貢献距離を正確に計測できません。端末設定でZELIOの位置情報を「正確」にしてください。',
        [
          { text: '閉じる', style: 'cancel' },
          { text: '端末設定を開く', onPress: () => { void Linking.openSettings(); } },
        ],
      );
      return false;
    }

    // expo-location 19.0.8 の公開型は iOS に scope だけを持ち、full/reduced accuracyを公開しない。
    // any/castで推測せず、iOSはウォームアップ点の実accuracy (35m以内) で開始可否を守る。

    return true;
  }

  /**
   * バックグラウンド位置情報の設定だけを行う。
   * 設定後に記録を勝手に開始せず、利用者が状態表示を確認してから改めてSTARTできるようにする。
   */
  async function configureBackgroundLocation(): Promise<void> {
    if (!(await ensureForegroundLocationPermission())) return;

    let background = await Location.getBackgroundPermissionsAsync().catch(() => null);
    if (background?.granted) {
      setBackgroundPermissionGranted(true);
      Alert.alert(
        '設定済みです',
        '位置情報は「常に許可」されています。実際の動作状態は記録開始後の画面にも表示します。',
      );
      return;
    }

    if (background?.canAskAgain !== false) {
      setBackgroundPermissionGranted(null);
      await Location.requestBackgroundPermissionsAsync().catch(() => null);
      background = await Location.getBackgroundPermissionsAsync().catch(() => null);
      setBackgroundPermissionGranted(background?.granted === true);
      if (background?.granted) {
        Alert.alert(
          '位置情報の設定が完了しました',
          '「常に許可」に設定できました。準備ができたらSTARTを押してください。',
        );
        return;
      }
    } else {
      setBackgroundPermissionGranted(false);
    }

    Alert.alert(
      '設定はまだ完了していません',
      '端末設定で ZELIO の位置情報を「常に許可」にしてください。この画面へ戻ると設定状態が更新されます。',
      [
        { text: '閉じる', style: 'cancel' },
        { text: '端末設定を開く', onPress: () => { void Linking.openSettings(); } },
      ],
    );
  }

  /**
   * GPSモードの位置情報権限を、カウントダウンより前に確定させる。
   * - 使用中の許可が無ければ要求し、拒否ならランを開始しない（時間だけ進む状態を作らない）
   * - 画面OFFの記録が未設定なら、設定するか画面を開いたまま開始するかを明示する。
   * - 「設定する」は設定だけを行い、この呼び出しでは記録を開始しない。
   */
  async function ensureLocationPermission(): Promise<boolean> {
    if (!(await ensureForegroundLocationPermission())) return false;

    const background = await Location.getBackgroundPermissionsAsync().catch(() => null);
    setBackgroundPermissionGranted(background?.granted === true);
    if (!background?.granted) {
      const action = await new Promise<'configure' | 'foreground' | 'cancel'>((resolve) => {
        Alert.alert(
          '画面OFFでも記録するための設定',
          '端末の位置情報を「常に許可」にすると、画面をロックしたり他のアプリを開いたりしても計測が続きます。設定後は状態を確認して、STARTをもう一度押してください。',
          [
            { text: '画面を開いたまま開始', style: 'cancel', onPress: () => resolve('foreground') },
            { text: '設定する', onPress: () => resolve('configure') },
          ],
          { cancelable: true, onDismiss: () => resolve('cancel') },
        );
      });
      if (action === 'configure') {
        await configureBackgroundLocation();
        return false;
      }
      return action === 'foreground';
    }
    return true;
  }

  async function handleStart() {
    if (selectedMode === 'steps') {
      const permission = await Pedometer.requestPermissionsAsync().catch(() => ({ status: 'denied' as const }));
      if (permission.status !== 'granted') {
        Alert.alert('モーション権限が必要です', '歩数モードを使うには、端末設定でモーションとフィットネスを許可してください。');
        return;
      }
    } else {
      if (!(await ensureLocationPermission())) return;
      const warmupPoint = lastWarmupPointRef.current;
      const warmupAgeMs = warmupPoint ? Date.now() - warmupPoint.timestamp : Infinity;
      if (
        (gpsReadiness !== 'ready' && gpsReadiness !== 'acceptable')
        || !warmupPoint
        || warmupAgeMs < 0
        || warmupAgeMs > WARMUP_POINT_MAX_AGE_MS
      ) {
        Alert.alert(
          'GPSを準備しています',
          '正確な開始地点を取得中です。空が見える場所で「GPS 準備OK」または「開始できます」と表示されてからSTARTを押してください。',
        );
        return;
      }
    }
    setCountdown(3);
  }

  async function handleStop() {
    if (stopGuardRef.current || !isRecording) return;
    stopGuardRef.current = true;
    // 保存が主目的の操作なので default(無指定)、破壊的なのは破棄のみ。
    // 並びも「停止して保存 → 破棄する → キャンセル」とし、保存を最上段に置く。
    Alert.alert('記録を停止しますか？', '', [
      {
        text: '停止して保存',
        onPress: async () => {
          if (!user) {
            stopGuardRef.current = false;
            Alert.alert('エラー', 'ログインが必要です');
            return;
          }
          setIsSaving(true);
          let stoppedActivity: Activity | null = null;
          try {
            // 通信を待つ前に計測を止める。保存先チャレンジはCallableがサーバー側で確定する。
            const activity = await stopRecording();
            stoppedActivity = activity;
            if (voiceGuide) {
              Speech.speak(
                `記録を終了しました。${activity.distanceKm.toFixed(1)}キロメートルです`,
                { language: 'ja-JP', rate: 1.0 },
              );
            }
            const submitted = await saveActivityToFirestore({
              activity,
            });
            if (!submitted) {
              reset();
              Alert.alert(
                '記録を保存できませんでした',
                '有効な距離が計測されていないため、この記録は保存されませんでした。',
              );
              return;
            }
            const savedDistanceKm = submitted.distanceKm;
            const savedDurationSeconds = submitted.durationSeconds;
            const splits = activity.measurementType === 'gps' ? kmSplits(activity.route ?? []) : [];
            const elevation = elevationGainM(activity.route ?? []);
            reset();
            // Navigate to summary
            router.push({
              pathname: '/record/summary' as any,
              params: {
                activityId: submitted.activityId,
                distanceKm: savedDistanceKm.toFixed(2),
                durationSeconds: String(savedDurationSeconds),
                steps: String(submitted.steps ?? activity.steps ?? 0),
                pace: formatPace(savedDistanceKm, savedDurationSeconds),
                splits: JSON.stringify(splits),
                elevationGain: elevation != null ? String(elevation) : '',
                declarationAchieved: submitted.declarationAchieved ? '1' : '',
              },
            });
          } catch (e: unknown) {
            if (e instanceof ActivitySaveError && e.kind === 'queued') {
              reset();
              Alert.alert(
                '端末に保存しました',
                '通信できなかったため、記録を端末に保管しました。オンライン復帰時に自動で再送します。',
              );
            } else if (e instanceof ActivitySaveError && e.kind === 'rejected') {
              reset();
              Alert.alert(
                '記録を保存できませんでした',
                '記録データがサーバーの検証条件を満たさなかったため、再送対象には残していません。',
              );
            } else {
              if (stoppedActivity) {
                // ローカル保存自体が失敗した場合はメモリ上の記録を破棄せず、一時停止へ戻す。
                useRecordStore.setState({
                  isRecording: true,
                  isPaused: true,
                  pauseKind: 'manual',
                  pausedAt: new Date().toISOString(),
                  pausedTotalMs: stoppedActivity.pausedMs ?? 0,
                  locationMode: 'idle',
                  gpsWarning: false,
                  segmentPending: true,
                });
              }
              Alert.alert(
                '端末への保存に失敗しました',
                '記録を端末の再送キューへ保存できなかったため、一時停止状態に戻しました。空き容量を確認して、もう一度停止してください。',
              );
            }
            console.error('saveActivityToFirestore error:', e);
          } finally {
            setIsSaving(false);
            stopGuardRef.current = false;
          }
        },
      },
      {
        text: '破棄する',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'この記録を破棄しますか？',
            '距離・ルート・歩数は保存されず、元に戻せません。',
            [
              { text: '戻る', style: 'cancel', onPress: () => { stopGuardRef.current = false; } },
              {
                text: '破棄する',
                style: 'destructive',
                onPress: () => {
                  Speech.stop();
                  reset();
                  stopGuardRef.current = false;
                },
              },
            ],
          );
        },
      },
      {
        text: 'キャンセル',
        style: 'cancel',
        onPress: () => { stopGuardRef.current = false; },
      },
    ]);
  }

  const lastPoint = route[route.length - 1];

  // ─── PRE-RECORDING ────────────────────────────────────────
  if (!isRecording) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <ScrollView contentContainerStyle={s.preScroll} showsVerticalScrollIndicator={false}>
          <View style={s.preHeader}>
            <Text style={s.preEyebrow}>ZELIO</Text>
            <Text style={s.preTitle}>ラン</Text>
          </View>

          {/* Mode toggle */}
          <View style={s.modeToggle}>
            {(['gps', 'steps'] as MeasurementType[]).map((mode) => {
              const active = selectedMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[s.modeBtn, active && s.modeBtnActive]}
                  onPress={() => {
                    if (mode === 'steps' && !isStepAvailable) {
                      Alert.alert('歩数センサー非対応', 'GPSモードをご利用ください。');
                      return;
                    }
                    setSelectedMode(mode);
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={mode === 'gps' ? 'GPSモード' : '歩数モード'}
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={mode === 'gps' ? 'navigate-outline' : 'footsteps-outline'}
                    size={14}
                    color={active ? Colors.textPrimary : Colors.textTertiary}
                  />
                  <Text style={[s.modeBtnText, active && s.modeBtnTextActive]}>
                    {mode === 'gps' ? 'GPSモード' : '歩数'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {selectedMode === 'steps' && (
            <Text style={s.stepsFairnessNote}>
              個人記録には全距離を保存し、チャレンジには1日{STEP_BATTLE_DAILY_CAP_KM}kmまで加算されます
            </Text>
          )}

          {/* Voice coach settings */}
          <View style={s.voiceRow}>
            <TouchableOpacity
              style={s.voiceSettingsButton}
              onPress={() => setShowVoiceSettings(true)}
              accessibilityRole="button"
              accessibilityLabel="音声コーチの設定を開く"
            >
              <Ionicons name="volume-medium-outline" size={16} color={voiceGuide ? Colors.primaryDark : Colors.textTertiary} />
              <View style={s.voiceLabelWrap}>
                <Text style={[s.voiceLabel, voiceGuide && { color: Colors.primaryDark }]}>音声コーチ</Text>
                {voiceGuide && (
                  <Text style={s.voiceSummary}>
                    {voiceSettings.intervalType === 'distance'
                      ? `${voiceSettings.distanceKm}kmごと`
                      : `${voiceSettings.timeMinutes}分ごと`}
                  </Text>
                )}
              </View>
              <Ionicons name="settings-outline" size={15} color={Colors.textTertiary} />
            </TouchableOpacity>
            <Switch
              value={voiceGuide}
              onValueChange={(enabled) => updateVoiceSettings({ enabled })}
              trackColor={{ false: Colors.surfaceGray, true: `${Colors.primary}60` }}
              thumbColor={voiceGuide ? Colors.primary : Colors.textTertiary}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>

          {/* Auto pause toggle (GPS only) */}
          {selectedMode === 'gps' && (
            <View style={s.voiceRow}>
              <Ionicons name="pause-circle-outline" size={16} color={autoPauseEnabled ? Colors.primaryDark : Colors.textTertiary} />
              <View style={s.voiceLabelWrap}>
                <View style={s.autoPauseTitleRow}>
                  <Text style={[s.voiceLabel, autoPauseEnabled && { color: Colors.primaryDark }]}>オートポーズ</Text>
                  <Text style={s.experimentalBadge} maxFontSizeMultiplier={1.3}>試験的</Text>
                </View>
                <Text style={s.voiceSummary}>停止を誤検知する場合があります（初期設定OFF）</Text>
              </View>
              <Switch
                value={autoPauseEnabled}
                onValueChange={setAutoPauseEnabled}
                trackColor={{ false: Colors.surfaceGray, true: `${Colors.primary}60` }}
                thumbColor={autoPauseEnabled ? Colors.primary : Colors.textTertiary}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>
          )}

          {/* Goal chips */}
          <View style={s.goalRow}>
            <Text style={s.goalRowLabel}>目標</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.goalChips}>
              {GOAL_OPTIONS.map((option, idx) => {
                const active = selectedGoalIdx === idx;
                return (
                  <TouchableOpacity
                    key={option.label}
                    style={[s.goalChip, active && s.goalChipActive]}
                    onPress={() => setSelectedGoalIdx(idx)}
                    accessibilityRole="radio"
                    accessibilityLabel={`目標 ${option.label}`}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.goalChipText, active && s.goalChipTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* START button */}
          <View style={s.startArea}>
            {declarationBattle && (
              <TouchableOpacity
                style={s.declarationGuide}
                onPress={() => router.push('/(tabs)/battle' as any)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="今日のラン宣言を開く"
              >
                <View style={s.declarationGuideIcon}>
                  <Ionicons name={ownDeclaration?.status === 'done' ? 'checkmark' : 'flag-outline'} size={16} color={Colors.accentDark} />
                </View>
                <View style={s.declarationGuideCopy}>
                  <Text style={s.declarationGuideTitle} numberOfLines={1}>
                    {ownDeclaration?.status === 'done'
                      ? '今日のラン宣言を達成しました'
                      : ownDeclaration
                        ? `今日の予定：${declarationTimeLabel(ownDeclaration.plannedAt, ownDeclaration.timezone)}`
                        : '今日、走る予定はありますか？'}
                  </Text>
                  <Text style={s.declarationGuideBattle} numberOfLines={1}>{declarationBattle.title}</Text>
                </View>
                <Text style={s.declarationGuideAction}>{ownDeclaration?.status === 'planned' ? '変更' : ownDeclaration ? '確認' : '宣言する'}</Text>
                <Ionicons name="chevron-forward" size={15} color={Colors.textTertiary} />
              </TouchableOpacity>
            )}
            <View style={s.startStack}>
              <Animated.View style={[s.startRing, { transform: [{ rotate: ringRotate }] }]} />
              <TouchableOpacity
                style={s.startBtn}
                onPress={handleStart}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="ランの記録を開始"
              >
                {/* 英字STARTは装飾扱い（意味は accessibilityLabel とヒント文が担う）。
                    固定120pt円からはみ出て「STA」に切れるため、このテキストだけ倍率上限を設ける */}
                <Text style={s.startLabel} maxFontSizeMultiplier={1.2}>START</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.startHint}>タップしてラン開始</Text>

            {/* GPS readiness */}
            {gpsReadiness !== null && (
              <View style={s.gpsChip}>
                <View
                  style={[
                    s.gpsDot,
                    gpsReadiness === 'ready' && { backgroundColor: Colors.primary },
                    gpsReadiness === 'acceptable' && { backgroundColor: Colors.accent },
                    (gpsReadiness === 'approximate'
                      || gpsReadiness === 'services-disabled'
                      || gpsReadiness === 'unavailable') && { backgroundColor: Colors.accent },
                  ]}
                />
                <Text style={s.gpsChipText}>
                  {gpsReadiness === 'preparing' && 'GPS 準備中…'}
                  {gpsReadiness === 'ready' && 'GPS 準備OK'}
                  {gpsReadiness === 'acceptable' && 'GPS精度はやや低めですが開始できます'}
                  {gpsReadiness === 'no-permission' && '位置情報は開始時に許可できます'}
                  {gpsReadiness === 'approximate' && '正確な位置情報を設定してください'}
                  {gpsReadiness === 'services-disabled' && '端末の位置情報サービスがOFFです'}
                  {gpsReadiness === 'unavailable' && 'GPS信号を取得できません'}
                </Text>
              </View>
            )}

            {selectedMode === 'gps' && (
              <View style={[
                s.backgroundStatusCard,
                backgroundPermissionGranted === true && s.backgroundStatusCardEnabled,
              ]} accessibilityLiveRegion="polite">
                <Ionicons
                  name={backgroundPermissionGranted === true
                    ? 'checkmark-circle'
                    : backgroundPermissionGranted === null
                      ? 'time-outline'
                      : 'lock-closed-outline'}
                  size={20}
                  color={backgroundPermissionGranted === true ? Colors.primary : Colors.textSecondary}
                />
                <View style={s.backgroundStatusCopy}>
                  <Text style={s.backgroundStatusTitle}>
                    {backgroundPermissionGranted === null
                      ? '画面OFFの位置情報を確認中…'
                      : backgroundPermissionGranted
                        ? '画面OFFの位置情報：許可済み'
                        : '画面OFFの位置情報：未設定'}
                  </Text>
                  <Text style={s.backgroundStatusHint}>
                    {backgroundPermissionGranted === null
                      ? '端末の権限状態を確認しています'
                      : backgroundPermissionGranted
                        ? '記録開始後にも実際の動作状態を表示します'
                        : '未設定では、この画面を開いたままにしてください'}
                  </Text>
                </View>
                {backgroundPermissionGranted === false && (
                  <TouchableOpacity
                    style={s.backgroundSettingsButton}
                    onPress={() => { void configureBackgroundLocation(); }}
                    accessibilityRole="button"
                    accessibilityLabel="画面OFFでも記録する設定を開く"
                  >
                    <Text style={s.backgroundSettingsButtonText}>設定</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Challenge connection badge */}
            {currentActiveBattles.length === 1 ? (
              <View style={s.contribBadge}>
                <Text style={s.contribBadgeText}>
                  このランは「{currentActiveBattles[0].title}」に加算されます
                </Text>
              </View>
            ) : currentActiveBattles.length > 1 ? (
              <View style={s.contribBadge}>
                <Text style={s.contribBadgeText}>
                  このランは参加中の{currentActiveBattles.length}件のチャレンジに加算されます
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.contribBadge, { backgroundColor: `${Colors.textTertiary}18` }]}
                onPress={() => router.push('/(tabs)/battle' as any)}
                activeOpacity={0.7}
              >
                <Text style={[s.contribBadgeText, { color: Colors.textSecondary }]}>
                  チャレンジに参加するとこのランが加算されます
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 前回のラン・今週 */}
          <View style={s.preData}>
            {recentLoading ? (
              <>
                <View style={s.skelLine} />
                <View style={s.skelBlock} />
              </>
            ) : last ? (
              <>
                <SectionHeader label="前回のラン" />
                <TouchableOpacity
                  style={s.lastRunCard}
                  onPress={() => router.push(`/activity/${last.id}` as any)}
                  activeOpacity={0.65}
                  accessibilityRole="button"
                  accessibilityLabel={`前回のラン、距離${last.distanceKm.toFixed(1)}キロ、時間${formatTime(last.durationSeconds)}、${relativeDay(last.startedAt)}`}
                >
                  <View style={[s.lastRunContent, fontScale >= 2 && s.lastRunContentLarge]}>
                    <View style={s.lastRunIcon}>
                      <Ionicons
                        name={last.measurementType === 'steps' ? 'footsteps-outline' : 'navigate-outline'}
                        size={18}
                        color={Colors.primary}
                      />
                    </View>
                    <View style={s.lastRunMetrics}>
                      <Text style={s.lastRunMetric}>距離 {last.distanceKm.toFixed(1)}km</Text>
                      <Text style={s.lastRunMetric}>時間 {formatTime(last.durationSeconds)}</Text>
                    </View>
                    <View style={s.lastRunRight}>
                      <Text style={s.lastRunAgo}>{relativeDay(last.startedAt)}</Text>
                      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                    </View>
                  </View>
                </TouchableOpacity>

                <View style={s.weekHead}>
                  <Text style={TextStyles.sectionTitle}>今週</Text>
                  <StreakChip days={streak} />
                </View>
                <WeeklyBarChart days={weekBuckets} height={40} compact />
              </>
            ) : (
              <EmptyState
                icon="walk-outline"
                title="最初のランを記録しよう"
                hint="STARTを押して走り出そう"
              />
            )}
          </View>
        </ScrollView>

        {/* Countdown overlay */}
        {countdown !== null && (
          <Pressable
            style={s.countdownOverlay}
            onPress={() => setCountdown(null)}
            accessibilityRole="button"
            accessibilityLabel="カウントダウンをキャンセル"
          >
            <Text style={s.countdownNum}>{countdown}</Text>
            <Text style={s.countdownHint}>タップでキャンセル</Text>
          </Pressable>
        )}

        <VoiceCoachSettingsModal
          visible={showVoiceSettings}
          settings={voiceSettings}
          onChange={updateVoiceSettings}
          onClose={() => setShowVoiceSettings(false)}
        />
      </SafeAreaView>
    );
  }

  // ─── RECORDING (dark HUD) ──────────────────────────────────
  return (
    <View style={s.hudRoot}>
      {/* Header */}
      <SafeAreaView edges={['top']}>
        <View style={s.hudHeader}>
          <Animated.View
            style={[
              s.recDot,
              { opacity: isPaused ? 1 : recDotAnim },
              isPaused && { backgroundColor: DarkColors.textTertiary },
            ]}
          />
          <MonoLabel color={DarkColors.textTertiary} size={9}>
            {pauseKind === 'auto' ? decorLabel('自動停止中', 'AUTO PAUSED') : isPaused ? decorLabel('一時停止中', 'PAUSED') : decorLabel('記録中', 'RUN IN PROGRESS')}
          </MonoLabel>
        </View>
      </SafeAreaView>

      {/* Distance hero */}
      <View style={s.hudHero}>
        <MonoLabel color={DarkColors.primary} size={9}>距離</MonoLabel>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
          <Text style={s.hudBigNum}>{distanceKm.toFixed(2)}</Text>
          <Text style={s.hudUnit}>KM</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={s.hudStatsRow}>
        <View style={s.hudStat}>
          <StatBlock
            dark
            align="center"
            label={measurementType === 'steps' ? '歩数' : 'ペース'}
            value={measurementType === 'steps' ? steps.toLocaleString() : formatPace(distanceKm, elapsed)}
            unit={measurementType === 'gps' ? '/km' : undefined}
          />
        </View>
        <View style={s.hudStatDivider} />
        <View style={s.hudStat}>
          <StatBlock dark align="center" label="時間" value={formatTime(elapsed)} />
        </View>
      </View>

      {/* Goal progress */}
      {goal && (() => {
        const progress = goal.type === 'distance' ? distanceKm / goal.value : elapsed / goal.value;
        const achieved = progress >= 1;
        const remainText = goal.type === 'distance'
          ? `残り ${Math.max(0, goal.value - distanceKm).toFixed(1)}km`
          : `残り ${formatTime(Math.max(0, goal.value - elapsed))}`;
        return (
          <View style={s.hudGoalRow}>
            <View style={s.hudGoalHead}>
              <Text style={s.hudGoalLabel}>目標 {goalLabel(goal)}</Text>
              <Text style={[s.hudGoalRemain, achieved && { color: DarkColors.primary }]}>
                {achieved ? '達成！' : remainText}
              </Text>
            </View>
            <ProgressBar
              value={progress}
              color={DarkColors.primary}
              trackColor={DarkColors.surface}
              height={6}
            />
          </View>
        );
      })()}

      {/* Challenge contribution preview */}
      {currentActiveBattles.length > 0 && (
        <View style={s.hudContribRow}>
          <Text style={s.hudContribText}>
            {measurementType === 'steps'
              ? `歩数モードは各チャレンジへ1日${STEP_BATTLE_DAILY_CAP_KM}kmまで加算`
              : currentActiveBattles.length === 1
                ? `+${distanceKm.toFixed(2)}km → 「${currentActiveBattles[0].title}」に加算`
                : `+${distanceKm.toFixed(2)}km → 参加中の${currentActiveBattles.length}件のチャレンジに加算`}
          </Text>
        </View>
      )}

      {hudCheerName && (
        <View style={s.hudCheerBanner} accessibilityLiveRegion="polite">
          <Ionicons name="flame" size={15} color={DarkColors.accent} />
          <Text style={s.hudCheerText}>{hudCheerName}さんから応援が届きました</Text>
        </View>
      )}

      {/* 一時停止バナー */}
      {isPaused && (
        <View style={s.warnBanner}>
          <Ionicons name="pause-circle-outline" size={14} color={DarkColors.accent} />
          <Text style={s.warnBannerText}>
            {pauseKind === 'auto'
              ? '自動停止中 — 動き出すと自動で再開します'
              : '一時停止中 — この間の移動と時間は記録されません'}
          </Text>
        </View>
      )}

      {/* GPS追跡状態の警告バナー */}
      {!isPaused && measurementType === 'gps' && gpsWarning && (
        <View style={s.warnBanner}>
          <Ionicons name="warning-outline" size={14} color={DarkColors.accent} />
          <Text style={s.warnBannerText}>GPS信号が不安定です。画面を開いたまま走ってください</Text>
        </View>
      )}
      {!isPaused && measurementType === 'gps' && !gpsWarning && locationMode === 'foreground' && (
        <View style={s.warnBanner}>
          <Ionicons name="warning-outline" size={14} color={DarkColors.accent} />
          <Text style={s.warnBannerText}>アプリを閉じると記録が止まる可能性があります</Text>
        </View>
      )}
      {!isPaused && measurementType === 'gps' && locationMode === 'denied' && (
        <View style={s.warnBanner}>
          <Ionicons name="warning-outline" size={14} color={DarkColors.accent} />
          <Text style={s.warnBannerText}>位置情報の権限がありません。設定から許可してください</Text>
        </View>
      )}
      {!isPaused && measurementType === 'gps' && !gpsWarning && locationMode === 'background' && (
        <View style={s.hudReadyBanner}>
          <Ionicons name="checkmark-circle-outline" size={14} color={DarkColors.primary} />
          <Text style={s.hudReadyBannerText}>画面OFFでも記録できます</Text>
        </View>
      )}
      {!isPaused && measurementType === 'steps' && (
        <View style={s.warnBanner}>
          <Ionicons name="information-circle-outline" size={14} color={DarkColors.accent} />
          <Text style={s.warnBannerText}>歩数モードは画面を閉じると計測が止まる場合があります</Text>
        </View>
      )}

      {/* Map */}
      {measurementType === 'gps' ? (
        lastPoint ? (
          <MapView
            style={s.hudMap}
            provider={PROVIDER_DEFAULT}
            showsUserLocation
            followsUserLocation
            initialRegion={{
              latitude: lastPoint.lat, longitude: lastPoint.lng,
              latitudeDelta: 0.005, longitudeDelta: 0.005,
            }}
          >
            {route.length > 1 && (
              <Polyline
                coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
                strokeColor={DarkColors.primary}
                strokeWidth={3}
              />
            )}
          </MapView>
        ) : (
          <View style={[s.hudMap, s.hudMapPlaceholder]}>
            <ActivityIndicator color={DarkColors.primary} />
            <Text style={{ color: DarkColors.textTertiary, marginTop: 8, fontSize: 12 }}>GPS信号を取得中...</Text>
          </View>
        )
      ) : (
        <View style={[s.hudMap, s.hudMapPlaceholder]}>
          <Ionicons name="footsteps-outline" size={48} color={DarkColors.textTertiary} />
          <Text style={{ color: DarkColors.textTertiary, marginTop: 12, fontSize: 14, fontWeight: '700' }}>
            歩数モード
          </Text>
        </View>
      )}

      {/* PAUSE / RESUME / STOP buttons */}
      <View style={s.hudControls}>
        {isSaving ? (
          <ActivityIndicator color={DarkColors.primary} size="large" />
        ) : (
          <>
            <View style={s.hudControl}>
              <TouchableOpacity
                style={[s.pauseBtn, pauseKind === 'manual' && s.resumeBtn]}
                onPress={pauseKind === 'manual' ? resumeRecording : pauseRecording}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={
                  pauseKind === 'manual'
                    ? 'ランの記録を再開'
                    : pauseKind === 'auto'
                      ? '自動停止を手動停止へ切り替え'
                      : 'ランの記録を一時停止'
                }
              >
                <Ionicons
                  name={pauseKind === 'manual' ? 'play' : 'pause'}
                  size={30}
                  color={pauseKind === 'manual' ? DarkColors.background : DarkColors.textPrimary}
                />
              </TouchableOpacity>
              <Text style={s.stopLabel}>
                {pauseKind === 'manual' ? '再開' : pauseKind === 'auto' ? '手動停止' : '一時停止'}
              </Text>
            </View>
            <View style={s.hudControl}>
              <TouchableOpacity
                style={s.stopBtn}
                onPress={handleStop}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="ランの記録を停止"
              >
                <View style={s.stopSquare} />
              </TouchableOpacity>
              <Text style={s.stopLabel}>停止</Text>
            </View>
          </>
        )}
      </View>

    </View>
  );
}

function VoiceCoachSettingsModal({
  visible, settings, onChange, onClose,
}: {
  visible: boolean;
  settings: VoiceCoachSettings;
  onChange: (patch: Partial<VoiceCoachSettings>) => void;
  onClose: () => void;
}) {
  const contentOptions: { key: keyof VoiceCoachSettings; label: string }[] = [
    { key: 'announceElapsed', label: '経過時間' },
    { key: 'announceDistance', label: '距離' },
    { key: 'announceLapPace', label: '直近ラップペース' },
    { key: 'announceAveragePace', label: '平均ペース' },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetRoot}>
        <Pressable style={s.sheetBackdrop} onPress={onClose} />
        <SafeAreaView style={s.sheet} edges={['bottom']}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View>
              <Text style={s.sheetTitle}>音声コーチ</Text>
              <Text style={s.sheetHint}>ラン中に聞きたい情報を選べます</Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(enabled) => onChange({ enabled })}
              trackColor={{ false: Colors.surfaceGray, true: `${Colors.primary}60` }}
              thumbColor={settings.enabled ? Colors.primary : Colors.textTertiary}
            />
          </View>

          <Text style={s.sheetSectionLabel}>読み上げ間隔</Text>
          <View style={s.sheetSegment}>
            {(['distance', 'time'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[s.sheetSegmentButton, settings.intervalType === type && s.sheetSegmentButtonActive]}
                onPress={() => onChange({ intervalType: type })}
              >
                <Text style={[s.sheetSegmentText, settings.intervalType === type && s.sheetSegmentTextActive]}>
                  {type === 'distance' ? '距離ごと' : '時間ごと'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.sheetChips}>
            {(settings.intervalType === 'distance' ? [0.5, 1, 2] as const : [5, 10] as const).map((value) => {
              const active = settings.intervalType === 'distance'
                ? settings.distanceKm === value
                : settings.timeMinutes === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[s.sheetChip, active && s.sheetChipActive]}
                  onPress={() => settings.intervalType === 'distance'
                    ? onChange({ distanceKm: value as VoiceCoachSettings['distanceKm'] })
                    : onChange({ timeMinutes: value as VoiceCoachSettings['timeMinutes'] })}
                >
                  <Text style={[s.sheetChipText, active && s.sheetChipTextActive]}>
                    {value}{settings.intervalType === 'distance' ? 'km' : '分'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.sheetSectionLabel}>読み上げる内容</Text>
          <View style={s.sheetOptions}>
            {contentOptions.map((option) => (
              <View key={option.key} style={s.sheetOptionRow}>
                <Text style={s.sheetOptionLabel}>{option.label}</Text>
                <Switch
                  value={settings[option.key] as boolean}
                  onValueChange={(value) => onChange({ [option.key]: value })}
                  trackColor={{ false: Colors.surfaceGray, true: `${Colors.primary}60` }}
                  thumbColor={settings[option.key] ? Colors.primary : Colors.textTertiary}
                  style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                />
              </View>
            ))}
          </View>
          <TouchableOpacity style={s.sheetDoneButton} onPress={onClose}>
            <Text style={s.sheetDoneText}>完了</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  // Pre-recording (light)
  root: { flex: 1, backgroundColor: Colors.background },
  preScroll: { paddingBottom: 110 },
  preHeader: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  preEyebrow: { fontSize: 10, fontWeight: '700', color: Colors.textTertiary, letterSpacing: 1.8 },
  preTitle: {
    marginTop: 2,
    fontSize: 26, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5,
  },

  voiceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 40,
    marginTop: 10,
  },
  voiceSettingsButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  voiceLabelWrap: { flex: 1 },
  voiceLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  voiceSummary: { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  // 特大文字サイズでバッジがスイッチ側へはみ出さないよう折り返しを許可する
  autoPauseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  experimentalBadge: {
    fontSize: 9, fontWeight: '800', color: Colors.accentDark,
    backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  modeToggle: {
    flexDirection: 'row', gap: 4, padding: 4,
    backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.full,
    marginHorizontal: 40, marginTop: 20,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.full,
  },
  modeBtnActive: {
    backgroundColor: Colors.surface,
    ...Shadow.sm,
  },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textTertiary },
  modeBtnTextActive: { color: Colors.textPrimary },
  stepsFairnessNote: {
    marginHorizontal: 40, marginTop: 8,
    fontSize: 10, lineHeight: 15, color: Colors.textSecondary, textAlign: 'center',
  },

  startArea: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 36 },
  declarationGuide: {
    width: '88%', maxWidth: 360, minHeight: 48,
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  declarationGuideIcon: {
    width: 30, height: 30, borderRadius: BorderRadius.full,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentLight,
  },
  declarationGuideCopy: { flex: 1, minWidth: 0 },
  declarationGuideTitle: { fontSize: 11, fontWeight: '800', color: Colors.textPrimary },
  declarationGuideBattle: { marginTop: 2, fontSize: 9, color: Colors.textSecondary },
  declarationGuideAction: { fontSize: 10, fontWeight: '800', color: Colors.primaryDark },
  startStack: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  startRing: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 90,
    borderWidth: 2, borderColor: Colors.primaryBorder,
    borderStyle: 'dashed',
  },
  startBtn: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accentDark, shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.34, shadowRadius: 28, elevation: 12,
  },
  startLabel: { fontSize: 38, fontWeight: '900', color: Colors.textOnAccent, letterSpacing: 2 },
  startHint: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },

  goalRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingLeft: 40,
    marginTop: 12,
  },
  goalRowLabel: { fontSize: 13, fontWeight: '600' as const, color: Colors.textSecondary },
  goalChips: { flexDirection: 'row' as const, gap: 6, paddingRight: 20 },
  goalChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  goalChipActive: { backgroundColor: Colors.primary },
  goalChipText: { fontSize: 12, fontWeight: '700' as const, color: Colors.textTertiary },
  goalChipTextActive: { color: Colors.textOnPrimary },

  gpsChip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceAlt,
  },
  gpsDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.textTertiary },
  gpsChipText: { fontSize: 11, fontWeight: '700' as const, color: Colors.textSecondary },
  backgroundStatusCard: {
    width: '88%', maxWidth: 360,
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    paddingHorizontal: 13, paddingVertical: 11,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backgroundStatusCardEnabled: {
    borderColor: Colors.primaryBorder,
    backgroundColor: Colors.primaryLight,
  },
  backgroundStatusCopy: { flex: 1 },
  backgroundStatusTitle: { fontSize: 12, fontWeight: '800' as const, color: Colors.textPrimary },
  backgroundStatusHint: { marginTop: 2, fontSize: 10, lineHeight: 14, color: Colors.textSecondary },
  backgroundSettingsButton: {
    minWidth: 52, minHeight: 34, paddingHorizontal: 10,
    borderRadius: BorderRadius.full, backgroundColor: Colors.primary,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  backgroundSettingsButtonText: { fontSize: 11, fontWeight: '800' as const, color: Colors.textOnPrimary },

  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: `${DarkColors.background}F2`,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 16,
  },
  countdownNum: {
    fontSize: 140, fontWeight: '900' as const, color: DarkColors.textPrimary,
    fontVariant: ['tabular-nums'] as const, letterSpacing: -4,
  },
  countdownHint: { fontSize: 13, fontWeight: '600' as const, color: DarkColors.textTertiary },

  contribBadge: {
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.full,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  contribBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.primary, textAlign: 'center' },

  // 開始前 下段データ
  preData: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.md },
  lastRunCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  lastRunContent: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  lastRunContentLarge: { alignItems: 'flex-start', flexWrap: 'wrap' },
  lastRunIcon: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceGray,
  },
  lastRunMetrics: { flex: 1, minWidth: 150, gap: 2 },
  lastRunMetric: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  lastRunRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lastRunAgo: { fontSize: 13, color: Colors.textTertiary, fontWeight: '600', fontVariant: ['tabular-nums'] },
  weekHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  skelLine: { height: 16, width: '40%', borderRadius: 6, backgroundColor: Colors.surfaceGray },
  skelBlock: { height: 64, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceGray },

  // Recording (dark HUD)
  hudRoot: { flex: 1, backgroundColor: DarkColors.background },
  hudHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  recDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: DarkColors.accent,
  },
  hudHero: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  hudBigNum: {
    fontSize: 80, fontWeight: '900', color: DarkColors.textPrimary,
    letterSpacing: -3, lineHeight: 80, fontVariant: ['tabular-nums'],
  },
  hudUnit: { fontSize: 28, fontWeight: '700', color: DarkColors.textTertiary, letterSpacing: 1 },
  hudContribRow: {
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: DarkColors.primarySoft,
    borderRadius: BorderRadius.sm, paddingHorizontal: 14, paddingVertical: 8,
  },
  hudContribText: { fontSize: 11, fontWeight: '700', color: DarkColors.primary, textAlign: 'center' },
  hudCheerBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: DarkColors.primarySoft,
    borderRadius: BorderRadius.sm, paddingHorizontal: 14, paddingVertical: 9,
  },
  hudCheerText: { fontSize: 11, fontWeight: '700', color: DarkColors.primaryTint, textAlign: 'center' },
  warnBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, marginBottom: 8, gap: 6,
    backgroundColor: DarkColors.accentSoft,
    borderRadius: BorderRadius.sm, paddingHorizontal: 14, paddingVertical: 8,
  },
  warnBannerText: { fontSize: 11, fontWeight: '700', color: DarkColors.accent, textAlign: 'center' },
  hudReadyBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, marginBottom: 8, gap: 6,
    backgroundColor: DarkColors.primarySoft,
    borderRadius: BorderRadius.sm, paddingHorizontal: 14, paddingVertical: 8,
  },
  hudReadyBannerText: { fontSize: 11, fontWeight: '700', color: DarkColors.primary, textAlign: 'center' },
  hudStatsRow: {
    flexDirection: 'row',
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: DarkColors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: DarkColors.line,
  },
  hudStat: { flex: 1, alignItems: 'center', padding: 16 },
  hudStatVal: {
    fontSize: 22, fontWeight: '700', color: DarkColors.textPrimary,
    letterSpacing: -0.5, marginTop: 4, fontVariant: ['tabular-nums'],
  },
  hudStatUnit: { fontSize: 10, color: DarkColors.textTertiary },
  hudStatDivider: { width: 1, backgroundColor: DarkColors.line },
  hudMap: {
    flex: 1, marginHorizontal: 20, marginBottom: 16, borderRadius: BorderRadius.lg, overflow: 'hidden',
  },
  hudMapPlaceholder: {
    backgroundColor: DarkColors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  hudGoalRow: {
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: DarkColors.surfaceDeep,
    borderRadius: BorderRadius.sm, paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  hudGoalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hudGoalLabel: { fontSize: 11, fontWeight: '700', color: DarkColors.textTertiary },
  hudGoalRemain: { fontSize: 11, fontWeight: '800', color: DarkColors.textPrimary, fontVariant: ['tabular-nums'] },

  hudControls: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    gap: 40, paddingBottom: 32, minHeight: 104,
  },
  hudControl: { alignItems: 'center', gap: 8 },
  pauseBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: DarkColors.surface, borderWidth: 2, borderColor: DarkColors.lineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  resumeBtn: {
    backgroundColor: DarkColors.primary, borderColor: DarkColors.primary,
  },
  stopBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: DarkColors.surface, borderWidth: 2, borderColor: DarkColors.lineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  stopSquare: {
    width: 24, height: 24, borderRadius: 4,
    backgroundColor: DarkColors.stop,
  },
  stopLabel: { fontSize: 12, color: DarkColors.textTertiary, fontWeight: '600', letterSpacing: 0.5 },

  // Voice coach bottom sheet
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: DarkColors.modalBackdrop },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: BorderRadius.full,
    backgroundColor: Colors.border, marginBottom: Spacing.lg,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  sheetHint: { fontSize: 11, color: Colors.textTertiary, marginTop: 3 },
  sheetSectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  sheetSegment: { flexDirection: 'row', gap: 4, backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.md, padding: 4 },
  sheetSegmentButton: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: BorderRadius.sm },
  sheetSegmentButtonActive: { backgroundColor: Colors.surface, ...Shadow.sm },
  sheetSegmentText: { fontSize: 12, fontWeight: '700', color: Colors.textTertiary },
  sheetSegmentTextActive: { color: Colors.textPrimary },
  sheetChips: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  sheetChip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceGray },
  sheetChipActive: { backgroundColor: Colors.primary },
  sheetChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  sheetChipTextActive: { color: Colors.textOnPrimary },
  sheetOptions: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  sheetOptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  sheetOptionLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  sheetDoneButton: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.xl, marginBottom: Spacing.md },
  sheetDoneText: { color: Colors.textOnPrimary, fontSize: 15, fontWeight: '800' },

});
