// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration instrumentation (Frontend Phase 16, §55 · §56)
//
// §55's event list, as a closed union, plus the property allow-list extension
// that makes §55's prohibitions enforceable rather than aspirational.
//
// **No buffer, no sanitiser and no transport in this file.** All three live in
// `lib/creator-analytics.ts`, which registered the absent ingestion endpoint as
// CREATOR-GAP-016 — restated at platform scope as FRONTEND-PHASE15-GAP-029 and
// again here as FRONTEND-PHASE16-GAP-018. Phases 8, 12, 13 and 15 all extend
// the same buffer. This is the fifth extension and it is still one buffer,
// which is what §55's "do not create duplicate tracking systems" looks like
// when it is actually followed.
//
// The naming convention is the platform's, unchanged since Phase 7:
//
//     domain.subject.verb        lower-case, dotted, past-tense verb
//
// ── The rule specific to this phase ──────────────────────────────────────────
//
// **An integration event must not carry anything the integration touched.**
//
// This is the mistake a telemetry vocabulary for an integrations feature is
// uniquely exposed to, and every instance of it looks harmless in isolation:
//
//     integration.connected      · accountLabel: "amara@example.com"
//     calendar.event.exported    · title: "Oncology follow-up"
//     payment.completed          · amount: 4200, currency: "GBP"
//     push.token.registered      · token: "ExponentPushToken[...]"
//     maps.navigation.started    · lat: 51.5074, lon: -0.1278
//
// Each is a plausible thing to want in a dashboard. Together they are a
// telemetry stream containing a member's email address, a medical appointment,
// their spending and their location — governed by a different retention policy
// and read by a wider set of services than any of the screens that collected
// it.
//
// So the allow-list below registers **provider, capability, outcome, error
// category, duration, retry count and counts of things** — and no identifier,
// no label, no title, no amount, no coordinate, no token. What was attempted
// and how it went, never what it was about. `sanitise()` in creator-analytics
// drops everything else before it reaches the buffer, so this is enforcement
// rather than intention, and `integration-boundary.test.ts` asserts the keys
// whose absence matters most.
//
// ── §56, and why `correlationId` is here but `errorMessage` is not ───────────
//
// §56 asks for diagnosable failures: provider, capability, operation, outcome,
// error category, duration, retry count, correlation id. Every one of those is
// registered. What is deliberately absent is the error *message* — a provider
// message is free text, and free text from a provider is exactly the channel
// through which an access token or an email address reaches a log. The
// correlation id is the join key to the server-side record that does have the
// detail, which is where it belongs.
// ─────────────────────────────────────────────────────────────────────────────

import {
  registerAllowedProperties,
  trackPlatformEvent,
  type EventProperties,
} from '@/lib/creator-analytics';
import type {
  IntegrationCapability,
  IntegrationDomain,
  IntegrationErrorKind,
  IntegrationMode,
  IntegrationProviderId,
  IntegrationStatus,
} from '@/types/integrations';

/**
 * Every integration event this phase emits — §55's list.
 *
 * §55's per-provider variants (`CalendarSyncStarted`, `MapProviderUsed`,
 * `PushPermissionGranted`…) are kept as distinct names where they describe
 * genuinely different moments, and collapsed where they differ only by a
 * low-cardinality label. `IntegrationConnected` carries a `provider` property
 * rather than becoming nine event names, for the same reason Phase 15 collapsed
 * eleven dashboard events into one: a taxonomy that must be edited every time a
 * provider is added is a taxonomy that will not be.
 *
 * Permission grant and denial *are* separate events rather than one with an
 * outcome property, because the interesting number is the ratio between them
 * and a funnel is easier to read than a group-by.
 */
