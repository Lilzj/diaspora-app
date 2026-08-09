// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics time ranges (Frontend Phase 15, §6 · §7 · §58)
//
// Ranges, their comparison baselines and the timezone they are cut in, in one
// module — because they are one decision. "Last 7 days" is not a range until
// somebody says which midnight it ends at, and "compared to the previous period"
// is not a baseline until somebody says how long the period was.
//
// ── §58, and why every date here is a civil date ─────────────────────────────
//
// A range expressed as instants is wrong in a way that is very hard to see. If
// the client sends `2026-08-01T00:00:00Z` to `2026-08-08T00:00:00Z`, then a
// member in Auckland asking for "this week" gets a window that started at 12pm
// on the 1st in their own terms, and a member in Los Angeles gets one that
// started at 5pm on the 31st of July. Both dashboards say "1–8 August". Only one
// of them can be right and neither of them is.
//
// So a range is **two civil dates and a zone**: `from`, `to`, `timezone`. The
// server cuts the buckets; the client says which calendar it means. Where the
// backend publishes a reporting timezone, that is the one used. Where it does
// not, the device's is used and `isDeviceTimezone` is set — and the UI says so,
// because §58 forbids silently substituting one for the other.
//
// ── Why the arithmetic uses UTC internally ───────────────────────────────────
//
// Every calculation below turns `YYYY-MM-DD` into a `Date` at UTC midnight, does
// day arithmetic, and turns it back. That looks like the mistake this file is
// about, and it is the opposite: UTC is being used as a *calendar*, not as a
// clock. A civil date has no time, so any consistent instant works for
// arithmetic, and UTC is the only one with no DST — `2026-03-29 + 1 day` is
// unambiguous in UTC and is 23 hours in Europe/London.
//
// The one place a real timezone is needed is deciding what *today* is, and that
// goes through `civilDateInZone`, which uses `Intl` and is guarded.
//
// ── The `Intl` guard ─────────────────────────────────────────────────────────
//
// Hermes ships `Intl` on modern React Native, but the timezone database it can
// reach varies by platform and by build, and an unknown IANA name throws a
// `RangeError`. Every call is wrapped, and the fallback is the device's own
// offset with `isDeviceTimezone` set true — a dashboard that renders honestly
// with a caveat is worth more than one that crashes on a device with a trimmed
// ICU build.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalyticsComparisonBasis,
  AnalyticsGranularity,
  AnalyticsRangePreset,
  AnalyticsTimeRange,
} from '@/types/analytics';

const MS_PER_DAY = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// Civil dates
// ─────────────────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` from a UTC-midnight `Date`. */
function toCivil(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** A UTC-midnight `Date` from `YYYY-MM-DD`. See the header on why UTC. */
function fromCivil(civil: string): Date {
  const [year, month, day] = civil.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

/** Whether a string is a well-formed civil date that names a real day. */
export function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = fromCivil(value);
  return !Number.isNaN(parsed.getTime()) && toCivil(parsed) === value;
}

function addDays(civil: string, days: number): string {
  return toCivil(new Date(fromCivil(civil).getTime() + days * MS_PER_DAY));
}

function addMonths(civil: string, months: number): string {
  const date = fromCivil(civil);
  const targetMonth = date.getUTCMonth() + months;
  const candidate = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, 1));
  // Clamp the day: 31 January minus one month is 28 or 29 February, not 3 March.
  const lastDay = new Date(
    Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0)
  ).getUTCDate();
  candidate.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return toCivil(candidate);
}

