// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration query keys (Frontend Phase 16, §42 · §43 · §47)
//
// Every integration cache key in the application is built here. §43 asks for a
// *proof* that one member's integration state cannot appear for another, and a
// proof needs one place to reason about — a dozen screens each assembling an
// array literal is a property nobody can establish.
//
// ── The rule, and why it differs from Phase 15's ─────────────────────────────
//
// **Every key carries the member it belongs to.**
//
// Phase 15's analytics keys deliberately do *not* carry a member id: an
// analytics subject is a community or a creator, the subject id is already in
// the key, and adding a viewer id would fragment a cache that two administrators
// of one community should share.
//
// Integration state is the opposite case. Every entry here is *about the
// signed-in member* — their Google connection, their devices, their email
// verification, their saved payment methods — and none of it has a subject id
// of its own. A key of `['integrations','connections']` is one slot that two
// members share, and on a shared phone the second member reads the first
// member's connected accounts out of the cache before the first refetch lands.
//
// That is §43's exact scenario, and it is not hypothetical: TanStack Query
// serves cached data synchronously on mount, so the wrong data renders *first*
// and is corrected a moment later — which is worse than a spinner, because the
// member reads it.
//
// Clearing the cache on sign-out is also done (`store/auth.ts`), and is not
// sufficient on its own: a failed clear, a race, or a second query client would
// each defeat it. Keying on the member means the wrong entry cannot be found
// even if it is still there.
// ─────────────────────────────────────────────────────────────────────────────

import type { IntegrationDomain, IntegrationProviderId } from '@/types/integrations';

/**
 * The member fragment.
 *
 * `anonymous` for a signed-out reader, which is a real state — the government
 * surface is readable without an account — and is deliberately a literal rather
 * than `undefined`, so a cache dump distinguishes "nobody is signed in" from "a
 * bug dropped the id".
 */
export function memberToken(userId: string | null | undefined): string {
  return userId && userId.length > 0 ? userId : 'anonymous';
}

export const integrationKeys = {
  all: (userId: string | null) => ['integrations', memberToken(userId)] as const,

  connections: (userId: string | null) =>
    ['integrations', memberToken(userId), 'connections'] as const,

  connection: (userId: string | null, provider: IntegrationProviderId) =>
    ['integrations', memberToken(userId), 'connections', provider] as const,

  /** The merged catalogue + live state the connection centre renders. */
  overview: (userId: string | null) =>
    ['integrations', memberToken(userId), 'overview'] as const,

  domain: (userId: string | null, domain: IntegrationDomain) =>
    ['integrations', memberToken(userId), 'domain', domain] as const,

  calendars: (userId: string | null) =>
    ['integrations', memberToken(userId), 'calendar', 'list'] as const,

  calendarSettings: (userId: string | null) =>
    ['integrations', memberToken(userId), 'calendar', 'settings'] as const,

  calendarSync: (userId: string | null, provider: IntegrationProviderId) =>
    ['integrations', memberToken(userId), 'calendar', 'sync', provider] as const,


  email: (userId: string | null) => ['integrations', memberToken(userId), 'email'] as const,

  pushDevices: (userId: string | null) =>
    ['integrations', memberToken(userId), 'push', 'devices'] as const,

  pushPermission: (userId: string | null) =>
    ['integrations', memberToken(userId), 'push', 'permission'] as const,

  paymentMethods: (userId: string | null) =>
    ['integrations', memberToken(userId), 'payments', 'methods'] as const,
};
