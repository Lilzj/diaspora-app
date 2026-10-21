// ─────────────────────────────────────────────────────────────────────────────
// The event on the wire, and the event this application draws
//
// ── What was wrong ──────────────────────────────────────────────────────────
//
// `fetchEvent` read `read<Event>(...)` and `fetchEvents` read `readList<Event>`.
// Both **asserted** the wire shape was the client's `Event`. Nothing mapped, and
// almost nothing lined up:
//
//   the screen wanted     the platform sends
//   ───────────────────   ────────────────────────────────────────────────
//   id                    eventId
//   date / time /         schedule.startsAt / schedule.endsAt /
//     endTime / timezone    schedule.timeZoneId   (flat on a list summary)
//   description           description, or summary on a list summary
//   coverImage / gallery  coverMediaId / media[] — ids, not URLs
//   category              categoryKey + categoryName
//   price / currency      isFree, and no amount anywhere
//   rsvpStatus            viewerRsvpStatus
//   host.*                hostName / organizerUserId / organizationId / …
//
// So against the real platform the detail screen rendered **"undefined" where
// the date and time go** — the two facts an event exists to communicate — no
// cover image, no category, and a FREE badge on paid events. Every card in the
// list carried `undefined` as its id, so **tapping one opened
// `/community-life/event/undefined`**. And `event.host.type` threw, which took
// the whole process down and is the only reason any of this was noticed.
//
// None of it was caught because `read<Event>` is a cast: a lie told to the type
// checker is a lie it will keep for you. And every development build read the
// mock catalogue, which is written in the client's shape, so all of it worked
// until it met the platform.
//
// ── Why this file exists ────────────────────────────────────────────────────
//
// One seam, translating once, so the screens keep reading the shape they were
// written against. This is the same move `community-entity-api.ts` already
// makes with `toCommunity`, down to the `mediaUri` helper — the codebase knew
// the answer, the events path just never used it.
// ─────────────────────────────────────────────────────────────────────────────

import { formatPrice } from '@/lib/money';
import { API_BASE_URL } from './apiClient';
import type { Event, EventCategory, RSVPStatus } from '@/types/community-life';

/**
 * An event as the platform sends it.
 *
 * Deliberately loose, and deliberately covering **both** shapes: the detail
 * route answers `EventResponse`, whose schedule is nested, and every list
 * answers `EventSummaryResponse`, whose schedule is flat and which carries no
 * `hostName` or `description` at all. One reader for both, because a summary is
 * an event with fewer facts, not a different kind of thing.
 */
export interface EventWire {
  eventId?: string;
  id?: string;
  title?: string;
  slug?: string;
  summary?: string;
  description?: string | null;
  categoryKey?: string;
  categoryName?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  /** The community it was posted in ("Post in community", 21 Oct 2026), or null. */
  communityId?: string | null;
  organizerUserId?: string | null;
  hostName?: string | null;
  isOrganizerVerified?: boolean;
  schedule?: {
    startsAt?: string;
    endsAt?: string;
    timeZoneId?: string;
  } | null;
  startsAt?: string;
  endsAt?: string;
  timeZoneId?: string;
  attendanceMode?: string;
  location?: {
    countryCode?: string;
    regionName?: string | null;
    cityName?: string | null;
    neighborhoodName?: string | null;
    displayName?: string;
  } | null;
  venue?: {
    name?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    landmark?: string | null;
    postalCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    onlineUrl?: string | null;
  } | null;
  venueName?: string | null;
  distanceKm?: number | null;
  capacity?: unknown;
  contact?: unknown;
  agenda?: Array<{
    id?: string;
    title?: string;
    description?: string | null;
    startsAt?: string | null;
    startOffsetMinutes?: number | null;
    durationMinutes?: number | null;
    speakerName?: string | null;
    order?: number;
  }> | null;
  coverMediaId?: string | null;
  media?: Array<{ mediaId?: string; role?: string; order?: number }> | null;
  isFree?: boolean;
  status?: string;
  visibility?: string | null;
  viewerRsvpStatus?: string | null;
  viewCount?: number;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * Where the platform serves a media item's bytes.
 *
 * `GET /media/{mediaId}/content` answers without a bearer token, which is what
 * lets a plain `<Image source={{ uri }}>` load it. Empty string for a missing
 * id rather than a URL with `undefined` in it — the latter is a request that
 * 404s on every render.
 */
function mediaUri(mediaId?: string | null): string {
  return typeof mediaId === 'string' && mediaId.length > 0
    ? `${API_BASE_URL}/media/${mediaId}/content`
    : '';
}

/** Whether this runtime's ICU actually knows the zone it was handed. */
function zoneIsUsable(timeZoneId: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timeZoneId }).format(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * The parts of an instant, **in the event's own zone**.
 *
 * A diaspora platform shows a Lagos event at its Lagos time to a reader in
 * London, which is why `timeZoneId` is on the wire at all and why this does not
 * just slice the ISO string.
 *
 * ── Why `format` and not `formatToParts` ────────────────────────────────────
 *
 * Hermes ships a partial `Intl`, and `formatToParts` is among the pieces that
 * have been missing or empty in some builds. This code path had never once run
 * on a device — the event screen fetched the event itself and bypassed the
 * adapter — so the first time it did would have been in front of a member,
 * and an empty array there renders a blank date rather than throwing anything
 * anyone would see.
 *
 * `en-CA` renders a date as `YYYY-MM-DD`, which is the shape wanted anyway.
 * Both formatters are wrapped, and an ISO slice is the last resort: a date in
 * the wrong zone still beats no date.
 */
export function partsInZone(iso: string, timeZoneId: string): { date: string; time: string } | null {
  const instant = new Date(iso);

  if (Number.isNaN(instant.getTime())) {
    return null;
  }

  const zone = timeZoneId && zoneIsUsable(timeZoneId) ? { timeZone: timeZoneId } : {};

  let date = '';
  let time = '';

  try {
    date = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...zone,
    }).format(instant);

    time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...zone,
    }).format(instant);
  } catch {
    date = '';
    time = '';
  }

  // `en-CA` can render with slashes on some ICU builds, and `en-GB` says 24:00
  // for midnight — an hour that does not exist.
  date = date.replace(/\//g, '-');
  time = time.replace(/^24:/, '00:');

  const looksRight = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);

  if (looksRight) {
    return { date, time };
  }

  // Last resort: the instant as sent. The zone is wrong, and a date in the
  // wrong zone is still a date somebody can act on.
  const fallback = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);

  return fallback ? { date: fallback[1], time: fallback[2] } : null;
}

