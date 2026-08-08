// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community context (Frontend Phase 13, §12, §44)
//
// §12: one centralized community context, and **no `activeCommunityId`
// scattered through unrelated components**. This store is that single source of
// truth, and it is deliberately small.
//
// ── What is here, and what is emphatically not ───────────────────────────────
//
// §44: Zustand for client state only, and do not duplicate server state.
//
//   HERE          the active community id — a *view selection*.
//                 the active mode — one of §13's five.
//                 the explicit multi-selection for cross-community mode.
//                 recently visited ids, for the switcher.
//                 whether the persisted selection has been loaded yet.
//
//   NOT HERE      the membership set. The roles. The capabilities. The
//                 primary community. The community records themselves.
//
// Every one of those is server state and lives in TanStack Query, read through
// `hooks/communities.ts`. The reason is not tidiness: a membership mirrored into
// Zustand is a membership that can be stale in a place nothing invalidates, and
// the first bug it produces is a moderation button that stays visible after the
// role was revoked. §62 says the backend is authoritative; keeping authority out
// of this store is how that holds.
//
// The consequence, which is intentional: **this store cannot resolve a scope on
// its own.** `PRIMARY_COMMUNITY` means nothing without the membership set. So
// resolution happens in the hook layer, where both halves are available, and
// what this store exposes is a `CommunityFilterSelection` — a *request* for a
// scope rather than a scope.
//
// ── The fallback chain (§75, §42) ────────────────────────────────────────────
//
// An active community can stop existing while it is active: suspended, archived,
// or a membership revoked. `reconcile()` is called by the hook layer whenever the
// community or membership data changes, and walks a fixed chain — the active
// community, then the primary, then the first membership, then unscoped. That is
// what stops the app sitting on a community that no longer answers, which would
// otherwise render as a permanent error screen on launch.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type {
  CommunityFilterSelection,
  CommunityId,
  CommunityMode,
} from '@/types/community-directory';
import { canonicalCommunityIds } from '@/lib/community/scope';
import {
  readCommunityContext,
  writeCommunityContext,
  type PersistedCommunityContext,
} from '@/lib/community/persistence';
import { trackCommunityEvent } from '@/lib/community/analytics';

/** How many recents the switcher shows. Matches the persistence cap. */
const RECENT_LIMIT = 8;

interface CommunityContextState {
  /**
   * The community the member is currently looking at, where the mode names one.
   * Null in `ALL_COMMUNITIES`, `PRIMARY_COMMUNITY` (which resolves from
   * membership) and `INTERESTED_COMMUNITIES`.
   */
  activeCommunityId: CommunityId | null;

  mode: CommunityMode;

  /** The explicit selection for `CROSS_COMMUNITY`. Canonical: sorted, unique. */
  selectedCommunityIds: CommunityId[];

  recentCommunityIds: CommunityId[];

  /**
   * False until the persisted selection has been read. Screens render a skeleton
   * rather than a scope, because rendering `ALL_COMMUNITIES` for one frame and
   * then switching would fire a request for the whole platform on every launch.
   */
  isHydrated: boolean;

  /** ISO of the persisted record, for the offline "saved on" line (§45). */
  hydratedFrom: string | null;

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Reads the persisted selection. Safe to call more than once. */
  hydrate: () => Promise<void>;

  /**
   * Switches to one community (§11). The everyday action.
   *
   * Sets the mode to `SELECTED_COMMUNITY` unless told otherwise, because a
   * member who taps a community in the switcher means "show me this one" — not
   * "add this to my cross-community selection".
   */
  switchTo: (communityId: CommunityId, options?: { mode?: CommunityMode }) => void;

  setMode: (mode: CommunityMode) => void;

  /** Replaces the cross-community selection. Canonicalized on the way in. */
  setSelectedCommunityIds: (ids: readonly CommunityId[]) => void;

  toggleSelectedCommunityId: (id: CommunityId) => void;

