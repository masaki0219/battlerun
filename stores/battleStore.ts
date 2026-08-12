import { create } from 'zustand';
import {
  collection, query, where, getDocs, getDoc,
  doc, Timestamp, writeBatch,
} from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuthStore } from './authStore';
import {
  validateBattleCategory,
  validateBattleDescription,
  validateBattleTitle,
} from '../lib/validation/battleTitle';
import {
  cancelDeclaration as cancelRunDeclaration,
  cheerDeclaration as createDeclarationCheer,
  createDeclaration as createRunDeclaration,
  subscribeTodayDeclarations,
  updateDeclaration as updateRunDeclaration,
} from '../lib/declarations';
import { cheerCountAfterCreate } from '../utils/declarations';
import type { Battle, CategoryStats, Season, Category, BattleParticipation, RunDeclaration, Market } from '../types';
import { isBattleVisibleInMarket, isMarket, resolveBattleMarket } from '../lib/market';
import { inferMarket } from '../lib/deviceLocale';
import { translate } from '../lib/i18n';
import { isPro } from '../lib/pro';

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
  market?: Market;
  termIndex?: number;
  termCount?: number;
}

interface PublicBattleSeriesDraft {
  title: string;
  startAt: Date;
  endAt: Date;
  termIndex?: number;
  termCount?: number;
}

interface CreatePublicBattleSeriesParams {
  battles: PublicBattleSeriesDraft[];
  description: string;
  categories: Category[];
  rankingType: 'average' | 'total';
  userId: string;
  market: Market;
  seasonId?: string | null;
  newSeason?: {
    title: string;
    startAt: Date;
    endAt: Date;
  };
}

interface BattleStore {
  publicBattles: Battle[];
  privateBattles: Battle[];
  myMemberships: BattleParticipation[];
  seasons: Record<string, Season>;
  isLoading: boolean;
  declarationsByBattle: Record<string, RunDeclaration[]>;

  fetchPublicBattles: (market?: Market) => Promise<void>;
  fetchPublicSeasonBattles: (seasonId: string, market?: Market) => Promise<Battle[]>;
  fetchMyMemberships: (userId: string) => Promise<void>;
  fetchMyPrivateBattles: (userId: string) => Promise<void>;
  fetchSeason: (seasonId: string) => Promise<void>;
  joinBattle: (
    battleId: string,
    categoryId: string | null,
    userId: string,
    inviteCode?: string | null,
  ) => Promise<void>;
  leaveBattle: (battleId: string, userId: string) => Promise<void>;
  createBattle: (params: CreateBattleParams) => Promise<string>;
  createPublicBattleSeries: (params: CreatePublicBattleSeriesParams) => Promise<{
    battleIds: string[];
    seasonId: string | null;
  }>;
  findBattleByInviteCode: (inviteCode: string) => Promise<Battle>;
  getActiveBattleIds: () => string[];
  subscribeDeclarations: (battleId: string, userId: string, categoryId: string) => () => void;
  declareRun: (battleId: string, userId: string, categoryId: string, plannedAt: Date, note: string) => Promise<void>;
  updateDeclaration: (battleId: string, declaration: RunDeclaration, plannedAt: Date, note: string) => Promise<void>;
  cancelDeclaration: (battleId: string, declarationId: string) => Promise<void>;
  cheerDeclaration: (battleId: string, declarationId: string, fromUid: string) => Promise<boolean>;
}

// ラベルからカテゴリIDを生成する。日本語のみのラベルは英数字が残らないため
// フォールバックで cat_{index} を用い、重複IDは連番サフィックスで回避する。
function resolveCategoryIds(categories: Pick<Category, 'label' | 'colorId'>[]): Category[] {
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
    return {
      id,
      label: cat.label.trim(),
      ...(cat.colorId ? { colorId: cat.colorId } : {}),
    };
  });
}

function validateBattleContent(title: string, description: string, categories: Category[]): void {
  const titleValidation = validateBattleTitle(title);
  if (!titleValidation.ok) {
    throw new Error(titleValidation.reason ?? translate('battle.invalidTitle'));
  }
  const descriptionValidation = validateBattleDescription(description);
  if (!descriptionValidation.ok) {
    throw new Error(descriptionValidation.reason ?? translate('battle.invalidDescription'));
  }
  for (const category of categories) {
    const categoryValidation = validateBattleCategory(category.label);
    if (!categoryValidation.ok) {
      throw new Error(categoryValidation.reason ?? translate('battle.invalidTeam'));
    }
  }
}

