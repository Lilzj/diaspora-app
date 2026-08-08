// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life API client (Backend Phase B12)
//
// ✅ EVERY ROUTE IN THIS FILE IS REAL. It is the backend arm of Phase 12's
//    repository split; `community-gap-api.ts` is the development arm.
//
// Thin wrappers over `/community-life/*`. Every route below is one B12 already
// serves, and every parameter below is one the endpoint actually binds — the
// event list genuinely filters on `query`, `category`, `cityName`, `latitude`,
// `longitude`, `radiusKm`, `filterType`, `timeFilter` and `sortBy`, and the
// organization directory genuinely filters on `query`, `category`, `cityName`
// and the same proximity triple.
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
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toFinancialError } from './financial-errors';
import type {
  CalendarEvent,
  CommunityOrganization,
  Event,
  EventCategory,
  OrgCategory,
  RSVPStatus,
} from '@/types/community-life';

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
    const items = response.data.data ?? [];
    return { items, totalCount: response.data.totalCount ?? items.length };
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
  method: 'post' | 'put' | 'delete',
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
          : await apiClient.post<CommunityEnvelope<T>>(url, body, { params });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ── Events ───────────────────────────────────────────────────────────────────

/**
 * The event list's real parameters.
 *
 * Every field here is bound by the endpoint. Notably absent: a cursor. B12's
 * event list is unpaginated and returns everything that matches — which is
 * fine for a city's events and is written up in the contract matrix as the
 * reason the hub asks for a *narrow* filter rather than "everything near me".
 */
export interface EventQueryParams {
  query?: string;
  category?: EventCategory | 'All';
  cityName?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  /** B12's own discovery buckets. `recommended` is a real server-side filter. */
  filterType?:
    | 'all'
    | 'nearby'
    | 'recommended'
    | 'free'
    | 'popular'
    | 'recently_added'
    | 'community'
    | 'ai';
  timeFilter?: 'today' | 'tomorrow' | 'weekend' | 'this_week' | 'upcoming';
  sortBy?: 'date' | 'distance' | 'popular' | 'recently_added';
}

export function fetchEvents(params: EventQueryParams = {}) {
  return readList<Event>('/events', params);
}

export function fetchEvent(eventId: string): Promise<Event> {
  return read<Event>(`/events/${eventId}`);
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

export function createEvent(request: CreateEventRequest): Promise<Event> {
  return write<Event>('post', '/events', request);
}

export function updateEvent(eventId: string, request: Partial<CreateEventRequest>): Promise<Event> {
  return write<Event>('put', `/events/${eventId}`, request);
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
 * Expressed as a partial update because that is what B12 supports: `rsvpStatus`
 * is a field on the event, and there is no registration route. §51's "already
 * registered" and "event full" are therefore not answerable here — they are
 * COMMUNITY-LIFE-GAP-005, and the *registration* control on an event screen
 * goes to the gap adapter while this one stays real.
 */
export function setEventRsvp(eventId: string, rsvpStatus: RSVPStatus): Promise<Event> {
  return write<Event>('put', `/events/${eventId}`, { rsvpStatus });
}

// ── Organizations ────────────────────────────────────────────────────────────

export interface OrganizationQueryParams {
  query?: string;
  category?: OrgCategory | 'All';
  cityName?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  sortBy?: 'distance';
}

export function fetchOrganizations(params: OrganizationQueryParams = {}) {
  return readList<CommunityOrganization>('/organizations', params);
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
  openingHours?: { day: string; hours: string }[];
  verificationDocument?: string;
  hasMembershipPlans?: boolean;
}

export function createOrganization(
  request: CreateOrganizationRequest
): Promise<CommunityOrganization> {
  return write<CommunityOrganization>('post', '/organizations', request);
}

// ── Calendar ─────────────────────────────────────────────────────────────────

/**
 * Events and public holidays for a location, merged by the server.
 *
 * Phase 12's series occurrences are *not* in here — B12 has no series — so the
 * calendar screen merges this real projection with the adapter's occurrences
 * and labels which is which. That merge is GAP-004's most visible consequence
 * and the calendar says so on its face.
 */
export function fetchCalendar(cityName?: string): Promise<CalendarEvent[]> {
  return read<CalendarEvent[]>('/calendar', cityName ? { cityName } : undefined);
}
