// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation error normalisation (Frontend Phase 18, §38)
//
// §38 asks for eleven failure situations to be handled with actionable recovery
// guidance. This is the one place a transport failure, a provider failure or a
// backend gap becomes something a member can read and act on.
//
// ── Why this is the third error module and not a third error model ───────────
//
// The platform has two already and they are both good:
//
//   `financial-errors.ts`     B15's seventy codes, with isRetryable, isTerminal
//                             and isIndeterminate.
//   `integrations/errors.ts`  §32's vocabulary, wrapping the above and adding
//                             needsMemberAction.
//
// Building a third hierarchy beside them would mean a calendar failure inside
// an automation had a different representation from the same failure outside
// one. So this **wraps** `IntegrationError` rather than replacing it, exactly as
// that file wraps `FinancialError`, and carries every one of its four questions
// through unchanged.
//
// What this layer adds is the question automation asks and the other two do not:
//
//     **whose problem is it?**
//
// `blame` is that answer, and it is the difference between a screen that helps
// and a screen that accuses. Three values:
//
//   `member`    they can fix it. A revoked calendar permission, a disconnected
//               integration, an invalid configuration.
//   `platform`  the capability does not exist. §77 is explicit that a backend
//               gap must not be disguised as a frontend defect, and the UI
//               consequence is that this must never be rendered in the register
//               of things the member did wrong.
//   `transient` neither. A network blip, a rate limit, a provider having a bad
//               afternoon. Retry is the answer.
//
// Without it, every screen would re-derive it from the kind, and the first
// screen that got it wrong would tell somebody to reconnect their calendar
// because the automation platform does not exist yet.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import {
  IntegrationError,
  isIntegrationError,
  toIntegrationError,
} from '@/lib/integrations/errors';
import { AUTOMATION_GAPS } from '@/config/automation-gaps';
import type { AutomationFailureKind } from '@/types/automation';

/** Who can do something about this. See the file header. */
export type AutomationBlame = 'member' | 'platform' | 'transient';

export interface AutomationErrorShape {
  kind: AutomationFailureKind;
  /** A sentence to put in front of the member. Never an identifier, never a token. */
  message: string;
  /** The next step, when there is one. Null when there genuinely is not. */
  recoveryHint: string | null;
  blame: AutomationBlame;
  /** The gap this failure is explained by, when it is a gap rather than a fault. */
  gapId: string | null;
  isRetryable: boolean;
  isTerminal: boolean;
  /**
   * Whether the operation may have completed anyway. Carried through from
   * `IntegrationError` unchanged — §39's "do not encourage duplicate execution"
   * depends on it, and it is the field most easily lost in a re-wrap.
   */
  isIndeterminate: boolean;
  /** Only the member can unblock this — a permission, a reauthorization. */
  needsMemberAction: boolean;
  /** Seconds. Only ever set on rateLimited. */
  retryAfterSeconds: number | null;
  /** For a support conversation. Never a token, never a request body. §36. */
  correlationId: string | null;
  /** Where to send the member, when the hint has somewhere to go. */
  recoveryRoute: string | null;
}

export class AutomationError extends Error implements AutomationErrorShape {
  readonly kind: AutomationFailureKind;
  readonly recoveryHint: string | null;
  readonly blame: AutomationBlame;
  readonly gapId: string | null;
  readonly isRetryable: boolean;
  readonly isTerminal: boolean;
  readonly isIndeterminate: boolean;
  readonly needsMemberAction: boolean;
  readonly retryAfterSeconds: number | null;
  readonly correlationId: string | null;
  readonly recoveryRoute: string | null;

  constructor(shape: AutomationErrorShape) {
    super(shape.message);
    this.name = 'AutomationError';
    this.kind = shape.kind;
    this.recoveryHint = shape.recoveryHint;
    this.blame = shape.blame;
    this.gapId = shape.gapId;
    this.isRetryable = shape.isRetryable;
    this.isTerminal = shape.isTerminal;
    this.isIndeterminate = shape.isIndeterminate;
    this.needsMemberAction = shape.needsMemberAction;
    this.retryAfterSeconds = shape.retryAfterSeconds;
    this.correlationId = shape.correlationId;
    this.recoveryRoute = shape.recoveryRoute;
  }
}

export function isAutomationError(value: unknown): value is AutomationError {
  return value instanceof AutomationError;
}

/**
 * The refusal every function in the development arm produces in a release build.
 *
 * Blame is `platform` and `isRetryable` is false, which together mean no screen
 * shows a "Try again" button for something that will fail identically for ever.
 * §77: a backend gap is not disguised as a frontend defect, and the wording
 * below is the visible half of that rule.
 */