/** The statuses this client knows; anything else is no answer at all. */
const RSVP_STATUSES: readonly string[] = [
  'Interested',
  'Going',
  'Waitlisted',
  'CheckedIn',
  'Attended',
  'Cancelled',
  'NoShow',
];

/**
 * The viewer's own answer, or null.
 *
 * Passes `Waitlisted` and `CheckedIn` straight through rather than flattening
 * them to `Going`: somebody who is fourth in a queue has not got a place, and a
 * screen told otherwise would say so in the one place a person checks.
 */
function toRsvpStatus(value?: string | null): RSVPStatus {
  return typeof value === 'string' && RSVP_STATUSES.includes(value)
    ? (value as RSVPStatus)
    : null;
}

/**
 * A clock time for an agenda item pinned only to an offset.
 *
 * "45 minutes in" is a real way to write a running order, and the platform
 * stores it that way. A person reading the page wants a time of day.
 */
function offsetFromStart(minutes?: number | null, startTime?: string): string | null {
  if (typeof minutes !== 'number' || !startTime) {
    return null;
  }

  const [hours, mins] = startTime.split(':').map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(mins)) {
    return null;
  }

  const total = (((hours * 60 + mins + minutes) % 1440) + 1440) % 1440;

  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The wire event as the screens expect it.
 *
 * Every field the platform does not send resolves to something a screen can
 * draw without lying: an empty cover rather than a broken image, `null` rather
 * than an invented RSVP, and — where the platform genuinely has no answer, as
 * with a paid event's amount — `undefined`, so `describeEventPrice` can say
 * "paid" instead of a number nobody supplied.
 */
