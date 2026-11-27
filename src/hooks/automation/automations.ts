// Automation hooks: automations. ./index.ts is the overview of the whole module.

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as automationApi from '@/lib/automation/certified-client';
import { useConnectivityStore } from '@/lib/platform/connectivity';
import { presencePorts, usePresence } from '@/hooks/presence';
import { releasePresenceIfUnused } from '@/lib/automation/arrival-presence';
import { acquireIdempotencyKey, releaseIdempotencyKey } from '@/lib/domain/idempotency';
import { automationKeys, scopeTokenFor } from '@/lib/automation/query-keys';
import {
  AutomationError,
  offlineError,
  shouldRetryAutomation,
  toAutomationError,
} from '@/lib/automation/errors';
import { actionsToken } from '@/lib/automation/actions';
import {
  buildPreview,
  presentServerOutcomes,
  type DependencyContext,
} from '@/lib/automation/dependencies';
import { localTestMayStandIn, simulate, type SimulationContext } from '@/lib/automation/simulation';
import {
  trackAutomationCreated,
  trackAutomationEvent,
  trackGapEncountered,
} from '@/lib/automation/events';
import {
  type AutomationAudience,
  type AutomationConditionOutcome,
  type AutomationDefinition,
  type AutomationDraft,
  type AutomationListFilters,
  type AutomationPreview,
  type AutomationScope,
  type AutomationSimulation,
  DEFAULT_AUTOMATION_FILTERS,
} from '@/types/automation';
import { useMemberId } from './shared';
import { useAutomationAccess, useAutomationCatalog, useAutomationSupport } from './catalog';

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
    queryFn: ({ pageParam }) => automationApi.listAutomations(scope, filters, pageParam),
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
    queryFn: () => automationApi.fetchAutomation(automationId!),
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
        const created = await automationApi.createAutomation(draft, idempotencyKey);

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
      return automationApi.updateAutomation(input.automationId, input.changes, input.expectedUpdatedAt);
    },
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: async (input: {
      automationId: string;
      status: 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'DRAFT';
    }) => {
      if (isOffline) throw offlineError('Changing an automation');

      const result = await automationApi.setAutomationStatus(input.automationId, input.status);

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
      const result = await automationApi.deleteAutomation(automationId);
      trackAutomationEvent('automation.deleted');
      return result;
    },
    onSuccess: () => {
      invalidate();
      // Presence is on while an arrival automation uses it, so the last one's
      // deletion switches it off (UAT, 3 Nov 2026, item 5). A list it cannot
      // read in full leaves it on.
      void releasePresenceIfUnused(presencePorts(queryClient), async () => {
        const page = await automationApi.listAutomations(
          scope,
          { ...DEFAULT_AUTOMATION_FILTERS, domain: 'location' },
          null
        );
        return { items: page.items, hasMore: page.nextCursor !== null };
      });
    },
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
    queryFn: () => automationApi.fetchAudience(scope, actionKeys),
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

  // Phase 5. What the deployment says it can do, so the preview card stops
  // telling a member that a working action "cannot be done automatically yet".
  const { lookup: servedSupport } = useAutomationCatalog();

  // "Location while the app is open", for `location.enteredArea`. Undefined
  // until the server answers.
  const { presence } = usePresence();
  const presenceEnabled = presence ? presence.enabled : undefined;

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
      servedSupport,
      hasScheduler: support?.hasScheduler ?? false,
      presenceEnabled,
    }),
    [access, support, isOffline, servedSupport, presenceEnabled]
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
 * The simulation is built on the client by `lib/automation/simulation.ts`, which
 * imports nothing that could dispatch — the safety property is structural rather
 * than a flag — and a failure to reach the platform is **not** a failure of the
 * test. A member should be able to test an automation while offline.
 *
 * ── What changed, and why the old shape hid a defect ────────────────────────
 *
 * This used to call `simulateAutomation` and throw the whole response away,
 * keeping only whether it threw. The comment said the adapter "is asked only for
 * the audience, which is the one part a client genuinely cannot know" — and the
 * audience was not read from it either; it came from `useDependencyContext` on a
 * different call. So the platform's verdicts were discarded unread.
 *
 * That mattered, because the platform's verdicts were wrong: `SampleSubjectId`
 * was never sent, so every condition came back "this trigger does not carry the
 * information the check needs" for triggers that carry it perfectly well. Two
 * defects that cancelled — a wrong answer, discarded — and neither was visible
 * from either side.
 *
 * Now the subject goes out and the verdicts come back. **The platform's
 * conditions replace the local ones only when it actually evaluated against a
 * subject**, because that is the only case where it knows more than the phone
 * does; without one, the local wording is the honest one and is kept.
 */
