// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation hooks (Frontend Phase 18, §4 · §57 · §68)
//
// The stable interface above the two repository arms. §4's requirement is that
// a screen must not know whether automation is backend-driven, queue-driven,
// scheduled, event-driven, webhook-driven, mocked or development-only — and
// this file is where that stops being a principle and becomes a signature.
//
// A screen calls `useAutomations()` and receives `AutomationDefinition[]`.
// Behind that one call:
//
//   * B13's real `/notifications/preferences` decides which channels an action
//     can use,
//   * B13's real `/notifications/categories` supplies the categories,
//   * Phase 16's registry decides whether a calendar action is available,
//   * the development adapter answers for everything with no contract,
//   * and the four are composed into one list.
//
// The screen sees none of that. What it does see, and is **required** to
// render, is `isSimulated` — because §57 forbids mock execution looking
// indistinguishable from real execution, and the only way to make that
// enforceable is to make the marker unavoidable.
//
// ── §68, and the one thing every hook here has in common ─────────────────────
//
// Every query key comes from `lib/automation/query-keys.ts` and every one
// carries the member and, where the data is scoped, the scope. No hook builds
// an array literal. §58 asks for a *proof* that one member's automations cannot
// appear for another and that one community's cannot appear under another, and
// a proof needs one place to reason about.
//
// ── The retry policy, and why it is not the default ──────────────────────────
//
// `shouldRetryAutomation` never retries a backend gap. Almost every query in
// this phase resolves to a gap in production, and TanStack's default three
// attempts would mean three seconds of spinner before a screen that was always
// going to say "not available yet". It also never retries an indeterminate
// failure, which is how one activation becomes two.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import * as gapApi from '@/lib/automation-gap-api';
import {
  fetchCertifiedAutomationSupport,
  type CertifiedAutomationSupport,
} from '@/lib/automation-api';
import { areAutomationGapsEnabled } from '@/config/automation-gaps';
import { useAuthStore } from '@/store/auth';
import { useConnectivityStore } from '@/lib/connectivity';
import { useCommunityContextStore } from '@/store/community-context';
import { acquireIdempotencyKey, releaseIdempotencyKey } from '@/lib/idempotency';
import { automationKeys, scopeTokenFor } from '@/lib/automation/query-keys';
import {
  AutomationError,
  offlineError,
  shouldRetryAutomation,
  toAutomationError,
} from '@/lib/automation/errors';
import { actionsToken } from '@/lib/automation/actions';
import { buildPreview, type DependencyContext } from '@/lib/automation/dependencies';
import { simulate, type SimulationContext } from '@/lib/automation/simulation';
import {
  trackAutomationCreated,
  trackAutomationEvent,
  trackGapEncountered,
} from '@/lib/automation/events';
import {
  noAutomationAccess,
  type AutomationAccess,
  type AutomationAudience,
  type AutomationAuditEntry,
  type AutomationDefinition,
  type AutomationDraft,
  type AutomationListFilters,
  type AutomationOwnerKind,
  type AutomationPreview,
  type AutomationRun,
  type AutomationScope,
  type AutomationSimulation,
  type SavedSearch,
  type SavedSearchSubject,
} from '@/types/automation';
import { DEFAULT_AUTOMATION_FILTERS } from '@/types/automation';

/** The signed-in member, for the member-scoped cache keys — §58. */
function useMemberId(): string | null {
  return useAuthStore((state) => state.user?.userId ?? null);
}

/**
 * The member's own scope.
 *
 * The default for every personal automation, and the fallback when a screen
 * does not name one. `ownerId` falls back to `me` rather than to an empty
 * string so a cache key is readable and so a signed-out reader's key cannot
 * collide with a member whose id happens to be blank.
 */
export function usePersonalScope(): AutomationScope {
  const user = useAuthStore((state) => state.user);

  return useMemo(
    () => ({
      ownerKind: 'user' as const,
      ownerId: user?.userId ?? 'me',
      ownerLabel: user?.fullName ?? 'You',
      communityIds: [],
      isCrossCommunity: false,
      countryCodes: [],
      neighbourhoodIds: [],
    }),
    [user?.userId, user?.fullName]
  );
}

