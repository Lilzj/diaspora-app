// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration hooks (Frontend Phase 16, §3 · §4 · §34 · §69)
//
// The stable interface above the repository arms and the provider registry. §4's
// requirement is that a screen must not know whether its data came from a
// certified route, a device API, a development adapter or nothing at all — and
// this file is where that stops being a principle and becomes a signature.
//
// A screen calls `useIntegrations()` and receives `IntegrationListItem[]`.
// Behind that one call:
//
//   * B15's real `/financial/capabilities` decides whether payments can start,
//   * B13's real `/notifications/devices` decides whether push is registered,
//   * Phase 8's map registry reports its own provider status,
//   * the device calendar module is probed,
//   * the development adapter answers for everything with no contract,
//   * and the four are composed into one list whose per-item `mode` says which
//     is which.
//
// The screen sees none of that. What it does see, and is required to render, is
// `connection.mode` — because §69 forbids implying production connectivity, and
// the only way to make that enforceable is to make the marker unavoidable.
//
// ── §34, offline, and the distinction that matters ───────────────────────────
//
// Some of these work offline and some cannot, and the UI has to say which.
// `IntegrationDescriptor.offlineCapabilities` carries the answer per
// integration, and `useIntegrations` marks an item `UNAVAILABLE` while offline
// only when *none* of its capabilities work without a network. The device
// calendar keeps working; Google Calendar does not; the map still renders and
// cannot search. Collapsing those into one "you are offline" state would tell a
// member they cannot add an event to their own phone's calendar, which is false.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchEmailIdentity, sendEmailVerification } from '@/lib/auth-api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as gapApi from '@/lib/integrations-gap-api';
import * as certifiedApi from '@/lib/integrations-api';
// Remediation Wave C-05. `Diaspora.Modules.Integrations` serves the connection
// registry, the OAuth exchange, the calendar proxy, calendar settings and
// identity linking under `/api/v1/integrations`. Every hook below that used to
// branch on `areIntegrationGapsEnabled()` for one of those now calls this
// client unconditionally — the route is real, and a build-time branch in front
// of a real route is the thing this remediation exists to remove.
//
// Saved payment methods (GAP-015) followed on 20 Oct 2026: the hook reads
// `/financial/payment-methods/me` through `financial-api.ts` in every build,
// and the simulated arm for it is deleted.
import * as integrationsApi from '@/lib/integrations/certified-client';
import { fetchSavedPaymentMethods, forgetSavedPaymentMethod } from '@/lib/financial-api';
import { useAuthStore } from '@/store/auth';
import { useConnectivityStore } from '@/lib/connectivity';
import {
  fetchNotificationPreferences,
  notificationKeys,
  updateNotificationPreferences,
} from '@/lib/notifications-api';
import type {
  NotificationPreferences,
  UpdateNotificationPreferences,
} from '@/types/notification-preferences';
import { integrationCatalog, descriptorFor } from '@/lib/integrations/catalog';
import { integrationKeys } from '@/lib/integrations/query-keys';
import { mapConnection } from '@/lib/integrations/maps';
import { notConnected, withDisconnect } from '@/lib/integrations/status';
import {
  DEFAULT_CALENDAR_SETTINGS,
  listWritableCalendars,
} from '@/lib/integrations/calendar';
import {
  deactivatePushToken,
  listPushDevices,
  openPushSettings,
  readPushPermission,
  registerPushToken,
  requestPushPermission,
  watchPushTokenRefresh,
} from '@/lib/integrations/push-lifecycle';
import {
  resolveOAuthProvider,
  getIntegrationProviderStatus,
} from '@/lib/integrations/registry';
import {
  integrationError,
  isIntegrationError,
  toIntegrationError,
  type IntegrationError,
} from '@/lib/integrations/errors';
import { trackConnectionAttempt, trackConnectionResult, trackIntegrationEvent } from '@/lib/integrations/events';
import type {
  CalendarSyncSettings,
  IdentityLink,
  IntegrationConnection,
  IntegrationDescriptor,
  IntegrationListItem,
  IntegrationProviderId,
  PushRegistration,
} from '@/types/integrations';

