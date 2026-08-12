import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, getDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { db, functions } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import type { RoutePoint, ReactionType } from '../../types';
import { Colors, DarkColors, RoutePaceColors, BorderRadius, TextStyles } from '../../design_tokens';
import { MonoLabel } from '../../components/ui/MonoLabel';
import { KmSplitsCard } from '../../components/run/KmSplitsCard';
import { RunShareCard } from '../../components/run/RunShareCard';
import { SafetyActionsModal } from '../../components/moderation/SafetyActionsModal';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';
import { estimatedCalories, formatRunDistanceKm, kmSplits } from '../../utils/displayStats';
import { buildRouteVisualization, type RoutePaceBand } from '../../utils/routeSplits';
import { buildRunShareMessage, formatShareDuration } from '../../utils/runShare';
import { shareRunResult } from '../../lib/runSharing';
import { isPro } from '../../lib/pro';
import { useRunSharePreference } from '../../hooks/useRunSharePreference';
import { Avatar } from '../../components/ui/Avatar';
import { cachedPublicProfile } from '../../lib/publicProfileCache';
import { dayKeyToDisplayDate, getBattleActivitySummary } from '../../lib/activitySummaries';
import { useTranslation } from '../../lib/i18n';
import type { AppLanguage } from '../../lib/language';
import { translateIn } from '../../lib/translate';
import { userFacingError } from '../../lib/userError';

const ROUTE_PACE_COLOR: Record<RoutePaceBand, string> = {
  fast: RoutePaceColors.fast,
  steady: RoutePaceColors.steady,
  slow: RoutePaceColors.slow,
};

function formatTime(sec: number, language: AppLanguage): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return translateIn(language, 'activity.durationHours', { hours: h, minutes: m });
  if (m > 0) return translateIn(language, 'activity.durationMinutes', { minutes: m, seconds: s });
  return translateIn(language, 'activity.durationSeconds', { seconds: s });
}

