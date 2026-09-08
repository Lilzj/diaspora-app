// ─────────────────────────────────────────────────────────────────────────────
// How full an event is
//
// ── The gap these close ─────────────────────────────────────────────────────
//
// `EventResponse.Capacity` is a **required** field on the wire, carrying seven
// values with every event: maximum, going, interested, waitlisted, checked in,
// remaining and `isFull`. The client's `Event` type modelled none of them.
//
// So a member saw no sign an event was filling up and none that it was already
// full. They tapped "Going", the server answered `Waitlisted`, and the screen
// told them afterwards they were fourth in a queue. Every fact needed to say so
// beforehand arrived with the event and was dropped on the floor.
//
// ── The rule that matters most ──────────────────────────────────────────────
//
// **`isFull` is read, never derived.** `goingCount >= maximum` looks equivalent
// and is not: the server counts under rules this client does not have, an
// organiser can lower a maximum below the current count, and an uncapped event
// has no maximum to compare against. A client computing its own answer would
// eventually offer a place the RSVP route then refused — the screen and the
// server disagreeing about somebody's seat.
// ─────────────────────────────────────────────────────────────────────────────

import {
  describeCapacity,
  describeDoor,
  isEventFull,
  rsvpActionLabel,
} from '../event-capacity';
import type { EventCapacity } from '@/types/community-life';

function capacity(overrides: Partial<EventCapacity> = {}): EventCapacity {
  return {
    maximum: 50,
    goingCount: 10,
    interestedCount: 3,
    waitlistCount: 0,
    checkedInCount: null,
    remainingPlaces: 40,
    isFull: false,
    ...overrides,
  };
}

describe('whether an event is full', () => {
  it('takes the server’s answer', () => {
    expect(isEventFull(capacity({ isFull: true }))).toBe(true);
    expect(isEventFull(capacity({ isFull: false }))).toBe(false);
  });

  it('does not derive fullness from the counts', () => {
    // The whole rule. Ten going against a maximum of ten looks full and the
    // server says it is not — perhaps a place was released, perhaps the
    // maximum counts something else. The server decides.
    expect(isEventFull(capacity({ goingCount: 10, maximum: 10, isFull: false })))
      .toBe(false);

    // And the reverse: fewer going than the maximum, and the server says full.
    // An organiser who lowered the cap produces exactly this.
    expect(isEventFull(capacity({ goingCount: 2, maximum: 50, isFull: true })))
      .toBe(true);
  });

  it('treats an event with no capacity at all as not full', () => {
    // A cached event stored before this field was read has none, and refusing
    // to RSVP to it would be worse than letting the server answer.
    expect(isEventFull(null)).toBe(false);
    expect(isEventFull(undefined)).toBe(false);
  });
});

describe('what the RSVP button says', () => {
  it('offers the waitlist by name when the event is full', () => {
    // The defect, in one assertion. The route already answers Waitlisted and
    // the screen already handles it — but only after the tap.
    expect(rsvpActionLabel('Going', null, capacity({ isFull: true })))
      .toBe('Join the waitlist');
  });

  it('says Going when there is room', () => {
    expect(rsvpActionLabel('Going', null, capacity())).toBe('Going');
  });

  it('keeps the plain label for somebody who already holds a place', () => {
    // Offering a waitlist to somebody who is going would read as though they
    // had lost their place.
    expect(rsvpActionLabel('Going', 'Going', capacity({ isFull: true })))
      .toBe('Going');
  });

  it('keeps it for somebody already on the waitlist', () => {
    // They are in the queue. "Join the waitlist" would invite them to do again
    // what they have done.
    expect(rsvpActionLabel('Going', 'Waitlisted', capacity({ isFull: true })))
      .toBe('Going');
  });

  it('never changes the Interested label', () => {
    // Interest is not a seat, so a full event does not change what it means.
    expect(rsvpActionLabel('Interested', null, capacity({ isFull: true })))
      .toBe('Interested');
  });
});

describe('the line under the title', () => {
  it('names the places left when there are few', () => {
    expect(describeCapacity(capacity({ goingCount: 47, remainingPlaces: 3 })))
      .toBe('47 going · 3 places left');
  });

  it('says the singular properly', () => {
    expect(describeCapacity(capacity({ goingCount: 49, remainingPlaces: 1 })))
      .toBe('49 going · 1 place left');
    expect(describeCapacity(capacity({ goingCount: 1, remainingPlaces: 49 })))
      .toBe('1 going of 50');
  });

  it('shows the total rather than a countdown when there is plenty of room', () => {
    // "40 places left" on a half-empty event reads as pressure rather than
    // information.
    expect(describeCapacity(capacity({ goingCount: 10, remainingPlaces: 40 })))
      .toBe('10 going of 50');
  });

  it('says full, and how many are waiting', () => {
    // "Full" alone leaves somebody wondering whether joining the queue is
    // pointless.
    expect(describeCapacity(capacity({ goingCount: 50, isFull: true, waitlistCount: 4 })))
      .toBe('50 going · Full, 4 waiting');
  });

  it('says full without a number when nobody is waiting', () => {
    expect(describeCapacity(capacity({ goingCount: 50, isFull: true, waitlistCount: 0 })))
      .toBe('50 going · Full');
  });

  it('says nothing about an uncapped event nobody has joined', () => {
    // "0 going" on a newly published event tells the member nothing and makes
    // it look unwanted.
    expect(describeCapacity(capacity({ maximum: null, goingCount: 0, remainingPlaces: null })))
      .toBeNull();
  });

  it('counts an uncapped event once somebody is coming', () => {
    expect(describeCapacity(capacity({ maximum: null, goingCount: 12, remainingPlaces: null })))
      .toBe('12 going');
  });

  it('says nothing at all when the event carries no capacity', () => {
    expect(describeCapacity(null)).toBeNull();
    expect(describeCapacity(undefined)).toBeNull();
  });
});

describe('what an organiser sees at the door', () => {
  it('reports the live figure when the server sends one', () => {
    expect(describeDoor(capacity({ checkedInCount: 32, goingCount: 50 })))
      .toBe('32 of 50 checked in');
  });

  it('says nothing to everybody else', () => {
    // `checkedInCount` is served only to organisers, so its absence is the
    // ordinary case rather than a missing figure to apologise for.
    expect(describeDoor(capacity({ checkedInCount: null }))).toBeNull();
    expect(describeDoor(null)).toBeNull();
  });

  it('reports zero checked in rather than hiding it', () => {
    // The door is open and nobody has arrived. That is a real answer an
    // organiser wants, and `null` would swallow it.
    expect(describeDoor(capacity({ checkedInCount: 0, goingCount: 20 })))
      .toBe('0 of 20 checked in');
  });
});