export function toEvent(wire: EventWire): Event {
  const startsAt = wire.schedule?.startsAt ?? wire.startsAt ?? '';
  const endsAt = wire.schedule?.endsAt ?? wire.endsAt ?? '';
  const timezone = wire.schedule?.timeZoneId ?? wire.timeZoneId ?? '';

  const start = startsAt ? partsInZone(startsAt, timezone) : null;
  const end = endsAt ? partsInZone(endsAt, timezone) : null;

  const gallery = (wire.media ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => mediaUri(item.mediaId))
    .filter((uri) => uri.length > 0);

  const cover = mediaUri(wire.coverMediaId);

  // **The wire calls a neighbourhood `neighborhoodName`; every screen here
  // reads `areaName`.** So the place line on each card and in the detail
  // header rendered `undefined` — "where is it" being the second thing a
  // person wants after "when".
  //
  // `regionName` comes second because that is where the create screen puts
  // what it asks for as the area: an event in Caudan is stored with
  // `regionName: 'Caudan'` and no neighbourhood at all, since a neighbourhood
  // on this platform is a catalogue row with an id and a typed area is not.
  // Reading only `neighborhoodName` lost it.
  //
  // `displayName` is last and only when it says something new. It is defined
  // as `neighborhoodName ?? cityName ?? regionName ?? countryCode`, so on an
  // event with no area it *is* the city — and using it produced "Port Louis,
  // Port Louis" on the live event.
  //
  // The address parts are not on `LocationResponse` at all: `landmark` and the
  // coordinates belong to the *venue*, which is a different object.
  const cityName = wire.location?.cityName ?? '';
  const displayName = wire.location?.displayName ?? '';

  const location = {
    cityName,
    areaName:
      wire.location?.neighborhoodName ??
      wire.location?.regionName ??
      (displayName === cityName ? '' : displayName),
    countryCode: wire.location?.countryCode ?? '',
    addressLine: wire.venue?.addressLine1 ?? undefined,
    landmark: wire.venue?.landmark ?? undefined,
    latitude: wire.venue?.latitude ?? undefined,
    longitude: wire.venue?.longitude ?? undefined,
    distanceKm: wire.distanceKm ?? undefined,
  };

  // An agenda item's `time` is a display string the platform does not send. It
  // sends `startsAt`, or an offset in minutes from the start for an item that
  // has not been pinned to a clock time. Rendering neither is how the running
  // order came out as a list of `undefined`s.
  const agenda = (wire.agenda ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => ({
      id: item.id ?? '',
      title: item.title ?? '',
      description: item.description ?? '',
      time:
        (item.startsAt ? partsInZone(item.startsAt, timezone)?.time : null) ??
        offsetFromStart(item.startOffsetMinutes, start?.time) ??
        '',
      speakerName: item.speakerName ?? undefined,
    }));

  return {
    id: wire.eventId ?? wire.id ?? '',
    title: wire.title ?? '',
    // A list summary carries no description. Its `summary` is what there is,
    // and an empty About section reads as a missing event rather than a card
    // the platform sent less detail for.
    description: wire.description ?? wire.summary ?? '',
    coverImage: cover || gallery[0] || '',
    gallery: cover ? [cover, ...gallery.filter((uri) => uri !== cover)] : gallery,
    // The client's category union is a display vocabulary, not the platform's
    // key set. The name is what a person should read; the key is the fallback.
    category: (wire.categoryName ?? wire.categoryKey ?? '') as EventCategory,
    date: start?.date ?? '',
    time: start?.time ?? '',
    endTime: end?.time ?? '',
    // Dropped until 5 Oct 2026, so a two-day conference read as one day on its page.
    ...(end?.date && start?.date && end.date !== start.date ? { endDate: end.date } : {}),
    timezone,
    location: location as Event['location'],
    // `EventVenueResponse.Name`, not `venueName`. A list summary is the only
    // shape that spells it flat.
    venueName: wire.venue?.name ?? wire.venueName ?? null,
    // `isFree` is the whole of what the platform says about money on an event.
    // There is no amount anywhere in `EventResponse`, so a number here would be
    // invented. Zero when it is free, and nothing when it is not.
    price: wire.isFree === false ? undefined : 0,
    // The platform's own word for where the event is in its life. Both list
    // and detail send it, and until now nothing read it — so an organiser
    // could not tell that their event was still a draft nobody could see.
    status: (wire.status ?? undefined) as Event['status'],
    visibility: wire.visibility ?? null,
    isFree: wire.isFree ?? true,
    currency: undefined,
    hostName: wire.hostName ?? null,
    organizerUserId: wire.organizerUserId ?? null,
    organizationId: wire.organizationId ?? null,
    organizationName: wire.organizationName ?? null,
    communityId: typeof wire.communityId === 'string' && wire.communityId ? wire.communityId : null,
    isOrganizerVerified: wire.isOrganizerVerified ?? false,
    agenda: agenda as Event['agenda'],
    contact: (wire.contact ?? undefined) as Event['contact'],
    capacity: (wire.capacity ?? null) as Event['capacity'],
    rsvpStatus: toRsvpStatus(wire.viewerRsvpStatus),
    viewCount: wire.viewCount ?? 0,
    createdAt: wire.createdAt ?? '',
  } as Event;
}

/**
 * What the price badge should say.
 *
 * The badge used to read `!event.price ? 'FREE' : …`, and since the platform
 * sends no amount, **every paid event was labelled FREE** — the one wrong
 * answer that costs somebody money at the door.
 */
export function describeEventPrice(event: Pick<Event, 'price' | 'currency' | 'isFree'>): string {
  if (typeof event.price === 'number' && event.price > 0) {
    // In the event's own currency (14 Oct 2026). It was '£' for GBP and '$'
    // for every other currency, so a rupee price read in dollars.
    return formatPrice(event.price, event.currency);
  }

  if (event.isFree === false) {
    return 'PAID ENTRY';
  }

  return 'FREE';
}
