// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation instrumentation (Frontend Phase 18, §52 · §74)
//
// §52's event list, as a closed union.
//
// **No buffer, no sanitiser and no transport in this file.** All three live in
// `creator-analytics.ts`, whose absent ingestion endpoint was first registered
// as CREATOR-GAP-016 and is restated here as FRONTEND-PHASE18-GAP-028. Phases
// 8, 12, 13, 15 and 16 already extend the same buffer. This is the sixth
// extension and the seventh vocabulary, and it is still one buffer.
//
// §52 says "do not track sensitive rule contents unnecessarily", and §28 says
// do not create duplicate systems. This is what both look like in practice: a
// phase whose whole subject is member-authored rules adds a vocabulary and an
// allow-list extension, and touches nothing else.
//
// ── The convention, unchanged since Phase 7 ──────────────────────────────────
//
//     domain.subject.verb        lower-case, dotted, past-tense verb
//
// `automation.*` and nothing else, so every event from this phase sorts
// together in a dashboard.
//
// ── The rule specific to this phase ──────────────────────────────────────────
//
// **An automation event must not carry what the automation is about.**
//
// Phase 15's equivalent rule was "an analytics event must not carry an
// analytics value". The exposure here is different and larger: an automation
// *is* a member's private intention, written down. A saved housing search
// states a budget and a neighbourhood. A government advisory automation states
// an immigration situation. A wallet threshold states a financial position. A
// religious-event filter states a belief.
//
// So the allow-list below registers **keys and counts and nothing else**:
//
//   `triggerKey`, `actionKey`, `templateId`, `ownerKind`, `domain`,
//   `conditionCount`, `actionCount`, `frequency`, `supportStatus`, `runStatus`,
//   `failureKind`, `automationCount`
//
// and deliberately **not**:
//
//   no `automationName`      — members write these freely and personally
//   no `conditionValue`      — the budget, the country, the threshold
//   no `subjectId`           — which event, which community, which listing
//   no `recipientCount`      — an audience size is a fact about a community
//   no `scheduleTime`        — a schedule is a routine, and a set of them is a
//                              pattern of life
//   no `countryCode`         — see the government note below
//
// **`countryCode` is the one worth defending explicitly.** It looks harmless
// and is the single most tempting property to add: it would answer "which
// countries use automation most?" But a stream of
// `automation.created · triggerKey=government.advisoryUpdated · countryCode=SY`
// is a record of who is watching asylum guidance for which country, which is
// the most sensitive inference available anywhere in this product. Phase 13's
// allow-list was shaped to prevent exactly this class, and the answer is the
// same: the trigger *key* answers every product question worth asking, and
// identifies nobody.
//
// The existing sanitiser drops anything not on the list before it reaches the
// buffer, so this is enforcement rather than intention.
// ─────────────────────────────────────────────────────────────────────────────

import {
  registerAllowedProperties,
  trackPlatformEvent,
  type EventProperties,
} from '@/lib/creator-analytics';
import type {
  AutomationDomainKey,
  AutomationFailureKind,
  AutomationFrequency,
  AutomationOwnerKind,
  AutomationRunStatus,
  AutomationSupportStatus,
} from '@/types/automation';

/**
 * Every automation event this phase emits.
 *
 * §52's list, plus the four the screens genuinely needed. `builder.abandoned`
 * is worth naming: the interesting number for a builder is how many people
 * start one and do not finish, and that cannot be derived from the others.
 */
export type AutomationEvent =
  // Surfaces
  | 'automation.center.viewed'
  | 'automation.templates.viewed'
  | 'automation.history.viewed'
  | 'automation.run.viewed'
  // Building
  | 'automation.builder.started'
  | 'automation.builder.abandoned'
  | 'automation.trigger.selected'
  | 'automation.condition.added'
  | 'automation.action.added'
  | 'automation.preview.viewed'
  | 'automation.tested'
  // Lifecycle — §52's list
  | 'automation.created'
  | 'automation.activated'
  | 'automation.paused'
  | 'automation.resumed'
  | 'automation.disabled'
  | 'automation.deleted'
  | 'automation.updated'
  // Execution
  | 'automation.executed'
  | 'automation.failed'
  // Templates
  | 'automation.template.used'
  // Saved searches — §30
  | 'automation.savedSearch.created'
  | 'automation.savedSearch.alertsToggled'
  | 'automation.savedSearch.deleted'
  // Dependencies — how often a member is blocked, and by what
  | 'automation.dependency.blocked'
  | 'automation.gap.encountered';

