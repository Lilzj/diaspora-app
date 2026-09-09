// ─────────────────────────────────────────────────────────────────────────────
// Who turned up
//
// ── Two routes that were never there ────────────────────────────────────────
//
// The attendees screen was written as a gap adapter, against a contract that
// was imagined rather than read:
//
//   the client called                              the platform serves
//   ────────────────────────────────────────────   ───────────────────────────
//   GET  /community-life/registrations/attendees   GET  /events/{id}/attendees
//   POST /community-life/registrations/{id}/check-in
//                                                  POST /events/{id}/check-ins
//
// So the screen could not have worked, and it was gated behind the gap-preview
// flag — off in every real build — which is why nobody found out. Both real
// routes have been served since the module shipped.
//
// ── And the rows had no names ───────────────────────────────────────────────
//
// `AttendeeResponse` carried an identifier, a status and a party size and no
// display name at all, so an organiser checking people in at a door would have
// been reading rows of nothing. The backend resolves the name now, through the
// same member port that named the people in a conversation.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import type { EventAttendee, RegistrationStatus } from '@/types/community-advanced';

const ROOT = '/community-life';

/** One attendee, as the platform sends them. */
export interface AttendeeWire {
  rsvpId?: string;
  attendeeUserId?: string;
  displayName?: string | null;
  status?: string;
  partySize?: number;
  note?: string | null;
  respondedAt?: string;
  checkedInAt?: string | null;
}

export interface AttendeePage {
  items: EventAttendee[];
  nextCursor?: string | null;
  hasMore: boolean;
  goingCount: number;
  remainingPlaces?: number | null;
}

/**
 * The wire attendee as the screen reads them.
 *
 * `attendeeUserId` → `userId` and `partySize` → `guestCount`: the client's type
 * was written from the imagined contract, so both names differ from what the
 * platform sends and neither would have bound.
 */
export function toAttendee(wire: AttendeeWire): EventAttendee & { rsvpId: string } {
  return {
    rsvpId: wire.rsvpId ?? '',
    userId: wire.attendeeUserId ?? '',
    // Empty rather than "Unknown". A row with no name is a row the platform
    // could not resolve, and inventing a person to fill it is worse.
    displayName: wire.displayName?.trim() ?? '',
    status: (wire.status ?? 'Going') as RegistrationStatus,
    registeredAt: wire.respondedAt ?? '',
    checkedInAt: wire.checkedInAt ?? null,
    guestCount: wire.partySize ?? 1,
  };
}

/** Who is coming to an event. */
export async function fetchEventAttendees(params: {
  eventId: string;
  cursor?: string;
  limit?: number;
}): Promise<AttendeePage> {
  const response = await apiClient.get(`${ROOT}/events/${params.eventId}/attendees`, {
    params: { cursor: params.cursor, limit: params.limit },
  });

  const page = response.data?.data ?? {};

  return {
    items: (page.items ?? []).map(toAttendee),
    nextCursor: page.nextCursor ?? null,
    hasMore: Boolean(page.hasMore),
    goingCount: page.goingCount ?? 0,
    remainingPlaces: page.remainingPlaces ?? null,
  };
}

/**
 * Records somebody arriving.
 *
 * The platform takes the *event* and names the attendee in the body, rather
 * than taking a registration id in the path — which is what the gap adapter
 * assumed and why its call could never have landed.
 */
export async function checkInAttendee(params: {
  eventId: string;
  rsvpId: string;
}): Promise<void> {
  await apiClient.post(`${ROOT}/events/${params.eventId}/check-ins`, {
    rsvpId: params.rsvpId,
    method: 'Manual',
  });
}
