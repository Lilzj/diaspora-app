// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — simulated integration data (Frontend Phase 16)
//
// ⚠ DEVELOPMENT ONLY. Reached only through `/integrations-gap/v0`, which is
//   registered only when `areSimulatedFeaturesEnabled()` is true. ⚠
//
// Deterministic by construction: the same request produces the same answer on
// every render and in every test. §68 asks for exactly this, and it is what
// makes a disagreement between two integration screens a finding rather than a
// coin toss.
//
// re-asserts them at the boundary so a later edit here cannot break them:
//
//   1. `kind` is never `official`.
//   2. `authority` names Diaspora's development environment, never a real
//      ministry, embassy or department. There is no fixture attributing content
//      to the Home Office, the Ministère de l'Intérieur or anybody else.
//   3. `verification` is always `unverified`, and the UI renders that badge.
//
// The content is deliberately generic — "check the official source for current
// requirements" rather than a specific fee or processing time — so that a
// screenshot of a development build cannot be mistaken for advice.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CalendarEventRef,
  CalendarRef,
  CalendarSyncSettings,
  IdentityLink,
  IntegrationConnection,
  IntegrationProviderId,
  IntegrationSyncState,
} from '@/types/integrations';

/**
 * A fixed clock.
 *
 * Every timestamp below is derived from this rather than from `Date.now()`, so
 * two runs of the same test produce identical payloads. A fixture whose
 * `lastCheckedAt` moved every second would make "is this stale" untestable.
 */
const NOW = new Date('2026-08-09T09:00:00.000Z');

function isoOffset(minutes: number): string {
  return new Date(NOW.getTime() + minutes * 60_000).toISOString();
}

// ═════════════════════════════════════════════════════════════════════════════
// CONNECTIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The simulated connection store.
 *
 * Mutable, because connect and disconnect have to be observable across
 * requests — a simulation where disconnecting had no effect would not exercise
 * §41's "no stale Connected state" at all. Reset between tests by
 * `resetIntegrationGapData`.
 */
let connections: IntegrationConnection[] = [];

export function resetIntegrationGapData(): void {
  connections = [];
  calendarSettings = { ...SEED_CALENDAR_SETTINGS };
  remoteEvents.clear();
}

export function listConnections(): IntegrationConnection[] {
  return connections.map((connection) => ({ ...connection }));
}

export function upsertConnection(
  provider: IntegrationProviderId,
  scopes: string[]
): IntegrationConnection {
  const domain = provider.split('.')[0] as IntegrationConnection['domain'];

  const connection: IntegrationConnection = {
    provider,
    domain: domain === 'identity' ? 'identity' : 'calendar',
    status: 'CONNECTED',
    // Never anything else. A simulated connection that claimed REAL_PROVIDER
    // would defeat §69 at the only point where it matters.
    mode: 'DEVELOPMENT_PROVIDER',
    account: {
      externalId: `simulated-${provider}`,
      accountLabel: 'development@example.com',
      isPrivateRelay: false,
    },
    grantedCapabilities:
      domain === 'calendar'
        ? ['calendar.list', 'calendar.event.create', 'calendar.event.update', 'calendar.event.delete']
        : ['identity.signIn', 'identity.link'],
    scopes,
    // Deliberately near — a connection that never expires would never exercise
    // the REAUTH_REQUIRED path, which is one of the states §31 asks for.
    expiresAt: isoOffset(60 * 24 * 30),
    lastSyncedAt: null,
    lastError: null,
    gapId: null,
    observedAt: NOW.toISOString(),
  };

  connections = [...connections.filter((entry) => entry.provider !== provider), connection];
  return { ...connection };
}

