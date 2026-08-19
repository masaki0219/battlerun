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
import type { Activity, MeasurementType, RoutePoint, RunGoal } from '../../types';
import { ActionColors, Colors, DarkColors, Spacing, BorderRadius, Shadow, TextStyles } from '../../design_tokens';
import { MonoLabel } from '../../components/ui/MonoLabel';
import { StatBlock } from '../../components/ui/StatBlock';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { ListRow } from '../../components/ui/ListRow';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { WeeklyBarChart } from '../../components/viz/WeeklyBarChart';
import { StreakChip } from '../../components/viz/StreakChip';
import { formatRunDistanceKm, rollingWeekBuckets, streakDays, lastRun, relativeDay, kmSplits } from '../../utils/displayStats';
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
import { intlLocale, useTranslation } from '../../lib/i18n';
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

const GOAL_OPTIONS: { goal: RunGoal | null }[] = [
  { goal: null },
  { goal: { type: 'distance', value: 3 } },
  { goal: { type: 'distance', value: 5 } },
  { goal: { type: 'distance', value: 10 } },
  { goal: { type: 'duration', value: 1800 } },
  { goal: { type: 'duration', value: 3600 } },
];

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

function displayRouteSegments(points: RoutePoint[]): RoutePoint[][] {
  const segments: RoutePoint[][] = [];
  for (const point of points) {
    if (segments.length === 0 || point.seg === true) segments.push([point]);
    else segments[segments.length - 1].push(point);
  }
  return segments.filter((segment) => segment.length > 1);
}