/**
 * The properties this phase is allowed to attach.
 *
 * Registered once at module load, exactly as Phases 8, 12, 13, 15 and 16 do.
 * Anything not here is dropped by the existing sanitiser — see the header for
 * what is deliberately absent and why.
 */
registerAllowedProperties([
  'triggerKey',
  'actionKey',
  'conditionKey',
  'templateId',
  'ownerKind',
  'domain',
  'conditionCount',
  'actionCount',
  'frequency',
  'timezoneMode',
  'supportStatus',
  'runStatus',
  'failureKind',
  'automationCount',
  'activeCount',
  'dependencyKind',
  'gapId',
  'savedSearchSubject',
  'criteriaCount',
  'alertFrequency',
  'source',
  'wasSimulated',
  'stepCount',
  'blame',
]);

/** The typed property bag. Every field optional; every field on the allow-list. */
export interface AutomationEventProperties extends EventProperties {
  triggerKey?: string;
  actionKey?: string;
  conditionKey?: string;
  templateId?: string;
  ownerKind?: AutomationOwnerKind;
  domain?: AutomationDomainKey;
  conditionCount?: number;
  actionCount?: number;
  frequency?: AutomationFrequency;
  timezoneMode?: string;
  supportStatus?: AutomationSupportStatus;
  runStatus?: AutomationRunStatus;
  failureKind?: AutomationFailureKind;
  automationCount?: number;
  activeCount?: number;
  dependencyKind?: string;
  gapId?: string;
  savedSearchSubject?: string;
  /** How many filters a saved search holds — never which, never their values. */
  criteriaCount?: number;
  alertFrequency?: string;
  source?: string;
  /**
   * §57: a simulated run must be distinguishable from a real one everywhere,
   * including in telemetry. Without this, test runs and real runs would be one
   * number and the platform's own success rate would be unmeasurable.
   */
  wasSimulated?: boolean;
  stepCount?: number;
  blame?: string;
}

/** Emit. The closed union means a typo is a compile error rather than a lost event. */
export function trackAutomationEvent(
  event: AutomationEvent,
  properties?: AutomationEventProperties
): void {
  trackPlatformEvent(event, properties);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for the events with more than one caller
//
// Named so the property set for one event is assembled in one place. Three
// screens each building a `automation.created` payload by hand is three chances
// to attach something the sanitiser then drops silently.
// ─────────────────────────────────────────────────────────────────────────────

/** §52's AutomationCreated. Shape only — never contents. */
export function trackAutomationCreated(input: {
  triggerKey: string;
  ownerKind: AutomationOwnerKind;
  domain: AutomationDomainKey;
  conditionCount: number;
  actionCount: number;
  support: AutomationSupportStatus;
  source: string;
  templateId?: string | null;
}): void {
  trackAutomationEvent('automation.created', {
    triggerKey: input.triggerKey,
    ownerKind: input.ownerKind,
    domain: input.domain,
    conditionCount: input.conditionCount,
    actionCount: input.actionCount,
    supportStatus: input.support,
    source: input.source,
    ...(input.templateId ? { templateId: input.templateId } : {}),
  });
}

/** §52's AutomationExecuted and AutomationFailed, from one call site. */
export function trackAutomationRun(input: {
  triggerKey: string;
  status: AutomationRunStatus;
  failureKind?: AutomationFailureKind | null;
  isSimulated: boolean;
}): void {
  const isFailure = input.status === 'FAILED' || input.status === 'TIMED_OUT';

  trackAutomationEvent(isFailure ? 'automation.failed' : 'automation.executed', {
    triggerKey: input.triggerKey,
    runStatus: input.status,
    wasSimulated: input.isSimulated,
    ...(input.failureKind ? { failureKind: input.failureKind } : {}),
  });
}

/**
 * A member met a gap.
 *
 * The most operationally useful event in this vocabulary: it converts the
 * backend gap register from a document into a ranked list of what members are
 * actually blocked by, which is a better prioritisation input than anybody's
 * estimate of importance.
 */
export function trackGapEncountered(gapId: string, triggerKey?: string): void {
  trackAutomationEvent('automation.gap.encountered', {
    gapId,
    ...(triggerKey ? { triggerKey } : {}),
  });
}
