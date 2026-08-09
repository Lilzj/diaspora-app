// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — calendar capability (Frontend Phase 16, §7 · §8 · §62)
//
// **The only place in the application that turns a Diaspora event into a
// calendar entry.** §7 is explicit — "do not duplicate calendar logic inside
// each event screen" — and the enforcement is that every event surface calls
// `exportEventToCalendar` and none of them constructs a draft.
//
// ── §62, which is the hard part and the reason this file is long ─────────────
//
// A Diaspora event carries a wall-clock time and an IANA zone: 18:00,
// `Africa/Lagos`. A calendar needs an absolute instant. Converting between them
// is the whole of §62 and it is where this integration would most plausibly go
// quietly wrong.
//
// The failure mode is specific. `new Date('2026-09-01T18:00')` parses as 18:00
// *in the device's zone*. For a member in London that is 18:00 BST, which is
// 17:00 in Lagos — so the event lands in their calendar an hour before it
// starts, with no error and nothing to notice until they arrive early. §62
// forbids exactly this: "do not silently convert an event to the device
// timezone if the event has a different authoritative timezone."
//
// So the conversion is explicit, DST-aware, and done in two passes:
//
//   1. Treat the wall clock as if it were UTC and ask what offset the target
//      zone had at that approximate instant.
//   2. Apply it, then re-ask — because an event at 01:30 on a DST boundary sits
//      either side of a transition depending on which guess you started from,
//      and one pass gets it wrong by an hour twice a year.
//
// A second pass that disagrees with the first means the wall clock falls inside
// a transition, and the second answer is used: for a *skipped* hour it yields
// the instant the clock jumps to, and for a *repeated* hour the first
// occurrence. Both are what a calendar application does.
//
// ── When `Intl` cannot answer ────────────────────────────────────────────────
//
// Hermes carries ICU on both platforms, but a build with a trimmed ICU, or a
// zone the runtime does not know, will throw. That case is handled rather than
// assumed away: `convertToInstant` reports `isExact: false`, the caller marks
// the export, and the sheet tells the member the time was interpreted in their
// device's zone. A silent one-hour error is the thing §62 is about; a visible
// caveat is not.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CalendarEventDraft,
  CalendarEventRef,
  CalendarRef,
  CalendarSyncSettings,
  IntegrationProviderId,
} from '@/types/integrations';
import type { Event } from '@/types/community-life';
import { integrationError, isIntegrationError, type IntegrationError } from './errors';
import { resolveCalendarProviderById } from './registry';
import { trackCalendarExport } from './events';
import type { CalendarProvider, PermissionSnapshot } from './providers/types';

// ═════════════════════════════════════════════════════════════════════════════
// TIMEZONE — §62
// ═════════════════════════════════════════════════════════════════════════════

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * The offset, in minutes, that `timeZone` had at `instant`.
 *
 * Positive east of UTC. Derived by formatting the instant *into* the zone and
 * reading the wall clock back — the only way to get an offset for an arbitrary
 * zone without shipping a timezone database.
 */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = formatter.formatToParts(instant);
  const read = (type: string): number => {
    const value = parts.find((part) => part.type === type)?.value;
    return value ? Number(value) : 0;
  };

  // `hour` comes back as 24 rather than 0 at midnight under `hour12: false` in
  // some implementations. Left as-is and normalised by `Date.UTC`, which
  // handles the overflow into the next day correctly.
  const asIfUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second')
  );

  return (asIfUtc - instant.getTime()) / 60_000;
}

export interface InstantConversion {
  instant: Date;
  /** False when the runtime could not resolve the zone and the device's was used. */
  isExact: boolean;
}

/**
 * A wall clock in a named zone, as an absolute instant.
 *
 * See the file header for the two-pass algorithm and why one pass is not
 * enough.
 */
