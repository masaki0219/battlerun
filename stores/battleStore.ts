import { create } from 'zustand';
import {
  collection, query, where, getDocs, getDoc,
  doc, setDoc, updateDoc, increment, serverTimestamp, addDoc, Timestamp, arrayUnion, runTransaction,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from './authStore';
import { validateBattleTitle } from '../lib/validation/battleTitle';
import type { Battle, CategoryStats, Season, Category, BattleParticipation } from '../types';

interface CreateBattleParams {
  title: string;
  description: string;
  categories: Category[];
  rankingType: 'average' | 'total';
  startAt: Date;
  endAt: Date;
  userId: string;
  isPublic?: boolean;
  seasonId?: string | null;
}

interface BattleStore {
  publicBattles: Battle[];
  privateBattles: Battle[];
  myMemberships: BattleParticipation[];
  seasons: Record<string, Season>;
  isLoading: boolean;

  fetchPublicBattles: () => Promise<void>;
  fetchMyMemberships: (userId: string) => Promise<void>;
  fetchMyPrivateBattles: (userId: string) => Promise<void>;
  fetchSeason: (seasonId: string) => Promise<void>;
  joinBattle: (battleId: string, categoryId: string | null, userId: string) => Promise<void>;
  createBattle: (params: CreateBattleParams) => Promise<string>;
  findBattleByInviteCode: (inviteCode: string) => Promise<Battle>;
  getActiveBattleIds: () => string[];
}

function generateCategoryId(label: string): string {
  const base = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20);
  return base || `cat_${Date.now()}`;
}