export function backendGapError(gapKey: string): AutomationError {
  const gap = AUTOMATION_GAPS[gapKey];

  return new AutomationError({
    kind: 'backendGap',
    message: gap
      ? `${gap.capability} is not available in this build yet.`
      : 'This automation capability is not available in this build yet.',
    recoveryHint:
      'Your configuration is saved and complete. It will start working when the platform capability ships — there is nothing for you to fix.',
    blame: 'platform',
    gapId: gap?.id ?? null,
    isRetryable: false,
    isTerminal: true,
    isIndeterminate: false,
    needsMemberAction: false,
    retryAfterSeconds: null,
    correlationId: null,
    recoveryRoute: null,
  });
}

/** The refusal for an action attempted while offline. §61. */
export function offlineError(what: string): AutomationError {
  return new AutomationError({
    kind: 'backendUnavailable',
    message: `${what} needs a connection, and nothing was sent.`,
    recoveryHint: 'Try again when you are back online. Nothing was changed.',
    blame: 'transient',
    gapId: null,
    isRetryable: true,
    isTerminal: false,
    // Nothing left the device, so there is no ambiguity about whether it
    // happened. Saying so is what stops a member retrying in fear of a
    // duplicate — §61 forbids claiming a server-side automation was activated
    // offline, and this is the other half of that honesty.
    isIndeterminate: false,
    needsMemberAction: false,
    retryAfterSeconds: null,
    correlationId: null,
    recoveryRoute: null,
  });
}

/** A configuration the member must correct before this can run. §38 · §43. */
export function invalidConfigurationError(
  message: string,
  recoveryHint: string,
  recoveryRoute: string | null = null
): AutomationError {
  return new AutomationError({
    kind: 'invalidConfiguration',
    message,
    recoveryHint,
    blame: 'member',
    gapId: null,
    isRetryable: false,
    isTerminal: false,
    isIndeterminate: false,
    needsMemberAction: true,
    retryAfterSeconds: null,
    correlationId: null,
    recoveryRoute,
  });
}

/**
 * A permission the server refused.
 *
 * Deliberately does not say *which* permission is missing beyond what the
 * server chose to say. §66: the shape of a community's governance is not
 * something an unauthorized member should be able to enumerate by trying
 * things and reading the errors.
 */
export function permissionDeniedError(message?: string): AutomationError {
  return new AutomationError({
    kind: 'permissionDenied',
    message: message ?? 'You do not have permission to do this.',
    recoveryHint: 'If you think this is wrong, an administrator of this space can check your role.',
    blame: 'member',
    gapId: null,
    isRetryable: false,
    isTerminal: true,
    isIndeterminate: false,
    needsMemberAction: true,
    retryAfterSeconds: null,
    correlationId: null,
    recoveryRoute: null,
  });
}

/**
 * Maps an `IntegrationError` into this vocabulary.
 *
 * The four questions are carried through rather than re-derived — particularly
 * `isIndeterminate`, which is the one field a re-wrap loses most easily and the
 * one §39 depends on.
 */
function fromIntegrationError(cause: IntegrationError): AutomationError {
  const kind = INTEGRATION_KIND_MAP[cause.kind] ?? 'actionFailed';

  const blame: AutomationBlame = cause.gapId
    ? 'platform'
    : cause.needsMemberAction
      ? 'member'
      : 'transient';

  return new AutomationError({
    kind,
    message: cause.message,
    recoveryHint: cause.hint ?? null,
    blame,
    gapId: cause.gapId ?? null,
    isRetryable: cause.isRetryable,
    isTerminal: cause.isTerminal,
    isIndeterminate: cause.isIndeterminate,
    needsMemberAction: cause.needsMemberAction,
    retryAfterSeconds: cause.retryAfterSeconds ?? null,
    correlationId: cause.correlationId ?? null,
    recoveryRoute: cause.needsMemberAction ? '/settings/integrations' : null,
  });
}

/**
 * Phase 16's error kinds, in this phase's vocabulary.
 *
 * A `Record` over a string index rather than the exact union, because
 * `IntegrationErrorKind` belongs to another phase and adding a member there
 * should not break this build — it should fall through to `actionFailed`, which
 * is the honest default for a failure this layer does not recognise.
 */
const INTEGRATION_KIND_MAP: Record<string, AutomationFailureKind> = {
  AuthenticationRequired: 'permissionDenied',
  PermissionDenied: 'permissionDenied',
  ProviderUnavailable: 'providerUnavailable',
  NetworkFailure: 'backendUnavailable',
  RateLimited: 'rateLimited',
  ConfigurationMissing: 'invalidConfiguration',
  BackendUnavailable: 'backendUnavailable',
  BackendGap: 'backendGap',
  InvalidRequest: 'invalidConfiguration',
  ExpiredCredential: 'integrationExpired',
  // Phase 16 uses `Conflict` for "already done" as well as for a genuine
  // collision, and §39 requires the first reading to win: a duplicate is a safe
  // completed state, never an error. A real collision is still visible through
  // the message the server supplied.
  Conflict: 'duplicateSuppressed',
  UnsupportedCapability: 'backendGap',
  UnknownError: 'actionFailed',
};

