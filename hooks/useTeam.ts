import { useEffect, useState } from 'react';
import {
  collection, doc, addDoc, setDoc, getDocs,
  query, where, getDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTeamStore } from '../stores/teamStore';
import { useAuthStore } from '../stores/authStore';
import type { Team } from '../types';

export function useTeam() {
  const { user } = useAuthStore();
  const { currentTeam, setTeam, fetchMembers } = useTeamStore();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user || currentTeam) return;
    loadTeam();
  }, [user]);

  async function loadTeam() {
    if (!user) return;
    setIsLoading(true);
    try {
      // ユーザーがメンバーになっているチームを検索
      // teams/{teamId}/members/{userId} というサブコレクション構造のため、
      // collectionGroup で userId を検索する
      const memberQuery = query(
        collection(db, 'teams'),
        // teams コレクション全体をスキャンしてメンバー確認（件数が少ない MVP では許容）
      );

      // 全チームを取得してメンバーサブコレクションを確認する代わりに、
      // users/{userId}/teams サブコレクション or teams に membersArray を持たせる設計が理想だが、
      // FIREBASE_MIGRATION.md の構造（teams/{teamId}/members/{userId}）に従い、
      // 既存の全チームを collectionGroup で確認する。
      // MVP では件数が少ないため teams を全取得してフィルタ。
      const teamsSnap = await getDocs(collection(db, 'teams'));
      for (const teamDoc of teamsSnap.docs) {
        const memberSnap = await getDoc(doc(db, 'teams', teamDoc.id, 'members', user.id));
        if (memberSnap.exists()) {
          const data = teamDoc.data();
          const team: Team = {
            id: teamDoc.id,
            name: data['name'] as string,
            inviteCode: data['inviteCode'] as string,
            isPublic: data['isPublic'] as boolean,
            createdBy: data['createdBy'] as string,
            createdAt: (data['createdAt'] as any)?.toDate?.()?.toISOString() ?? '',
            totalDistanceKm: (data['totalDistanceKm'] as number) ?? 0,
          };
          setTeam(team);
          fetchMembers(team.id);
          break;
        }
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function createTeam(name: string): Promise<Team> {
    if (!user) throw new Error('ログインが必要です');
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // teams コレクションにドキュメントを追加
    const teamRef = await addDoc(collection(db, 'teams'), {
      name,
      inviteCode,
      isPublic: false,
      createdBy: user.id,
      totalDistanceKm: 0,
      participatingEventIds: [],
      createdAt: new Date(),
    });

    // 作成者をメンバーサブコレクションに追加
    await setDoc(doc(db, 'teams', teamRef.id, 'members', user.id), {
      joinedAt: new Date(),
      totalDistanceKm: 0,
    });

    const team: Team = {
      id: teamRef.id,
      name,
      inviteCode,
      isPublic: false,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      totalDistanceKm: 0,
    };
    setTeam(team);
    fetchMembers(teamRef.id);
    return team;
  }

  async function joinTeam(code: string): Promise<Team> {
    if (!user) throw new Error('ログインが必要です');

    const q = query(collection(db, 'teams'), where('inviteCode', '==', code.toUpperCase()));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('招待コードが見つかりません');

    const teamDoc = snap.docs[0];
    const teamId = teamDoc.id;

    // すでにメンバーか確認
    const existingMember = await getDoc(doc(db, 'teams', teamId, 'members', user.id));
    if (existingMember.exists()) throw new Error('すでにこのチームに参加しています');

    await setDoc(doc(db, 'teams', teamId, 'members', user.id), {
      joinedAt: new Date(),
      totalDistanceKm: 0,
    });

    const data = teamDoc.data();
    const team: Team = {
      id: teamId,
      name: data['name'] as string,
      inviteCode: data['inviteCode'] as string,
      isPublic: data['isPublic'] as boolean,
      createdBy: data['createdBy'] as string,
      createdAt: (data['createdAt'] as any)?.toDate?.()?.toISOString() ?? '',
      totalDistanceKm: (data['totalDistanceKm'] as number) ?? 0,
    };
    setTeam(team);
    fetchMembers(teamId);
    return team;
  }

  return { currentTeam, isLoading, createTeam, joinTeam };
}
