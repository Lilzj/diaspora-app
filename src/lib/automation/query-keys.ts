// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation query keys (Frontend Phase 18, §58 · §68)
//
// Every automation cache key in the application is built here. §58 asks for a
// *proof* that one member's automations cannot appear for another — and that
// one community's cannot appear under another, one creator's under another, one
// organization's under another. A proof needs one place to reason about.
//
// ── The rule ────────────────────────────────────────────────────────────────
//
// **Every key carries the member, and every scoped key carries its scope.**
//
// §68 asks for user, scope, automation, date, filters and status in the key.
// The member fragment is the same one Phase 16 established and for the same
// reason: TanStack Query serves cached data synchronously on mount, so on a
// shared device the second member reads the first member's automations out of
// the cache *before* the refetch lands. The wrong data renders first and is
// corrected a moment later, which is worse than a spinner because the member
// reads it.
//
// The scope fragment is what Phase 16 did not need. An integration connection
// belongs to a member and to nobody else. An automation belongs to a member
// *acting in a scope*: the same moderator has personal automations and
// community automations, and the community ones are visible to their
// co-moderators. Two different scopes must be two cache entries, or a moderator
// who switches from Nigeria to Ghana sees Nigeria's automations under Ghana's
// heading — which is §58's exact scenario for communities.
//
// ── Why the scope token is derived, not passed ──────────────────────────────
//
// `scopeToken()` produces a stable string from an owner kind and an owner id,
// so two callers describing the same scope cannot produce two keys. It sorts
// nothing and normalises case, because `Community:NG` and `community:ng` are one
// scope and two strings — and two strings would be two cache entries holding
// identical data, which is the *harmless* failure. The harmful one is the
// reverse, and it cannot happen: two different scopes always produce two
// different tokens because the token contains both components verbatim.
//
// Clearing the cache on sign-out is also done (`store/auth.ts`) and is not
// sufficient on its own: a failed clear, a race, or a second query client would
// each defeat it. Keying on the member and the scope means the wrong entry
// cannot be *found* even if it is still there.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AutomationListFilters,
  AutomationOwnerKind,
  AutomationScope,
} from '@/types/automation';

/**
 * The member fragment.
 *
 * `anonymous` for a signed-out reader — deliberately a literal rather than
 * `undefined`, so a cache dump distinguishes "nobody is signed in" from "a bug
 * dropped the id". Phase 16's convention, unchanged.
 */
export function memberToken(userId: string | null | undefined): string {
  return userId && userId.length > 0 ? userId : 'anonymous';
}

/**
 * A scope, as one stable string.
 *
 * `user:me` for the common case, so the most frequent key is readable in a
 * devtools dump rather than being a bare id.
 */
export function scopeToken(ownerKind: AutomationOwnerKind, ownerId: string | null): string {
  const id = ownerId && ownerId.length > 0 ? ownerId.toLowerCase() : 'me';
  return `${ownerKind}:${id}`;
}

/** The token for a full scope object. */
export function scopeTokenFor(scope: AutomationScope): string {
  return scopeToken(scope.ownerKind, scope.ownerId);
}

/**
 * A filter set, as one stable string.
 *
 * Sorted and normalised so two members of one team who applied the same filters
 * in a different order share a cache entry. `search` is included because a
 * search is a different result set, and lower-cased and trimmed because
 * `"Lagos "` and `"lagos"` are the same query.
 */
export function filterToken(filters: AutomationListFilters): string {
  const parts = [
    `tab=${filters.tab}`,
    `domain=${filters.domain ?? 'any'}`,
    `owner=${filters.ownerKind ?? 'any'}`,
    `community=${filters.communityId ?? 'any'}`,
    `q=${filters.search.trim().toLowerCase()}`,
  ];
  return parts.join('|');
}

export const automationKeys = {
  all: (userId: string | null) => ['automations', memberToken(userId)] as const,

  /** The Automation Center list. §68's user + scope + status + filters. */
  list: (userId: string | null, scope: string, filters: AutomationListFilters) =>
    ['automations', memberToken(userId), 'list', scope, filterToken(filters)] as const,

  detail: (userId: string | null, automationId: string) =>
    ['automations', memberToken(userId), 'detail', automationId] as const,

  /**
   * The capability set.
   *
   * Scoped, because "may I create a community automation" has a different
   * answer per community and one shared entry would carry the last community's
   * answer into the next one's builder.
   */
  capabilities: (userId: string | null, scope: string) =>
    ['automations', memberToken(userId), 'capabilities', scope] as const,

  /** Execution history across automations, or for one. §68's date + status. */
  runs: (
    userId: string | null,
    automationId: string | null,
    status: string | null,
    cursor: string | null
  ) =>
    [
      'automations',
      memberToken(userId),
      'runs',
      automationId ?? 'all',
      status ?? 'any',
      cursor ?? 'first',
    ] as const,

  run: (userId: string | null, runId: string) =>
    ['automations', memberToken(userId), 'run', runId] as const,

  schedule: (userId: string | null, automationId: string) =>
    ['automations', memberToken(userId), 'schedule', automationId] as const,

  audit: (userId: string | null, automationId: string) =>
    ['automations', memberToken(userId), 'audit', automationId] as const,

  savedSearches: (userId: string | null, subject: string | null) =>
    ['automations', memberToken(userId), 'saved-searches', subject ?? 'all'] as const,

  reminders: (userId: string | null, subjectKind: string, subjectId: string) =>
    ['automations', memberToken(userId), 'reminders', subjectKind, subjectId] as const,

  audience: (userId: string | null, scope: string, actionsToken: string) =>
    ['automations', memberToken(userId), 'audience', scope, actionsToken] as const,

  /** Trigger context for a specific subject — an event, a job, a listing. */
  triggerContext: (userId: string | null, triggerKey: string, subjectId: string | null) =>
    [
      'automations',
      memberToken(userId),
      'trigger-context',
      triggerKey,
      subjectId ?? 'none',
    ] as const,

  /**
   * The template catalogue is **not** member-scoped.
   *
   * It is the same for every member with the same capabilities — the
   * member-specific filtering happens on the client from the capability set,
   * which is itself member-scoped and cached separately. Scoping the catalogue
   * per member would mean two members on one device each fetch an identical
   * list, and Phase 16's government keys established that a genuinely shared
   * resource should be keyed on what varies rather than on who asked.
   */
  templates: (ownerKind: AutomationOwnerKind | null) =>
    ['automations', 'templates', ownerKind ?? 'any'] as const,

  /**
   * The deployment's trigger / condition / action vocabulary.
   *
   * Not keyed per member for the same reason as `templates`: the catalogue is a
   * property of the deployment, identical for everybody, and `allowedOwners`
   * travels with each entry rather than filtering the list.
   */
  catalog: () => ['automations', 'catalog'] as const,
};
