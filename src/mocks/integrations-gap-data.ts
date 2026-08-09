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
// ── The government fixtures, and the rule they follow ────────────────────────
//
// §19 forbids fabricating a government integration and §20 forbids presenting
// unofficial information as official. Both are easy to violate here without
// noticing, because a realistic-looking visa advisory is indistinguishable from
// a real one on screen — and a wrong one could cause somebody to miss a
// deadline or a flight.
//
// So every fixture below obeys three rules, and `providers/government.ts`
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
  GovernmentNotice,
  IdentityLink,
  IntegrationConnection,
  IntegrationProviderId,
  IntegrationSyncState,
} from '@/types/integrations';
import type { EmailIdentityState, GovernmentSourceSummary, SavedPaymentMethod } from '@/lib/integrations-gap-api';

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
  identityLinks = seedIdentityLinks();
  calendarSettings = { ...SEED_CALENDAR_SETTINGS };
  remoteEvents.clear();
  emailState = { ...SEED_EMAIL_STATE };
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
      isPrivateRelay: provider === 'identity.apple',
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
function seedIdentityLinks(): IdentityLink[] {
  return [
    {
      provider: 'identity.phone',
      status: 'CONNECTED',
      // Phone sign-in is genuinely backed by `/auth/otp/*`, which is certified.
      // Marking it DEVELOPMENT_PROVIDER here would understate what exists.
      mode: 'BACKEND_CONNECTED',
      account: { externalId: 'sim-phone', accountLabel: '+44 7700 900123' },
      linkedAt: isoOffset(-60 * 24 * 200),
      lastUsedAt: isoOffset(-30),
      isPrimary: true,
      isCurrentSession: true,
      // Computed by `applyUnlinkRules` over the whole set; the seed value is
      // overwritten and is set conservatively so a consumer that forgot to
      // apply the rules fails closed rather than open.
      canUnlink: false,
      cannotUnlinkReason: null,
    },
  ];
}

let identityLinks: IdentityLink[] = seedIdentityLinks();

export function listIdentityLinks(): IdentityLink[] {
  return identityLinks.map((link) => ({ ...link }));
}

export function linkIdentity(provider: IntegrationProviderId): IdentityLink[] {
  if (identityLinks.some((link) => link.provider === provider)) return listIdentityLinks();

  identityLinks = [
    ...identityLinks,
    {
      provider,
      status: 'CONNECTED',
      mode: 'DEVELOPMENT_PROVIDER',
      account: {
        externalId: `simulated-${provider}`,
        accountLabel: 'development@example.com',
        isPrivateRelay: provider === 'identity.apple',
      },
      linkedAt: NOW.toISOString(),
      lastUsedAt: null,
      isPrimary: false,
      isCurrentSession: false,
      canUnlink: true,
      cannotUnlinkReason: null,
    },
  ];

  return listIdentityLinks();
}

/**
 * Removes a link, or refuses.
 *
 * The refusal is implemented in the simulation rather than only in the UI,
 * because a development adapter that let a member unlink their way out of their
 * own account would teach the interface that the guard is unnecessary — and the
 * guard is the one thing §24 is about. `null` means refused.
 *
 * Note the count is of methods that could actually sign somebody in: a
 * simulated Google link is not a way back into a real account, which is the
 * same rule `applyUnlinkRules` applies on the client.
 */
export function unlinkIdentityProvider(provider: IntegrationProviderId): IdentityLink[] | null {
  const usable = identityLinks.filter(
    (link) => link.mode !== 'DEVELOPMENT_PROVIDER' && link.status === 'CONNECTED'
  );
  const target = identityLinks.find((link) => link.provider === provider);

  if (target && usable.length <= 1 && usable.some((link) => link.provider === provider)) {
    return null;
  }

  identityLinks = identityLinks.filter((link) => link.provider !== provider);
  return listIdentityLinks();
}

// ═════════════════════════════════════════════════════════════════════════════
// EMAIL
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Unverified by default.
 *
 * The state that has something to do in it. A verified seed would leave the
 * resend flow, the cooldown and the pending-verification banner unexercised.
 */
const SEED_EMAIL_STATE: EmailIdentityState = {
  address: 'development@example.com',
  isVerified: false,
  verificationSentAt: null,
  verificationExpiresAt: null,
  cooldownSeconds: 0,
  deliveryState: 'ok',
  pendingAddress: null,
};

let emailState: EmailIdentityState = { ...SEED_EMAIL_STATE };

