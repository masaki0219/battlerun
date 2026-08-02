import { create } from 'zustand';
import {
  collection, query, where, getDocs, getDoc,
  doc, Timestamp, writeBatch,
} from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { useAuthStore } from './authStore';
import {
  validateBattleCategory,
  validateBattleDescription,
  validateBattleTitle,
} from '../lib/validation/battleTitle';
import {
  cheerDeclaration as createDeclarationCheer,
  createDeclaration as createRunDeclaration,
  subscribeTodayDeclarations,
} from '../lib/declarations';
import type { Battle, CategoryStats, Season, Category, BattleParticipation, RunDeclaration } from '../types';

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
  declarationsByBattle: Record<string, RunDeclaration[]>;

  fetchPublicBattles: () => Promise<void>;
  fetchMyMemberships: (userId: string) => Promise<void>;
  fetchMyPrivateBattles: (userId: string) => Promise<void>;
  fetchSeason: (seasonId: string) => Promise<void>;
  joinBattle: (battleId: string, categoryId: string | null, userId: string) => Promise<void>;
  leaveBattle: (battleId: string, userId: string) => Promise<void>;
  createBattle: (params: CreateBattleParams) => Promise<string>;
  findBattleByInviteCode: (inviteCode: string) => Promise<Battle>;
  getActiveBattleIds: () => string[];
  subscribeDeclarations: (battleId: string, userId: string) => () => void;
  declareRun: (battleId: string, userId: string, plannedAt: Date, note: string) => Promise<void>;
  cheerDeclaration: (battleId: string, declarationId: string, fromUid: string) => Promise<boolean>;
}

// ラベルからカテゴリIDを生成する。日本語のみのラベルは英数字が残らないため
// フォールバックで cat_{index} を用い、重複IDは連番サフィックスで回避する。
function resolveCategoryIds(categories: { label: string }[]): Category[] {
  const seen = new Set<string>();
  return categories.map((cat, i) => {
    const base =
      cat.label
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 20) || `cat_${i}`;
    let id = base;
    let n = 1;
    while (seen.has(id)) id = `${base}_${n++}`;
    seen.add(id);
    return { id, label: cat.label.trim() };
  });
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
  declarationsByBattle: {},

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
    if (!categoryId) throw new Error('チームを選択してください。');
    const callable = httpsCallable(functions, 'joinBattle');
    await callable({ battleId, categoryId });

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

  leaveBattle: async (battleId, userId) => {
    const callable = httpsCallable(functions, 'leaveBattle');
    await callable({ battleId });
    useAuthStore.setState((state) => ({
      user: state.user?.id === userId
        ? { ...state.user, battleIds: (state.user.battleIds ?? []).filter((id) => id !== battleId) }
        : state.user,
    }));
    set((state) => ({
      myMemberships: state.myMemberships.filter((membership) => membership.battleId !== battleId),
    }));
  },

  createBattle: async ({ title, description, categories, rankingType, startAt, endAt, userId, isPublic, seasonId }) => {
    const titleValidation = validateBattleTitle(title);
    if (!titleValidation.ok) {
      throw new Error(titleValidation.reason ?? 'このチャレンジ名は利用できません');
    }
    const descriptionValidation = validateBattleDescription(description);
    if (!descriptionValidation.ok) {
      throw new Error(descriptionValidation.reason ?? 'この説明は利用できません');
    }
    for (const category of categories) {
      const categoryValidation = validateBattleCategory(category.label);
      if (!categoryValidation.ok) {
        throw new Error(categoryValidation.reason ?? 'このチーム名は利用できません');
      }
    }

    const plan = useAuthStore.getState().user?.plan ?? 'free';

    if (!isPublic && plan !== 'pro') {
      throw new Error('PRO_REQUIRED: プライベートチャレンジの作成にはProプランが必要です。');
    }

    const inviteCode = isPublic ? null : Crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

    // 区分IDを確定（ラベルから毎回生成し、重複ラベルには連番を付与）。
    // 呼び出し側が渡した cat.id は無視する。
    const resolvedCategories = resolveCategoryIds(categories);

    // 開始日が未来なら upcoming で作成し、スケジューラの upcoming→active に委ねる。
    const status = startAt.getTime() <= Date.now() ? 'active' : 'upcoming';
    const battleRef = doc(collection(db, 'battles'));
    const batch = writeBatch(db);
    batch.set(battleRef, {
      type: isPublic ? 'public' : 'private',
      seasonId: seasonId ?? null,
      title,
      description,
      categories: resolvedCategories,
      categoryIds: resolvedCategories.map((category) => category.id),
      rankingType,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      status,
      createdBy: userId,
      inviteCode,
      createdAt: Timestamp.now(),
    });

    // category_stats の初期ドキュメントを作成
    resolvedCategories.forEach((cat) =>
        batch.set(doc(db, 'battles', battleRef.id, 'category_stats', cat.id), {
          totalDistanceKm: 0,
          avgDistanceKm: 0,
          participantCount: 0,
        })
    );
    await batch.commit();

    return battleRef.id;
  },

  findBattleByInviteCode: async (inviteCode: string) => {
    const callable = httpsCallable(functions, 'lookupBattleByInviteCode');
    const result = await callable({ inviteCode });
    return result.data as Battle;
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
      .filter((id) => activeBattleIds.has(id))
      .slice(0, 2);
  },

  subscribeDeclarations: (battleId, userId) => subscribeTodayDeclarations(
    battleId,
    userId,
    (declarations) => set((state) => ({
      declarationsByBattle: { ...state.declarationsByBattle, [battleId]: declarations },
    })),
  ),

  declareRun: async (battleId, userId, plannedAt, note) => {
    await createRunDeclaration({ battleId, userId, plannedAt, note });
  },

  cheerDeclaration: async (battleId, declarationId, fromUid) => {
    const created = await createDeclarationCheer({ battleId, declarationId, fromUid });
    if (created) {
      set((state) => ({
        declarationsByBattle: {
          ...state.declarationsByBattle,
          [battleId]: (state.declarationsByBattle[battleId] ?? []).map((item) => (
            item.id === declarationId ? { ...item, cheeredByMe: true } : item
          )),
        },
      }));
    }
    return created;
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
