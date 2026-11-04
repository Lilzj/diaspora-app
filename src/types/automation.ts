// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation domain model (Frontend Phase 18, §3 · §5 · §45)
//
// The vocabulary the whole automation ecosystem is expressed in. Every screen,
// every hook, every adapter and every catalogue entry in this phase uses these
// types and no others, which is the difference between "a coherent automation
// architecture" and §0's "collection of unrelated automatic features".
//
// ── The three-part shape, and why it is not one object ───────────────────────
//
// An automation is not a rule. It is three things a member thinks about
// separately and which fail separately:
//
//   `AutomationDefinition`  what the member configured. WHEN / IF / THEN, plus
//                           a schedule, a scope and an owner. Durable.
//   `AutomationRun`         one attempt to carry it out. Has its own status,
//                           its own timing, and its own failure.
//   `AutomationCapability`  whether this platform can actually do it at all.
//                           A property of the deployment, not of the member.
//
// Folding the third into the first is the mistake this phase is most exposed
// to. "Is this automation active?" and "can this build execute it?" are
// different questions with different answers, and a member whose job alert is
// ACTIVE but whose backend has no saved-search evaluator must be told the
// second thing. §34 and §55 both require it; a single status field could not
// carry it.
//
// ── §5, and the one place the brief's list needed splitting ──────────────────
//
// §5 lists eleven lifecycle states in one list: DRAFT, ACTIVE, PAUSED,
// DISABLED, RUNNING, COMPLETED, FAILED, PARTIALLY_COMPLETED, CANCELLED,
// EXPIRED, NEEDS_ATTENTION — and says "do not invent separate incompatible
// status systems."
//
// They are not one system, and pretending they are would be the incompatible
// outcome rather than the compatible one. Six of them describe a *definition*
// that persists across many runs; five describe a *single run* that starts and
// ends. An automation is not COMPLETED — its third run is. An automation that
// is RUNNING is still ACTIVE, and will be ACTIVE when the run ends.
//
// So there are two unions, drawn from **one vocabulary**, with no member
// appearing in both meaning different things, and a single
// `AUTOMATION_STATE_PRESENTATION` map so the two render identically wherever
// they appear side by side. `EXPIRED` and `NEEDS_ATTENTION` belong to the
// definition — a schedule whose end date has passed, an integration that needs
// reauthorizing — and `CANCELLED` belongs to the run, because cancelling an
// automation for good is `DISABLED`.
//
// ── What this file deliberately cannot express ───────────────────────────────
//
// **No field holds a credential.** No token, no secret, no webhook URL, no
// provider key. §49 forbids exposing secrets and the cheapest enforcement is a
// domain model with nowhere to put one. `automation-boundary.test.ts` asserts
// it structurally.
//
// **No field holds an amount of money to move.** `AutomationAction` has no
// `amount`, no `currency`, no `destination account`. §48 forbids a
// frontend-only rule that transfers, withdraws, credits or refunds, and the
// action catalogue contains no such action — but a *type* that could describe
// one is how the next phase adds it by accident. Financial automations in this
// phase notify about money that has already moved; they never move it.
//
// **No `incomplete` frontend status.** Same reasoning as Phase 16: the final
// principle forbids leaving a screen unfinished, and a type with nowhere to
// record "unfinished" is the cheapest available enforcement.
// ─────────────────────────────────────────────────────────────────────────────

import type { NotificationChannel } from './notification';

// ═════════════════════════════════════════════════════════════════════════════
// SUPPORT STATUS — §70
// ═════════════════════════════════════════════════════════════════════════════

/**
 * How much of a capability really exists behind it.
 *
 * §70's four values, used unchanged for triggers, conditions, actions,
 * templates and whole automations. One vocabulary, so a template's status can
 * be derived from its parts rather than declared and drifting.
 *
 *   `CONNECTED`    a certified backend contract carries this end to end.
 *   `PARTIAL`      part of it is real; the rest is completed by an adapter.
 *   `DEVELOPMENT`  the device can do it locally, in this build, for real —
 *                  a device-calendar write, a deep link. Not simulated, but
 *                  not server-side either, so it cannot survive the app being
 *                  closed and cannot be scheduled.
 *   `BACKEND_GAP`  nothing behind it. The UX is complete; the execution is not.
 */
export type AutomationSupportStatus = 'CONNECTED' | 'PARTIAL' | 'DEVELOPMENT' | 'BACKEND_GAP';

/** Ordered worst-to-best, so a composite can take the weakest part. */
export const AUTOMATION_SUPPORT_RANK: Record<AutomationSupportStatus, number> = {
  BACKEND_GAP: 0,
  DEVELOPMENT: 1,
  PARTIAL: 2,
  CONNECTED: 3,
};