/** The signed-in member, for the member-scoped cache keys — §43. */
function useMemberId(): string | null {
  return useAuthStore((state) => state.user?.userId ?? null);
}

/**
 * Retry policy for integration queries — §33.
 *
 * Never retries something the member must fix, and never retries a gap: both
 * would fail identically for ever, and a spinner that runs three times before
 * showing "not available yet" is three seconds of the member's time for nothing.
 */
function shouldRetryIntegration(failureCount: number, cause: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!isIntegrationError(cause)) return true;
  if (cause.needsMemberAction || cause.isTerminal) return false;
  return cause.isRetryable;
}

// ═════════════════════════════════════════════════════════════════════════════
// THE CONNECTION CENTRE — §5
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Every integration, with its live state.
 *
 * The composition is the point. The catalogue supplies every integration —
 * including ones nobody has connected and ones this build cannot reach — and
 * the live state is merged in where one exists, which is why the two are
 * separate types. A single type would mean an unconnected integration was
 * represented by a half-empty connection, and "no connection" and "a connection
 * in an empty state" would be indistinguishable.
 */
export function useIntegrations(): {
  items: IntegrationListItem[];
  isLoading: boolean;
  error: IntegrationError | null;
  refetch: () => void;
} {
  const userId = useMemberId();
  const isOffline = useConnectivityStore((state) => !state.isOnline);

  // The registry is real (Remediation Wave C-05). `GET /integrations/connections`
  // works on every deployment, including one with no vendor adapter, and
  // answers honestly: an empty list for a member who has connected nothing.
  //
  // The build-time branch that used to stand here returned `[]` for the same
  // reason and could not tell "you have connected nothing" from "this build
  // cannot ask". It now can, because a failure is an error rather than an empty
  // list.
  const connections = useQuery({
    queryKey: integrationKeys.connections(userId),
    queryFn: () => integrationsApi.fetchConnections(),
    retry: shouldRetryIntegration,
    staleTime: 30_000,
  });

  const certified = useQuery({
    queryKey: [...integrationKeys.all(userId), 'certified-support'],
    queryFn: () => certifiedApi.fetchCertifiedSupport(),
    retry: shouldRetryIntegration,
    staleTime: 60_000,
  });

  const items = useMemo<IntegrationListItem[]>(() => {
    const now = new Date().toISOString();
    const stored = new Map((connections.data ?? []).map((entry) => [entry.provider, entry]));
    const support = certified.data;

    return integrationCatalog().map((descriptor) => {
      const connection = resolveConnectionFor(descriptor, stored, support, now, isOffline);
      return { descriptor, connection, sync: null };
    });
  }, [connections.data, certified.data, isOffline]);

  const error = connections.error ?? certified.error;

  return {
    items,
    isLoading: connections.isLoading || certified.isLoading,
    error: error ? toIntegrationError(error) : null,
    refetch: () => {
      void connections.refetch();
      void certified.refetch();
    },
  };
}

/**
 * The live state for one catalogue entry.
 *
 * Four sources, in priority order, and the order is the interesting part:
 *
 *   1. **The provider's own answer** for the platform-level integrations —
 *      maps, push, payments, SMS. These are not things a member connects, so a
 *      stored connection record would be meaningless and the truth is whatever
 *      the provider and the certified backend currently report.
 *   2. **A stored connection**, for the ones a member does connect.
 *   3. **Offline**, which can override an otherwise-usable state, but only for
 *      integrations that genuinely need a network.
 *   4. **Not connected**, in the mode the registry reports.
 */