export type IntegrationEvent =
  // Surfaces — §55's IntegrationViewed
  | 'integration.hub.viewed'
  | 'integration.detail.viewed'
  | 'integration.gap_register.viewed'

  // Connection lifecycle — §55's Connected / Disconnected / ConnectionFailed
  | 'integration.connect.started'
  | 'integration.connected'
  | 'integration.connect.failed'
  | 'integration.connect.cancelled'
  | 'integration.disconnected'
  | 'integration.reauth.required'
  | 'integration.reauth.completed'

  // Consent — §37. Whether anybody reads the sheet is a real product question.
  | 'integration.consent.shown'
  | 'integration.consent.accepted'
  | 'integration.consent.declined'

  // Permissions — §13, §14. Grant and denial split deliberately; see above.
  | 'integration.permission.requested'
  | 'integration.permission.granted'
  | 'integration.permission.denied'
  | 'integration.permission.settings_opened'

  // Calendar — §55's CalendarSyncStarted / Completed / Failed
  | 'calendar.export.offered'
  | 'calendar.event.exported'
  | 'calendar.event.export_failed'
  | 'calendar.sync.started'
  | 'calendar.sync.completed'
  | 'calendar.sync.failed'
  | 'calendar.settings.changed'

  // Push — §55's PushPermissionGranted / Denied
  | 'push.permission.granted'
  | 'push.permission.denied'
  | 'push.token.registered'
  | 'push.token.refreshed'
  | 'push.token.deactivated'
  | 'push.notification.opened'
  | 'push.notification.unroutable'

  // Maps — §55's MapProviderUsed / NavigationStarted. Phase 8 already emits its
  // own `maps.*` events; these two are the integration-level ones §55 names and
  // they do not duplicate that vocabulary.
  | 'maps.provider.used'
  | 'maps.navigation.started'

  // Identity — §55's IdentityProviderLinked / Unlinked
  | 'identity.provider.linked'
  | 'identity.provider.unlinked'
  | 'identity.link.conflict'
  | 'identity.unlink.refused'

  // Payments — §55's PaymentStarted / Completed / Failed
  | 'payment.started'
  | 'payment.action_required'
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'payment.indeterminate'

  // Verification — §17, §18
  | 'verification.otp.requested'
  | 'verification.otp.failed'
  | 'verification.otp.succeeded'
  | 'verification.email.requested'

  // Government — §19
  | 'government.notices.viewed'
  | 'government.source.opened'

  // States, so unavailability and refusal are measurable rather than invisible
  | 'integration.unavailable.shown'
  | 'integration.gap_notice.shown'
  | 'integration.rate_limited.shown';

/**
 * The properties an integration event may carry.
 *
 * Registered with the platform sanitiser, which drops everything not on the
 * combined allow-list. Read the header before adding one: the test for whether
 * a key belongs here is not "is it useful" but "would a stream of these, over a
 * year, describe a member".
 */
const INTEGRATION_EVENT_PROPERTIES = [
  // Which integration, in low-cardinality terms
  'provider',
  'domain',
  'capability',
  'mode',
  'status',

  // How it went
  'outcome',
  'errorKind',
  'isRetryable',
  'needsMemberAction',

  // §56's diagnosability
  'durationMs',
  'retryCount',
  'correlationId',

  // Counts. Never the things counted.
  'itemCount',
  'succeededCount',
  'failedCount',
  'calendarCount',
  'deviceCount',
  'linkedProviderCount',

  // Shape of what happened, without what it was about
  'permissionKey',
  'permissionState',
  'sourceKind',
  'notificationType',
  'actionKind',
  'settingKey',
  'isSimulated',
  'isRecurring',
  'isAllDay',
  'usesEventTimeZone',
  'hasGap',
  'gapId',
] as const;

registerAllowedProperties(INTEGRATION_EVENT_PROPERTIES);

/**
 * Emit an integration event.
 *
 * The closed union means a typo is a compile error rather than an event nobody
 * ever queries. Properties still pass through the platform sanitiser, so a
 * caller who hands this an `accountLabel` loses it — the type is the first
 * defence and the allow-list is the one that actually holds.
 */