// 個人戦バトル（mode: 'individual'）は1.0で廃止。
// 既存Firestoreに残っていてもクラッシュさせず一覧から除外するためnullを返す。
function mapDocToBattle(id: string, data: Record<string, any>): Battle | null {
  if (data['mode'] === 'individual') return null;
  return {
    id,
    type: data['type'] as 'public' | 'private',
    seasonId: (data['seasonId'] as string | null | undefined) ?? null,
    title: data['title'] as string,
    description: (data['description'] as string) ?? '',
    categories: (data['categories'] as Category[]) ?? [],
    rankingType: (data['rankingType'] as 'average' | 'total') ?? 'average',
    startAt: (data['startAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
    endAt: (data['endAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
    status: (data['status'] as 'upcoming' | 'active' | 'finished') ?? 'active',
    createdBy: (data['createdBy'] as string | null) ?? null,
    inviteCode: (data['inviteCode'] as string | null) ?? null,
  };
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
      const battles: Battle[] = snap.docs
        .map((d) => mapDocToBattle(d.id, d.data()))
        .filter((b): b is Battle => b !== null);
      set({ publicBattles: battles });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchSeason: async (seasonId: string) => {
    if (get().seasons[seasonId]) return;
    const snap = await getDoc(doc(db, 'seasons', seasonId));
    if (!snap.exists()) return;
    const data = snap.data();
    const season: Season = {
      id: snap.id,
      title: data['title'] as string,
      startAt: (data['startAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
      endAt: (data['endAt'] as Timestamp)?.toDate?.()?.toISOString() ?? '',
      status: data['status'] as 'active' | 'archived',
    };
    set((state) => ({ seasons: { ...state.seasons, [seasonId]: season } }));
  },

  fetchMyMemberships: async (userId: string) => {
    // users/{uid}.battleIds で O(k) 取得（k = 参加バトル数）
    const userSnap = await getDoc(doc(db, 'users', userId));
    const battleIds = (userSnap.data()?.['battleIds'] as string[] | undefined) ?? [];

    if (battleIds.length === 0) {
      set({ myMemberships: [] });
      return;
    }

    const memberships: BattleParticipation[] = (
      await Promise.all(
        battleIds.map(async (battleId) => {
          const participantSnap = await getDoc(
            doc(db, 'battles', battleId, 'participants', userId)
          );
          if (!participantSnap.exists()) return null;
          return {
            battleId,
            categoryId: (participantSnap.data()['categoryId'] as string | null) ?? null,
          } satisfies BattleParticipation;
        })
      )
    ).filter((m): m is BattleParticipation => m !== null);

    set({ myMemberships: memberships });
  },

  fetchMyPrivateBattles: async (userId: string) => {
    // users/{uid}.battleIds で O(k) 取得
    const userSnap = await getDoc(doc(db, 'users', userId));
    const battleIds = (userSnap.data()?.['battleIds'] as string[] | undefined) ?? [];

    if (battleIds.length === 0) {
      set({ privateBattles: [] });
      return;
    }

    const myBattles: Battle[] = (
      await Promise.all(
        battleIds.map(async (battleId) => {
          const battleSnap = await getDoc(doc(db, 'battles', battleId));
          if (!battleSnap.exists()) return null;
          const data = battleSnap.data();
          if (data['type'] !== 'private' || data['status'] !== 'active') return null;
          const participantSnap = await getDoc(
            doc(db, 'battles', battleId, 'participants', userId)
          );
          if (!participantSnap.exists()) return null;
          return mapDocToBattle(battleId, data);
        })
      )
    ).filter((b): b is Battle => b !== null);

    set({ privateBattles: myBattles });
  },

  joinBattle: async (battleId, categoryId, userId) => {
    // 参加人数上限チェック (Freeバトル: 上限10名) — トランザクション外で事前確認
    const battleSnap = await getDoc(doc(db, 'battles', battleId));
    if (battleSnap.exists()) {
      const bData = battleSnap.data();
      if (bData['type'] !== 'public' && bData['createdBy']) {
        const creatorSnap = await getDoc(doc(db, 'users', bData['createdBy'])).catch(() => null);
        if ((creatorSnap?.data()?.['plan'] ?? 'free') === 'free') {
          const partCount = (await getDocs(collection(db, 'battles', battleId, 'participants'))).size;
          if (partCount >= 10) {
            throw new Error('PARTICIPANT_LIMIT: このバトルは定員（10名）に達しています。バトル作成者がProにアップグレードすると上限が拡大されます。');
          }
        }
      }
    }

    const participantRef = doc(db, 'battles', battleId, 'participants', userId);
    const userRef = doc(db, 'users', userId);

    await runTransaction(db, async (transaction) => {
      const participantSnap = await transaction.get(participantRef);
      const isNew = !participantSnap.exists();
      const oldCategoryId = isNew ? null : (participantSnap.data()['categoryId'] as string | null);
      const categoryChanged = !isNew && oldCategoryId !== categoryId;

      // 参加者ドキュメントを作成、またはカテゴリのみ更新（既存距離はリセットしない）
      if (isNew) {
        transaction.set(participantRef, {
          categoryId: categoryId ?? null,
          totalDistanceKm: 0,
          joinedAt: serverTimestamp(),
        });
      } else if (categoryChanged) {
        transaction.update(participantRef, { categoryId: categoryId ?? null });
      }

      // category_stats の participantCount を更新
      if (isNew && categoryId) {
        transaction.update(
          doc(db, 'battles', battleId, 'category_stats', categoryId),
          { participantCount: increment(1) },
        );
      } else if (categoryChanged) {
        // カテゴリ変更: 旧カテゴリをデクリメント、新カテゴリをインクリメント
        if (oldCategoryId) {
          transaction.update(
            doc(db, 'battles', battleId, 'category_stats', oldCategoryId),
            { participantCount: increment(-1) },
          );
        }
        if (categoryId) {
          transaction.update(
            doc(db, 'battles', battleId, 'category_stats', categoryId),
            { participantCount: increment(1) },
          );
        }
      }

      // arrayUnion は Firestore が重複を自動除外するため再参加時も安全
      transaction.update(userRef, { battleIds: arrayUnion(battleId) });
    });

    useAuthStore.setState((s) => ({
      user: s.user?.id === userId
        ? { ...s.user, battleIds: [...(s.user.battleIds ?? []).filter((id) => id !== battleId), battleId] }
        : s.user,
    }));

    set((state) => ({
      myMemberships: [
        ...state.myMemberships.filter((m) => m.battleId !== battleId),
        { battleId, categoryId },
      ],
    }));
  },

  createBattle: async ({ title, description, categories, rankingType, startAt, endAt, userId, isPublic, seasonId }) => {
    const titleValidation = validateBattleTitle(title);
    if (!titleValidation.ok) {
      throw new Error(titleValidation.reason ?? 'このチーム名は利用できません');
    }

    const plan = useAuthStore.getState().user?.plan ?? 'free';

    if (!isPublic && plan !== 'pro') {
      throw new Error('PRO_REQUIRED: プライベートチャレンジの作成にはProプランが必要です。');
    }

    const inviteCode = isPublic ? null : Math.random().toString(36).substring(2, 8).toUpperCase();

    // 区分IDを確定（重複ラベルには連番を付与）
    const resolvedCategories: Category[] = categories.map((cat, i) => ({
      id: cat.id || generateCategoryId(`${cat.label}_${i}`),
      label: cat.label,
    }));

    const battleRef = await addDoc(collection(db, 'battles'), {
      type: isPublic ? 'public' : 'private',
      seasonId: seasonId ?? null,
      title,
      description,
      categories: resolvedCategories,
      rankingType,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      status: 'active',
      createdBy: userId,
      inviteCode,
      createdAt: Timestamp.now(),
    });

    // category_stats の初期ドキュメントを作成
    await Promise.all(
      resolvedCategories.map((cat) =>
        setDoc(doc(db, 'battles', battleRef.id, 'category_stats', cat.id), {
          totalDistanceKm: 0,
          avgDistanceKm: 0,
          participantCount: 0,
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
    const battle = mapDocToBattle(d.id, d.data());
    if (!battle) throw new Error('招待コードが見つかりません');
    return battle;
  },

  getActiveBattleIds: () => {
    const now = Date.now();
    const allBattles = [...get().publicBattles, ...get().privateBattles];
    const activeBattleIds = new Set(
      allBattles
        .filter((b) =>
          b.status === 'active' &&
          new Date(b.startAt).getTime() <= now &&
          now <= new Date(b.endAt).getTime()
        )
        .map((b) => b.id)
    );
    return get().myMemberships
      .map((m) => m.battleId)
      .filter((id) => activeBattleIds.has(id));
  },
}));

export async function fetchCategoryStats(battleId: string, categories: Category[]): Promise<CategoryStats[]> {
  const snap = await getDocs(collection(db, 'battles', battleId, 'category_stats'));
  return snap.docs.map((d) => {
    const catId = d.id;
    const label = categories.find((c) => c.id === catId)?.label ?? catId;
    return {
      categoryId: catId,
      label,
      totalDistanceKm: (d.data()['totalDistanceKm'] as number) ?? 0,
      avgDistanceKm: (d.data()['avgDistanceKm'] as number) ?? 0,
      participantCount: (d.data()['participantCount'] as number) ?? 0,
    };
  });
}
