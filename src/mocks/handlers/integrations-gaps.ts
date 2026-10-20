// ═════════════════════════════════════════════════════════════════════════════
//
//   ⚠  BACKEND GAP / DEVELOPMENT ONLY  ⚠
//
//   NOTHING IN THIS FILE MIRRORS A CERTIFIED BACKEND CONTRACT.
//
//   Every route registered here is invented. The certified backend has no
//   integration contract: no connection registry, no OAuth exchange, no
//   calendar proxy, no identity linking, no email verification state, no
//   no saved payment methods. These handlers exist so the
//   Phase 16 surfaces can be built, reviewed and tested now, and so that closing
//   each gap is a change of import rather than a redesign.
//
//   Three safeguards, none of which is a comment:
//
//     * The prefix is `/integrations-gap/v0`, never `/integrations`. A call that
//       escaped to a real deployment 404s at the gateway.
//     * `setupIntegrationGapMocks` refuses to register in a release build.
//     * Every connection this returns carries `mode: 'DEVELOPMENT_PROVIDER'`,
//       and every surface that renders one renders the simulation marker, so no
//       simulated connection can reach a member claiming to be real.
//
//   ── What is deliberately NOT registered here ──────────────────────────────
//
//   **No payment route.** Not one. Every payment in this phase goes to B15's
//   real `/financial/*` endpoints, which `handlers/financial.ts` already
//   registers. The only payment-adjacent route below is a read of *saved method
//   display fields*, and there is no handler that charges, refunds, or moves
//   money.
//
//   **No session.** `POST /oauth/{provider}/exchange` returns a connection and
//   never an access token, and it refuses `intent: "signIn"` outright — a
//   development adapter that could mint a session would be an authentication
//   bypass reachable from a screen. Signing in with a third-party identity is
//   therefore *unavailable* in a build with no backend rather than simulated,
//   which is a deliberate hole.
//
//   **No push route.** B13's device registry is real and is used unchanged.
//
//   See `src/config/integration-gaps.ts` and
//   `frontend-phase-16-integrations-backend-gap-register.md`.
//
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';
import { INTEGRATION_GAP_PREFIX, areIntegrationGapsEnabled } from '@/config/integration-gaps';
import type { IntegrationProviderId } from '@/types/integrations';
import {
  REMOTE_CALENDARS,
  createRemoteEvent,
  deleteRemoteEvent,
  findRemoteEvent,
  listConnections,
  readCalendarSettings,
  removeConnection,
  simulatedSyncState,
  upsertConnection,
  writeCalendarSettings,
} from '../integrations-gap-data';

const ROOT = INTEGRATION_GAP_PREFIX;

/** The platform envelope every certified route uses, so the shapes already match. */
function ok(data: unknown): [number, unknown] {
  return [200, { data }];
}

/** RFC 7807, as the certified surface returns. */
function problem(status: number, code: string, detail: string): [number, unknown] {
  // `code` is where the platform writes it (`PlatformProblem.Enrich`). Without it
  // this mock disagreed with the server, and a development build showed "That
  // request could not be completed" where the server's code says what happened.
  return [status, { type: `https://diaspora.app/problems/${code}`, title: code, status, detail, code }];
}

function params(config: { params?: Record<string, unknown> }): Record<string, string> {
  const source = config.params ?? {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value != null) result[key] = String(value);
  }
  return result;
}

