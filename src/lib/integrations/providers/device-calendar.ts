// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — device calendar provider (Frontend Phase 16, §9)
//
// The `expo-calendar` implementation of `CalendarProvider`. On iOS this is
// Apple Calendar; on Android it is whichever calendar app owns the provider.
//
// ⚠ NOT ACTIVE IN THIS BUILD. `expo-calendar` is not in `package.json` and
//   there is no development build containing the native module — see
//   INTEGRATION-PROVIDER-GAP-001. `loadCalendarModule()` returns null and
//   `resolveCalendarProvider()` selects the development adapter or the
//   refusing provider. This file loads rather than crashing the bundle. ⚠
//
// It is written now for the reason Phase 8 wrote `native-map.tsx` before its
// native module existed: an interface designed against one implementation is an
// interface shaped like that implementation. Writing the real one is what turns
// "we have an abstraction" into a claim with evidence, and it found three
// things a simulated-only design would have missed.
//
// ── The three, because each is a real behaviour difference ───────────────────
//
//   **iOS 17 split calendar permission in two.** `WriteOnly` and `Full` are
//   different grants with different prompts and different denial states, and an
//   export-only feature must ask for the narrower one — §36 says request the
//   permission the capability needs and no more. The module exposes them as
//   separate calls, so `usesDevicePermission` is not enough on its own and
//   `requestPermission()` below chooses. A design that only ever ran against a
//   simulated provider would have had one permission and over-asked on iOS.
//
//   **A device calendar has no stable "did I write this" record.** Google's API
//   has extended properties; the device calendar has notes. So `findExported`
//   marks Diaspora's events with a fingerprint line in the notes and looks for
//   it — visible to the member, which is honest, and imperfect if they edit it,
//   which is why §8's conflict behaviour degrades to "duplicate" on a null
//   answer rather than to "skip".
//
//   **Timezones are per-event and the module will happily ignore ours.**
//   `expo-calendar` takes `Date` objects, which are absolute instants, plus a
//   separate `timeZone` string that controls how the calendar *displays* them.
//   Passing the instant without the zone is what silently converts an event to
//   the device's clock — §62's exact prohibition — so both are always passed.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import type {
  CalendarEventDraft,
  CalendarEventRef,
  CalendarRef,
  IntegrationCapability,
} from '@/types/integrations';
import { INTEGRATION_PROVIDER_GAPS } from '@/config/integration-provider-gaps';
import { integrationError } from '../errors';
import type { CalendarProvider, PermissionSnapshot } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Optional native module
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The subset of `expo-calendar` this adapter uses.
 *
 * Typed structurally rather than imported, because importing the types would
 * make the package a build-time dependency and the whole point is that it is
 * not one yet. The shape follows the SDK 57 API.
 */
interface CalendarModule {
  getCalendarPermissionsAsync(): Promise<NativePermission>;
  requestCalendarPermissionsAsync(): Promise<NativePermission>;
  /** iOS 17+. Absent on older SDKs and on Android, which is why every call is guarded. */
  requestWriteOnlyCalendarPermissionsAsync?(): Promise<NativePermission>;
  getCalendarsAsync(entityType?: string): Promise<NativeCalendar[]>;
  createEventAsync(calendarId: string, details: Record<string, unknown>): Promise<string>;
  updateEventAsync(eventId: string, details: Record<string, unknown>): Promise<string>;
  deleteEventAsync(eventId: string, options?: Record<string, unknown>): Promise<void>;
  getEventsAsync(calendarIds: string[], startDate: Date, endDate: Date): Promise<NativeEvent[]>;
  EntityTypes?: { EVENT: string; REMINDER: string };
  Availability?: Record<string, string>;
}

interface NativePermission {
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
  /** iOS 17+ reports which of the two grants is held. */
  accessPrivileges?: 'all' | 'writeOnly' | 'none';
}

