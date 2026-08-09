// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Error, retry, status and linking rules
// (Frontend Phase 16, §24 · §31 · §32 · §33 · §41 · §57)
//
// Four small domains, tested together because each is a table of rules rather
// than a subsystem, and because the rules interact: a `PermissionDenied` error
// produces a `PERMISSION_DENIED` status, which offers "Open settings" rather
// than "Try again", and is not auto-retryable. Split across four files, the
// interaction would be untested.
// ─────────────────────────────────────────────────────────────────────────────

import {
  canAutoRetry,
  fromFinancialError,
  integrationError,
  isIntegrationError,
  parseRetryAfter,
  retryDelayMs,
  toIntegrationError,
} from '@/lib/integrations/errors';
import {
  isActionable,
  isBlockedByBuild,
  isProductionConnected,
  isUsable,
  neverSynced,
  primaryAction,
  requiresSimulationMarker,
  statusDescription,
  statusForError,
  statusLabel,
  summariseSync,
  syncDescription,
  withDisconnect,
  withError,
  withSync,
} from '@/lib/integrations/status';
import { applyUnlinkRules, alreadyLinked, describeAccount } from '@/lib/integrations/identity';
import { FinancialError } from '@/lib/financial-errors';
import { INTEGRATION_ERROR_KINDS, INTEGRATION_STATUSES } from '@/types/integrations';
import type { IdentityLink, IntegrationConnection } from '@/types/integrations';

// ═════════════════════════════════════════════════════════════════════════════
// §32 — the error model
// ═════════════════════════════════════════════════════════════════════════════

