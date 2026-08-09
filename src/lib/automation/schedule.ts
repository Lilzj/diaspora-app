// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation scheduling (Frontend Phase 18, §41 · §42 · §43)
//
// Everything the client is allowed to know about when an automation runs — and,
// more importantly, everything it is **not** allowed to decide.
//
// ── The rule that shapes the whole module ────────────────────────────────────
//
// §41: *"The frontend must NOT use local timers as the authoritative
// scheduler."* So there is no `setTimeout` in this file, no interval, no
// background task and no "next run" the client computes and then acts on.
//
// What the client does compute is a **preview**: `describeNextOccurrence()`
// answers "if the platform scheduled this, roughly when would it be?" so a
// member configuring a weekly reminder can see that they have picked 09:00 on
// Sunday rather than Saturday. That is display arithmetic. It is named
// `preview`, it is typed as an estimate, and `isAuthoritative` is `false` on
// every value it produces — so a caller cannot accidentally treat it as the
// schedule. The real `nextRunAt` comes from the server and from nowhere else.
//
// ── §42, and why no second timezone implementation exists ────────────────────
//
// Phase 16 already solved the hard part: converting a wall clock in a named
// zone to an absolute instant, DST-aware, in two passes, with an honest
// `isExact: false` when the runtime cannot resolve the zone. That function is
// `convertToInstant` in `lib/integrations/calendar.ts` and this module **calls
// it**. A second converter would be a second set of DST bugs, discovered
// separately, twice a year.
//
// The five §42 modes resolve to an IANA identifier here, and the resolution is
// the only new logic:
//
//   `device`        the runtime's own zone.
//   `userSelected`  whatever they picked.
//   `event`         the event's own zone — the one that matters, and the reason
//                   `AutomationTimezone.ianaId` can be null while a member is
//                   still choosing which event.
//   `community`     the community's zone, where one is known.
//   `country`       the country's primary zone.
//
// A mode that cannot resolve produces `isExact: false` and a label that says
// which zone was used instead. §42 forbids silently interpreting a schedule in
// the wrong timezone; saying "interpreted in your device's time" out loud is
// how that is honoured when the intended zone is unavailable.
//
// ── §43's conflicts ─────────────────────────────────────────────────────────
//
// All detected here rather than in the builder, so the same answer is given by
// the validation that blocks saving and by the preview that explains why.
// ─────────────────────────────────────────────────────────────────────────────

import { convertToInstant } from '@/lib/integrations/calendar';
import type {
  AutomationEventOffset,
  AutomationFrequency,
  AutomationSchedule,
  AutomationTimezone,
  AutomationTimezoneMode,
  AutomationValidationIssue,
} from '@/types/automation';

