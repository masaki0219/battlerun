import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useRecordStore, saveActivityToFirestore } from '../../stores/recordStore';
import { useAuthStore } from '../../stores/authStore';
import { useBattleStore } from '../../stores/battleStore';
import { useTeamStore } from '../../stores/teamStore';
import { Colors, Typography, Spacing, BorderRadius, ComponentSize, Shadow } from '../../design_tokens';
import type { MeasurementType } from '../../types';

function useElapsedTime(): number {
  const isRecording = useRecordStore((s) => s.isRecording);
  const startedAt = useRecordStore((s) => s.startedAt);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRecording || !startedAt) { setElapsed(0); return; }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording, startedAt]);

  return elapsed;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPace(distanceKm: number, seconds: number): string {
  if (distanceKm < 0.01) return "--'--\"";
  const secPerKm = seconds / distanceKm;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

export default function RecordScreen() {
  const { user } = useAuthStore();
  const { currentTeam } = useTeamStore();
  const { getActiveBattleIds } = useBattleStore();
  const {
    isRecording, measurementType, distanceKm, steps, route,
    startRecording, stopRecording, reset,
  } = useRecordStore();
  const elapsed = useElapsedTime();
  const [selectedMode, setSelectedMode] = useState<MeasurementType>('gps');
  const [isSaving, setIsSaving] = useState(false);

  async function handleStop() {
    Alert.alert('記録を停止しますか？', '', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '停止して保存',
        style: 'destructive',
        onPress: async () => {
          if (!user) { Alert.alert('エラー', 'ログインが必要です'); return; }
          setIsSaving(true);
          try {
            const activity = await stopRecording();
            await saveActivityToFirestore({
              userId: user.id,
              activity,
              teamId: currentTeam?.id,
              activeBattleIds: getActiveBattleIds(),
            });
            Alert.alert(
              '記録完了',
              `距離: ${activity.distanceKm.toFixed(2)} km\n時間: ${formatTime(activity.durationSeconds)}`,
              [{ text: 'OK', onPress: () => reset() }]
            );
          } catch (e: any) {
            Alert.alert(
              '保存失敗',
              '記録の保存に失敗しました。通信状態を確認してください。',
              [{ text: 'OK', onPress: () => reset() }]
            );
            console.error('saveActivityToFirestore error:', e);
          } finally {
            setIsSaving(false);
          }
        },
      },
    ]);
  }

  const lastPoint = route[route.length - 1];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {isRecording && <View style={styles.redDot} />}
          <Text style={styles.headerTitle}>{isRecording ? '記録中...' : '記録'}</Text>
        </View>
      </View>

      {!isRecording ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.segmentRow}>
            {(['gps', 'steps'] as MeasurementType[]).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.segment, selectedMode === mode && styles.segmentActive]}
                onPress={() => setSelectedMode(mode)}
              >
                <Text style={[styles.segmentLabel, selectedMode === mode && styles.segmentLabelActive]}>
                  {mode === 'gps' ? '📍 GPS' : '👟 歩数'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.startArea}>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => startRecording(selectedMode)}
              activeOpacity={0.8}
            >
              <Text style={styles.startIcon}>▶</Text>
              <Text style={styles.startLabel}>スタート</Text>
            </TouchableOpacity>
            <Text style={styles.startHint}>タップして開始</Text>
          </View>

          <View style={styles.goalRow}>
            <Text style={styles.goalText}>目標: 5.00 km</Text>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.recordingArea}>
          {/* 距離 */}
          <View style={styles.distanceBlock}>
            <Text style={styles.distanceValue}>{distanceKm.toFixed(2)}</Text>
            <Text style={styles.distanceUnit}>km</Text>
          </View>

          {/* ペース・時間 / 歩数・時間 */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              {measurementType === 'steps' ? (
                <>
                  <Text style={styles.statValue}>{steps.toLocaleString()}</Text>
                  <Text style={styles.statLabel}>歩数</Text>
                </>
              ) : (
                <>
                  <Text style={styles.statValue}>{formatPace(distanceKm, elapsed)}</Text>
                  <Text style={styles.statLabel}>/km ペース</Text>
                </>
              )}
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{formatTime(elapsed)}</Text>
              <Text style={styles.statLabel}>経過時間</Text>
            </View>
          </View>

          {/* GPS マップ（GPSモードのみ） */}
          {measurementType === 'gps' && (
            lastPoint ? (
              <MapView
                style={styles.map}
                provider={PROVIDER_DEFAULT}
                showsUserLocation
                followsUserLocation
                initialRegion={{
                  latitude: lastPoint.lat,
                  longitude: lastPoint.lng,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
              >
                {route.length > 1 && (
                  <Polyline
                    coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
                    strokeColor={Colors.primary}
                    strokeWidth={3}
                  />
                )}
              </MapView>
            ) : (
              <View style={styles.mapPlaceholder}>
                <Text style={styles.mapPlaceholderText}>🗺 GPS信号を取得中...</Text>
              </View>
            )
          )}

          {/* ストップボタン */}
          <View style={styles.stopArea}>
            {isSaving ? (
              <ActivityIndicator color={Colors.primary} size="large" />
            ) : (
              <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
                <Text style={styles.stopIcon}>■</Text>
                <Text style={styles.stopLabel}>停止</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.error },
  scroll: { padding: Spacing.lg, gap: Spacing['2xl'] },
  segmentRow: {
    flexDirection: 'row', backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.md, padding: 4,
  },
  segment: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.sm },
  segmentActive: { backgroundColor: Colors.surface, ...Shadow.sm },
  segmentLabel: { fontSize: Typography.fontSize.md, color: Colors.textSecondary, fontWeight: Typography.fontWeight.medium },
  segmentLabelActive: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  startArea: { alignItems: 'center', gap: Spacing.md },
  startBtn: {
    width: ComponentSize.recordButtonSize, height: ComponentSize.recordButtonSize,
    borderRadius: ComponentSize.recordButtonSize / 2,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    ...Shadow.lg,
  },
  startIcon: { fontSize: 28, color: Colors.textOnPrimary },
  startLabel: { fontSize: Typography.fontSize.md, color: Colors.textOnPrimary, fontWeight: Typography.fontWeight.bold },
  startHint: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary },
  goalRow: { paddingHorizontal: Spacing.sm },
  goalText: { fontSize: Typography.fontSize.md, color: Colors.textSecondary },
  recordingArea: { flex: 1, alignItems: 'center', paddingTop: Spacing['2xl'] },
  distanceBlock: { alignItems: 'center', marginBottom: Spacing['2xl'] },
  distanceValue: { fontSize: Typography.fontSize['4xl'], fontWeight: Typography.fontWeight.extrabold, color: Colors.textPrimary },
  distanceUnit: { fontSize: Typography.fontSize.xl, color: Colors.textSecondary },
  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, width: '90%', ...Shadow.sm,
    marginBottom: Spacing.lg,
  },
  statBox: { flex: 1, alignItems: 'center', padding: Spacing.lg },
  statDivider: { width: 1, backgroundColor: Colors.border },
  statValue: { fontSize: Typography.fontSize['2xl'], fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  statLabel: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  map: { width: '90%', height: 180, borderRadius: BorderRadius.lg, marginBottom: Spacing.lg },
  mapPlaceholder: {
    width: '90%', height: 180, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surfaceGray, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  mapPlaceholderText: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary },
  stopArea: { alignItems: 'center' },
  stopBtn: {
    width: ComponentSize.recordButtonSize, height: ComponentSize.recordButtonSize,
    borderRadius: ComponentSize.recordButtonSize / 2,
    backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center',
    ...Shadow.lg,
  },
  stopIcon: { fontSize: 28, color: Colors.textOnPrimary },
  stopLabel: { fontSize: Typography.fontSize.md, color: Colors.textOnPrimary, fontWeight: Typography.fontWeight.bold },
});
