import { create } from 'zustand';
import {
  collection, query, where, getDocs, getDoc,
  doc, setDoc, updateDoc, increment, serverTimestamp, addDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Battle, BattleStats, BattleTeam, Season } from '../types';

interface BattleMembership {
  battleId: string;
  teamId: string;
}

interface CreateBattleParams {
  title: string;
  description: string;
  teamAName: string;
  teamBName: string;
  rankingType: 'average' | 'total';
  userId: string;
}

interface BattleStore {
  publicBattles: Battle[];
  privateBattles: Battle[];
  myMemberships: BattleMembership[];
  seasons: Record<string, Season>;  // seasonId → Season のキャッシュ
  isLoading: boolean;

  fetchPublicBattles: () => Promise<void>;
  fetchMyMemberships: (userId: string) => Promise<void>;
  fetchMyPrivateBattles: (userId: string) => Promise<void>;
  fetchSeason: (seasonId: string) => Promise<void>;
  joinPublicBattle: (battleId: string, teamId: string, userId: string) => Promise<void>;
  joinPrivateBattle: (battleId: string, teamId: string, userId: string) => Promise<void>;
  createPrivateBattle: (params: CreateBattleParams) => Promise<string>;
  findBattleByInviteCode: (inviteCode: string) => Promise<Battle>;
  getActiveBattleIds: () => string[];
}

function mapDocToBattle(id: string, data: Record<string, any>): Battle {
  return {
    id,
    type: data['type'] as 'public' | 'private',
    seasonId: data['seasonId'] as string | null,
    title: data['title'] as string,
    description: data['description'] as string,
    teams: data['teams'] as BattleTeam[],
    rankingType: data['rankingType'] as 'average' | 'total',
    startAt: (data['startAt'] as any)?.toDate?.()?.toISOString() ?? '',
    endAt: (data['endAt'] as any)?.toDate?.()?.toISOString() ?? '',
    status: data['status'] as 'upcoming' | 'active' | 'finished',
    createdBy: data['createdBy'] as string,
    inviteCode: data['inviteCode'] as string | null,
  };
}

async function joinBattle(
  battleId: string,
  teamId: string,
  userId: string,
  set: (fn: (state: BattleStore) => Partial<BattleStore>) => void
): Promise<void> {
  await setDoc(doc(db, 'battles', battleId, 'members', userId), {
    teamId,
    joinedAt: serverTimestamp(),
  });

  const statsId = `${battleId}_${teamId}`;
  await updateDoc(doc(db, 'battle_stats', statsId), {
    memberCount: increment(1),
  });

  set((state) => ({
    myMemberships: [...state.myMemberships, { battleId, teamId }],
  }));
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  publicBattles: [],
  privateBattles: [],
  myMemberships: [],
  seasons: {},
  isLoading: false,

  fetchPublicBattles: async () => {
    set({ isLoading: true });
    try {
      const q = query(
        collection(db, 'battles'),
        where('type', '==', 'public'),
        where('status', '==', 'active'),
      );
      const snap = await getDocs(q);
      const battles: Battle[] = snap.docs.map((d) => mapDocToBattle(d.id, d.data()));
      set({ publicBattles: battles });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchSeason: async (seasonId: string) => {
    // すでにキャッシュ済みならスキップ
    if (get().seasons[seasonId]) return;

    const snap = await getDoc(doc(db, 'seasons', seasonId));
    if (!snap.exists()) return;

    const data = snap.data();
    const season: Season = {
      id: snap.id,
      title: data['title'] as string,
      startAt: (data['startAt'] as any)?.toDate?.()?.toISOString() ?? '',
      endAt: (data['endAt'] as any)?.toDate?.()?.toISOString() ?? '',
      status: data['status'] as 'active' | 'archived',
    };
    set((state) => ({ seasons: { ...state.seasons, [seasonId]: season } }));
  },

  fetchMyMemberships: async (userId: string) => {
    const battlesSnap = await getDocs(
      query(collection(db, 'battles'), where('status', '==', 'active'))
    );

    const memberships: BattleMembership[] = [];
    await Promise.all(
      battlesSnap.docs.map(async (battleDoc) => {
        const memberSnap = await getDoc(
          doc(db, 'battles', battleDoc.id, 'members', userId)
        );
        if (memberSnap.exists()) {
          memberships.push({
            battleId: battleDoc.id,
            teamId: memberSnap.data()['teamId'] as string,
          });
        }
      })
    );
    set({ myMemberships: memberships });
  },

  fetchMyPrivateBattles: async (userId: string) => {
    const snap = await getDocs(
      query(
        collection(db, 'battles'),
        where('type', '==', 'private'),
        where('status', '==', 'active'),
      )
    );

    const myBattles: Battle[] = [];
    await Promise.all(
      snap.docs.map(async (battleDoc) => {
        const memberSnap = await getDoc(
          doc(db, 'battles', battleDoc.id, 'members', userId)
        );
        if (memberSnap.exists()) {
          myBattles.push(mapDocToBattle(battleDoc.id, battleDoc.data()));
        }
      })
    );
    set({ privateBattles: myBattles });
  },

  joinPublicBattle: async (battleId, teamId, userId) => {
    await joinBattle(battleId, teamId, userId, set);
  },

  joinPrivateBattle: async (battleId, teamId, userId) => {
    await joinBattle(battleId, teamId, userId, set);
  },

  createPrivateBattle: async ({ title, description, teamAName, teamBName, rankingType, userId }) => {
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const teamAId = teamAName.toLowerCase().replace(/\s+/g, '_').slice(0, 20) || 'teamA';
    const teamBId = teamBName.toLowerCase().replace(/\s+/g, '_').slice(0, 20) || 'teamB';
    const teams: BattleTeam[] = [
      { teamId: teamAId, name: teamAName },
      { teamId: teamBId, name: teamBName },
    ];

    const battleRef = await addDoc(collection(db, 'battles'), {
      type: 'private',
      seasonId: null,
      title,
      description,
      teams,
      rankingType,
      startAt: serverTimestamp(),
      endAt: null,
      status: 'active',
      createdBy: userId,
      inviteCode,
    });

    // battle_stats の初期ドキュメントを作成
    await Promise.all(
      teams.map((team) =>
        setDoc(doc(db, 'battle_stats', `${battleRef.id}_${team.teamId}`), {
          battleId: battleRef.id,
          teamId: team.teamId,
          teamName: team.name,
          totalDistanceKm: 0,
          memberCount: 0,
          avgDistanceKm: 0,
        })
      )
    );

    return battleRef.id;
  },

  findBattleByInviteCode: async (inviteCode: string) => {
    const q = query(
      collection(db, 'battles'),
      where('inviteCode', '==', inviteCode.toUpperCase().trim())
    );
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('招待コードが見つかりません');
    const d = snap.docs[0];
    return mapDocToBattle(d.id, d.data());
  },

  getActiveBattleIds: () => get().myMemberships.map((m) => m.battleId),
}));

export async function fetchBattleStats(battleId: string): Promise<BattleStats[]> {
  const q = query(
    collection(db, 'battle_stats'),
    where('battleId', '==', battleId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    battleId: d.data()['battleId'] as string,
    teamId: d.data()['teamId'] as string,
    teamName: d.data()['teamName'] as string,
    totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
    memberCount: (d.data()['memberCount'] as number) ?? 0,
    avgDistanceKm: (d.data()['avgDistanceKm'] as number) ?? 0,
  }));
}
