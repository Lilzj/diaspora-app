// ─────────────────────────────────────────────────────────────────────────────
// What I said I would go to
//
// ── The gap ─────────────────────────────────────────────────────────────────
//
// `GET /rsvps/mine` has been served since the CommunityLife module shipped and
// **no client function, hook or screen ever called it**. A member could RSVP to
// an event and then had nowhere to see what they had committed to. There was no
// way to learn you were fourth on a waitlist except by reopening the event and
// remembering that you had.
//
// ── Why the join is tested and not just written ─────────────────────────────
//
// The route answers two arrays side by side — the RSVPs, and summaries of their
// events — so a page of ten costs one request rather than eleven. Joining them
// is the client's job, and a join is the kind of code that fails by producing a
// *shorter* list rather than an error. Nobody notices a commitment that quietly
// stopped being displayed.
// ─────────────────────────────────────────────────────────────────────────────

import { describeRsvp, isLiveRsvp, joinRsvpsToEvents } from '../my-rsvps';
import type { EventSummary, MyRsvpPage, RsvpRecord } from '@/types/community-life';

function rsvp(overrides: Partial<RsvpRecord> = {}): RsvpRecord {
  return {
    rsvpId: 'r1',
    eventId: 'e1',
    attendeeUserId: 'u1',
    status: 'Going',
    partySize: 1,
    declineReason: 'None',
    respondedAt: '2026-09-01T10:00:00Z',
    revision: 1,
    ...overrides,
  };
}

function event(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    eventId: 'e1',
    title: 'Repatriation clinic',
    slug: 'repatriation-clinic',
    categoryKey: 'advice',
    summary: 'An evening of practical help.',
    startsAt: '2026-10-01T18:00:00Z',
    endsAt: '2026-10-01T20:00:00Z',
    timeZoneId: 'Europe/London',
    attendanceMode: 'InPerson',
    location: { cityName: 'London', areaName: 'Peckham', addressLine: '1 Rye Lane' },
    isFree: true,
    isFamilyFriendly: true,
    ...overrides,
  };
}

function page(overrides: Partial<MyRsvpPage> = {}): MyRsvpPage {
  return { items: [rsvp()], events: [event()], hasMore: false, ...overrides };
}

describe('joining RSVPs to their events', () => {
  it('pairs each RSVP with the event it is for', () => {
    const [entry] = joinRsvpsToEvents(page());

    expect(entry.rsvp.rsvpId).toBe('r1');
    expect(entry.event?.title).toBe('Repatriation clinic');
  });

  it('keeps a row whose event is missing rather than dropping it', () => {
    // **The assertion that matters.** A join that silently shortens the list
    // makes somebody's commitment disappear, and nobody notices a row that was
    // never rendered. An RSVP with no event is a real RSVP.
    const entries = joinRsvpsToEvents(page({ items: [rsvp()], events: [] }));

    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBeNull();
  });

  it('keeps every RSVP when only some events came back', () => {
    const entries = joinRsvpsToEvents(page({
      items: [rsvp({ rsvpId: 'r1', eventId: 'e1' }), rsvp({ rsvpId: 'r2', eventId: 'e2' })],
      events: [event({ eventId: 'e2', title: 'Second' })],
    }));

    expect(entries.map((entry) => entry.rsvp.rsvpId)).toEqual(['r1', 'r2']);
    expect(entries[0].event).toBeNull();
    expect(entries[1].event?.title).toBe('Second');
  });

  it('follows the order the server chose', () => {
    // The server decides what "next" means — soonest first, most recently
    // answered, whatever it is. Re-sorting here would override a decision made
    // with more information.
    const entries = joinRsvpsToEvents(page({
      items: [rsvp({ rsvpId: 'b', eventId: 'e2' }), rsvp({ rsvpId: 'a', eventId: 'e1' })],
      events: [event({ eventId: 'e1' }), event({ eventId: 'e2' })],
    }));

    expect(entries.map((entry) => entry.rsvp.rsvpId)).toEqual(['b', 'a']);
  });

  it('lets two RSVPs share one event', () => {
    // A repeating event's dates can produce this, and a join keyed on a Map
    // must not consume the entry for the first reader.
    const entries = joinRsvpsToEvents(page({
      items: [rsvp({ rsvpId: 'r1' }), rsvp({ rsvpId: 'r2' })],
      events: [event()],
    }));

    expect(entries[0].event?.eventId).toBe('e1');
    expect(entries[1].event?.eventId).toBe('e1');
  });

  it('answers empty for nothing at all', () => {
    expect(joinRsvpsToEvents(null)).toEqual([]);
    expect(joinRsvpsToEvents(undefined)).toEqual([]);
    expect(joinRsvpsToEvents(page({ items: [], events: [] }))).toEqual([]);
  });
});

describe('which RSVPs are still plans', () => {
  it.each([['Going'], ['Interested'], ['Waitlisted']] as const)('counts %s', (status) => {
    expect(isLiveRsvp(rsvp({ status }))).toBe(true);
  });

  it.each([['Cancelled'], ['NoShow'], ['Attended']] as const)('does not count %s', (status) => {
    // History rather than plans. `Attended` especially: it already happened, so
    // showing it as something upcoming would be wrong twice over.
    expect(isLiveRsvp(rsvp({ status }))).toBe(false);
  });
});

describe('what the row says', () => {
  it('names the waitlist position rather than just the waitlist', () => {
    // "Waitlisted" alone leaves somebody unable to judge whether to make other
    // plans. The position is the same fact and answers the real question.
    expect(describeRsvp(rsvp({ status: 'Waitlisted', waitlistPosition: 4 })))
      .toBe('4th on the waitlist');
  });

  it('gets the awkward ordinals right', () => {
    expect(describeRsvp(rsvp({ status: 'Waitlisted', waitlistPosition: 1 })))
      .toBe('1st on the waitlist');
    expect(describeRsvp(rsvp({ status: 'Waitlisted', waitlistPosition: 2 })))
      .toBe('2nd on the waitlist');
    expect(describeRsvp(rsvp({ status: 'Waitlisted', waitlistPosition: 3 })))
      .toBe('3rd on the waitlist');

    // The teens are all "th", which the naive rule gets wrong three times.
    expect(describeRsvp(rsvp({ status: 'Waitlisted', waitlistPosition: 11 })))
      .toBe('11th on the waitlist');
    expect(describeRsvp(rsvp({ status: 'Waitlisted', waitlistPosition: 12 })))
      .toBe('12th on the waitlist');
    expect(describeRsvp(rsvp({ status: 'Waitlisted', waitlistPosition: 13 })))
      .toBe('13th on the waitlist');

    expect(describeRsvp(rsvp({ status: 'Waitlisted', waitlistPosition: 21 })))
      .toBe('21st on the waitlist');
  });

  it('falls back when the server sends no position', () => {
    expect(describeRsvp(rsvp({ status: 'Waitlisted', waitlistPosition: null })))
      .toBe('On the waitlist');
  });

  it('names the party size only when there is one to name', () => {
    expect(describeRsvp(rsvp({ status: 'Going', partySize: 1 }))).toBe('Going');
    expect(describeRsvp(rsvp({ status: 'Going', partySize: 3 }))).toBe('Going · 3 people');
  });

  it('does not call somebody a no-show on their own list', () => {
    // The platform's word is NoShow. Reading it back to the member in those
    // terms is a judgement the screen does not need to make.
    expect(describeRsvp(rsvp({ status: 'NoShow' }))).toBe('Missed');
  });
});