export function convertToInstant(wall: WallClock, timeZone: string): InstantConversion {
  const asIfUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);

  try {
    const firstOffset = offsetMinutesAt(new Date(asIfUtc), timeZone);
    const candidate = new Date(asIfUtc - firstOffset * 60_000);

    const secondOffset = offsetMinutesAt(candidate, timeZone);
    if (secondOffset === firstOffset) return { instant: candidate, isExact: true };

    return { instant: new Date(asIfUtc - secondOffset * 60_000), isExact: true };
  } catch {
    // The runtime does not know this zone. Fall back to the device's
    // interpretation and say so — the caller surfaces the caveat rather than
    // pretending the conversion was exact.
    return {
      instant: new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute),
      isExact: false,
    };
  }
}

/** `YYYY-MM-DD` + `HH:MM` → a wall clock. Returns null for anything malformed. */
function parseWallClock(date: string, time: string): WallClock | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!dateMatch || !timeMatch) return null;

  return {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// DRAFT CONSTRUCTION
// ═════════════════════════════════════════════════════════════════════════════

export interface DraftResult {
  draft: CalendarEventDraft;
  /** False when the timezone could not be resolved — the caller must say so. */
  isTimeZoneExact: boolean;
}

/**
 * A Diaspora event as a calendar draft.
 *
 * The one conversion, used by every event surface. `Event` carries `date`,
 * `time`, `endTime` and `timezone` as separate strings (`types/community-life.ts`),
 * so this is where they become instants.
 *
 * An event whose `endTime` is earlier than its `time` is treated as running
 * past midnight rather than as invalid — a 22:00–01:00 community event is
 * ordinary, and rejecting it would make the export fail for exactly the events
 * most worth having a reminder for.
 */
export function eventToDraft(
  event: Event,
  options: { reminderMinutes?: number[]; timeZoneBehaviour?: CalendarSyncSettings['timeZoneBehaviour'] } = {}
): DraftResult {
  const zone =
    options.timeZoneBehaviour === 'deviceTimeZone'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : event.timezone;

  const startWall = parseWallClock(event.date, event.time);
  const endWall = parseWallClock(event.date, event.endTime);

  if (!startWall) {
    throw integrationError('InvalidRequest', {
      capability: 'calendar.event.create',
      message: 'This event does not have a time that can be added to a calendar.',
    });
  }

  const start = convertToInstant(startWall, zone);
  const end = endWall
    ? convertToInstant(endWall, zone)
    : { instant: new Date(start.instant.getTime() + 60 * 60_000), isExact: start.isExact };

  // Past midnight. Compared as instants rather than as wall clocks so a
  // transition between the two does not produce a spurious day rollover.
  const endInstant =
    end.instant.getTime() <= start.instant.getTime()
      ? new Date(end.instant.getTime() + 24 * 60 * 60_000)
      : end.instant;

  const locationParts = [
    event.location.addressLine,
    event.location.areaName,
    event.location.cityName,
  ].filter((part) => part && part.trim().length > 0);

  return {
    draft: {
      sourceId: event.id,
      sourceKind: 'event',
      title: event.title,
      startsAt: start.instant.toISOString(),
      endsAt: endInstant.toISOString(),
      // The zone travels with the draft, so the calendar renders the event in
      // the zone it happens in rather than in the reader's. This is the field
      // whose omission is §62's exact prohibition.
      timeZone: zone,
      isAllDay: false,
      location: locationParts.length > 0 ? locationParts.join(', ') : null,
      // The description is truncated rather than sent whole: a calendar entry's
      // notes field is shown in previews and lock screens, and a full event
      // description there is noise at best.
      notes: event.description ? truncate(event.description, 400) : null,
      url: null,
      reminderMinutes: options.reminderMinutes ?? [60],
      recurrenceRule: null,
    },
    isTimeZoneExact: start.isExact && end.isExact,
  };
}

function truncate(text: string, limit: number): string {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT — §7, §8
// ═════════════════════════════════════════════════════════════════════════════

export interface ExportRequest {
  draft: CalendarEventDraft;
  provider: IntegrationProviderId;
  calendarId: string;
  conflictBehaviour: CalendarSyncSettings['conflictBehaviour'];
  isTimeZoneExact: boolean;
}

export type ExportOutcome =
  | { kind: 'created'; ref: CalendarEventRef; timeZoneCaveat: boolean }
  | { kind: 'updated'; ref: CalendarEventRef; timeZoneCaveat: boolean }
  | { kind: 'skipped'; ref: CalendarEventRef; reason: string }
  | { kind: 'failed'; error: IntegrationError };

/**
 * Puts one event in one calendar.
 *
 * Returns an outcome rather than throwing, because "already there" and "the
 * calendar refused" are both ordinary results a sheet has to render, and a
 * `catch` block is the wrong shape for the second-most-common path.
 *
 * §8's conflict behaviour is applied here, once, rather than by each caller.
 * The `duplicate` default when `findExported` cannot answer is deliberate and
 * is explained in the provider contract: skipping on an unknown silently drops
 * an event the member explicitly asked for, and a duplicate is annoying rather
 * than harmful.
 */
export async function exportEventToCalendar(request: ExportRequest): Promise<ExportOutcome> {
  const provider = resolveCalendarProviderById(request.provider);
  const startedAt = Date.now();

  try {
    if (request.conflictBehaviour !== 'duplicate') {
      const existing = await provider.findExported(request.draft.sourceId, request.calendarId);

      if (existing && request.conflictBehaviour === 'skip') {
        return {
          kind: 'skipped',
          ref: existing,
          reason: 'This event is already in that calendar.',
        };
      }

      if (existing && request.conflictBehaviour === 'update') {
        const ref = await provider.updateEvent(existing, request.draft);
        trackCalendarExport({
          provider: request.provider,
          mode: provider.descriptor.mode,
          succeeded: true,
          isRecurring: Boolean(request.draft.recurrenceRule),
          isAllDay: request.draft.isAllDay,
          usesEventTimeZone: request.isTimeZoneExact,
          durationMs: Date.now() - startedAt,
        });
        return { kind: 'updated', ref, timeZoneCaveat: !request.isTimeZoneExact };
      }
    }

    const ref = await provider.createEvent(request.calendarId, request.draft);

    trackCalendarExport({
      provider: request.provider,
      mode: provider.descriptor.mode,
      succeeded: true,
      isRecurring: Boolean(request.draft.recurrenceRule),
      isAllDay: request.draft.isAllDay,
      usesEventTimeZone: request.isTimeZoneExact,
      durationMs: Date.now() - startedAt,
    });

    return { kind: 'created', ref, timeZoneCaveat: !request.isTimeZoneExact };
  } catch (cause) {
    const error = isIntegrationError(cause)
      ? cause
      : integrationError('UnknownError', {
          provider: request.provider,
          capability: 'calendar.event.create',
          // A write that threw something unrecognised may still have written.
          isIndeterminate: true,
        });

    trackCalendarExport({
      provider: request.provider,
      mode: provider.descriptor.mode,
      succeeded: false,
      isRecurring: Boolean(request.draft.recurrenceRule),
      isAllDay: request.draft.isAllDay,
      usesEventTimeZone: request.isTimeZoneExact,
      errorKind: error.kind,
      durationMs: Date.now() - startedAt,
    });

    return { kind: 'failed', error };
  }
}

/**
 * Ensures a provider is ready to be written to, running the permission flow if
 * it has one.
 *
 * Returns the provider when it is usable and an error when it is not, so the
 * sheet can render the specific recovery — "Open settings" for a blocked OS
 * permission, "Reconnect" for an expired grant — rather than one generic
 * failure. The distinction comes from `usesDevicePermission`, which is why that
 * flag is on the provider contract rather than inferred from the provider id.
 */
export type PrepareResult =
  | { ok: true; provider: CalendarProvider }
  /**
   * The permission is the reason. **Carries the snapshot**, so the caller can
   * render the right recovery without inspecting the error.
   *
   * The alternative — deriving `canAskAgain` from whether the error's hint text
   * mentions "settings" — was written first and is exactly the kind of coupling
   * that breaks silently when copy is edited. A member whose permission is
   * blocked would be offered an "Allow" button that does nothing, and the only
   * symptom would be a changed sentence in a different file.
   */
  | { ok: false; reason: 'permission'; permission: PermissionSnapshot; error: IntegrationError }
  | { ok: false; reason: 'error'; error: IntegrationError };

export async function prepareCalendarProvider(
  providerId: IntegrationProviderId
): Promise<PrepareResult> {
  const provider = resolveCalendarProviderById(providerId);

  if (!provider.usesDevicePermission) {
    return { ok: true, provider };
  }

  try {
    let permission = await provider.getPermission();

    if (permission.state === 'notRequested' || (permission.state === 'denied' && permission.canAskAgain)) {
      permission = await provider.requestPermission();
    }

    if (permission.state === 'granted') return { ok: true, provider };

    return {
      ok: false,
      reason: 'permission',
      permission,
      error: integrationError('PermissionDenied', {
        provider: providerId,
        capability: 'calendar.event.create',
        message:
          permission.state === 'restricted'
            ? 'Calendar access is restricted on this device.'
            : 'Diaspora does not have permission to use your calendar.',
        hint: permission.requiresSettings
          ? 'You can allow calendar access in your device settings.'
          : 'Allow calendar access to add events.',
        // `restricted` is a managed-device policy. The member cannot change it,
        // and asking them to try is asking them to fail.
        needsMemberAction: permission.state !== 'restricted',
      }),
    };
  } catch (cause) {
    return {
      ok: false,
      reason: 'error',
      error: isIntegrationError(cause)
        ? cause
        : integrationError('UnknownError', { provider: providerId }),
    };
  }
}

/**
 * The calendars a member can write to, across every available provider.
 *
 * Read-only calendars are **kept** and marked rather than filtered out. A
 * member whose work calendar is subscribed-only should see it greyed with the
 * reason, not wonder where it went — the same decision the device provider's
 * `listCalendars` documents, applied at the aggregation level so one provider
 * cannot quietly change the policy.
 *
 * A provider that fails contributes nothing rather than failing the whole list:
 * one unreachable remote calendar must not stop a member using the device one.
 */
export async function listWritableCalendars(): Promise<{
  calendars: CalendarRef[];
  failures: { provider: IntegrationProviderId; error: IntegrationError }[];
}> {
  const providers = [resolveCalendarProviderById('calendar.device'), resolveCalendarProviderById('calendar.google')];

  const results = await Promise.allSettled(
    providers.map(async (provider) => ({
      provider: provider.descriptor.id,
      calendars: await provider.listCalendars(),
    }))
  );

  const calendars: CalendarRef[] = [];
  const failures: { provider: IntegrationProviderId; error: IntegrationError }[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      calendars.push(...result.value.calendars);
      return;
    }
    const cause = result.reason;
    failures.push({
      provider: providers[index].descriptor.id,
      error: isIntegrationError(cause)
        ? cause
        : integrationError('UnknownError', { provider: providers[index].descriptor.id }),
    });
  });

  return { calendars, failures };
}

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS DEFAULTS — §8
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The default calendar settings.
 *
 * Two defaults are load-bearing rather than arbitrary:
 *
 *   `twoWaySyncEnabled: false` — reading a member's calendar is a much larger
 *   privacy step than writing one event to it, and §8 asks for the two to be
 *   visibly different. Defaulting it on would grant, by omission, the access
 *   §37 says must be explicitly consented to.
 *
 *   `timeZoneBehaviour: 'eventTimeZone'` — §62's rule as the default rather
 *   than as an option somebody has to find.
 */
export const DEFAULT_CALENDAR_SETTINGS: CalendarSyncSettings = {
  enabled: true,
  defaultCalendarId: null,
  defaultProvider: null,
  autoExportRsvps: false,
  twoWaySyncEnabled: false,
  syncFrequency: 'manual',
  defaultReminderMinutes: [60],
  timeZoneBehaviour: 'eventTimeZone',
  conflictBehaviour: 'skip',
};