export function readEmailState(): EmailIdentityState {
  return { ...emailState };
}

export function sendEmailVerificationSimulated(): EmailIdentityState {
  emailState = {
    ...emailState,
    verificationSentAt: NOW.toISOString(),
    verificationExpiresAt: isoOffset(60),
    cooldownSeconds: 60,
  };
  return { ...emailState };
}

export function changeEmailSimulated(address: string): EmailIdentityState {
  emailState = {
    ...emailState,
    // The old address stays live until the new one is verified — the behaviour
    // GAP-008 requires, simulated so the UI branch that explains it is reachable.
    pendingAddress: address,
    verificationSentAt: NOW.toISOString(),
    verificationExpiresAt: isoOffset(60),
    cooldownSeconds: 60,
  };
  return { ...emailState };
}

// ═════════════════════════════════════════════════════════════════════════════
// GOVERNMENT — read the header before editing anything below
// ═════════════════════════════════════════════════════════════════════════════

export const GOVERNMENT_SOURCES: GovernmentSourceSummary[] = [
  {
    countryCode: 'GB',
    authority: 'Diaspora development environment',
    sourceKind: 'curated',
    officialUrl: null,
    lastCheckedAt: isoOffset(-60 * 6),
    isLive: false,
  },
  {
    countryCode: 'NG',
    authority: 'Diaspora development environment',
    sourceKind: 'curated',
    officialUrl: null,
    lastCheckedAt: isoOffset(-60 * 30),
    isLive: false,
  },
  {
    countryCode: 'MU',
    authority: 'Diaspora development environment',
    sourceKind: 'curated',
    officialUrl: null,
    // Deliberately old, so the staleness indicator has something to indicate.
    lastCheckedAt: isoOffset(-60 * 24 * 45),
    isLive: false,
  },
];

/**
 * Notices for a country.
 *
 * Content is generic on purpose. Every item tells the member to check the
 * official source rather than stating a fee, a processing time or a
 * requirement — because a development build's screenshot must not be usable as
 * advice, and because a specific number is exactly what somebody would act on.
 */
export function governmentNoticesFor(countryCode: string): GovernmentNotice[] {
  const source = GOVERNMENT_SOURCES.find((entry) => entry.countryCode === countryCode);
  if (!source) return [];

  const base = {
    kind: 'curated' as const,
    authority: source.authority,
    countryCode,
    region: null,
    officialUrl: null,
    publishedAt: isoOffset(-60 * 24 * 7),
    lastCheckedAt: source.lastCheckedAt,
    verification: 'unverified' as const,
  };

  return [
    {
      id: `sim-notice-${countryCode}-1`,
      title: 'Example notice',
      summary:
        'This is placeholder content in a development build. Real notices are not available — check the official government source for this country.',
      body: null,
      category: 'notice',
      advisoryLevel: null,
      source: { ...base },
      effectiveFrom: isoOffset(-60 * 24 * 7),
      effectiveTo: null,
    },
    {
      id: `sim-notice-${countryCode}-2`,
      title: 'Example travel advisory',
      summary:
        'Placeholder content. Diaspora is not a government and does not publish travel advice — always read the official advisory for the country you are travelling to.',
      body: null,
      category: 'advisory',
      // A neutral level. A simulated "do not travel" is exactly the fixture that
      // could be screenshotted and believed.
      advisoryLevel: 'normal',
      source: { ...base },
      effectiveFrom: isoOffset(-60 * 24 * 3),
      effectiveTo: null,
    },
    {
      id: `sim-notice-${countryCode}-3`,
      title: 'Example embassy entry',
      summary:
        'Placeholder contact details are not shown. Look up the embassy or high commission directly.',
      body: null,
      category: 'embassy',
      advisoryLevel: null,
      source: { ...base },
      effectiveFrom: null,
      effectiveTo: null,
    },
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// PAYMENT METHODS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Display fields only.
 *
 * There is no PAN, no token and no expiry beyond what a member needs to
 * recognise the card. §28 forbids storing raw card data, and a fixture is the
 * easiest place for a plausible-looking card number to be added by somebody
 * making the simulation "more realistic" — so the shape has nowhere to put one.
 */
export const SAVED_PAYMENT_METHODS: SavedPaymentMethod[] = [
  {
    id: 'sim-pm-1',
    kind: 'Card',
    brand: 'Visa',
    last4: '4242',
    expiryMonth: 12,
    expiryYear: 2029,
    isDefault: true,
    addedAt: isoOffset(-60 * 24 * 90),
  },
];
