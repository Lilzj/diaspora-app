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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as gapApi from '@/lib/integrations-gap-api';
import * as certifiedApi from '@/lib/integrations-api';
import { areIntegrationGapsEnabled } from '@/config/integration-gaps';
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
import { applyUnlinkRules } from '@/lib/integrations/identity';
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
  resolveGovernmentProvider,
  resolveOAuthProvider,
  getIntegrationProviderStatus,
} from '@/lib/integrations/registry';
import {
  isIntegrationError,
  toIntegrationError,
  type IntegrationError,
} from '@/lib/integrations/errors';
import { trackConnectionAttempt, trackConnectionResult, trackIntegrationEvent } from '@/lib/integrations/events';
import type {
  CalendarSyncSettings,
  GovernmentNotice,
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

  const connections = useQuery({
    queryKey: integrationKeys.connections(userId),
    queryFn: async (): Promise<IntegrationConnection[]> => {
      if (!areIntegrationGapsEnabled()) {
        // No registry contract exists. Returning an empty list rather than
        // rejecting is correct here: the catalogue still renders every
        // integration, each in the state its *own* provider reports, and the
        // absence of a registry is not a failure of the screen.
        return [];
      }
      return gapApi.fetchConnections();
    },
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
  if (descriptor.domain === 'government') return status.government.mode;
  if (descriptor.domain === 'identity') {
    const match = status.identity.find((entry) => entry.id === descriptor.provider);
    return match?.mode ?? 'NOT_CONFIGURED';
  }
  return 'NOT_CONFIGURED';
}

/** One integration, for its detail screen. */
export function useIntegration(provider: IntegrationProviderId): IntegrationListItem | null {
  const { items } = useIntegrations();
  return items.find((item) => item.descriptor.provider === provider) ?? null;
}

// ═════════════════════════════════════════════════════════════════════════════
// CONNECT AND DISCONNECT — §5, §37, §41
// ═════════════════════════════════════════════════════════════════════════════

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

      const outcome = await provider.authorize(scopes);

      if (outcome.kind === 'cancelled') {
        trackConnectionResult({
          provider: input.provider,
          domain: descriptorFor(input.provider)?.domain ?? 'identity',
          mode: provider.descriptor.mode,
          status: 'NOT_CONNECTED',
          outcome: 'cancelled',
          durationMs: Date.now() - startedAt,
        });
        throw toIntegrationError(
          Object.assign(new Error('cancelled'), { name: 'Cancelled' }),
          { provider: input.provider }
        );
      }

      if (outcome.kind === 'denied') {
        trackConnectionResult({
          provider: input.provider,
          domain: descriptorFor(input.provider)?.domain ?? 'identity',
          mode: provider.descriptor.mode,
          status: 'PERMISSION_DENIED',
          outcome: 'failed',
          errorKind: 'PermissionDenied',
          durationMs: Date.now() - startedAt,
        });
        throw toIntegrationError(new Error('denied'), { provider: input.provider });
      }

      // The exchange. `intent: 'link'` only — the adapter refuses `signIn` and
      // the certified contract is the only thing that may mint a session.
      const connection = await gapApi.exchangeAuthorizationCode({
        provider: input.provider,
        code: outcome.authorization.code,
        codeVerifier: outcome.authorization.codeVerifier,
        redirectUri: outcome.authorization.redirectUri,
        scopes: outcome.authorization.scopes,
        intent: 'link',
      });

      trackConnectionResult({
        provider: input.provider,
        domain: connection.domain,
        mode: connection.mode,
        status: connection.status,
        outcome: 'connected',
        durationMs: Date.now() - startedAt,
      });

      return connection;
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
    mutationFn: (input: { provider: IntegrationProviderId; revokeAtProvider: boolean }) =>
      gapApi.disconnectIntegration(input.provider, input.revokeAtProvider),

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

  const query = useQuery({
    queryKey: integrationKeys.calendarSettings(userId),
    queryFn: async (): Promise<CalendarSyncSettings> => {
      if (!areIntegrationGapsEnabled()) return DEFAULT_CALENDAR_SETTINGS;
      return gapApi.fetchCalendarSettings();
    },
    retry: shouldRetryIntegration,
    staleTime: 60_000,
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<CalendarSyncSettings>): Promise<CalendarSyncSettings> => {
      if (!areIntegrationGapsEnabled()) {
        // No persistence contract. The change still takes effect for this
        // session — the setting is real and drives real behaviour — and the
        // screen says it is not saved to the account. Refusing the change
        // outright would make the settings screen read-only for a capability
        // that works.
        return { ...(query.data ?? DEFAULT_CALENDAR_SETTINGS), ...patch };
      }
      return gapApi.updateCalendarSettings(patch);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(integrationKeys.calendarSettings(userId), settings);
      trackIntegrationEvent('calendar.settings.changed', {});
    },
  });

  return {
    settings: query.data ?? DEFAULT_CALENDAR_SETTINGS,
    isLoading: query.isLoading,
    /** False when the change lives only in this session — GAP-006. */
    isPersisted: areIntegrationGapsEnabled(),
    update: update.mutate,
    isUpdating: update.isPending,
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

// ═════════════════════════════════════════════════════════════════════════════
// IDENTITY — §21, §24
// ═════════════════════════════════════════════════════════════════════════════

export function useIdentityLinks() {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: integrationKeys.identities(userId),
    queryFn: async (): Promise<IdentityLink[]> => {
      if (!areIntegrationGapsEnabled()) return [];
      return gapApi.fetchIdentityLinks();
    },
    retry: shouldRetryIntegration,
    // Always refetched. This list is the input to a lock-out decision and a
    // stale copy could enable an unlink the current state forbids.
    staleTime: 0,
  });

  // §24's rule applied over the whole set, once, here — never per row.
  const links = useMemo(() => applyUnlinkRules(query.data ?? []), [query.data]);

  return {
    links,
    isLoading: query.isLoading,
    error: query.error ? toIntegrationError(query.error) : null,
  };
}