function resolveConnectionFor(
  descriptor: IntegrationDescriptor,
  stored: Map<IntegrationProviderId, IntegrationConnection>,
  support: certifiedApi.CertifiedIntegrationSupport | undefined,
  now: string,
  isOffline: boolean
): IntegrationConnection {
  // 1. Platform-level integrations report themselves.
  if (descriptor.provider === 'maps.platform') {
    return mapConnection(now);
  }

  if (descriptor.domain === 'push') {
    const registered = (support?.pushDevices?.length ?? 0) > 0;
    const status = getIntegrationProviderStatus().push;

    return {
      provider: descriptor.provider,
      domain: 'push',
      status: registered ? 'CONNECTED' : status.mode === 'NOT_CONFIGURED' ? 'UNAVAILABLE' : 'NOT_CONNECTED',
      // A registered device against B13's real registry is genuinely backend
      // connected, whatever the local transport is. That is the honest reading:
      // the notification will actually arrive.
      mode: registered ? 'BACKEND_CONNECTED' : status.mode,
      account: null,
      grantedCapabilities: registered ? ['push.token', 'push.deviceRegistry', 'push.preferences'] : [],
      scopes: [],
      lastSyncedAt: null,
      lastError: null,
      gapId: status.gapId ?? null,
      observedAt: now,
    };
  }

  if (descriptor.domain === 'payments') {
    const canPay = certifiedApi.canInitiatePayment(support?.payments ?? null);
    return {
      provider: descriptor.provider,
      domain: 'payments',
      // `PARTIALLY_CONNECTED` is the honest answer and it is not a hedge: B15's
      // payment lifecycle is real and complete, and the device cannot collect an
      // instrument (GAP-013). Claiming CONNECTED would overstate it; claiming
      // BACKEND_GAP would erase a working contract.
      status: canPay ? 'PARTIALLY_CONNECTED' : support?.failures.includes('payments') ? 'ERROR' : 'UNAVAILABLE',
      mode: canPay ? 'BACKEND_CONNECTED' : 'NOT_CONFIGURED',
      account: null,
      grantedCapabilities: canPay
        ? ['payments.initialize', 'payments.authorize', 'payments.confirm', 'payments.status', 'payments.receipt']
        : [],
      scopes: [],
      lastSyncedAt: null,
      lastError: null,
      gapId: null,
      observedAt: now,
    };
  }

  if (descriptor.domain === 'sms') {
    // `/auth/otp/*` is certified and is how every member signs in, so this is
    // genuinely connected — the gap is the *metadata* around it, not the
    // capability.
    return {
      provider: descriptor.provider,
      domain: 'sms',
      status: 'CONNECTED',
      mode: 'BACKEND_CONNECTED',
      account: null,
      grantedCapabilities: ['sms.verification'],
      scopes: [],
      lastSyncedAt: null,
      lastError: null,
      gapId: null,
      observedAt: now,
    };
  }

  if (descriptor.domain === 'email') {
    const preferences = support?.notificationPreferences;
    return {
      provider: descriptor.provider,
      domain: 'email',
      status: preferences ? 'PARTIALLY_CONNECTED' : 'UNAVAILABLE',
      // B13's preference contract is real; the verification state is not.
      mode: preferences ? 'BACKEND_CONNECTED' : 'BACKEND_GAP',
      account: null,
      grantedCapabilities: preferences ? ['email.preferences'] : [],
      scopes: [],
      lastSyncedAt: null,
      lastError: null,
      gapId: null,
      observedAt: now,
    };
  }

  // 2. A stored connection, for the ones a member connects.
  const existing = stored.get(descriptor.provider);
  if (existing) {
    if (isOffline && descriptor.offlineCapabilities.length === 0) {
      return { ...existing, status: 'UNAVAILABLE', observedAt: now };
    }
    return existing;
  }

  // 3 and 4. Nothing stored: ask the registry what mode this provider is in.
  const mode = modeForDescriptor(descriptor);
  const base = notConnected(descriptor.provider, descriptor.domain, mode, now);

  // §34's distinction. An integration with no offline capability at all is
  // genuinely unusable offline; one with some is not, and saying otherwise
  // would tell a member they cannot write to their own phone's calendar.
  if (isOffline && descriptor.offlineCapabilities.length === 0 && mode !== 'BACKEND_GAP') {
    return { ...base, status: 'UNAVAILABLE' };
  }

  return base;
}

function modeForDescriptor(descriptor: IntegrationDescriptor): IntegrationConnection['mode'] {
  const status = getIntegrationProviderStatus();

  if (descriptor.provider === 'calendar.device') return status.calendar.device.mode;
  if (descriptor.domain === 'calendar') return status.calendar.remote.mode;
  return 'NOT_CONFIGURED';
}