/**
 * The weakest support status among the parts.
 *
 * An automation is only as executable as its least-supported component: a
 * CONNECTED trigger feeding a BACKEND_GAP action produces nothing. Deriving it
 * rather than declaring it is what stops a template claiming more than its
 * pieces can deliver.
 */
export function weakestSupport(
  statuses: readonly AutomationSupportStatus[]
): AutomationSupportStatus {
  if (statuses.length === 0) return 'BACKEND_GAP';
  return statuses.reduce((worst, next) =>
    AUTOMATION_SUPPORT_RANK[next] < AUTOMATION_SUPPORT_RANK[worst] ? next : worst
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LIFECYCLE — §5
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The state of a configured automation.
 *
 * `DISABLED` and `PAUSED` are genuinely different and members use both.
 * `PAUSED` is "stop for now, I will turn it back on" and keeps the schedule.
 * `DISABLED` is "stop, and stop counting" — it is what a cancelled automation
 * becomes, and it is what the platform sets when an automation's integration
 * is revoked and cannot be silently resumed.
 */
export type AutomationStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'DISABLED'
  | 'EXPIRED'
  | 'NEEDS_ATTENTION';

/**
 * The state of one attempt.
 *
 * `PARTIALLY_COMPLETED` is not a nicety. An automation with three actions where
 * the push landed and the calendar write failed is neither a success nor a
 * failure, and §38 requires the difference to be shown. A boolean here would
 * force one of two lies.
 *
 * `SKIPPED` is the case §36 asks for and is the most common non-success in a
 * healthy system: the trigger fired and a condition said no. It is not a
 * failure and must never be rendered as one.
 */
export type AutomationRunStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'CANCELLED'
  | 'TIMED_OUT';

/** How a state is drawn. §62: never colour alone — every entry carries a word. */
export interface AutomationStatePresentation {
  label: string;
  /** A short sentence for the member. Not jargon, not an error code. */
  description: string;
  /** Semantic tone. The *label* carries the meaning; this only reinforces it. */
  tone: 'neutral' | 'positive' | 'caution' | 'critical' | 'muted';
  /** Announced by a screen reader in place of the badge. §62. */
  accessibilityLabel: string;
}

export const AUTOMATION_STATUS_PRESENTATION: Record<
  AutomationStatus,
  AutomationStatePresentation
> = {
  DRAFT: {
    label: 'Draft',
    description: 'Not running yet. You can finish setting this up whenever you like.',
    tone: 'muted',
    accessibilityLabel: 'Draft, not running',
  },
  ACTIVE: {
    label: 'Active',
    description: 'Running whenever its trigger happens.',
    tone: 'positive',
    accessibilityLabel: 'Active',
  },
  PAUSED: {
    label: 'Paused',
    description: 'Temporarily stopped. Nothing will run until you resume it.',
    tone: 'caution',
    accessibilityLabel: 'Paused',
  },
  DISABLED: {
    label: 'Off',
    description: 'Switched off. It will not run again unless you turn it back on.',
    tone: 'muted',
    accessibilityLabel: 'Switched off',
  },
  EXPIRED: {
    label: 'Finished',
    description: 'This automation reached its end date or its run limit.',
    tone: 'muted',
    accessibilityLabel: 'Finished, reached its end date or run limit',
  },
  NEEDS_ATTENTION: {
    label: 'Needs attention',
    description: 'Something this automation depends on has stopped working.',
    tone: 'critical',
    accessibilityLabel: 'Needs attention',
  },
};

export const AUTOMATION_RUN_PRESENTATION: Record<
  AutomationRunStatus,
  AutomationStatePresentation
> = {
  RUNNING: {
    label: 'Running',
    description: 'This run is in progress.',
    tone: 'neutral',
    accessibilityLabel: 'Running',
  },
  COMPLETED: {
    label: 'Completed',
    description: 'Everything this automation was asked to do was done.',
    tone: 'positive',
    accessibilityLabel: 'Completed',
  },
  PARTIALLY_COMPLETED: {
    label: 'Partly done',
    description: 'Some actions succeeded and at least one did not.',
    tone: 'caution',
    accessibilityLabel: 'Partly done, some actions did not succeed',
  },
  FAILED: {
    label: 'Failed',
    description: 'Nothing this automation was asked to do was done.',
    tone: 'critical',
    accessibilityLabel: 'Failed',
  },
  SKIPPED: {
    label: 'Skipped',
    description: 'The trigger happened but your conditions were not met, so nothing was done.',
    tone: 'muted',
    accessibilityLabel: 'Skipped, conditions were not met',
  },
  CANCELLED: {
    label: 'Cancelled',
    description: 'This run was stopped before it finished.',
    tone: 'muted',
    accessibilityLabel: 'Cancelled',
  },
  TIMED_OUT: {
    label: 'Timed out',
    description: 'This run took too long and was stopped.',
    tone: 'critical',
    accessibilityLabel: 'Timed out',
  },
};

/** Whether a run status means the run is over. Used to stop polling. */
export function isTerminalRunStatus(status: AutomationRunStatus): boolean {
  return status !== 'RUNNING';
}

// ═════════════════════════════════════════════════════════════════════════════
// OWNERSHIP AND SCOPE — §45 · §46 · §47
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Who an automation belongs to.
 *
 * §45 requires every automation to have a clear owner, and the list is the
 * brief's. `platform` is present so the type can *describe* one — an
 * administrator's platform-wide announcement rule — and the access model
 * refuses to let an ordinary member create one. Omitting it would not prevent
 * platform automations; it would prevent the UI from correctly labelling one it
 * was shown.
 */
export type AutomationOwnerKind =
  | 'user'
  | 'creator'
  | 'provider'
  | 'employer'
  | 'landlord'
  | 'seller'
  | 'organization'
  | 'community'
  | 'platform';

/**
 * What an automation acts over.
 *
 * Separate from the owner because they differ constantly: a community moderator
 * (`owner: community`) may create an automation whose audience is one
 * neighbourhood. §14 requires every automation to state its scope explicitly,
 * and a scope that could be inferred from the owner would be a scope nobody
 * states.
 */
export interface AutomationScope {
  ownerKind: AutomationOwnerKind;
  /**
   * The owning entity. A member id, a community id, an organization id.
   * Never used as an authorization input — see `lib/automation/access.ts`.
   */
  ownerId: string;
  /** Human-readable, for the preview screen's "this runs on behalf of" line. */
  ownerLabel: string;
  /**
   * Which communities this automation may act within. §14: a member belongs to
   * many, and an automation that assumed one would notify the wrong people.
   * Empty means "the owner's own scope only" and is not the same as "all".
   */
  communityIds: string[];
  /** True only when the automation deliberately spans every community. §14. */
  isCrossCommunity: boolean;
  /** ISO-3166-1 alpha-2, upper case. Present when the scope is country-bound. */
  countryCodes: string[];
  /** Neighbourhood ids, where the scope is narrower than a community. §15. */
  neighbourhoodIds: string[];
}

/**
 * Who an automation's actions will reach.
 *
 * Computed by the **server** for anything wider than the owner themselves.
 * §13 forbids notifying ineligible members and §49 forbids trusting the client
 * for the target audience, so this is a rendered estimate carrying its own
 * provenance rather than a client-side calculation.
 */
export interface AutomationAudience {
  /** `self` needs no server evaluation and is the common case. */
  kind: 'self' | 'community' | 'organization' | 'followers' | 'segment';
  /** The server's count. Null when the server has not been asked or cannot say. */
  estimatedRecipients: number | null;
  /** Where the figure came from. Never presented as exact when it is not. */
  provenance: 'server' | 'unavailable';
  /** A sentence naming who this reaches, e.g. "Members of Nigeria in Lagos". */
  description: string;
  /**
   * Eligibility rules the server will apply on top, stated so the preview does
   * not over-promise: notification preferences, quiet hours, blocked members.
   */
  serverSideFilters: string[];
}

// ═════════════════════════════════════════════════════════════════════════════
// TRIGGERS — §8
// ═════════════════════════════════════════════════════════════════════════════

/** The product area a trigger, condition or action belongs to. Drives grouping. */
export type AutomationDomainKey =
  | 'events'
  | 'community'
  | 'guides'
  | 'jobs'
  | 'marketplace'
  | 'housing'
  | 'providers'
  | 'organizations'
  | 'creator'
  | 'wallet'
  | 'monetization'
  | 'messaging'
  | 'notifications'
  | 'search'
  | 'location'
  | 'analytics';

/**
 * How a trigger is delivered, which decides what it can promise.
 *
 * This distinction is §8's "do not assume an event can be used as an automation
 * trigger simply because it exists in code", made into a type.
 *
 *   `domainEvent`  the backend publishes it and an automation consumer could
 *                  subscribe. The only kind that can fire while the app is shut.
 *   `schedule`     time-based. Requires a server-side scheduler (§41).
 *   `deviceLocal`  the device observes it — an app open, a geofence crossing.
 *                  Cannot fire when the app is not running, and says so.
 *   `manual`       the member runs it themselves. Always available, and the
 *                  honest fallback for a trigger with no backend behind it.
 */
export type AutomationTriggerDelivery = 'domainEvent' | 'schedule' | 'deviceLocal' | 'manual';

export interface AutomationTriggerDefinition {
  key: string;
  domain: AutomationDomainKey;
  /** Member-facing. "When an event I saved is starting soon". */
  label: string;
  /** One sentence of plain explanation. Rendered under the label in the picker. */
  description: string;
  delivery: AutomationTriggerDelivery;
  support: AutomationSupportStatus;
  /**
   * The backend event this would consume, in the backend's own naming. Empty
   * when none exists — which is the audit finding for most of §8's list and is
   * why the register is as long as it is.
   */
  backendEvent: string | null;
  /** The gap key in `config/automation-gaps.ts`, when support is not CONNECTED. */
  gapKey: string | null;
  /** Which condition keys make sense here. The builder offers only these. */
  supportedConditions: string[];
  /** Which action keys make sense here. */
  supportedActions: string[];
  /** Owner kinds allowed to use this trigger at all. §45. */
  allowedOwners: AutomationOwnerKind[];
  /** Server-evaluated capability required before this may be activated. §46/§47. */
  requiredCapability: string | null;
  /** Phase 16 integrations this trigger needs. §54. */
  requiredIntegrations: string[];
  /**
   * True when the trigger reads something private enough to need explicit
   * consent — location, message metadata, wallet activity. §50.
   */
  requiresPrivacyConsent: boolean;
  /** What the member is agreeing to. Required when the flag above is true. */
  privacyNote: string | null;
}

/** A trigger as configured on one automation. */
export interface AutomationTrigger {
  key: string;
  /**
   * Trigger-specific settings — which saved search, which event, how far ahead.
   * Deliberately `string | number | boolean | string[]`: a nested structure here
   * would become a rules language, and §7 forbids exposing one to members.
   */
  parameters: Record<string, string | number | boolean | string[]>;
}

// ═════════════════════════════════════════════════════════════════════════════
// CONDITIONS — §9
// ═════════════════════════════════════════════════════════════════════════════

export type AutomationConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'includes'
  | 'excludes'
  | 'greaterThan'
  | 'lessThan'
  | 'between'
  | 'within'
  | 'isTrue'
  | 'isFalse';

/**
 * What kind of value a condition compares, which decides its editor.
 *
 * The builder renders an editor per `valueKind`, not per condition, so adding a
 * condition does not mean adding UI. That is what keeps §33's builder from
 * growing a special case per entry in §9's list.
 */
export type AutomationConditionValueKind =
  | 'country'
  | 'community'
  | 'neighbourhood'
  | 'category'
  | 'text'
  | 'number'
  | 'money'
  | 'distance'
  | 'date'
  | 'time'
  | 'dayOfWeek'
  | 'boolean'
  | 'choice';

export interface AutomationConditionDefinition {
  key: string;
  domain: AutomationDomainKey;
  label: string;
  description: string;
  valueKind: AutomationConditionValueKind;
  operators: AutomationConditionOperator[];
  support: AutomationSupportStatus;
  gapKey: string | null;
  /** Fixed options, for `choice`. */
  choices?: { value: string; label: string }[];
  /**
   * **Whether the server must evaluate this.** §9: "Do not execute sensitive
   * conditions solely on client-side data."
   *
   * True for anything a member could change locally to gain something —
   * subscription state, wallet balance, role, application status. The builder
   * still offers them; the execution model refuses to let the client decide
   * them, and a simulation says which side answered.
   */
  requiresServerEvaluation: boolean;
  /** True when the value itself is personal and must not be logged. §50 · §52. */
  isSensitive: boolean;
  unit?: string;
}

export interface AutomationCondition {
  /** Stable within one automation, so the builder can reorder and remove. */
  id: string;
  key: string;
  operator: AutomationConditionOperator;
  /** `between`/`within` use both; everything else uses `value` only. */
  value: string | number | boolean | string[] | null;
  secondaryValue?: string | number | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTIONS — §10
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Who must carry an action out.
 *
 * The whole of §10's "the backend must remain authoritative for privileged
 * actions", as a field. `client` actions are ones the device may genuinely do
 * on its own — writing to the device's own calendar, opening a screen. Anything
 * that reaches another person, another service or money is `server`, and the
 * client's job is to ask.
 */
export type AutomationActionExecutor = 'server' | 'client';

/**
 * How dangerous an action is to repeat, which drives the idempotency UX. §39.
 *
 *   `safe`        repeating changes nothing. Opening a screen, saving an item.
 *   `deduplicated` repeating is prevented by a server-side key; a second
 *                  attempt returns the first result. The UI shows completion,
 *                  never an error (§39).
 *   `visible`     repeating produces a second visible thing — a duplicate
 *                  calendar entry, a second message. Never retried automatically.
 */
export type AutomationActionRepeatRisk = 'safe' | 'deduplicated' | 'visible';

export interface AutomationActionDefinition {
  key: string;
  domain: AutomationDomainKey;
  label: string;
  description: string;
  executor: AutomationActionExecutor;
  repeatRisk: AutomationActionRepeatRisk;
  support: AutomationSupportStatus;
  gapKey: string | null;
  /**
   * The notification channel this produces, when it produces one.
   *
   * §28 and §73: automation actions flow through B13's existing notification
   * architecture. There is no `AutomationNotification` type in this file and
   * there is no second inbox — an action names a channel B13 already has.
   */
  notificationChannel: NotificationChannel | null;
  /** The B13 category key an action's message belongs to. Preferences apply. §53. */
  notificationCategoryKey: string | null;
  requiredIntegrations: string[];
  /** Server-evaluated capability required. §45 · §46 · §47 · §48. */
  requiredCapability: string | null;
  /**
   * True when this reaches somebody other than the owner. Drives the audience
   * preview, the permission check and the stronger confirmation. §13 · §29.
   */
  reachesOtherPeople: boolean;
  /**
   * True when the member must confirm every single occurrence rather than once
   * at setup. §29 forbids sending messages without explicit authorization, and
   * an automation that sends on the member's behalf unattended is exactly that.
   */
  requiresPerRunConfirmation: boolean;
  /** Whether a development provider may simulate this. Never for money. §56. */
  simulatable: boolean;
  /** Owner kinds permitted to use it. */
  allowedOwners: AutomationOwnerKind[];
}

export interface AutomationAction {
  id: string;
  key: string;
  /**
   * Action settings — which reminder offset, which deep link, which message
   * template id. **Never an amount, an account, or a recipient list**: the
   * recipient set is derived from the scope by the server, and there is no
   * money field anywhere in this domain.
   */
  parameters: Record<string, string | number | boolean | string[]>;
  /** Channel override, within what the definition and B13 preferences allow. */
  channel?: NotificationChannel | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// SCHEDULING AND TIME — §41 · §42
// ═════════════════════════════════════════════════════════════════════════════

export type AutomationFrequency =
  | 'once'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'custom'
  | 'eventRelative';

/**
 * Which clock a schedule is expressed in. §42: never silently interpret a
 * schedule in the wrong timezone.
 *
 * `event` is the one that catches people out and is the reason this is not just
 * an IANA string: "one hour before the event" means one hour before it starts
 * *where it is*, and an event in Lagos does not move because the member flew to
 * London. Phase 16's `lib/integrations/calendar.ts` already solved the
 * conversion; this phase reuses it rather than writing a second one.
 */
export type AutomationTimezoneMode =
  | 'device'
  | 'userSelected'
  | 'event'
  | 'community'
  | 'country';

export interface AutomationTimezone {
  mode: AutomationTimezoneMode;
  /**
   * The resolved IANA identifier. Null only while the mode is `event` and no
   * event is selected yet — the builder refuses to save in that state.
   */
  ianaId: string | null;
  /** What to show the member: "Africa/Lagos (event time)". */
  label: string;
  /**
   * False when the runtime could not resolve the zone and the device's was
   * used. Phase 16's `InstantConversion.isExact`, carried through, because a
   * silent one-hour error is precisely what §42 forbids.
   */
  isExact: boolean;
}

/** Relative to an event. Positive means before; the UI never shows a sign. */
export interface AutomationEventOffset {
  minutesBefore: number;
  /** `start` or `end`. A reminder at the end of a two-day festival is a real ask. */
  anchor: 'start' | 'end';
}

export interface AutomationSchedule {
  frequency: AutomationFrequency;
  timezone: AutomationTimezone;
  /** Local wall clock, 0–23. Null for event-relative and trigger-driven. */
  hour: number | null;
  minute: number | null;
  /** 0 = Sunday. Weekly only. */
  daysOfWeek: number[];
  /** 1–31. Monthly only. A 31 in February is clamped by the server, not here. */
  dayOfMonth: number | null;
  /** ISO 8601. */
  startsAt: string | null;
  endsAt: string | null;
  /** §41's "maximum executions where supported". Null means unlimited. */
  maxExecutions: number | null;
  eventOffset: AutomationEventOffset | null;
  /**
   * A member-authored description of a `custom` frequency, held so the UI can
   * show what was asked for. **Not parsed and not executed** — a cron
   * expression a client interpreted would be §41's forbidden local scheduler
   * wearing a hat.
   */
  customDescription: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// THE DEFINITION
// ═════════════════════════════════════════════════════════════════════════════

/** Where an automation came from. Drives §52's template-usage analytics. */
export type AutomationSource = 'template' | 'builder' | 'contextual' | 'platform';

export interface AutomationAuditEntry {
  /** `created` | `updated` | `activated` | `paused` | `disabled` | `deleted`. */
  action: string;
  at: string;
  /** Display name. Never an internal identifier, never an email. §51. */
  actorLabel: string;
  /**
   * Where this record came from. **The client never fabricates one** (§51), so
   * a locally-known change carries `local` and is rendered as "on this device"
   * rather than as an audited fact.
   */
  provenance: 'server' | 'local';
}

export interface AutomationDefinition {
  id: string;
  name: string;
  description: string;
  status: AutomationStatus;
  scope: AutomationScope;
  source: AutomationSource;
  /** Set when `source` is `template`. Feeds §52 without storing rule contents. */
  templateId: string | null;

  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  schedule: AutomationSchedule | null;

  /**
   * The whole automation's support status, derived from its parts by
   * `weakestSupport`. Held rather than computed at render so a list of two
   * hundred automations does not re-derive it per row.
   */
  support: AutomationSupportStatus;
  /** Gap ids this automation depends on. Rendered on the preview. §34. */
  gapIds: string[];

  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  /** Cumulative. From the server; the client never increments it. */
  executionCount: number;
  lastRunStatus: AutomationRunStatus | null;

  /** Why it is NEEDS_ATTENTION. Null otherwise. */
  attentionReason: string | null;
  audit: AutomationAuditEntry[];

  /**
   * True when this record came from a development adapter. §57: mock execution
   * must never look indistinguishable from real execution, and every surface
   * that renders an automation is required to render this.
   */
  isSimulated: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTION — §36 · §37 · §38
// ═════════════════════════════════════════════════════════════════════════════

export type AutomationFailureKind =
  | 'triggerUnavailable'
  | 'conditionEvaluationFailed'
  | 'actionFailed'
  | 'providerUnavailable'
  | 'backendUnavailable'
  | 'permissionDenied'
  | 'rateLimited'
  | 'integrationExpired'
  | 'invalidConfiguration'
  | 'timeout'
  | 'duplicateSuppressed'
  | 'backendGap';

export interface AutomationConditionOutcome {
  conditionId: string;
  /** The condition's member-facing label at the time it ran. */
  label: string;
  matched: boolean;
  /**
   * Who decided. §9's requirement made observable: a sensitive condition that
   * reports `client` in a real run is a defect, and the run detail shows it.
   */
  evaluatedBy: 'server' | 'client';
  /** Why, in plain words. **Never the member's actual value** when sensitive. */
  explanation: string;
}

export interface AutomationActionOutcome {
  actionId: string;
  actionKey: string;
  label: string;
  status: 'succeeded' | 'failed' | 'skipped' | 'suppressed' | 'pending';
  /**
   * `suppressed` is its own status because it is the correct, healthy outcome
   * of a member's own notification preferences (§53) and of idempotency (§39).
   * Rendering either as a failure would teach members to distrust the feature.
   */
  suppressionReason: string | null;
  failureKind: AutomationFailureKind | null;
  message: string | null;
  /** The notification, calendar entry or screen this produced. */
  resultRef: { kind: string; id: string; deepLink: string | null } | null;
  completedAt: string | null;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  automationName: string;
  status: AutomationRunStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;

  /** What set it off, in the member's words. "A job matching Lagos · Software". */
  triggerSummary: string;
  triggeredAt: string;
  conditionOutcomes: AutomationConditionOutcome[];
  actionOutcomes: AutomationActionOutcome[];

  failureKind: AutomationFailureKind | null;
  /** Written for a member. Never a stack trace, never an internal host. §36. */
  failureMessage: string | null;
  /** What the member can do about it. Null when there is nothing. §38. */
  recoveryHint: string | null;
  /** For a support conversation. Never a token, never a request body. §36. */
  correlationId: string | null;

  /**
   * True when this run happened in a simulation rather than for real. §35 · §57.
   * Every surface that shows a run is required to render it.
   */
  isSimulated: boolean;
  /** True when the backend reported this as an already-processed duplicate. §39. */
  wasDeduplicated: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATES — §31 · §32
// ═════════════════════════════════════════════════════════════════════════════

export type AutomationTemplateCategory =
  | 'reminders'
  | 'alerts'
  | 'community'
  | 'money'
  | 'growth'
  | 'admin';

export interface AutomationTemplateField {
  /** Matches a parameter name on the trigger, a condition, or an action. */
  key: string;
  label: string;
  /** Where it lands. Keeps a template from having to know rule internals. */
  target: 'trigger' | 'condition' | 'action';
  /** Which condition/action id within the template, when target is not trigger. */
  targetId?: string;
  valueKind: AutomationConditionValueKind;
  required: boolean;
  defaultValue: string | number | boolean | string[] | null;
  helpText: string | null;
  choices?: { value: string; label: string }[];
}

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: AutomationTemplateCategory;
  domain: AutomationDomainKey;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  schedule: AutomationSchedule | null;
  /** What the member fills in. Everything else is fixed by the template. */
  fields: AutomationTemplateField[];
  /** Owner kinds this template is offered to. §31: templates are permission-aware. */
  allowedOwners: AutomationOwnerKind[];
  requiredCapabilities: string[];
  requiredIntegrations: string[];
  /** Derived from the parts, never declared. */
  support: AutomationSupportStatus;
  gapKeys: string[];
}

// ═════════════════════════════════════════════════════════════════════════════
// DEPENDENCY CHECK AND PREVIEW — §34 · §55
// ═════════════════════════════════════════════════════════════════════════════

export type AutomationDependencyKind =
  | 'trigger'
  | 'condition'
  | 'action'
  | 'permission'
  | 'integration'
  | 'schedule'
  | 'scope'
  | 'configuration'
  | 'backend';

export interface AutomationDependency {
  kind: AutomationDependencyKind;
  label: string;
  /**
   * `met`      nothing to do.
   * `missing`  the member must do something — connect a calendar, grant push.
   * `gap`      the platform must do something. Not the member's problem, and
   *            never rendered as an error against them. §55 · §77.
   */
  state: 'met' | 'missing' | 'gap';
  detail: string;
  /** What tapping this does, when there is something to do. */
  actionLabel: string | null;
  actionRoute: string | null;
  /**
   * Something the screen does in place rather than a route, when there is no
   * screen for it: `presence.switchOn` asks for location and switches presence
   * on (since 4 Nov 2026, when its settings screen went).
   */
  actionKey?: 'presence.switchOn' | null;
  gapId: string | null;
  /** Whether this alone prevents activation. A gap does not; a permission does. */
  blocksActivation: boolean;
}

export interface AutomationPreview {
  triggerSummary: string;
  conditionSummaries: string[];
  actionSummaries: string[];
  audience: AutomationAudience;
  scheduleSummary: string | null;
  timezoneSummary: string | null;
  dependencies: AutomationDependency[];
  support: AutomationSupportStatus;
  gapIds: string[];
  /** What will and will not happen, said plainly before activation. §34. */
  expectedBehaviour: string;
  limitations: string[];
  /** True when nothing blocks activation. Gaps do not block. */
  canActivate: boolean;
}

/**
 * The result of §35's safe test.
 *
 * Structurally a run so the same components render it, with `isSimulated`
 * always true and `wouldHaveDone` carrying what was deliberately *not* done.
 * A simulation that returned a plain `AutomationRun` would be indistinguishable
 * from a real one in a log, in a screenshot and in a component test, which §57
 * forbids.
 */
export interface AutomationSimulation {
  run: AutomationRun;
  /** Actions that were planned and deliberately not performed, and why. */
  wouldHaveDone: {
    actionKey: string;
    label: string;
    reason: string;
  }[];
  /** Always true. Present so a serialised simulation is self-describing. */
  isSimulation: true;
  /** What the member should understand from this. Rendered above the result. */
  disclaimer: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS — §45 · §46 · §47 · §48 · §49
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The server's answer to what this member may do with automation.
 *
 * Every field is a **boolean the server put here**. There is deliberately no
 * function anywhere in this phase that takes a role, an account state or a
 * subscription tier and returns one of these — Phase 13 and Phase 15 both
 * established that shape and §49 requires it here.
 */
export interface AutomationAccess {
  canViewAutomations: boolean;
  canCreatePersonal: boolean;
  canCreateForCommunity: boolean;
  canCreateForOrganization: boolean;
  canCreateForCreator: boolean;
  canCreateForBusiness: boolean;
  canCreatePlatformWide: boolean;
  canNotifyOtherMembers: boolean;
  canUseFinancialTriggers: boolean;
  canUseLocationTriggers: boolean;
  canViewOthersRuns: boolean;
  canManageOthersAutomations: boolean;
  /** Server-imposed ceiling. Rendered before a member hits it, not after. */
  maxActiveAutomations: number | null;
  /** Where the answer came from. `unavailable` means assume nothing is allowed. */
  provenance: 'server' | 'unavailable';
  /** Capability keys the server granted, for per-trigger and per-action checks. */
  grantedCapabilities: string[];

  /**
   * Whether an action that reaches other people would reach anyone in this scope.
   *
   * False for a community Diaspora has not opened yet, and for one that is
   * suspended or closed. The scope asked about, not any scope this member holds.
   */
  canReachMembers: boolean;

  /**
   * Why it would reach nobody, in the platform's own words, or null when it would.
   *
   * The platform has always written this and the dispatcher has always read it —
   * as the reason an action did nothing, *after* the rule fired. Until 12 Sep
   * 2026 the capabilities route did not carry it, so a member could build "when
   * this community reaches a milestone, tell the community", turn it on, and
   * find out from a run record that there was nobody to tell.
   */
  reachRefusal: string | null;
}

/** A no-capability set. The safe default whenever the server has not answered. */
export function noAutomationAccess(): AutomationAccess {
  return {
    canViewAutomations: false,
    canCreatePersonal: false,
    canCreateForCommunity: false,
    canCreateForOrganization: false,
    canCreateForCreator: false,
    canCreateForBusiness: false,
    canCreatePlatformWide: false,
    canNotifyOtherMembers: false,
    canUseFinancialTriggers: false,
    canUseLocationTriggers: false,
    canViewOthersRuns: false,
    canManageOthersAutomations: false,
    maxActiveAutomations: null,
    provenance: 'unavailable',
    grantedCapabilities: [],

    // Absence is refusal, as everywhere else. No refusal text, because a
    // deployment that said nothing has not given a reason to quote.
    canReachMembers: false,
    reachRefusal: null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SAVED SEARCHES — §30
// ═════════════════════════════════════════════════════════════════════════════

/** The surfaces a saved search can watch. Every one has a real listing route. */
export type SavedSearchSubject = 'jobs' | 'marketplace' | 'housing' | 'providers' | 'events';

export type SavedSearchAlertFrequency = 'instant' | 'daily' | 'weekly' | 'off';

/**
 * A saved search, and the alert configured on it.
 *
 * §30 requires one implementation shared by five modules, so the criteria are a
 * flat bag of the filters those modules' routes already accept rather than five
 * typed shapes. A per-module type would be five places to add a filter.
 */
export interface SavedSearch {
  id: string;
  subject: SavedSearchSubject;
  name: string;
  /** The query as the module's own list screen would send it. */
  criteria: Record<string, string | number | boolean | string[]>;
  /** What the member typed, for display. */
  querySummary: string;
  alertsEnabled: boolean;
  alertFrequency: SavedSearchAlertFrequency;
  /** Which changes are worth telling them about. §30. */
  watchFor: ('newMatch' | 'priceChange' | 'availabilityChange' | 'closingSoon')[];
  createdAt: string;
  /** Server-owned. Null when no evaluation has ever run — which is today. */
  lastMatchedAt: string | null;
  newMatchCount: number | null;
  /** The automation this search's alert is delivered by, when one exists. */
  automationId: string | null;
  isSimulated: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// LIST AND FILTER — §67
// ═════════════════════════════════════════════════════════════════════════════

export type AutomationFilterTab = 'all' | 'active' | 'paused' | 'attention' | 'draft';

export interface AutomationListFilters {
  tab: AutomationFilterTab;
  domain: AutomationDomainKey | null;
  ownerKind: AutomationOwnerKind | null;
  /** Community id. Null means "every community in scope", not "no filter". */
  communityId: string | null;
  search: string;
}

export interface AutomationPage<T> {
  items: T[];
  /** Opaque. Null when there is no further page. */
  nextCursor: string | null;
  /** Server total where known. Null rather than a guess. */
  totalCount: number | null;
}

/** The default filter set. Exported so the tests and the screen agree. */
export const DEFAULT_AUTOMATION_FILTERS: AutomationListFilters = {
  tab: 'all',
  domain: null,
  ownerKind: null,
  communityId: null,
  search: '',
};

// ═════════════════════════════════════════════════════════════════════════════
// DRAFTS — the builder's working state
// ═════════════════════════════════════════════════════════════════════════════

/**
 * An automation being built.
 *
 * Separate from `AutomationDefinition` because a draft is legitimately
 * incomplete — no trigger yet, no actions yet — and a definition never is.
 * Using one type would mean every consumer of a saved automation handling a
 * null trigger that cannot occur.
 */
export interface AutomationDraft {
  /** Present when editing an existing automation. */
  id: string | null;
  name: string;
  description: string;
  scope: AutomationScope;
  source: AutomationSource;
  templateId: string | null;
  trigger: AutomationTrigger | null;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  schedule: AutomationSchedule | null;
}

export interface AutomationValidationIssue {
  /** Which part of the builder to send the member to. */
  step: 'name' | 'trigger' | 'conditions' | 'actions' | 'schedule' | 'scope';
  /** Identifies the specific condition or action, when one is at fault. */
  targetId: string | null;
  message: string;
  /** `error` blocks saving; `warning` does not. §43's conflicts are warnings. */
  severity: 'error' | 'warning';
}
