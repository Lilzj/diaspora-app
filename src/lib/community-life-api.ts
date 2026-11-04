// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life API client (Backend Phase B12)
//
// ✅ EVERY ROUTE IN THIS FILE IS REAL. It is the backend arm of Phase 12's
//    repository split; `community-gap-api.ts` is the development arm.
//
// Thin wrappers over `/community-life/*`. Every route below is one B12 already
// serves. **What each route binds is stated per parameter in the BROWSE
// PARAMETERS section**, not asserted in the abstract — the previous version of
// this paragraph asserted it in the abstract and was wrong about eight
// parameters.
//
// Two things this module exists to stop:
//
//   **Screens calling `apiClient` directly.** Before Phase 12 the Community Life
//   screens each built their own axios call, unwrapped their own envelope and
//   invented their own error handling. That is why an event list could fail
//   silently on one screen and throw on another. Every B12 call now goes through
//   here, is unwrapped here, and is converted to a `FinancialError` here — the
//   platform's one error type — so a Community Life failure renders through the
//   same components as a wallet failure.
//
//   **Phase 12 duplicating B12.** §58.2 and §58.3: extend the existing Events
//   and Organization infrastructure, do not build a second one. There is no
//   event type in Phase 12's domain model that replaces B12's `Event`; there is
//   an `EventOccurrence` that *renders* like one, and it comes from the gap
//   adapter because a series is the thing B12 has no concept of.
//
// The envelope here is B12's `{ data, totalCount }`, which is **not** the
// platform's `{ data, meta }`. That difference is real, it is load-bearing —
// `totalCount` is how the directory shows "48 organisations" without a second
// call — and it is written up in the contract matrix rather than smoothed over.
//
// ─────────────────────────────────────────────────────────────────────────────
// REMEDIATION — READ THIS BEFORE TRUSTING THE PARAGRAPHS ABOVE
//
// The claim at the top of this file — "every parameter below is one the endpoint
// actually binds" — **was not true**, and the category defect below was only the
// part of it that was assigned. Verified against the backend source, the
// following divergences are still open on this module and are recorded here so
// the next reader does not rediscover them the way this wave did:
//
//   1. ✅ **CLOSED — Remediation Wave J.** The event and organization browse
//      fetchers were sending names the routes do not bind. See the
//      "BROWSE PARAMETERS" section below, which now holds the single mapping
//      from this client's vocabulary onto the server's, the list of filters that
//      were dropped because the routes have no counterpart for them, and the
//      binding source for each line.
//
//   2. **The event write body is a different shape.** `CreateEventRequest.cs`
//      requires `Title`, `Summary`, `CategoryKey`, `StartsAt`, `EndsAt` and
//      `CountryCode`; `CreateEventRequest` below sends `title`, `description`,
//      `date`, `time`, `endTime`, `cityName`, `areaName`, `addressLine` and
//      `price`. The required members are `required` in the C# sense, so
//      System.Text.Json fails deserialization and the route answers **400**
//      before any handler logic runs. Fixing the category key is necessary and
//      is not sufficient: this call cannot succeed against the real backend
//      until the body is mapped.
//
//   3. **The envelope is the platform's, not B12's.** Every route in this module
//      goes through `PlatformResults.Ok`, which writes
//      `new ApiResponse<T>(value, ApiMeta.For(context))` — `{ data, meta }`.
//      There is no `totalCount`, and the paged reads carry their rows under a
//      row property inside `data` rather than as a bare array.
//
//   4. **`POST /events` does not upsert on `id`.** The comment on
//      `CreateEventRequest` below says it "doubles as a draft save — it upserts
//      on `id`". `CreateEventRequest.cs` has no identifier property at all;
//      editing is `PATCH /events/{eventId}` and publishing is its own route with
//      its own permission.
//
// Items 1-4 are out of this wave's scope and were left visible rather than
// half-fixed. What *is* fixed below is the catalogue vocabulary: the two write
// routes now send the field the server binds, carrying a value it can resolve.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toEventCategoryKey, toOrganizationTypeKey } from './community-life-catalogue';
import { toFinancialError } from './financial-errors';
import type {
  CalendarEvent,
  CommunityOrganization,
  Event,
  EventCategory,
  OrgCategory,
  RSVPStatus,
  MyRsvpPage,
  RsvpRecord,
} from '@/types/community-life';
import { readPage } from '@/lib/platform-envelope';
import { toEvent, type EventWire } from '@/lib/event-wire';
import type { OrganizationWire } from '@/types/community-life';

const ROOT = '/community-life';

// ── Query keys ───────────────────────────────────────────────────────────────

/**
 * Namespaced `community-life`, so a cache dump is unambiguous about which
 * entries came from the certified backend. Never collides with
 * `communityGapKeys`, which is the whole point of keeping the two apart.
 */
export const communityLifeKeys = {
  all: ['community-life'] as const,

  /**
   * Frontend Phase 13, §43. `communityScope` is the resolved community scope
   * token from `lib/community/scope.ts`, and it is part of the **key** rather
   * than the request.
   *
   * The distinction matters: no certified B12 route accepts a community
   * (FRONTEND-PHASE13-GAP-009), so sending the token would be sending a parameter
   * the server ignores. But an event list read under the Nigerian scope and the
   * same list read under the Ghanaian scope are different result sets — the
   * community narrowing is applied client-side — and they must not share a cache
   * entry. Adding the token here is what makes that true.
   *
   * Optional, and defaulting to `all`, so every existing caller keeps the exact
   * key it had before Phase 13 and §69's no-regression requirement holds for the
   * unscoped case.
   */
  events: (params?: EventQueryParams, communityScope?: string) =>
    ['community-life', 'events', params ?? {}, communityScope ?? 'all'] as const,
  event: (id: string) => ['community-life', 'events', id] as const,

  /**
   * The caller's own RSVPs.
   *
   * Keyed on `upcomingOnly` because it is the whole question: "what am I going
   * to" and "where have I been" are two lists, and sharing a key would serve
   * one of them the other's answer.
   */
  myRsvps: (upcomingOnly: boolean) =>
    ['community-life', 'rsvps', 'mine', upcomingOnly] as const,

  organizations: (params?: OrganizationQueryParams, communityScope?: string) =>
    ['community-life', 'organizations', params ?? {}, communityScope ?? 'all'] as const,
  organization: (id: string) => ['community-life', 'organizations', id] as const,

  calendar: (cityName?: string, communityScope?: string) =>
    ['community-life', 'calendar', cityName ?? 'all', communityScope ?? 'all'] as const,
};

// ── Transport ────────────────────────────────────────────────────────────────

/** B12's envelope. `totalCount` is present on list routes and absent on reads. */
interface CommunityEnvelope<T> {
  data: T;
  totalCount?: number;
}

type QueryParams = Record<string, unknown> | object;