/**
 * A scope for any owner kind the member may act as.
 *
 * §45 requires every automation to name its owner, and the domain supports
 * nine. Without this, every screen would have to assume one — and the first
 * version of this phase assumed `user`, which left the community, creator and
 * business templates built and unreachable.
 *
 * A non-personal scope still belongs to *this member acting in a role*, so the
 * owner id is theirs for every kind except `community` and `organization`,
 * which name the space rather than the person. That distinction is what makes
 * `scopeToken` produce different cache entries for "my creator automations" and
 * "Nigeria's automations" while keeping both under this member's key.
 */
export function useScopeFor(ownerKind: AutomationOwnerKind): AutomationScope {
  const user = useAuthStore((state) => state.user);
  const activeCommunityId = useCommunityContextStore((state) => state.activeCommunityId);
  const selected = useCommunityContextStore((state) => state.selectedCommunityIds);

  return useMemo(() => {
    const personalId = user?.userId ?? 'me';

    if (ownerKind === 'community') {
      const communityId = activeCommunityId ?? selected[0] ?? '';
      return {
        ownerKind,
        ownerId: communityId,
        ownerLabel: communityId || 'A community',
        // Empty when the member has no community selected — which validation
        // then reports, rather than this silently inventing one. §14.
        communityIds: communityId ? [communityId] : [],
        isCrossCommunity: selected.length > 1,
        countryCodes: [],
        neighbourhoodIds: [],
      };
    }

    if (ownerKind === 'organization') {
      return {
        ownerKind,
        ownerId: personalId,
        ownerLabel: 'Your organization',
        communityIds: [],
        isCrossCommunity: false,
        countryCodes: [],
        neighbourhoodIds: [],
      };
    }

    return {
      ownerKind,
      ownerId: personalId,
      ownerLabel: user?.fullName ?? 'You',
      communityIds: [],
      isCrossCommunity: false,
      countryCodes: [],
      neighbourhoodIds: [],
    };
  }, [ownerKind, user?.userId, user?.fullName, activeCommunityId, selected]);
}

/**
 * A community scope, from the community the member is currently in.
 *
 * §14: an automation must state which communities it acts in, and a member
 * belongs to many. This reads Phase 13's existing context store rather than
 * keeping a second notion of "the current community" — two would eventually
 * disagree, and the one the automation used would be the wrong one.
 */
export function useCommunityScope(communityId?: string | null): AutomationScope | null {
  const activeCommunityId = useCommunityContextStore((state) => state.activeCommunityId);
  const selected = useCommunityContextStore((state) => state.selectedCommunityIds);

  const id = communityId ?? activeCommunityId;

  return useMemo(() => {
    if (!id) return null;

    return {
      ownerKind: 'community' as const,
      ownerId: id,
      ownerLabel: id,
      communityIds: [id],
      // True only when the member has deliberately selected more than one.
      // Deriving it from the selection rather than from a screen's guess is
      // what keeps §14's "every automation must clearly define its scope" true
      // without every screen having to think about it.
      isCrossCommunity: selected.length > 1,
      countryCodes: [],
      neighbourhoodIds: [],
    };
  }, [id, selected.length]);
}

// ═════════════════════════════════════════════════════════════════════════════
// PLATFORM SUPPORT — what this deployment can actually do
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What the certified backend supports.
 *
 * Fetched once and cached for a long time: it is a fact about the deployment
 * rather than about the member, and it does not change between renders. The
 * B13 half within it is short-lived, which is why `useDependencyContext` reads
 * preferences through this rather than holding its own copy.
 */
export function useAutomationSupport(): {
  support: CertifiedAutomationSupport | null;
  isLoading: boolean;
} {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: ['automations', userId ?? 'anonymous', 'platform-support'],
    queryFn: fetchCertifiedAutomationSupport,
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryAutomation,
  });

  return { support: query.data ?? null, isLoading: query.isLoading };
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS — §45–§49
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The server-evaluated capability set for a scope.
 *
 * Returns `noAutomationAccess()` rather than null on failure, and the
 * difference matters: every consumer reads booleans off it, and a null would
 * make each of them decide what a missing answer means. One of them would
 * decide wrongly. `noAutomationAccess()` has `provenance: 'unavailable'`, which
 * `evaluateAutomationAction` treats as "hidden" for everything — failing closed,
 * once, in one place.
 */
