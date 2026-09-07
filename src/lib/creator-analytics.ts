// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator UX instrumentation (Frontend Phase 7)
//
// §40 asks for creator events to be instrumented "using existing analytics
// infrastructure". There is none. Searching the codebase for an analytics
// client, a provider, a tracking call or an ingestion route returns nothing —
// that absence is registered as CREATOR-GAP-016 rather than papered over by
// adding a third-party SDK, which would be a product and privacy decision this
// phase has no mandate to make.
//
// So this module is the *whole* instrumentation surface, and it is real code
// with one deliberate hole in it: `deliver()` has nowhere to send events. That
// hole is one function, it is documented, and it is the only thing that changes
// when the platform grows a destination.
//
// What is genuinely enforced here, today, and covered by tests:
//
//   **A closed event vocabulary.** `CreatorEvent` is a union of literals. A
//   typo is a compile error, and a call site cannot invent an event name — so
//   the schema a backend eventually implements is the one in this file rather
//   than whatever accumulated across forty screens.
//
//   **A property allow-list, applied at emit.** §40 forbids sending payment
//   credentials, private information, sensitive identity data and raw financial
//   secrets. `sanitise()` drops every key not on `ALLOWED_PROPERTIES` rather
//   than trying to spot bad ones, because a deny-list is a list of the mistakes
//   somebody has already thought of. Amounts are reduced to a currency and an
//   order of magnitude; identifiers that name a person never pass at all.
//
//   **Failure is silent.** Instrumentation never breaks a user action and never
//   surfaces an error. A creator claiming a milestone does not care that a
//   telemetry buffer is full.
// ─────────────────────────────────────────────────────────────────────────────

import type { Money } from '@/types/financial';

/**
 * Every creator event this phase emits.
 *
 * The list is §40's, extended only where a screen genuinely needed a distinct
 * name — `creator.verification.resubmitted` is not the same signal as
 * `creator.verification.submitted`, and collapsing them would lose the one
 * number a reviewer would actually want.
 */
export type CreatorEvent =
  // Dashboard and profile
  | 'creator.dashboard.viewed'
  | 'creator.profile.viewed'
  | 'creator.profile.updated'
  | 'creator.quick_action.tapped'
  // Verification
  | 'creator.verification.viewed'
  | 'creator.verification.started'
  | 'creator.verification.submitted'
  | 'creator.verification.resubmitted'
  | 'creator.verification.appealed'
  // Rewards and points
  | 'creator.rewards.viewed'
  | 'creator.reward.viewed'
  | 'creator.reward.redeemed'
  | 'creator.points.rules_viewed'
  | 'creator.points.conversion_started'
  // Milestones
  | 'creator.milestones.viewed'
  | 'creator.milestone.viewed'
  | 'creator.milestone.claimed'
  // Challenges
  | 'creator.challenges.viewed'
  | 'creator.challenge.viewed'
  | 'creator.challenge.started'
  | 'creator.challenge.completed'
  | 'creator.challenge.leaderboard_viewed'
  // Academy
  | 'creator.academy.viewed'
  | 'creator.course.viewed'
  | 'creator.course.started'
  | 'creator.course.saved'
  | 'creator.course.completed'
  | 'creator.lesson.viewed'
  | 'creator.lesson.completed'
  | 'creator.quiz.submitted'
  | 'creator.certificate.viewed'
  // Analytics
  | 'creator.analytics.viewed'
  | 'creator.analytics.period_changed'
  | 'creator.analytics.content_viewed'
  // Revenue
  | 'creator.revenue.viewed'
  | 'creator.revenue.source_viewed'
  | 'creator.revenue.subject_opened'
  | 'creator.revenue.wallet_opened'
  // Referrals
  | 'creator.referral.viewed'
  | 'creator.referral.shared'
  | 'creator.referral.code_copied'
  | 'creator.referral.converted'
  // Sign-up bonus
  | 'creator.signup_bonus.viewed'
  | 'creator.signup_bonus.acknowledged'
  // Grants
  | 'creator.grants.viewed'
  | 'creator.grant.viewed'
  | 'creator.grant.application_started'
  | 'creator.grant.application_submitted'
  | 'creator.grant.application_withdrawn'
  // Sponsored content
  | 'creator.sponsored.viewed'
  | 'creator.sponsored.started'
  | 'creator.sponsored.package_selected'
  | 'creator.sponsored.purchased'
  // Discovery
  | 'creator.directory.viewed'
  | 'creator.directory.searched'
  | 'creator.leaderboard.viewed'
  // Recommendations
  | 'creator.recommendation.shown'
  | 'creator.recommendation.tapped'
  | 'creator.recommendation.dismissed';