export function trackIntegrationEvent(
  event: IntegrationEvent,
  properties?: EventProperties
): void {
  trackPlatformEvent(event, properties);
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed emitters
//
// One per event family. They exist so a call site cannot pass the wrong shape,
// and so the property names are written once — a screen that spelled
// `errorKind` as `error_kind` would emit an event whose failure reason is
// silently dropped, and nothing would ever say so.
// ─────────────────────────────────────────────────────────────────────────────

export function trackConnectionAttempt(input: {
  provider: IntegrationProviderId;
  domain: IntegrationDomain;
  mode: IntegrationMode;
}): void {
  trackIntegrationEvent('integration.connect.started', {
    provider: input.provider,
    domain: input.domain,
    mode: input.mode,
    isSimulated: input.mode === 'DEVELOPMENT_PROVIDER',
  });
}

export function trackConnectionResult(input: {
  provider: IntegrationProviderId;
  domain: IntegrationDomain;
  mode: IntegrationMode;
  status: IntegrationStatus;
  outcome: 'connected' | 'failed' | 'cancelled';
  errorKind?: IntegrationErrorKind;
  durationMs?: number;
  correlationId?: string | null;
}): void {
  const event: IntegrationEvent =
    input.outcome === 'connected'
      ? 'integration.connected'
      : input.outcome === 'cancelled'
        ? 'integration.connect.cancelled'
        : 'integration.connect.failed';

  trackIntegrationEvent(event, {
    provider: input.provider,
    domain: input.domain,
    mode: input.mode,
    status: input.status,
    outcome: input.outcome,
    errorKind: input.errorKind,
    durationMs: input.durationMs,
    correlationId: input.correlationId,
    isSimulated: input.mode === 'DEVELOPMENT_PROVIDER',
  });
}

export function trackPermission(input: {
  provider: IntegrationProviderId;
  permissionKey: string;
  granted: boolean;
  permissionState: string;
}): void {
  trackIntegrationEvent(
    input.granted ? 'integration.permission.granted' : 'integration.permission.denied',
    {
      provider: input.provider,
      permissionKey: input.permissionKey,
      permissionState: input.permissionState,
    }
  );
}

/**
 * A calendar export.
 *
 * Carries whether the event was recurring, all-day and kept in its own timezone
 * — the three shape questions that would explain a bug report — and carries
 * nothing about the event itself. `usesEventTimeZone` in particular is here
 * because §62's conversion rule is the sort of thing that regresses silently,
 * and a metric on it is how that would be noticed.
 */
export function trackCalendarExport(input: {
  provider: IntegrationProviderId;
  mode: IntegrationMode;
  succeeded: boolean;
  isRecurring: boolean;
  isAllDay: boolean;
  usesEventTimeZone: boolean;
  errorKind?: IntegrationErrorKind;
  durationMs?: number;
}): void {
  trackIntegrationEvent(
    input.succeeded ? 'calendar.event.exported' : 'calendar.event.export_failed',
    {
      provider: input.provider,
      mode: input.mode,
      capability: 'calendar.event.create' satisfies IntegrationCapability,
      outcome: input.succeeded ? 'succeeded' : 'failed',
      isRecurring: input.isRecurring,
      isAllDay: input.isAllDay,
      usesEventTimeZone: input.usesEventTimeZone,
      errorKind: input.errorKind,
      durationMs: input.durationMs,
      isSimulated: input.mode === 'DEVELOPMENT_PROVIDER',
    }
  );
}

/**
 * A payment moving between phases.
 *
 * **No amount, no currency, no instrument, no payment id.** §55 forbids payment
 * credentials and the reasoning extends to the amount: a stream of payment
 * events with amounts is a spending history, held under analytics retention
 * rather than financial retention. The phase and the error kind answer every
 * product question about the payment *flow*, which is what this instruments.
 */
export function trackPayment(input: {
  outcome: 'started' | 'action_required' | 'completed' | 'failed' | 'cancelled' | 'indeterminate';
  errorKind?: IntegrationErrorKind;
  actionKind?: string;
  retryCount?: number;
  durationMs?: number;
}): void {
  const event: IntegrationEvent = (
    {
      started: 'payment.started',
      action_required: 'payment.action_required',
      completed: 'payment.completed',
      failed: 'payment.failed',
      cancelled: 'payment.cancelled',
      indeterminate: 'payment.indeterminate',
    } as const
  )[input.outcome];

  trackIntegrationEvent(event, {
    provider: 'payments.platform',
    domain: 'payments',
    outcome: input.outcome,
    errorKind: input.errorKind,
    actionKind: input.actionKind,
    retryCount: input.retryCount,
    durationMs: input.durationMs,
  });
}

export function trackIdentityLink(input: {
  provider: IntegrationProviderId;
  linked: boolean;
  linkedProviderCount: number;
}): void {
  trackIntegrationEvent(
    input.linked ? 'identity.provider.linked' : 'identity.provider.unlinked',
    {
      provider: input.provider,
      domain: 'identity',
      linkedProviderCount: input.linkedProviderCount,
    }
  );
}

/**
 * A push token reaching, or leaving, the device registry.
 *
 * The token itself is never a property and there is no allow-listed key that
 * could hold one — `token`, `pushToken` and `deviceToken` are all absent from
 * the list above, so a call site that passed one would have it dropped.
 */
export function trackPushToken(input: {
  provider: IntegrationProviderId;
  mode: IntegrationMode;
  outcome: 'registered' | 'refreshed' | 'deactivated';
  deviceCount?: number;
}): void {
  const event: IntegrationEvent = (
    {
      registered: 'push.token.registered',
      refreshed: 'push.token.refreshed',
      deactivated: 'push.token.deactivated',
    } as const
  )[input.outcome];

  trackIntegrationEvent(event, {
    provider: input.provider,
    domain: 'push',
    mode: input.mode,
    outcome: input.outcome,
    deviceCount: input.deviceCount,
    isSimulated: input.mode === 'DEVELOPMENT_PROVIDER',
  });
}

/** A notification tap that resolved, or did not — §49. */
export function trackNotificationOpened(input: {
  notificationType: string;
  routed: boolean;
}): void {
  trackIntegrationEvent(
    input.routed ? 'push.notification.opened' : 'push.notification.unroutable',
    {
      domain: 'push',
      notificationType: input.notificationType,
      outcome: input.routed ? 'routed' : 'fellBackToInbox',
    }
  );
}

/** A gap notice rendering, so it is known how often members meet one. */
export function trackGapNoticeShown(input: {
  provider: IntegrationProviderId | null;
  domain: IntegrationDomain;
  gapId: string;
}): void {
  trackIntegrationEvent('integration.gap_notice.shown', {
    provider: input.provider ?? undefined,
    domain: input.domain,
    gapId: input.gapId,
    hasGap: true,
  });
}