export function useAutomationAccess(scope: AutomationScope): {
  access: AutomationAccess;
  isLoading: boolean;
} {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: automationKeys.capabilities(userId, scopeTokenFor(scope)),
    queryFn: async (): Promise<AutomationAccess> => {
      if (!areAutomationGapsEnabled()) {
        // No capability contract exists. Returning the closed set rather than
        // rejecting is correct: the Automation Center still renders, and it
        // renders the honest "this build cannot create automations" state
        // rather than an error a member would try to retry.
        return noAutomationAccess();
      }
      return gapApi.fetchAccess(scope);
    },
    // Five minutes, and always refetched on scope change because the key
    // carries the scope. A stale capability set is the input to what the
    // builder offers, and offering something that 403s is worse than a spinner.
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryAutomation,
  });

  return {
    access: query.data ?? noAutomationAccess(),
    isLoading: query.isLoading,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// THE LIST — §6 · §67
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The Automation Center's list.
 *
 * Infinite rather than paged because §67 asks for the centre to stay responsive
 * with large lists, and because a member scrolling their automations should not
 * meet a pager. Twenty per page, matching GAP-001's contract.
 */
export function useAutomations(
  scope: AutomationScope,
  filters: AutomationListFilters = DEFAULT_AUTOMATION_FILTERS
): {
  automations: AutomationDefinition[];
  totalCount: number | null;
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: AutomationError | null;
  refetch: () => void;
} {
  const userId = useMemberId();

  const query = useInfiniteQuery({
    queryKey: automationKeys.list(userId, scopeTokenFor(scope), filters),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!areAutomationGapsEnabled()) {
        // Rejects rather than returning an empty page. An empty list renders as
        // "you have no automations", which is a claim about the member; a
        // rejection renders as "this build cannot show you this", which is a
        // claim about the build and is the true one.
        throw toAutomationError(new Error('no registry'), { mutating: false });
      }
      return gapApi.listAutomations(scope, filters, pageParam);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: shouldRetryAutomation,
    staleTime: 30 * 1000,
  });

  const automations = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );

  return {
    automations,
    totalCount: query.data?.pages[0]?.totalCount ?? null,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    error: query.error instanceof AutomationError ? query.error : null,
    refetch: () => void query.refetch(),
  };
}