async function read<T>(path: string, params?: QueryParams): Promise<T> {
  try {
    const response = await apiClient.get<CommunityEnvelope<T>>(`${ROOT}${path}`, { params });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/** A list read that keeps the count B12 supplies. */
async function readList<T>(
  path: string,
  params?: QueryParams
): Promise<{ items: T[]; totalCount: number }> {
  try {
    const response = await apiClient.get<CommunityEnvelope<T[]>>(`${ROOT}${path}`, { params });
    // ── `data` is a page, not an array ───────────────────────
    //
    // This read `response.data.data` as a bare array, and took `totalCount`
    // from the envelope itself. Both browse routes answer the cursor page
    // inside `data`:
    //
    //     data: items, nextCursor, hasMore, totalCount, facets, engine
    //
    // so `items` was assigned the envelope object — `.length` undefined and
    // `.map` not a function on every Community Life browse — while `totalCount`
    // was read from a level that has never carried it, so a counted result set
    // silently degraded to the size of the first page.
    //
    // `readPage` is the one reader that knows where the platform puts a list,
    // and it still accepts the bare array this signature promises.
    const page = readPage<T>(response.data);
    return { items: page.items, totalCount: page.totalCount ?? page.items.length };
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Every write is classified `mutating`, exactly as the financial client does,
 * so a transport failure on an event creation becomes an *indeterminate*
 * outcome rather than a failed one.
 *
 * That matters more here than it looks. A member who taps "Publish" and sees a
 * timeout must not be told the event failed to publish, because it may well
 * have — and the recovery from "it failed" is to publish again, which is how
 * duplicate events get created.
 */
async function write<T>(
  // `patch` was absent, and its absence is why `updateEvent` sent PUT to a
  // `MapPatch` route for as long as it has existed: the helper could not express
  // the right verb, so the nearest one was used and the 405 was never seen.
  method: 'post' | 'put' | 'patch' | 'delete',
  path: string,
  body?: unknown,
  params?: QueryParams
): Promise<T> {
  try {
    const url = `${ROOT}${path}`;
    const response =
      method === 'delete'
        ? await apiClient.delete<CommunityEnvelope<T>>(url, { params })
        : method === 'put'
          ? await apiClient.put<CommunityEnvelope<T>>(url, body, { params })
          : method === 'patch'
            ? await apiClient.patch<CommunityEnvelope<T>>(url, body, { params })
            : await apiClient.post<CommunityEnvelope<T>>(url, body, { params });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// BROWSE PARAMETERS — Remediation Wave J
//
// The one place that translates this client's browse vocabulary into the query
// string `GET /community-life/events` and `GET /community-life/organizations`
// actually bind. `community-directory-api.ts` and `maps-api.ts` call the two
// exported builders below rather than keeping their own spellings, so there is
// one mapping in the codebase and a future divergence is a single diff.
//
// ── What was being sent, and what happened to it ─────────────────────────────
//
// `EventSearchParameters` (`CommunityLife/Api/CommunityLifeDiscoveryEndpoints.cs:113`)
// and `OrganizationSearchParameters` (`CommunityLife/Api/OrganizationEndpoints.cs:310`)
// are `[AsParameters]` records whose properties each carry an explicit
// `[FromQuery(Name = …)]`. A query parameter whose name matches nothing in the
// record is **discarded by the minimal-API model binder without an error** — the
// route still answers 200, with an unfiltered page. So every filter below that
// had no target was a control the member could operate and the server never saw.
//
//   RENAMED — the filter was real, the spelling was not
//
//     `query`     → `q`      events `:114`, organizations `:311`
//     `cityName`  → `city`   events `:129`, organizations `:320`
//     `sortBy`    → `sort`   events `:176`, organizations `:344`
//                            …and the *values* also had to change: `sort` is
//                            parsed with `Enum.TryParse<EventSortOrder>`
//                            (`Application/Discovery/SearchEventsQueryHandler.cs:100`),
//                            so `date`/`popular`/`recently_added` all failed to
//                            parse and silently fell back to `Soonest`.
//     `filterType: 'free'`
//                 → `free=true`  events `:143`. The one discovery bucket with a
//                            genuine server-side counterpart.
//
//   DROPPED — no counterpart exists on either route
//
//     `latitude` / `longitude` / `radiusKm`
//         Neither route binds a point or a radius. Both scope geography by
//         `bounds` (a `north,south,east,west` viewport, events `:133`,
//         organizations `:324`) or by `neighborhoodAreaId`. A rectangle cannot
//         be derived from a point and a radius without this client inventing
//         one, and — Wave I's precedent — a boundary nobody drew is a worse
//         answer than a wider one. `MapSearchParams` *does* carry a real
//         viewport, so `maps-api.ts` sends `bounds`; the browse screens have no
//         rectangle and send nothing.
//
//     `sortBy: 'distance'`
//         `EventSortOrder.Nearest` and `OrganizationSortOrder.Nearest` exist,
//         but both are resolved from the geographic scope above the repository
//         and fall through to the schedule / member ordering when there is no
//         resolved centre (`Persistence/Repositories/CommunityEventRepository.cs:791-793`).
//         With no point sendable there is never a centre, so sending `Nearest`
//         would be sending a value the server accepts and cannot honour.
//
//     `filterType` — every bucket except `free`
//         `nearby` needs the point that does not exist. `popular`,
//         `recently_added` are *orderings* on this route, not filters, and are
//         reachable through `sortBy`. `recommended`, `community` and `ai` have
//         no predicate anywhere in `EventQueryFilter`.
//
//     `timeFilter`
//         The named buckets (`today`, `weekend`, `this_week`, …) do not exist.
//         The route binds an explicit window instead — `startsAfter` `:137` and
//         `startsBefore` `:140`, both `DateTimeOffset?` — so the *capability*
//         survives and the bucket→window translation belongs on the screen,
//         which is the layer that knows the member's clock and time zone. This
//         module takes the window, not the bucket, and never guesses one.
//         `upcoming` needs nothing at all: `IncludePast` defaults to false and
//         the repository already excludes anything that has ended
//         (`CommunityEventRepository.cs:582-586`).
//
// Filters the routes bind that this client does not yet offer are listed on the
// interfaces below rather than in prose, so adding one is a field rather than an
// archaeology exercise.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `sortBy` → `EventSortOrder`. Parsed case-insensitively by
 * `CommunityLifeSharedMapper.ParseEnum` and defaulted to `Soonest`, so an
 * unmapped value is not an error — it is a silently different ordering, which is
 * exactly why the mapping is explicit here.
 */
const EVENT_SORT: Record<'date' | 'popular' | 'recently_added' | 'nearest', string> = {
  date: 'Soonest',
  popular: 'MostPopular',
  recently_added: 'Newest',
  // Since 4 Nov 2026, with a point: the route measures each event and sorts by it.
  nearest: 'Nearest',
};

/** `sortBy` → `OrganizationSortOrder` (`Domain/Enums/OrganizationSortOrder.cs:4`). */
const ORGANIZATION_SORT: Record<'members' | 'newest' | 'name' | 'active', string> = {
  members: 'MostMembers',
  newest: 'Newest',
  name: 'Name',
  active: 'MostActive',
};

// ── Events ───────────────────────────────────────────────────────────────────

/**
 * The event list's real parameters — every one of them bound by
 * `EventSearchParameters`, under the name given in the comment.
 *
 * Notably present, as of Wave J: a cursor. B12's event list **is** paged
 * (`:179`/`:182`), which the previous comment here denied; the page is chosen by
 * the server and a caller that ignores `cursor` sees only the first one.
 */
export interface EventQueryParams {
  /** → `q` */
  query?: string;
  /** → `category`, as a lower-kebab catalogue key. `'All'` is dropped, not sent. */
  category?: EventCategory | 'All';
  /** → `city`. Matched exactly by the repository, not by prefix. */
  cityName?: string;
  /**
   * → `countryCode`.
   *
   * **This is the country the event is *in*, not the organiser's country of
   * origin** — `CommunityEventRepository.cs:619` reads
   * `communityEvent.Location.CountryCode`. It is therefore *not* a community
   * filter and must never be used as one; see `lib/community/scope.ts`.
   */
  countryCode?: string;
  /** → `bounds`, `"north,south,east,west"`. Only a caller holding a real viewport may send one. */
  bounds?: string;
  /**
   * → `latitude`, `longitude`, `radiusKm`: events around a point (served since
   * 14 Oct 2026). All three or none; a partial point is not sent.
   */
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  /** → `free`. The only discovery bucket with a server-side counterpart. */
  free?: boolean;
  /**
   * → `communityId` (a Guid, not a slug): events the host posted in that
   * community (21 Oct 2026). Unlike `countryCode`, this *is* a community filter.
   */
  communityId?: string;
  /**
   * → `joinedCommunities`: events posted into the communities the signed-in
   * member belongs to (since 4 Nov 2026). The screen's "From my communities".
   */
  joinedCommunities?: boolean;
  /** → `startsAfter`, ISO-8601. The caller owns the clock and the time zone. */
  startsAfter?: string;
  /** → `startsBefore`, ISO-8601. */
  startsBefore?: string;
  /** → `sort`, mapped through {@link EVENT_SORT}. `nearest` needs a point. */
  sortBy?: 'date' | 'popular' | 'recently_added' | 'nearest';
  /** → `cursor`. Opaque; comes from the previous page. */
  cursor?: string;
  /** → `limit`. */
  limit?: number;
}

/**
 * `EventQueryParams` → the query string the route binds.
 *
 * Exported so `community-directory-api.ts` and `maps-api.ts` share it. Undefined
 * values are omitted entirely rather than sent empty, because `city=` is a
 * different request from no `city` at all on a route that compares exactly.
 */
export function toEventBrowseQuery(params: EventQueryParams): Record<string, unknown> {
  const { category, sortBy } = params;

  return {
    q: params.query || undefined,
    ...(category && category !== 'All' ? { category: toEventCategoryKey(category) } : {}),
    city: params.cityName || undefined,
    countryCode: params.countryCode || undefined,
    bounds: params.bounds || undefined,
    ...(Number.isFinite(params.latitude) && Number.isFinite(params.longitude) && Number.isFinite(params.radiusKm)
      ? { latitude: params.latitude, longitude: params.longitude, radiusKm: params.radiusKm }
      : {}),
    free: params.free === true ? true : undefined,
    communityId: params.communityId || undefined,
    joinedCommunities: params.joinedCommunities === true ? true : undefined,
    startsAfter: params.startsAfter || undefined,
    startsBefore: params.startsBefore || undefined,
    sort: sortBy ? EVENT_SORT[sortBy] : undefined,
    cursor: params.cursor || undefined,
    limit: params.limit,
  };
}

/**
 * **Remediation — the `category` filter was sending display strings the server
 * cannot match.**
 *
 * The endpoint does bind a `category` query parameter
 * (`Api/CommunityLifeDiscoveryEndpoints.cs:118`, `[FromQuery(Name = "category")]
 * string[]? CategoryKeys`), so the *name* was right. The *values* were not: the
 * server normalizes each one (`Trim().ToLowerInvariant().Replace(' ', '-')`) and
 * then applies `keys.Contains(communityEvent.CategoryKey)`
 * (`Persistence/Repositories/CommunityEventRepository.cs:594`) against a
 * seventeen-key seeded catalogue. Twenty-two of the client's twenty-eight
 * display categories normalize onto nothing, so the predicate matched nothing
 * and the route answered **200 with an empty page**. No error, no clue — a
 * member filtering by "Basketball" was shown "no events near you".
 *
 * `toEventCategoryKey` is the translation, and `'All'` is dropped rather than
 * sent, because an unfilterable sentinel is not a catalogue key either.
 *
 * **Remediation Wave J — the rest of the query string is now translated too.**
 * The category was the only parameter this function used to touch; everything
 * else went through under the client's own spelling and was discarded. See
 * {@link toEventBrowseQuery}.
 */
export async function fetchEvents(params: EventQueryParams = {}) {
  // **Through `toEvent`, not cast to it.** `readList<Event>` asserted that a
  // list summary already was a client `Event`; it is not, and the difference
  // was that every card rendered `undefined` for its date and carried
  // `undefined` as its id, so tapping one opened `/event/undefined`.
  const page = await readList<EventWire>('/events', toEventBrowseQuery(params));

  return { ...page, items: page.items.map(toEvent) };
}

export async function fetchEvent(eventId: string): Promise<Event> {
  return toEvent(await read<EventWire>(`/events/${eventId}`));
}

/**
 * Creates or updates an event.
 *
 * B12's POST doubles as a draft save — it upserts on `id` — which is why the
 * request carries an optional identifier. Phase 12 uses this unchanged for
 * one-time events, including the one-time events a neighbourhood organiser
 * creates; only a *series* goes to the gap adapter.
 */
export interface CreateEventRequest {
  /** Present when saving over an existing draft. */
  id?: string;
  title: string;
  description: string;
  coverImage?: string;
  gallery?: string[];
  category: EventCategory;
  date: string;
  time: string;
  endTime: string;
  timezone?: string;
  cityName: string;
  areaName: string;
  addressLine: string;
  landmark?: string;
  organizerName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  price?: number | string;
  currency?: string;
  /** B12 accepts `Draft` here and treats anything else as published. */
  status?: 'Draft' | 'Published';
}

/**
 * Translates the client's display category into the catalogue key the write
 * routes bind.
 *
 * **The field name was wrong as well as the value.** `CreateEventRequest.cs:19`
 * declares `public required string CategoryKey` — `categoryKey` on the wire, not
 * `category` — and the handler resolves it through
 * `CommunityLifeCatalogResolver.RequireCategoryAsync`
 * (`Application/Events/CreateEventCommandHandler.cs:122`), which returns
 * `EventCategoryNotFound`, an `Error.NotFound`, for anything the catalogue does
 * not have. `PlatformResults` renders that as **404**. So unlike the browse
 * filter, a write does not silently file the event under a default — it refuses
 * it outright.
 *
 * `category` is still sent alongside `categoryKey`. That is deliberate and not
 * belt-and-braces: the development handler in `src/mocks/handlers/community-life.ts`
 * stores the display category on the `Event` it echoes back, and every screen
 * reads `event.category` expecting a display string. Dropping it would blank the
 * category chip on every card. The server ignores the extra property.
 */
function withCategoryKey<T extends { category?: EventCategory }>(request: T) {
  if (request.category === undefined) return request;
  return { ...request, categoryKey: toEventCategoryKey(request.category) };
}

export async function createEvent(request: CreateEventRequest): Promise<Event> {
  return toEvent(await write<EventWire>('post', '/events', withCategoryKey(request)));
}

/**
 * Edits an event.
 *
 * **`PATCH`, not `PUT`.** `EventEndpoints.cs:102` maps `MapPatch` for the edit,
 * and the published contract lists GET, PATCH and DELETE on this path and no
 * PUT — so every event edit was refused with **405 before any handler ran**.
 *
 * Found by the OpenAPI contract check (Wave M-1), and worth recording *why* it
 * survived: the four routes immediately below the edit in that same file —
 * `/capacity`, `/agenda`, `/speakers`, `/linked-resources` — genuinely are
 * `MapPut`, and this helper sends PUT to two of them correctly. The verb was
 * right four times out of five in one file, which is exactly the pattern a
 * reader generalises from and gets wrong on the fifth.
 */
export async function updateEvent(
  eventId: string,
  // Widened 14 Oct 2026 for the edit screen, which sends `UpdateEventRequest`'s
  // own field names (`summary`, `categoryKey`, `contact`, …) rather than the
  // create form's. `withCategoryKey` leaves a body with no `category` alone.
  request: Partial<CreateEventRequest> & UpdateEventFields
): Promise<Event> {
  return toEvent(await write<EventWire>('patch', `/events/${eventId}`, withCategoryKey(request)));
}

/**
 * Deletes an event.
 *
 * **Does not go through `write()`.** B12's delete answers `{ success: true }`
 * at the top level rather than inside the `{ data }` envelope every other route
 * uses, so unwrapping it yields `undefined` and a caller checking `.success`
 * silently reads a missing property as falsy — a deletion that succeeded
 * reported as a deletion that failed.
 *
 * The inconsistency is B12's and is not smoothed over silently: it is recorded
 * in the contract matrix as a documented divergence, and this wrapper is the
 * one place that knows about it.
 */
/**
 * `DELETE /community-life/organizations/{id}` — the creator, an administrator
 * or staff. A soft delete on the server. Added for the owner's Remove control
 * (13 Oct 2026); nothing called it before.
 */
export async function deleteOrganization(organizationId: string): Promise<void> {
  await apiClient.delete(`${ROOT}/organizations/${organizationId}`);
}

export function deleteEvent(eventId: string): Promise<{ success: boolean }> {
  return apiClient
    .delete<{ success?: boolean }>(`${ROOT}/events/${eventId}`)
    .then((response) => ({ success: response.data?.success === true }))
    .catch((cause) => {
      throw toFinancialError(cause, 'mutating');
    });
}

/**
 * Sets the caller's RSVP.
 *
 * **Remediation Wave A′ — the previous implementation was addressed to the
 * organizer's event-edit route.** It sent `PUT /events/{eventId}` with
 * `{ rsvpStatus }` on the belief that "`rsvpStatus` is a field on the event".
 * It is not: `UpdateEventRequest` has no such property, so the field was
 * dropped by the serializer and no RSVP was ever recorded. The read-only
 * `viewerRsvpStatus` on `EventResponse` is almost certainly where that belief
 * came from — it is an output projection, not an input.
 *
 * The real contract is `PUT /events/{eventId}/rsvp` with `{ status }`, and it
 * answers questions the old comment said were unanswerable:
 *
 *   * **"Event full"** — the server assigns `Waitlisted` and returns
 *     `waitlistPosition`, so COMMUNITY-LIFE-GAP-005's capacity half is closed.
 *   * **"Already registered"** — the response carries the stored `status`,
 *     which is the authoritative answer whatever the client believed.
 *
 * Only `Interested` and `Going` may be sent. The other five `RsvpStatus`
 * members are lifecycle states the server assigns.
 */
export function setEventRsvp(
  eventId: string,
  status: Extract<RSVPStatus, 'Interested' | 'Going'>,
  options: { partySize?: number; note?: string } = {}
): Promise<RsvpRecord> {
  return write<RsvpRecord>('put', `/events/${eventId}/rsvp`, {
    status,
    partySize: options.partySize,
    note: options.note,
  });
}

/**
 * The caller's own RSVPs, newest first, with the events they are for.
 *
 * **Served since the module shipped and called by nothing.** A member could
 * RSVP and then had nowhere to see what they had committed to: the commitment
 * existed on the server and nowhere a person could look.
 *
 * Answers two arrays — the RSVPs and summaries of their events — so a page of
 * ten costs one request rather than eleven. Joining them is the client's job;
 * `joinRsvpsToEvents` is where that happens.
 *
 * `upcomingOnly` defaults to true on the server. It is passed explicitly here
 * because "what am I going to" and "where have I been" are different questions
 * and a default that changed would silently answer the other one.
 */
export function fetchMyRsvps(
  options: {
    upcomingOnly?: boolean;
    statuses?: string[];
    cursor?: string | null;
    limit?: number;
  } = {}
): Promise<MyRsvpPage> {
  return read<MyRsvpPage>('/rsvps/mine', {
    upcomingOnly: options.upcomingOnly ?? true,
    status: options.statuses,
    cursor: options.cursor ?? undefined,
    limit: options.limit,
  });
}

/**
 * Sets how many places an event has. Organisers only.
 *
 * **`PUT /events/{id}/capacity` has been served and never called.** Which meant
 * the waitlist branch of the RSVP flow — written, handled and explained in the
 * event screen — could only ever fire on seeded data, because nothing in the
 * application could make an event full.
 *
 * **Null is uncapped, and it is not zero.** A capacity of zero is an event
 * nobody may join; passing it where "no limit" was meant would silently close
 * an open event, and the two must never be conflated on the way down.
 *
 * `baseRevision` is the optimistic-concurrency guard the route offers: two
 * organisers editing at once, and the second is told rather than overwriting
 * the first.
 */
export async function setEventCapacity(
  eventId: string,
  capacity: number | null,
  baseRevision?: number
): Promise<Event> {
  return toEvent(
    await write<EventWire>('put', `/events/${eventId}/capacity`, { capacity, baseRevision })
  );
}


/**
 * `CreateEventSeriesRequest`, as the platform declares it.
 *
 * Deliberately written from the C# record rather than from the client's own
 * series type, which was built for the gap adapter and drifts from it.
 */
export interface CreateEventSeriesRequest {
  title: string;
  summary: string;
  description?: string;
  categoryKey: string;
  /** `YYYY-MM-DD`. A series starts on a date, not at an instant. */
  startDate: string;
  /** `HH:MM`. */
  startTime: string;
  durationMinutes: number;
  timeZoneId?: string;
  recurrence: {
    /** `Daily`, `Weekly`, `Monthly`, `Yearly`. */
    frequency: string;
    interval?: number;
    byWeekday?: number[];
    byMonthDay?: number[];
    /** `Never`, `OnDate`, `Count`. Never lets the sweep top occurrences up. */
    endKind?: string;
    until?: string;
    count?: number;
  };
  attendanceMode?: string;
  countryCode: string;
  regionName?: string;
  cityName?: string;
  venue?: { addressLine1?: string; landmark?: string; latitude?: number; longitude?: number };
  contact?: { phone?: string; whatsApp?: string; email?: string; website?: string };
  isFree: boolean;
  isFamilyFriendly: boolean;
  isChildFriendly: boolean;
  isStudentFocused: boolean;
  publish: boolean;
}

/**
 * A repeating event.
 *
 * **The create wizard has always had a "Recurring Event" toggle and has never
 * sent it anywhere.** It collected weekly, monthly or annual, and
 * `CreateEventRequest` has no recurrence fields at all — so a member who set
 * up a weekly meetup got a single event, and no error to tell them otherwise.
 *
 * `POST /community-life/events/series` has been served all along.
 * `community-gap-api.ts` even has a `createEventSeries` pointed at it, behind
 * `assertEnabled('eventSeries')` — so calling it in any real build throws
 * before it reaches the network. This one is not gated, because the route is
 * not a gap.
 *
 * The request is its own shape: a start *date* and *time* with a duration,
 * rather than two instants, because a series has no single start.
 */
export interface CreatedSeries {
  /** The series identifier, for reading its occurrences back. */
  id: string;
  /**
   * The server's own sentence for the rule — "Every week on Thursday".
   *
   * `RecurrenceRuleRequest` asks clients to render this rather than compose
   * one: the semantics live on the platform, and a sentence written beside a
   * different set of rules drifts from them. Optional here because a screen
   * must still say something if an older platform omits it.
   */
  description?: string;
}

export async function createEventSeries(
  request: CreateEventSeriesRequest
): Promise<CreatedSeries> {
  const wire = await write<{
    seriesId?: string;
    id?: string;
    recurrence?: { description?: string | null } | null;
  }>('post', '/events/series', request);

  return {
    id: wire?.seriesId ?? wire?.id ?? '',
    description: wire?.recurrence?.description?.trim() || undefined,
  };
}

/**
 * Announces an organisation.
 *
 * **`POST /organizations/{organizationId}/publish` has been served since the
 * module shipped and the client never called it** — the same gap events had.
 * Creating an organisation always makes a draft: there is no `publish` flag on
 * `CreateOrganizationRequest`, and until the create request itself was fixed
 * nobody could produce even a draft, so the gap had never been reached.
 *
 * `visibility` is left to the server's default rather than guessed at here.
 * Picking one would decide who can see somebody's organisation on their behalf.
 */
export async function publishOrganization(organizationId: string): Promise<OrganizationWire> {
  return write<OrganizationWire>('post', `/organizations/${organizationId}/publish`, {});
}

/**
 * How much community life the area around a point has (14 Oct 2026).
 *
 * `GET /community-life/area/activity` is the point-keyed successor of the
 * catalogue neighbourhood's activity route, which still answers old app builds
 * and is no longer called. `name` is the Google place the member picked, echoed
 * back as `displayName`; without one the server says "Within 2 km of you".
 */
export async function fetchAreaActivity(input: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  name?: string | null;
  windowDays?: number;
}): Promise<AreaActivityWire> {
  const name = input.name?.trim();

  return read<AreaActivityWire>('/area/activity', {
    latitude: input.latitude,
    longitude: input.longitude,
    radiusKm:
      input.radiusKm !== undefined && Number.isFinite(input.radiusKm) && input.radiusKm > 0
        ? Math.min(input.radiusKm, 10)
        : undefined,
    name: name ? name : undefined,
    windowDays: input.windowDays,
  });
}

/** `AreaActivityResponse`. */
export interface AreaActivityWire {
  latitude: number;
  longitude: number;
  radiusKm: number;
  name?: string | null;
  displayName: string;
  windowDays: number;
  eventCount: number;
  upcomingEventCount: number;
  organizationCount: number;
  totalRsvps: number;
  totalAttendances: number;
  /** True when a count stopped at its cap, so the true figures are at least these. */
  isLowerBound: boolean;
}

/**
 * Announces a repeating event.
 *
 * **The third route in this file that the platform served and nobody called.**
 * Events had it, organisations had it, and a series has it too:
 * `POST /events/series/{seriesId}/publish`. Creating a series always makes a
 * draft — the create request's `publish` flag is passed `false`, the same way a
 * single event is drafted first — so without this a member could set up a
 * weekly clinic and have no way at all to announce it.
 */
export async function publishEventSeries(seriesId: string): Promise<void> {
  await write<unknown>('post', `/events/series/${encodeURIComponent(seriesId)}/publish`, {});
}

/**
 * Replaces an organisation's opening hours.
 *
 * **`PUT /organizations/{id}/operating-hours` is the fourth route in this file
 * the platform served and nothing called.** The register form carried three
 * hardcoded rows — "Monday - Friday 09:00 - 17:00" and two more — that no
 * payload has ever sent anywhere, and there was no editor: a member could not
 * state their own hours, and the fabricated ones were not saved either. So
 * every organisation on the platform has none.
 *
 * Wholesale replacement, not a merge: the request carries the complete list and
 * whatever is absent is gone. `baseRevision` is optimistic concurrency — pass
 * the revision the profile was read at, and a second editor's stale write is
 * refused rather than silently overwriting the first.
 *
 * **Times must be `HH:mm` with both digits.** `FromWireTime` uses
 * `TryParseExact` and answers *null* on anything else, so `9:00` is not a
 * refusal — it is an hour silently discarded. The caller pads.
 */
export async function setOperatingHours(
  organizationId: string,
  hours: OperatingHourWire[],
  baseRevision?: number
): Promise<OrganizationWire> {
  return write<OrganizationWire>(
    'put',
    `/organizations/${encodeURIComponent(organizationId)}/operating-hours`,
    {
      baseRevision,
      hours: hours.map((hour) => ({
        day: hour.day,
        opensAt: hour.isClosed ? null : padWireTime(hour.opensAt),
        closesAt: hour.isClosed ? null : padWireTime(hour.closesAt),
        isClosed: hour.isClosed,
        note: hour.note?.trim() || null,
      })),
    }
  );
}

/**
 * Asks to join an organisation, or joins it outright.
 *
 * **`POST /organizations/{id}/members` has been served since the module
 * shipped.** In its place the profile carried a card headed "Hub Membership
 * (Future)" offering "exclusive meetings, announcements, and discounts at
 * partner businesses", with a Join button that opened an alert saying
 * membership would arrive in a later release.
 *
 * **There are two different memberships here and the card conflated them.**
 * This one is belonging to a community body: a role, a policy the body sets,
 * and no money. The other is a priced *membership programme* with tiers,
 * benefits, renewals and payments, which `Diaspora.Modules.CommunityProgramme`
 * serves under `/communities` and the client already has four screens for. The
 * card's copy described the second and its button offered neither.
 *
 * Whether this joins or merely asks is the *organisation's* decision, carried
 * on `membershipPolicy`, and the answer comes back on `status`.
 */
export async function joinOrganization(
  organizationId: string,
  message?: string
): Promise<{ status?: string }> {
  return write<{ status?: string }>(
    'post',
    `/organizations/${encodeURIComponent(organizationId)}/members`,
    { message: message?.trim() || undefined }
  );
}

/** The caller walks away from an organisation. */
export async function leaveOrganization(organizationId: string): Promise<void> {
  await write<unknown>(
    'delete',
    `/organizations/${encodeURIComponent(organizationId)}/members/me`
  );
}

/**
 * `9:00` → `09:00`, and anything that is not a time at all → null.
 *
 * The platform parses exactly `HH:mm` and answers null otherwise *without
 * failing*, so an unpadded hour is not an error a member sees — it is an
 * opening time that quietly vanishes.
 */
function padWireTime(value?: string | null): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    return null;
  }

  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

/**
 * Announces an event.
 *
 * **`POST /events/{eventId}/publish` has been served since the module shipped
 * and the client never called it.** Creating an event always makes a draft —
 * the single-event create request has no `publish` flag, unlike the series one
 * — and the create screen correctly says so: "Saved as a draft. You can
 * publish it from your events."
 *
 * There was nowhere to do that. No function, no hook, no control. So every
 * event an organiser made stayed invisible to everyone forever, which is why
 * the deployment had no published events at all: the platform had never had
 * one. Guides, housing and marketplace listings each got their publish call;
 * events were the one that did not.
 *
 * `visibility` is left to the server's own default rather than guessed at
 * here — the request allows it, and picking a value for somebody would be
 * deciding who can see their event on their behalf.
 */
export async function publishEvent(eventId: string): Promise<Event> {
  return toEvent(await write<EventWire>('post', `/events/${eventId}/publish`, {}));
}

/**
 * Withdraws the caller's RSVP.
 *
 * A separate route rather than a null status, which is the same separation the
 * Jobs module makes between a candidate withdrawing and an employer deciding:
 * leaving is the attendee's own action and should not be reachable by passing a
 * value to somebody else's endpoint.
 */
export function withdrawEventRsvp(eventId: string, reason?: string): Promise<RsvpRecord> {
  return write<RsvpRecord>(
    'delete',
    `/events/${eventId}/rsvp`,
    undefined,
    reason ? { reason } : undefined
  );
}

// ── Organizations ────────────────────────────────────────────────────────────

/**
 * The organization directory's real parameters. Same treatment, same reasons —
 * see the BROWSE PARAMETERS section above for what was dropped and why.
 */
export interface OrganizationQueryParams {
  /** → `q` (`OrganizationEndpoints.cs:311`) */
  query?: string;
  /** → `type` (`:314`), as a lower-kebab catalogue key. */
  category?: OrgCategory | 'All';
  /** → `city` (`:320`) */
  cityName?: string;
  /**
   * → `countryCode` (`:317`).
   *
   * As on the event route this is the country the organisation **is in** —
   * `OrganizationRepository.cs:291` reads `organization.Location.CountryCode` —
   * and not the community it serves.
   */
  countryCode?: string;
  /** → `bounds` (`:324`), `"north,south,east,west"`. */
  bounds?: string;
  /** → `verified` (`:326`) */
  verified?: boolean;
  /** → `acceptingMembers` (`:332`) */
  acceptingMembers?: boolean;
  /**
   * → `sort` (`:344`), mapped through {@link ORGANIZATION_SORT}.
   *
   * The old `'distance'` value is gone: it mapped to `OrganizationSortOrder.Nearest`,
   * which needs a resolved search centre this route has no parameter to supply.
   */
  sortBy?: 'members' | 'newest' | 'name' | 'active';
  /** → `cursor` (`:347`) */
  cursor?: string;
  /** → `limit` (`:350`) */
  limit?: number;
}

/** `OrganizationQueryParams` → the query string the route binds. Shared, as above. */
export function toOrganizationBrowseQuery(
  params: OrganizationQueryParams
): Record<string, unknown> {
  const { category, sortBy } = params;

  return {
    q: params.query || undefined,
    ...(category && category !== 'All' ? { type: toOrganizationTypeKey(category) } : {}),
    city: params.cityName || undefined,
    countryCode: params.countryCode || undefined,
    bounds: params.bounds || undefined,
    verified: params.verified === true ? true : undefined,
    acceptingMembers: params.acceptingMembers === true ? true : undefined,
    sort: sortBy ? ORGANIZATION_SORT[sortBy] : undefined,
    cursor: params.cursor || undefined,
    limit: params.limit,
  };
}

/**
 * **Remediation — the organization directory's `category` filter was a
 * parameter the server does not bind at all.**
 *
 * `OrganizationSearchParameters` (`Api/OrganizationEndpoints.cs:315`) binds
 * `[FromQuery(Name = "type")] string[]? TypeKeys`. There is no `category`
 * parameter on the route, so the filter was discarded by the model binder
 * before the handler ran: every "Churches" search returned the *whole*
 * directory, unfiltered, and looked like it had worked.
 *
 * Sending `type` fixes the name; `toOrganizationTypeKey` fixes the value. The
 * fourteen seeded keys are lower-kebab and singular — `sports-club`, not
 * `'Sports Clubs'` — so even the entries that look like they would survive
 * normalization do not.
 *
 * **Remediation Wave J — `query`, `cityName` and `sortBy` were three more of the
 * same defect on the same route**, and are now translated by
 * {@link toOrganizationBrowseQuery} alongside the type.
 */
export function fetchOrganizations(params: OrganizationQueryParams = {}) {
  return readList<CommunityOrganization>('/organizations', toOrganizationBrowseQuery(params));
}

export function fetchOrganization(organizationId: string): Promise<CommunityOrganization> {
  return read<CommunityOrganization>(`/organizations/${organizationId}`);
}

export interface CreateOrganizationRequest {
  name: string;
  category: OrgCategory;
  description: string;
  mission?: string;
  logo?: string;
  coverImage?: string;
  services?: string[];
  cityName: string;
  areaName: string;
  addressLine: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  /*
   * **`openingHours` was declared here and the route has never accepted it.**
   *
   * `CreateOrganizationRequest` has no such member — opening hours are set
   * afterwards, through `PUT /organizations/{id}/operating-hours`, in a
   * structured shape rather than the free-text `{ day, hours }` pair this
   * declared. The register form filled it with three invented rows and
   * `buildPayload` correctly dropped them, so the type was describing a field
   * that went nowhere and telling the next reader it was supported.
   *
   * Removed rather than renamed: nothing about opening hours belongs on a
   * create request. See `setOperatingHours`.
   */
  verificationDocument?: string;

  /*
   * `hasMembershipPlans` was declared here for the same reason `openingHours`
   * was: a form field with nowhere to go. `CreateOrganizationRequest` has no
   * such member, so it was never sent.
   *
   * Paid membership plans do exist — as a *programme* on the organisation,
   * created through `PUT /communities/{organizationId}/membership`, not as a
   * boolean at registration. What the create request accepts is below.
   */
  /** `Open`, `RequestToJoin`, `InviteOnly` or `Closed`. */
  membershipPolicy?: string;
  /** What the organisation asks of a member, in its own words. */
  membershipRequirements?: string;
}

/** One row of an organisation's opening hours, as the platform sends and takes it. */
export interface OperatingHourWire {
  id?: string;
  /** `Monday`…`Sunday`, or `PublicHoliday` — which is why it is not a `DayOfWeek`. */
  day: string;
  /** Local time, `HH:mm`. Null on a closed row, or on a by-arrangement one. */
  opensAt?: string | null;
  closesAt?: string | null;
  /** Explicitly shut, which is not the same as having no row for the day. */
  isClosed: boolean;
  /** The qualification — "Jumu'ah 13:15", "second Sunday only". */
  note?: string | null;
}

/**
 * `CreateOrganizationRequest.cs:22` declares
 * `public required string OrganizationTypeKey`, resolved through the same
 * `RequireTypeAsync` guard as the event category and refused with
 * `OrganizationTypeNotFound` (**404**) when the catalogue has no such key. The
 * client was sending `category` with a display name, which is neither the right
 * field nor a resolvable value.
 *
 * `category` rides along for the same reason it does on the event write — see
 * {@link withCategoryKey}.
 */
export function createOrganization(
  request: CreateOrganizationRequest
): Promise<CommunityOrganization> {
  return write<CommunityOrganization>('post', '/organizations', {
    ...request,
    organizationTypeKey: toOrganizationTypeKey(request.category),
  });
}

// ── Calendar ─────────────────────────────────────────────────────────────────

/**
 * Events and public holidays for a location, merged by the server.
 *
 * Phase 12's series occurrences are *not* in here — B12 has no series — so the
 * calendar screen merges this real projection with the adapter's occurrences
 * and labels which is which. That merge is GAP-004's most visible consequence
 * and the calendar says so on its face.
 *
 * **Remediation Wave J — the one parameter this took was not bound either.**
 * `GET /community-life/calendar` binds exactly four:
 * `from`, `to`, `countryCode` and `neighborhoodAreaId`
 * (`Api/CommunityLifeDiscoveryEndpoints.cs:36-39`). There is **no `city`** on
 * this route — not under that name, not under `cityName` — so the calendar has
 * always been the whole feed with a city label over it.
 *
 * Rather than rename `cityName` onto something that would also be discarded, the
 * parameter is gone and the caller is given the three the route does bind. A
 * screen that wants a city calendar has nothing to send, and should say so
 * instead of implying the list is narrowed.
 */
export interface CalendarQueryParams {
  /** → `from`, ISO-8601. */
  from?: string;
  /** → `to`, ISO-8601. */
  to?: string;
  /** → `countryCode`. The country the entry is in. */
  countryCode?: string;
  /** → `neighborhoodAreaId`, a GUID resolved by B4. */
  neighborhoodAreaId?: string;
}

export function fetchCalendar(params: CalendarQueryParams = {}): Promise<CalendarEvent[]> {
  return read<CalendarEvent[]>('/calendar', {
    from: params.from || undefined,
    to: params.to || undefined,
    countryCode: params.countryCode || undefined,
    neighborhoodAreaId: params.neighborhoodAreaId || undefined,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// OWNER EDITS — events and organisations (14 Oct 2026)
//
// An organiser could remove an event and a manager could remove an organisation
// (13 Oct 2026), but neither could correct a typo: `updateEvent` had no caller,
// and nothing called `PATCH /organizations/{id}` or either media route at all.
//
// Three facts about the server decide the shape of everything below:
//
//   1. **Both PATCH routes are partial.** `UpdateEventRequest` and
//      `UpdateOrganizationRequest` say "omitted fields are left alone", so the
//      body carries only what the member changed. That is not tidiness: a field
//      sent back unchanged is still a write, and still bumps the revision.
//
//   2. **`contact` and `socialLinks` are replaced whole, not merged.**
//      `UpdateOrganizationCommandHandler.ApplyContent` rebuilds each value
//      object from what was sent, so a body carrying a new phone and nothing
//      else removes the email. When any channel changes, every channel is sent —
//      including `contactName`, which the form does not show.
//
//   3. **No `baseRevision` is sent.** Each step of one PATCH (content, then
//      capacity, then category) checks the same `baseRevision` and each bumps
//      the revision as it goes, so a save that changed the title *and* the
//      capacity would be refused by itself as a conflict on its second step.
//      Last writer wins until the server checks the revision once per request.
//
// Rescheduling is deliberately not here — see the event edit screen's header.
// ═════════════════════════════════════════════════════════════════════════════

/** `UpdateEventRequest`'s descriptive members, in the wire's spelling. */
export interface UpdateEventFields {
  title?: string;
  summary?: string;
  description?: string;
  categoryKey?: string;
  /** A positive whole number. Null (uncapped) cannot travel here — see `saveEventEdits`. */
  capacity?: number;
  isFree?: boolean;
  contact?: ContactDetailsWire;
}

/** `ContactDetailsRequest`. Replaced whole on the server — see fact 2 above. */
export interface ContactDetailsWire {
  phone: string | null;
  whatsApp: string | null;
  email: string | null;
  website: string | null;
  contactName: string | null;
}

/** `SocialLinksRequest`. Also replaced whole. Every value must be an http(s) address. */
export interface SocialLinksWire {
  facebook: string | null;
  instagram: string | null;
  twitter: string | null;
  youTube: string | null;
  linkedIn: string | null;
  tikTok: string | null;
}

/** `UpdateOrganizationRequest`'s members this client edits. */
export interface UpdateOrganizationFields {
  name?: string;
  summary?: string;
  description?: string;
  mission?: string;
  organizationTypeKey?: string;
  contact?: ContactDetailsWire;
  socialLinks?: SocialLinksWire;
}

/** One media reference as both read models send it. */
export interface MediaReferenceWire {
  mediaId?: string;
  role?: string;
  order?: number;
}

/**
 * The event as the server sends it, untranslated.
 *
 * `toEvent` is right for every screen that *shows* an event and wrong for the
 * one that edits it: it folds `summary` into `description`, the category key
 * into its display name and the media ids into URLs — the three things an edit
 * has to send back.
 */
export function fetchEventForEdit(eventId: string): Promise<EventWire> {
  return read<EventWire>(`/events/${eventId}`);
}

/** The organisation as the server sends it — `fetchOrganization`'s type is the list card's. */
export function fetchOrganizationForEdit(organizationId: string): Promise<OrganizationWire> {
  return read<OrganizationWire>(`/organizations/${organizationId}`);
}

/** `PATCH /community-life/organizations/{id}` — a manager (owner or administrator). */
export function updateOrganization(
  organizationId: string,
  request: UpdateOrganizationFields
): Promise<OrganizationWire> {
  return write<OrganizationWire>('patch', `/organizations/${organizationId}`, request);
}

/**
 * `POST /events/{id}/media` with `MediaAttachmentRequest`. The asset must already
 * be uploaded (`uploadDirect`). Attaching the same id in the same role twice is a
 * no-op on the server, which is what makes a retried save safe.
 */
export function attachEventMedia(eventId: string, mediaId: string, role: string): Promise<EventWire> {
  return write<EventWire>('post', `/events/${eventId}/media`, { mediaId, role });
}

/** `DELETE /events/{id}/media/{mediaId}`. Detaches; the asset itself is Media's to keep. */
export function detachEventMedia(eventId: string, mediaId: string): Promise<EventWire> {
  return write<EventWire>('delete', `/events/${eventId}/media/${mediaId}`);
}

export function attachOrganizationMedia(
  organizationId: string,
  mediaId: string,
  role: string
): Promise<OrganizationWire> {
  return write<OrganizationWire>('post', `/organizations/${organizationId}/media`, { mediaId, role });
}

export function detachOrganizationMedia(
  organizationId: string,
  mediaId: string
): Promise<OrganizationWire> {
  return write<OrganizationWire>('delete', `/organizations/${organizationId}/media/${mediaId}`);
}

// ── Forms ────────────────────────────────────────────────────────────────────

export interface EventEditForm {
  title: string;
  summary: string;
  description: string;
  categoryKey: string;
  /** Typed text. Empty is "no limit". */
  capacity: string;
  isFree: boolean;
  phone: string;
  whatsApp: string;
  email: string;
  website: string;
}

export interface OrganizationEditForm {
  name: string;
  summary: string;
  description: string;
  mission: string;
  organizationTypeKey: string;
  phone: string;
  whatsApp: string;
  email: string;
  website: string;
  facebook: string;
  instagram: string;
  twitter: string;
  youTube: string;
  linkedIn: string;
  tikTok: string;
}

type Loose = Record<string, unknown> | null | undefined;

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

function readContact(contact: unknown) {
  const c = (contact ?? {}) as Loose;
  return {
    phone: textOf(c?.phone),
    whatsApp: textOf(c?.whatsApp),
    email: textOf(c?.email),
    website: textOf(c?.website),
    contactName: textOf(c?.contactName),
  };
}

/** `EventCapacityResponse.Maximum`; null is uncapped. */
function readCapacity(capacity: unknown): number | null {
  const maximum = (capacity as Loose)?.maximum;
  return typeof maximum === 'number' ? maximum : null;
}

export function eventEditFormFrom(wire: EventWire): EventEditForm {
  const contact = readContact(wire.contact);
  const maximum = readCapacity(wire.capacity);
  return {
    title: textOf(wire.title),
    summary: textOf(wire.summary),
    description: textOf(wire.description),
    categoryKey: textOf(wire.categoryKey),
    capacity: maximum === null ? '' : String(maximum),
    isFree: wire.isFree ?? true,
    phone: contact.phone,
    whatsApp: contact.whatsApp,
    email: contact.email,
    website: contact.website,
  };
}

export function organizationEditFormFrom(wire: OrganizationWire): OrganizationEditForm {
  const contact = readContact(wire.contact);
  const social = wire.socialLinks ?? {};
  return {
    name: textOf(wire.name),
    summary: textOf(wire.summary),
    description: textOf(wire.description),
    mission: textOf(wire.mission),
    organizationTypeKey: textOf(wire.organizationTypeKey),
    phone: contact.phone,
    whatsApp: contact.whatsApp,
    email: contact.email,
    website: contact.website,
    facebook: textOf(social.facebook),
    instagram: textOf(social.instagram),
    twitter: textOf(social.twitter),
    youTube: textOf(social.youTube),
    linkedIn: textOf(social.linkedIn),
    tikTok: textOf(social.tikTok),
  };
}

const MIN_TITLE = 3; // CommunityLifeLimits.MinTitle
const MAX_SUMMARY = 400; // CommunityLifeLimits.MaxSummary
const HTTP_URL = /^https?:\/\/\S+$/i;

/** The required fields still empty, named as the form labels them. */
export function eventEditMissing(form: EventEditForm): string[] {
  const missing: string[] = [];
  if (!form.title.trim()) missing.push('Title');
  if (!form.summary.trim()) missing.push('Summary');
  if (!form.categoryKey) missing.push('Category');
  return missing;
}

/** A value the server would refuse, said before the member taps Save. */
export function eventEditProblem(form: EventEditForm): string | null {
  if (form.title.trim().length < MIN_TITLE) return `The title needs at least ${MIN_TITLE} characters.`;
  if (form.summary.trim().length > MAX_SUMMARY) return `The summary can be at most ${MAX_SUMMARY} characters.`;
  if (form.capacity.trim() && parseCapacityText(form.capacity) === null) {
    return 'Places must be a whole number above zero, or empty for no limit.';
  }
  if (form.website.trim() && !HTTP_URL.test(form.website.trim())) {
    return 'The website must start with https://';
  }
  return null;
}

export function organizationEditMissing(form: OrganizationEditForm): string[] {
  const missing: string[] = [];
  if (!form.name.trim()) missing.push('Name');
  if (!form.summary.trim()) missing.push('Summary');
  if (!form.organizationTypeKey) missing.push('Type');
  return missing;
}

const SOCIAL_LABELS: Record<keyof SocialLinksWire, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'X (Twitter)',
  youTube: 'YouTube',
  linkedIn: 'LinkedIn',
  tikTok: 'TikTok',
};

export function organizationEditProblem(form: OrganizationEditForm): string | null {
  if (form.summary.trim().length > MAX_SUMMARY) return `The summary can be at most ${MAX_SUMMARY} characters.`;
  if (form.website.trim() && !HTTP_URL.test(form.website.trim())) {
    return 'The website must start with https://';
  }
  // `SocialLinks.Create` refuses anything that is not an absolute http(s) URL,
  // and refuses the whole set for one bad entry, so the field is named here.
  for (const key of SOCIAL_KEYS) {
    const value = form[key].trim();
    if (value && !HTTP_URL.test(value)) return `The ${SOCIAL_LABELS[key]} link must start with https://`;
  }
  return null;
}

/** Whole positive number, or null for anything else. Empty is handled by the caller. */
function parseCapacityText(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

const orNull = (value: string): string | null => value.trim() || null;

function changed(before: string, after: string): boolean {
  return before.trim() !== after.trim();
}

function contactFrom(
  form: Pick<EventEditForm, 'phone' | 'whatsApp' | 'email' | 'website'>,
  contactName: string
): ContactDetailsWire {
  return {
    phone: orNull(form.phone),
    whatsApp: orNull(form.whatsApp),
    email: orNull(form.email),
    website: orNull(form.website),
    // Not on the form, and the server replaces the whole contact: sent back as read.
    contactName: orNull(contactName),
  };
}

const CONTACT_KEYS = ['phone', 'whatsApp', 'email', 'website'] as const;
const SOCIAL_KEYS = Object.keys(SOCIAL_LABELS) as (keyof SocialLinksWire)[];

/**
 * The PATCH body: only what changed. `capacity` is left out when it was cleared,
 * because the PATCH cannot express "no limit"; `saveEventEdits` sends that to
 * the capacity route.
 */
export function toEventPatch(wire: EventWire, form: EventEditForm): UpdateEventFields {
  const initial = eventEditFormFrom(wire);
  const patch: UpdateEventFields = {};

  if (changed(initial.title, form.title)) patch.title = form.title.trim();
  if (changed(initial.summary, form.summary)) patch.summary = form.summary.trim();
  // An emptied description is sent as "", which the server stores as no body.
  if (changed(initial.description, form.description)) patch.description = form.description.trim();
  if (initial.categoryKey !== form.categoryKey) patch.categoryKey = form.categoryKey;
  if (initial.isFree !== form.isFree) patch.isFree = form.isFree;

  if (changed(initial.capacity, form.capacity)) {
    const next = parseCapacityText(form.capacity);
    if (next !== null) patch.capacity = next;
  }

  if (CONTACT_KEYS.some((key) => changed(initial[key], form[key]))) {
    patch.contact = contactFrom(form, readContact(wire.contact).contactName);
  }

  return patch;
}

export function toOrganizationPatch(
  wire: OrganizationWire,
  form: OrganizationEditForm
): UpdateOrganizationFields {
  const initial = organizationEditFormFrom(wire);
  const patch: UpdateOrganizationFields = {};

  if (changed(initial.name, form.name)) patch.name = form.name.trim();
  if (changed(initial.summary, form.summary)) patch.summary = form.summary.trim();
  if (changed(initial.description, form.description)) patch.description = form.description.trim();
  if (changed(initial.mission, form.mission)) patch.mission = form.mission.trim();
  if (initial.organizationTypeKey !== form.organizationTypeKey) {
    patch.organizationTypeKey = form.organizationTypeKey;
  }

  if (CONTACT_KEYS.some((key) => changed(initial[key], form[key]))) {
    patch.contact = contactFrom(form, readContact(wire.contact).contactName);
  }

  if (SOCIAL_KEYS.some((key) => changed(initial[key], form[key]))) {
    patch.socialLinks = {
      facebook: orNull(form.facebook),
      instagram: orNull(form.instagram),
      twitter: orNull(form.twitter),
      youTube: orNull(form.youTube),
      linkedIn: orNull(form.linkedIn),
      tikTok: orNull(form.tikTok),
    };
  }

  return patch;
}

// ── Photos ───────────────────────────────────────────────────────────────────

export interface PhotoPlan {
  /** One entry per reference to detach; see below. */
  detach: string[];
  attach: { mediaId: string; role: string }[];
}

/**
 * What to send for the photos the member removed and added.
 *
 * `DetachMedia` removes the **first** reference with that id, and one asset can
 * be referenced twice (as the cover and in the gallery), so a removed photo is
 * detached once per reference it had. Otherwise it would linger in its other
 * role after the member was told it had gone.
 *
 * A new photo becomes the `Cover` when nothing left is one, so an event whose
 * cover was removed does not stay without a picture on its card; otherwise it
 * joins the `Gallery`.
 */
export function planPhotoChanges(
  existing: readonly MediaReferenceWire[] | null | undefined,
  removed: readonly string[],
  added: readonly string[]
): PhotoPlan {
  const references = (existing ?? []).filter(
    (ref): ref is MediaReferenceWire & { mediaId: string } => typeof ref.mediaId === 'string'
  );
  const gone = new Set(removed);
  const detach = references.filter((ref) => gone.has(ref.mediaId)).map((ref) => ref.mediaId);
  let hasCover = references.some((ref) => ref.role === 'Cover' && !gone.has(ref.mediaId));

  const attach = added.map((mediaId) => {
    if (hasCover) return { mediaId, role: 'Gallery' };
    hasCover = true;
    return { mediaId, role: 'Cover' };
  });

  return { detach, attach };
}

// ── Saving ───────────────────────────────────────────────────────────────────

/**
 * PATCH first, then photos. Each step is safe to repeat (a PATCH of the same
 * values, an attach of an attached id and a detach of a detached one all
 * succeed), so a save that failed half-way can simply be tried again from the
 * same form.
 */
export async function saveEventEdits(
  eventId: string,
  wire: EventWire,
  form: EventEditForm,
  photos: { removed: readonly string[]; added: readonly string[] }
): Promise<void> {
  const patch = toEventPatch(wire, form);
  if (Object.keys(patch).length > 0) await updateEvent(eventId, patch);

  // "No limit" only travels on the capacity route: `UpdateEventRequest.Capacity`
  // is an `int?` where null means "not sent". Null is uncapped, never zero.
  if (form.capacity.trim() === '' && readCapacity(wire.capacity) !== null) {
    await setEventCapacity(eventId, null);
  }

  const plan = planPhotoChanges(wire.media, photos.removed, photos.added);
  for (const mediaId of plan.detach) await detachEventMedia(eventId, mediaId);
  for (const { mediaId, role } of plan.attach) await attachEventMedia(eventId, mediaId, role);
}

export async function saveOrganizationEdits(
  organizationId: string,
  wire: OrganizationWire,
  form: OrganizationEditForm,
  photos: { removed: readonly string[]; added: readonly string[] }
): Promise<void> {
  const patch = toOrganizationPatch(wire, form);
  if (Object.keys(patch).length > 0) await updateOrganization(organizationId, patch);

  const plan = planPhotoChanges(wire.media, photos.removed, photos.added);
  for (const mediaId of plan.detach) await detachOrganizationMedia(organizationId, mediaId);
  for (const { mediaId, role } of plan.attach) {
    await attachOrganizationMedia(organizationId, mediaId, role);
  }
}

/**
 * The sentence for a refused save. A raw axios error carries the server's own
 * `detail`; everything from `write()` is already a `FinancialError`, whose
 * message is the person-facing one (the server's `detail` for a validation
 * refusal) and, for a save that got no answer, says it may have gone through
 * rather than that it failed.
 */
export function editErrorMessage(cause: unknown): string {
  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (cause instanceof Error && cause.message) {
    const hint = (cause as { hint?: unknown }).hint;
    return typeof hint === 'string' && hint ? `${cause.message} ${hint}` : cause.message;
  }
  return 'Nothing was saved. Please try again.';
}
