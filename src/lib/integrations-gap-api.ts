// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integrations, development arm (Frontend Phase 16)
//
// ⚠ EVERY ROUTE IN THIS FILE IS SIMULATED. NONE EXISTS IN THE CERTIFIED
//   BACKEND. See `src/config/integration-gaps.ts`. ⚠
//
// The development arm of the repository split. The certified arm is
// `integrations-api.ts`; `hooks/integrations.ts` is the stable interface above
// both, and a screen cannot tell which answered except through the
// `IntegrationMode` the data itself carries — which it is required to render.
//
// ── Why the prefix is `/integrations-gap/v0` ─────────────────────────────────
//
// The same reasoning Phases 5 through 15 applied, and the same three
// consequences, all wanted:
//
//   * A reviewer reading a screen's imports can tell at a glance whether a
//     connection has a backend behind it.
//   * A call that escaped a development build 404s at the gateway rather than
//     colliding with, shadowing, or being mistaken for the `/integrations`
//     namespace a real backend would claim.
//   * Migration is mechanical: when a backend phase ships integrations, the
//     hook swaps which arm it calls and the request shapes already match.
//
// Every function refuses when the gap features are disabled, so the guarantee
// does not depend on a screen remembering to check.
//
// ── What is NOT in this file, and why each absence matters ───────────────────
//
// **Nothing that moves money.** No payment, no payout, no wallet write. Every
// payment in this phase goes to B15's real `/financial/*` routes through the
// existing `financial-api.ts`. There is no simulated payment anywhere in this
// phase, and `integration-boundary.test.ts` asserts it by inspecting this
// module's exports rather than by trusting this comment.
//
// **Nothing that mints a session.** `exchangeAuthorizationCode` below returns a
// *connection*, never an access token and never a `session`. The certified
// contract in GAP-002 does return a session for `intent: "signIn"` — that is
// what makes signing in with Google work — but a development adapter that
// could produce one would be an authentication bypass reachable from a screen.
// So the simulated arm supports `link` and `reauthorize` only, and signing in
// with a third-party identity is unavailable in a build with no backend rather
// than simulated. That is a deliberate hole in the simulation.
//
// **No provider token of any kind.** No access token, no refresh token, no
// push token. The responses carry account labels and scope names. The domain
// model has no field to put a token in, which is the other half of the same
// enforcement.
//
// **No permission grant.** There is no `grantCapability`, no `setRole`. §21's
// authorization stays server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import {
  INTEGRATION_GAPS,
  INTEGRATION_GAP_PREFIX,
  areIntegrationGapsEnabled,
} from '@/config/integration-gaps';
import { backendGapError, toIntegrationError } from './integrations/errors';
import type {
  CalendarEventDraft,
  CalendarEventRef,
  CalendarRef,
  CalendarSyncSettings,
  IdentityLink,
  IntegrationConnection,
  IntegrationProviderId,
  IntegrationSyncState,
} from '@/types/integrations';

const PREFIX = INTEGRATION_GAP_PREFIX;

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * The guard every function in this file passes through.
 *
 * Throws rather than returning empty, and the distinction is the whole of the
 * honesty requirement. An empty result renders as "you have no connections",
 * which is a claim about the member. A rejection renders as "this build cannot
 * show you this", which is a claim about the build and is the true one.
 *
 * Every caller is `async`, so this becomes a rejected promise a `.catch()` sees
 * — a synchronous throw from a non-async function escapes the caller's catch
 * entirely, which Phase 5 learned and every phase since has copied.
 */
function assertEnabled(gapKey: string): void {
  if (areIntegrationGapsEnabled()) return;

  const gap = INTEGRATION_GAPS[gapKey];
  throw backendGapError(
    gap?.id ?? 'FRONTEND-PHASE16-GAP-UNKNOWN',
    gap?.capability ?? 'This integration capability',
    gap?.provider ?? undefined
  );
}

async function read<T>(gapKey: string, path: string, params?: object): Promise<T> {
  assertEnabled(gapKey);
  try {
    const response = await apiClient.get<Envelope<T>>(`${PREFIX}${path}`, { params });
    return response.data.data;
  } catch (cause) {
    throw toIntegrationError(cause, { mutating: false });
  }
}

