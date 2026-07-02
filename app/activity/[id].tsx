import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import type { RoutePoint, ReactionType } from '../../types';

const BR = {
  light:   '#F4F2EC',
  lightSurf2: '#EDEAE2',
  lightLine:  'rgba(10,14,26,0.08)',
  dark:    '#0A0E1A',
  ink:     '#0A0E1A',
  ink2:    '#5A6477',
  ink3:    '#9AA4B5',
  primary: '#00D9A3',
  accent:  '#FF5C2B',
  gold:    '#FFC23C',
  paper:   '#FFFFFF',
};

function Tac({ children, color = BR.ink3, size = 9 }: {
  children: string; color?: string; size?: number;
}) {
  return (
    <Text style={{
      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
      fontSize: size, fontWeight: '700',
      letterSpacing: size * 0.2, color, textTransform: 'uppercase',
    }}>{children}</Text>
  );
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

function formatPace(km: number, sec: number): string {
  if (km < 0.01) return '--\'--"';
  const sPerKm = sec / km;
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

const REACTIONS: { type: ReactionType; label: string }[] = [
  { type: '👏', label: 'ナイス' },
  { type: '🔥', label: 'すごい' },
  { type: '💪', label: '助かった' },
  { type: '⚡', label: '速い' },
];

interface ActivityData {
  id: string;
  userId: string;
  displayName: string;
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
}

interface ReactionCount {
  type: ReactionType;
  count: number;
  isMine: boolean;
}

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [reactions, setReactions] = useState<ReactionCount[]>([]);
  const [battleContributions, setBattleContributions] = useState<BattleContribution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !user) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'activities', id));
        if (!snap.exists()) return;
        const d = snap.data();

        const startMs: number = d['startedAt']?.toMillis?.() ?? (d['startedAt']?.seconds ? d['startedAt'].seconds * 1000 : Date.now());
        const endMs: number = d['endedAt']?.toMillis?.() ?? (d['endedAt']?.seconds ? d['endedAt'].seconds * 1000 : Date.now());

        const route: RoutePoint[] = ((d['route'] as any[]) ?? []).map((p: any) => ({
          lat: p['lat'] as number,
          lng: p['lng'] as number,
          timestamp: p['timestamp'] as number,
        }));

        const battleIds = ((d['battleIds'] as string[] | undefined) ?? []);

        setActivity({
          id: snap.id,
          userId: d['userId'] as string,
          displayName: (d['displayName'] as string) ?? 'メンバー',
          battleIds,
          distanceKm: (d['distanceKm'] as number) ?? 0,
          steps: (d['steps'] as number | null) ?? null,
          durationSeconds: (d['durationSeconds'] as number) ?? 0,
          measurementType: (d['measurementType'] as string) ?? 'gps',
          route,
          startedAt: new Date(startMs).toISOString(),
          endedAt: new Date(endMs).toISOString(),
        });

        // 反映先バトル名を全件取得（複数バトル参加中の場合すべて表示する）
        const contributions = await Promise.all(
          battleIds.map(async (bid) => {
            const bSnap = await getDoc(doc(db, 'battles', bid));
            return bSnap.exists() ? { battleId: bid, battleTitle: bSnap.data()['title'] as string } : null;
          })
        );
        setBattleContributions(contributions.filter((c): c is BattleContribution => c !== null));

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
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, user]);

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
        <View style={s.center}><ActivityIndicator color={BR.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!activity) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}><Text style={{ color: BR.ink3 }}>記録が見つかりませんでした</Text></View>
      </SafeAreaView>
    );
  }

  const startDt = new Date(activity.startedAt);
  const endDt = new Date(activity.endedAt);
  const dateStr = startDt.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const startTimeStr = startDt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const endTimeStr = endDt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  const hasRoute = activity.measurementType === 'gps' && activity.route.length > 1;
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={BR.ink2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Tac color={BR.ink3} size={9}>ACTIVITY / 記録詳細</Tac>
          <Text style={s.headerTitle}>{dateStr}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero stats ── */}
        <View style={s.heroCard}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={s.heroBig}>{activity.distanceKm.toFixed(2)}</Text>
            <Text style={s.heroUnit}>KM</Text>
          </View>
          <View style={s.statRow}>
            <View style={s.statItem}>
              <Tac color={BR.ink3} size={8}>時間</Tac>
              <Text style={s.statVal}>{formatTime(activity.durationSeconds)}</Text>
            </View>
            {activity.measurementType === 'gps' && (
              <>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Tac color={BR.ink3} size={8}>ペース</Tac>
                  <Text style={s.statVal}>{formatPace(activity.distanceKm, activity.durationSeconds)}<Text style={s.statUnit}>/km</Text></Text>
                </View>
              </>
            )}
            {activity.steps != null && activity.steps > 0 && (
              <>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Tac color={BR.ink3} size={8}>歩数</Tac>
                  <Text style={s.statVal}>{activity.steps.toLocaleString()}</Text>
                </View>
              </>
            )}
          </View>
          <View style={s.timeRow}>
            <Ionicons name="time-outline" size={12} color={BR.ink3} />
            <Text style={s.timeText}>{startTimeStr} 〜 {endTimeStr}</Text>
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
              <Polyline
                coordinates={activity.route.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
                strokeColor={BR.primary}
                strokeWidth={3}
              />
            </MapView>
          </View>
        )}

        {/* ── Battle contribution ── */}
        {battleContributions.length > 0 && (
          <View style={s.section}>
            <Tac color={BR.ink3} size={9}>バトル貢献</Tac>
            {battleContributions.map((c) => (
              <TouchableOpacity
                key={c.battleId}
                style={s.battleCard}
                onPress={() => router.push(`/battle/${c.battleId}` as any)}
                activeOpacity={0.75}
              >
                <Ionicons name="flash" size={18} color={BR.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={s.battleTitle}>{c.battleTitle}</Text>
                  <Text style={s.battleContrib}>+{activity.distanceKm.toFixed(2)}km 貢献</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={BR.ink3} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Reactions ── */}
        <View style={s.section}>
          <Tac color={BR.ink3} size={9}>リアクション</Tac>
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
                  <Text style={[s.reactionCount, r.isMine && { color: BR.primary }]}>{r.count}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BR.light },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: BR.paper, borderBottomWidth: 1, borderBottomColor: BR.lightLine,
  },
  headerTitle: { fontSize: 14, fontWeight: '700', color: BR.ink, marginTop: 2 },
  scroll: { paddingBottom: 48 },

  heroCard: {
    backgroundColor: BR.dark,
    padding: 20,
    gap: 16,
  },
  heroBig: { fontSize: 72, fontWeight: '900', color: '#fff', letterSpacing: -3, lineHeight: 72 },
  heroUnit: { fontSize: 24, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },
  statRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 3 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  statVal: { fontSize: 17, fontWeight: '600', color: '#fff', letterSpacing: -0.3 },
  statUnit: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timeText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },

  mapCard: {
    height: 200,
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: BR.lightLine,
  },
  map: { flex: 1 },

  section: { paddingHorizontal: 16, marginTop: 16, gap: 8 },

  battleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 12,
    backgroundColor: `${BR.accent}12`,
    borderWidth: 1, borderColor: `${BR.accent}30`,
  },
  battleTitle: { fontSize: 13, fontWeight: '800', color: BR.ink },
  battleContrib: { fontSize: 12, color: BR.accent, fontWeight: '700', marginTop: 1 },

  reactionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  reactionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 99, borderWidth: 1, borderColor: BR.lightLine,
    backgroundColor: BR.paper,
  },
  reactionBtnActive: {
    borderColor: `${BR.primary}60`, backgroundColor: `${BR.primary}12`,
  },
  reactionEmoji: { fontSize: 20 },
  reactionCount: { fontSize: 14, fontWeight: '700', color: BR.ink2 },
});
