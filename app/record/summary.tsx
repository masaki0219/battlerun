import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { collection, doc, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { isPro } from '../../lib/pro';
import { Colors, DarkColors, BorderRadius, TextStyles } from '../../design_tokens';
import { MonoLabel } from '../../components/ui/MonoLabel';
import { KmSplitsCard } from '../../components/run/KmSplitsCard';
import { RunShareCard } from '../../components/run/RunShareCard';
import { estimatedCalories, type KmSplit } from '../../utils/displayStats';
import { buildRouteVisualization } from '../../utils/routeSplits';
import { buildRunShareMessage, formatShareDuration } from '../../utils/runShare';
import type { PersonalRecordKey, RoutePoint } from '../../types';
import { decorLabel } from '../../lib/locale';
import { shareRunResult } from '../../lib/runSharing';
import { useRunSharePreference } from '../../hooks/useRunSharePreference';

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

interface BattleImpact {
  battleId: string;
  battleTitle: string;
  rankBefore: number;
  rankAfter: number;
  totalKm: number;
  creditedDistanceKm?: number;
}

const PERSONAL_RECORD_LABELS: Record<PersonalRecordKey, string> = {
  fastest1kSec: '最速1km',
  fastest5kSec: '最速5km',
  fastest10kSec: '最速10km',
  longestRunKm: '最長距離',
  maxElevationGainM: '最高推定獲得標高',
  bestMonthKm: '最高月間距離',
};

function personalRecordKeys(value: unknown): PersonalRecordKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((key): key is PersonalRecordKey => (
    typeof key === 'string' && key in PERSONAL_RECORD_LABELS
  ));
}