/**
 * The only property keys that may leave the device.
 *
 * An allow-list, not a deny-list. Everything here is either a platform
 * identifier for a *thing* (a course, a challenge, a grant) or a low-cardinality
 * label. Note what is deliberately absent and cannot be added by a call site:
 * no `userId`, no `email`, no `handle`, no `displayName`, no `amount`, no
 * `balance`, no `paymentIntentId`, no `code` (a referral code identifies a
 * person), no document reference, no free text.
 */
const ALLOWED_PROPERTIES = new Set<string>([
  // What was acted on. Platform identifiers for content, never for people.
  'courseId',
  'lessonId',
  'quizId',
  'challengeId',
  'grantId',
  'milestoneId',
  'rewardId',
  'contentId',
  'productCode',
  'recommendationId',
  'placementId',
  // Low-cardinality categorisation.
  'contentType',
  'category',
  'section',
  'level',
  'kind',
  'source',
  'surface',
  'scope',
  'period',
  'state',
  'status',
  'result',
  'reason',
  'method',
  // Shape, not value. See `bucketAmount`.
  'currency',
  'amountBucket',
  'pointsBucket',
  // Booleans and small counts that describe the interaction.
  'isSimulated',
  'position',
  'stepIndex',
  'stepCount',
  'passed',
  'correctCount',
  'totalCount',
  'resultCount',
  'hasQuery',
  'filterCount',
]);

/**
 * Lets a later phase widen the allow-list.
 *
 * Phase 12 instruments membership, giving, volunteering and polls, and those
 * events carry identifiers this list has never heard of — `campaignId`,
 * `pollId`, `opportunityId`. The alternatives were both worse than an
 * extension point: a second `sanitise()` somewhere else would mean the privacy
 * rule is written twice and can drift, and pre-listing another phase's keys
 * here would mean this file knows about phases that had not been designed.
 *
 * Keys are *added* and never removed, so no caller can widen the surface by
 * clearing it. The bar for adding one is unchanged and is stated above: it must
 * carry no personal, financial or identity data.
 */
export function registerAllowedProperties(keys: readonly string[]): void {
  for (const key of keys) ALLOWED_PROPERTIES.add(key);
}

export type EventProperties = Record<string, unknown>;

export interface CreatorAnalyticsRecord {
  /**
   * Widened from `CreatorEvent` so the one buffer serves every phase.
   *
   * Creator call sites still go through `trackCreatorEvent`, which keeps the
   * closed union and so still turns a typo into a compile error. Other phases
   * bring their own closed union and emit through `trackPlatformEvent`.
   */
  event: CreatorEvent | (string & {});
  properties: EventProperties;
  /** ISO. Set at emit so a buffered event keeps the time it happened. */
  occurredAt: string;
}

/** How many records the buffer holds before it starts dropping the oldest. */
const BUFFER_LIMIT = 200;

const buffer: CreatorAnalyticsRecord[] = [];

/**
 * A scalar safe to send: a string, a finite number, or a boolean.
 *
 * Objects and arrays are refused outright rather than serialised. A nested
 * object is the usual way a whole DTO — with an email address in it — ends up
 * in a telemetry payload, and there is no creator event that needs one.
 */
function isSafeScalar(value: unknown): value is string | number | boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 64;
  return false;
}

/**
 * Applies the allow-list.
 *
 * Silent about what it dropped, in production terms — but returns the dropped
 * keys so the development transport can warn, which is how a call site learns
 * it tried to send something it should not have. Warning loudly in development
 * and dropping quietly in release is the right way round: the mistake gets
 * caught by the person writing it, not by a member's privacy.
 */
export function sanitise(properties: EventProperties | undefined): {
  safe: EventProperties;
  dropped: string[];
} {
  const safe: EventProperties = {};
  const dropped: string[] = [];

  if (!properties) return { safe, dropped };

  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null) continue;
    if (!ALLOWED_PROPERTIES.has(key) || !isSafeScalar(value)) {
      dropped.push(key);
      continue;
    }
    safe[key] = value;
  }

  return { safe, dropped };
}

