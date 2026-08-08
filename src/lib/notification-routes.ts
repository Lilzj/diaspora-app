// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Notification deep links (Frontend Phase 5)
//
// B13 sends a `targetRoute` with every notification, and B15's billing
// templates point five of them at the wallet surface this phase built:
//
//   billing.payment.failed · billing.refund.issued  → /wallet/payments/{id}
//   billing.subscription.activated · .ended         → /wallet/subscription
//   billing.placement.activated · .ended            → /wallet/placements/{id}
//   billing.donation.receipt · .contribution.receipt→ /wallet/receipts/{ref}
//   billing.wallet.status                           → /wallet
//
// Those names were declared by the backend before the screens existed —
// PSR-1.1 called them "the names the backend already emits" — and the route
// tree was built to match, so they resolve without translation.
//
// What this module adds is the **refusal**. A route the app does not have must
// not be pushed: expo-router throws on an unknown path, and a notification is
// exactly the place a stale or future route arrives, because a deployment can
// be ahead of the app in the store. PSR-1.1 states the required behaviour:
// *"A notification whose route the client cannot resolve falls back to the
// inbox, which is the correct degradation."*
// ─────────────────────────────────────────────────────────────────────────────

import { router } from 'expo-router';

/**
 * Route prefixes this build can actually render.
 *
 * Matched as prefixes rather than exact paths so `/wallet/payments/{anything}`
 * resolves without listing every identifier. A route matching none of these is
 * refused rather than attempted.
 */
const KNOWN_PREFIXES = [
  '/wallet',
  // Phase 6's business surface. B15's billing templates still point at
  // `/wallet/*` and those routes still resolve; this prefix is here so a future
  // monetization notification — a campaign approved, a promotion expiring —
  // resolves rather than falling back to the inbox.
  '/monetization',
  // Phase 7's creator surface. B13 emits no `creator.*` template yet —
  // CREATOR-GAP-015 asks for them — but the route tree is ready, so the day a
  // deployment starts sending "your milestone is claimable" it resolves here
  // rather than falling back to the inbox.
  '/creator',
  '/notifications',
  '/profile',
  '/settings',
  '/marketplace',
  '/housing',
  '/job',
  '/guide',
  '/update',
  '/community-life',
  // Frontend Phase 13's community tree. §53's deep links are
  // `/community/{slug}` and `/community/{slug}/{section}`, and the `[slug]`
  // layout restores the community context on arrival — so a notification that
  // lands here brings its community with it, which is what §48 and §53 jointly
  // require. Distinct from `/community-life` above, which is Phase 12's
  // organizations and events; the two are different domains sharing a word.
  '/community',
  '/conversation',
  '/provider',
  '/contributor',
  '/verification',
  '/explore',
  '/saved',
  '/country',
  '/neighborhood',
  '/employer',
  '/moderation',
] as const;

/** Whether this build can render the route the server sent. */
export function isResolvableRoute(route: string | undefined | null): boolean {
  if (!route || typeof route !== 'string') return false;
  if (!route.startsWith('/')) return false;

  return KNOWN_PREFIXES.some(
    (prefix) => route === prefix || route.startsWith(`${prefix}/`)
  );
}

/**
 * Follows a notification, or falls back to the inbox.
 *
 * Returns whether it navigated, so a caller can decide what to tell somebody
 * whose notification went nowhere — usually nothing, because staying on the
 * inbox with the notification marked read is a reasonable outcome.
 */
export function followNotificationRoute(route: string | undefined | null): boolean {
  if (!isResolvableRoute(route)) return false;

  try {
    router.push(route as never);
    return true;
  } catch {
    // A route that passed the prefix check and still failed to resolve is a
    // route this build genuinely cannot render. Swallowing it is correct: a
    // crash from tapping a notification is far worse than a tap that does
    // nothing.
    return false;
  }
}

/**
 * Whether a notification belongs to the financial surface.
 *
 * `billing` is B15's category, seeded by B13 and routed to by
 * `FinancialNotificationRuleContributor`. Used to decide whether a completed
 * financial operation should invalidate the wallet's cached data.
 */
export function isFinancialNotification(categoryKey: string | undefined | null): boolean {
  return categoryKey === 'billing';
}

// ─────────────────────────────────────────────────────────────────────────────
// Community Life — Frontend Phase 12
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Phase 12 notification types, mapped to the screens that render them.
 *
 * **B13 emits none of these yet.** COMMUNITY-LIFE-GAP-019 asks for the sixteen
 * templates and their payload contracts; this table is the client half, written
 * now so that the day a deployment starts sending "your membership was
 * approved" it resolves to the membership screen rather than falling back to
 * the inbox.
 *
 * Nothing here delivers a notification. §36 is explicit — delivery is B13's and
 * this phase adds no infrastructure for it — and this is a routing table, which
 * is the part the client owns.
 *
 * The subject identifier comes from the notification's payload. A type whose
 * payload is missing its identifier falls back to the list screen rather than
 * building a broken path, because a deep link to `/campaign/undefined` is worse
 * than a deep link to the campaign list.
 */