export default function RecordingSummaryScreen() {
  const params = useLocalSearchParams<{
    activityId: string;
    distanceKm: string;
    durationSeconds: string;
    steps: string;
    pace: string;
    splits: string;
    elevationGain: string;
    declarationAchieved: string;
  }>();

  const activityId = params.activityId ?? '';
  const distanceKm = parseFloat(params.distanceKm ?? '0');
  const durationSeconds = parseInt(params.durationSeconds ?? '0', 10);
  const steps = parseInt(params.steps ?? '0', 10);
  const pace = params.pace ?? "--'--\"";
  const splits: KmSplit[] = (() => {
    try {
      const parsed = JSON.parse(params.splits ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const elevationGain = params.elevationGain ? parseInt(params.elevationGain, 10) : null;
  const calories = estimatedCalories(distanceKm, durationSeconds);
  const declarationAchieved = params.declarationAchieved === '1';

  const { user, proEntitlement } = useAuthStore();
  const userIsPro = isPro(user?.plan, proEntitlement);
  const [impacts, setImpacts] = useState<BattleImpact[]>([]);
  const [loadingImpact, setLoadingImpact] = useState(true);
  const [impactTimedOut, setImpactTimedOut] = useState(false);
  const [newRecords, setNewRecords] = useState<PersonalRecordKey[]>([]);
  const [activityRoute, setActivityRoute] = useState<RoutePoint[]>([]);
  const [sharing, setSharing] = useState(false);
  const {
    includeRouteInShare,
    preferenceLoaded: sharePreferenceLoaded,
    setIncludeRouteInShare,
  } = useRunSharePreference(user?.id);
  const shareCardRef = useRef<View>(null);

  useEffect(() => {
    if (!user || !activityId) return;
    let cancelled = false;
    void getDocs(query(
      collection(db, 'users', user.id, 'activityRoutes', activityId, 'chunks'),
      orderBy('index', 'asc'),
    )).then((snapshot) => {
      if (cancelled) return;
      const route = snapshot.docs.flatMap((chunk) => {
        const points = chunk.data()['points'];
        if (!Array.isArray(points)) return [];
        return points.flatMap((raw): RoutePoint[] => {
          if (!raw || typeof raw !== 'object') return [];
          const point = raw as Record<string, unknown>;
          if (
            typeof point['lat'] !== 'number' || !Number.isFinite(point['lat'])
            || typeof point['lng'] !== 'number' || !Number.isFinite(point['lng'])
            || typeof point['timestamp'] !== 'number' || !Number.isFinite(point['timestamp'])
          ) return [];
          const parsed: RoutePoint = {
            lat: point['lat'], lng: point['lng'], timestamp: point['timestamp'],
          };
          if (typeof point['accuracy'] === 'number') parsed.accuracy = point['accuracy'];
          if (typeof point['alt'] === 'number') parsed.alt = point['alt'];
          if (typeof point['altitudeAccuracy'] === 'number') parsed.altitudeAccuracy = point['altitudeAccuracy'];
          if (point['seg'] === true) parsed.seg = true;
          return [parsed];
        });
      });
      setActivityRoute(route);
    }).catch((error) => console.warn('[RecordingSummary] route load failed:', error));
    return () => { cancelled = true; };
  }, [user?.id, activityId]);

  const routeVisualization = useMemo(
    () => buildRouteVisualization(activityRoute),
    [activityRoute],
  );
  const mapRegion = useMemo(() => {
    if (activityRoute.length < 2) return null;
    const lats = activityRoute.map((point) => point.lat);
    const lngs = activityRoute.map((point) => point.lng);
    return {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitudeDelta: Math.max(Math.max(...lats) - Math.min(...lats), 0.002) * 1.5,
      longitudeDelta: Math.max(Math.max(...lngs) - Math.min(...lngs), 0.002) * 1.5,
    };
  }, [activityRoute]);

  // サーバー集計が確定した時点の before/after を活動ドキュメントから受け取る。
  // クライアント側で距離を足し直さないため、Functionsとの競合や二重加算表示が起きない。
  useEffect(() => {
    if (!user || !activityId) {
      setLoadingImpact(false);
      setImpactTimedOut(false);
      return;
    }
    setLoadingImpact(true);
    setImpactTimedOut(false);
    const timeout = setTimeout(() => {
      setLoadingImpact(false);
      setImpactTimedOut(true);
    }, 15_000);
    const unsubscribe = onSnapshot(doc(db, 'activities', activityId), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setNewRecords(personalRecordKeys(data['newRecords']));
      const impactMap = (data['aggregationImpacts'] as Record<string, BattleImpact> | undefined) ?? {};
      setImpacts(Object.values(impactMap).sort((a, b) => {
        const rankGain = (b.rankBefore - b.rankAfter) - (a.rankBefore - a.rankAfter);
        return rankGain || a.battleId.localeCompare(b.battleId);
      }));
      if (data['aggregated'] === true) {
        clearTimeout(timeout);
        setImpactTimedOut(false);
        setLoadingImpact(false);
      }
    }, () => {
      clearTimeout(timeout);
      setLoadingImpact(false);
      setImpactTimedOut(true);
    });
    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [user?.id, activityId]);

  const primaryImpact = impacts[0] ?? null;
  const primaryCreditedDistanceKm = primaryImpact?.creditedDistanceKm ?? distanceKm;
  const rankChanged = primaryImpact && primaryImpact.rankBefore !== primaryImpact.rankAfter;
  const hasMultipleImpacts = impacts.length > 1;

  async function handleShareRun() {
    if (sharing || !sharePreferenceLoaded) return;
    const impactLabel = primaryImpact
      ? `「${primaryImpact.battleTitle}」チーム ${primaryImpact.rankBefore}位→${primaryImpact.rankAfter}位`
      : null;
    const message = buildRunShareMessage({
      distanceKm,
      durationSeconds,
      pace,
      impactLabel,
    });
    setSharing(true);
    try {
      await shareRunResult(shareCardRef.current, message, '今日のランをシェア');
    } catch (error) {
      console.warn('[RecordingSummary] share failed:', error);
      Alert.alert('共有できませんでした', '時間をおいてもう一度お試しください。');
    } finally {
      setSharing(false);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero dark card ─────────────────────────────── */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <MonoLabel color={DarkColors.primary} size={9}>{decorLabel('記録完了', 'RUN COMPLETE')}</MonoLabel>
            <TouchableOpacity onPress={() => router.replace('/(tabs)' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="閉じる">
              <Ionicons name="close" size={18} color={DarkColors.textTertiary} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
            <Text style={s.heroBigNum}>{distanceKm.toFixed(1)}</Text>
            <Text style={s.heroUnit}>KM</Text>
          </View>

          <View style={s.heroStats}>
            <View style={s.heroStat}>
              <MonoLabel color={DarkColors.textTertiary} size={8.5}>時間</MonoLabel>
              <Text style={s.heroStatVal}>{formatTime(durationSeconds)}</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <MonoLabel color={DarkColors.textTertiary} size={8.5}>ペース</MonoLabel>
              <Text style={s.heroStatVal}>{pace}<Text style={s.heroStatUnit}>/km</Text></Text>
            </View>
            {/* GPSラン（歩数なし）では空欄「---」を出さず、セルごと非表示にする */}
            {steps > 0 && (
              <>
                <View style={s.heroStatDivider} />
                <View style={s.heroStat}>
                  <MonoLabel color={DarkColors.textTertiary} size={8.5}>歩数</MonoLabel>
                  <Text style={s.heroStatVal}>{steps.toLocaleString()}</Text>
                </View>
              </>
            )}
          </View>

          {(calories != null || elevationGain != null) && (
            <View style={s.heroSubStats}>
              {calories != null && (
                <Text style={s.heroSubStatText}>推定 {calories} kcal（体重60kg換算）</Text>
              )}
              {elevationGain != null && (
                <Text style={s.heroSubStatText}>推定獲得標高 +{elevationGain}m</Text>
              )}
            </View>
          )}
        </View>

        {declarationAchieved && (
          <View style={s.declarationCard}>
            <View style={s.declarationIcon}>
              <Ionicons name="checkmark" size={22} color={Colors.textOnPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.declarationTitle}>宣言達成！</Text>
              <Text style={s.declarationText}>自分で決めたランを完了しました</Text>
            </View>
          </View>
        )}

        {newRecords.length > 0 && (
          <View style={s.section}>
            <View style={s.badgeCard}>
              <View style={s.badgeIcon}>
                <Ionicons name="trophy" size={24} color={Colors.textPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.badgeKicker}>自己ベスト更新！ 🎉</Text>
                <Text style={s.badgeTitle}>{newRecords.map((key) => PERSONAL_RECORD_LABELS[key]).join('・')}</Text>
                <Text style={s.badgeSub}>今日のランで新しい記録が生まれました</Text>
              </View>
              <Text style={s.badgeNew}>NEW</Text>
            </View>
          </View>
        )}

        {/* ── 1km splits ────────────────────────────────── */}
        {splits.length > 0 && (
          <View style={s.section}>
            <Text style={TextStyles.sectionTitle}>1kmラップ</Text>
            <KmSplitsCard splits={splits} />
          </View>
        )}

        {/* ── Battle impact ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={TextStyles.sectionTitle}>ランへの反映</Text>
          {loadingImpact ? (
            <View style={[s.impactCard, { alignItems: 'center', paddingVertical: 24 }]}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : impactTimedOut ? (
            <View style={[s.impactCard, { alignItems: 'center', paddingVertical: 20 }]}>
              <Ionicons name="time-outline" size={30} color={Colors.textTertiary} />
              <Text style={{ color: Colors.textSecondary, marginTop: 8, fontSize: 13, fontWeight: '700' }}>集計中です</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 11, marginTop: 3 }}>あとで活動詳細から確認できます</Text>
            </View>
          ) : primaryImpact ? (
            <View style={s.impactCard}>
              <View style={s.rankRise}>
                <View style={s.rankBefore}>
                  <Text style={s.rankBeforeLabel}>BEFORE</Text>
                  <View style={s.rankBox}>
                    <Text style={s.rankBoxNum}>{primaryImpact.rankBefore}</Text>
                  </View>
                </View>
                <View style={s.rankArrowWrap}>
                  <View style={s.rankArrowLine} />
                  {rankChanged && (
                    <View style={s.rankArrowBadge}>
                      <Text style={s.rankArrowText}>
                        {primaryImpact.rankBefore > primaryImpact.rankAfter
                          ? `+${primaryImpact.rankBefore - primaryImpact.rankAfter} 位`
                          : `${primaryImpact.rankAfter - primaryImpact.rankBefore} 位↓`}
                      </Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={14} color={Colors.primaryDark} />
                </View>
                <View style={s.rankAfter}>
                  <Text style={s.rankAfterLabel}>AFTER</Text>
                  <View style={[s.rankBoxAfter, !rankChanged && { backgroundColor: Colors.textSecondary }]}>
                    <Text style={s.rankBoxAfterNum}>{primaryImpact.rankAfter}</Text>
                  </View>
                </View>
              </View>

              <View style={s.impactBottom}>
                <View>
                  <Text style={s.impactBattleLabel}>{primaryImpact.battleTitle}</Text>
                  <Text style={s.impactTeamText}>
                    あなたのランでチームが{' '}
                    <Text style={{ color: rankChanged ? Colors.primaryDark : Colors.textPrimary, fontWeight: '900' }}>
                      {primaryImpact.rankBefore}位→{primaryImpact.rankAfter}位
                    </Text>
                  </Text>
                  {hasMultipleImpacts && (
                    <Text style={s.impactMoreText}>ほか{impacts.length - 1}件のチャレンジにも反映されました</Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.impactAddLabel}>チーム加算</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={s.impactAddVal}>+{primaryCreditedDistanceKm.toFixed(1)}</Text>
                    <Text style={s.impactAddUnit}>KM</Text>
                  </View>
                  {primaryCreditedDistanceKm + 0.0001 < distanceKm && (
                    <Text style={s.impactLimitText}>歩数モード日次上限</Text>
                  )}
                </View>
              </View>
            </View>
          ) : (
            <View style={[s.impactCard, { alignItems: 'center', paddingVertical: 20 }]}>
              <Ionicons name="walk-outline" size={32} color={Colors.textTertiary} />
              <Text style={{ color: Colors.textSecondary, marginTop: 8, fontSize: 13 }}>チャレンジ未参加</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 11, marginTop: 2 }}>チャレンジに参加して記録を競おう</Text>
            </View>
          )}
        </View>

        {/* ── Share ─────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={TextStyles.sectionTitle}>今日のランをシェア</Text>
          <RunShareCard
            ref={shareCardRef}
            distanceKm={distanceKm}
            durationLabel={formatShareDuration(durationSeconds)}
            paceLabel={pace.includes('--') ? null : pace}
            dateLabel="TODAY"
            impactLabel={primaryImpact
              ? `「${primaryImpact.battleTitle}」チーム ${primaryImpact.rankBefore}位→${primaryImpact.rankAfter}位`
              : null}
            mapRegion={includeRouteInShare ? mapRegion : null}
            routeVisualization={routeVisualization}
            showWatermark={!userIsPro}
          />
          {!!mapRegion && (
            <TouchableOpacity
              style={s.routeShareToggle}
              onPress={() => setIncludeRouteInShare((current) => !current)}
              disabled={!sharePreferenceLoaded}
              activeOpacity={0.75}
              accessibilityRole="switch"
              accessibilityState={{ checked: includeRouteInShare, disabled: !sharePreferenceLoaded }}
              accessibilityLabel="共有画像にGPSルートを表示"
            >
              <Ionicons
                name={includeRouteInShare ? 'map' : 'map-outline'}
                size={16}
                color={includeRouteInShare ? Colors.primaryDark : Colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.routeShareToggleTitle}>
                  {includeRouteInShare ? '共有画像にルートを表示中' : '共有画像のルートは非表示'}
                </Text>
                <Text style={s.routeShareToggleHint}>自宅付近などが映っていないか、プレビューを確認してください</Text>
              </View>
              <Ionicons name="swap-horizontal" size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.shareBtn, (sharing || !sharePreferenceLoaded) && s.shareBtnDisabled]}
            onPress={handleShareRun}
            activeOpacity={0.85}
            disabled={sharing || !sharePreferenceLoaded}
            accessibilityRole="button"
            accessibilityLabel="今日のラン結果をSNSに共有"
            accessibilityState={{ busy: sharing, disabled: sharing || !sharePreferenceLoaded }}
          >
            {sharing
              ? <ActivityIndicator size="small" color={Colors.textOnPrimary} />
              : <Ionicons name="share-social-outline" size={18} color={Colors.textOnPrimary} />}
            <Text style={s.shareBtnText}>{sharing ? '共有画像を準備中…' : 'SNSにシェア'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── CTA ───────────────────────────────────────── */}
        <View style={s.ctaSection}>
          <TouchableOpacity
            style={s.ctaBtn}
            onPress={() => {
              if (primaryImpact && !hasMultipleImpacts) {
                router.replace(`/battle/${primaryImpact.battleId}` as any);
              } else {
                router.replace('/(tabs)/battle' as any);
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={s.ctaBtnText}>チャレンジ詳細を見る</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={s.ctaHint}>最近の記録に表示されました</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingBottom: 40 },

  heroCard: {
    margin: 16, marginTop: 8, padding: 22, borderRadius: BorderRadius.lg,
    backgroundColor: DarkColors.background, overflow: 'hidden',
    shadowColor: DarkColors.background, shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18, shadowRadius: 32, elevation: 10,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBigNum: {
    fontSize: 80, fontWeight: '900', color: DarkColors.textPrimary,
    letterSpacing: -3, lineHeight: 80, fontVariant: ['tabular-nums'],
  },
  heroUnit: { fontSize: 28, fontWeight: '700', color: DarkColors.textTertiary, letterSpacing: 1 },
  heroStats: {
    flexDirection: 'row', marginTop: 16, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: DarkColors.lineStrong,
  },
  heroStat: { flex: 1, paddingHorizontal: 14, gap: 4 },
  heroSubStats: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: DarkColors.lineStrong,
  },
  heroSubStatText: { fontSize: 11, fontWeight: '600', color: DarkColors.textTertiary },
  heroStatVal: { fontSize: 17, fontWeight: '600', color: DarkColors.textPrimary, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  heroStatUnit: { fontSize: 10, color: DarkColors.textTertiary },
  heroStatDivider: { width: 1, backgroundColor: DarkColors.lineStrong },

  section: { paddingHorizontal: 16, marginBottom: 4 },
  declarationCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 16, padding: 14,
    borderRadius: BorderRadius.lg, backgroundColor: Colors.primaryLight,
    borderWidth: 1, borderColor: Colors.primaryBorder,
  },
  declarationIcon: {
    width: 42, height: 42, borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  declarationTitle: { fontSize: 15, fontWeight: '900', color: Colors.primaryDark },
  declarationText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  impactCard: {
    marginTop: 8, padding: 16, borderRadius: BorderRadius.lg, backgroundColor: Colors.surface,
    shadowColor: Colors.textPrimary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
  },
  rankRise: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rankBefore: { alignItems: 'center' },
  rankBeforeLabel: { fontSize: 9, color: Colors.textTertiary, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  rankBox: {
    width: 54, height: 54, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  rankBoxNum: { fontSize: 32, fontWeight: '800', color: Colors.textSecondary, lineHeight: 36, fontVariant: ['tabular-nums'] },
  rankArrowWrap: {
    flex: 1, alignItems: 'center', position: 'relative',
  },
  rankArrowLine: { height: 1, width: '100%', backgroundColor: Colors.textTertiary },
  rankArrowBadge: {
    position: 'absolute', top: -14,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  rankArrowText: { fontSize: 10, fontWeight: '900', color: DarkColors.background, letterSpacing: 0.5 },
  rankAfter: { alignItems: 'center' },
  rankAfterLabel: { fontSize: 9, color: Colors.primaryDark, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  rankBoxAfter: {
    width: 54, height: 54, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  rankBoxAfterNum: { fontSize: 32, fontWeight: '800', color: Colors.textOnPrimary, lineHeight: 36, fontVariant: ['tabular-nums'] },
  impactBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.border, borderStyle: 'dashed' as const,
  },
  impactBattleLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', letterSpacing: 1 },
  impactTeamText: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  impactMoreText: { fontSize: 10, color: Colors.textSecondary, fontWeight: '600', marginTop: 4 },
  impactAddLabel: { fontSize: 10, color: Colors.textTertiary, fontWeight: '700', letterSpacing: 1 },
  impactAddVal: { fontSize: 24, color: Colors.accent, fontWeight: '800', lineHeight: 28, fontVariant: ['tabular-nums'] },
  impactAddUnit: { fontSize: 11, color: Colors.textTertiary },
  impactLimitText: { marginTop: 2, fontSize: 8, color: Colors.textSecondary },

  badgeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: BorderRadius.lg,
    backgroundColor: `${Colors.accentYellow}1c`,
    borderWidth: 1.5, borderColor: `${Colors.accentYellow}66`,
  },
  badgeIcon: {
    width: 48, height: 48, borderRadius: BorderRadius.md,
    backgroundColor: Colors.accentYellow,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accentYellow, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  badgeKicker: { fontSize: 12, fontWeight: '700', color: Colors.accentYellow },
  badgeTitle: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary, marginTop: 1 },
  badgeSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  badgeNew: { fontSize: 11, color: Colors.accentYellow, fontWeight: '800' },

  // Share
  routeShareToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 10, padding: 11, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  routeShareToggleTitle: { fontSize: 12, fontWeight: '800', color: Colors.textPrimary },
  routeShareToggleHint: { marginTop: 2, fontSize: 9, lineHeight: 13, color: Colors.textSecondary },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: DarkColors.background, borderRadius: BorderRadius.md, paddingVertical: 14, marginTop: 12,
  },
  shareBtnDisabled: { opacity: 0.65 },
  shareBtnText: { fontSize: 14, fontWeight: '800', color: Colors.textOnPrimary },

  ctaSection: { paddingHorizontal: 16, marginTop: 16, gap: 10 },
  ctaBtn: {
    backgroundColor: DarkColors.background, borderRadius: BorderRadius.md, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: DarkColors.background, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 6,
  },
  ctaBtnText: { fontSize: 14, fontWeight: '800', color: Colors.textOnPrimary, letterSpacing: 0.5 },
  ctaHint: { textAlign: 'center', fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },

});