function formatPace(km: number, sec: number): string {
  if (km < 0.01) return '--\'--"';
  const sPerKm = sec / km;
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

const REACTIONS: { type: ReactionType; translationKey: string }[] = [
  { type: '👏', translationKey: 'activity.reactionNice' },
  { type: '🔥', translationKey: 'activity.reactionGreat' },
  { type: '💪', translationKey: 'activity.reactionHelped' },
  { type: '⚡', translationKey: 'activity.reactionFast' },
];

interface ActivityData {
  id: string;
  userId: string;
  displayName: string;
  avatarEmoji?: string;
  battleIds: string[];
  distanceKm: number;
  steps: number | null;
  durationSeconds: number;
  measurementType: string;
  route: RoutePoint[];
  startedAt: string;
  endedAt: string;
}

interface BattleContribution {
  battleId: string;
  battleTitle: string;
  creditedDistanceKm: number;
}

interface ReactionCount {
  type: ReactionType;
  count: number;
  isMine: boolean;
}

export default function ActivityDetailScreen() {
  const { language, t } = useTranslation();
  const { id, battleId } = useLocalSearchParams<{ id: string; battleId?: string }>();
  const { user, proEntitlement } = useAuthStore();
  const userIsPro = isPro(user?.plan, proEntitlement);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [reactions, setReactions] = useState<ReactionCount[]>([]);
  const [battleContributions, setBattleContributions] = useState<BattleContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const {
    includeRouteInShare,
    preferenceLoaded: sharePreferenceLoaded,
    setIncludeRouteInShare,
  } = useRunSharePreference(user?.id);
  const [showSafety, setShowSafety] = useState(false);
  const shareCardRef = useRef<View>(null);
  const { blockedUserIds } = useBlockedUsers(user?.id);

  useEffect(() => {
    if (!id || !user) return;
    const load = async () => {
      setLoading(true);
      try {
        const toRoutePoint = (p: any): RoutePoint => {
          const point: RoutePoint = {
            lat: p['lat'] as number,
            lng: p['lng'] as number,
            timestamp: p['timestamp'] as number,
          };
          if (typeof p['alt'] === 'number') point.alt = p['alt'];
          if (typeof p['accuracy'] === 'number') point.accuracy = p['accuracy'];
          if (typeof p['altitudeAccuracy'] === 'number') point.altitudeAccuracy = p['altitudeAccuracy'];
          if (p['seg'] === true) point.seg = true;
          return point;
        };
        const setOwnerActivity = async () => {
          const snap = await getDoc(doc(db, 'activities', id));
          if (!snap.exists()) throw new Error('activity-not-found');
          const d = snap.data();
          const startMs: number = d['startedAt']?.toMillis?.()
            ?? (d['startedAt']?.seconds ? d['startedAt'].seconds * 1000 : Date.now());
          const endMs: number = d['endedAt']?.toMillis?.()
            ?? (d['endedAt']?.seconds ? d['endedAt'].seconds * 1000 : Date.now());
          let route: RoutePoint[] = ((d['route'] as any[]) ?? []).map(toRoutePoint);
          if (route.length === 0) {
            const chunks = await getDocs(query(
              collection(db, 'users', user.id, 'activityRoutes', id, 'chunks'),
              orderBy('index', 'asc'),
            ));
            route = chunks.docs.flatMap((chunk) => ((chunk.data()['points'] as any[]) ?? []).map(toRoutePoint));
          }
          const ownerBattleIds = ((d['battleIds'] as string[] | undefined) ?? []);
          const impactMap = (d['aggregationImpacts'] as Record<string, { creditedDistanceKm?: number }> | undefined) ?? {};
          const activityDistanceKm = (d['distanceKm'] as number) ?? 0;
          const profile = await cachedPublicProfile(user.id).catch(() => null);
          setActivity({
            id: snap.id,
            userId: user.id,
            displayName: profile?.name ?? (d['displayName'] as string) ?? t('activity.member'),
            avatarEmoji: profile?.avatarEmoji,
            battleIds: ownerBattleIds,
            distanceKm: activityDistanceKm,
            steps: (d['steps'] as number | null) ?? null,
            durationSeconds: (d['durationSeconds'] as number) ?? 0,
            measurementType: (d['measurementType'] as string) ?? 'gps',
            route,
            startedAt: new Date(startMs).toISOString(),
            endedAt: new Date(endMs).toISOString(),
          });
          const contributions = await Promise.all(
            ownerBattleIds.map(async (ownerBattleId) => {
              const battleSnap = await getDoc(doc(db, 'battles', ownerBattleId)).catch(() => null);
              return battleSnap?.exists() ? {
                battleId: ownerBattleId,
                battleTitle: battleSnap.data()['title'] as string,
                creditedDistanceKm: typeof impactMap[ownerBattleId]?.creditedDistanceKm === 'number'
                  ? impactMap[ownerBattleId].creditedDistanceKm!
                  : activityDistanceKm,
              } : null;
            }),
          );
          setBattleContributions(contributions.filter((item): item is BattleContribution => item !== null));
        };

        if (battleId) {
          const shared = await getBattleActivitySummary(battleId, id);
          if (shared.activity.userId === user.id) {
            await setOwnerActivity();
          } else {
            const profile = await cachedPublicProfile(shared.activity.userId).catch(() => null);
            const displayDate = dayKeyToDisplayDate(shared.activity.dayKey);
            if (Number.isNaN(displayDate.getTime())) throw new Error('activity-date-invalid');
            setActivity({
              id: shared.activity.id,
              userId: shared.activity.userId,
              displayName: profile?.name ?? shared.activity.displayName ?? t('activity.member'),
              avatarEmoji: profile?.avatarEmoji,
              battleIds: [],
              distanceKm: shared.activity.distanceKm,
              steps: shared.activity.steps,
              durationSeconds: shared.activity.durationSeconds,
              measurementType: shared.activity.measurementType,
              route: [],
              startedAt: displayDate.toISOString(),
              endedAt: displayDate.toISOString(),
            });
            setBattleContributions([{
              battleId,
              battleTitle: shared.contribution.battleTitle,
              creditedDistanceKm: shared.contribution.creditedDistanceKm,
            }]);
          }
        } else {
          await setOwnerActivity();
        }

        // リアクション取得
        const rSnap = await getDocs(collection(db, 'activities', id, 'reactions'));
        const counts: Record<string, { count: number; isMine: boolean }> = {};
        rSnap.docs.forEach((r) => {
          const type = r.data()['type'] as string;
          if (!counts[type]) counts[type] = { count: 0, isMine: false };
          counts[type].count++;
          if (r.id === user.id) counts[type].isMine = true;
        });
        const rc: ReactionCount[] = REACTIONS.map((r) => ({
          type: r.type,
          count: counts[r.type]?.count ?? 0,
          isMine: counts[r.type]?.isMine ?? false,
        }));
        setReactions(rc);
      } catch {
        setActivity(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [battleId, id, user?.id, t]);

  function handleDelete() {
    if (!id || !activity) return;
    Alert.alert(
      t('activity.deleteTitle'),
      t('activity.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('activity.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const remove = httpsCallable(functions, 'deleteActivity');
              await remove({ activityId: id });
              router.back();
            } catch (e: any) {
              const message = userFacingError(e, t('activity.retry'));
              Alert.alert(t('activity.deleteFailed'), message);
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  async function handleShareRun() {
    if (!activity || activity.userId !== user?.id || sharing || !sharePreferenceLoaded) return;
    const locale = language === 'ja' ? 'ja-JP' : 'en-US';
    const dateLabel = new Date(activity.startedAt).toLocaleDateString(locale, {
      month: 'numeric', day: 'numeric',
    });
    const pace = activity.measurementType === 'gps'
      ? formatPace(activity.distanceKm, activity.durationSeconds)
      : null;
    const primaryContribution = battleContributions[0] ?? null;
    const impactLabel = primaryContribution
      ? t('activity.contributionShare', { title: primaryContribution.battleTitle, distance: formatRunDistanceKm(primaryContribution.creditedDistanceKm) })
      : null;
    const message = buildRunShareMessage({
      distanceKm: activity.distanceKm,
      durationSeconds: activity.durationSeconds,
      pace,
      dateLabel,
      impactLabel,
      language,
    });

    setSharing(true);
    try {
      await shareRunResult(shareCardRef.current, message, t('activity.shareDialog'));
    } catch (error) {
      console.warn('[ActivityDetail] share failed:', error);
      Alert.alert(t('summary.shareFailed'), t('summary.tryAgainLater'));
    } finally {
      setSharing(false);
    }
  }

  async function handleReaction(type: ReactionType) {
    if (!id || !user || !activity) return;
    const { doc: fDoc, setDoc, deleteDoc, serverTimestamp } = await import('firebase/firestore');
    const ref = fDoc(db, 'activities', id, 'reactions', user.id);
    const existing = reactions.find((r) => r.type === type);
    if (existing?.isMine) {
      await deleteDoc(ref);
    } else {
      // リアクション通知はCloud Functions（onReactionCreated）が作成する
      await setDoc(ref, { type, userId: user.id, createdAt: serverTimestamp() });
    }
    setReactions((prev) =>
      prev.map((r) => {
        if (r.type === type) return { ...r, count: existing?.isMine ? r.count - 1 : r.count + 1, isMine: !existing?.isMine };
        if (r.isMine && !existing?.isMine) return { ...r, count: r.count - 1, isMine: false };
        return r;
      })
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!activity) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}><Text style={{ color: Colors.textSecondary }}>{t('activity.notFound')}</Text></View>
      </SafeAreaView>
    );
  }

  if (activity.userId !== user?.id && blockedUserIds.has(activity.userId)) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t('activity.publicRecord')}</Text>
        </View>
        <View style={s.center}>
          <Ionicons name="eye-off-outline" size={34} color={Colors.textTertiary} />
          <Text style={s.blockedTitle}>{t('activity.blockedRecord')}</Text>
          <Text style={s.blockedDetail}>{t('activity.unblockHint')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const startDt = new Date(activity.startedAt);
  const endDt = new Date(activity.endedAt);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const dateStr = startDt.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const shareDateStr = startDt.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const startTimeStr = startDt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const endTimeStr = endDt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const hasRoute = activity.measurementType === 'gps' && activity.route.length > 1;
  const splits = hasRoute ? kmSplits(activity.route) : [];
  const routeVisualization = hasRoute
    ? buildRouteVisualization(activity.route)
    : { segments: [], kmMarkers: [] };
  const calories = estimatedCalories(activity.distanceKm, activity.durationSeconds);
  const sharePace = activity.measurementType === 'gps'
    ? formatPace(activity.distanceKm, activity.durationSeconds)
    : null;
  const primaryContribution = battleContributions[0] ?? null;
  const shareImpactLabel = primaryContribution
    ? battleContributions.length > 1
      ? t('activity.contributionShareMore', { title: primaryContribution.battleTitle, distance: formatRunDistanceKm(primaryContribution.creditedDistanceKm), count: battleContributions.length - 1 })
      : t('activity.contributionShare', { title: primaryContribution.battleTitle, distance: formatRunDistanceKm(primaryContribution.creditedDistanceKm) })
    : null;
  const isOwnActivity = user?.id === activity.userId;
  let mapRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null = null;
  if (hasRoute) {
    const lats = activity.route.map((p) => p.lat);
    const lngs = activity.route.map((p) => p.lng);
    mapRegion = {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitudeDelta: Math.max(Math.max(...lats) - Math.min(...lats), 0.002) * 1.5,
      longitudeDelta: Math.max(Math.max(...lngs) - Math.min(...lngs), 0.002) * 1.5,
    };
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{dateStr}</Text>
        </View>
        {user?.id === activity.userId ? (
          <View style={s.headerActions}>
            <TouchableOpacity
              onPress={handleShareRun}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('activity.shareA11y')}
              accessibilityState={{ busy: sharing, disabled: sharing || !sharePreferenceLoaded }}
              disabled={sharing || !sharePreferenceLoaded}
            >
              {sharing
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Ionicons name="share-social-outline" size={20} color={Colors.primaryDark} />}
            </TouchableOpacity>
            {deleting ? (
              <ActivityIndicator size="small" color={Colors.textTertiary} />
            ) : (
              <TouchableOpacity
                onPress={handleDelete}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('activity.deleteA11y')}
              >
                <Ionicons name="trash-outline" size={20} color={Colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setShowSafety(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('activity.safetyA11y', { name: activity.displayName })}
          >
            <Ionicons name="ellipsis-horizontal" size={21} color={Colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.runnerRow}>
          <Avatar name={activity.displayName} emoji={activity.avatarEmoji} size="md" />
          <View style={s.runnerCopy}>
            <Text style={s.runnerName}>{isOwnActivity ? t('activity.ownRun') : t('activity.userRun', { name: activity.displayName })}</Text>
            <Text style={s.runnerDate}>{dateStr}</Text>
          </View>
        </View>
        {/* ── Hero stats ── */}
        <View style={s.heroCard}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={s.heroBig}>{formatRunDistanceKm(activity.distanceKm)}</Text>
            <Text style={s.heroUnit}>KM</Text>
          </View>
          <View style={s.statRow}>
            <View style={s.statItem}>
              <MonoLabel color={Colors.textTertiary} size={8}>{t('activity.time')}</MonoLabel>
              <Text style={s.statVal}>{formatTime(activity.durationSeconds, language)}</Text>
            </View>
            {activity.measurementType === 'gps' && (
              <>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <MonoLabel color={Colors.textTertiary} size={8}>{t('activity.pace')}</MonoLabel>
                  <Text style={s.statVal}>{formatPace(activity.distanceKm, activity.durationSeconds)}<Text style={s.statUnit}>/km</Text></Text>
                </View>
              </>
            )}
            {activity.steps != null && activity.steps > 0 && (
              <>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <MonoLabel color={Colors.textTertiary} size={8}>{t('activity.steps')}</MonoLabel>
                  <Text style={s.statVal}>{activity.steps.toLocaleString(locale)}</Text>
                </View>
              </>
            )}
          </View>
          <View style={s.timeRow}>
            <Ionicons name={isOwnActivity ? 'time-outline' : 'shield-checkmark-outline'} size={12} color={DarkColors.textTertiary} />
            <Text style={s.timeText}>
              {isOwnActivity ? `${startTimeStr} – ${endTimeStr}` : t('activity.privateTimes')}
            </Text>
            {calories != null && <Text style={s.timeText}>{t('activity.calories', { calories })}</Text>}
          </View>
        </View>

        {/* ── Map ── */}
        {hasRoute && mapRegion && (
          <View style={s.mapCard}>
            <MapView
              style={s.map}
              provider={PROVIDER_DEFAULT}
              initialRegion={mapRegion}
              scrollEnabled={false}
              zoomEnabled={false}
            >
              {routeVisualization.segments.map((segment) => (
                <Polyline
                  key={segment.id}
                  coordinates={segment.coordinates}
                  strokeColor={ROUTE_PACE_COLOR[segment.band]}
                  strokeWidth={4}
                />
              ))}
              {routeVisualization.kmMarkers.map((marker) => (
                <Marker
                  key={`km-marker-${marker.km}`}
                  coordinate={marker}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  zIndex={2}
                  accessibilityLabel={t('activity.kmPointA11y', { km: marker.km })}
                >
                  <View style={s.kmMarker}>
                    <Text style={s.kmMarkerText}>{marker.km}</Text>
                  </View>
                </Marker>
              ))}
            </MapView>
            <View style={s.paceLegend} pointerEvents="none">
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: RoutePaceColors.fast }]} />
                <Text style={s.legendText}>{t('activity.fast')}</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: RoutePaceColors.steady }]} />
                <Text style={s.legendText}>{t('activity.steady')}</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: RoutePaceColors.slow }]} />
                <Text style={s.legendText}>{t('activity.slow')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── 1km splits ── */}
        {splits.length > 0 && (
          <View style={s.section}>
            <Text style={TextStyles.sectionTitle}>{t('activity.kmLaps')}</Text>
            <KmSplitsCard splits={splits} />
          </View>
        )}

        {/* ── Battle contribution ── */}
        {battleContributions.length > 0 && (
          <View style={s.section}>
            <Text style={TextStyles.sectionTitle}>{t('activity.battleContribution')}</Text>
            {battleContributions.map((c) => (
              <TouchableOpacity
                key={c.battleId}
                style={s.battleCard}
                onPress={() => router.push(`/battle/${c.battleId}` as any)}
                activeOpacity={0.75}
              >
                <Ionicons name="flash" size={18} color={Colors.accentText} />
                <View style={{ flex: 1 }}>
                  <Text style={s.battleTitle}>{c.battleTitle}</Text>
                  <Text style={s.battleContrib}>{t('activity.contribution', { distance: formatRunDistanceKm(c.creditedDistanceKm) })}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Share own activity ── */}
        {user?.id === activity.userId && (
          <View style={s.section}>
            <Text style={TextStyles.sectionTitle}>{t('activity.shareRun')}</Text>
            <RunShareCard
              ref={shareCardRef}
              distanceKm={activity.distanceKm}
              durationLabel={formatShareDuration(activity.durationSeconds)}
              paceLabel={sharePace?.includes('--') ? null : sharePace}
              dateLabel={shareDateStr}
              impactLabel={shareImpactLabel}
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
                accessibilityLabel={t('summary.routeShareA11y')}
              >
                <Ionicons
                  name={includeRouteInShare ? 'map' : 'map-outline'}
                  size={16}
                  color={includeRouteInShare ? Colors.primaryDark : Colors.textSecondary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.routeShareToggleTitle}>
                    {includeRouteInShare ? t('summary.routeShown') : t('summary.routeHidden')}
                  </Text>
                  <Text style={s.routeShareToggleHint}>{t('summary.routePrivacy')}</Text>
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
              accessibilityLabel={t('activity.shareA11y')}
              accessibilityState={{ busy: sharing, disabled: sharing || !sharePreferenceLoaded }}
            >
              {sharing
                ? <ActivityIndicator size="small" color={Colors.textOnPrimary} />
                : <Ionicons name="share-social-outline" size={18} color={Colors.textOnPrimary} />}
              <Text style={s.shareBtnText}>{sharing ? t('summary.preparingShare') : t('summary.shareSocial')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Reactions ── */}
        <View style={s.section}>
          <Text style={TextStyles.sectionTitle}>{t('activity.reactions')}</Text>
          <View style={s.reactionsRow}>
            {reactions.map((r) => (
              <TouchableOpacity
                key={r.type}
                style={[s.reactionBtn, r.isMine && s.reactionBtnActive]}
                onPress={() => handleReaction(r.type)}
                activeOpacity={0.75}
              >
                <Text style={s.reactionEmoji}>{r.type}</Text>
                {r.count > 0 && (
                  <Text style={[s.reactionCount, r.isMine && { color: Colors.primary }]}>{r.count}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
      {user && (
        <SafetyActionsModal
          visible={showSafety}
          currentUserId={user.id}
          target={{
            type: 'activity', id: activity.id, targetUid: activity.userId,
            contentSnapshot: `${activity.displayName} / ${formatRunDistanceKm(activity.distanceKm)}km`,
          }}
          targetDisplayName={activity.displayName}
          onClose={() => setShowSafety(false)}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginTop: 2 },
  blockedTitle: { marginTop: 12, fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  blockedDetail: { marginTop: 5, fontSize: 11, color: Colors.textSecondary },
  scroll: { paddingBottom: 48 },
  runnerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface },
  runnerCopy: { flex: 1, minWidth: 0 },
  runnerName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  runnerDate: { marginTop: 2, fontSize: 11, color: Colors.textSecondary },

  heroCard: {
    backgroundColor: DarkColors.background,
    padding: 20,
    gap: 16,
  },
  heroBig: { fontSize: 72, fontWeight: '900', color: DarkColors.textPrimary, letterSpacing: -3, lineHeight: 72, fontVariant: ['tabular-nums'] },
  heroUnit: { fontSize: 24, fontWeight: '700', color: DarkColors.textTertiary, letterSpacing: 1 },
  statRow: {
    flexDirection: 'row',
    backgroundColor: DarkColors.line,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 3 },
  statDivider: { width: 1, backgroundColor: DarkColors.line },
  statVal: { fontSize: 17, fontWeight: '600', color: DarkColors.textPrimary, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 10, color: DarkColors.textTertiary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timeText: { fontSize: 12, color: DarkColors.textSecondary, fontWeight: '600' },

  mapCard: {
    height: 200,
    marginHorizontal: 16, marginTop: 12,
    borderRadius: BorderRadius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  map: { flex: 1 },
  kmMarker: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 4,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  kmMarkerText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  paceLegend: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot: { width: 8, height: 8, borderRadius: BorderRadius.full },
  legendText: { fontSize: 9, fontWeight: '700', color: Colors.textSecondary },

  section: { paddingHorizontal: 16, marginTop: 16, gap: 8 },

  battleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.accent}12`,
    borderWidth: 1, borderColor: `${Colors.accent}30`,
  },
  battleTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  battleContrib: { fontSize: 12, color: Colors.accentText, fontWeight: '700', marginTop: 1, fontVariant: ['tabular-nums'] },

  routeShareToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 11, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  routeShareToggleTitle: { fontSize: 12, fontWeight: '800', color: Colors.textPrimary },
  routeShareToggleHint: { marginTop: 2, fontSize: 9, lineHeight: 13, color: Colors.textSecondary },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, borderRadius: BorderRadius.md, backgroundColor: DarkColors.background,
  },
  shareBtnDisabled: { opacity: 0.65 },
  shareBtnText: { fontSize: 14, fontWeight: '800', color: Colors.textOnPrimary },

  reactionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  reactionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingHorizontal: 16, minHeight: 44,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  reactionBtnActive: {
    borderColor: `${Colors.primary}60`, backgroundColor: `${Colors.primary}12`,
  },
  reactionEmoji: { fontSize: 20 },
  reactionCount: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
});