export function useAutomationSimulation(scope: AutomationScope) {
  const context = useDependencyContext(scope);

  return useMutation({
    mutationFn: async (
      input: AutomationDraft | { draft: AutomationDraft; sampleSubjectId?: string | null }
    ): Promise<AutomationSimulation> => {
      const draft = 'draft' in input ? input.draft : input;
      const sampleSubjectId = 'draft' in input ? (input.sampleSubjectId ?? null) : null;

      let serverEvaluated = false;
      let serverConditions: AutomationConditionOutcome[] | null = null;

      try {
        const result = await automationApi.simulateAutomation(draft, sampleSubjectId);
        serverEvaluated = true;

        // Only with a subject. Without one the platform has nothing the phone
        // lacks, and its "not tested, there was no real subject" is the same
        // fact the local simulation states in better words.
        if (sampleSubjectId && result.run.conditionOutcomes.length > 0) {
          serverConditions = presentServerOutcomes(draft.conditions, result.run.conditionOutcomes);
        }
      } catch (cause) {
        // Not swallowed any more — see `localTestMayStandIn`. Every test the
        // builder sent before 11 Sep 2026 was refused at model binding, and this
        // catch showed a result for each one.
        const failure = toAutomationError(cause);

        if (!localTestMayStandIn(failure, sampleSubjectId)) {
          throw failure;
        }

        serverEvaluated = false;
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

      if (!serverConditions) {
        return result;
      }

      // The run's own status follows the conditions: a rule whose condition the
      // platform says did not match did not reach its actions, and a test
      // result showing "would run" underneath a failed check is the disagreement
      // the platform's own simulate response still ships — `wouldHaveDone` is
      // built from the draft's actions whatever the run did.
      const blocked = serverConditions.some((outcome) => !outcome.matched);

      return {
        ...result,
        run: {
          ...result.run,
          conditionOutcomes: serverConditions,
          status: blocked ? 'SKIPPED' : result.run.status,
          failureMessage: blocked
            ? (serverConditions.find((outcome) => !outcome.matched)?.explanation ?? null)
            : result.run.failureMessage,
        },
        wouldHaveDone: blocked ? [] : result.wouldHaveDone,
      };
    },
  });
}

/**
 * What a trigger would be checked against, for one subject — Phase 5.
 *
 * **Disabled without a subject on purpose.** The route answers without one and
 * says "choose an event to see what this would be checked against", which is a
 * fine sentence for a screen that has already asked. Here the screen has not
 * asked yet, and a request whose only possible answer is a prompt the screen
 * could write itself is a round trip for nothing.
 */
export function useTriggerContext(
  triggerKey: string | undefined,
  subjectId: string | null
): {
  context: automationApi.AutomationTriggerContext | null;
  isLoading: boolean;
} {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: automationKeys.triggerContext(userId, triggerKey ?? '', subjectId),
    queryFn: () => automationApi.fetchTriggerContext(triggerKey as string, subjectId),
    enabled: Boolean(triggerKey) && Boolean(subjectId),
    retry: shouldRetryAutomation,
    staleTime: 60 * 1000,
  });

  return { context: query.data ?? null, isLoading: query.isLoading };
}
