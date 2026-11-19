// ─────────────────────────────────────────────────────────────────────────────
// What I said I would go to
//
// `GET /rsvps/mine` has been served since the module shipped and **no client
// function, hook or screen ever called it**. A member could RSVP to an event
// and then had nowhere to see what they had committed to — the commitment
// existed on the server and nowhere a person could look.
//
// ── The join ────────────────────────────────────────────────────────────────
//
// The route answers two arrays side by side: the RSVPs, and summaries of the
// events they are for. That keeps a page of ten to one request instead of
// eleven, and it makes joining them the client's job. This is the one place it
// happens, because a join written twice is a join that eventually disagrees
// with itself.
// ─────────────────────────────────────────────────────────────────────────────

import type { EventSummary, MyRsvp, MyRsvpPage, RsvpRecord } from '@/types/community-life';

/**
 * Pairs each RSVP with its event.
 *
 * **A missing event does not drop the row.** The server builds both arrays from
 * one query so they should always agree, and if they ever do not, the honest
 * answer is an RSVP whose event could not be loaded — not a silently shorter
 * list. Somebody's commitment vanishing without trace is the worse failure, and
 * it is the one nobody notices.
 *
 * Order follows the RSVPs, which is the order the server chose.
 */
export function joinRsvpsToEvents(page: MyRsvpPage | null | undefined): MyRsvp[] {
  if (!page) {
    return [];
  }

  const byId = new Map<string, EventSummary>();

  for (const event of page.events ?? []) {
    if (event?.eventId) {
      byId.set(event.eventId, event);
    }
  }

  return (page.items ?? []).map((rsvp) => ({
    rsvp,
    event: byId.get(rsvp.eventId) ?? null,
  }));
}

/**
 * Whether an RSVP is one the member still holds.
 *
 * `Cancelled` and `NoShow` are history rather than plans, and `Attended` is a
 * thing that has happened. What belongs on a "going to" list is what has not
 * happened yet and has not been called off.
 */
export function isLiveRsvp(rsvp: RsvpRecord): boolean {
  return rsvp.status === 'Going'
    || rsvp.status === 'Interested'
    || rsvp.status === 'Waitlisted';
}

/**
 * What the row says about this RSVP, in the member's words.
 *
 * **`Waitlisted` names the position when there is one.** "Waitlisted" alone
 * leaves somebody unable to judge whether to make other plans; "4th on the
 * waitlist" is the same fact and answers the question they actually have.
 */
export function describeRsvp(rsvp: RsvpRecord): string {
  switch (rsvp.status) {
    case 'Going':
      return rsvp.partySize > 1 ? `Going · ${rsvp.partySize} people` : 'Going';

    case 'Interested':
      return 'Interested';

    case 'Waitlisted':
      return rsvp.waitlistPosition != null
        ? `${ordinal(rsvp.waitlistPosition)} on the waitlist`
        : 'On the waitlist';

    case 'CheckedIn':
      return 'Checked in';

    case 'Attended':
      return 'You went';

    case 'Cancelled':
      return 'Cancelled';

    case 'NoShow':
      // The platform's word, not the member's. Nobody needs to be told they
      // were a "no show" on their own list.
      return 'Missed';

    default:
      return rsvp.status;
  }
}

/** 1st, 2nd, 3rd, 4th. Teens are all "th", which the naive rule gets wrong. */
function ordinal(value: number): string {
  const lastTwo = value % 100;

  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${value}th`;
  }

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}