export default function RecordScreen() {
  const { language, t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const { user } = useAuthStore();
  const {
    publicBattles, privateBattles, myMemberships,
    getActiveBattleIds, fetchMyMemberships, fetchMyPrivateBattles, fetchPublicBattles,
    declarationsByBattle, subscribeDeclarations,
  } = useBattleStore();
  const {
    isRecording, isPaused, pauseKind, autoPauseEnabled, measurementType, distanceKm, steps, displayRoute, locationMode, gpsWarning, goal, startedAt,
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
  const declarationCategoryId = declarationBattle
    ? myMemberships.find((membership) => membership.battleId === declarationBattle.id)?.categoryId ?? null
    : null;
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
    if (!declarationBattle || !declarationCategoryId || !user) return;
    return subscribeDeclarations(declarationBattle.id, user.id, declarationCategoryId);
  }, [declarationBattle?.id, declarationCategoryId, user?.id]);

  // 開始前の下段データ（前回のラン・週間ミニバー・ストリーク）
  const { activities: recentActivities, loading: recentLoading } = useRecentActivities(20);
  const last = lastRun(recentActivities);
  const weekBuckets = rollingWeekBuckets(recentActivities, new Date(), language);
  const streak = streakDays(recentActivities);

  const [selectedMode, setSelectedMode] = useState<MeasurementType>('gps');
  const [isSaving, setIsSaving] = useState(false);
  const [isStepAvailable, setIsStepAvailable] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceCoachSettings>(DEFAULT_VOICE_COACH_SETTINGS);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [selectedGoalIdx, setSelectedGoalIdx] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownTargetAt, setCountdownTargetAt] = useState<number | null>(null);
  const [gpsReadiness, setGpsReadiness] = useState<GpsReadiness | null>(null);
  const [gpsWarmupRestartKey, setGpsWarmupRestartKey] = useState(0);
  const [backgroundPermissionGranted, setBackgroundPermissionGranted] = useState<boolean | null>(null);
  const [showStopSheet, setShowStopSheet] = useState(false);
  const [hudCheerName, setHudCheerName] = useState<string | null>(null);
  const spokenIntervalRef = useRef(0);
  const lastVoiceDistanceRef = useRef(0);
  const lastVoiceElapsedRef = useRef(0);
  const goalAnnouncedRef = useRef(false);
  const lastKmHapticRef = useRef(0);
  const lastCountdownHapticRef = useRef<number | null>(null);
  const stopGuardRef = useRef(false);
  const finishingCountdownRef = useRef(false);
  const previousGpsReadinessRef = useRef<GpsReadiness | null>(null);
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

  useEffect(() => {
    const wasReady = previousGpsReadinessRef.current === 'ready';
    if (gpsReadiness === 'ready' && !wasReady) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    previousGpsReadinessRef.current = gpsReadiness;
  }, [gpsReadiness]);

  const voiceGuide = voiceSettings.enabled;
  const speechLanguage = intlLocale(language);
  const goalOptions = GOAL_OPTIONS.map(({ goal }) => ({
    goal,
    label: goal
      ? goal.type === 'distance'
        ? `${goal.value}km`
        : t('run.minutesValue', { count: Math.round(goal.value / 60) })
      : t('run.noGoal'),
  }));
  const formatGoalLabel = (runGoal: RunGoal) => runGoal.type === 'distance'
    ? `${runGoal.value}km`
    : t('run.minutesValue', { count: Math.round(runGoal.value / 60) });

  useEffect(() => {
    if (!latestRunCheer) return;
    setHudCheerName(latestRunCheer.senderName);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (voiceSettings.enabled) {
      Speech.speak(t('run.cheerSpeech', { name: latestRunCheer.senderName }), { language: speechLanguage, rate: 1.0 });
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
    }, language);
    lastVoiceElapsedRef.current = elapsed;
    lastVoiceDistanceRef.current = distanceKm;
    if (message) Speech.speak(message, { language: speechLanguage, rate: 1.0 });
  }, [distanceKm, elapsed, isPaused, isRecording, language, speechLanguage, voiceSettings]);

  // 目標達成を一度だけアナウンス
  useEffect(() => {
    if (!isRecording) { goalAnnouncedRef.current = false; return; }
    if (!goal || goalAnnouncedRef.current) return;
    const achieved = goal.type === 'distance' ? distanceKm >= goal.value : elapsed >= goal.value;
    if (achieved) {
      goalAnnouncedRef.current = true;
      if (voiceGuide) {
        const spokenGoal = goal.type === 'distance'
          ? t('run.kilometersSpeech', { value: goal.value })
          : t('run.minutesValue', { count: Math.round(goal.value / 60) });
        Speech.speak(t('run.goalReachedSpeech', { goal: spokenGoal }), { language: speechLanguage, rate: 1.0 });
      }
    }
  }, [distanceKm, elapsed, isRecording, goal, voiceGuide]);

  // 記録停止時に音声リセット
  useEffect(() => {
    if (!isRecording) {
      spokenIntervalRef.current = 0;
      lastVoiceDistanceRef.current = 0;
      lastVoiceElapsedRef.current = 0;
      lastKmHapticRef.current = 0;
    }
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording || isPaused || measurementType !== 'gps') return;
    const completedKm = Math.floor(distanceKm + 0.0001);
    if (completedKm <= 0 || completedKm <= lastKmHapticRef.current) return;
    lastKmHapticRef.current = completedKm;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [distanceKm, isPaused, isRecording, measurementType]);

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

  // カウントダウンは終了時刻を正とする。バックグラウンドでJSタイマーが止まっても、
  // 復帰時に現在時刻から再計算し、GPS追跡自体は予約時点から開始しておく。
  useEffect(() => {
    if (countdownTargetAt === null) return;
    const finishCountdown = () => {
      if (finishingCountdownRef.current) return;
      finishingCountdownRef.current = true;
      setCountdown(null);
      setCountdownTargetAt(null);
      if (selectedMode === 'steps' && !useRecordStore.getState().isRecording) {
        startRecording(
          selectedMode,
          GOAL_OPTIONS[selectedGoalIdx]?.goal ?? null,
          null,
          countdownTargetAt,
        );
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Speech.speak(t('run.startSpeech'), { language: speechLanguage, rate: 1.0 });
      finishingCountdownRef.current = false;
    };
    const update = () => {
      const remaining = Math.max(0, Math.ceil((countdownTargetAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining > 0 && remaining !== lastCountdownHapticRef.current) {
        lastCountdownHapticRef.current = remaining;
        void Haptics.impactAsync(
          remaining === 1 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
        ).catch(() => {});
      }
      if (remaining <= 0) finishCountdown();
    };
    update();
    const timer = setInterval(update, 200);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
      lastCountdownHapticRef.current = null;
    };
  }, [countdownTargetAt, selectedMode, selectedGoalIdx, startRecording]);

  async function ensureForegroundLocationPermission(): Promise<boolean> {
    const provider = await Location.getProviderStatusAsync().catch(() => null);
    if (!provider) {
      Alert.alert(
        t('run.locationUnknownTitle'),
        t('run.locationUnknownBody'),
      );
      return false;
    }
    if (!provider.locationServicesEnabled) {
      Alert.alert(
        t('run.servicesOffTitle'),
        t('run.servicesOffBody'),
        [
          { text: t('common.close'), style: 'cancel' },
          { text: t('run.openSettings'), onPress: () => { void Linking.openSettings(); } },
        ],
      );
      return false;
    }

    let foreground = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (!foreground?.granted) {
      if (foreground && !foreground.canAskAgain) {
        Alert.alert(
          t('run.permissionRequiredTitle'),
          t('run.permissionRequiredBody'),
        );
        return false;
      }
      foreground = await Location.requestForegroundPermissionsAsync().catch(() => null);
      setGpsWarmupRestartKey((value) => value + 1);
    }
    if (!foreground?.granted) {
      Alert.alert(
        t('run.allowLocationTitle'),
        t('run.allowLocationBody'),
      );
      return false;
    }

    if (Platform.OS === 'android' && foreground.android?.accuracy !== 'fine') {
      Alert.alert(
        t('run.preciseRequiredTitle'),
        t('run.preciseRequiredBody'),
        [
          { text: t('common.close'), style: 'cancel' },
          { text: t('run.openSettings'), onPress: () => { void Linking.openSettings(); } },
        ],
      );
      return false;
    }

    // expo-location 19.0.8 の公開型は iOS に scope だけを持ち、full/reduced accuracyを公開しない。
    // any/castで推測せず、iOSはウォームアップ点の実accuracy (25m以内) で開始可否を守る。

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
        t('run.alreadyConfigured'),
        t('run.alreadyConfiguredBody'),
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
          t('run.backgroundConfigured'),
          t('run.backgroundConfiguredBody'),
        );
        return;
      }
    } else {
      setBackgroundPermissionGranted(false);
    }

    Alert.alert(
      t('run.backgroundNotConfigured'),
      t('run.backgroundNotConfiguredBody'),
      [
        { text: t('common.close'), style: 'cancel' },
        { text: t('run.openSettings'), onPress: () => { void Linking.openSettings(); } },
      ],
    );
  }

  async function handleStart() {
    if (selectedMode === 'steps') {
      const permission = await Pedometer.requestPermissionsAsync().catch(() => ({ status: 'denied' as const }));
      if (permission.status !== 'granted') {
        Alert.alert(t('run.motionRequiredTitle'), t('run.motionRequiredBody'));
        return;
      }
    } else {
      if (!(await ensureForegroundLocationPermission())) return;
      const warmupPoint = lastWarmupPointRef.current;
      const warmupAgeMs = warmupPoint ? Date.now() - warmupPoint.timestamp : Infinity;
      if (
        (gpsReadiness !== 'ready' && gpsReadiness !== 'acceptable')
        || !warmupPoint
        || warmupAgeMs < 0
        || warmupAgeMs > WARMUP_POINT_MAX_AGE_MS
      ) {
        setGpsWarmupRestartKey((value) => value + 1);
        return;
      }
    }
    const targetAt = Date.now() + 3_000;
    finishingCountdownRef.current = false;
    setCountdownTargetAt(targetAt);
    setCountdown(3);
    if (selectedMode === 'gps') {
      // 予約時点から追跡を起動し、開始時刻より前の点はrecordStore側で捨てる。
      // これによりカウントダウン中に画面を閉じても、終了時刻以降のGPS点を受け取れる。
      startRecording(
        selectedMode,
        GOAL_OPTIONS[selectedGoalIdx]?.goal ?? null,
        null,
        targetAt,
      );
    }
  }

  function cancelCountdown() {
    setCountdown(null);
    setCountdownTargetAt(null);
    finishingCountdownRef.current = false;
    if (useRecordStore.getState().isRecording) reset();
  }

  function handleStop() {
    if (stopGuardRef.current || !isRecording) return;
    stopGuardRef.current = true;
    setShowStopSheet(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  function cancelStopSheet() {
    if (isSaving) return;
    setShowStopSheet(false);
    stopGuardRef.current = false;
  }

  async function saveAndStop() {
    if (!user) {
      cancelStopSheet();
      Alert.alert(t('common.error'), t('auth.loginRequired'));
      return;
    }
    setShowStopSheet(false);
    setIsSaving(true);
    let stoppedActivity: Activity | null = null;
    try {
      // 通信を待つ前に計測を止める。保存先チャレンジはCallableがサーバー側で確定する。
      const activity = await stopRecording();
      stoppedActivity = activity;
      if (voiceGuide) {
        Speech.speak(
          t('run.finishSpeech', { distance: formatRunDistanceKm(activity.distanceKm) }),
          { language: speechLanguage, rate: 1.0 },
        );
      }
      const submitted = await saveActivityToFirestore({ activity });
      if (!submitted) {
        reset();
        Alert.alert(
          t('run.saveFailedTitle'),
          t('run.noValidDistance'),
        );
        return;
      }
      const savedDistanceKm = submitted.distanceKm;
      const savedDurationSeconds = submitted.durationSeconds;
      const splits = activity.measurementType === 'gps' ? kmSplits(activity.route ?? []) : [];
      reset();
      router.push({
        pathname: '/record/summary' as any,
        params: {
          activityId: submitted.activityId,
          distanceKm: savedDistanceKm.toFixed(2),
          durationSeconds: String(savedDurationSeconds),
          steps: String(submitted.steps ?? activity.steps ?? 0),
          pace: formatPace(savedDistanceKm, savedDurationSeconds),
          splits: JSON.stringify(splits),
          declarationAchieved: submitted.declarationAchieved ? '1' : '',
        },
      });
    } catch (e: unknown) {
      if (e instanceof ActivitySaveError && e.kind === 'queued') {
        reset();
        Alert.alert(
          t('run.savedOnDevice'),
          t('run.queuedBody'),
        );
      } else if (e instanceof ActivitySaveError && e.kind === 'rejected') {
        reset();
        Alert.alert(
          t('run.saveFailedTitle'),
          t('run.rejectedBody'),
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
          t('run.deviceSaveFailed'),
          t('run.deviceSaveFailedBody'),
        );
      }
      console.error('saveActivityToFirestore error:', e);
    } finally {
      setIsSaving(false);
      stopGuardRef.current = false;
    }
  }

  function confirmDiscard() {
    setShowStopSheet(false);
    Alert.alert(
      t('run.discardTitle'),
      t('run.discardBody'),
      [
        { text: t('common.back'), style: 'cancel', onPress: () => { stopGuardRef.current = false; } },
        {
          text: t('run.discard'),
          style: 'destructive',
          onPress: () => {
            Speech.stop();
            reset();
            stopGuardRef.current = false;
          },
        },
      ],
    );
  }

  const lastPoint = displayRoute[displayRoute.length - 1];
  const liveDisplaySegments = displayRouteSegments(displayRoute);
  const gpsQualityReady = gpsReadiness === 'ready' || gpsReadiness === 'acceptable';
  const startDisabled = selectedMode === 'gps' && !gpsQualityReady;
  const startHint = selectedMode !== 'gps'
    ? t('run.tapToStart')
    : !gpsQualityReady
      ? t('run.waitForGps')
      : t('run.tapToStart');

  async function handleGpsStatusPress() {
    if (gpsReadiness === 'no-permission') {
      if (await ensureForegroundLocationPermission()) {
        setGpsWarmupRestartKey((value) => value + 1);
      }
      return;
    }
    if (gpsReadiness === 'approximate' || gpsReadiness === 'services-disabled') {
      await Linking.openSettings().catch(() => {});
      return;
    }
    setGpsWarmupRestartKey((value) => value + 1);
  }

  function renderDeclarationGuide() {
    if (!declarationBattle) return null;
    const declarationPublishingEnabled = user?.runDeclarationVisible === true;
    return (
      <TouchableOpacity
        style={[s.declarationGuide, fontScale >= 1.6 && s.declarationGuideLargeText]}
        onPress={() => router.push(declarationPublishingEnabled ? '/(tabs)/battle' as any : '/(tabs)/profile' as any)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t(declarationPublishingEnabled ? 'run.declarationOpenA11y' : 'battle.declarationSettingsA11y')}
      >
        <View style={s.declarationGuideIcon}>
          <Ionicons name={ownDeclaration?.status === 'done' ? 'checkmark' : 'flag-outline'} size={16} color={Colors.accentText} />
        </View>
        <View style={[s.declarationGuideCopy, fontScale >= 1.6 && s.declarationGuideCopyLargeText]}>
          <Text style={s.declarationGuideTitle} numberOfLines={fontScale >= 1.6 ? undefined : 1}>
            {!declarationPublishingEnabled
              ? t('run.declarationOff')
              : ownDeclaration?.status === 'done'
              ? t('run.declarationDone')
              : ownDeclaration
                ? t('run.todayPlan', { time: declarationTimeLabel(ownDeclaration.plannedAt, ownDeclaration.timezone, language) })
                : t('run.planQuestion')}
          </Text>
          <Text style={s.declarationGuideBattle} numberOfLines={fontScale >= 1.6 ? undefined : 1}>{declarationBattle.title}</Text>
        </View>
        <Text style={s.declarationGuideAction}>
          {t(!declarationPublishingEnabled ? 'profile.settings' : ownDeclaration?.status === 'planned' ? 'battle.edit' : ownDeclaration ? 'run.check' : 'run.declare')}
        </Text>
        <Ionicons name="chevron-forward" size={15} color={Colors.textTertiary} />
      </TouchableOpacity>
    );
  }

  // ─── PRE-RECORDING ────────────────────────────────────────
  if (!isRecording) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <ScrollView contentContainerStyle={s.preScroll} showsVerticalScrollIndicator={false}>
          <View style={s.preHeader}>
            <Text style={s.preEyebrow}>ZELIO</Text>
            <Text style={s.preTitle}>{t('run.title')}</Text>
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
                      Alert.alert(t('run.stepsUnsupported'), t('run.useGps'));
                      return;
                    }
                    setSelectedMode(mode);
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={t(mode === 'gps' ? 'run.gpsMode' : 'run.stepsMode')}
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={mode === 'gps' ? 'navigate-outline' : 'footsteps-outline'}
                    size={14}
                    color={active ? Colors.textPrimary : Colors.textTertiary}
                  />
                  <Text style={[s.modeBtnText, active && s.modeBtnTextActive]}>
                    {t(mode === 'gps' ? 'run.gpsMode' : 'run.steps')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {selectedMode === 'steps' && (
            <Text style={s.stepsFairnessNote}>
              {t('run.stepsFairness', { cap: STEP_BATTLE_DAILY_CAP_KM })}
            </Text>
          )}

          {/* Goal chips */}
          <View style={[s.goalRow, fontScale >= 1.6 && s.goalRowLargeText]}>
            <Text style={s.goalRowLabel}>{t('run.goal')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.goalChips}>
              {goalOptions.map((option, idx) => {
                const active = selectedGoalIdx === idx;
                return (
                  <TouchableOpacity
                    key={option.label}
                    style={[s.goalChip, active && s.goalChipActive]}
                    onPress={() => setSelectedGoalIdx(idx)}
                    accessibilityRole="radio"
                    accessibilityLabel={t('run.goalA11y', { goal: option.label })}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.goalChipText, active && s.goalChipTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* START button */}
          <View style={[s.startArea, fontScale >= 1.6 && s.startAreaLargeText]}>
            {fontScale < 1.6 && renderDeclarationGuide()}
            <View style={s.startStack}>
              <Animated.View style={[s.startRing, { transform: [{ rotate: ringRotate }] }]} />
              <TouchableOpacity
                style={[s.startBtn, startDisabled && s.startBtnDisabled]}
                onPress={handleStart}
                disabled={startDisabled}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('run.startA11y')}
                accessibilityState={{ disabled: startDisabled }}
              >
                <Text
                  style={s.startLabel}
                  maxFontSizeMultiplier={1.2}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('locale.start')}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={s.startHint}>{startHint}</Text>
            {fontScale >= 1.6 && renderDeclarationGuide()}

            {/* GPS readiness */}
            {gpsReadiness !== null && (
              <TouchableOpacity
                style={s.gpsChip}
                onPress={() => { void handleGpsStatusPress(); }}
                accessibilityRole="button"
                accessibilityLabel={t('run.gpsStatusA11y')}
              >
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
                  {gpsReadiness === 'preparing' && t('run.gpsPreparing')}
                  {gpsReadiness === 'ready' && t('run.gpsReady')}
                  {gpsReadiness === 'acceptable' && t('run.gpsAcceptable')}
                  {gpsReadiness === 'no-permission' && t('run.gpsPermissionAtStart')}
                  {gpsReadiness === 'approximate' && t('run.gpsPreciseSettings')}
                  {gpsReadiness === 'services-disabled' && t('run.gpsServicesOff')}
                  {gpsReadiness === 'unavailable' && t('run.gpsUnavailable')}
                </Text>
                <Ionicons name="refresh-outline" size={13} color={Colors.textTertiary} />
              </TouchableOpacity>
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
                      : 'walk-outline'}
                  size={20}
                  color={backgroundPermissionGranted === true ? Colors.primary : Colors.textSecondary}
                />
                <View style={s.backgroundStatusCopy}>
                  <Text style={s.backgroundStatusTitle}>
                    {backgroundPermissionGranted === null
                      ? t('run.backgroundChecking')
                      : backgroundPermissionGranted
                        ? t('run.backgroundAllowed')
                        : t('run.backgroundUnset')}
                  </Text>
                  <Text style={s.backgroundStatusHint}>
                    {backgroundPermissionGranted === null
                      ? t('run.permissionChecking')
                      : backgroundPermissionGranted
                        ? t('run.statusShownAfterStart')
                        : t('run.foregroundHint')}
                  </Text>
                </View>
                {/* 「使用中のみ」でも画面OFF・他アプリ利用中の計測は続く。
                    「常に許可」はアプリ終了後も続けたい人だけの任意設定なので、STARTは止めない。 */}
                {backgroundPermissionGranted === false && (
                  <View style={s.backgroundActions}>
                    <TouchableOpacity
                      style={s.backgroundSettingsButton}
                      onPress={() => { void configureBackgroundLocation(); }}
                      accessibilityRole="button"
                      accessibilityLabel={t('run.backgroundA11y')}
                    >
                      <Text style={s.backgroundSettingsButtonText}>{t('run.alwaysAllow')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Challenge connection badge */}
            {currentActiveBattles.length === 1 ? (
              <View style={s.contribBadge}>
                <Text style={s.contribBadgeText}>
                  {t('run.addedToOne', { title: currentActiveBattles[0].title })}
                </Text>
              </View>
            ) : currentActiveBattles.length > 1 ? (
              <View style={s.contribBadge}>
                <Text style={s.contribBadgeText}>
                  {t('run.addedToMany', { count: currentActiveBattles.length })}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.contribBadge, { backgroundColor: `${Colors.textTertiary}18` }]}
                onPress={() => router.push('/(tabs)/battle' as any)}
                activeOpacity={0.7}
              >
                <Text style={[s.contribBadgeText, { color: Colors.textSecondary }]}>
                  {t('run.joinToAdd')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 開始を最優先にし、任意設定はその後に置く。最大文字サイズでもCTAまでの距離を短くする。 */}
          <View style={s.voiceRow}>
            <TouchableOpacity
              style={s.voiceSettingsButton}
              onPress={() => setShowVoiceSettings(true)}
              accessibilityRole="button"
              accessibilityLabel={t('run.voiceSettingsA11y')}
            >
              <Ionicons name="volume-medium-outline" size={16} color={voiceGuide ? Colors.primaryDark : Colors.textTertiary} />
              <View style={s.voiceLabelWrap}>
                <Text style={[s.voiceLabel, voiceGuide && { color: Colors.primaryDark }]}>{t('run.voiceCoach')}</Text>
                {voiceGuide && (
                  <Text style={s.voiceSummary}>
                    {voiceSettings.intervalType === 'distance'
                      ? t('run.everyKm', { value: voiceSettings.distanceKm })
                      : t('run.everyMinutes', { value: voiceSettings.timeMinutes })}
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

          {selectedMode === 'gps' && (
            <View style={s.voiceRow}>
              <Ionicons name="pause-circle-outline" size={16} color={autoPauseEnabled ? Colors.primaryDark : Colors.textTertiary} />
              <View style={s.voiceLabelWrap}>
                <View style={s.autoPauseTitleRow}>
                  <Text style={[s.voiceLabel, autoPauseEnabled && { color: Colors.primaryDark }]}>{t('run.autoPause')}</Text>
                  <Text style={s.experimentalBadge} maxFontSizeMultiplier={1.3}>{t('run.experimental')}</Text>
                </View>
                <Text style={s.voiceSummary}>{t('run.autoPauseHint')}</Text>
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

          {/* 前回のラン・直近7日 */}
          <View style={s.preData}>
            {recentLoading ? (
              <>
                <View style={s.skelLine} />
                <View style={s.skelBlock} />
              </>
            ) : last ? (
              <>
                <SectionHeader label={t('run.lastRun')} />
                <TouchableOpacity
                  style={s.lastRunCard}
                  onPress={() => router.push(`/activity/${last.id}` as any)}
                  activeOpacity={0.65}
                  accessibilityRole="button"
                  accessibilityLabel={t('run.lastRunA11y', {
                    distance: formatRunDistanceKm(last.distanceKm),
                    time: formatTime(last.durationSeconds),
                    day: relativeDay(last.startedAt, new Date(), language),
                  })}
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
                      <Text style={s.lastRunMetric}>{t('run.distanceMetric', { value: formatRunDistanceKm(last.distanceKm) })}</Text>
                      <Text style={s.lastRunMetric}>{t('run.timeMetric', { value: formatTime(last.durationSeconds) })}</Text>
                    </View>
                    <View style={s.lastRunRight}>
                      <Text style={s.lastRunAgo}>{relativeDay(last.startedAt, new Date(), language)}</Text>
                      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                    </View>
                  </View>
                </TouchableOpacity>

                <View style={s.weekHead}>
                  <Text style={TextStyles.sectionTitle}>{t('battle.lastSevenDays')}</Text>
                  <StreakChip days={streak} />
                </View>
                <WeeklyBarChart days={weekBuckets} height={40} compact periodLabel={t('battle.lastSevenDays')} />
              </>
            ) : (
              <EmptyState
                icon="walk-outline"
                title={t('run.firstRun')}
                hint={t('run.firstRunHint')}
              />
            )}
          </View>
        </ScrollView>

        {/* Countdown overlay */}
        {countdown !== null && (
          <Pressable
            style={s.countdownOverlay}
            onPress={cancelCountdown}
            accessibilityRole="button"
            accessibilityLabel={t('run.cancelCountdownA11y')}
          >
            <Text style={s.countdownNum}>{countdown}</Text>
            <Text style={s.countdownHint}>{t('run.tapToCancel')}</Text>
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
            {pauseKind === 'auto' ? t('locale.autoPaused') : isPaused ? t('locale.paused') : t('locale.runInProgress')}
          </MonoLabel>
        </View>
      </SafeAreaView>

      {/* Distance hero */}
      <View style={s.hudHero}>
        <MonoLabel color={DarkColors.primary} size={9}>{t('run.distance')}</MonoLabel>
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
            label={t(measurementType === 'steps' ? 'run.steps' : 'run.pace')}
            value={measurementType === 'steps' ? steps.toLocaleString(language) : formatPace(distanceKm, elapsed)}
            unit={measurementType === 'gps' ? '/km' : undefined}
          />
        </View>
        <View style={s.hudStatDivider} />
        <View style={s.hudStat}>
          <StatBlock dark align="center" label={t('run.time')} value={formatTime(elapsed)} />
        </View>
      </View>

      {/* Goal progress */}
      {goal && (() => {
        const progress = goal.type === 'distance' ? distanceKm / goal.value : elapsed / goal.value;
        const achieved = progress >= 1;
        const remainText = goal.type === 'distance'
          ? t('run.remainingDistance', { value: Math.max(0, goal.value - distanceKm).toFixed(1) })
          : t('run.remainingTime', { value: formatTime(Math.max(0, goal.value - elapsed)) });
        return (
          <View style={s.hudGoalRow}>
            <View style={s.hudGoalHead}>
              <Text style={s.hudGoalLabel}>{t('run.goalA11y', { goal: formatGoalLabel(goal) })}</Text>
              <Text style={[s.hudGoalRemain, achieved && { color: DarkColors.primary }]}>
                {achieved ? t('run.reached') : remainText}
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
              ? t('run.stepsCapHud', { cap: STEP_BATTLE_DAILY_CAP_KM })
              : currentActiveBattles.length === 1
                ? t('run.contributionOne', { distance: distanceKm.toFixed(2), title: currentActiveBattles[0].title })
                : t('run.contributionMany', { distance: distanceKm.toFixed(2), count: currentActiveBattles.length })}
          </Text>
        </View>
      )}

      {hudCheerName && (
        <View style={s.hudCheerBanner} accessibilityLiveRegion="polite">
          <Ionicons name="flame" size={15} color={DarkColors.accent} />
          <Text style={s.hudCheerText}>{t('run.cheerReceived', { name: hudCheerName })}</Text>
        </View>
      )}

      {/* 一時停止バナー */}
      {isPaused && (
        <View style={s.warnBanner}>
          <Ionicons name="pause-circle-outline" size={14} color={DarkColors.accent} />
          <Text style={s.warnBannerText}>
            {pauseKind === 'auto'
              ? t('run.autoPausedHint')
              : t('run.pausedHint')}
          </Text>
        </View>
      )}

      {/* GPS追跡状態の警告バナー */}
      {!isPaused && measurementType === 'gps' && gpsWarning && (
        <View style={s.warnBanner}>
          <Ionicons name="warning-outline" size={14} color={DarkColors.accent} />
          <Text style={s.warnBannerText}>{t('run.gpsUnstable')}</Text>
        </View>
      )}
      {!isPaused && measurementType === 'gps' && !gpsWarning && locationMode === 'foreground' && (
        <View style={s.warnBanner}>
          <Ionicons name="warning-outline" size={14} color={DarkColors.accent} />
          <Text style={s.warnBannerText}>{t('run.foregroundWarning')}</Text>
        </View>
      )}
      {!isPaused && measurementType === 'gps' && locationMode === 'denied' && (
        <View style={s.warnBanner}>
          <Ionicons name="warning-outline" size={14} color={DarkColors.accent} />
          <Text style={s.warnBannerText}>{t('run.permissionDenied')}</Text>
        </View>
      )}
      {!isPaused && measurementType === 'gps' && !gpsWarning && locationMode === 'background' && (
        <View style={s.hudReadyBanner}>
          <Ionicons name="checkmark-circle-outline" size={14} color={DarkColors.primary} />
          <Text style={s.hudReadyBannerText}>{t('run.backgroundReady')}</Text>
        </View>
      )}
      {!isPaused && measurementType === 'steps' && (
        <View style={s.warnBanner}>
          <Ionicons name="information-circle-outline" size={14} color={DarkColors.accent} />
          <Text style={s.warnBannerText}>{t('run.stepsBackgroundWarning')}</Text>
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
            {liveDisplaySegments.map((segment, index) => (
              <Polyline
                key={`live-route-${index}`}
                coordinates={segment.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
                strokeColor={DarkColors.primary}
                strokeWidth={3}
              />
            ))}
          </MapView>
        ) : (
          <View style={[s.hudMap, s.hudMapPlaceholder]}>
            <ActivityIndicator color={DarkColors.primary} />
            <Text style={{ color: DarkColors.textTertiary, marginTop: 8, fontSize: 12 }}>{t('run.gpsAcquiring')}</Text>
          </View>
        )
      ) : (
        <View style={[s.hudMap, s.hudMapPlaceholder]}>
          <Ionicons name="footsteps-outline" size={48} color={DarkColors.textTertiary} />
          <Text style={{ color: DarkColors.textTertiary, marginTop: 12, fontSize: 14, fontWeight: '700' }}>
            {t('run.stepsMode')}
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
                    ? t('run.resumeA11y')
                    : pauseKind === 'auto'
                      ? t('run.switchManualA11y')
                      : t('run.pauseA11y')
                }
              >
                <Ionicons
                  name={pauseKind === 'manual' ? 'play' : 'pause'}
                  size={30}
                  color={pauseKind === 'manual' ? DarkColors.background : DarkColors.textPrimary}
                />
              </TouchableOpacity>
              <Text style={s.stopLabel}>
                {t(pauseKind === 'manual' ? 'run.resume' : pauseKind === 'auto' ? 'run.manualPause' : 'run.pause')}
              </Text>
            </View>
            <View style={s.hudControl}>
              <TouchableOpacity
                style={s.stopBtn}
                onLongPress={handleStop}
                delayLongPress={650}
                onAccessibilityTap={handleStop}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('run.stopA11y')}
                accessibilityHint={t('run.stopHintA11y')}
              >
                <View style={s.stopSquare} />
              </TouchableOpacity>
              <Text style={s.stopLabel}>{t('run.holdToStop')}</Text>
            </View>
          </>
        )}
      </View>

      <Modal visible={showStopSheet} transparent animationType="slide" onRequestClose={cancelStopSheet}>
        <View style={s.sheetRoot}>
          <Pressable style={s.sheetBackdrop} onPress={cancelStopSheet} />
          <SafeAreaView style={s.stopConfirmSheet} edges={['bottom']}>
            <View style={s.sheetHandle} />
            <Text style={s.stopConfirmTitle}>{t('run.finishTitle')}</Text>
            <Text style={s.stopConfirmBody}>{t('run.finishBody')}</Text>
            <TouchableOpacity
              style={s.stopSaveButton}
              onPress={() => { void saveAndStop(); }}
              accessibilityRole="button"
              accessibilityLabel={t('run.stopSaveA11y')}
            >
              <Ionicons name="checkmark-circle" size={22} color={Colors.textOnPrimary} />
              <Text style={s.stopSaveButtonText}>{t('run.stopSave')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.stopDiscardButton} onPress={confirmDiscard} accessibilityRole="button">
              <Text style={s.stopDiscardButtonText}>{t('run.discardWithoutSaving')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.stopCancelButton} onPress={cancelStopSheet} accessibilityRole="button">
              <Text style={s.stopCancelButtonText}>{t('run.continueRun')}</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      {countdown !== null && (
        <Pressable
          style={s.countdownOverlay}
          onPress={cancelCountdown}
          accessibilityRole="button"
          accessibilityLabel={t('run.cancelCountdownA11y')}
        >
          <Text style={s.countdownNum}>{countdown}</Text>
          <Text style={s.countdownHint}>{t('run.tapToCancel')}</Text>
        </Pressable>
      )}

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
  const { t } = useTranslation();
  const contentOptions: { key: keyof VoiceCoachSettings; label: string }[] = [
    { key: 'announceElapsed', label: t('run.elapsed') },
    { key: 'announceDistance', label: t('run.distance') },
    { key: 'announceLapPace', label: t('run.lapPace') },
    { key: 'announceAveragePace', label: t('run.averagePace') },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetRoot}>
        <Pressable style={s.sheetBackdrop} onPress={onClose} />
        <SafeAreaView style={s.sheet} edges={['bottom']}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View>
              <Text style={s.sheetTitle}>{t('run.voiceCoach')}</Text>
              <Text style={s.sheetHint}>{t('run.voiceHint')}</Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(enabled) => onChange({ enabled })}
              trackColor={{ false: Colors.surfaceGray, true: `${Colors.primary}60` }}
              thumbColor={settings.enabled ? Colors.primary : Colors.textTertiary}
            />
          </View>

          <Text style={s.sheetSectionLabel}>{t('run.announceInterval')}</Text>
          <View style={s.sheetSegment}>
            {(['distance', 'time'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[s.sheetSegmentButton, settings.intervalType === type && s.sheetSegmentButtonActive]}
                onPress={() => onChange({ intervalType: type })}
              >
                <Text style={[s.sheetSegmentText, settings.intervalType === type && s.sheetSegmentTextActive]}>
                  {t(type === 'distance' ? 'run.byDistance' : 'run.byTime')}
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
                    {settings.intervalType === 'distance' ? `${value}km` : t('run.minutesValue', { count: value })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.sheetSectionLabel}>{t('run.announceContent')}</Text>
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
            <Text style={s.sheetDoneText}>{t('common.done')}</Text>
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
    fontSize: 9, fontWeight: '800', color: Colors.accentText,
    backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  modeToggle: {
    flexDirection: 'row', gap: 4, padding: 4,
    backgroundColor: Colors.surfaceGray, borderRadius: BorderRadius.full,
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
  startAreaLargeText: { paddingVertical: 20 },
  declarationGuide: {
    width: '88%', maxWidth: 360, minHeight: 48,
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  declarationGuideLargeText: { flexDirection: 'column', alignItems: 'flex-start' },
  declarationGuideIcon: {
    width: 30, height: 30, borderRadius: BorderRadius.full,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentLight,
  },
  declarationGuideCopy: { flex: 1, minWidth: 0 },
  declarationGuideCopyLargeText: { flex: 0, width: '100%' },
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
    backgroundColor: ActionColors.background,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: ActionColors.pressed, shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.34, shadowRadius: 28, elevation: 12,
  },
  startBtnDisabled: { backgroundColor: Colors.textTertiary, shadowOpacity: 0, elevation: 0 },
  startLabel: {
    width: '90%', fontSize: 38, fontWeight: '900', color: ActionColors.foreground,
    letterSpacing: 2, textAlign: 'center',
  },
  startHint: { width: '88%', maxWidth: 360, fontSize: 13, lineHeight: 18, textAlign: 'center', color: Colors.textSecondary, fontWeight: '600' },

  goalRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingLeft: 40,
    marginTop: 12,
  },
  goalRowLargeText: {
    flexDirection: 'column', alignItems: 'stretch', paddingLeft: 20, gap: 6,
  },
  goalRowLabel: { fontSize: 13, fontWeight: '600' as const, color: Colors.textSecondary },
  goalChips: { flexDirection: 'row' as const, gap: 6, paddingRight: 20 },
  goalChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceGray,
  },
  goalChipActive: { backgroundColor: Colors.primary },
  goalChipText: { fontSize: 12, fontWeight: '700' as const, color: Colors.textTertiary },
  goalChipTextActive: { color: Colors.textOnPrimary },

  gpsChip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceGray,
  },
  gpsDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.textTertiary },
  gpsChipText: { fontSize: 11, fontWeight: '700' as const, color: Colors.textSecondary },
  backgroundStatusCard: {
    width: '88%', maxWidth: 360,
    flexDirection: 'row' as const, alignItems: 'flex-start' as const, flexWrap: 'wrap' as const, gap: 10,
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
    flex: 1, minHeight: 38, paddingHorizontal: 10,
    borderRadius: BorderRadius.full, backgroundColor: Colors.primary,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  backgroundSettingsButtonText: { fontSize: 11, fontWeight: '800' as const, color: Colors.textOnPrimary },
  backgroundActions: { width: '100%', flexDirection: 'row', gap: Spacing.sm, marginTop: 2 },

  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: DarkColors.countdownOverlay,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 16,
    zIndex: 20,
    elevation: 20,
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
  stopConfirmSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
  stopConfirmTitle: { fontSize: 22, fontWeight: '900', color: Colors.textPrimary, textAlign: 'center' },
  stopConfirmBody: { marginTop: Spacing.sm, fontSize: 13, lineHeight: 19, color: Colors.textSecondary, textAlign: 'center' },
  stopSaveButton: { minHeight: 64, marginTop: Spacing.xl, borderRadius: BorderRadius.lg, backgroundColor: ActionColors.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  stopSaveButtonText: { fontSize: 18, fontWeight: '900', color: ActionColors.foreground },
  stopDiscardButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  stopDiscardButtonText: { fontSize: 13, fontWeight: '700', color: Colors.error },
  stopCancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  stopCancelButtonText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },

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
  sheetDoneButton: { backgroundColor: ActionColors.background, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.xl, marginBottom: Spacing.md },
  sheetDoneText: { color: ActionColors.foreground, fontSize: 15, fontWeight: '800' },

});
