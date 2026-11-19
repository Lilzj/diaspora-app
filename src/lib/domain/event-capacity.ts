// ─────────────────────────────────────────────────────────────────────────────
// How full an event is
//
// **The server has been saying this all along and nothing listened.**
// `EventResponse.Capacity` is a *required* field — seven values arriving with
// every event — and the client modelled none of them. A member saw no sign an
// event was filling up and none that it was already full: they tapped "Going"
// and were told afterwards that they were fourth on a waitlist. The information
// to say so beforehand came down with the event.
//
// This is the one place that turns those seven numbers into words, so the event
// screen, a listing card and a share sheet cannot disagree about whether an
// event has room.
// ─────────────────────────────────────────────────────────────────────────────

import type { EventCapacity, RSVPStatus } from '@/types/community-life';

/**
 * Whether the platform says this event is full.
 *
 * **`isFull` is read, never derived.** Deriving it from `goingCount >= maximum`
 * looks equivalent and is not: the server counts waitlisted and interested
 * people under rules this client does not have, an organiser can lower a
 * maximum below the current count, and an uncapped event has no maximum to
 * compare against. A client that computed its own answer would eventually
 * disagree with the one the RSVP route enforces, and the member would be told
 * there was room by the screen and refused by the server.
 */
export function isEventFull(capacity: EventCapacity | null | undefined): boolean {
  return capacity?.isFull === true;
}

/**
 * What the RSVP button should say.
 *
 * **A full event offers the waitlist by name.** The RSVP route already answers
 * `Waitlisted` and the screen already handles it — but it did so as a surprise
 * after the tap. Saying it on the button is the same promise made before the
 * member commits rather than after.
 *
 * Somebody already going keeps the plain label: they hold a place, and offering
 * them a waitlist would read as though they had lost it.
 */
export function rsvpActionLabel(
  status: 'Going' | 'Interested',
  current: RSVPStatus,
  capacity: EventCapacity | null | undefined
): string {
  if (status !== 'Going') {
    return 'Interested';
  }

  if (current === 'Going' || current === 'Waitlisted') {
    return 'Going';
  }

  return isEventFull(capacity) ? 'Join the waitlist' : 'Going';
}

/**
 * The line under the title: how many are coming, and whether there is room.
 *
 * Null when the event is uncapped and nobody has said anything yet — a row
 * reading "0 going" on a newly published event tells the member nothing and
 * makes it look unwanted.
 */
export function describeCapacity(
  capacity: EventCapacity | null | undefined
): string | null {
  if (!capacity) {
    return null;
  }

  const going = capacity.goingCount ?? 0;
  const attending = going === 1 ? '1 going' : `${going} going`;

  if (capacity.isFull) {
    // The waitlist count is the useful half here: "full" alone leaves somebody
    // wondering whether joining the queue is pointless.
    return capacity.waitlistCount > 0
      ? `${attending} · Full, ${capacity.waitlistCount} waiting`
      : `${attending} · Full`;
  }

  if (capacity.maximum == null) {
    return going === 0 ? null : attending;
  }

  const remaining = capacity.remainingPlaces;

  if (remaining == null) {
    return `${attending} of ${capacity.maximum}`;
  }

  // Below a handful, the number left is the thing that makes somebody decide.
  // Above it, the total is more use than a countdown that reads as pressure.
  return remaining <= 5
    ? `${attending} · ${remaining === 1 ? '1 place left' : `${remaining} places left`}`
    : `${attending} of ${capacity.maximum}`;
}

/**
 * What an organiser sees at the door, or null where there is nothing to show.
 *
 * `checkedInCount` is served only to organisers, so its absence is the ordinary
 * case for everybody else rather than a missing figure.
 */
export function describeDoor(
  capacity: EventCapacity | null | undefined
): string | null {
  if (!capacity || capacity.checkedInCount == null) {
    return null;
  }

  return `${capacity.checkedInCount} of ${capacity.goingCount} checked in`;
}