  /** §13's cross-community mode, with an optional explicit selection. */
  enableCrossCommunity: (ids?: readonly CommunityId[]) => void;

  /** Back to unscoped. */
  clearScope: () => void;

  /**
   * Applies a whole selection at once — used by deep links (§53), which must
   * restore a mode and a community together rather than in two renders.
   */
  applySelection: (selection: CommunityFilterSelection) => void;

  /**
   * §75's fallback chain. Called by the hook layer when the community or
   * membership data changes.
   *
   * `availableIds` is every community the member may currently scope to.
   * `primaryId` is the primary from the membership set, or null.
   */
  reconcile: (input: { availableIds: readonly CommunityId[]; primaryId: CommunityId | null }) => void;

  /** Sign-out. Returns to the first-run state without touching disk. */
  reset: () => void;
}

/** The selection a first run starts from: unscoped, which asks nothing of nobody. */
const INITIAL: Pick<
  CommunityContextState,
  'activeCommunityId' | 'mode' | 'selectedCommunityIds' | 'recentCommunityIds'
> = {
  activeCommunityId: null,
  mode: 'ALL_COMMUNITIES',
  selectedCommunityIds: [],
  recentCommunityIds: [],
};

function rememberRecent(recents: readonly CommunityId[], id: CommunityId): CommunityId[] {
  return [id, ...recents.filter((existing) => existing !== id)].slice(0, RECENT_LIMIT);
}

/**
 * Writes the selection to disk.
 *
 * Fire-and-forget. A failed write means the app reopens unscoped, which is a
 * mild annoyance rather than a correctness problem — and blocking a community
 * switch on an AsyncStorage round trip would make the switcher feel broken.
 */
function persist(state: CommunityContextState): void {
  void writeCommunityContext({
    activeCommunityId: state.activeCommunityId,
    mode: state.mode,
    selectedCommunityIds: state.selectedCommunityIds,
    recentCommunityIds: state.recentCommunityIds,
  });
}