/**
 * Reduces an amount to its currency and an order of magnitude.
 *
 * §40 forbids sending raw financial figures. "A sponsorship in the 10–100 GBP
 * band" answers every product question worth asking — is the cheap package the
 * popular one? — without putting a member's spend in a log. The bucket is
 * derived from `minorUnits`, never from `amount`, for the same reason every
 * other calculation in this app is.
 */
export function bucketAmount(value: Money | null | undefined): {
  currency: string;
  amountBucket: string;
} | null {
  if (!value) return null;

  const major = value.minorUnits / 10 ** value.exponent;
  const magnitude = Math.abs(major);

  const amountBucket =
    magnitude === 0 ? '0'
      : magnitude < 1 ? '<1'
        : magnitude < 10 ? '1-10'
          : magnitude < 100 ? '10-100'
            : magnitude < 1_000 ? '100-1k'
              : magnitude < 10_000 ? '1k-10k'
                : '10k+';

  return { currency: value.currency, amountBucket };
}

/** The same treatment for a points figure, which is a count and never money. */
export function bucketPoints(points: number | null | undefined): { pointsBucket: string } | null {
  if (typeof points !== 'number' || !Number.isFinite(points)) return null;

  const magnitude = Math.abs(points);
  const pointsBucket =
    magnitude === 0 ? '0'
      : magnitude < 100 ? '<100'
        : magnitude < 500 ? '100-500'
          : magnitude < 1_000 ? '500-1k'
            : magnitude < 5_000 ? '1k-5k'
              : '5k+';

  return { pointsBucket };
}

/**
 * Where an event would go.
 *
 * **This is CREATOR-GAP-016.** There is no ingestion endpoint, so a record is
 * buffered in memory and dropped when the buffer fills. It is not written to
 * disk — an analytics buffer that survives a restart is a file of member
 * behaviour sitting on a device with no retention policy — and it is not sent
 * anywhere.
 *
 * When `POST /api/v1/telemetry/events` exists, this function batches from the
 * buffer and posts. Nothing else in the app changes.
 */
function deliver(record: CreatorAnalyticsRecord): void {
  buffer.push(record);
  if (buffer.length > BUFFER_LIMIT) buffer.shift();
}

/**
 * Emits an event.
 *
 * Never throws, never awaits, never blocks the interaction that produced it.
 * An instrumentation failure that broke a grant submission would be a far worse
 * bug than the missing measurement.
 */
export function trackCreatorEvent(event: CreatorEvent, properties?: EventProperties): void {
  trackPlatformEvent(event, properties);
}

/**
 * The same emit, for a phase that brings its own closed event vocabulary.
 *
 * Deliberately not exported as "track anything you like": every caller is
 * expected to sit behind a typed wrapper of its own — `trackCommunityEvent` is
 * the Phase 12 one — so the vocabulary stays closed at the call site even
 * though this signature is a string. One buffer, one allow-list, one sanitiser,
 * one absent transport to fill in when the platform grows one.
 */
export function trackPlatformEvent(event: string, properties?: EventProperties): void {
  try {
    const { safe, dropped } = sanitise(properties);

    if (dropped.length > 0 && typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        `[analytics] "${event}" dropped ${dropped.length} disallowed ` +
          `${dropped.length === 1 ? 'property' : 'properties'}: ${dropped.join(', ')}. ` +
          'Register the key with registerAllowedProperties() only if it carries ' +
          'no personal, financial or identity data.'
      );
    }

    deliver({ event, properties: safe, occurredAt: new Date().toISOString() });
  } catch {
    // Deliberately empty. See the doc comment: measurement never breaks a flow.
  }
}

/** The buffered records. For tests and for the eventual batching transport. */
export function drainCreatorEvents(): CreatorAnalyticsRecord[] {
  return buffer.splice(0, buffer.length);
}

/** The buffered records without consuming them. For assertions. */
export function peekCreatorEvents(): readonly CreatorAnalyticsRecord[] {
  return buffer;
}

export function resetCreatorEvents(): void {
  buffer.length = 0;
}