async function write<T>(
  gapKey: string,
  method: 'post' | 'put' | 'delete',
  path: string,
  body?: unknown,
  params?: object
): Promise<T> {
  assertEnabled(gapKey);
  try {
    const url = `${PREFIX}${path}`;
    const response =
      method === 'delete'
        ? await apiClient.delete<Envelope<T>>(url, { params })
        : method === 'put'
          ? await apiClient.put<Envelope<T>>(url, body, { params })
          : await apiClient.post<Envelope<T>>(url, body, { params });
    return response.data.data;
  } catch (cause) {
    // `mutating: true` — a transport failure on a write is an indeterminate
    // outcome, not a failed one. Same rule as `financial-api.ts`.
    throw toIntegrationError(cause, { mutating: true });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CONNECTIONS — GAP-001
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchConnections(): Promise<IntegrationConnection[]> {
  return read<IntegrationConnection[]>('connectionRegistry', '/connections');
}

export async function disconnectIntegration(
  provider: IntegrationProviderId,
  revokeAtProvider: boolean
): Promise<IntegrationConnection> {
  return write<IntegrationConnection>(
    'connectionRegistry',
    'delete',
    `/connections/${encodeURIComponent(provider)}`,
    undefined,
    { revokeAtProvider }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// OAUTH — GAP-002
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Completes an authorization against the simulated exchange.
 *
 * **Returns a connection and never a session.** See the file header: an
 * `intent` of `signIn` is refused here rather than simulated, because a
 * development adapter that could mint a session would be an authentication
 * bypass a screen could reach. Linking an account to an *existing* session is
 * safe to simulate and is what this supports.
 */
export async function exchangeAuthorizationCode(input: {
  provider: IntegrationProviderId;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  scopes: string[];
  intent: 'link' | 'reauthorize';
}): Promise<IntegrationConnection> {
  return write<IntegrationConnection>(
    'oauthExchange',
    'post',
    `/oauth/${encodeURIComponent(input.provider)}/exchange`,
    {
      code: input.code,
      codeVerifier: input.codeVerifier,
      redirectUri: input.redirectUri,
      scopes: input.scopes,
      intent: input.intent,
    }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CALENDAR — GAP-003, GAP-004, GAP-005, GAP-006
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchRemoteCalendars(
  provider: IntegrationProviderId
): Promise<CalendarRef[]> {
  return read<CalendarRef[]>(
    'googleCalendarList',
    `/calendar/${encodeURIComponent(provider)}/calendars`
  );
}

export async function createRemoteCalendarEvent(
  provider: IntegrationProviderId,
  calendarId: string,
  draft: CalendarEventDraft
): Promise<CalendarEventRef> {
  return write<CalendarEventRef>(
    'googleCalendarWrite',
    'post',
    `/calendar/${encodeURIComponent(provider)}/events`,
    { calendarId, ...draft }
  );
}

export async function updateRemoteCalendarEvent(
  provider: IntegrationProviderId,
  externalEventId: string,
  calendarId: string,
  draft: CalendarEventDraft
): Promise<CalendarEventRef> {
  return write<CalendarEventRef>(
    'googleCalendarWrite',
    'put',
    `/calendar/${encodeURIComponent(provider)}/events/${encodeURIComponent(externalEventId)}`,
    { calendarId, ...draft }
  );
}

export async function deleteRemoteCalendarEvent(
  provider: IntegrationProviderId,
  externalEventId: string
): Promise<void> {
  await write<{ deleted: boolean }>(
    'googleCalendarWrite',
    'delete',
    `/calendar/${encodeURIComponent(provider)}/events/${encodeURIComponent(externalEventId)}`
  );
}

/** Whether the provider already holds an event Diaspora wrote for this source. */
export async function findRemoteExportedEvent(
  provider: IntegrationProviderId,
  sourceId: string,
  calendarId: string
): Promise<CalendarEventRef | null> {
  return read<CalendarEventRef | null>(
    'googleCalendarWrite',
    `/calendar/${encodeURIComponent(provider)}/events/lookup`,
    { sourceId, calendarId }
  );
}

export async function startCalendarSync(
  provider: IntegrationProviderId,
  calendarId: string,
  direction: 'export' | 'import' | 'both'
): Promise<IntegrationSyncState> {
  return write<IntegrationSyncState>(
    'calendarTwoWaySync',
    'post',
    `/calendar/${encodeURIComponent(provider)}/sync`,
    { calendarId, direction }
  );
}

export async function fetchCalendarSyncStatus(
  provider: IntegrationProviderId,
  calendarId?: string
): Promise<IntegrationSyncState> {
  return read<IntegrationSyncState>(
    'calendarTwoWaySync',
    `/calendar/${encodeURIComponent(provider)}/sync/status`,
    calendarId ? { calendarId } : undefined
  );
}

export async function fetchCalendarSettings(): Promise<CalendarSyncSettings> {
  return read<CalendarSyncSettings>('calendarSettings', '/calendar/settings');
}

export async function updateCalendarSettings(
  update: Partial<CalendarSyncSettings>
): Promise<CalendarSyncSettings> {
  return write<CalendarSyncSettings>('calendarSettings', 'put', '/calendar/settings', update);
}

// ═════════════════════════════════════════════════════════════════════════════
// EMAIL — GAP-008
// ═════════════════════════════════════════════════════════════════════════════

export interface EmailIdentityState {
  address: string;
  isVerified: boolean;
  verificationSentAt: string | null;
  verificationExpiresAt: string | null;
  cooldownSeconds: number;
  deliveryState: 'ok' | 'bounced' | 'suppressed';
  pendingAddress: string | null;
}

// No email function is simulated any more. Reading the address, sending a
// verification link (5 Oct 2026) and changing the address (20 Oct 2026) are all
// served, and `auth-api.ts` calls them in every build. The shape above stays
// here because it is the one the server was built to.

// Payment methods (GAP-015) are no longer simulated. `fetchSavedPaymentMethods`
// and `forgetSavedPaymentMethod` live in `financial-api.ts` and call the served
// `/financial/payment-methods` routes in every build.