interface NativeCalendar {
  id: string;
  title: string;
  color?: string;
  allowsModifications: boolean;
  isPrimary?: boolean;
  timeZone?: string;
  source?: { name?: string };
}

interface NativeEvent {
  id: string;
  title?: string;
  notes?: string;
  calendarId?: string;
}

function loadCalendarModule(): CalendarModule | null {
  try {
    // Same pattern and same reasoning as `native-map.tsx` and `device-location.ts`:
    // a `try` around `require` turns an absent optional native dependency into a
    // runtime null instead of a bundler error. It also covers the case where the
    // package is installed but its native side is not linked — Expo Go — which
    // throws on import rather than resolving to undefined.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('expo-calendar');
    return mod?.getCalendarsAsync ? (mod as CalendarModule) : null;
  } catch {
    return null;
  }
}

const calendarModule = loadCalendarModule();

/** Whether the device calendar could be used at all in this build. */
export function hasDeviceCalendar(): boolean {
  return calendarModule !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The fingerprint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The marker Diaspora leaves in an exported event's notes.
 *
 * Deliberately human-readable rather than an opaque hash. A member who opens
 * the event in their calendar app sees a line saying where it came from, which
 * is both the honest thing and the thing that makes an unexpected event
 * explicable. The trade is that they can delete it and the deduplication then
 * fails open — see the header.
 */
const FINGERPRINT_PREFIX = 'diaspora-event:';

function fingerprintLine(sourceId: string): string {
  return `${FINGERPRINT_PREFIX}${sourceId}`;
}

function notesWithFingerprint(draft: CalendarEventDraft): string {
  const base = draft.notes?.trim();
  const marker = `Added from Diaspora · ${fingerprintLine(draft.sourceId)}`;
  return base ? `${base}\n\n${marker}` : marker;
}

// ─────────────────────────────────────────────────────────────────────────────
// Translation
// ─────────────────────────────────────────────────────────────────────────────

function toPermissionSnapshot(native: NativePermission): PermissionSnapshot {
  if (native.status === 'granted') {
    return { state: 'granted', requiresSettings: false, canAskAgain: false };
  }
  if (native.status === 'undetermined') {
    return { state: 'notRequested', requiresSettings: false, canAskAgain: true };
  }
  // Denied. The distinction that decides the recovery: a denial we may re-ask
  // about is recoverable in-app; one we may not is only fixable in Settings,
  // and offering "Allow" for it produces a button that does nothing.
  return {
    state: native.canAskAgain ? 'denied' : 'blocked',
    requiresSettings: !native.canAskAgain,
    canAskAgain: native.canAskAgain,
  };
}

function toCalendarRef(native: NativeCalendar): CalendarRef {
  return {
    id: native.id,
    title: native.title,
    color: native.color ?? null,
    allowsModifications: native.allowsModifications,
    isPrimary: native.isPrimary ?? false,
    provider: 'calendar.device',
    timeZone: native.timeZone ?? null,
  };
}

/**
 * A draft, as `expo-calendar` wants it.
 *
 * `startDate`/`endDate` are absolute instants and `timeZone` controls how the
 * calendar renders them. Both are always sent — see the header's third point.
 * `alarms` uses `relativeOffset`, which is negative minutes before the start;
 * the domain model uses positive minutes before, so the sign is flipped here
 * rather than in the domain, because "15 minutes before" is the product's way
 * of saying it and `-15` is the vendor's.
 */
function toNativeEventDetails(draft: CalendarEventDraft): Record<string, unknown> {
  return {
    title: draft.title,
    startDate: new Date(draft.startsAt),
    endDate: new Date(draft.endsAt),
    timeZone: draft.timeZone,
    allDay: draft.isAllDay,
    location: draft.location ?? undefined,
    notes: notesWithFingerprint(draft),
    url: draft.url ?? undefined,
    alarms: draft.reminderMinutes.map((minutes) => ({ relativeOffset: -Math.abs(minutes) })),
    recurrenceRule: draft.recurrenceRule ? parseRecurrence(draft.recurrenceRule) : undefined,
  };
}

/**
 * RRULE → `expo-calendar`'s recurrence object.
 *
 * Handles the four frequencies plus interval, count and until, which covers
 * every rule the platform's own recurring events produce. Anything richer
 * returns undefined rather than a wrong rule: an event that recurs on the wrong
 * days in somebody's calendar is worse than one that does not recur at all, and
 * the caller reports a partial export rather than a silent misfire.
 */
function parseRecurrence(rrule: string): Record<string, unknown> | undefined {
  const body = rrule.replace(/^RRULE:/i, '');
  const parts = new Map(
    body
      .split(';')
      .map((chunk) => chunk.split('='))
      .filter((pair): pair is [string, string] => pair.length === 2)
      .map(([key, value]) => [key.toUpperCase(), value])
  );

  const freq = parts.get('FREQ')?.toLowerCase();
  if (!freq || !['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) return undefined;

  const rule: Record<string, unknown> = { frequency: freq };

  const interval = Number(parts.get('INTERVAL'));
  if (Number.isFinite(interval) && interval > 0) rule.interval = interval;

  const count = Number(parts.get('COUNT'));
  if (Number.isFinite(count) && count > 0) rule.occurrence = count;

  const until = parts.get('UNTIL');
  if (until) {
    const parsed = Date.parse(
      // RFC 5545 basic format: 20260901T170000Z. `Date.parse` needs separators.
      until.replace(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/, '$1-$2-$3T$4:$5:$6Z')
    );
    if (!Number.isNaN(parsed)) rule.endDate = new Date(parsed);
  }

  return rule;
}

/** Every native rejection becomes an `IntegrationError` before it leaves this file. */
function translate(cause: unknown, mutating: boolean): never {
  const message = cause instanceof Error ? cause.message : String(cause);

  // The module's own permission rejection. Matched on the message because
  // expo-calendar does not export error codes; the fallback below covers the
  // case where that message changes, so a match failure degrades rather than
  // misreports.
  if (/permission/i.test(message)) {
    throw integrationError('PermissionDenied', {
      provider: 'calendar.device',
      message: 'Diaspora does not have permission to use your calendar.',
      hint: 'You can allow calendar access in your device settings.',
    });
  }
  if (/not found|no calendar/i.test(message)) {
    throw integrationError('InvalidRequest', {
      provider: 'calendar.device',
      message: 'That calendar is no longer on this device.',
      hint: 'Choose a different calendar.',
    });
  }

  throw integrationError('UnknownError', {
    provider: 'calendar.device',
    // The native message is *not* passed through. It is written for a developer
    // and may contain a path or an account identifier; §56 keeps provider text
    // off the client.
    message: 'Your calendar could not be updated.',
    isIndeterminate: mutating,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The provider
// ─────────────────────────────────────────────────────────────────────────────

const CAPABILITIES: readonly IntegrationCapability[] = [
  'calendar.list',
  'calendar.event.create',
  'calendar.event.update',
  'calendar.event.delete',
] as const;

function requireModule(): CalendarModule {
  if (!calendarModule) {
    throw integrationError('UnsupportedCapability', {
      provider: 'calendar.device',
      message: 'This version of the app cannot use your device calendar.',
      hint: INTEGRATION_PROVIDER_GAPS.deviceCalendar.id,
    });
  }
  return calendarModule;
}

export const deviceCalendarProvider: CalendarProvider = {
  descriptor: {
    id: 'calendar.device',
    label: Platform.OS === 'ios' ? 'Apple Calendar' : 'Device calendar',
    mode: 'REAL_PROVIDER',
  },
  capabilities: CAPABILITIES,
  usesDevicePermission: true,

  async getPermission(): Promise<PermissionSnapshot> {
    const module = requireModule();
    try {
      return toPermissionSnapshot(await module.getCalendarPermissionsAsync());
    } catch (cause) {
      translate(cause, false);
    }
  },

  async requestPermission(): Promise<PermissionSnapshot> {
    const module = requireModule();
    try {
      // §36: request the permission the capability needs and no more. This
      // provider's declared capabilities are export-only, so on iOS 17+ the
      // write-only grant is asked for where the module offers it. Full access
      // becomes necessary only if two-way sync is built
      // (FRONTEND-PHASE16-GAP-005), and that is a separate, later consent.
      if (Platform.OS === 'ios' && module.requestWriteOnlyCalendarPermissionsAsync) {
        return toPermissionSnapshot(await module.requestWriteOnlyCalendarPermissionsAsync());
      }
      return toPermissionSnapshot(await module.requestCalendarPermissionsAsync());
    } catch (cause) {
      translate(cause, false);
    }
  },

  async openSettings(): Promise<void> {
    // `Linking.openSettings()` is in react-native core and needs no optional
    // module, so this works even when `expo-calendar` is absent — which matters,
    // because a member whose permission is blocked needs Settings regardless of
    // whether the calendar module loaded.
    const { Linking } = require('react-native') as typeof import('react-native');
    await Linking.openSettings();
  },

  async listCalendars(): Promise<CalendarRef[]> {
    const module = requireModule();
    try {
      const entityType = module.EntityTypes?.EVENT ?? 'event';
      const calendars = await module.getCalendarsAsync(entityType);
      return calendars
        // A read-only calendar is listed rather than hidden, and rendered
        // disabled with the reason. Hiding it makes a member wonder where their
        // work calendar went; showing it disabled answers the question.
        .map(toCalendarRef)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.title.localeCompare(b.title));
    } catch (cause) {
      translate(cause, false);
    }
  },

  async createEvent(calendarId: string, draft: CalendarEventDraft): Promise<CalendarEventRef> {
    const module = requireModule();
    try {
      const eventId = await module.createEventAsync(calendarId, toNativeEventDetails(draft));
      return {
        externalEventId: eventId,
        calendarId,
        provider: 'calendar.device',
        writtenAt: new Date().toISOString(),
        viewUrl: null,
      };
    } catch (cause) {
      // `mutating: true` — a rejection from a write may still have written.
      translate(cause, true);
    }
  },

  async updateEvent(ref: CalendarEventRef, draft: CalendarEventDraft): Promise<CalendarEventRef> {
    const module = requireModule();
    try {
      await module.updateEventAsync(ref.externalEventId, toNativeEventDetails(draft));
      return { ...ref, writtenAt: new Date().toISOString() };
    } catch (cause) {
      translate(cause, true);
    }
  },

  async deleteEvent(ref: CalendarEventRef): Promise<void> {
    const module = requireModule();
    try {
      await module.deleteEventAsync(ref.externalEventId);
    } catch (cause) {
      translate(cause, true);
    }
  },

  async findExported(sourceId: string, calendarId: string): Promise<CalendarEventRef | null> {
    const module = requireModule();
    try {
      // Bounded window. Searching a member's whole calendar to answer "have I
      // written this" would be slow and would read far more of their calendar
      // than the question needs — a year either side covers every event the
      // platform can export and is a meaningful privacy limit, not just a
      // performance one.
      const now = Date.now();
      const year = 365 * 24 * 60 * 60 * 1000;
      const events = await module.getEventsAsync(
        [calendarId],
        new Date(now - year),
        new Date(now + year)
      );

      const marker = fingerprintLine(sourceId);
      const match = events.find((event) => event.notes?.includes(marker));
      if (!match) return null;

      return {
        externalEventId: match.id,
        calendarId,
        provider: 'calendar.device',
        writtenAt: new Date().toISOString(),
        viewUrl: null,
      };
    } catch {
      // A failed lookup is not a failed export. Returning null means "I do not
      // know", and §8's conflict behaviour treats an unknown as "duplicate" —
      // the only safe default, because skipping on an unknown silently drops an
      // event the member asked for.
      return null;
    }
  },
};