describe('§32 · every provider failure becomes one of thirteen product errors', () => {
  it.each(INTEGRATION_ERROR_KINDS)('%s has member-facing copy', (kind) => {
    const error = integrationError(kind);
    expect(error.message.length).toBeGreaterThan(5);
    // No enum names, no provider codes, no jargon leaking into the message.
    expect(error.message).not.toMatch(/[A-Z]{2,}_[A-Z]/);
  });

  it('a permission denial needs the member, not a retry', () => {
    // The distinction the fourth field exists for. Retrying a refused
    // permission fails identically for ever; only Settings helps.
    const error = integrationError('PermissionDenied');
    expect(error.needsMemberAction).toBe(true);
    expect(error.isRetryable).toBe(false);
  });

  it('a gap is terminal and needs nobody', () => {
    const error = integrationError('BackendGap');
    expect(error.isTerminal).toBe(true);
    expect(error.needsMemberAction).toBe(false);
  });

  it('a rate limit is retryable but not immediately', () => {
    const error = integrationError('RateLimited', { retryAfterSeconds: 30 });
    expect(error.isRetryable).toBe(true);
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('an expired credential is recoverable by reauthorizing', () => {
    const error = integrationError('ExpiredCredential');
    expect(error.needsMemberAction).toBe(true);
    expect(error.isTerminal).toBe(false);
  });
});

describe('§32 · B15’s error model is reused rather than replaced', () => {
  it('carries `isIndeterminate` through unchanged', () => {
    // The field §26 and §30 both depend on. A second derivation of it would
    // eventually disagree with the first, and a payment that may have succeeded
    // would get a failure screen.
    const financial = new FinancialError({
      kind: 'timeout',
      message: 'The payment is being confirmed.',
      isRetryable: false,
      isTerminal: false,
      isIndeterminate: true,
    });

    const converted = fromFinancialError(financial);
    expect(converted.isIndeterminate).toBe(true);
    expect(converted.kind).toBe('NetworkFailure');
  });

  it('keeps B15’s per-code copy rather than replacing it with a generic sentence', () => {
    const financial = new FinancialError({
      kind: 'refused',
      code: 'financial.wallet.insufficient_funds',
      message: 'There is not enough in your wallet.',
      hint: 'Top up and try again.',
      isRetryable: false,
      isTerminal: true,
      isIndeterminate: false,
    });

    expect(fromFinancialError(financial).message).toBe('There is not enough in your wallet.');
    expect(fromFinancialError(financial).hint).toBe('Top up and try again.');
  });

  it('maps a 404 on an integration route to a gap, not a client bug', () => {
    const axiosLike = {
      isAxiosError: true,
      response: { status: 404, headers: {} },
      config: {},
      name: 'AxiosError',
      message: 'Request failed',
      toJSON: () => ({}),
    };

    const converted = toIntegrationError(axiosLike as never);
    expect(converted.kind).toBe('BackendGap');
  });

  it('classifies a transport failure on a write as indeterminate', () => {
    const axiosLike = {
      isAxiosError: true,
      response: undefined,
      config: {},
      name: 'AxiosError',
      message: 'Network Error',
      toJSON: () => ({}),
    };

    const write = toIntegrationError(axiosLike as never, { mutating: true });
    const read = toIntegrationError(axiosLike as never, { mutating: false });

    expect(write.isIndeterminate).toBe(true);
    expect(read.isIndeterminate).toBe(false);
  });

  it('an IntegrationError passes through untouched', () => {
    const original = integrationError('Conflict', { message: 'Already linked.' });
    expect(toIntegrationError(original)).toBe(original);
    expect(isIntegrationError(original)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §33 · §57 — retry
// ═════════════════════════════════════════════════════════════════════════════

describe('§33 · retries are refused where they would be dangerous', () => {
  const error = integrationError('NetworkFailure');

  it.each([
    'payments.initialize',
    'payments.authorize',
    'payments.confirm',
    'payments.refund',
    'identity.signIn',
    'identity.link',
    'identity.unlink',
    'sms.verification',
    'email.change',
  ] as const)('never auto-retries %s', (capability) => {
    expect(canAutoRetry(error, capability)).toBe(false);
  });

  it('does auto-retry a read', () => {
    expect(canAutoRetry(error, 'calendar.list')).toBe(true);
  });

  it('never retries an indeterminate outcome, whatever the capability', () => {
    // The case where retrying is most tempting and most dangerous: the
    // operation may have succeeded, and a retry would do it twice.
    const indeterminate = integrationError('NetworkFailure', { isIndeterminate: true });
    expect(canAutoRetry(indeterminate, 'calendar.list')).toBe(false);
  });

  it('never retries a terminal error', () => {
    expect(canAutoRetry(integrationError('BackendGap'), 'calendar.list')).toBe(false);
  });
});

describe('§57 · Retry-After is honoured when the provider sends one', () => {
  it('parses a seconds value', () => {
    expect(parseRetryAfter('30')).toBe(30);
    expect(parseRetryAfter(30)).toBe(30);
  });

  it('parses an HTTP date', () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const parsed = parseRetryAfter(future);
    expect(parsed).not.toBeNull();
    expect(parsed as number).toBeGreaterThan(50);
    expect(parsed as number).toBeLessThanOrEqual(61);
  });

  it('returns null for anything unparseable rather than zero', () => {
    // Zero would mean "retry immediately", which is the opposite of what a
    // Retry-After header we could not read implies.
    expect(parseRetryAfter('soon')).toBeNull();
    expect(parseRetryAfter(undefined)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
  });

  it('a server interval wins over the backoff curve', () => {
    const error = integrationError('RateLimited', { retryAfterSeconds: 45 });
    expect(retryDelayMs(error, 1)).toBe(45_000);
  });

  it('the backoff grows and is capped', () => {
    const error = integrationError('NetworkFailure');
    const early = retryDelayMs(error, 1);
    const late = retryDelayMs(error, 10);

    expect(late).toBeGreaterThanOrEqual(early);
    // Capped: a member watching a spinner will not wait 32 seconds, and a
    // longer wait should surface as "try again" rather than as a longer spinner.
    expect(late).toBeLessThanOrEqual(8000);
  });

  it('the backoff is jittered, so devices do not retry in lockstep', () => {
    // Without jitter, every device that failed against a provider outage
    // retries at the same instant, and the retry storm is what keeps the
    // provider down.
    const error = integrationError('NetworkFailure');
    const samples = new Set(Array.from({ length: 20 }, () => retryDelayMs(error, 3)));
    expect(samples.size).toBeGreaterThan(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §31 — the status model
// ═════════════════════════════════════════════════════════════════════════════

describe('§31 · one status model, thirteen states', () => {
  it.each(INTEGRATION_STATUSES)('%s has a label and a description', (status) => {
    expect(statusLabel(status).length).toBeGreaterThan(2);
    expect(statusDescription(status, 'REAL_PROVIDER').length).toBeGreaterThan(5);
    // The enum name must never reach a member.
    expect(statusLabel(status)).not.toBe(status);
  });

  it('maps each failure to its own recovery rather than to a shrug', () => {
    expect(statusForError(integrationError('PermissionDenied'))).toBe('PERMISSION_DENIED');
    expect(statusForError(integrationError('ExpiredCredential'))).toBe('REAUTH_REQUIRED');
    expect(statusForError(integrationError('AuthenticationRequired'))).toBe('REAUTH_REQUIRED');
    expect(statusForError(integrationError('BackendGap'))).toBe('BACKEND_GAP');
    expect(statusForError(integrationError('ConfigurationMissing'))).toBe('UNAVAILABLE');
    expect(statusForError(integrationError('UnknownError'))).toBe('ERROR');
  });

  it('offers no action for a state no member action can change', () => {
    // A button that cannot work is worse than no button.
    expect(primaryAction('UNAVAILABLE')).toBeNull();
    expect(primaryAction('BACKEND_GAP')).toBeNull();
    expect(primaryAction('CONNECTING')).toBeNull();
  });

  it('offers the right action for each recoverable state', () => {
    expect(primaryAction('PERMISSION_DENIED')?.kind).toBe('settings');
    expect(primaryAction('REAUTH_REQUIRED')?.kind).toBe('reconnect');
    expect(primaryAction('ERROR')?.kind).toBe('retry');
    expect(primaryAction('NOT_CONNECTED')?.kind).toBe('connect');
    expect(primaryAction('CONNECTED')?.kind).toBe('disconnect');
  });

  it('keeps three kinds of "you cannot do this" apart', () => {
    // "You have not turned this on", "your phone cannot do this" and "we have
    // not built this yet" read very differently to a member, and collapsing
    // them blames them for a missing backend contract.
    expect(isActionable('NOT_CONNECTED')).toBe(true);
    expect(isBlockedByBuild('UNAVAILABLE')).toBe(true);
    expect(isBlockedByBuild('BACKEND_GAP')).toBe(true);
    expect(isActionable('UNAVAILABLE')).toBe(false);
    expect(isActionable('BACKEND_GAP')).toBe(false);
  });
});

describe('§69 · status and mode are two axes and stay two', () => {
  it('a connected simulation is not a production connection', () => {
    expect(isUsable('CONNECTED')).toBe(true);
    expect(isProductionConnected('CONNECTED', 'DEVELOPMENT_PROVIDER')).toBe(false);
    expect(isProductionConnected('CONNECTED', 'BACKEND_CONNECTED')).toBe(true);
  });

  it('a simulated mode always demands its marker', () => {
    expect(requiresSimulationMarker('DEVELOPMENT_PROVIDER')).toBe(true);
    expect(requiresSimulationMarker('REAL_PROVIDER')).toBe(false);
    expect(requiresSimulationMarker('BACKEND_GAP')).toBe(false);
  });

  it('the description overrides itself for a simulated connection', () => {
    // Whatever the status would otherwise say, a simulated connection says so.
    expect(statusDescription('CONNECTED', 'DEVELOPMENT_PROVIDER')).toMatch(/development build/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §41 — disconnect
// ═════════════════════════════════════════════════════════════════════════════

describe('§41 · a disconnect leaves nothing stale', () => {
  const connected: IntegrationConnection = {
    provider: 'calendar.google',
    domain: 'calendar',
    status: 'CONNECTED',
    mode: 'DEVELOPMENT_PROVIDER',
    account: { externalId: 'x', accountLabel: 'a@example.com' },
    grantedCapabilities: ['calendar.event.create'],
    scopes: ['calendar.events'],
    expiresAt: '2026-12-01T00:00:00.000Z',
    lastSyncedAt: '2026-08-01T00:00:00.000Z',
    lastError: null,
    gapId: null,
    observedAt: '2026-08-09T09:00:00.000Z',
  };

  it('clears the account, not only the status', () => {
    // "Disconnected · a@example.com" reads as a connection in a bad state
    // rather than as an absence.
    const result = withDisconnect(connected, '2026-08-09T10:00:00.000Z');

    expect(result.status).toBe('DISCONNECTED');
    expect(result.account).toBeNull();
    expect(result.grantedCapabilities).toEqual([]);
    expect(result.scopes).toEqual([]);
    expect(result.expiresAt).toBeNull();
    expect(result.lastSyncedAt).toBeNull();
    expect(result.lastError).toBeNull();
  });

  it('an error keeps the account so the reconnect prompt can name it', () => {
    // "Reconnect a@example.com" is a materially better prompt than "Connect a
    // Google account" when a member has three.
    const result = withError(
      connected,
      integrationError('ExpiredCredential'),
      '2026-08-09T10:00:00.000Z'
    );

    expect(result.status).toBe('REAUTH_REQUIRED');
    expect(result.account).not.toBeNull();
  });

  it('a non-recoverable error drops the capabilities', () => {
    // Leaving them populated is how a screen offers an action that will
    // immediately fail again.
    const result = withError(connected, integrationError('UnknownError'), '2026-08-09T10:00:00.000Z');
    expect(result.grantedCapabilities).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §35 — sync
// ═════════════════════════════════════════════════════════════════════════════

describe('§35 · synchronisation is never claimed without confirmation', () => {
  const connected: IntegrationConnection = {
    provider: 'calendar.google',
    domain: 'calendar',
    status: 'CONNECTED',
    mode: 'DEVELOPMENT_PROVIDER',
    account: null,
    grantedCapabilities: [],
    scopes: [],
    lastSyncedAt: null,
    lastError: null,
    observedAt: '2026-08-09T09:00:00.000Z',
  };

  it('a sync with no server timestamp does not become SYNCED', () => {
    // The enforcement: there is no path from a local success to `SYNCED`. An
    // adapter that forgot to carry the timestamp degrades to the weaker, true
    // claim rather than the stronger, false one.
    const sync = { ...summariseSync([{ ok: true }], null), lastSyncedAt: null };
    const result = withSync(connected, sync, '2026-08-09T10:00:00.000Z');

    expect(result.status).toBe('CONNECTED');
    expect(result.status).not.toBe('SYNCED');
  });

  it('a confirmed sync does become SYNCED', () => {
    const sync = summariseSync([{ ok: true }], '2026-08-09T09:59:00.000Z');
    const result = withSync(connected, sync, '2026-08-09T10:00:00.000Z');
    expect(result.status).toBe('SYNCED');
  });

  it('a partial outcome is neither success nor failure', () => {
    // Rounding it to either is how a member ends up believing an event reached
    // their calendar when it did not.
    const sync = summariseSync(
      [{ ok: true }, { ok: false, reason: 'Read-only calendar' }],
      '2026-08-09T09:59:00.000Z'
    );

    expect(sync.phase).toBe('partial');
    expect(sync.itemsSynced).toBe(1);
    expect(sync.itemsFailed).toBe(1);
    expect(sync.needsAttention).toBe(true);
    expect(withSync(connected, sync, 'now').status).toBe('PARTIALLY_CONNECTED');
  });

  it('deduplicates failure reasons', () => {
    const sync = summariseSync(
      [
        { ok: false, reason: 'Read-only calendar' },
        { ok: false, reason: 'Read-only calendar' },
      ],
      null
    );
    expect(sync.failureReasons).toEqual(['Read-only calendar']);
  });

  it('never-synced is distinct from synced-nothing', () => {
    expect(neverSynced().phase).toBe('never');
    expect(syncDescription(neverSynced())).not.toMatch(/up to date/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §24 — account linking
// ═════════════════════════════════════════════════════════════════════════════

function link(overrides: Partial<IdentityLink>): IdentityLink {
  return {
    provider: 'identity.phone',
    status: 'CONNECTED',
    mode: 'BACKEND_CONNECTED',
    account: { externalId: 'p', accountLabel: '+44 7700 900123' },
    linkedAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
    isPrimary: true,
    isCurrentSession: true,
    canUnlink: true,
    cannotUnlinkReason: null,
    ...overrides,
  };
}

describe('§24 · a member cannot unlink their way out of their account', () => {
  it('refuses to unlink the only method', () => {
    const [only] = applyUnlinkRules([link({})]);

    expect(only.canUnlink).toBe(false);
    expect(only.cannotUnlinkReason).toMatch(/only way you can sign in/i);
  });

  it('allows unlinking when a second usable method exists', () => {
    const links = applyUnlinkRules([
      link({}),
      link({ provider: 'identity.google', isPrimary: false, mode: 'BACKEND_CONNECTED' }),
    ]);

    expect(links.every((entry) => entry.canUnlink)).toBe(true);
  });

  it('does not count a simulated link as a way back in', () => {
    // The exclusion that matters. A development-mode Google link cannot sign
    // anybody in, so it must never be the reason a real method is removable.
    const links = applyUnlinkRules([
      link({}),
      link({ provider: 'identity.google', isPrimary: false, mode: 'DEVELOPMENT_PROVIDER' }),
    ]);

    const phone = links.find((entry) => entry.provider === 'identity.phone');
    expect(phone?.canUnlink).toBe(false);
  });

  it('does not count an expired link as a way back in', () => {
    const links = applyUnlinkRules([
      link({}),
      link({ provider: 'identity.google', isPrimary: false, status: 'REAUTH_REQUIRED' }),
    ]);

    expect(links.find((entry) => entry.provider === 'identity.phone')?.canUnlink).toBe(false);
  });

  it('always allows removing an unusable link', () => {
    // Removing a broken method cannot lock anybody out, and a disabled control
    // with no explanation is how somebody concludes the screen is broken.
    const links = applyUnlinkRules([
      link({}),
      link({ provider: 'identity.google', isPrimary: false, status: 'ERROR' }),
    ]);

    expect(links.find((entry) => entry.provider === 'identity.google')?.canUnlink).toBe(true);
  });

  it('detects an existing link before an authorization is started', () => {
    // Catching it here means a member who taps "Connect Google" while Google is
    // already linked gets an immediate answer instead of completing an OAuth
    // consent that ends in a 409 — which costs them a real grant for nothing.
    const links = [link({ provider: 'identity.google', status: 'CONNECTED' })];
    expect(alreadyLinked(links, 'identity.google')).not.toBeNull();
    expect(alreadyLinked(links, 'identity.apple')).toBeNull();
  });
});

describe('§23 · an Apple private relay address is never presented as the member’s own', () => {
  it('names it for what it is', () => {
    const described = describeAccount(
      link({
        provider: 'identity.apple',
        account: {
          externalId: 'a',
          accountLabel: 'x7k2m@privaterelay.appleid.com',
          isPrivateRelay: true,
        },
      })
    );

    expect(described.primary).toBe('x7k2m@privaterelay.appleid.com');
    expect(described.caveat).toMatch(/hides your real address/i);
  });

  it('adds no caveat to an ordinary address', () => {
    const described = describeAccount(
      link({ account: { externalId: 'a', accountLabel: 'amara@example.com' } })
    );
    expect(described.caveat).toBeNull();
  });
});