/** One integration, for its detail screen. */
export function useIntegration(provider: IntegrationProviderId): IntegrationListItem | null {
  const { items } = useIntegrations();
  return items.find((item) => item.descriptor.provider === provider) ?? null;
}

/**
 * What this deployment can actually do (Remediation Wave C-05).
 *
 * The route that turns "not configured" from something a screen infers out of a
 * refusal into something the server states before a button is drawn.
 *
 * It matters more here than anywhere else in the remediation, because the
 * Integrations module is the one where every route exists and almost none of
 * them can succeed: a default deployment registers `NotConfiguredOAuthProvider`
 * and `NotConfiguredCalendarProvider`, both of which answer `NotConfigured` for
 * everything. So `canConnect` below is `false` on a stock backend, and a
 * connection centre that offered a Connect button anyway would be offering one
 * that answers 400.
 *
 * `reasons` is passed through rather than paraphrased. The server distinguishes
 * "no adapter", "no credential key", "no allow-listed redirect" and "no
 * outbound host" — four different fixes — and a client that collapsed them into
 * "unavailable" would throw away the only diagnosis available to an operator.
 */
export function useIntegrationCapabilities(): {
  capabilities: integrationsApi.IntegrationCapabilityReport | null;
  /** Whether an authorization can be started at all. Adapter + key + redirect. */
  canConnect: boolean;
  /** Whether anything may be described as synced in both directions. */
  canSyncTwoWay: boolean;
  reasons: Record<string, string>;
  isLoading: boolean;
  error: IntegrationError | null;
} {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: [...integrationKeys.all(userId), 'capabilities'] as const,
    queryFn: () => integrationsApi.fetchCapabilities(),
    retry: shouldRetryIntegration,
    // Five minutes. A deployment's adapters change when somebody deploys, not
    // when a member taps something, so this is the one integration query where
    // a longer stale time is not a correctness risk.
    staleTime: 5 * 60_000,
  });

  return {
    capabilities: query.data ?? null,
    canConnect: integrationsApi.canStartAuthorization(query.data ?? null),
    // Never true today, and the server is what says so rather than this client:
    // two-way needs an adapter declaring both `ImportEvents` and `WatchChannel`
    // and none does. The register's rule is that until the watch channel exists
    // nothing may render "synced", and reading it from the wire is that rule
    // enforced in one place.
    canSyncTwoWay: query.data?.twoWayCalendarSync ?? false,
    reasons: query.data?.unavailableReasons ?? {},
    isLoading: query.isLoading,
    error: query.error ? toIntegrationError(query.error) : null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CONNECT AND DISCONNECT — §5, §37, §41
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Connects an external account.
 *
 * ── The one thing in this cluster that could NOT be reconnected ──────────────
 *
 * `POST /integrations/oauth/{provider}/exchange` is real, and this hook still
 * cannot reach it, because the real flow has three steps and this client's
 * provider layer implements two:
 *
 *   1. `POST /oauth/{provider}/authorize` — **the server** mints the `state`,
 *      chooses the redirect from its allow-list, and narrows the scopes. The
 *      client sends it the PKCE **challenge**.
 *   2. the browser hand-off,
 *   3. `POST /oauth/{provider}/exchange` — which looks the attempt up **by the
 *      state it issued** and refuses one it did not.
 *
 * `OAuthProvider.authorize(scopes)` does 1 and 2 together and inside itself: it
 * composes its own authorization URL, mints its own redirect URI from
 * `buildRedirectUri('oauth')`, and generates the PKCE pair internally through
 * `expo-auth-session`'s `usePKCE: true`. The challenge therefore does not exist
 * until after the browser has already been opened, and step 1 needs it before.
 *
 * So the sequence cannot be assembled from the current interface. Closing it is
 * a **provider-layer** change — splitting `authorize` into a prepare step that
 * yields `{ codeChallenge, redirectUri }` and a prompt step that takes the
 * server's `authorizationUrl` — across three adapter implementations. That is a
 * different change from swapping a client, and doing it here under the cover of
 * a route swap is how a refactor lands unreviewed.
 *
 * ── What this hook does instead, and why it is an improvement ────────────────
 *
 * It asks `GET /integrations/capabilities` — a real route, no PKCE required —
 * and refuses **before opening a browser**. On a stock deployment that is the
 * whole answer: `NotConfiguredOAuthProvider` is what is registered, so no
 * authorization can complete, and the register's own promise for GAP-002 is
 * exactly this — "the flow stops before opening a browser … deliberately,
 * because an authorization screen a member completes and which then 404s has
 * cost them a real Google consent for nothing."
 *
 * On a deployment that *has* contracted an adapter it refuses too, naming the
 * provider-layer blocker rather than the deployment. Those are different
 * sentences because they are different problems and they have different owners.
 *
 * Nothing regresses: this hook has no consumer today. Connect and disconnect
 * are not wired to a screen, and the connection centre renders state without
 * offering either.
 */
export function useConnectIntegration() {
  const queryClient = useQueryClient();
  const userId = useMemberId();

  return useMutation({
    mutationFn: async (input: {
      provider: IntegrationProviderId;
      capability: Parameters<ReturnType<typeof resolveOAuthProvider>['scopesFor']>[0];
    }): Promise<IntegrationConnection> => {
      const provider = resolveOAuthProvider(input.provider);
      const scopes = provider.scopesFor(input.capability);
      const startedAt = Date.now();

      trackConnectionAttempt({
        provider: input.provider,
        domain: descriptorFor(input.provider)?.domain ?? 'identity',
        mode: provider.descriptor.mode,
      });

      // Read before anything opens. A refusal here costs the member a spinner;
      // the same refusal three steps later costs them a real provider consent.
      const report = await integrationsApi.fetchCapabilities();

      if (!integrationsApi.canStartAuthorization(report)) {
        throw toIntegrationError(
          integrationError('ConfigurationMissing', {
            provider: input.provider,
            message:
              report.unavailableReasons.oauth ??
              report.unavailableReasons['oauth.redirect'] ??
              report.unavailableReasons.credentialCustody ??
              'This deployment cannot connect an external account yet.',
          }),
          { provider: input.provider }
        );
      }

      // The deployment can; this client cannot. See the block comment above.
      //
      // `trackConnectionResult` is deliberately NOT emitted for this path. The
      // event vocabulary records what happened to a member's connection attempt,
      // and nothing happened to it: no browser opened, no consent was given, no
      // provider was called. Recording a `failed` outcome here would put a
      // provider failure in the metrics for a refusal this client made about
      // itself, which is the wrong attribution and the harder one to unpick
      // later.
      void scopes;
      void startedAt;

      throw toIntegrationError(
        integrationError('UnsupportedCapability', {
          provider: input.provider,
          message:
            'This version of the app cannot complete a connection. The server issues the '
            + 'authorization state before the browser opens, and this build generates it after.',
          hint: 'FRONTEND-PHASE16-GAP-002 — the client half of it, not the contract.',
        }),
        { provider: input.provider }
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.all(userId) });
    },
  });
}

