// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Multi-Community instrumentation (Frontend Phase 13, §63)
//
// §63's event list, as a closed union.
//
// This file contains **no buffer, no sanitiser and no transport**. All three
// live in `creator-analytics.ts`, which registered the absence of an ingestion
// endpoint as CREATOR-GAP-016 and which Phases 8 and 12 already extend the same
// way. A second copy would mean the privacy rule is written twice and can drift
// — the one kind of duplication that actually costs somebody something.
//
// ── The rule that shapes this phase's allow-list ─────────────────────────────
//
// §63 ends with "do not record sensitive community membership information
// unnecessarily", and for this phase that sentence carries more weight than it
// does anywhere else in the platform. A member's diaspora community can imply
// their nationality, immigration situation, religion or ethnicity. An analytics
// stream that recorded which communities somebody belongs to would be a
// database of exactly that, assembled from a mobile client, retained by default,
// and readable by whoever can read telemetry.
//
// So the allow-list draws the line at the *thing* versus the *person's
// relationship to the thing*:
//
//   ON the list        `communityId` — which community a screen was about.
//                      `communityCount` — how many were in a selection.
//                      `communityMode` — which of §13's five modes was active.
//                      `associationBasis` — declared, origin, location.
//                      `scopeIsApproximate` — whether the projection stood in.
//
//   NOT on the list    `membershipState`, `roles`, `isPrimary`,
//                      `primaryCommunityId`, `interestedCommunityIds`,
//                      `communityIds`, `communitySlug`, `communityName`,
//                      `userId`, `reporterId`, `moderatorId`, `reportNote`.
//
// The distinction is load-bearing rather than fussy. "Somebody viewed the
// Nigerian community" is a product question. "This person belongs to the
// Nigerian community" is an identity record, and `trackCommunityEvent` has no
// path that can emit one — a property not on the list is dropped before it
// reaches the buffer, by code this file does not own and cannot weaken.
//
// `communitySlug` and `communityName` are excluded for a subtler reason: an id
// is opaque, but a slug or a name is human-readable, and a log line reading
// `community.switched · communitySlug=nigerian` is a membership disclosure in a
// place nobody thought to look for one.
// ─────────────────────────────────────────────────────────────────────────────

import {
  registerAllowedProperties,
  trackPlatformEvent,
  type EventProperties,
} from '@/lib/creator-analytics';
import type { CommunityAssociationBasis, CommunityMode } from '@/types/community-directory';

/**
 * Every multi-community event this phase emits.
 *
 * §63's list, verbatim in coverage, with the names normalised onto the
 * platform's existing `domain.subject.verb` convention so they sort next to the
 * Phase 8 and Phase 12 vocabularies in a dashboard.
 */
export type CommunityDirectoryEvent =
  // Discovery and directory — §63
  | 'community.viewed'
  | 'community.searched'
  | 'community.directory.viewed'
  | 'community.suggestion.viewed'
  // Membership — §63
  | 'community.joined'
  | 'community.left'
  | 'community.followed'
  | 'community.unfollowed'
  | 'community.interest.added'
  | 'community.interest.removed'
  | 'community.primary.changed'
  | 'community.application.submitted'
  | 'community.application.cancelled'
  // Context — §63
  | 'community.switched'
  | 'community.cross_community.enabled'
  | 'community.filter.applied'
  | 'community.mode.changed'
  // Scoped content — §63
  | 'community.content.viewed'
  | 'community.recommendation.viewed'
  | 'community.event.viewed'
  | 'community.guide.viewed'
  | 'community.job.viewed'
  | 'community.marketplace.viewed'
  | 'community.housing.viewed'
  | 'community.provider.viewed'
  | 'community.organization.viewed'
  | 'community.update.viewed'
  // Statistics and comparison — §63
  | 'community.statistics.viewed'
  | 'community.comparison.viewed'
  // Governance — §63
  | 'community.moderator_profile.viewed'
  | 'community.ambassador_profile.viewed'
  | 'community.moderation_queue.viewed'
  | 'community.moderation.decided'
  | 'community.rules.viewed'
  | 'community.notice.viewed'
  | 'community.initiative.viewed'
  // Onboarding and settings — §63
  | 'community.onboarding.started'
  | 'community.onboarding.step.completed'
  | 'community.onboarding.skipped'
  | 'community.onboarding.completed'
  | 'community.preferences.updated'
  | 'community.notification_preferences.updated'
  // Gap surfaces — the register screen, so it is known whether anybody reads it
  | 'community.gap_register.viewed';

/**
 * The property keys Phase 13 adds.
 *
 * Registered at module load, so the extension happens before any screen emits.
 * Every key here names a thing or describes the shape of an interaction. See the
 * header for what is deliberately absent and why it must stay absent.
 */
registerAllowedProperties([
  // The community a screen was about. Opaque, and one at a time.
  'communityId',
  // How many communities a selection covered. A count, never the members.
  'communityCount',
  // Which of §13's five modes. A mode is a UI state, not a membership.
  'communityMode',
  // Whether a badge was a declared fact or a projection (GAP-009).
  'associationBasis',
  // Whether the country projection stood in for a real community filter.
  'scopeIsApproximate',
  // Which content domain a community-scoped view was in — 'guide', 'job', …
  'contentDomain',
  // Which §74 state a surface rendered, so unavailability is measurable.
  'unavailableReason',
  // Onboarding step key. A step name, never an answer.
  'stepKey',
  // Which of the five notification scopes a category was set to.
  'notificationScope',
  // Whether the emitting build could reach the development adapter.
  'isDevelopmentAdapter',
]);

/**
 * Emits a multi-community event.
 *
 * Goes through `trackPlatformEvent`, so the allow-list, the scalar check, the
 * 64-character string cap, the ring buffer and the drop-oldest behaviour are all
 * the platform's existing ones. Failure is silent: a member switching community
 * does not care that a telemetry buffer is full.
 */
export function trackCommunityEvent(
  event: CommunityDirectoryEvent,
  properties?: EventProperties
): void {
  trackPlatformEvent(event, properties);
}

/**
 * The properties describing a scope, for an event that has one.
 *
 * Takes the **count and the mode**, never the ids. A single `communityId` is
 * permitted where a screen is genuinely about one community — `community.viewed`
 * — and this helper deliberately does not accept a list, so there is no
 * ergonomic path to emitting a member's whole community set.
 */
export function scopeProperties(input: {
  mode: CommunityMode;
  communityCount: number;
  isApproximate?: boolean;
}): EventProperties {
  return {
    communityMode: input.mode,
    communityCount: input.communityCount,
    scopeIsApproximate: input.isApproximate ?? false,
  };
}

/**
 * The properties describing one community badge.
 *
 * `associationBasis` is here because it is the number worth having from this
 * phase: if most community badges in the wild are `origin` rather than
 * `declared`, GAP-009 is more urgent than the register says.
 */
export function associationProperties(input: {
  communityId?: string | null;
  basis: CommunityAssociationBasis;
  contentDomain?: string;
}): EventProperties {
  return {
    communityId: input.communityId ?? undefined,
    associationBasis: input.basis,
    contentDomain: input.contentDomain,
  };
}
