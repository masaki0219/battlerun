import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Modal, Pressable, Switch, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Pedometer } from 'expo-sensors';
import * as Speech from 'expo-speech';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRecordStore, saveActivityToFirestore } from '../../stores/recordStore';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import type { MeasurementType, RoutePoint } from '../../types';
import { Colors, DarkColors, BorderRadius } from '../../design_tokens';
import { MonoLabel } from '../../components/ui/MonoLabel';

function useElapsedTime(): number {
  const isRecording = useRecordStore((s) => s.isRecording);
  const startedAt = useRecordStore((s) => s.startedAt);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isRecording || !startedAt) { setElapsed(0); return; }
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [isRecording, startedAt]);
  return elapsed;
}

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
  const { user } = useAuthStore();
  const {
    publicBattles, privateBattles, myMemberships,
    getActiveBattleIds, fetchMyMemberships, fetchMyPrivateBattles, fetchPublicBattles,
  } = useBattleStore();
  const {
    isRecording, measurementType, distanceKm, steps, route, locationMode, gpsWarning,
    startRecording, stopRecording, reset,
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

  const [selectedMode, setSelectedMode] = useState<MeasurementType>('gps');
  const [isSaving, setIsSaving] = useState(false);
  const [isStepAvailable, setIsStepAvailable] = useState(false);
  const [savedRoute, setSavedRoute] = useState<RoutePoint[]>([]);
  const [savedStats, setSavedStats] = useState<{ distanceKm: number; durationSeconds: number } | null>(null);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [voiceGuide, setVoiceGuide] = useState(true);
  const spokenKmRef = useRef(0);

  // REC ドット点滅（opacity 1↔0.3、1秒周期）
  const recDotAnim = useRef(new Animated.Value(1)).current;
  // START リングの呼吸スケール
  const ringAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Pedometer.isAvailableAsync().then(setIsStepAvailable).catch(() => {});
  }, []);

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
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const ringScale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  // 音声ガイド: 1km通過ごとに読み上げ
  useEffect(() => {
    if (!isRecording || !voiceGuide) return;
    const km = Math.floor(distanceKm);
    if (km > 0 && km > spokenKmRef.current) {
      spokenKmRef.current = km;
      Speech.speak(`${km}キロメートル突破しました`, { language: 'ja-JP', rate: 1.0 });
    }
  }, [distanceKm, isRecording, voiceGuide]);

  // 記録停止時に音声リセット
  useEffect(() => {
    if (!isRecording) spokenKmRef.current = 0;
  }, [isRecording]);

  async function handleStop() {
    Alert.alert('記録を停止しますか？', '', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '停止して保存', style: 'destructive',
        onPress: async () => {
          if (!user) { Alert.alert('エラー', 'ログインが必要です'); return; }
          setIsSaving(true);
          try {
            await Promise.all([
              fetchMyMemberships(user.id),
              fetchMyPrivateBattles(user.id),
              fetchPublicBattles(),
            ]);
            const activity = await stopRecording();
            if (voiceGuide) {
              Speech.speak(
                `記録を終了しました。${activity.distanceKm.toFixed(1)}キロメートルです`,
                { language: 'ja-JP', rate: 1.0 },
              );
            }
            const activityId = await saveActivityToFirestore({
              userId: user.id,
              displayName: user.name,
              activity,
              activeBattleIds: getActiveBattleIds(),
            });
            setSavedRoute(activity.route ?? []);
            setSavedStats({ distanceKm: activity.distanceKm, durationSeconds: activity.durationSeconds });
            reset();
            // Navigate to summary
            router.push({
              pathname: '/record/summary' as any,
              params: {
                activityId: activityId ?? '',
                distanceKm: activity.distanceKm.toFixed(2),
                durationSeconds: String(activity.durationSeconds),
                steps: String(activity.steps ?? 0),
                pace: formatPace(activity.distanceKm, activity.durationSeconds),
              },
            });
          } catch (e: any) {
            Alert.alert('保存失敗', '記録の保存に失敗しました。通信状態を確認してください。',
              [{ text: 'OK', onPress: () => reset() }]);
            console.error('saveActivityToFirestore error:', e);
          } finally {
            setIsSaving(false);
          }
        },
      },
    ]);
  }

  const lastPoint = route[route.length - 1];

  // ─── PRE-RECORDING ────────────────────────────────────────
  if (!isRecording) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.preHeader}>
          <MonoLabel color={Colors.textTertiary} size={9}>BATTLERUN / ラン準備</MonoLabel>
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

        {/* Voice guide toggle */}
        <View style={s.voiceRow}>
          <Ionicons name="volume-medium-outline" size={16} color={voiceGuide ? Colors.primaryDark : Colors.textTertiary} />
          <Text style={[s.voiceLabel, voiceGuide && { color: Colors.primaryDark }]}>音声ガイド</Text>
          <Switch
            value={voiceGuide}
            onValueChange={setVoiceGuide}
            trackColor={{ false: Colors.surfaceAlt, true: `${Colors.primary}60` }}
            thumbColor={voiceGuide ? Colors.primary : Colors.textTertiary}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>

        {/* START button */}
        <View style={s.startArea}>
          <Animated.View style={[s.startRing, { transform: [{ scale: ringScale }] }]}>
            <TouchableOpacity
              style={s.startBtn}
              onPress={() => startRecording(selectedMode)}
              activeOpacity={0.85}
            >
              <Text style={s.startLabel}>START</Text>
            </TouchableOpacity>
          </Animated.View>
          <Text style={s.startHint}>タップしてラン開始</Text>

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
                このランは参加中の{currentActiveBattles.length}件のバトルに加算されます
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.contribBadge, { backgroundColor: `${Colors.textTertiary}18` }]}
              onPress={() => router.push('/(tabs)/battle' as any)}
              activeOpacity={0.7}
            >
              <Text style={[s.contribBadgeText, { color: Colors.textTertiary }]}>
                バトルに参加するとこのランが加算されます
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ─── RECORDING (dark HUD) ──────────────────────────────────
  return (
    <View style={s.hudRoot}>
      {/* Header */}
      <SafeAreaView edges={['top']}>
        <View style={s.hudHeader}>
          <Animated.View style={[s.recDot, { opacity: recDotAnim }]} />
          <MonoLabel color={DarkColors.textTertiary} size={9}>RUN IN PROGRESS</MonoLabel>
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
          <MonoLabel color={DarkColors.textTertiary} size={8.5}>
            {measurementType === 'steps' ? '歩数' : 'ペース'}
          </MonoLabel>
          <Text style={s.hudStatVal}>
            {measurementType === 'steps'
              ? steps.toLocaleString()
              : formatPace(distanceKm, elapsed)}
          </Text>
          {measurementType === 'gps' && (
            <Text style={s.hudStatUnit}>/km</Text>
          )}
        </View>
        <View style={s.hudStatDivider} />
        <View style={s.hudStat}>
          <MonoLabel color={DarkColors.textTertiary} size={8.5}>時間</MonoLabel>
          <Text style={s.hudStatVal}>{formatTime(elapsed)}</Text>
        </View>
      </View>

      {/* Challenge contribution preview */}
      {currentActiveBattles.length > 0 && (
        <View style={s.hudContribRow}>
          <Text style={s.hudContribText}>
            {currentActiveBattles.length === 1
              ? `+${distanceKm.toFixed(2)}km → 「${currentActiveBattles[0].title}」に加算`
              : `+${distanceKm.toFixed(2)}km → 参加中の${currentActiveBattles.length}件のバトルに加算`}
          </Text>
        </View>
      )}

      {/* GPS追跡状態の警告バナー */}
      {measurementType === 'gps' && gpsWarning && (
        <View style={s.warnBanner}>
          <Ionicons name="warning-outline" size={14} color={Colors.accent} />
          <Text style={s.warnBannerText}>⚠ GPS信号が不安定です。画面を開いたまま走ってください</Text>
        </View>
      )}
      {measurementType === 'gps' && !gpsWarning && locationMode === 'foreground' && (
        <View style={s.warnBanner}>
          <Ionicons name="warning-outline" size={14} color={Colors.accent} />
          <Text style={s.warnBannerText}>アプリを閉じると記録が止まる可能性があります</Text>
        </View>
      )}
      {measurementType === 'gps' && locationMode === 'denied' && (
        <View style={s.warnBanner}>
          <Ionicons name="warning-outline" size={14} color={Colors.accent} />
          <Text style={s.warnBannerText}>位置情報の権限がありません。設定から許可してください</Text>
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

      {/* STOP button */}
      <View style={s.hudStop}>
        {isSaving ? (
          <ActivityIndicator color={DarkColors.primary} size="large" />
        ) : (
          <TouchableOpacity style={s.stopBtn} onPress={handleStop} activeOpacity={0.8}>
            <View style={s.stopSquare} />
          </TouchableOpacity>
        )}
        <Text style={s.stopLabel}>停止</Text>
      </View>

      {/* Route modal (after save) */}
      <Modal visible={showRouteModal} animationType="slide" onRequestClose={() => setShowRouteModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: DarkColors.background }}>
          <View style={s.hudHeader}>
            <Text style={{ color: DarkColors.textPrimary, fontWeight: '700', fontSize: 17 }}>走行ルート</Text>
          </View>
          {savedRoute.length > 1 ? (() => {
            const lats = savedRoute.map((p) => p.lat);
            const lngs = savedRoute.map((p) => p.lng);
            const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
            return (
              <MapView
                style={{ flex: 1 }}
                provider={PROVIDER_DEFAULT}
                initialRegion={{
                  latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
                  latitudeDelta: Math.max(maxLat - minLat, 0.002) * 1.4,
                  longitudeDelta: Math.max(maxLng - minLng, 0.002) * 1.4,
                }}
              >
                <Polyline
                  coordinates={savedRoute.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
                  strokeColor={DarkColors.primary} strokeWidth={4}
                />
              </MapView>
            );
          })() : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: DarkColors.textTertiary }}>ルートデータがありません</Text>
            </View>
          )}
          {savedStats && (
            <View style={s.hudStatsRow}>
              <View style={s.hudStat}>
                <Text style={s.hudStatVal}>{savedStats.distanceKm.toFixed(2)}</Text>
                <MonoLabel color={DarkColors.textTertiary} size={8.5}>km</MonoLabel>
              </View>
              <View style={s.hudStatDivider} />
              <View style={s.hudStat}>
                <Text style={s.hudStatVal}>{formatTime(savedStats.durationSeconds)}</Text>
                <MonoLabel color={DarkColors.textTertiary} size={8.5}>経過時間</MonoLabel>
              </View>
            </View>
          )}
          <Pressable style={s.routeCloseBtn} onPress={() => setShowRouteModal(false)}>
            <Text style={s.routeCloseBtnText}>閉じる</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  // Pre-recording (light)
  root: { flex: 1, backgroundColor: Colors.background },
  preHeader: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, gap: 4 },
  preTitle: { fontSize: 22, fontWeight: '900', color: Colors.textPrimary, marginTop: 2 },

  voiceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 40,
    marginTop: 10,
  },
  voiceLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textTertiary,
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textTertiary },
  modeBtnTextActive: { color: Colors.textPrimary },

  startArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  startRing: {
    width: 180, height: 180, borderRadius: 90,
    borderWidth: 2, borderColor: `${Colors.accent}55`,
    borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  startBtn: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5, shadowRadius: 32, elevation: 12,
  },
  startLabel: { fontSize: 38, fontWeight: '900', color: Colors.textOnPrimary, letterSpacing: 2 },
  startHint: { fontSize: 13, color: Colors.textTertiary, fontWeight: '600' },
  contribBadge: {
    backgroundColor: `${Colors.primary}22`, borderRadius: BorderRadius.full,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  contribBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.primaryDark, textAlign: 'center' },

  // Recording (dark HUD)
  hudRoot: { flex: 1, backgroundColor: DarkColors.background },
  hudHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  recDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent,
  },
  hudHero: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  hudBigNum: {
    fontSize: 80, fontWeight: '900', color: DarkColors.textPrimary,
    letterSpacing: -3, lineHeight: 80, fontVariant: ['tabular-nums'],
  },
  hudUnit: { fontSize: 28, fontWeight: '700', color: DarkColors.textTertiary, letterSpacing: 1 },
  hudContribRow: {
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: `${DarkColors.primary}18`,
    borderRadius: BorderRadius.sm, paddingHorizontal: 14, paddingVertical: 8,
  },
  hudContribText: { fontSize: 11, fontWeight: '700', color: DarkColors.primary, textAlign: 'center' },
  warnBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, marginBottom: 8, gap: 6,
    backgroundColor: `${Colors.accent}18`,
    borderRadius: BorderRadius.sm, paddingHorizontal: 14, paddingVertical: 8,
  },
  warnBannerText: { fontSize: 11, fontWeight: '700', color: Colors.accent, textAlign: 'center' },
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
  hudStop: { alignItems: 'center', paddingBottom: 32, gap: 8 },
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

  // Route modal
  routeCloseBtn: {
    backgroundColor: DarkColors.primary, paddingVertical: 18, alignItems: 'center',
  },
  routeCloseBtnText: { fontSize: 16, fontWeight: '800', color: DarkColors.background },

});
