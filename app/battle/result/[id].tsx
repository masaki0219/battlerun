import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { collection, getDocs, doc, getDoc, query, where, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../../lib/firebase';
import { useAuthStore } from '../../../stores/authStore';
import { useBattleStore } from '../../../stores/battleStore';
import type { Battle, CategoryStats, UserTitle } from '../../../types';

const BR = {
  light:       '#F4F2EC',
  lightSurf2:  '#EDEAE2',
  lightLine:   'rgba(10,14,26,0.08)',
  dark:        '#0A0E1A',
  darkCard:    '#161D33',
  darkLine2:   'rgba(255,255,255,0.14)',
  ink:         '#0A0E1A',
  ink2:        '#5A6477',
  ink3:        '#9AA4B5',
  primary:     '#00D9A3',
  primaryDeep: '#06B189',
  accent:      '#FF5C2B',
  gold:        '#FFC23C',
  silver:      '#C2CBD6',
  bronze:      '#CB7B3A',
  paper:       '#FFFFFF',
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

interface ParticipantInfo {
  userId: string;
  displayName: string;
  totalDistanceKm: number;
  activityCount: number;
}

function mapFirestoreToBattle(id: string, data: Record<string, unknown>): Battle {
  return {
    id,
    type: (data['type'] as 'public' | 'private') ?? 'public',
    seasonId: (data['seasonId'] as string | null) ?? null,
    title: (data['title'] as string) ?? '',
    description: (data['description'] as string) ?? '',
    mode: (data['mode'] as 'team' | 'individual') ?? 'team',
    categories: (data['categories'] as Battle['categories']) ?? [],
    rankingType: (data['rankingType'] as 'average' | 'total') ?? 'total',
    startAt: (data['startAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
    endAt: (data['endAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
    status: (data['status'] as Battle['status']) ?? 'finished',
    createdBy: (data['createdBy'] as string | null) ?? null,
    inviteCode: (data['inviteCode'] as string | null) ?? null,
  };
}

export default function BattleResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { publicBattles, privateBattles, myMemberships } = useBattleStore();

  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [myStats, setMyStats] = useState<{ totalKm: number; actCount: number }>({ totalKm: 0, actCount: 0 });
  const [loading, setLoading] = useState(true);
  const [localBattle, setLocalBattle] = useState<Battle | null>(
    () => [...publicBattles, ...privateBattles].find((b) => b.id === id) ?? null
  );
  const titleAwardedRef = useRef(false);

  const membership = myMemberships.find((m) => m.battleId === id);
  const myCatId = membership?.categoryId ?? null;

  // ストアにない場合Firestoreから直接取得
  useEffect(() => {
    const fromStore = [...publicBattles, ...privateBattles].find((b) => b.id === id);
    if (fromStore) {
      setLocalBattle(fromStore);
      return;
    }
    if (!id) return;
    getDoc(doc(db, 'battles', id)).then((snap) => {
      if (snap.exists()) {
        setLocalBattle(mapFirestoreToBattle(snap.id, snap.data() as Record<string, unknown>));
      }
    }).catch(() => {});
  }, [id, publicBattles, privateBattles]);

  useEffect(() => {
    if (!id || !localBattle) return;
    const load = async () => {
      setLoading(true);
      try {
        // category_stats
        const statsSnap = await getDocs(collection(db, 'battles', id, 'category_stats'));
        const s: CategoryStats[] = statsSnap.docs.map((d) => ({
          categoryId: d.id,
          label: localBattle.categories.find((c) => c.id === d.id)?.label ?? d.id,
          totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
          avgDistanceKm: (d.data()['avgDistanceKm'] as number) ?? 0,
          participantCount: (d.data()['participantCount'] as number) ?? 0,
        }));
        setStats(s);

        // participants (top 20) + 個人記録回数をactivitiesから集計
        const partSnap = await getDocs(collection(db, 'battles', id, 'participants'));

        // バトル期間内のアクティビティを一括取得してカウント
        const actSnap = await getDocs(
          query(collection(db, 'activities'), where('battleId', '==', id))
        );
        const actCountMap: Record<string, number> = {};
        actSnap.docs.forEach((d) => {
          const uid = d.data()['userId'] as string;
          actCountMap[uid] = (actCountMap[uid] ?? 0) + 1;
        });

        const parts: ParticipantInfo[] = [];
        await Promise.all(
          partSnap.docs.slice(0, 20).map(async (d) => {
            const uid = d.id;
            const km = (d.data()['totalDistanceKm'] as number) ?? 0;
            const userSnap = await getDoc(doc(db, 'users', uid));
            const name = (userSnap.data()?.['name'] as string) ?? 'メンバー';
            parts.push({ userId: uid, displayName: name, totalDistanceKm: km, activityCount: actCountMap[uid] ?? 0 });
          })
        );
        parts.sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);
        setParticipants(parts);

        // my stats
        if (user) {
          const meSnap = await getDoc(doc(db, 'battles', id, 'participants', user.id));
          if (meSnap.exists()) {
            const km = (meSnap.data()['totalDistanceKm'] as number) ?? 0;
            setMyStats({ totalKm: km, actCount: actCountMap[user.id] ?? 0 });
          }
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, localBattle, user]);

  // 称号をFirestoreに自動書き込み（バトル終了済み＆MVP/準MVP）
  useEffect(() => {
    if (loading || titleAwardedRef.current) return;
    if (!user || !localBattle) return;
    if (new Date(localBattle.endAt) > new Date()) return;

    const rankType = localBattle.rankingType ?? 'total';
    const sorted = [...stats].sort((a, b) =>
      rankType === 'total' ? b.totalDistanceKm - a.totalDistanceKm : b.avgDistanceKm - a.avgDistanceKm
    );
    const myTeamIdx = sorted.findIndex((s) => s.categoryId === myCatId);
    const myRankLocal = myTeamIdx >= 0 ? myTeamIdx + 1 : null;
    const myTeamLocal = myTeamIdx >= 0 ? sorted[myTeamIdx] : null;

    if (!myRankLocal || myRankLocal > 2 || !myTeamLocal) return;

    const alreadyAwarded = user.titles?.some((t) => t.battleId === localBattle.id);
    if (alreadyAwarded) return;

    titleAwardedRef.current = true;

    const newTitle: UserTitle = {
      seasonId: localBattle.seasonId ?? '',
      battleId: localBattle.id,
      battleTitle: localBattle.title,
      teamName: myTeamLocal.label,
      rank: myRankLocal,
      awardedAt: new Date().toISOString(),
    };

    // 称号獲得通知はCloud Functions（onUserTitlesUpdated）が作成する
    updateDoc(doc(db, 'users', user.id), { titles: arrayUnion(newTitle) }).catch(() => {});
  }, [loading, user, localBattle, stats, myCatId]);

  if (!localBattle) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}>
          <ActivityIndicator color={BR.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const rankType = localBattle.rankingType ?? 'total';
  const sorted = [...stats].sort((a, b) =>
    rankType === 'total' ? b.totalDistanceKm - a.totalDistanceKm : b.avgDistanceKm - a.avgDistanceKm
  );
  const myTeamIdx = sorted.findIndex((s) => s.categoryId === myCatId);
  const myTeam = myTeamIdx >= 0 ? sorted[myTeamIdx] : null;
  const myRank = myTeamIdx >= 0 ? myTeamIdx + 1 : null;

  const startDate = new Date(localBattle.startAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  const endDate = new Date(localBattle.endAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });

  function rankMedal(rank: number) {
    if (rank === 1) return { emoji: '🥇', color: BR.gold, label: '優勝！', bg: `${BR.gold}18` };
    if (rank === 2) return { emoji: '🥈', color: BR.silver, label: '準優勝', bg: `${BR.silver}28` };
    if (rank === 3) return { emoji: '🥉', color: BR.bronze, label: '3位入賞', bg: `${BR.bronze}18` };
    return { emoji: '🏃', color: BR.ink2, label: `${rank}位`, bg: `${BR.lightSurf2}` };
  }

  const medal = myRank ? rankMedal(myRank) : null;

  async function handleShare() {
    const rankText = myRank ? `${myRank}位` : '参加';
    const kmText = myStats.totalKm.toFixed(1);
    try {
      await Share.share({
        message: `「${localBattle?.title ?? 'バトル'}」で${rankText}！\n自分の貢献: ${kmText}km\n#BattleRun で走ろう`,
      });
    } catch {}
  }

  function userTitle(): string | null {
    if (!myRank || !myTeam) return null;
    if (myRank === 1) return 'MVP';
    if (myRank === 2) return '準MVP';
    return null;
  }
  const titleName = userTitle();

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Nav */}
      <View style={s.nav}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={BR.ink2} />
        </TouchableOpacity>
        <Tac color={BR.ink3} size={9}>バトル結果</Tac>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero ── */}
        <View style={s.heroCard}>
          <Tac color={BR.ink3} size={9}>BATTLE RESULT / バトル終了</Tac>
          <Text style={s.heroTitle}>{localBattle.title}</Text>
          <Text style={s.heroDates}>{startDate} 〜 {endDate}</Text>

          {loading ? (
            <ActivityIndicator color={BR.primary} style={{ marginTop: 24 }} />
          ) : medal ? (
            <View style={[s.medalBlock, { backgroundColor: medal.bg }]}>
              <Text style={s.medalEmoji}>{medal.emoji}</Text>
              <Text style={[s.medalLabel, { color: medal.color }]}>{medal.label}</Text>
              {myTeam && (
                <Text style={s.medalTeamName}>{myTeam.label}</Text>
              )}
            </View>
          ) : (
            <View style={s.medalBlock}>
              <Text style={s.medalEmoji}>🏃</Text>
              <Text style={s.medalLabel}>お疲れさまでした！</Text>
            </View>
          )}
        </View>

        {/* ── 称号発表 ── */}
        {titleName && (
          <View style={s.section}>
            <Tac color={BR.ink3} size={9}>称号獲得 / TITLE EARNED</Tac>
            <View style={s.titleCard}>
              <View style={s.titleIconWrap}>
                <Ionicons name="ribbon" size={28} color={BR.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.titleName}>{titleName}</Text>
                <Text style={s.titleDesc}>
                  {titleName === 'MVP' ? 'バトル内個人貢献距離1位' : 'バトル内個人貢献距離2位'}
                </Text>
              </View>
              <Text style={s.titleNew}>NEW</Text>
            </View>
          </View>
        )}

        {/* ── 個人成績 ── */}
        <View style={s.section}>
          <Tac color={BR.ink3} size={9}>個人成績 / MY STATS</Tac>
          <View style={s.statsCard}>
            <View style={s.statRow}>
              <View style={s.statItem}>
                <Tac color={BR.ink3} size={8}>貢献距離</Tac>
                <Text style={s.statVal}>{myStats.totalKm.toFixed(1)}<Text style={s.statUnit}> km</Text></Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Tac color={BR.ink3} size={8}>記録回数</Tac>
                <Text style={s.statVal}>{myStats.actCount}<Text style={s.statUnit}> 回</Text></Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Tac color={BR.ink3} size={8}>陣営内順位</Tac>
                <Text style={s.statVal}>{myRank ?? '—'}<Text style={s.statUnit}> 位</Text></Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 陣営ランキング ── */}
        {sorted.length > 0 && (
          <View style={s.section}>
            <Tac color={BR.ink3} size={9}>最終ランキング / FINAL RANKING</Tac>
            <View style={s.rankCard}>
              {sorted.map((cat, i) => {
                const isMe = cat.categoryId === myCatId;
                const rankColors = [BR.gold, BR.silver, BR.bronze];
                const rc = i < 3 ? rankColors[i] : BR.ink3;
                const val = rankType === 'total' ? cat.totalDistanceKm : cat.avgDistanceKm;
                return (
                  <View key={cat.categoryId} style={[s.rankRow, isMe && s.rankRowMe, i > 0 && s.rankRowBorder]}>
                    <View style={[s.rankNum, { backgroundColor: i < 3 ? `${rc}22` : BR.lightSurf2 }]}>
                      <Text style={[s.rankNumText, { color: rc }]}>{i + 1}</Text>
                    </View>
                    <Text style={[s.rankName, isMe && { color: BR.primary, fontWeight: '900' }]} numberOfLines={1}>
                      {cat.label}{isMe ? ' （あなた）' : ''}
                    </Text>
                    <Text style={[s.rankKm, isMe && { color: BR.primary }]}>
                      {val.toFixed(1)}<Text style={s.rankKmUnit}> km</Text>
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── 個人貢献ランキング (上位5名) ── */}
        {participants.length > 0 && (
          <View style={s.section}>
            <Tac color={BR.ink3} size={9}>個人貢献ランキング / TOP RUNNERS</Tac>
            <View style={s.rankCard}>
              {participants.slice(0, 5).map((p, i) => {
                const isMe = p.userId === user?.id;
                const rankColors = [BR.gold, BR.silver, BR.bronze];
                const rc = i < 3 ? rankColors[i] : BR.ink3;
                return (
                  <View key={p.userId} style={[s.rankRow, isMe && s.rankRowMe, i > 0 && s.rankRowBorder]}>
                    <View style={[s.rankNum, { backgroundColor: i < 3 ? `${rc}22` : BR.lightSurf2 }]}>
                      <Text style={[s.rankNumText, { color: rc }]}>{i + 1}</Text>
                    </View>
                    <Text style={[s.rankName, isMe && { color: BR.primary, fontWeight: '900' }]} numberOfLines={1}>
                      {p.displayName}{isMe ? ' （あなた）' : ''}
                    </Text>
                    <Text style={[s.rankKm, isMe && { color: BR.primary }]}>
                      {p.totalDistanceKm.toFixed(1)}<Text style={s.rankKmUnit}> km</Text>
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── 共有 ── */}
        <View style={s.section}>
          <Tac color={BR.ink3} size={9}>結果をシェア / SHARE RESULT</Tac>
          <View style={s.sharePreview}>
            <View style={s.sharePreviewContent}>
              <Text style={s.sharePreviewTitle}>{localBattle.title}</Text>
              <Text style={s.sharePreviewRank}>
                {myRank ? `${myRank}位` : '参加'} · {myStats.totalKm.toFixed(1)}km
              </Text>
              <Text style={s.sharePreviewTag}>#BattleRun</Text>
            </View>
            {user?.plan === 'free' && (
              <View style={s.watermarkBadge}>
                <Text style={s.watermarkText}>BattleRun</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={s.shareBtnText}>結果をシェアする</Text>
          </TouchableOpacity>
          {user?.plan === 'free' && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile' as any)}>
              <Text style={s.proHint}>Proなら透かしなしでシェアできます →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 次のアクション ── */}
        <View style={s.section}>
          <Tac color={BR.ink3} size={9}>NEXT ACTION</Tac>
          <View style={s.nextActions}>
            <TouchableOpacity
              style={s.nextBtn}
              onPress={() => router.replace('/(tabs)/battle' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="search-outline" size={18} color={BR.ink} />
              <Text style={s.nextBtnText}>次のバトルを探す</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.nextBtn, user?.plan === 'pro' && s.nextBtnPro]}
              onPress={() => router.push('/(tabs)/battle' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={18} color={user?.plan === 'pro' ? BR.primary : BR.ink} />
              <Text style={[s.nextBtnText, user?.plan === 'pro' && { color: BR.primary }]}>
                バトルを作る{user?.plan !== 'pro' ? ' (Pro)' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BR.light },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: BR.paper,
    borderBottomWidth: 1,
    borderBottomColor: BR.lightLine,
  },

  scroll: { paddingBottom: 48 },

  // Hero
  heroCard: {
    backgroundColor: BR.paper,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BR.lightLine,
  },
  heroTitle: { fontSize: 20, fontWeight: '900', color: BR.ink, textAlign: 'center', marginTop: 4 },
  heroDates: { fontSize: 12, color: BR.ink3, fontWeight: '600' },
  medalBlock: {
    marginTop: 20,
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    gap: 4,
    minWidth: 160,
  },
  medalEmoji: { fontSize: 64, lineHeight: 72 },
  medalLabel: { fontSize: 20, fontWeight: '900', letterSpacing: 0.5, marginTop: 4 },
  medalTeamName: { fontSize: 13, color: BR.ink3, fontWeight: '600', marginTop: 2 },

  // Section
  section: { paddingHorizontal: 16, marginTop: 16 },

  // Title card
  titleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: `${BR.gold}18`,
    borderWidth: 1.5,
    borderColor: `${BR.gold}55`,
  },
  titleIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: `${BR.gold}30`,
    alignItems: 'center', justifyContent: 'center',
  },
  titleName: { fontSize: 16, fontWeight: '900', color: BR.ink },
  titleDesc: { fontSize: 11, color: BR.ink3, marginTop: 2 },
  titleNew: { fontSize: 11, color: BR.gold, fontWeight: '800' },

  // Stats card
  statsCard: {
    backgroundColor: BR.paper,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: BR.lightLine,
  },
  statRow: { flexDirection: 'row' },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, backgroundColor: BR.lightLine, marginVertical: 4 },
  statVal: { fontSize: 32, fontWeight: '800', color: BR.ink, letterSpacing: -1, marginTop: 4 },
  statUnit: { fontSize: 13, color: BR.ink3, fontWeight: '400' },

  // Rank card
  rankCard: {
    backgroundColor: BR.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BR.lightLine,
    marginTop: 8,
    overflow: 'hidden',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rankRowBorder: { borderTopWidth: 1, borderTopColor: BR.lightLine },
  rankRowMe: { backgroundColor: '#F0FBF8' },
  rankNum: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rankNumText: { fontSize: 14, fontWeight: '800' },
  rankName: { flex: 1, fontSize: 13, color: BR.ink, fontWeight: '600' },
  rankKm: { fontSize: 16, fontWeight: '700', color: BR.ink2, letterSpacing: -0.5 },
  rankKmUnit: { fontSize: 10, color: BR.ink3, fontWeight: '400' },

  // Share
  sharePreview: {
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: BR.dark,
    overflow: 'hidden',
    position: 'relative',
  },
  sharePreviewContent: { gap: 4 },
  sharePreviewTitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '700' },
  sharePreviewRank: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  sharePreviewTag: { fontSize: 12, color: BR.primary, fontWeight: '700', marginTop: 4 },
  watermarkBadge: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  watermarkText: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '700' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BR.dark,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
  },
  shareBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  proHint: { textAlign: 'center', fontSize: 11, color: BR.primary, fontWeight: '600', marginTop: 8 },

  // Next actions
  nextActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 14,
    borderRadius: 12,
    backgroundColor: BR.paper,
    borderWidth: 1,
    borderColor: BR.lightLine,
  },
  nextBtnPro: { borderColor: `${BR.primary}60`, backgroundColor: `${BR.primary}0C` },
  nextBtnText: { fontSize: 12, fontWeight: '700', color: BR.ink },

});