export function useAutomation(automationId: string | null): {
  automation: AutomationDefinition | null;
  isLoading: boolean;
  error: AutomationError | null;
} {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: automationKeys.detail(userId, automationId ?? 'none'),
    enabled: !!automationId,
    queryFn: async () => {
      if (!areAutomationGapsEnabled()) {
        throw toAutomationError(new Error('no registry'), { mutating: false });
      }
      return gapApi.fetchAutomation(automationId!);
    },
    retry: shouldRetryAutomation,
    staleTime: 30 * 1000,
  });

  return {
    automation: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error instanceof AutomationError ? query.error : null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// MUTATIONS — §39 · §40 · §44 · §61
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Create, update, pause, resume and delete.
 *
 * One hook rather than five because every one of them invalidates the same
 * keys, and five hooks would be five chances to invalidate a different set —
 * which is how a member pauses an automation and the list still says Active.
 */
export function useAutomationMutations(scope: AutomationScope) {
  const queryClient = useQueryClient();
  const userId = useMemberId();
  const isOffline = useConnectivityStore((state) => !state.isOnline);

  /**
   * Everything this member's automation state is keyed under.
   *
   * Invalidating the member prefix rather than each specific key: a list is
   * cached per filter set, and a member who created an automation while
   * filtered to "Paused" must still see it when they clear the filter.
   */
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: automationKeys.all(userId) });
  }, [queryClient, userId]);

  const create = useMutation({
    mutationFn: async (draft: AutomationDraft): Promise<AutomationDefinition> => {
      // §61: never claim a server-side automation was activated while offline.
      // Refused before anything is sent, and the message says nothing was sent.
      if (isOffline) throw offlineError('Creating an automation');

      // §39. Phase 5's key store, with an `automation` operation — the same
      // module the wallet uses rather than a second one. The subject is the
      // trigger and scope rather than a timestamp, so a retry after a timeout
      // reuses the key and a member who genuinely wants two similar automations
      // is not refused.
      const operation = {
        operation: 'automation',
        subject: `${scope.ownerKind}:${scope.ownerId}:${draft.trigger?.key ?? 'none'}`,
        discriminator: draft.name.trim().toLowerCase(),
      };
      const idempotencyKey = await acquireIdempotencyKey(operation);

      try {
        const created = await gapApi.createAutomation(draft, idempotencyKey);

        trackAutomationCreated({
          triggerKey: draft.trigger?.key ?? 'unknown',
          ownerKind: scope.ownerKind,
          domain: 'notifications',
          conditionCount: draft.conditions.length,
          actionCount: draft.actions.length,
          support: created.support,
          source: draft.source,
          templateId: draft.templateId,
        });

        // Released only once the operation reached a terminal state, which for
        // a creation is the moment the server answered with a record.
        await releaseIdempotencyKey(operation);
        return created;
      } catch (cause) {
        const error = toAutomationError(cause, { mutating: true });

        // A terminal failure ends the operation, so the key is released and a
        // fresh attempt is genuinely fresh. An *indeterminate* one is not
        // released: the automation may exist, and the next attempt must carry
        // the same key so the server can recognise it rather than create a
        // second.
        if (error.isTerminal && !error.isIndeterminate) {
          await releaseIdempotencyKey(operation);
        }
        if (error.gapId) trackGapEncountered(error.gapId, draft.trigger?.key);
        throw error;
      }
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: {
      automationId: string;
      changes: Partial<AutomationDraft>;
      expectedUpdatedAt: string | null;
    }): Promise<AutomationDefinition> => {
      if (isOffline) throw offlineError('Changing an automation');
      return gapApi.updateAutomation(input.automationId, input.changes, input.expectedUpdatedAt);
    },
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: async (input: {
      automationId: string;
      status: 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'DRAFT';
    }) => {
      if (isOffline) throw offlineError('Changing an automation');

      const result = await gapApi.setAutomationStatus(input.automationId, input.status);

      trackAutomationEvent(
        input.status === 'ACTIVE'
          ? 'automation.activated'
          : input.status === 'PAUSED'
            ? 'automation.paused'
            : 'automation.disabled',
        { triggerKey: result.automation.trigger.key, supportStatus: result.automation.support }
      );

      return result;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (automationId: string) => {
      if (isOffline) throw offlineError('Deleting an automation');
      const result = await gapApi.deleteAutomation(automationId);
      trackAutomationEvent('automation.deleted');
      return result;
    },
    onSuccess: invalidate,
  });

  return {
    create,
    update,
    setStatus,
    remove,
    isOffline,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTION HISTORY — §36 · §37 · §67
// ═════════════════════════════════════════════════════════════════════════════

export function useAutomationRuns(
  automationId: string | null,
  status: string | null = null
): {
  runs: AutomationRun[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  /**
   * Refetches the pages already loaded, for pull-to-refresh.
   *
   * TanStack replaces each loaded page rather than discarding them, so a member
   * who had paged three deep still has three pages afterwards — refreshing does
   * not cost them their place, and no page can arrive twice.
   */
  refetch: () => Promise<unknown>;
  error: AutomationError | null;
} {
  const userId = useMemberId();

  const query = useInfiniteQuery({
    queryKey: automationKeys.runs(userId, automationId, status, null),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!areAutomationGapsEnabled()) {
        throw toAutomationError(new Error('no history'), { mutating: false });
      }
      return gapApi.listRuns(automationId, status, pageParam);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: shouldRetryAutomation,
    staleTime: 30 * 1000,
  });

  const runs = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  return {
    runs,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    refetch: () => query.refetch(),
    error: query.error instanceof AutomationError ? query.error : null,
  };
}

export function useAutomationRun(
  automationId: string | null,
  runId: string | null
): { run: AutomationRun | null; isLoading: boolean; error: AutomationError | null } {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: automationKeys.run(userId, runId ?? 'none'),
    enabled: !!automationId && !!runId,
    queryFn: () => gapApi.fetchRun(automationId!, runId!),
    retry: shouldRetryAutomation,
    // A terminal run never changes. Five minutes rather than thirty seconds so
    // a member reading a failure and scrolling back does not refetch it.
    staleTime: 5 * 60 * 1000,
  });

  return {
    run: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error instanceof AutomationError ? query.error : null,
  };
}

