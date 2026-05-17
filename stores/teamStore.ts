import { create } from 'zustand';
import { doc, collection, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { TeamStore, Team, TeamMember } from '../types';

export const useTeamStore = create<TeamStore>((set) => ({
  currentTeam: null,
  members: [],

  setTeam: (team) => set({ currentTeam: team }),

  fetchMembers: async (teamId) => {
    const membersSnap = await getDocs(collection(db, 'teams', teamId, 'members'));

    const members: TeamMember[] = await Promise.all(
      membersSnap.docs.map(async (memberDoc) => {
        const userSnap = await getDoc(doc(db, 'users', memberDoc.id));
        const userData = userSnap.data();
        return {
          teamId,
          userId: memberDoc.id,
          joinedAt: (memberDoc.data()['joinedAt'] as any)?.toDate?.()?.toISOString() ?? '',
          user: userSnap.exists() && userData
            ? {
                id: userSnap.id,
                authId: userSnap.id,
                name: userData['name'] as string,
                avatarUrl: userData['avatarUrl'] as string | undefined,
                plan: userData['plan'] as 'free' | 'pro',
                createdAt: (userData['createdAt'] as any)?.toDate?.()?.toISOString() ?? '',
              }
            : undefined,
          totalDistanceKm: memberDoc.data()['totalDistanceKm'] as number | undefined,
        };
      })
    );

    // totalDistanceKm の降順でソート
    members.sort((a, b) => (b.totalDistanceKm ?? 0) - (a.totalDistanceKm ?? 0));
    set({ members });
  },
}));