export function removeConnection(provider: IntegrationProviderId): IntegrationConnection {
  const existing = connections.find((entry) => entry.provider === provider);
  connections = connections.filter((entry) => entry.provider !== provider);

  return {
    provider,
    domain: existing?.domain ?? 'calendar',
    status: 'DISCONNECTED',
    mode: 'DEVELOPMENT_PROVIDER',
    // Cleared, not preserved. §41 again: nothing may survive that would let a
    // screen render "Disconnected · development@example.com".
    account: null,
    grantedCapabilities: [],
    scopes: [],
    expiresAt: null,
    lastSyncedAt: null,
    lastError: null,
    gapId: null,
    observedAt: NOW.toISOString(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CALENDAR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Simulated remote calendars.
 *
 * Three, chosen to make the picker's states reachable: a primary writable one,
 * a second writable one, and a **read-only** one. Without the third, the
 * disabled-row branch of the picker would never render in development and would
 * ship untested.
 */
export const REMOTE_CALENDARS: CalendarRef[] = [
  {
    id: 'sim-cal-primary',
    title: 'Personal',
    color: '#4285F4',
    allowsModifications: true,
    isPrimary: true,
    provider: 'calendar.google',
    timeZone: 'Europe/London',
  },
  {
    id: 'sim-cal-community',
    title: 'Community events',
    color: '#0B8043',
    allowsModifications: true,
    isPrimary: false,
    provider: 'calendar.google',
    timeZone: 'Europe/London',
  },
  {
    id: 'sim-cal-shared',
    title: 'Team calendar (view only)',
    color: '#8E24AA',
    allowsModifications: false,
    isPrimary: false,
    provider: 'calendar.google',
    // A different zone from the others, so §62's per-calendar timezone handling
    // is exercised rather than assumed.
    timeZone: 'Africa/Lagos',
  },
];

/** Events the simulation has "written", keyed by `${calendarId}:${sourceId}`. */
const remoteEvents = new Map<string, CalendarEventRef>();

export function createRemoteEvent(
  provider: IntegrationProviderId,
  calendarId: string,
  sourceId: string
): CalendarEventRef {
  const ref: CalendarEventRef = {
    externalEventId: `sim-event-${sourceId}`,
    calendarId,
    provider,
    writtenAt: NOW.toISOString(),
    viewUrl: null,
  };
  remoteEvents.set(`${calendarId}:${sourceId}`, ref);
  return ref;
}

export function findRemoteEvent(calendarId: string, sourceId: string): CalendarEventRef | null {
  return remoteEvents.get(`${calendarId}:${sourceId}`) ?? null;
}

export function deleteRemoteEvent(externalEventId: string): boolean {
  for (const [key, ref] of remoteEvents) {
    if (ref.externalEventId === externalEventId) {
      remoteEvents.delete(key);
      return true;
    }
  }
  return false;
}

/**
 * A completed sync with a partial outcome.
 *
 * Partial rather than clean, deliberately. A simulation that always synced
 * everything would leave §35's `partial` phase — the one that is hardest to
 * render honestly and easiest to get wrong — unexercised in every development
 * build.
 */
export function simulatedSyncState(phase: IntegrationSyncState['phase']): IntegrationSyncState {
  if (phase === 'syncing') {
    return {
      phase: 'syncing',
      lastSyncedAt: null,
      startedAt: NOW.toISOString(),
      itemsSynced: 0,
      itemsFailed: 0,
      failureReasons: [],
      needsAttention: false,
    };
  }

  return {
    phase: 'partial',
    lastSyncedAt: isoOffset(-12),
    startedAt: isoOffset(-13),
    itemsSynced: 7,
    itemsFailed: 1,
    failureReasons: ['One event is on a calendar you can only view.'],
    needsAttention: true,
  };
}

const SEED_CALENDAR_SETTINGS: CalendarSyncSettings = {
  enabled: true,
  defaultCalendarId: 'sim-cal-primary',
  defaultProvider: 'calendar.google',
  autoExportRsvps: false,
  twoWaySyncEnabled: false,
  syncFrequency: 'manual',
  defaultReminderMinutes: [60],
  timeZoneBehaviour: 'eventTimeZone',
  conflictBehaviour: 'skip',
};

let calendarSettings: CalendarSyncSettings = { ...SEED_CALENDAR_SETTINGS };

export function readCalendarSettings(): CalendarSyncSettings {
  return { ...calendarSettings };
}

export function writeCalendarSettings(update: Partial<CalendarSyncSettings>): CalendarSyncSettings {
  calendarSettings = { ...calendarSettings, ...update };
  return { ...calendarSettings };
}

// ═════════════════════════════════════════════════════════════════════════════
// IDENTITY
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The seed identity links.
 *
 * Phone is present, connected and primary, because that is the real state of
 * every account on this platform — it is the only authentication method the
 * certified backend has. That makes the simulation's most useful property true
 * by default: a member has exactly one usable method, so §24's lock-out rule is
 * *active* in a development build rather than only reachable by contriving it.
 */


// Email is not simulated: `/auth/email` is served (GAP-008), and
// `lib/auth-api.ts` reads, verifies and changes the address in every build.