const COMMUNITY_ROUTES: Record<string, (subjectId?: string | null) => string> = {
  'membership.approved': (id) => (id ? `/community-life/membership/manage?membershipId=${id}` : '/community-life/memberships'),
  'membership.rejected': (id) => (id ? `/community-life/membership/manage?membershipId=${id}` : '/community-life/memberships'),
  'membership.renewal.due': (id) => (id ? `/community-life/membership/manage?membershipId=${id}` : '/community-life/memberships'),
  'membership.expired': (id) => (id ? `/community-life/membership/manage?membershipId=${id}` : '/community-life/memberships'),

  'event.reminder': (id) => (id ? `/community-life/event/${id}` : '/community-life'),
  'event.series.reminder': (id) => (id ? `/community-life/occurrence/${id}` : '/community-life/series'),
  'event.occurrence.cancelled': (id) => (id ? `/community-life/occurrence/${id}` : '/community-life/series'),

  'donation.receipt': (id) => (id ? `/wallet/receipts/${id}` : '/wallet/giving'),
  'campaign.update': (id) => (id ? `/community-life/campaign/${id}` : '/community-life/campaign'),
  'campaign.milestone': (id) => (id ? `/community-life/campaign/${id}` : '/community-life/campaign'),

  'volunteer.application.decided': () => '/community-life/volunteer/dashboard',
  'volunteer.assignment.created': () => '/community-life/volunteer/dashboard',

  'poll.closing': (id) => (id ? `/community-life/poll/${id}` : '/community-life/poll'),
  'poll.result': (id) => (id ? `/community-life/poll/${id}` : '/community-life/poll'),

  'organization.announcement': (id) =>
    id ? `/community-life/announcements?scope=Organization&scopeId=${id}` : '/community-life/announcements',
  'neighborhood.event': (id) =>
    id ? `/community-life/neighborhood?neighborhoodId=${id}` : '/community-life/neighborhood',
};

/**
 * The route for a Phase 12 notification, or null if it is not one.
 *
 * A notification that carries its own `targetRoute` always wins — the server
 * knows where it wants somebody to land, and this table is the fallback for the
 * types whose templates have not been written yet.
 */
export function communityNotificationRoute(
  notificationType: string | undefined | null,
  subjectId?: string | null
): string | null {
  if (!notificationType) return null;
  const resolve = COMMUNITY_ROUTES[notificationType];
  return resolve ? resolve(subjectId) : null;
}

/**
 * Whether a notification belongs to the Community Life surface.
 *
 * Used to decide whether a push should invalidate the community caches — the
 * same job `isFinancialNotification` does for the wallet.
 */
export function isCommunityNotification(
  categoryKey: string | undefined | null,
  notificationType?: string | undefined | null
): boolean {
  if (categoryKey === 'community') return true;
  return Boolean(notificationType && notificationType in COMMUNITY_ROUTES);
}

/** Every Phase 12 notification type this build can route. For the gap register. */
export const COMMUNITY_NOTIFICATION_TYPES = Object.keys(COMMUNITY_ROUTES);

// ═════════════════════════════════════════════════════════════════════════════
// MULTI-COMMUNITY — Frontend Phase 13, §48, §53
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Where a multi-community notification lands.
 *
 * Keyed on notification type, exactly as the Phase 12 table above is, and used
 * the same way: a notification that carries its own `targetRoute` always wins,
 * because the server knows where it wants somebody to land. This is the fallback
 * for the types whose templates do not exist yet — GAP-012 and GAP-013 both ask
 * for them.
 *
 * The route takes a **slug**, not an id, because §53's links are readable and the
 * community repository resolves either. A type whose subject is missing falls
 * back to the directory rather than to a broken path.
 */
const MULTI_COMMUNITY_ROUTES: Record<string, (slug?: string | null) => string> = {
  'community.membership.approved': (slug) => (slug ? `/community/${slug}` : '/community'),
  'community.membership.declined': (slug) => (slug ? `/community/${slug}` : '/community'),
  'community.membership.revoked': (slug) => (slug ? `/community/${slug}` : '/community'),
  'community.role.granted': (slug) => (slug ? `/community/${slug}` : '/community'),
  'community.role.revoked': (slug) => (slug ? `/community/${slug}` : '/community'),
  'community.notice.published': (slug) => (slug ? `/community/${slug}/rules` : '/community'),
  'community.report.created': (slug) =>
    slug ? `/community/${slug}/moderation` : '/community',
  'community.status.changed': (slug) => (slug ? `/community/${slug}` : '/community'),
  'community.initiative.updated': (slug) =>
    slug ? `/community/${slug}/initiatives` : '/community',
  'community.suggested': () => '/community',
};

/**
 * The route for a multi-community notification, or null if it is not one.
 *
 * Deliberately separate from `communityNotificationRoute` above rather than merged
 * into it: that function serves Phase 12's organizations and events, this one
 * serves Phase 13's communities, and a single table would make the two domains
 * look like one. Passing a Phase 12 type here returns null, and vice versa.
 */
export function multiCommunityNotificationRoute(
  notificationType: string | undefined | null,
  communitySlug?: string | null
): string | null {
  if (!notificationType) return null;
  const resolve = MULTI_COMMUNITY_ROUTES[notificationType];
  return resolve ? resolve(communitySlug) : null;
}

/**
 * Whether a notification belongs to the multi-community surface.
 *
 * Used to decide whether a push should invalidate the community caches — the same
 * job `isFinancialNotification` does for the wallet and `isCommunityNotification`
 * does for Community Life. The three are separate because they invalidate
 * different things.
 */
export function isMultiCommunityNotification(
  categoryKey: string | undefined | null,
  notificationType?: string | undefined | null
): boolean {
  if (categoryKey === 'communities') return true;
  return Boolean(notificationType && notificationType in MULTI_COMMUNITY_ROUTES);
}

/** Every Phase 13 notification type this build can route. For the gap register. */
export const MULTI_COMMUNITY_NOTIFICATION_TYPES = Object.keys(MULTI_COMMUNITY_ROUTES);