/**
 * Disconnects.
 *
 * The optimistic update is §41's requirement made structural: the cache entry
 * is *replaced* with a disconnected connection immediately, so no render between
 * the tap and the response can show "Connected". `withDisconnect` clears the
 * account, scopes and capabilities rather than only the status, so nothing
 * stale survives into the next render either.
 */
export function useDisconnectIntegration() {
  const queryClient = useQueryClient();
  const userId = useMemberId();

  return useMutation({
    // Remediation Wave C-05. `DELETE /integrations/connections/{provider}` is
    // real and is idempotent by contract — a second call answers 200 with the
    // same body, never 404, which is what makes the optimistic update below
    // safe to leave in place on a retry.
    //
    // The response is an `IntegrationDisconnectResult`, not the updated
    // connection the gap arm returned. Nothing here reads it as one: the
    // optimistic write already produced the disconnected row, and `onSettled`
    // refetches from the server rather than merging a shape that no longer
    // matches.
    mutationFn: (input: { provider: IntegrationProviderId; revokeAtProvider: boolean }) =>
      integrationsApi.disconnectIntegration(input.provider, input.revokeAtProvider),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: integrationKeys.connections(userId) });
      const previous = queryClient.getQueryData<IntegrationConnection[]>(
        integrationKeys.connections(userId)
      );

      queryClient.setQueryData<IntegrationConnection[]>(
        integrationKeys.connections(userId),
        (current) =>
          (current ?? []).map((connection) =>
            connection.provider === input.provider
              ? withDisconnect(connection, new Date().toISOString())
              : connection
          )
      );

      return { previous };
    },

    onError: (_error, _input, context) => {
      // Rolled back, because the opposite failure is worse: telling a member
      // they are disconnected when they are not means they stop looking for the
      // integration that is still sharing their data.
      if (context?.previous) {
        queryClient.setQueryData(integrationKeys.connections(userId), context.previous);
      }
    },

    onSuccess: (_result, input) => {
      trackIntegrationEvent('integration.disconnected', { provider: input.provider });
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.all(userId) });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// CALENDAR — §7, §8
// ═════════════════════════════════════════════════════════════════════════════