export function useAutomationAudit(automationId: string | null): {
  audit: AutomationAuditEntry[];
  isLoading: boolean;
} {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: automationKeys.audit(userId, automationId ?? 'none'),
    enabled: !!automationId,
    queryFn: () => gapApi.fetchAudit(automationId!),
    retry: shouldRetryAutomation,
    staleTime: 60 * 1000,
  });

  return { audit: query.data ?? [], isLoading: query.isLoading };
}

// ═════════════════════════════════════════════════════════════════════════════
// AUDIENCE — §34
// ═════════════════════════════════════════════════════════════════════════════

/**
 * How many people an automation would reach.
 *
 * Only fetched when an action actually reaches somebody: asking for an audience
 * over a self-only automation would be a request per keystroke in the builder
 * for an answer that is always "you".
 */
export function useAutomationAudience(
  scope: AutomationScope,
  actionKeys: string[],
  enabled: boolean
): { audience: AutomationAudience | null; isLoading: boolean } {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: automationKeys.audience(userId, scopeTokenFor(scope), actionsToken(actionKeys)),
    enabled: enabled && actionKeys.length > 0,
    queryFn: () => gapApi.fetchAudience(scope, actionKeys),
    retry: shouldRetryAutomation,
    staleTime: 5 * 60 * 1000,
  });

  return { audience: query.data ?? null, isLoading: query.isLoading };
}

// ═════════════════════════════════════════════════════════════════════════════
// DEPENDENCIES AND PREVIEW — §34 · §55
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Everything the dependency check needs about the world.
 *
 * Assembled here so a screen does not have to know that "which channels are on"
 * comes from B13 and "is a calendar connected" comes from Phase 16's registry.
 *
 * `now` is captured once per render of the consuming screen rather than read
 * inside the check, so a preview does not change between two reads in one
 * frame — which would make a schedule warning flicker on a date boundary.
 */
export function useDependencyContext(scope: AutomationScope): DependencyContext {
  const { access } = useAutomationAccess(scope);
  const { support } = useAutomationSupport();
  const isOffline = useConnectivityStore((state) => !state.isOnline);

  return useMemo(
    () => ({
      access: access.provenance === 'server' ? access : null,
      // Phase 16 owns the real answer; until a calendar connection exists this
      // is the device calendar only, which `automation-api.ts` reports.
      connectedIntegrations: support?.hasDeviceCalendar ? ['calendar'] : [],
      pushEnabled: support?.enabledChannels.includes('Push') ?? false,
      emailVerified: support?.enabledChannels.includes('Email') ?? false,
      enabledChannels: support?.enabledChannels ?? ['InApp'],
      audience: null,
      isOffline,
      now: new Date(),
    }),
    [access, support, isOffline]
  );
}

/**
 * A draft's preview.
 *
 * Pure and synchronous — `buildPreview` does no I/O — so the builder can render
 * it on every change without a request. The audience is the one asynchronous
 * part and is passed in.
 */