/**
 * Anything thrown, as an `AutomationError`.
 *
 * The order matters: an `AutomationError` passes through untouched, an
 * `IntegrationError` is mapped, and everything else goes through Phase 16's
 * normaliser first so an axios failure gets that module's status-code handling
 * rather than a second, divergent copy of it.
 */
export function toAutomationError(
  cause: unknown,
  options: { mutating?: boolean } = {}
): AutomationError {
  if (isAutomationError(cause)) return cause;
  if (isIntegrationError(cause)) return fromIntegrationError(cause);

  if (axios.isAxiosError(cause) || cause instanceof Error) {
    return fromIntegrationError(toIntegrationError(cause, { mutating: options.mutating ?? false }));
  }

  return new AutomationError({
    kind: 'actionFailed',
    message: 'Something went wrong.',
    recoveryHint: 'Try again in a moment.',
    blame: 'transient',
    gapId: null,
    isRetryable: true,
    isTerminal: false,
    isIndeterminate: false,
    needsMemberAction: false,
    retryAfterSeconds: null,
    correlationId: null,
    recoveryRoute: null,
  });
}

/**
 * Whether a failed query should be retried — §38's retry rules as one function.
 *
 * Never retries something the member must fix, never retries a gap, and never
 * retries something that may have happened anyway. The third is the one worth
 * naming: an indeterminate failure retried automatically is how one automation
 * activation becomes two.
 */
export function shouldRetryAutomation(failureCount: number, cause: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!isAutomationError(cause)) return true;
  if (cause.blame === 'platform') return false;
  if (cause.needsMemberAction || cause.isTerminal) return false;
  if (cause.isIndeterminate) return false;
  return cause.isRetryable;
}

/**
 * The member-facing guidance for a failure kind, when a run record carries a
 * kind but the server supplied no hint of its own. §38.
 *
 * Every entry names something the member can actually do, or says plainly that
 * there is nothing — which is a better answer than an encouraging sentence that
 * leads nowhere.
 */
export const FAILURE_RECOVERY: Record<
  AutomationFailureKind,
  { summary: string; hint: string; blame: AutomationBlame; route: string | null }
> = {
  triggerUnavailable: {
    summary: 'The event this watches for could not be observed.',
    hint: 'The platform cannot see this kind of event yet. Nothing is wrong with your setup.',
    blame: 'platform',
    route: null,
  },
  conditionEvaluationFailed: {
    summary: 'One of your conditions could not be checked.',
    hint: 'Open the automation and check that each condition still refers to something that exists.',
    blame: 'member',
    route: null,
  },
  actionFailed: {
    summary: 'An action did not complete.',
    hint: 'The run detail shows which one. You can run this again if it is safe to repeat.',
    blame: 'transient',
    route: null,
  },
  providerUnavailable: {
    summary: 'A connected service was unavailable.',
    hint: 'This usually resolves on its own. The next run will try again.',
    blame: 'transient',
    route: null,
  },
  backendUnavailable: {
    summary: 'Diaspora could not be reached.',
    hint: 'This usually resolves on its own. The next run will try again.',
    blame: 'transient',
    route: null,
  },
  permissionDenied: {
    summary: 'This automation no longer has permission to do what it was set up to do.',
    hint: 'Your role in this space may have changed. An administrator here can check.',
    blame: 'member',
    route: null,
  },
  rateLimited: {
    summary: 'This automation ran too often and was slowed down.',
    hint: 'Consider a less frequent schedule, or narrower conditions so it matches less often.',
    blame: 'member',
    route: null,
  },
  integrationExpired: {
    summary: 'A connection this automation uses needs reconnecting.',
    hint: 'Reconnect it, and this automation will start working again.',
    blame: 'member',
    route: '/settings/integrations',
  },
  invalidConfiguration: {
    summary: 'This automation is not set up correctly.',
    hint: 'Open it and check the highlighted step.',
    blame: 'member',
    route: null,
  },
  timeout: {
    summary: 'This run took too long and was stopped.',
    hint: 'If it keeps happening, simplifying the automation usually helps.',
    blame: 'transient',
    route: null,
  },
  duplicateSuppressed: {
    // §39: a duplicate is a **safe completed state**, not an error. The wording
    // and the tone both say so, because a member shown "error: duplicate" for a
    // system working correctly learns to distrust every other message.
    summary: 'This had already been done, so it was not repeated.',
    hint: 'Nothing is wrong. Diaspora avoided doing the same thing twice.',
    blame: 'transient',
    route: null,
  },
  backendGap: {
    summary: 'This capability does not exist on the platform yet.',
    hint: 'Your setup is complete and saved. There is nothing for you to fix.',
    blame: 'platform',
    route: null,
  },
};