export function useWritableCalendars() {
  const userId = useMemberId();

  return useQuery({
    queryKey: integrationKeys.calendars(userId),
    queryFn: () => listWritableCalendars(),
    retry: shouldRetryIntegration,
    staleTime: 5 * 60_000,
  });
}

export function useCalendarSettings() {
  const userId = useMemberId();
  const queryClient = useQueryClient();

  // Remediation Wave C-05. `GET`/`PUT /integrations/calendar/settings` are real
  // and — unlike almost everything else in this module — they need **no vendor
  // adapter**: a preference is stored by the platform, so these two work on a
  // stock deployment where listing a calendar does not.
  const query = useQuery({
    queryKey: integrationKeys.calendarSettings(userId),
    queryFn: () => integrationsApi.fetchCalendarSettings(),
    retry: shouldRetryIntegration,
    staleTime: 60_000,
  });

  const update = useMutation({
    // A partial update where a missing field means "leave it alone", never
    // "clear it". `updateCalendarSettings` strips undefined before the request
    // for that reason — the server binds an explicit JSON null to the same C#
    // null an omitted field produces, so the two are indistinguishable on the
    // wire and the safe thing is to send neither.
    mutationFn: (patch: Partial<CalendarSyncSettings>) =>
      integrationsApi.updateCalendarSettings(patch),
    onSuccess: (settings) => {
      queryClient.setQueryData(integrationKeys.calendarSettings(userId), settings);
      trackIntegrationEvent('calendar.settings.changed', {});
    },
  });

  return {
    settings: query.data ?? DEFAULT_CALENDAR_SETTINGS,
    isLoading: query.isLoading,
    /**
     * Now always true.
     *
     * GAP-006 asked for "server-side persistence of calendar sync settings, so
     * they survive a reinstall and match across devices" and the contract
     * shipped. The screen's "not saved to your account" caveat is no longer
     * true and the field is kept — rather than removed — so the screen that
     * renders the caveat keeps compiling while it is taken out.
     */
    isPersisted: true,
    update: update.mutate,
    isUpdating: update.isPending,
  };
}

/**
 * Calendar synchronisation for one provider (Remediation Wave C-05, GAP-005).
 *
 * `POST /integrations/calendar/{provider}/sync` and
 * `GET …/sync/status` are both real. This hook is the client half of GAP-005,
 * which the wave that certified the routes wrote a client for and never wired
 * to anything — an exported function with no caller is not a connected gap.
 *
 * ── Why `direction` is not a parameter ───────────────────────────────────────
 *
 * `'export'` is the only value any deployment accepts. `'import'` and `'both'`
 * are refused with `integrations.calendar.sync.direction-unsupported` because no
 * adapter declares `ImportEvents`, and the refusal is deliberate rather than
 * unbuilt: a member who asked for "both" and received an export would believe
 * their calendar had been read into Diaspora, which is a consent claim and not a
 * feature claim. Hard-coding the only accepted value keeps a screen from
 * offering a control whose other settings are guaranteed 400s. When an adapter
 * ships, this signature widens — and that is a visible change rather than a
 * silent one.
 *
 * ── Why polling is not started here ──────────────────────────────────────────
 *
 * `refetchInterval` is set only while a run is actually in flight. A sync that
 * has never run reports `phase: 'never'`, and polling that forever would be a
 * request every few seconds, for every mounted screen, to learn a fact that
 * cannot change without the member doing something first.
 */