// ═════════════════════════════════════════════════════════════════════════════
// TIMEZONE RESOLUTION — §42
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The device's IANA zone, or a stated fallback.
 *
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` is present on Hermes with
 * ICU on both platforms, but a trimmed-ICU build will not have it. `UTC` is the
 * fallback and is **always** paired with `isExact: false`, because a schedule
 * silently interpreted in UTC for somebody in Lagos is exactly the one-hour
 * class of error §42 exists to prevent — except worse, at one hour times the
 * offset.
 */
export function deviceTimeZone(): { id: string; isExact: boolean } {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && resolved.length > 0) return { id: resolved, isExact: true };
  } catch {
    // Falls through.
  }
  return { id: 'UTC', isExact: false };
}

/** What a resolution needs to know. Every field optional — most modes use one. */
export interface TimeZoneContext {
  /** For `userSelected`. */
  selectedZoneId?: string | null;
  /** For `event`. The event's own authoritative zone. */
  eventZoneId?: string | null;
  /** For `community`. */
  communityZoneId?: string | null;
  /** For `country`. */
  countryZoneId?: string | null;
  /** Display names, so the label reads "Lagos time" rather than "Africa/Lagos". */
  eventLabel?: string | null;
  communityLabel?: string | null;
  countryLabel?: string | null;
}

/**
 * A timezone mode, resolved.
 *
 * Never throws and never returns null: a schedule always has *some* zone, and
 * the honest failure is a resolved device zone with `isExact: false` and a
 * label saying so — not an exception a screen has to handle.
 */
export function resolveTimezone(
  mode: AutomationTimezoneMode,
  context: TimeZoneContext = {}
): AutomationTimezone {
  const device = deviceTimeZone();

  const fallback = (reason: string): AutomationTimezone => ({
    mode,
    ianaId: device.id,
    label: `${friendlyZone(device.id)} — ${reason}`,
    isExact: false,
  });

  switch (mode) {
    case 'device':
      return {
        mode,
        ianaId: device.id,
        label: device.isExact
          ? `${friendlyZone(device.id)} (your device)`
          : 'UTC — your device’s timezone could not be read',
        isExact: device.isExact,
      };

    case 'userSelected':
      if (!context.selectedZoneId) return fallback('no timezone chosen yet');
      return {
        mode,
        ianaId: context.selectedZoneId,
        label: friendlyZone(context.selectedZoneId),
        isExact: isZoneKnown(context.selectedZoneId),
      };

    case 'event':
      // Deliberately null rather than a fallback while no event is chosen: an
      // event-relative schedule with no event is *incomplete*, and validation
      // refuses to save it. Substituting the device's zone here would let a
      // half-built automation save and then fire at the wrong time.
      if (!context.eventZoneId) {
        return { mode, ianaId: null, label: 'The event’s own time', isExact: false };
      }
      return {
        mode,
        ianaId: context.eventZoneId,
        label: context.eventLabel
          ? `${friendlyZone(context.eventZoneId)} (${context.eventLabel})`
          : `${friendlyZone(context.eventZoneId)} (event time)`,
        isExact: isZoneKnown(context.eventZoneId),
      };

    case 'community':
      if (!context.communityZoneId) return fallback('this community has no set timezone');
      return {
        mode,
        ianaId: context.communityZoneId,
        label: context.communityLabel
          ? `${friendlyZone(context.communityZoneId)} (${context.communityLabel})`
          : friendlyZone(context.communityZoneId),
        isExact: isZoneKnown(context.communityZoneId),
      };

    case 'country':
      if (!context.countryZoneId) return fallback('this country has no set timezone');
      return {
        mode,
        ianaId: context.countryZoneId,
        label: context.countryLabel
          ? `${friendlyZone(context.countryZoneId)} (${context.countryLabel})`
          : friendlyZone(context.countryZoneId),
        isExact: isZoneKnown(context.countryZoneId),
      };
  }
}

/** Whether the runtime can actually format in this zone. */
export function isZoneKnown(zoneId: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zoneId }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/**
 * `Africa/Lagos` → `Lagos`.
 *
 * The region prefix is noise to a member and the city is what they recognise.
 * The full identifier is still shown on the schedule screen, because somebody
 * debugging a wrong-time report needs the exact string.
 */
export function friendlyZone(zoneId: string): string {
  const city = zoneId.split('/').pop() ?? zoneId;
  return city.replace(/_/g, ' ');
}

// ═════════════════════════════════════════════════════════════════════════════
// NEXT OCCURRENCE — a preview, never a schedule
// ═════════════════════════════════════════════════════════════════════════════

/**
 * An estimate of when a schedule would next fire.
 *
 * `isAuthoritative` is always `false`. It is a field rather than a comment
 * because a caller that renders this next to a server-supplied `nextRunAt`
 * needs to mark which is which, and §41 makes the difference load-bearing.
 */
export interface OccurrencePreview {
  instant: Date | null;
  /** What to show: "Tomorrow at 09:00 (Lagos time)". */
  label: string;
  isAuthoritative: false;
  /** False when the timezone could not be resolved exactly. §42. */
  isExact: boolean;
  /** Why there is no estimate, when there is none. */
  unavailableReason: string | null;
}

const NOT_AVAILABLE = (reason: string): OccurrencePreview => ({
  instant: null,
  label: '—',
  isAuthoritative: false,
  isExact: false,
  unavailableReason: reason,
});

/**
 * The next time this schedule would come round, as a preview.
 *
 * `now` is a parameter rather than `Date.now()` so the function is pure and the
 * scheduling tests can assert DST behaviour on specific dates rather than on
 * whatever day they happen to run.
 */
export function previewNextOccurrence(
  schedule: AutomationSchedule,
  now: Date
): OccurrencePreview {
  const zoneId = schedule.timezone.ianaId;
  if (!zoneId) return NOT_AVAILABLE('Choose an event first, so the time is in the event’s own timezone.');

  if (schedule.frequency === 'eventRelative') {
    return NOT_AVAILABLE('This runs relative to the event, so the time depends on which event triggers it.');
  }

  if (schedule.frequency === 'custom') {
    // §41: a custom description is held for display and **never parsed**. A
    // client that interpreted a cron expression would be the local scheduler
    // §41 forbids, wearing a hat.
    return NOT_AVAILABLE('Diaspora works out when a custom schedule runs.');
  }

  if (schedule.hour === null || schedule.minute === null) {
    return NOT_AVAILABLE('Choose a time.');
  }

  if (schedule.endsAt) {
    const ends = new Date(schedule.endsAt);
    if (!Number.isNaN(ends.getTime()) && ends.getTime() <= now.getTime()) {
      return NOT_AVAILABLE('This automation has passed its end date.');
    }
  }

  const start =
    schedule.startsAt && !Number.isNaN(new Date(schedule.startsAt).getTime())
      ? new Date(schedule.startsAt)
      : now;
  const from = start.getTime() > now.getTime() ? start : now;

  const candidate = nextWallClock(schedule, from, zoneId);
  if (!candidate) return NOT_AVAILABLE('This schedule has no upcoming time.');

  // Phase 16's converter. Two-pass, DST-aware, and the only one in the codebase.
  const converted = convertToInstant(candidate, zoneId);

  return {
    instant: converted.instant,
    label: formatInZone(converted.instant, zoneId, schedule.timezone.label),
    isAuthoritative: false,
    isExact: converted.isExact && schedule.timezone.isExact,
    unavailableReason: null,
  };
}

interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * The next wall clock this schedule names, at or after `from`.
 *
 * Works entirely in the target zone's *calendar*, which is why it reads the
 * zone's current date rather than the device's: for a member in London
 * configuring a Lagos schedule just after midnight UTC, the two disagree about
 * what day it is, and using the device's would skip a day.
 */
function nextWallClock(
  schedule: AutomationSchedule,
  from: Date,
  zoneId: string
): WallClockParts | null {
  const hour = schedule.hour ?? 0;
  const minute = schedule.minute ?? 0;
  const local = readZoneCalendar(from, zoneId);
  if (!local) return null;

  const base: WallClockParts = { ...local, hour, minute };

  switch (schedule.frequency) {
    case 'once': {
      // A one-off runs at its start date, or not at all once that has passed.
      if (!schedule.startsAt) return base;
      const startLocal = readZoneCalendar(new Date(schedule.startsAt), zoneId);
      return startLocal ? { ...startLocal, hour, minute } : base;
    }

    case 'daily': {
      // Today if the time is still ahead in that zone; tomorrow otherwise.
      const isPast = local.hour > hour || (local.hour === hour && local.minute >= minute);
      return isPast ? addDays(base, 1) : base;
    }

    case 'weekly': {
      if (schedule.daysOfWeek.length === 0) return null;
      const today = zoneWeekday(from, zoneId);
      if (today === null) return null;

      const wanted = [...schedule.daysOfWeek].sort((a, b) => a - b);
      const isPastToday = local.hour > hour || (local.hour === hour && local.minute >= minute);

      for (let ahead = 0; ahead <= 7; ahead += 1) {
        const day = (today + ahead) % 7;
        if (!wanted.includes(day)) continue;
        if (ahead === 0 && isPastToday) continue;
        return addDays(base, ahead);
      }
      return null;
    }

    case 'monthly': {
      const target = schedule.dayOfMonth ?? local.day;
      const isPastToday =
        local.day > target ||
        (local.day === target &&
          (local.hour > hour || (local.hour === hour && local.minute >= minute)));

      const month = isPastToday ? local.month + 1 : local.month;
      const year = month > 12 ? local.year + 1 : local.year;
      const normalisedMonth = month > 12 ? 1 : month;

      // A 31st in a 30-day month is clamped to the last day. The **server**
      // owns the real rule (§43 lists it as a conflict) and the validation
      // below warns about it; this is only so the preview shows something
      // plausible rather than rolling into the next month silently.
      const day = Math.min(target, daysInMonth(year, normalisedMonth));
      return { year, month: normalisedMonth, day, hour, minute };
    }

    default:
      return null;
  }
}

/** The calendar date `instant` falls on, in `zoneId`. */
function readZoneCalendar(instant: Date, zoneId: string): WallClockParts | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zoneId,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(instant);

    const read = (type: string): number => {
      const value = parts.find((part) => part.type === type)?.value;
      return value ? Number(value) : 0;
    };

    return {
      year: read('year'),
      month: read('month'),
      day: read('day'),
      // `hour12: false` yields 24 at midnight in some implementations. Reduced
      // here so comparisons against a configured hour of 0 behave.
      hour: read('hour') % 24,
      minute: read('minute'),
    };
  } catch {
    return null;
  }
}

/** 0 = Sunday, matching `AutomationSchedule.daysOfWeek`. */
function zoneWeekday(instant: Date, zoneId: string): number | null {
  try {
    const name = new Intl.DateTimeFormat('en-US', {
      timeZone: zoneId,
      weekday: 'short',
    }).format(instant);
    const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name.slice(0, 3));
    return index >= 0 ? index : null;
  } catch {
    return null;
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Calendar arithmetic on a wall clock.
 *
 * Done through `Date.UTC` because it normalises month and year overflow, and
 * because the wall clock is *not* an instant — adding a day to a wall clock is
 * "the same time tomorrow", which is 23 or 25 hours across a DST boundary.
 * Doing this in UTC and converting afterwards is what gets that right.
 */
function addDays(parts: WallClockParts, days: number): WallClockParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
  };
}

/** "Mon 3 Nov at 09:00 (Lagos time)". */
export function formatInZone(instant: Date, zoneId: string, zoneLabel: string): string {
  try {
    const formatted = new Intl.DateTimeFormat(undefined, {
      timeZone: zoneId,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(instant);
    return `${formatted} · ${zoneLabel}`;
  } catch {
    return instant.toISOString();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// DESCRIPTION — one wording, used by the builder, the preview and the list
// ═════════════════════════════════════════════════════════════════════════════

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A schedule in a sentence. Never contains an identifier or an ISO timestamp. */
export function describeSchedule(schedule: AutomationSchedule): string {
  const time =
    schedule.hour !== null && schedule.minute !== null
      ? ` at ${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`
      : '';

  switch (schedule.frequency) {
    case 'once':
      return `Once${time}`;
    case 'daily':
      return `Every day${time}`;
    case 'weekly': {
      if (schedule.daysOfWeek.length === 0) return `Every week${time}`;
      const days = [...schedule.daysOfWeek]
        .sort((a, b) => a - b)
        .map((day) => DAY_NAMES[day] ?? '')
        .filter(Boolean);
      const list =
        days.length === 1
          ? days[0]
          : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
      return `Every ${list}${time}`;
    }
    case 'monthly': {
      const day = schedule.dayOfMonth;
      return day ? `On day ${day} of each month${time}` : `Every month${time}`;
    }
    case 'eventRelative':
      return schedule.eventOffset ? describeOffset(schedule.eventOffset) : 'Relative to the event';
    case 'custom':
      return schedule.customDescription ?? 'A custom schedule';
  }
}

/** "1 day before it starts". Plural-aware; §63 forbids hardcoded English forms. */
export function describeOffset(offset: AutomationEventOffset): string {
  const anchor = offset.anchor === 'start' ? 'it starts' : 'it ends';
  const minutes = offset.minutesBefore;

  if (minutes === 0) return `When ${anchor}`;

  const unit = (value: number, singular: string): string =>
    `${value} ${value === 1 ? singular : `${singular}s`}`;

  if (minutes % (60 * 24 * 7) === 0) return `${unit(minutes / (60 * 24 * 7), 'week')} before ${anchor}`;
  if (minutes % (60 * 24) === 0) return `${unit(minutes / (60 * 24), 'day')} before ${anchor}`;
  if (minutes % 60 === 0) return `${unit(minutes / 60, 'hour')} before ${anchor}`;
  return `${unit(minutes, 'minute')} before ${anchor}`;
}

/** §12's offsets. The order is the order the picker shows them in. */
export const REMINDER_OFFSETS: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'When it starts' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 180, label: '3 hours before' },
  { minutes: 60 * 24, label: '1 day before' },
  { minutes: 60 * 24 * 7, label: '1 week before' },
];

// ═════════════════════════════════════════════════════════════════════════════
// CONFLICTS — §43
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Every §43 conflict, in one pass.
 *
 * `error` blocks saving; `warning` does not. The split matters: a schedule
 * whose end date is before its start can never run and is a mistake, while a
 * 31st-of-the-month schedule is a legitimate choice with a consequence the
 * member should know about. Blocking the second would be the UI overruling a
 * decision that is theirs to make.
 */
export function validateSchedule(
  schedule: AutomationSchedule,
  now: Date
): AutomationValidationIssue[] {
  const issues: AutomationValidationIssue[] = [];
  const add = (message: string, severity: 'error' | 'warning' = 'error') =>
    issues.push({ step: 'schedule', targetId: null, message, severity });

  // ── Timezone ──────────────────────────────────────────────────────────────
  if (!schedule.timezone.ianaId) {
    add('Choose which timezone this schedule follows.');
  } else if (!schedule.timezone.isExact) {
    add(
      `This will run in ${schedule.timezone.label}. Diaspora could not confirm the timezone you asked for, so check the time is what you expect.`,
      'warning'
    );
  }

  // ── Dates ─────────────────────────────────────────────────────────────────
  const startsAt = schedule.startsAt ? new Date(schedule.startsAt) : null;
  const endsAt = schedule.endsAt ? new Date(schedule.endsAt) : null;

  if (startsAt && Number.isNaN(startsAt.getTime())) add('The start date is not a valid date.');
  if (endsAt && Number.isNaN(endsAt.getTime())) add('The end date is not a valid date.');

  if (startsAt && endsAt && !Number.isNaN(startsAt.getTime()) && !Number.isNaN(endsAt.getTime())) {
    if (endsAt.getTime() <= startsAt.getTime()) {
      add('The end date is before the start date, so this would never run.');
    }
  }

  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() <= now.getTime()) {
    add('The end date has already passed, so this would never run.');
  }

  if (
    schedule.frequency === 'once' &&
    startsAt &&
    !Number.isNaN(startsAt.getTime()) &&
    startsAt.getTime() <= now.getTime()
  ) {
    add('This is set to run once, at a time that has already passed.');
  }

  // ── Frequency-specific ────────────────────────────────────────────────────
  if (schedule.frequency === 'weekly' && schedule.daysOfWeek.length === 0) {
    add('Choose at least one day of the week.');
  }

  if (schedule.daysOfWeek.some((day) => day < 0 || day > 6)) {
    add('One of the chosen days is not valid.');
  }

  if (schedule.frequency === 'monthly') {
    const day = schedule.dayOfMonth;
    if (day === null) {
      add('Choose which day of the month.');
    } else if (day < 1 || day > 31) {
      add('The day of the month must be between 1 and 31.');
    } else if (day > 28) {
      add(
        `Not every month has a ${day}th. In shorter months this will run on the last day instead.`,
        'warning'
      );
    }
  }

  if (schedule.frequency !== 'eventRelative' && schedule.frequency !== 'custom') {
    if (schedule.hour === null || schedule.minute === null) {
      add('Choose a time of day.');
    } else if (
      schedule.hour < 0 ||
      schedule.hour > 23 ||
      schedule.minute < 0 ||
      schedule.minute > 59
    ) {
      add('The time of day is not valid.');
    }
  }

  if (schedule.frequency === 'eventRelative' && !schedule.eventOffset) {
    add('Choose how far before the event this should run.');
  }

  if (schedule.frequency === 'custom' && !schedule.customDescription?.trim()) {
    add('Describe when this should run.');
  }

  if (schedule.maxExecutions !== null && schedule.maxExecutions < 1) {
    add('The maximum number of runs must be at least 1.');
  }

  // ── DST — §43, and the reason the check is a warning ──────────────────────
  //
  // A wall clock inside a spring-forward gap does not exist, and one inside an
  // autumn-back overlap happens twice. Phase 16's converter resolves both
  // deterministically, so the automation *will* run — it just may not run at
  // the minute the member pictured. Blocking would be wrong; saying nothing
  // would be the silent misinterpretation §42 forbids.
  if (
    schedule.timezone.ianaId &&
    schedule.hour !== null &&
    schedule.minute !== null &&
    schedule.frequency !== 'eventRelative' &&
    schedule.frequency !== 'custom'
  ) {
    const preview = previewNextOccurrence(schedule, now);
    if (preview.instant && !preview.isExact) {
      add(
        'The time you chose falls near a clock change in this timezone, so it may run an hour out on that day.',
        'warning'
      );
    }
  }

  return issues;
}

// ═════════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═════════════════════════════════════════════════════════════════════════════

/** A daily schedule in the device's zone. What the builder starts from. */
export function defaultSchedule(frequency: AutomationFrequency = 'daily'): AutomationSchedule {
  return {
    frequency,
    timezone: resolveTimezone('device'),
    hour: 9,
    minute: 0,
    daysOfWeek: [],
    dayOfMonth: null,
    startsAt: null,
    endsAt: null,
    maxExecutions: null,
    eventOffset: null,
    customDescription: null,
  };
}

/** An event-relative schedule, defaulting to §12's most-used offset. */
export function defaultEventSchedule(eventZoneId: string | null, eventLabel?: string): AutomationSchedule {
  return {
    frequency: 'eventRelative',
    timezone: resolveTimezone('event', { eventZoneId, eventLabel }),
    hour: null,
    minute: null,
    daysOfWeek: [],
    dayOfMonth: null,
    startsAt: null,
    endsAt: null,
    maxExecutions: null,
    eventOffset: { minutesBefore: 60 * 24, anchor: 'start' },
    customDescription: null,
  };
}
