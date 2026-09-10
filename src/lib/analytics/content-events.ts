// ─────────────────────────────────────────────────────────────────────────────
// The three events the platform accepts from a client and never received
//
// `content.viewed`, `profile.viewed` and `content.impression` are registered in
// `AnalyticsSchemaSeeder`, marked `AllowsClientSubmission: true`, allow-listed
// in `telemetry-api.ts`, carried by a transport that answers 202 — and no code
// anywhere emitted one. That is why `content.views` and `content.uniqueViewers`
// read `AWAITING_SOURCE` on every analytics surface that asks for them.
//
// ── What the contract actually requires ─────────────────────────────────────
//
// **`contentId` must parse as a GUID.** `RecordTelemetryCommand` does
// `Guid.TryParse` and rejects the event otherwise, and the schema's
// `RequiresContent: true` refuses a null or empty one with `event-malformed`.
// The client's own `refusalFor` only checked for a non-empty *string*, which is
// looser — so a slug or a composite id would have passed locally and been
// refused by the server, where nobody would see it. These helpers check before
// emitting.
//
// **`contentType` is the route-segment vocabulary**, not the community one.
// `AnalyticsContentTypes.FromRouteSegment` maps `guide`, `post`/`update`,
// `event`, `job`, `housing`, `listing`/`marketplace`, `provider` and
// `organization`; anything else silently becomes `Unknown`, which is the worst
// outcome available — accepted, stored, and attributed to nothing. The union
// below is that vocabulary and nothing else.
//
// ── What is deliberately not counted here ───────────────────────────────────
//
// **No throttling, no once-per-session set, no dwell timer.** The server
// deduplicates: `PerActorPerContentPerDay` for a view and an impression,
// `PerActorPerSubjectPerDay` for a profile. One person opening the same guide
// six times is one view, decided by the platform. A client-side guard would be
// a second, disagreeing definition of the same word — and the schema's own
// description calls the daily rule "the published definition of a view rather
// than a storage convenience".
// ─────────────────────────────────────────────────────────────────────────────

import { trackAnalyticsEvent } from './events';

/**
 * The content vocabulary `FromRouteSegment` maps.
 *
 * Deliberately not the client's `ContentType` union, which spells a provider
 * `Provider` and a marketplace item `Marketplace` — those arrive as `Unknown`.
 */
export type TelemetryContentType =
  | 'guide'
  | 'post'
  | 'event'
  | 'job'
  | 'housing'
  | 'marketplace'
  | 'provider'
  | 'organization';

/**
 * Whether an identifier is one the platform will store.
 *
 * Both GUID spellings the platform emits: hyphenated, and the compact form
 * `ContentId.ToString("N")` produces. Anything else is dropped here rather than
 * sent to be refused where no one is looking.
 */
export function isTelemetryContentId(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const trimmed = value.trim();

  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ||
    /^[0-9a-f]{32}$/i.test(trimmed)
  );
}

/**
 * Somebody opened a piece of content.
 *
 * Silently does nothing when the identifier is not a GUID. A screen that
 * navigated on a slug has nothing to report, and an instrumentation call that
 * threw inside a mount effect would be a far worse bug than the missing figure.
 */
export function trackContentViewed(input: {
  contentType: TelemetryContentType;
  contentId: string | undefined | null;
  /** Where it was opened from, when the screen knows. */
  source?: string;
}): void {
  if (!isTelemetryContentId(input.contentId)) return;

  trackAnalyticsEvent('content.viewed', {
    contentType: input.contentType,
    contentId: input.contentId.trim(),
    ...(input.source ? { source: input.source } : {}),
  });
}

/**
 * Somebody opened a member's public profile.
 *
 * The subject rides in `contentId` because the schema sets
 * `RequiresContent: true` and there is no `subjectUserId` on either allow-list.
 * The server's dedup for this one is `PerActorPerSubjectPerDay`.
 */
export function trackProfileViewed(input: {
  userId: string | undefined | null;
  source?: string;
}): void {
  if (!isTelemetryContentId(input.userId)) return;

  trackAnalyticsEvent('profile.viewed', {
    contentId: input.userId.trim(),
    ...(input.source ? { source: input.source } : {}),
  });
}

/**
 * Somebody saw content in a list without opening it.
 *
 * **Accepted and stored, and no metric is served from it yet** — the schema
 * says so outright, because reach is not published. It is wired anyway at the
 * one surface where the platform would need it first, and deliberately not
 * sprayed across every list: an event that feeds nothing should cost as little
 * as it earns.
 */
export function trackContentImpression(input: {
  contentType: TelemetryContentType;
  contentId: string | undefined | null;
  /** 1-based rank in the list, where the surface has an order worth knowing. */
  position?: number;
  surface?: string;
}): void {
  if (!isTelemetryContentId(input.contentId)) return;

  trackAnalyticsEvent('content.impression', {
    contentType: input.contentType,
    contentId: input.contentId.trim(),
    ...(typeof input.position === 'number' ? { position: input.position } : {}),
    ...(input.surface ? { surface: input.surface } : {}),
  });
}