export function useCalendarSync(provider: IntegrationProviderId | null) {
  const userId = useMemberId();
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: integrationKeys.calendarSync(userId, provider ?? 'calendar.google'),
    queryFn: () => integrationsApi.fetchCalendarSyncStatus(provider!),
    enabled: provider !== null,
    retry: shouldRetryIntegration,
    // `phase` is the server's word, and `syncing` is the only one that is
    // waiting on something. Anything else is a settled state.
    refetchInterval: (query) => (query.state.data?.phase === 'syncing' ? 5_000 : false),
    staleTime: 15_000,
  });

  const start = useMutation({
    mutationFn: (input: { calendarId: string | null }) =>
      integrationsApi.startCalendarSync(provider!, input.calendarId, 'export'),
    // The response is the run's own state, so it is written straight into the
    // cache rather than invalidated — an invalidate would blank the phase for
    // one render and show "never synced" immediately after a member started a
    // sync, which is the single most confusing state this surface has.
    onSuccess: (state) => {
      queryClient.setQueryData(
        integrationKeys.calendarSync(userId, provider ?? 'calendar.google'),
        state
      );
      trackIntegrationEvent('calendar.sync.started', {});
    },
  });

  return {
    /**
     * Null until the first read resolves — deliberately not defaulted to a
     * synthetic `never`, because "not loaded yet" and "has never synced" render
     * differently and the mapper is explicit that the two mean opposite things.
     */
    sync: status.data ?? null,
    isLoading: status.isLoading,
    error: status.error ? toIntegrationError(status.error) : null,
    start: start.mutateAsync,
    isStarting: start.isPending,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PUSH — §14, §44
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The push lifecycle, as a hook.
 *
 * Registration is **not** automatic on mount. A component that registered on
 * mount would prompt for notification permission the first time somebody opened
 * any screen that happened to use this hook, before they had read why — §37's
 * "do not bury meaningful consent" applies to an OS prompt as much as to a
 * Continue button, and Android 13 denials are effectively permanent.
 *
 * So `enable()` is explicit and the screen shows the explanation first.
 */
export function usePushNotifications() {
  const userId = useMemberId();
  const queryClient = useQueryClient();
  const [registration, setRegistration] = useState<PushRegistration | null>(null);
  const [skippedReason, setSkippedReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readPushPermission().then((next) => {
      if (!cancelled) setRegistration(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Token rotation. Without this a member's notifications stop silently the
  // next time the OS rotates the token, until the following cold start.
  useEffect(() => {
    if (!userId) return undefined;
    if (registration?.registeredForUserId !== userId) return undefined;
    return watchPushTokenRefresh(userId);
  }, [userId, registration?.registeredForUserId]);

  const devices = useQuery({
    queryKey: integrationKeys.pushDevices(userId),
    queryFn: () => listPushDevices(),
    retry: shouldRetryIntegration,
    staleTime: 30_000,
    // No devices to list for a signed-out reader, and asking would 401.
    enabled: Boolean(userId),
  });

  const enable = useCallback(async () => {
    const permission = await requestPushPermission();
    setRegistration(permission);

    if (permission.permission !== 'granted' || !userId) return permission;

    const result = await registerPushToken(userId);
    setRegistration(result.registration);
    setSkippedReason(result.skippedReason);
    void queryClient.invalidateQueries({ queryKey: integrationKeys.pushDevices(userId) });
    return result.registration;
  }, [userId, queryClient]);

  const disable = useCallback(async () => {
    await deactivatePushToken();
    setRegistration(await readPushPermission());
    void queryClient.invalidateQueries({ queryKey: integrationKeys.pushDevices(userId) });
  }, [userId, queryClient]);

  return {
    registration,
    devices: devices.data ?? [],
    isLoadingDevices: devices.isLoading,
    /** Set when a token was minted but deliberately not registered — see push-lifecycle. */
    skippedReason,
    enable,
    disable,
    openSettings: openPushSettings,
  };
}

/**
 * B13's notification preferences.
 *
 * The **real** contract, unchanged. §14 forbids duplicating B13's preferences
 * and this hook is the whole of this phase's involvement with them: it reads and
 * writes `/notifications/preferences` through the client that already existed,
 * under B13's own query key, so the settings screen and the integration centre
 * share one cache entry rather than two that can disagree.
 */
export function useNotificationPreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: () => fetchNotificationPreferences(),
    retry: shouldRetryIntegration,
    staleTime: 60_000,
  });

  const update = useMutation({
    mutationFn: (patch: UpdateNotificationPreferences) => updateNotificationPreferences(patch),
    onSuccess: (preferences: NotificationPreferences) => {
      queryClient.setQueryData(notificationKeys.preferences(), preferences);
    },
  });

  return {
    preferences: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? toIntegrationError(query.error) : null,
    update: update.mutate,
    isUpdating: update.isPending,
  };
}

// Identity linking (`useIdentityLinks`, `useUnlinkIdentity`) was removed on 5 Oct
// 2026: email and password is the only way to sign in, so there is nothing to link.

// ═════════════════════════════════════════════════════════════════════════════
// EMAIL — §17
// ═════════════════════════════════════════════════════════════════════════════

export function useEmailIdentity() {
  const userId = useMemberId();
  const queryClient = useQueryClient();

  // Served since 5 Oct 2026 (GET /auth/email). The state is now the server's in
  // every build, so "verified" and "not verified" are both claims the platform
  // makes, and the old third state, "not knowable", is gone.
  const query = useQuery({
    queryKey: integrationKeys.email(userId),
    queryFn: (): Promise<gapApi.EmailIdentityState> => fetchEmailIdentity(),
    retry: shouldRetryIntegration,
    staleTime: 30_000,
    // A member who just pressed the button in their mail app comes back here.
    refetchOnWindowFocus: true,
  });

  const resend = useMutation({
    mutationFn: () => sendEmailVerification(),
    onSuccess: (state) => {
      queryClient.setQueryData(integrationKeys.email(userId), state);
      trackIntegrationEvent('verification.email.requested', {});
    },
  });

  const change = useMutation({
    mutationFn: (address: string) => gapApi.changeEmailAddress(address),
    onSuccess: (state) => queryClient.setQueryData(integrationKeys.email(userId), state),
  });

  return {
    email: query.data ?? null,
    isLoading: query.isLoading,
    /** Known whenever the read succeeded: the server answers it in every build. */
    isVerificationStateKnown: query.isSuccess,
    /** Rereads the state, e.g. after the app confirmed a link it opened. */
    refetch: query.refetch,
    error: query.error ? toIntegrationError(query.error) : null,
    resend: resend.mutateAsync,
    isResending: resend.isPending,
    change: change.mutateAsync,
    isChanging: change.isPending,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PAYMENT METHODS — §26
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Saved payment methods — GAP-015, read from the served
 * `GET /financial/payment-methods/me` in every build.
 *
 * **Normally empty, and the empty list is the platform's answer, not a gap.**
 * Card details are entered on the provider's checkout page for each payment and
 * nothing reusable is kept, so the screen says exactly that. There is no route
 * that adds one, and this hook offers none.
 *
 * A failed read is reported as a failure (`isError`), never folded into the
 * empty list: "we keep none" is a claim, and a transport error has not made it.
 */
export function usePaymentMethods() {
  const userId = useMemberId();
  const queryClient = useQueryClient();
  const canRead = userId !== null;

  const query = useQuery({
    queryKey: integrationKeys.paymentMethods(userId),
    queryFn: () => fetchSavedPaymentMethods(),
    enabled: canRead,
    retry: shouldRetryIntegration,
    staleTime: 60_000,
  });

  const forget = useMutation({
    mutationFn: (id: string) => forgetSavedPaymentMethod(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.paymentMethods(userId) });
    },
  });

  return {
    methods: query.data ?? [],
    isLoading: canRead && query.isLoading,
    /** The read failed or never arrived. Not the same as "none stored". */
    isError: query.isError,
    /** True once the server has answered, so an empty list is its claim. */
    isAnswered: query.isSuccess,
    refetch: query.refetch,
    forget: forget.mutateAsync,
    isForgetting: forget.isPending,
  };
}
