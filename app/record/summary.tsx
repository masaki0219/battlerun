import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { isPro } from '../../lib/pro';
import { Colors, DarkColors, BorderRadius, TextStyles } from '../../design_tokens';
import { MonoLabel } from '../../components/ui/MonoLabel';

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
}

export default function RecordingSummaryScreen() {
  const params = useLocalSearchParams<{
    activityId: string;
    distanceKm: string;
    durationSeconds: string;
    steps: string;
    pace: string;
  }>();

  const activityId = params.activityId ?? '';
  const distanceKm = parseFloat(params.distanceKm ?? '0');
  const durationSeconds = parseInt(params.durationSeconds ?? '0', 10);
  const steps = parseInt(params.steps ?? '0', 10);
  const pace = params.pace ?? "--'--\"";

  const { user, proEntitlement } = useAuthStore();
  const userIsPro = isPro(user?.plan, proEntitlement);
  const [impacts, setImpacts] = useState<BattleImpact[]>([]);
  const [loadingImpact, setLoadingImpact] = useState(true);
  const shareCardRef = useRef<View>(null);

  // サーバー集計が確定した時点の before/after を活動ドキュメントから受け取る。
  // クライアント側で距離を足し直さないため、Functionsとの競合や二重加算表示が起きない。
  useEffect(() => {
    if (!user || !activityId) {
      setLoadingImpact(false);
      return;
    }
    setLoadingImpact(true);
    return onSnapshot(doc(db, 'activities', activityId), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      const impactMap = (data['aggregationImpacts'] as Record<string, BattleImpact> | undefined) ?? {};
      setImpacts(Object.values(impactMap));
      if (data['aggregated'] === true) setLoadingImpact(false);
    }, () => setLoadingImpact(false));
  }, [user, activityId]);

  const primaryImpact = impacts[0] ?? null;
  const rankChanged = primaryImpact && primaryImpact.rankBefore !== primaryImpact.rankAfter;
  const hasMultipleImpacts = impacts.length > 1;

  async function handleShareRun() {
    const message = primaryImpact
      ? `今日のラン: ${distanceKm.toFixed(1)}km\n「${primaryImpact.battleTitle}」陣営が${primaryImpact.rankBefore}位→${primaryImpact.rankAfter}位\n#ZELIO`
      : `今日のラン: ${distanceKm.toFixed(1)}km\n#ZELIO`;

    try {
      if (shareCardRef.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.92 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '今日のランをシェア' });
        return;
      }
    } catch (e) {
      console.warn('[RecordingSummary] image share failed, falling back to text share:', e);
    }

    try {
      await Share.share({ message });
    } catch {}
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero dark card ─────────────────────────────── */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <MonoLabel color={DarkColors.primary} size={9}>記録完了 / RUN COMPLETE</MonoLabel>
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
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <MonoLabel color={DarkColors.textTertiary} size={8.5}>歩数</MonoLabel>
              <Text style={s.heroStatVal}>{steps > 0 ? steps.toLocaleString() : '---'}</Text>
            </View>
          </View>
        </View>

        {/* ── Battle impact ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={TextStyles.sectionTitle}>ランへの反映</Text>
          {loadingImpact ? (
            <View style={[s.impactCard, { alignItems: 'center', paddingVertical: 24 }]}>
              <ActivityIndicator color={Colors.primary} />
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
                    あなたのランで陣営が{' '}
                    <Text style={{ color: rankChanged ? Colors.primaryDark : Colors.textPrimary, fontWeight: '900' }}>
                      {primaryImpact.rankBefore}位→{primaryImpact.rankAfter}位
                    </Text>
                  </Text>
                  {hasMultipleImpacts && (
                    <Text style={s.impactMoreText}>ほか{impacts.length - 1}件のチャレンジにも反映されました</Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.impactAddLabel}>陣営加算</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={s.impactAddVal}>+{distanceKm.toFixed(1)}</Text>
                    <Text style={s.impactAddUnit}>KM</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={[s.impactCard, { alignItems: 'center', paddingVertical: 20 }]}>
              <Ionicons name="walk-outline" size={32} color={Colors.textTertiary} />
              <Text style={{ color: Colors.textTertiary, marginTop: 8, fontSize: 13 }}>チャレンジ未参加</Text>
              <Text style={{ color: Colors.textTertiary, fontSize: 11, marginTop: 2 }}>チャレンジに参加して記録を競おう</Text>
            </View>
          )}
        </View>

        {/* ── Share ─────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={TextStyles.sectionTitle}>今日のランをシェア</Text>
          <View ref={shareCardRef} collapsable={false} style={s.shareCard}>
            <View style={{ gap: 4 }}>
              <Text style={s.shareCardKm}>{distanceKm.toFixed(1)}<Text style={s.shareCardKmUnit}> km</Text></Text>
              {primaryImpact ? (
                <Text style={s.shareCardImpact}>
                  「{primaryImpact.battleTitle}」陣営 {primaryImpact.rankBefore}位→{primaryImpact.rankAfter}位
                </Text>
              ) : null}
              <Text style={s.shareCardTag}>#ZELIO</Text>
            </View>
            {!userIsPro && (
              <View style={s.shareWatermarkBadge}>
                <Text style={s.shareWatermarkText}>ZELIO</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={s.shareBtn} onPress={handleShareRun} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={18} color={Colors.textOnPrimary} />
            <Text style={s.shareBtnText}>今日のランをシェア</Text>
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
  heroStatVal: { fontSize: 17, fontWeight: '600', color: DarkColors.textPrimary, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  heroStatUnit: { fontSize: 10, color: DarkColors.textTertiary },
  heroStatDivider: { width: 1, backgroundColor: DarkColors.lineStrong },

  section: { paddingHorizontal: 16, marginBottom: 4 },

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
  impactBattleLabel: { fontSize: 11, color: Colors.textTertiary, fontWeight: '700', letterSpacing: 1 },
  impactTeamText: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  impactMoreText: { fontSize: 10, color: Colors.textTertiary, fontWeight: '600', marginTop: 4 },
  impactAddLabel: { fontSize: 10, color: Colors.textTertiary, fontWeight: '700', letterSpacing: 1 },
  impactAddVal: { fontSize: 24, color: Colors.accent, fontWeight: '800', lineHeight: 28, fontVariant: ['tabular-nums'] },
  impactAddUnit: { fontSize: 11, color: Colors.textTertiary },

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
  badgeSub: { fontSize: 11, color: Colors.textTertiary, marginTop: 1 },
  badgeNew: { fontSize: 11, color: Colors.accentYellow, fontWeight: '800' },

  // Share
  shareCard: {
    marginTop: 8, padding: 16, borderRadius: BorderRadius.md,
    backgroundColor: DarkColors.background, overflow: 'hidden', position: 'relative',
  },
  shareCardKm: { fontSize: 32, fontWeight: '900', color: Colors.textOnPrimary, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  shareCardKmUnit: { fontSize: 14, fontWeight: '700', color: DarkColors.textTertiary },
  shareCardImpact: { fontSize: 13, color: DarkColors.textSecondary, fontWeight: '700' },
  shareCardTag: { fontSize: 12, color: DarkColors.primary, fontWeight: '700', marginTop: 2 },
  shareWatermarkBadge: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: DarkColors.lineStrong, borderRadius: BorderRadius.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  shareWatermarkText: { fontSize: 10, color: DarkColors.textTertiary, fontWeight: '700' },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: DarkColors.background, borderRadius: BorderRadius.md, paddingVertical: 14, marginTop: 12,
  },
  shareBtnText: { fontSize: 14, fontWeight: '800', color: Colors.textOnPrimary },

  ctaSection: { paddingHorizontal: 16, marginTop: 16, gap: 10 },
  ctaBtn: {
    backgroundColor: DarkColors.background, borderRadius: BorderRadius.md, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: DarkColors.background, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 6,
  },
  ctaBtnText: { fontSize: 14, fontWeight: '800', color: Colors.textOnPrimary, letterSpacing: 0.5 },
  ctaHint: { textAlign: 'center', fontSize: 11, color: Colors.textTertiary, fontWeight: '600' },

});
