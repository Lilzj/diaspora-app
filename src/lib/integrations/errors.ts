// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration error normalisation (Frontend Phase 16, §32 · §33 · §57)
//
// §32's instruction is "screens must not need to understand raw provider error
// codes", and this is the one place where a provider's vocabulary is translated
// into the product's.
//
// ── Why this is not a second error model ─────────────────────────────────────
//
// The platform already has a good one: `financial-errors.ts` maps B15's seventy
// codes and carries the three questions a caller actually asks — is it
// retryable, is it terminal, did it possibly happen anyway. Building a second
// error hierarchy beside it would mean a payment failure had two
// representations depending on which layer caught it.
//
// So this file **wraps rather than replaces**. `fromFinancialError` maps the
// existing model into §32's vocabulary and carries `isIndeterminate` through
// unchanged, because that field is the whole of §26's "do not assume a payment
// succeeded because the client returned" — and its mirror, which is easier to
// get wrong: do not assume it failed because the client did not.
//
// ── The three questions, and the one this phase adds ─────────────────────────
//
//   isRetryable      may the same request be sent again as-is?
//   isTerminal       is the operation definitively over?
//   isIndeterminate  did it possibly happen anyway?
//   needsMemberAction  ← this phase's addition
//
// The fourth exists because integrations fail in a way payments do not: about
// a third of integration failures are not failures at all but a *permission
// state* the member alone can change. A denied calendar permission is not
// retryable, not terminal, and not indeterminate — retrying it will fail
// identically for ever, and the only thing that helps is opening Settings.
// Without a field for that, every screen would re-derive it from the kind, and
// the first screen that forgot would show a "Try again" button that cannot
// work.
//
// ── What never reaches a member ──────────────────────────────────────────────
//
// A provider's own message. Google returns "Request had insufficient
// authentication scopes", which is accurate, unactionable, and in the wrong
// register for somebody who just tapped "Add to calendar". Every message below
// is written for the person reading it. The provider's text is available to
// `correlationId`-based support lookups on the server and is deliberately not
// carried on the client — a provider payload is exactly the kind of thing that
// ends up in a crash report with a token in it (§38, §56).
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { FinancialError } from '@/lib/financial-errors';
import type {
  IntegrationCapability,
  IntegrationErrorKind,
  IntegrationErrorSummary,
  IntegrationProviderId,
} from '@/types/integrations';

export interface IntegrationErrorShape {
  kind: IntegrationErrorKind;
  /** A sentence to put in front of the member. Never contains an identifier or a token. */
  message: string;
  /** A second line offering the next step, when there is one. */
  hint?: string;
  provider?: IntegrationProviderId | null;
  capability?: IntegrationCapability | null;
  /** The gap this failure is explained by, when it is a gap rather than a fault. */
  gapId?: string | null;
  isRetryable: boolean;
  isTerminal: boolean;
  /** Whether the operation may have completed anyway. Never shown as a failure. */
  isIndeterminate: boolean;
  /** Whether only the member can unblock this — a permission, a reauthorization. */
  needsMemberAction: boolean;
  /** Seconds. Only ever set on RateLimited (§57). */
  retryAfterSeconds?: number | null;
  /** For a support conversation. Never a token, never a request body (§56). */
  correlationId?: string | null;
}

export class IntegrationError extends Error implements IntegrationErrorShape {
  readonly kind: IntegrationErrorKind;
  readonly hint?: string;
  readonly provider?: IntegrationProviderId | null;
  readonly capability?: IntegrationCapability | null;
  readonly gapId?: string | null;
  readonly isRetryable: boolean;
  readonly isTerminal: boolean;
  readonly isIndeterminate: boolean;
  readonly needsMemberAction: boolean;
  readonly retryAfterSeconds?: number | null;
  readonly correlationId?: string | null;

