// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life instrumentation (Frontend Phase 12)
//
// §48's event list, as a closed union.
//
// This file deliberately contains **no buffer, no sanitiser and no transport**.
// All three already exist in `creator-analytics.ts`, which registered the
// absence of an ingestion endpoint as CREATOR-GAP-016, and a second copy would
// mean the privacy rule is written twice and can drift — which is the one kind
// of duplication that actually costs somebody something. What this module adds
// is the Phase 12 vocabulary and the extra property keys those events need.
//
// The rules inherited from that module, restated because they are the reason
// this is safe:
//
//   **A closed vocabulary.** `CommunityEvent` is a union of literals, so a typo
//   is a compile error and no screen can invent an event name.
//
//   **An allow-list applied at emit.** Any property not registered is dropped
//   before it reaches the buffer. §48 forbids capturing payment credentials,
//   private donor information, sensitive identity data and authentication
//   secrets, and a deny-list would only cover the mistakes somebody had already
//   thought of.
//
//   **Failure is silent.** A member voting in a poll does not care that a
//   telemetry buffer is full.
//
// One rule is specific to this phase, and it is the important one:
//
//   **Nothing that identifies a donor, a member or a volunteer is emitted.**
//   Not a `userId`, not a `donorName`, not a membership identifier that resolves
//   to a person, not a free-text donation message, not a poll answer. §48 and
//   §45 both forbid it, and the allow-list below is the enforcement rather than
//   the intention: `campaignId` is on it, `donationId` is not.
// ─────────────────────────────────────────────────────────────────────────────

import type { Money } from '@/types/financial';
import {
  bucketAmount,
  registerAllowedProperties,
  trackPlatformEvent,
  type EventProperties,
} from './creator-analytics';

/**
 * Every Community Life event this phase emits.
 *
 * §48's list, extended only where a screen genuinely needed a distinct name.
 * `community.membership.payment.failed` is not the same signal as
 * `community.membership.activated`, and collapsing them would lose the one
 * number worth having — how often a paid join falls over at the payment step.
 */
export type CommunityEvent =
  // Hub, search and recommendations — §48
  | 'community.life.viewed'
  | 'community.search.performed'
  | 'community.recommendation.viewed'
  | 'community.recommendation.tapped'
  | 'community.recommendation.dismissed'
  // Membership — §48
  | 'community.membership.viewed'
  | 'community.membership.discovery.viewed'
  | 'community.membership.application.started'
  | 'community.membership.application.submitted'
  | 'community.membership.activated'
  | 'community.membership.payment.started'
  | 'community.membership.payment.failed'
  | 'community.membership.renewal.started'
  | 'community.membership.cancelled'
  // Events and series — §48
  | 'community.recurring_event.viewed'
  | 'community.event_series.viewed'
  | 'community.occurrence.viewed'
  | 'community.event.registered'
  | 'community.event.registration.cancelled'
  | 'community.series.created'
  // Giving — §48
  | 'community.donation.started'
  | 'community.donation.completed'
  | 'community.donation.failed'
  | 'community.fundraiser.viewed'
  | 'community.fundraiser.shared'
  | 'community.campaign.created'
  | 'community.campaign.submitted'
  | 'community.campaign.published'
  // Volunteering — §48
  | 'community.volunteer_opportunity.viewed'
  | 'community.volunteer_application.started'
  | 'community.volunteer_application.submitted'
  | 'community.volunteer_application.withdrawn'
  | 'community.volunteer_opportunity.created'
  | 'community.volunteer_application.decided'
  // Polls — §48
  | 'community.poll.viewed'
  | 'community.poll.voted'
  | 'community.poll.results.viewed'
  | 'community.poll.created'
  | 'community.poll.closed'
  // Organizations and neighbourhood — §48
  | 'community.organization_dashboard.viewed'
  | 'community.organization.section.viewed'
  | 'community.neighborhood_event.viewed'
  | 'community.announcement.viewed'
  | 'community.impact.viewed';

/**
 * The property keys Phase 12 adds.
 *
 * Every one names a *thing* rather than a person, or describes the shape of an
 * interaction. Registered once, at module load, so the extension happens before
 * any screen emits.
 *
 * What is deliberately absent, and must stay absent: `donationId`,
 * `membershipId`, `applicationId`, `receiptReference`, `donorName`, `message`,
 * `answers`, `optionLabel`, `openResponse`. Each of those either identifies a
 * person or carries what they wrote, and §48 forbids both.
 */
registerAllowedProperties([
  // Platform identifiers for things, never for people.
  'organizationId',
  'campaignId',
  'seriesId',
  'occurrenceId',
  'eventId',
  'opportunityId',
  'pollId',
  'tierId',
  'neighborhoodId',
  'announcementId',
  // Low-cardinality categorisation this phase needs.
  'entityType',
  'billingPeriod',
  'votingType',
  'audience',
  'frequency',
  'campaignCategory',
  'cause',
  'gapKey',
  // Shape, not value.
  'optionCount',
  'selectionCount',
  'occurrenceCount',
  'shiftCount',
  'tierCount',
  'isFree',
  'isRecurring',
  'isAnonymous',
  'requiresApproval',
  'hasDeadline',
  'progressBucket',
]);

/**
 * Emits a Community Life event.
 *
 * The typed wrapper is the point: `trackPlatformEvent` takes a string, and every
 * call site in this phase goes through here instead, so the vocabulary stays
 * closed even though the shared emit is not.
 */
export function trackCommunityEvent(event: CommunityEvent, properties?: EventProperties): void {
  trackPlatformEvent(event, properties);
}

/**
 * Reduces a money figure to a currency and an order of magnitude.
 *
 * Re-exported rather than reimplemented. §48 forbids sending raw financial
 * figures; "a donation in the 10–100 GBP band" answers every product question
 * worth asking without putting somebody's giving in a log.
 */
export { bucketAmount };

/**
 * Reduces a campaign's progress to a band.
 *
 * A raw percentage plus a campaign identifier is enough to reconstruct the
 * running total of a real fundraiser from telemetry alone, which is a financial
 * figure by another route. Five bands answer "do campaigns stall near the
 * finish?" and reconstruct nothing.
 */
export function bucketProgress(percentage: number | null | undefined): { progressBucket: string } | null {
  if (typeof percentage !== 'number' || !Number.isFinite(percentage)) return null;

  const clamped = Math.max(0, Math.min(100, percentage));
  const progressBucket =
    clamped === 0 ? '0'
      : clamped < 25 ? '0-25'
        : clamped < 50 ? '25-50'
          : clamped < 75 ? '50-75'
            : clamped < 100 ? '75-100'
              : '100+';

  return { progressBucket };
}

/**
 * The two properties a money-bearing community event may carry.
 *
 * A convenience so a call site writes `...moneyProps(tier.price)` rather than
 * spreading a possibly-null bucket, and so nobody is tempted to send
 * `amount: tier.price.amount` because the safe form was inconvenient.
 */
export function moneyProps(value: Money | null | undefined): EventProperties {
  const bucket = bucketAmount(value);
  return bucket ? { currency: bucket.currency, amountBucket: bucket.amountBucket } : {};
}