function body(config: { data?: unknown }): Record<string, unknown> {
  if (typeof config.data !== 'string') return (config.data as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(config.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** The provider id from a path segment. */
function providerFrom(url: string, segment: string): IntegrationProviderId | null {
  const match = new RegExp(`${segment}/([^/?]+)`).exec(url);
  return match ? (decodeURIComponent(match[1]) as IntegrationProviderId) : null;
}

export function setupIntegrationGapMocks(mock: MockAdapter) {
  // A release build has no path to any of this. The guard is here as well as in
  // the client so that neither alone is load-bearing.
  if (!areIntegrationGapsEnabled()) return;

  // ── Connections — GAP-001 ─────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/connections$`)).reply(() => ok(listConnections()));

  mock.onDelete(new RegExp(`${ROOT}/connections/[^/?]+$`)).reply((config) => {
    const provider = providerFrom(config.url ?? '', 'connections');
    if (!provider) return problem(400, 'integration.provider.missing', 'A provider is required.');

    // Idempotent: disconnecting something already disconnected returns the
    // disconnected state, never a 404. GAP-001's contract requires it, and §41
    // is why — a 404 on a retry is exactly how the UI is left saying "Connected".
    return ok(removeConnection(provider));
  });

  // ── OAuth — GAP-002 ───────────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/oauth/[^/]+/exchange$`)).reply((config) => {
    const provider = providerFrom(config.url ?? '', 'oauth');
    const payload = body(config);

    if (!provider) return problem(400, 'integration.provider.missing', 'A provider is required.');
    if (!payload.code || !payload.codeVerifier) {
      return problem(400, 'integration.oauth.invalid', 'A code and code verifier are required.');
    }

    // The refusal that keeps this from being an authentication bypass. See the
    // file header — `signIn` is the one intent a simulated exchange must not
    // serve, because serving it would mint a session.
    if (payload.intent === 'signIn') {
      return problem(
        501,
        'integration.oauth.signin_unavailable',
        'Signing in with this provider needs the real backend exchange (FRONTEND-PHASE16-GAP-002). It is deliberately not simulated.'
      );
    }

    const scopes = Array.isArray(payload.scopes) ? (payload.scopes as string[]) : [];
    const connection = upsertConnection(provider, scopes);


    return ok(connection);
  });

  mock.onPost(new RegExp(`${ROOT}/oauth/[^/]+/revoke$`)).reply((config) => {
    const provider = providerFrom(config.url ?? '', 'oauth');
    if (provider) removeConnection(provider);
    return ok({ revokedAtProvider: true });
  });

  // ── Calendar — GAP-003, GAP-004, GAP-005, GAP-006 ─────────────────────────
  //
  // Registered longest-path-first. `axios-mock-adapter` matches in registration
  // order, so `/events/lookup` must come before `/events/{id}` or the lookup
  // would be swallowed by the delete pattern and answered as an event id.

  mock.onGet(new RegExp(`${ROOT}/calendar/settings$`)).reply(() => ok(readCalendarSettings()));

  mock.onPut(new RegExp(`${ROOT}/calendar/settings$`)).reply((config) =>
    ok(writeCalendarSettings(body(config)))
  );

  mock.onGet(new RegExp(`${ROOT}/calendar/[^/]+/calendars$`)).reply(() => ok(REMOTE_CALENDARS));

  mock.onGet(new RegExp(`${ROOT}/calendar/[^/]+/events/lookup$`)).reply((config) => {
    const query = params(config);
    if (!query.sourceId || !query.calendarId) {
      return problem(400, 'integration.calendar.invalid', 'sourceId and calendarId are required.');
    }
    return ok(findRemoteEvent(query.calendarId, query.sourceId));
  });

  mock.onGet(new RegExp(`${ROOT}/calendar/[^/]+/sync/status$`)).reply(() =>
    ok(simulatedSyncState('partial'))
  );

  mock.onPost(new RegExp(`${ROOT}/calendar/[^/]+/sync$`)).reply(() =>
    ok(simulatedSyncState('syncing'))
  );

  mock.onPost(new RegExp(`${ROOT}/calendar/[^/]+/events$`)).reply((config) => {
    const provider = providerFrom(config.url ?? '', 'calendar');
    const payload = body(config);

    if (!provider) return problem(400, 'integration.provider.missing', 'A provider is required.');
    if (!payload.calendarId || !payload.sourceId) {
      return problem(400, 'integration.calendar.invalid', 'calendarId and sourceId are required.');
    }

    // §62's requirement, enforced by the simulation as the real contract must:
    // a draft with no timezone is refused rather than defaulted, because a
    // default here is exactly the silent conversion the rule forbids.
    if (!payload.timeZone) {
      return problem(
        422,
        'integration.calendar.timezone_required',
        'An event must carry its own timezone. Defaulting to the device timezone would move the event.'
      );
    }

    const calendar = REMOTE_CALENDARS.find((entry) => entry.id === payload.calendarId);
    if (calendar && !calendar.allowsModifications) {
      // The read-only calendar exists in the fixtures precisely so this branch
      // is reachable in development rather than only in production.
      return problem(
        403,
        'integration.calendar.read_only',
        'That calendar cannot be changed from here.'
      );
    }

    return ok(
      createRemoteEvent(provider, String(payload.calendarId), String(payload.sourceId))
    );
  });

  mock.onPut(new RegExp(`${ROOT}/calendar/[^/]+/events/[^/?]+$`)).reply((config) => {
    const provider = providerFrom(config.url ?? '', 'calendar');
    const payload = body(config);
    if (!provider || !payload.calendarId || !payload.sourceId) {
      return problem(400, 'integration.calendar.invalid', 'calendarId and sourceId are required.');
    }
    return ok(createRemoteEvent(provider, String(payload.calendarId), String(payload.sourceId)));
  });

  mock.onDelete(new RegExp(`${ROOT}/calendar/[^/]+/events/[^/?]+$`)).reply((config) => {
    const match = /events\/([^/?]+)/.exec(config.url ?? '');
    const deleted = match ? deleteRemoteEvent(decodeURIComponent(match[1])) : false;
    // Idempotent: deleting an event that is already gone is a success, so a
    // retry after a timeout does not surface as a failure.
    return ok({ deleted: deleted || true });
  });

  // Email (GAP-008) is not simulated: reading, verifying and changing the
  // address are served under `/auth/email`, so there is nothing to answer here.

  // Payment methods (GAP-015) are not simulated: `/financial/payment-methods/me`
  // is served, and it answers an empty list because the platform stores none.
}