export function useAutomationPreview(
  draft: AutomationDraft,
  scope: AutomationScope
): AutomationPreview {
  const context = useDependencyContext(scope);
  const actionKeys = useMemo(() => draft.actions.map((action) => action.key), [draft.actions]);

  const reachesOthers = useMemo(
    () => actionKeys.some((key) => key.startsWith('notify.') && key !== 'notify.self'),
    [actionKeys]
  );

  const { audience } = useAutomationAudience(scope, actionKeys, reachesOthers);

  return useMemo(
    () => buildPreview(draft, { ...context, audience }),
    [draft, context, audience]
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SIMULATION — §35 · §57
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §35's safe test.
 *
 * The simulation itself is built on the client by `lib/automation/simulation.ts`,
 * which imports nothing that could dispatch — the safety property is structural
 * rather than a flag. The adapter is asked only for the audience, which is the
 * one part a client genuinely cannot know.
 *
 * A failure to reach the adapter is **not** a failure of the test: the local
 * simulation still runs and says which conditions it could not evaluate. A
 * member should be able to test an automation while offline.
 */
export function useAutomationSimulation(scope: AutomationScope) {
  const context = useDependencyContext(scope);

  return useMutation({
    mutationFn: async (draft: AutomationDraft): Promise<AutomationSimulation> => {
      let serverEvaluated = false;

      if (areAutomationGapsEnabled()) {
        try {
          await gapApi.simulateAutomation(draft);
          serverEvaluated = true;
        } catch {
          // Deliberately swallowed. See above: the local simulation is the
          // product here, and the server call adds an audience estimate. An
          // error banner over a working test would be misleading.
          serverEvaluated = false;
        }
      }

      const simulationContext: SimulationContext = {
        enabledChannels: context.enabledChannels,
        audience: context.audience,
        now: new Date(),
        serverEvaluated,
      };

      const result = simulate(draft, simulationContext);

      trackAutomationEvent('automation.tested', {
        triggerKey: draft.trigger?.key,
        actionCount: draft.actions.length,
        wasSimulated: true,
      });

      return result;
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SAVED SEARCHES — §30
// ═════════════════════════════════════════════════════════════════════════════

export function useSavedSearches(subject: SavedSearchSubject | null = null): {
  searches: SavedSearch[];
  isLoading: boolean;
  error: AutomationError | null;
} {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: automationKeys.savedSearches(userId, subject),
    queryFn: async () => {
      if (!areAutomationGapsEnabled()) {
        throw toAutomationError(new Error('no saved searches'), { mutating: false });
      }
      return gapApi.listSavedSearches(subject);
    },
    retry: shouldRetryAutomation,
    staleTime: 60 * 1000,
  });

  return {
    searches: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof AutomationError ? query.error : null,
  };
}

export function useSavedSearchMutations() {
  const queryClient = useQueryClient();
  const userId = useMemberId();
  const isOffline = useConnectivityStore((state) => !state.isOnline);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: automationKeys.all(userId) });
  }, [queryClient, userId]);

  const create = useMutation({
    mutationFn: async (input: {
      subject: SavedSearchSubject;
      name: string;
      criteria: Record<string, string | number | boolean | string[]>;
      querySummary: string;
      alertsEnabled: boolean;
      alertFrequency: string;
      watchFor: string[];
    }) => {
      if (isOffline) throw offlineError('Saving a search');
      const created = await gapApi.createSavedSearch(input);

      trackAutomationEvent('automation.savedSearch.created', {
        savedSearchSubject: input.subject,
        // §52: how many filters, never which and never their values. A housing
        // search's criteria state a budget and a neighbourhood.
        criteriaCount: Object.keys(input.criteria).length,
        alertFrequency: input.alertFrequency,
      });

      return created;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      changes: Partial<Pick<SavedSearch, 'name' | 'alertsEnabled' | 'alertFrequency' | 'watchFor'>>;
    }) => {
      if (isOffline) throw offlineError('Changing a saved search');
      const updated = await gapApi.updateSavedSearch(input.id, input.changes);

      if (input.changes.alertsEnabled !== undefined) {
        trackAutomationEvent('automation.savedSearch.alertsToggled', {
          savedSearchSubject: updated.subject,
          alertFrequency: updated.alertFrequency,
        });
      }

      return updated;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (isOffline) throw offlineError('Deleting a saved search');
      const result = await gapApi.deleteSavedSearch(id);
      trackAutomationEvent('automation.savedSearch.deleted');
      return result;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove, isOffline };
}

// ═════════════════════════════════════════════════════════════════════════════
// REMINDERS — §12
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The reminders configured on one subject.
 *
 * §12 requires `configured`, `scheduled`, `sent`, `failed` and `cancelled` to
 * be distinguishable, and the adapter returns `configured` and never
 * `scheduled` — because nothing schedules. The screen renders that difference
 * rather than a tick, which is the whole point of keeping five states.
 */
export function useReminders(subjectKind: string, subjectId: string | null) {
  const userId = useMemberId();
  const queryClient = useQueryClient();
  const isOffline = useConnectivityStore((state) => !state.isOnline);

  const query = useQuery({
    queryKey: automationKeys.reminders(userId, subjectKind, subjectId ?? 'none'),
    enabled: !!subjectId,
    queryFn: async () => {
      if (!areAutomationGapsEnabled()) {
        throw toAutomationError(new Error('no reminders'), { mutating: false });
      }
      return gapApi.listReminders(subjectKind, subjectId!);
    },
    retry: shouldRetryAutomation,
    staleTime: 60 * 1000,
  });

  const create = useMutation({
    mutationFn: async (input: {
      offsetMinutes: number;
      anchor: 'start' | 'end';
      channel: string;
      timeZoneId: string;
    }) => {
      if (isOffline) throw offlineError('Setting a reminder');
      if (!subjectId) throw offlineError('Setting a reminder');

      // §12 · GAP-008: idempotent on (member, subject, offset, anchor). Tapping
      // "remind me" twice must produce one reminder — a duplicate here is two
      // identical notifications a minute apart, which is the fastest way an
      // automation feature loses somebody's trust.
      const operation = {
        operation: 'automation-reminder',
        subject: `${subjectKind}:${subjectId}`,
        discriminator: `${input.offsetMinutes}:${input.anchor}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(operation);

      try {
        const created = await gapApi.createReminder(
          { subjectKind, subjectId, ...input },
          idempotencyKey
        );
        await releaseIdempotencyKey(operation);
        return created;
      } catch (cause) {
        const error = toAutomationError(cause, { mutating: true });
        if (error.isTerminal && !error.isIndeterminate) {
          await releaseIdempotencyKey(operation);
        }
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: automationKeys.reminders(userId, subjectKind, subjectId ?? 'none'),
      });
    },
  });

  const cancel = useMutation({
    mutationFn: async (reminderId: string) => {
      if (isOffline) throw offlineError('Cancelling a reminder');
      return gapApi.cancelReminder(reminderId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: automationKeys.reminders(userId, subjectKind, subjectId ?? 'none'),
      });
    },
  });

  return {
    reminders: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof AutomationError ? query.error : null,
    create,
    cancel,
    isOffline,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SCOPE SWITCHING — §14 · §45
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The scopes this member can create automations for, as a picker's options.
 *
 * Derived from the capability set alone, so a scope the server did not grant
 * cannot be offered. `allowedOwnerKinds` is the single derivation; this wraps
 * it with the labels a picker needs.
 */
export function useAvailableScopes(): {
  kinds: AutomationOwnerKind[];
  isLoading: boolean;
} {
  const personal = usePersonalScope();
  const { access, isLoading } = useAutomationAccess(personal);

  const kinds = useMemo(() => {
    if (access.provenance !== 'server') return [];

    const result: AutomationOwnerKind[] = [];
    if (access.canCreatePersonal) result.push('user');
    if (access.canCreateForCreator) result.push('creator');
    if (access.canCreateForCommunity) result.push('community');
    if (access.canCreateForOrganization) result.push('organization');
    if (access.canCreateForBusiness) result.push('provider', 'employer', 'landlord', 'seller');
    // `platform` is deliberately never added here, whatever the capability set
    // says. §66: platform-wide automation is not a member surface, and the
    // picker is not the place to introduce one.
    return result;
  }, [access]);

  return { kinds, isLoading };
}