export const useCommunityContextStore = create<CommunityContextState>((set, get) => ({
  ...INITIAL,
  isHydrated: false,
  hydratedFrom: null,

  hydrate: async () => {
    if (get().isHydrated) return;

    const stored: PersistedCommunityContext | null = await readCommunityContext();

    if (!stored) {
      set({ isHydrated: true, hydratedFrom: null });
      return;
    }

    set({
      activeCommunityId: stored.activeCommunityId,
      mode: stored.mode,
      selectedCommunityIds: canonicalCommunityIds(stored.selectedCommunityIds),
      recentCommunityIds: stored.recentCommunityIds.slice(0, RECENT_LIMIT),
      isHydrated: true,
      hydratedFrom: stored.savedAt,
    });
  },

  switchTo: (communityId, options) => {
    const previous = get().activeCommunityId;
    const mode = options?.mode ?? 'SELECTED_COMMUNITY';

    set((state) => ({
      activeCommunityId: communityId,
      mode,
      recentCommunityIds: rememberRecent(state.recentCommunityIds, communityId),
    }));

    // §63. The id of the community switched *to* is a thing; the member's
    // membership of it is not, and is not emitted. See `community/analytics.ts`.
    if (previous !== communityId) {
      trackCommunityEvent('community.switched', {
        communityId,
        communityMode: mode,
      });
    }

    persist(get());
  },

  setMode: (mode) => {
    if (get().mode === mode) return;

    set({ mode });
    trackCommunityEvent('community.mode.changed', { communityMode: mode });
    persist(get());
  },

  setSelectedCommunityIds: (ids) => {
    const canonical = canonicalCommunityIds(ids);
    set({ selectedCommunityIds: canonical });

    trackCommunityEvent('community.filter.applied', {
      communityMode: get().mode,
      communityCount: canonical.length,
    });

    persist(get());
  },

  toggleSelectedCommunityId: (id) => {
    const current = get().selectedCommunityIds;
    const next = current.includes(id)
      ? current.filter((existing) => existing !== id)
      : [...current, id];

    get().setSelectedCommunityIds(next);
  },

  enableCrossCommunity: (ids) => {
    const canonical = canonicalCommunityIds(ids ?? get().selectedCommunityIds);

    set({ mode: 'CROSS_COMMUNITY', selectedCommunityIds: canonical });

    trackCommunityEvent('community.cross_community.enabled', {
      communityCount: canonical.length,
    });

    persist(get());
  },

  clearScope: () => {
    set({ mode: 'ALL_COMMUNITIES', activeCommunityId: null, selectedCommunityIds: [] });
    trackCommunityEvent('community.mode.changed', { communityMode: 'ALL_COMMUNITIES' });
    persist(get());
  },

  applySelection: (selection) => {
    const canonical = canonicalCommunityIds(selection.communityIds ?? []);

    set((state) => ({
      mode: selection.mode,
      selectedCommunityIds: canonical,
      // A `SELECTED_COMMUNITY` selection names its community; the other modes
      // resolve theirs from membership and must not leave a stale active id
      // behind, or the switcher would show a community the scope does not cover.
      activeCommunityId:
        selection.mode === 'SELECTED_COMMUNITY' ? (canonical[0] ?? null) : state.activeCommunityId,
      recentCommunityIds:
        selection.mode === 'SELECTED_COMMUNITY' && canonical[0]
          ? rememberRecent(state.recentCommunityIds, canonical[0])
          : state.recentCommunityIds,
    }));

    persist(get());
  },

  reconcile: ({ availableIds, primaryId }) => {
    const state = get();

    // Nothing has loaded yet. Reconciling against an empty set would clear a
    // perfectly good selection on every cold start.
    if (availableIds.length === 0 && primaryId === null) return;

    const available = new Set(availableIds);
    const activeIsUsable = state.activeCommunityId ? available.has(state.activeCommunityId) : true;

    // Drop selections that no longer resolve — an archived community, a
    // membership revoked while the app was backgrounded.
    const usableSelection = state.selectedCommunityIds.filter((id) => available.has(id));
    const recents = state.recentCommunityIds.filter((id) => available.has(id));

    if (activeIsUsable && usableSelection.length === state.selectedCommunityIds.length) {
      if (recents.length !== state.recentCommunityIds.length) {
        set({ recentCommunityIds: recents });
        persist(get());
      }
      return;
    }

    // The chain: the primary, then the first available, then unscoped.
    const fallback = primaryId && available.has(primaryId) ? primaryId : (availableIds[0] ?? null);

    set({
      activeCommunityId: activeIsUsable ? state.activeCommunityId : fallback,
      mode: activeIsUsable
        ? state.mode
        : fallback
          ? state.mode === 'SELECTED_COMMUNITY'
            ? 'SELECTED_COMMUNITY'
            : state.mode
          : 'ALL_COMMUNITIES',
      selectedCommunityIds: usableSelection,
      recentCommunityIds: recents,
    });

    persist(get());
  },

  reset: () => {
    set({ ...INITIAL, isHydrated: true, hydratedFrom: null });
  },
}));

/**
 * The store's selection, as the shape the scope resolver takes.
 *
 * A selector rather than a stored field, so there is no second copy of the
 * selection to keep in step. Every hook that needs a scope goes through this.
 */
export function selectCommunityFilterSelection(
  state: CommunityContextState
): CommunityFilterSelection {
  switch (state.mode) {
    case 'SELECTED_COMMUNITY':
      return {
        mode: 'SELECTED_COMMUNITY',
        communityIds: state.activeCommunityId ? [state.activeCommunityId] : [],
      };
    case 'CROSS_COMMUNITY':
      return { mode: 'CROSS_COMMUNITY', communityIds: state.selectedCommunityIds };
    default:
      return { mode: state.mode };
  }
}
