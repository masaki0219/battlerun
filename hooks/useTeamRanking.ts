import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cachedPublicProfile } from '../lib/publicProfileCache';
import { useTranslation } from '../lib/i18n';

export interface TeamRankingMember {
  userId: string;
  displayName: string;
  avatarEmoji?: string;
  totalDistanceKm: number;
  /** 陣営内の順位（1始まり） */
  rank: number | null;
  isMe: boolean;
}

export interface TeamRanking {
  /** 陣営内の上位メンバー（最大 topCount 件） */
  top: TeamRankingMember[];
  /** 自分の陣営内順位（1始まり）。陣営に自分がいなければ 0 */
  myRank: number;
  /** 陣営の人数 */
  teamSize: number;
  /** 自分の距離 */
  myKm: number;
  /** Top圏外の自分の行にも使う公開アイコン。 */
  myAvatarEmoji?: string;
  /** ひとつ上の順位との距離差。自分が1位・未参加なら null */
  gapToNextKm: number | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

type TeamRankingData = Omit<TeamRanking, 'loading' | 'error' | 'retry'>;

const EMPTY: TeamRankingData = {
  top: [], myRank: 0, teamSize: 0, myKm: 0, myAvatarEmoji: undefined, gapToNextKm: null,
};

/**
 * 参加中バトルの「自分の陣営の中での」順位を出す read-only フック。
 *
 * participants サブコレクション（categoryId / totalDistanceKm を持つ）を自陣営だけ購読し、
 * 距離降順に並べる。名前の解決は上位 topCount 件だけに限定する
 * （参加者全員の users/{uid} を引くと人数分のリードになるため）。
 * categoryId の単一フィールドindexだけを使うため新規複合indexは不要。
 * 自分の正確な順位・直上との差を維持する都合で自陣営内は全件読むが、他陣営は購読しない。
 */
export function useTeamRanking(
  battleId: string | undefined,
  categoryId: string | null | undefined,
  myUserId: string | undefined,
  { topCount = 3 }: { topCount?: number } = {},
): TeamRanking {
  const { t } = useTranslation();
  const [state, setState] = useState<TeamRankingData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const retry = useCallback(() => setRetryKey((key) => key + 1), []);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const requestKey = battleId && categoryId && myUserId
    ? `${battleId}:${categoryId}:${myUserId}`
    : null;

  useEffect(() => {
    if (!battleId || !categoryId || !myUserId) {
      setState(EMPTY);
      setLoading(false);
      setError(false);
      setResolvedKey(null);
      return;
    }
    // 閲覧中チャレンジを切り替えた直後に、前のチーム順位を一瞬表示しない。
    setState(EMPTY);
    setLoading(true);
    setError(false);
    setResolvedKey(null);
    const effectKey = `${battleId}:${categoryId}:${myUserId}`;
    let generation = 0;
    const participantsQuery = query(
      collection(db, 'battles', battleId, 'participants'),
      where('categoryId', '==', categoryId),
    );
    const unsubscribe = onSnapshot(participantsQuery, async (snap) => {
      const currentGeneration = ++generation;
      try {
        const team = snap.docs
          .map((d) => ({
            userId: d.id,
            categoryId: (d.data()['categoryId'] as string | null) ?? null,
            totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
          }))
          .sort((a, b) => b.totalDistanceKm - a.totalDistanceKm || a.userId.localeCompare(b.userId));

        const myIndex = team.findIndex((p) => p.userId === myUserId);
        const myKm = myIndex >= 0 ? team[myIndex].totalDistanceKm : 0;
        const allZero = team.every((member) => member.totalDistanceKm <= 0);
        const gapToNextKm = myIndex > 0
          ? Math.max(0, team[myIndex - 1].totalDistanceKm - myKm)
          : null;

        const top = await Promise.all(
          team.slice(0, topCount).map(async (p) => {
            const profile = await cachedPublicProfile(p.userId).catch(() => null);
            return {
              userId: p.userId,
              displayName: profile?.name ?? t('common.member'),
              avatarEmoji: profile?.avatarEmoji,
              totalDistanceKm: p.totalDistanceKm,
              rank: allZero ? null : 1 + team.filter((member) => member.totalDistanceKm > p.totalDistanceKm).length,
              isMe: p.userId === myUserId,
            };
          }),
        );
        const myProfile = myIndex >= 0
          ? await cachedPublicProfile(myUserId).catch(() => null)
          : null;

        if (currentGeneration === generation) {
          setState({
            top,
            myRank: myIndex >= 0 && !allZero
              ? 1 + team.filter((member) => member.totalDistanceKm > myKm).length
              : 0,
            teamSize: team.length,
            myKm,
            myAvatarEmoji: myProfile?.avatarEmoji,
            gapToNextKm,
          });
          setResolvedKey(effectKey);
          setError(false);
        }
      } catch {
        if (currentGeneration === generation) {
          setState(EMPTY);
          setResolvedKey(effectKey);
          setError(true);
        }
      } finally {
        if (currentGeneration === generation) setLoading(false);
      }
    }, () => {
      setState(EMPTY);
      setResolvedKey(effectKey);
      setLoading(false);
      setError(true);
    });

    return () => { generation += 1; unsubscribe(); };
  }, [battleId, categoryId, myUserId, topCount, retryKey, t]);

  if (!requestKey) return { ...EMPTY, loading: false, error: false, retry };
  if (resolvedKey !== requestKey) return { ...EMPTY, loading: true, error: false, retry };
  return { ...state, loading, error, retry };
}