function validTermMetadata(termIndex?: number, termCount?: number): boolean {
  if (termIndex == null && termCount == null) return true;
  return Number.isInteger(termIndex)
    && Number.isInteger(termCount)
    && termIndex! >= 1
    && termCount! >= termIndex!
    && termCount! <= 12;
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
    ...(Number.isInteger(data['termIndex']) && Number.isInteger(data['termCount']) ? {
      termIndex: data['termIndex'] as number,
      termCount: data['termCount'] as number,
    } : {}),
    ...(data['type'] === 'public' ? { market: resolveBattleMarket(data['market']) } : {}),
  };
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  publicBattles: [],
  privateBattles: [],
  myMemberships: [],
  seasons: {},
  isLoading: false,
  declarationsByBattle: {},

  fetchPublicBattles: async (market) => {
    set({ isLoading: true });
    try {
      const q = query(
        collection(db, 'battles'),
        where('type', '==', 'public'),
        where('status', 'in', ['active', 'upcoming']),
      );
      const snap = await getDocs(q);
      const userMarket = market ?? useAuthStore.getState().user?.market ?? inferMarket();
      const battles: Battle[] = snap.docs
        .map((d) => mapDocToBattle(d.id, d.data()))
        .filter((b): b is Battle => b !== null)
        .filter((battle) => isBattleVisibleInMarket(battle.market, userMarket))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
          return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
        });
      set({ publicBattles: battles });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchPublicSeasonBattles: async (seasonId, market) => {
    const q = query(
      collection(db, 'battles'),
      where('type', '==', 'public'),
      where('seasonId', '==', seasonId),
    );
    const snap = await getDocs(q);
    const userMarket = market ?? useAuthStore.getState().user?.market ?? inferMarket();
    return snap.docs
      .map((d) => mapDocToBattle(d.id, d.data()))
      .filter((battle): battle is Battle => battle !== null)
      .filter((battle) => isBattleVisibleInMarket(battle.market, userMarket))
      .sort((left, right) => (left.termIndex ?? 0) - (right.termIndex ?? 0));
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
    // 参加中IDと作成IDの和集合で O(k) 取得。作成者はチーム未選択でも招待コードを管理できる。
    const userSnap = await getDoc(doc(db, 'users', userId));
    const battleIds = [...new Set([
      ...((userSnap.data()?.['battleIds'] as string[] | undefined) ?? []),
      ...((userSnap.data()?.['createdBattleIds'] as string[] | undefined) ?? []),
    ])].slice(0, 100);

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
          if (data['createdBy'] === userId) return mapDocToBattle(battleId, data);
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

  joinBattle: async (battleId, categoryId, userId, inviteCode) => {
    if (!categoryId) throw new Error(translate('battle.selectTeam'));
    const callable = httpsCallable(functions, 'joinBattle');
    await callable({ battleId, categoryId, ...(inviteCode ? { inviteCode } : {}) });

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

  createBattle: async ({ title, description, categories, rankingType, startAt, endAt, userId, isPublic, seasonId, market, termIndex, termCount }) => {
    validateBattleContent(title, description, categories);
    if (endAt <= startAt) throw new Error(translate('battle.invalidPeriod'));
    if (!validTermMetadata(termIndex, termCount)) throw new Error(translate('battle.invalidTermMetadata'));

    const { user, proEntitlement } = useAuthStore.getState();

    if (!isPublic && !isPro(user?.plan, proEntitlement)) {
      throw new Error(`PRO_REQUIRED: ${translate('battle.privateProRequired')}`);
    }

    // 区分IDを確定（ラベルから毎回生成し、重複ラベルには連番を付与）。
    // 呼び出し側が渡した cat.id は無視する。
    const resolvedCategories = resolveCategoryIds(categories);

    if (!isPublic) {
      const callable = httpsCallable<
        {
          title: string;
          description: string;
          categories: Array<{ label: string; colorId?: string }>;
          rankingType: 'average' | 'total';
          startAtMs: number;
          endAtMs: number;
        },
        { battleId: string; inviteCode: string }
      >(functions, 'createPrivateBattle');
      const result = await callable({
        title,
        description,
        categories: resolvedCategories.map(({ label, colorId }) => ({
          label,
          ...(colorId ? { colorId } : {}),
        })),
        rankingType,
        startAtMs: startAt.getTime(),
        endAtMs: endAt.getTime(),
      });
      return result.data.battleId;
    }

    // 開始日が未来なら upcoming で作成し、スケジューラの upcoming→active に委ねる。
    if (!isMarket(market)) throw new Error(translate('battle.marketRequired'));
    const status = startAt.getTime() <= Date.now() ? 'active' : 'upcoming';
    const battleRef = doc(collection(db, 'battles'));
    const batch = writeBatch(db);
    batch.set(battleRef, {
      type: isPublic ? 'public' : 'private',
      seasonId: seasonId ?? null,
      market,
      title,
      description,
      categories: resolvedCategories,
      categoryIds: resolvedCategories.map((category) => category.id),
      rankingType,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      status,
      createdBy: userId,
      inviteCode: null,
      createdAt: Timestamp.now(),
      ...(termIndex != null && termCount != null ? { termIndex, termCount } : {}),
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

  createPublicBattleSeries: async ({
    battles, description, categories, rankingType, userId, market, seasonId, newSeason,
  }) => {
    if (battles.length < 1 || battles.length > 12) {
      throw new Error(translate('battle.invalidTermMetadata'));
    }
    if (!isMarket(market)) throw new Error(translate('battle.marketRequired'));
    if (newSeason && seasonId) throw new Error(translate('battle.invalidSeasonSelection'));
    validateBattleContent(battles[0]?.title ?? '', description, categories);

    const resolvedCategories = resolveCategoryIds(categories);
    const batch = writeBatch(db);
    let resolvedSeasonId = seasonId ?? null;

    if (newSeason) {
      const seasonTitleValidation = validateBattleTitle(newSeason.title);
      if (!seasonTitleValidation.ok) {
        throw new Error(seasonTitleValidation.reason ?? translate('battle.invalidSeason'));
      }
      if (newSeason.endAt <= newSeason.startAt) throw new Error(translate('battle.invalidPeriod'));
      const seasonRef = doc(collection(db, 'seasons'));
      resolvedSeasonId = seasonRef.id;
      batch.set(seasonRef, {
        title: newSeason.title.trim(),
        startAt: Timestamp.fromDate(newSeason.startAt),
        endAt: Timestamp.fromDate(newSeason.endAt),
        status: 'active',
        createdAt: Timestamp.now(),
      });
    }

    const battleIds: string[] = [];
    for (const draft of battles) {
      validateBattleContent(draft.title, description, categories);
      if (draft.endAt <= draft.startAt) throw new Error(translate('battle.invalidPeriod'));
      if (!validTermMetadata(draft.termIndex, draft.termCount)) {
        throw new Error(translate('battle.invalidTermMetadata'));
      }

      const battleRef = doc(collection(db, 'battles'));
      battleIds.push(battleRef.id);
      batch.set(battleRef, {
        type: 'public',
        seasonId: resolvedSeasonId,
        market,
        title: draft.title.trim(),
        description: description.trim(),
        categories: resolvedCategories,
        categoryIds: resolvedCategories.map((category) => category.id),
        rankingType,
        startAt: Timestamp.fromDate(draft.startAt),
        endAt: Timestamp.fromDate(draft.endAt),
        status: draft.startAt.getTime() <= Date.now() ? 'active' : 'upcoming',
        createdBy: userId,
        inviteCode: null,
        createdAt: Timestamp.now(),
        ...(draft.termIndex != null && draft.termCount != null ? {
          termIndex: draft.termIndex,
          termCount: draft.termCount,
        } : {}),
      });
      resolvedCategories.forEach((category) => {
        batch.set(doc(db, 'battles', battleRef.id, 'category_stats', category.id), {
          totalDistanceKm: 0,
          avgDistanceKm: 0,
          participantCount: 0,
        });
      });
    }

    await batch.commit();
    return { battleIds, seasonId: resolvedSeasonId };
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

  subscribeDeclarations: (battleId, userId, categoryId) => subscribeTodayDeclarations(
    battleId,
    userId,
    categoryId,
    (declarations) => set((state) => ({
      declarationsByBattle: { ...state.declarationsByBattle, [battleId]: declarations },
    })),
  ),

  declareRun: async (battleId, userId, categoryId, plannedAt, note) => {
    await createRunDeclaration({ battleId, userId, categoryId, plannedAt, note });
  },

  updateDeclaration: async (battleId, declaration, plannedAt, note) => {
    await updateRunDeclaration({ battleId, declaration, plannedAt, note });
  },

  cancelDeclaration: async (battleId, declarationId) => {
    await cancelRunDeclaration({ battleId, declarationId });
  },

  cheerDeclaration: async (battleId, declarationId, fromUid) => {
    const created = await createDeclarationCheer({ battleId, declarationId, fromUid });
    if (created) {
      set((state) => ({
        declarationsByBattle: {
          ...state.declarationsByBattle,
          [battleId]: (state.declarationsByBattle[battleId] ?? []).map((item) => (
            item.id === declarationId
              ? {
                  ...item,
                  cheeredByMe: true,
                  cheerCount: cheerCountAfterCreate(item.cheerCount, true),
                }
              : item
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
