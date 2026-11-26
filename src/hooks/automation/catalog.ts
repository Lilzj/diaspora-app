// Automation hooks: catalog. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as automationApi from '@/lib/automation/certified-client';
import type { PublishedAutomationTemplate } from '@/lib/automation/certified-client';
import {
  fetchCertifiedAutomationSupport,
  type CertifiedAutomationSupport,
} from '@/lib/api/automation-api';
import { automationKeys, scopeTokenFor } from '@/lib/automation/query-keys';
import { servedOwnersLookup, servedSupportLookup } from '@/lib/automation/served-support';
import type { ServedOwnersLookup, ServedSupportLookup } from '@/lib/automation/served-support';
import { shouldRetryAutomation } from '@/lib/automation/errors';
import {
  noAutomationAccess,
  type AutomationAccess,
  type AutomationOwnerKind,
  type AutomationScope,
} from '@/types/automation';
import { useMemberId } from './shared';

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
    queryKey: automationKeys.platformSupport(userId),
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
export function useAutomationAccess(
  scope: AutomationScope,
  options: { enabled?: boolean } = {}
): {
  access: AutomationAccess;
  isLoading: boolean;
} {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: automationKeys.capabilities(userId, scopeTokenFor(scope)),
    queryFn: (): Promise<AutomationAccess> => automationApi.fetchAccess(scope),
    // Five minutes, and always refetched on scope change because the key
    // carries the scope. A stale capability set is the input to what the
    // builder offers, and offering something that 403s is worse than a spinner.
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryAutomation,
    enabled: options.enabled ?? true,
  });

  return {
    access: query.data ?? noAutomationAccess(),
    isLoading: query.isLoading,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SERVER-PUBLISHED TEMPLATES — FRONTEND-PHASE18-GAP-030
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What this deployment can actually run, per trigger / condition / action.
 *
 * `fetchCatalog` has existed, typed and documented, since Wave C-02, and the gap
 * register recorded plainly that it "is still unconsumed". It was in fact called
 * in one place — `automation-api.ts` — and reduced immediately to two booleans
 * (`some(isAvailable)` over triggers and over actions) to answer "does this
 * deployment have an engine at all". The 83 per-part answers were discarded.
 *
 * That discarded detail is the whole disclosure: 59 of those parts were declared
 * not-connected by this build and reported available by the deployment. See
 * `lib/automation/served-support.ts` for the measurement and the end-to-end
 * proof.
 *
 * Thirty minutes, matching `templates`: a vocabulary changes on deployment, not
 * on use.
 */
export function useAutomationCatalog(): {
  lookup: ServedSupportLookup;
  /** Who the deployment serves each part to. See `servedOwnersLookup`. */
  owners: ServedOwnersLookup;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: automationKeys.catalog(),
    queryFn: () => automationApi.fetchCatalog(),
    staleTime: 30 * 60 * 1000,
    retry: shouldRetryAutomation,
  });

  return useMemo(
    // Null until it answers, which yields a lookup that knows nothing — so every
    // badge keeps its declared status rather than flickering through a wrong one.
    () => ({
      lookup: servedSupportLookup(query.data ?? null),
      owners: servedOwnersLookup(query.data ?? null),
      isLoading: query.isLoading,
    }),
    [query.data, query.isLoading]
  );
}

export interface PublishedTemplatesResult {
  /** Ids this deployment publishes and this member may create. Null until it answers. */
  publishedIds: Set<string> | null;
  /** Templates the deployment publishes that this build has no gallery entry for. */
  unknownToThisBuild: PublishedAutomationTemplate[];
  isLoading: boolean;
}

/**
 * What the deployment publishes, read alongside the gallery this build ships.
 *
 * ── Why this narrows nothing ─────────────────────────────────────────────────
 *
 * The obvious use — intersect the served ids with the client catalogue — is
 * wrong, and the route's own contract is what makes it wrong. `/automations/
 * templates` is **filtered to what this member may create**, and the unfiltered
 * catalogue is never served. So a client template id absent from the response is
 * either one the member lacks a capability for or one this deployment does not
 * publish at all, and nothing here can tell those apart. Hiding on the strength
 * of that ambiguity would remove a working template from the gallery every time
 * the deployment's catalogue is smaller than the app's — which it is today: six
 * served against the gallery's eleven.
 *
 * What the response *can* say without guessing is the two things below: which of
 * the gallery's templates this deployment has confirmed, and which of its own
 * this build cannot render. The second is the §31 rule the register states — "the
 * client must ignore any template referencing a trigger or action key this build
 * does not know, rather than rendering a row it cannot open" — and honouring it
 * silently would leave nobody able to see that the deployment is ahead of the
 * app in the store.
 *
 * Not member-scoped in the cache key, matching `automationKeys.templates`: the
 * catalogue is the same for everybody with the same capabilities, and the
 * member-specific filter is applied from the capability set, which is cached
 * separately and is itself member-scoped.
 */
export function useAutomationTemplates(
  ownerKind: AutomationOwnerKind | null,
  knownIds: readonly string[]
): PublishedTemplatesResult {
  const query = useQuery({
    queryKey: automationKeys.templates(ownerKind),
    queryFn: () => automationApi.fetchTemplates(ownerKind ? { ownerKind } : {}),
    // Thirty minutes. A published catalogue changes on deployment, not on use,
    // and the register asks for exactly this.
    staleTime: 30 * 60 * 1000,
    retry: shouldRetryAutomation,
  });

  return useMemo(() => {
    const served = query.data;
    if (!served) {
      return {
        publishedIds: null,
        unknownToThisBuild: [],
        isLoading: query.isLoading,
      };
    }

    const known = new Set(knownIds);
    return {
      publishedIds: new Set(served.map((template) => template.id)),
      unknownToThisBuild: served.filter((template) => !known.has(template.id)),
      // Deliberately no per-template support map here. The deployment does carry
      // one, and copying it onto this build's template of the same id would be a
      // claim about a different automation: the two catalogues share ids without
      // sharing definitions — the deployment's `event-reminder` fires on
      // `event.rsvpConfirmed`, this build's on `event.startingSoon`. Support is
      // resolved per part from `GET /automations/catalog` instead; see
      // `useAutomationCatalog` above.
      isLoading: false,
    };
  }, [query.data, query.isLoading, knownIds]);
}