  constructor(shape: IntegrationErrorShape) {
    super(shape.message);
    this.name = 'IntegrationError';
    this.kind = shape.kind;
    this.hint = shape.hint;
    this.provider = shape.provider ?? null;
    this.capability = shape.capability ?? null;
    this.gapId = shape.gapId ?? null;
    this.isRetryable = shape.isRetryable;
    this.isTerminal = shape.isTerminal;
    this.isIndeterminate = shape.isIndeterminate;
    this.needsMemberAction = shape.needsMemberAction;
    this.retryAfterSeconds = shape.retryAfterSeconds ?? null;
    this.correlationId = shape.correlationId ?? null;
  }

  /** The renderable subset. What goes into an `IntegrationConnection.lastError`. */
  toSummary(occurredAt: string): IntegrationErrorSummary {
    return {
      kind: this.kind,
      message: this.message,
      occurredAt,
      correlationId: this.correlationId,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}

export function isIntegrationError(error: unknown): error is IntegrationError {
  return error instanceof IntegrationError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-kind defaults
//
// The behavioural facts about each kind, in one table, so a screen never has to
// reason about whether `RateLimited` is terminal (it is not) or whether
// `UnsupportedCapability` is retryable (it is not, ever).
// ─────────────────────────────────────────────────────────────────────────────

interface KindDefaults {
  message: string;
  hint?: string;
  isRetryable: boolean;
  isTerminal: boolean;
  needsMemberAction: boolean;
}

const KIND_DEFAULTS: Record<IntegrationErrorKind, KindDefaults> = {
  AuthenticationRequired: {
    message: 'You need to sign in again to continue.',
    hint: 'Your session has ended.',
    isRetryable: false,
    isTerminal: false,
    needsMemberAction: true,
  },
  PermissionDenied: {
    message: 'Diaspora does not have permission to do that.',
    hint: 'You can change this in your device settings.',
    isRetryable: false,
    isTerminal: false,
    // The defining case for the fourth field. Retrying is pointless; opening
    // Settings is the only thing that helps.
    needsMemberAction: true,
  },
  ProviderUnavailable: {
    message: 'The service is not responding right now.',
    hint: 'This is usually temporary. Try again in a few minutes.',
    isRetryable: true,
    isTerminal: false,
    needsMemberAction: false,
  },
  NetworkFailure: {
    message: 'No connection.',
    hint: 'Check your connection and try again.',
    isRetryable: true,
    isTerminal: false,
    needsMemberAction: false,
  },
  RateLimited: {
    message: 'Too many attempts.',
    hint: 'Please wait before trying again.',
    // Retryable, but only after the interval. `retryAfterSeconds` carries it and
    // §57 forbids hammering the provider in the meantime.
    isRetryable: true,
    isTerminal: false,
    needsMemberAction: false,
  },
  ConfigurationMissing: {
    message: 'This integration is not set up in this version of the app.',
    hint: 'Nothing you can do will change this — it needs a new release.',
    isRetryable: false,
    isTerminal: true,
    needsMemberAction: false,
  },
  BackendUnavailable: {
    message: 'Diaspora could not be reached.',
    hint: 'Check your connection and try again.',
    isRetryable: true,
    isTerminal: false,
    needsMemberAction: false,
  },
  BackendGap: {
    message: 'This is not available yet.',
    hint: 'The rest of this screen works; this one capability is still being built.',
    isRetryable: false,
    isTerminal: true,
    needsMemberAction: false,
  },
  InvalidRequest: {
    message: 'That request could not be completed.',
    isRetryable: false,
    isTerminal: true,
    needsMemberAction: false,
  },
  ExpiredCredential: {
    message: 'Your connection to this service has expired.',
    hint: 'Reconnect to continue using it.',
    isRetryable: false,
    isTerminal: false,
    needsMemberAction: true,
  },
  Conflict: {
    message: 'That conflicts with something that already exists.',
    isRetryable: false,
    isTerminal: false,
    needsMemberAction: true,
  },
  UnsupportedCapability: {
    message: 'This service cannot do that.',
    hint: 'Try a different one, if another is connected.',
    isRetryable: false,
    isTerminal: true,
    needsMemberAction: false,
  },
  UnknownError: {
    message: 'Something went wrong.',
    hint: 'Try again. If it keeps happening, let us know.',
    isRetryable: true,
    isTerminal: false,
    needsMemberAction: false,
  },
};

/**
 * Build an error of a known kind.
 *
 * `overrides` exists for the cases where an adapter genuinely knows better —
 * a `Conflict` that is specifically "this Google account is already linked to
 * another Diaspora account" deserves that sentence rather than the generic one.
 * Everything not overridden comes from the table, so the behavioural fields
 * cannot drift between adapters.
 */
export function integrationError(
  kind: IntegrationErrorKind,
  overrides: Partial<Omit<IntegrationErrorShape, 'kind'>> = {}
): IntegrationError {
  const defaults = KIND_DEFAULTS[kind];

  return new IntegrationError({
    kind,
    message: overrides.message ?? defaults.message,
    hint: overrides.hint ?? defaults.hint,
    isRetryable: overrides.isRetryable ?? defaults.isRetryable,
    isTerminal: overrides.isTerminal ?? defaults.isTerminal,
    isIndeterminate: overrides.isIndeterminate ?? false,
    needsMemberAction: overrides.needsMemberAction ?? defaults.needsMemberAction,
    provider: overrides.provider,
    capability: overrides.capability,
    gapId: overrides.gapId,
    retryAfterSeconds: overrides.retryAfterSeconds,
    correlationId: overrides.correlationId,
  });
}

/**
 * The refusal a provider returns when the capability exists only as a gap.
 *
 * Separate from a generic `BackendGap` so the message names the gap, which is
 * what makes a screenshot of the state actionable — "not available yet" tells
 * a reviewer nothing, and "not available yet · FRONTEND-PHASE16-GAP-004" tells
 * them exactly which ticket to look at.
 */
export function backendGapError(
  gapId: string,
  capability: string,
  provider?: IntegrationProviderId
): IntegrationError {
  return integrationError('BackendGap', {
    // The id is in the **message**, not only in the hint. A screen renders the
    // hint; a log, a stack trace and a `rejects.toThrow` match on the message,
    // and those are exactly the places where "not available in this build" with
    // no identifier wastes somebody's afternoon. It costs a member nothing —
    // the gap notice component renders `gap.capability` and the id separately
    // rather than echoing this string.
    message: `${capability} is not available in this build (${gapId}).`,
    hint: `This needs a backend capability that does not exist yet (${gapId}).`,
    gapId,
    provider,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation from the models that already exist
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map B15's error model into §32's vocabulary.
 *
 * `isIndeterminate` is carried through rather than recomputed. It is the field
 * §26 and §30 both depend on, and a second derivation of it would eventually
 * disagree with the first — at which point a payment that may have succeeded
 * gets a failure screen.
 */
export function fromFinancialError(
  error: FinancialError,
  provider?: IntegrationProviderId
): IntegrationError {
  const kind: IntegrationErrorKind = (() => {
    switch (error.kind) {
      case 'unauthenticated':
        return 'AuthenticationRequired';
      case 'forbidden':
        return 'PermissionDenied';
      case 'conflict':
        return 'Conflict';
      case 'validation':
        return 'InvalidRequest';
      case 'rateLimited':
        return 'RateLimited';
      case 'unavailable':
      case 'server':
        return 'BackendUnavailable';
      case 'network':
      case 'timeout':
      case 'offline':
        return 'NetworkFailure';
      case 'notFound':
        // A 404 on an integration route is nearly always the contract not
        // existing rather than the record not existing, and calling it
        // `InvalidRequest` would send a reviewer looking for a client bug.
        return 'BackendGap';
      case 'refused':
      case 'unknown':
      default:
        return 'UnknownError';
    }
  })();

  return new IntegrationError({
    kind,
    // B15's per-code copy is already written for members — `financial-errors.ts`
    // exists precisely to produce it — so it is used rather than replaced by a
    // generic sentence, which would be a regression in message quality.
    message: error.message,
    hint: error.hint,
    provider: provider ?? 'payments.platform',
    isRetryable: error.isRetryable,
    isTerminal: error.isTerminal,
    isIndeterminate: error.isIndeterminate,
    needsMemberAction: kind === 'AuthenticationRequired' || kind === 'PermissionDenied',
  });
}

/**
 * The platform's own error codes, read before the status.
 *
 * Added 5 Oct 2026. The mapping below used to look only at the status, so the
 * deployment's two ordinary answers for a remote calendar — no adapter
 * contracted (400 `provider.not-configured`) and no account connected (404
 * `connection.not-found`) — became "That request could not be completed" and
 * "This is not available yet". The first is what every member saw under Google
 * Calendar in "Add to calendar". The code is in `code`, which is where
 * `PlatformProblem.Enrich` writes it (see `financial-errors.ts`).
 */
const PLATFORM_CODES: Record<
  string,
  { kind: IntegrationErrorKind; message: string; hint?: string; needsMemberAction?: boolean }
> = {
  'integrations.provider.not-configured': {
    kind: 'ConfigurationMissing',
    message: 'Not available on Diaspora yet.',
    hint: 'It has to be set up on Diaspora’s side. There is nothing to change on your phone.',
  },
  'integrations.connection.not-found': {
    kind: 'ExpiredCredential',
    message: 'You have not connected this account.',
    hint: 'Connect it from Settings, under Integrations.',
    needsMemberAction: true,
  },
  'integrations.connection.reauthorization-required': {
    kind: 'ExpiredCredential',
    message: 'Your connection to this service has expired.',
    hint: 'Reconnect it from Settings, under Integrations.',
    needsMemberAction: true,
  },
};

/** The code a platform problem carries, mapped to §32's vocabulary, or null. */
export function fromPlatformCode(
  body: unknown,
  context: { provider?: IntegrationProviderId; capability?: IntegrationCapability } = {}
): IntegrationError | null {
  const code =
    body && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string'
      ? (body as { code: string }).code
      : undefined;
  const known = code ? PLATFORM_CODES[code] : undefined;
  if (!known) return null;

  return integrationError(known.kind, {
    provider: context.provider,
    capability: context.capability,
    message: known.message,
    hint: known.hint,
    ...(known.needsMemberAction !== undefined ? { needsMemberAction: known.needsMemberAction } : {}),
  });
}

/**
 * Last-resort normalisation for anything an adapter did not classify.
 *
 * `mutating` matters for the same reason it does in `financial-api.ts`: a
 * transport failure on a write is an *unknown* outcome, not a failed one. A
 * calendar write that timed out may well have created the event, and reporting
 * it as failed invites the member to try again and produce a duplicate.
 */
export function toIntegrationError(
  cause: unknown,
  context: {
    provider?: IntegrationProviderId;
    capability?: IntegrationCapability;
    mutating?: boolean;
  } = {}
): IntegrationError {
  if (isIntegrationError(cause)) return cause;
  if (cause instanceof FinancialError) return fromFinancialError(cause, context.provider);

  const mutating = context.mutating ?? false;

  if (axios.isAxiosError(cause)) {
    const status = cause.response?.status;

    if (!cause.response) {
      return integrationError('NetworkFailure', {
        provider: context.provider,
        capability: context.capability,
        isIndeterminate: mutating,
      });
    }

    const byCode = fromPlatformCode(cause.response.data, context);
    if (byCode) return byCode;

    if (status === 401) {
      return integrationError('AuthenticationRequired', {
        provider: context.provider,
        capability: context.capability,
      });
    }
    if (status === 403) {
      return integrationError('PermissionDenied', {
        provider: context.provider,
        capability: context.capability,
      });
    }
    if (status === 404) {
      return integrationError('BackendGap', {
        provider: context.provider,
        capability: context.capability,
      });
    }
    if (status === 409) {
      return integrationError('Conflict', {
        provider: context.provider,
        capability: context.capability,
      });
    }
    if (status === 429) {
      return integrationError('RateLimited', {
        provider: context.provider,
        capability: context.capability,
        retryAfterSeconds: parseRetryAfter(cause.response.headers?.['retry-after']),
      });
    }
    if (status && status >= 500) {
      return integrationError('BackendUnavailable', {
        provider: context.provider,
        capability: context.capability,
        // A 5xx on a write is genuinely unknown. The server may have completed
        // the work and failed to say so.
        isIndeterminate: mutating,
      });
    }

    return integrationError('InvalidRequest', {
      provider: context.provider,
      capability: context.capability,
    });
  }

  return integrationError('UnknownError', {
    provider: context.provider,
    capability: context.capability,
    isIndeterminate: mutating,
  });
}

/**
 * §57's `Retry-After`, in seconds.
 *
 * The header is either a number of seconds or an HTTP date; both are accepted
 * because providers use both and a client that understood only one would fall
 * back to hammering. An unparseable value returns null, and the caller uses its
 * own conservative default rather than retrying immediately.
 */
export function parseRetryAfter(header: unknown): number | null {
  if (typeof header === 'number' && Number.isFinite(header)) return Math.max(0, Math.round(header));
  if (typeof header !== 'string' || header.trim() === '') return null;

  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds)) return Math.max(0, Math.round(asSeconds));

  const asDate = Date.parse(header);
  if (Number.isNaN(asDate)) return null;

  return Math.max(0, Math.round((asDate - Date.now()) / 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// §33 — retry policy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capabilities that must never be retried automatically, whatever the error
 * says — §33's list, as a set the retry function consults.
 *
 * The rule and the exception both matter. Retrying a *read* is always fine.
 * Retrying a write whose contract guarantees idempotency is fine too, and
 * `calendar.event.create` is only absent from this list because
 * FRONTEND-PHASE16-GAP-004 makes the idempotency key mandatory — remove that
 * requirement from the contract and the capability belongs here.
 */
const NEVER_AUTO_RETRY: ReadonlySet<IntegrationCapability> = new Set([
  'payments.initialize',
  'payments.authorize',
  'payments.confirm',
  'payments.refund',
  'identity.signIn',
  'identity.link',
  'identity.unlink',
  'sms.verification',
  'email.change',
]);

/**
 * Whether an automatic retry is safe here.
 *
 * Three conditions, all required. The capability must not be in §33's list, the
 * error must say it is retryable, and — the one that is easy to miss — the
 * outcome must not be indeterminate. An indeterminate write is the case where
 * retrying is *most* tempting and *most* dangerous: the operation may have
 * succeeded, and a retry would do it twice.
 */
export function canAutoRetry(
  error: IntegrationError,
  capability: IntegrationCapability
): boolean {
  if (NEVER_AUTO_RETRY.has(capability)) return false;
  if (error.isIndeterminate) return false;
  if (error.isTerminal) return false;
  return error.isRetryable;
}

/**
 * How long to wait before attempt `attempt` (1-based).
 *
 * Exponential with full jitter, capped. The jitter is not decoration: without
 * it, every device that failed against a provider outage retries at the same
 * instant, and the retry storm is what keeps the provider down. The cap exists
 * because a member watching a spinner will not wait 32 seconds, and a longer
 * delay should surface as "try again" rather than as a longer spinner.
 *
 * A server-supplied `retryAfterSeconds` always wins — §57 says to honour
 * Retry-After when it is provided, and a provider that has told us when to come
 * back knows better than this curve does.
 */
export function retryDelayMs(error: IntegrationError, attempt: number): number {
  if (error.retryAfterSeconds != null) return error.retryAfterSeconds * 1000;

  const base = Math.min(1000 * 2 ** Math.max(0, attempt - 1), 8000);
  return Math.round(base * (0.5 + Math.random() * 0.5));
}