function startOfMonth(civil: string): string {
  const date = fromCivil(civil);
  return toCivil(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

function endOfMonth(civil: string): string {
  const date = fromCivil(civil);
  return toCivil(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

function startOfYear(civil: string): string {
  return `${fromCivil(civil).getUTCFullYear()}-01-01`;
}

function endOfYear(civil: string): string {
  return `${fromCivil(civil).getUTCFullYear()}-12-31`;
}

/** Inclusive day count. `2026-08-01` to `2026-08-01` is one day, not zero. */
export function rangeDayCount(range: Pick<AnalyticsTimeRange, 'from' | 'to'>): number {
  const span = (fromCivil(range.to).getTime() - fromCivil(range.from).getTime()) / MS_PER_DAY;
  return Math.max(1, Math.round(span) + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Timezone
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The device's IANA zone, or `UTC` where the runtime will not say.
 *
 * `UTC` rather than a guess: a dashboard labelled UTC is honest, and a dashboard
 * that assumed `Europe/London` because the developer was there is not.
 */
export function deviceTimezone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof resolved === 'string' && resolved.length > 0 ? resolved : 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * The civil date an instant falls on, in a named zone.
 *
 * `en-CA` is used deliberately: its short date format is `YYYY-MM-DD`, so no
 * part reordering is needed and no locale can change the output. Formatting to
 * parts and reassembling would be more explicit but is slower and, in Hermes,
 * `formatToParts` is the part most likely to be missing.
 */
export function civilDateInZone(instant: Date, timezone: string): string {
  try {
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
    // `en-CA` gives `2026-08-08`. Anything else means the runtime ignored us.
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
  } catch {
    // Falls through to the device-local path below.
  }

  const year = instant.getFullYear();
  const month = `${instant.getMonth() + 1}`.padStart(2, '0');
  const day = `${instant.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Whether a zone name is one this runtime can actually resolve. */
export function isSupportedTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/**
 * Which zone a dashboard should use, and whether it is the device's.
 *
 * §58's decision, in one function so no screen makes it differently. The
 * backend's reporting zone wins where it publishes one and the runtime can
 * resolve it; otherwise the device's, marked.
 */
export function resolveReportingTimezone(reportingTimezone?: string | null): {
  timezone: string;
  isDeviceTimezone: boolean;
} {
  if (reportingTimezone && isSupportedTimezone(reportingTimezone)) {
    return { timezone: reportingTimezone, isDeviceTimezone: false };
  }
  return { timezone: deviceTimezone(), isDeviceTimezone: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranges — §6
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveRangeOptions {
  /** The backend's reporting zone. Absent means the device's, marked. */
  reportingTimezone?: string | null;
  /** For `custom`. Both required, both civil dates. */
  from?: string | null;
  to?: string | null;
  /** Overridable so tests are not a function of the day they run. */
  now?: Date;
  /**
   * The first date the subject has data for.
   *
   * Used only by `allTime`, which otherwise has no start. Absent means the
   * platform's own launch is unknown, and `allTime` falls back to five years —
   * a bounded window is preferable to a request the backend refuses.
   */
  earliestDate?: string | null;
}

/**
 * Turns a preset into a resolved range.
 *
 * Never throws. An invalid custom range resolves to the preset's nearest sane
 * form and `validateCustomRange` is what a screen uses to *refuse* one — §6's
 * note that the server validates the range is honoured by sending it and
 * rendering the refusal, not by silently swapping the dates here.
 */
export function resolveRange(
  preset: AnalyticsRangePreset,
  options: ResolveRangeOptions = {}
): AnalyticsTimeRange {
  const { timezone, isDeviceTimezone } = resolveReportingTimezone(options.reportingTimezone);
  const now = options.now ?? new Date();
  const today = civilDateInZone(now, timezone);

  const build = (from: string, to: string): AnalyticsTimeRange => ({
    preset,
    from,
    to,
    timezone,
    isDeviceTimezone,
  });

  switch (preset) {
    case 'today':
      return build(today, today);

    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return build(yesterday, yesterday);
    }

    // Inclusive of today, so "last 7 days" is today plus the six before it. The
    // alternative — the seven complete days before today — is also defensible,
    // and the reason for this one is that a member checking a dashboard at noon
    // expects this morning's activity to be in it.
    case 'last7d':
      return build(addDays(today, -6), today);

    case 'last30d':
      return build(addDays(today, -29), today);

    case 'last90d':
      return build(addDays(today, -89), today);

    case 'thisMonth':
      return build(startOfMonth(today), today);

    case 'previousMonth': {
      const inPreviousMonth = addMonths(startOfMonth(today), -1);
      return build(startOfMonth(inPreviousMonth), endOfMonth(inPreviousMonth));
    }

    case 'thisYear':
      return build(startOfYear(today), today);

    case 'previousYear': {
      const inPreviousYear = `${fromCivil(today).getUTCFullYear() - 1}-06-01`;
      return build(startOfYear(inPreviousYear), endOfYear(inPreviousYear));
    }

    case 'allTime': {
      const earliest =
        options.earliestDate && isCivilDate(options.earliestDate)
          ? options.earliestDate
          : addMonths(today, -60);
      return build(earliest, today);
    }

    case 'custom': {
      const from = options.from && isCivilDate(options.from) ? options.from : addDays(today, -29);
      const to = options.to && isCivilDate(options.to) ? options.to : today;
      return build(from, to);
    }
  }
}

/** Why a custom range cannot be requested. Null means it can. */
export type CustomRangeProblem =
  | 'malformed'
  | 'inverted'
  | 'future'
  | 'tooLong';

/**
 * Validates a custom range before it is sent.
 *
 * Client-side validation of a range is not the client deciding the answer — the
 * server still validates and its refusal still renders. It is the client
 * declining to make a request it already knows is meaningless, which is §51's
 * instruction not to be gratuitously expensive.
 *
 * `maxDays` defaults to two years. Longer ranges are not forbidden by anything
 * in the product; they are refused because a daily series over ten years is
 * 3,650 points, which is a chart nobody can read and a payload nobody needs.
 */
export function validateCustomRange(
  from: string,
  to: string,
  options: { today?: string; maxDays?: number } = {}
): CustomRangeProblem | null {
  if (!isCivilDate(from) || !isCivilDate(to)) return 'malformed';
  if (fromCivil(from).getTime() > fromCivil(to).getTime()) return 'inverted';

  const today = options.today ?? civilDateInZone(new Date(), deviceTimezone());
  if (fromCivil(to).getTime() > fromCivil(today).getTime()) return 'future';

  const maxDays = options.maxDays ?? 730;
  if (rangeDayCount({ from, to }) > maxDays) return 'tooLong';

  return null;
}

/** The sentence shown when a custom range is refused. */
export function describeRangeProblem(problem: CustomRangeProblem, maxDays = 730): string {
  switch (problem) {
    case 'malformed':
      return 'Enter both dates as a day, a month and a year.';
    case 'inverted':
      return 'The first date needs to come before the second one.';
    case 'future':
      return 'Analytics only cover days that have already happened.';
    case 'tooLong':
      return `Ranges are limited to ${maxDays} days. Pick a shorter window, or export the data instead.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Granularity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How finely to bucket a range.
 *
 * Chosen from the span rather than from the preset, so a 400-day custom range
 * and `previousYear` behave the same. The thresholds are about legibility on a
 * phone: roughly 60 points is the most a 340pt-wide chart can distinguish, and
 * past that a viewer is reading noise.
 */
export function defaultGranularity(
  range: Pick<AnalyticsTimeRange, 'from' | 'to'>
): AnalyticsGranularity {
  const days = rangeDayCount(range);
  if (days <= 2) return 'hour';
  if (days <= 62) return 'day';
  if (days <= 180) return 'week';
  if (days <= 1095) return 'month';
  return 'quarter';
}

/** Every bucket start in a range, so a chart can render gaps as gaps. */
export function enumerateBuckets(
  range: Pick<AnalyticsTimeRange, 'from' | 'to'>,
  granularity: AnalyticsGranularity
): string[] {
  const buckets: string[] = [];
  const end = fromCivil(range.to).getTime();

  // `hour` is enumerated as days: an hourly series is only offered for one- and
  // two-day ranges, and its points carry instants the server produced. Making
  // this function invent 48 hourly instants would be inventing bucket boundaries
  // the backend never agreed to.
  if (granularity === 'hour') {
    let cursor = range.from;
    while (fromCivil(cursor).getTime() <= end) {
      buckets.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return buckets;
  }

  let cursor = range.from;
  let guard = 0;
  while (fromCivil(cursor).getTime() <= end && guard < 4000) {
    buckets.push(cursor);
    cursor =
      granularity === 'day'
        ? addDays(cursor, 1)
        : granularity === 'week'
          ? addDays(cursor, 7)
          : granularity === 'month'
            ? addMonths(cursor, 1)
            : granularity === 'quarter'
              ? addMonths(cursor, 3)
              : addMonths(cursor, 12);
    guard += 1;
  }

  return buckets;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison baselines — §7
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The window a range is compared against.
 *
 * Returns `null` for the bases that are not a *window* at all — a platform
 * average is a figure the backend computes across everybody, not a period. A
 * caller that treated `platformAverage` as a date range would send a request
 * that means nothing, and the null is what stops it.
 *
 * `previousPeriod` is the immediately preceding window of the *same length*,
 * ending the day before this one starts. For a 30-day range that is the 30 days
 * before it; for `previousMonth` on a calendar month it is the calendar month
 * before, which is why the two bases are separate rather than one.
 */
export function baselineRange(
  range: AnalyticsTimeRange,
  basis: AnalyticsComparisonBasis
): { from: string; to: string } | null {
  switch (basis) {
    case 'none':
    case 'platformAverage':
    case 'communityAverage':
    case 'countryAverage':
    case 'custom':
      return null;

    case 'previousPeriod': {
      const days = rangeDayCount(range);
      const to = addDays(range.from, -1);
      return { from: addDays(to, -(days - 1)), to };
    }

    case 'previousMonth': {
      const from = addMonths(range.from, -1);
      const to = addMonths(range.to, -1);
      return { from, to };
    }

    case 'previousYear': {
      const from = addMonths(range.from, -12);
      const to = addMonths(range.to, -12);
      return { from, to };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────────────────────

export const RANGE_LABELS: Record<AnalyticsRangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7d: 'Last 7 days',
  last30d: 'Last 30 days',
  last90d: 'Last 90 days',
  thisMonth: 'This month',
  previousMonth: 'Last month',
  thisYear: 'This year',
  previousYear: 'Last year',
  allTime: 'All time',
  custom: 'Custom range',
};

export const COMPARISON_LABELS: Record<AnalyticsComparisonBasis, string> = {
  none: 'No comparison',
  previousPeriod: 'vs previous period',
  previousMonth: 'vs last month',
  previousYear: 'vs last year',
  custom: 'vs custom period',
  platformAverage: 'vs platform average',
  communityAverage: 'vs community average',
  countryAverage: 'vs country average',
};

export const GRANULARITY_LABELS: Record<AnalyticsGranularity, string> = {
  hour: 'Hourly',
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  quarter: 'Quarterly',
  year: 'Yearly',
};

/**
 * A range in words, for a subtitle and for a screen reader.
 *
 * Locale-aware through `toLocaleDateString`, which §56 requires: `08/09` is
 * September in one country and August in another, and analytics is precisely
 * where that ambiguity costs something.
 */
export function describeRange(range: AnalyticsTimeRange, locale?: string): string {
  if (range.preset !== 'custom' && range.preset !== 'allTime') {
    return RANGE_LABELS[range.preset];
  }

  const format = (civil: string) =>
    fromCivil(civil).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });

  return range.from === range.to ? format(range.from) : `${format(range.from)} – ${format(range.to)}`;
}

/**
 * The sentence that names the timezone a dashboard is cut in.
 *
 * §58 in one line of copy. Rendered wherever a range is shown, not hidden in a
 * settings screen — a member comparing two dashboards needs to know they share
 * a calendar before the comparison means anything.
 */
export function describeTimezone(range: AnalyticsTimeRange): string {
  return range.isDeviceTimezone
    ? `Days are counted in your device’s timezone (${range.timezone}). Diaspora has not published a reporting timezone, so figures may not line up exactly with a report generated elsewhere.`
    : `Days are counted in ${range.timezone}, the platform’s reporting timezone.`;
}

/** A bucket label for a chart axis and for the accessible table. */
export function describeBucket(
  at: string,
  granularity: AnalyticsGranularity,
  locale?: string
): string {
  // An hourly point carries an instant rather than a civil date.
  if (granularity === 'hour') {
    const parsed = new Date(at);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
    }
  }

  if (!isCivilDate(at)) return at;
  const date = fromCivil(at);

  switch (granularity) {
    case 'day':
      return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    case 'week':
      return `w/c ${date.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
    case 'month':
      return date.toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
    case 'quarter': {
      const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
      return `Q${quarter} ${date.getUTCFullYear()}`;
    }
    case 'year':
      return `${date.getUTCFullYear()}`;
    default:
      return at;
  }
}

/**
 * Whether a bucket is still filling.
 *
 * A chart whose last point dips because today is half over has told the viewer
 * something false. The renderer draws a partial bucket differently and the
 * accessible summary says so; this is where "partial" is decided.
 */
export function isPartialBucket(
  at: string,
  granularity: AnalyticsGranularity,
  range: AnalyticsTimeRange,
  now: Date = new Date()
): boolean {
  const today = civilDateInZone(now, range.timezone);
  if (!isCivilDate(at)) return false;

  const bucketStart = fromCivil(at).getTime();
  const todayStart = fromCivil(today).getTime();

  switch (granularity) {
    case 'hour':
    case 'day':
      return at === today;
    case 'week':
      return bucketStart <= todayStart && todayStart < fromCivil(addDays(at, 7)).getTime();
    case 'month':
      return startOfMonth(at) === startOfMonth(today);
    case 'quarter':
      return (
        Math.floor(fromCivil(at).getUTCMonth() / 3) === Math.floor(fromCivil(today).getUTCMonth() / 3) &&
        fromCivil(at).getUTCFullYear() === fromCivil(today).getUTCFullYear()
      );
    case 'year':
      return fromCivil(at).getUTCFullYear() === fromCivil(today).getUTCFullYear();
  }
}

/**
 * A stable, comparable form of a range, for a cache key.
 *
 * The preset is deliberately **excluded**. `last30d` resolved yesterday and
 * `custom` covering the same thirty days are the same question and must be one
 * cache entry — keying on the preset would make them two, and would also mean a
 * `last30d` entry cached before midnight is served after midnight for the wrong
 * window. The dates and the zone are the identity; the preset is how the member
 * asked for it.
 */
export function rangeToken(range: AnalyticsTimeRange): string {
  return `${range.from}_${range.to}_${range.timezone}`;
}