export function useUnlinkIdentity() {
  const queryClient = useQueryClient();
  const userId = useMemberId();

  return useMutation({
    mutationFn: (input: { provider: IntegrationProviderId; reauthToken: string }) =>
      gapApi.unlinkIdentity(input.provider, input.reauthToken),
    onSuccess: (links, input) => {
      queryClient.setQueryData(integrationKeys.identities(userId), links);
      trackIntegrationEvent('identity.provider.unlinked', {
        provider: input.provider,
        linkedProviderCount: links.length,
      });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// EMAIL — §17
// ═════════════════════════════════════════════════════════════════════════════

export function useEmailIdentity() {
  const userId = useMemberId();
  const queryClient = useQueryClient();
  const authEmail = useAuthStore((state) => state.user?.email ?? null);

  const query = useQuery({
    queryKey: integrationKeys.email(userId),
    queryFn: async (): Promise<gapApi.EmailIdentityState> => {
      if (!areIntegrationGapsEnabled()) {
        // The address is real — it is on the session — and the verification
        // state is not knowable. Reporting `isVerified: false` would be a claim
        // the platform has not made, so it is reported as unknown by carrying
        // the address with no verification timestamps, and the screen says the
        // state cannot be checked in this build.
        return {
          address: authEmail ?? '',
          isVerified: false,
          verificationSentAt: null,
          verificationExpiresAt: null,
          cooldownSeconds: 0,
          deliveryState: 'ok',
          pendingAddress: null,
        };
      }
      return gapApi.fetchEmailIdentity();
    },
    retry: shouldRetryIntegration,
    staleTime: 30_000,
  });

  const resend = useMutation({
    mutationFn: () => gapApi.sendEmailVerification(),
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
    /** False when the verification state is unknown rather than known-false. */
    isVerificationStateKnown: areIntegrationGapsEnabled(),
    error: query.error ? toIntegrationError(query.error) : null,
    resend: resend.mutateAsync,
    isResending: resend.isPending,
    change: change.mutateAsync,
    isChanging: change.isPending,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// GOVERNMENT — §19, §60
// ═════════════════════════════════════════════════════════════════════════════

/** Which countries this deployment has any source for. Empty is a valid answer. */
export function useGovernmentCountries() {
  return useQuery({
    queryKey: integrationKeys.governmentSources(),
    queryFn: () => resolveGovernmentProvider().supportedCountries(),
    retry: shouldRetryIntegration,
    staleTime: 30 * 60_000,
  });
}

/**
 * Notices for one country.
 *
 * `countryCode` is required and the query is disabled without one. §60's rule
 * is enforced at three layers — the provider signature, the cache key and this
 * `enabled` — because a surface that could render "all countries" is a surface
 * that eventually shows Nigerian visa information to somebody browsing Canada.
 */
export function useGovernmentNotices(
  countryCode: string | null,
  category?: GovernmentNotice['category']
) {
  const query = useQuery({
    queryKey: integrationKeys.governmentNotices(countryCode ?? 'none', category),
    queryFn: () => resolveGovernmentProvider().listNotices(countryCode as string, { category }),
    enabled: Boolean(countryCode),
    retry: shouldRetryIntegration,
    staleTime: 30 * 60_000,
  });

  return {
    notices: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? toIntegrationError(query.error) : null,
    /** The mode, so the screen renders the provenance §20 requires. */
    mode: resolveGovernmentProvider().descriptor.mode,
    refetch: query.refetch,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PAYMENT METHODS — §26
// ═════════════════════════════════════════════════════════════════════════════

export function usePaymentMethods() {
  const userId = useMemberId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: integrationKeys.paymentMethods(userId),
    queryFn: async () => {
      if (!areIntegrationGapsEnabled()) return [];
      return gapApi.fetchSavedPaymentMethods();
    },
    retry: shouldRetryIntegration,
    staleTime: 60_000,
  });

  const forget = useMutation({
    mutationFn: (id: string) => gapApi.forgetSavedPaymentMethod(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.paymentMethods(userId) });
    },
  });

  return {
    methods: query.data ?? [],
    isLoading: query.isLoading,
    /**
     * False when the platform stores no saved methods at all. Distinct from an
     * empty list, which means the member has not added one — GAP-015.
     */
    isRegistryAvailable: areIntegrationGapsEnabled(),
    forget: forget.mutateAsync,
  };
}
