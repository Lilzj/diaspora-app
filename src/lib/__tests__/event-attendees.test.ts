// ─────────────────────────────────────────────────────────────────────────────
// Who turned up
//
// The attendees screen was a gap adapter written against an imagined contract:
// it called `/community-life/registrations/attendees` and
// `/community-life/registrations/{id}/check-in`, and the platform serves
// `/events/{id}/attendees` and `/events/{id}/check-ins`. It could not have
// worked, and the gap-preview flag — off in every real build — is why nobody
// found out.
//
// Every assertion below is written against the *platform's* shape, and three
// of them pin defects that only appeared once the screen was opened against
// real data for the first time.
// ─────────────────────────────────────────────────────────────────────────────

import { toAttendee, type AttendeeWire } from '../event-attendees';

function wire(overrides: Partial<AttendeeWire> = {}): AttendeeWire {
  return {
    rsvpId: 'r-1',
    attendeeUserId: 'u-1',
    displayName: 'David Mensah',
    status: 'Going',
    partySize: 1,
    respondedAt: '2026-09-09T18:00:00Z',
    checkedInAt: null,
    ...overrides,
  };
}

describe('the names the wire uses', () => {
  it('reads attendeeUserId, which is what the platform calls it', () => {
    expect(toAttendee(wire()).userId).toBe('u-1');
  });

  it('keeps the rsvp id, because that is what a check-in names', () => {
    // The platform takes the event in the path and the RSVP in the body. The
    // adapter assumed a registration id in the path, which is why its call
    // could never have landed.
    expect(toAttendee(wire()).rsvpId).toBe('r-1');
  });

  it('reads respondedAt as when they registered', () => {
    expect(toAttendee(wire()).registeredAt).toBe('2026-09-09T18:00:00Z');
  });
});

describe('the status', () => {
  it('calls somebody who is going Registered', () => {
    // **Seen on the device.** The wire says `Going`; the screen's vocabulary
    // says `Registered`. Passed straight through, the organiser of an event
    // with one person going saw that person marked "NOT REGISTERED".
    expect(toAttendee(wire({ status: 'Going' })).status).toBe('Registered');
  });

  it.each([
    ['Waitlisted'],
    ['CheckedIn'],
    ['Attended'],
    ['NoShow'],
    ['Cancelled'],
  ] as const)('passes %s through, because both lists use that word', (status) => {
    expect(toAttendee(wire({ status })).status).toBe(status);
  });

  it('does not promote Interested to Registered', () => {
    // Saying you might come is not saying you will, and an organiser counting
    // chairs needs those apart.
    expect(toAttendee(wire({ status: 'Interested' })).status).toBe('NotRegistered');
  });

  it('does not guess at a word it has never seen', () => {
    expect(toAttendee(wire({ status: 'Teleported' })).status).toBe('NotRegistered');
  });
});

describe('how many people are actually coming', () => {
  it('does not count the attendee as their own guest', () => {
    // **Seen on the device.** `partySize` includes the attendee, and the
    // screen renders `guestCount` as "+ N guest" — so somebody coming alone
    // was shown as bringing one.
    expect(toAttendee(wire({ partySize: 1 })).guestCount).toBe(0);
  });

  it('counts the rest of the party as guests', () => {
    expect(toAttendee(wire({ partySize: 4 })).guestCount).toBe(3);
  });

  it('never goes negative on a party size the platform should not send', () => {
    expect(toAttendee(wire({ partySize: 0 })).guestCount).toBe(0);
  });
});

describe('the name', () => {
  it('uses the one the platform resolved', () => {
    expect(toAttendee(wire()).displayName).toBe('David Mensah');
  });

  it('is empty rather than invented when the platform could not resolve it', () => {
    // A row with no name is a row the platform could not resolve. Calling that
    // person "Unknown" would be inventing somebody.
    expect(toAttendee(wire({ displayName: null })).displayName).toBe('');
    expect(toAttendee(wire({ displayName: '  ' })).displayName).toBe('');
  });
});

describe('whether the door is open', () => {
  // **Read from the platform, never derived.** The rule is
  // `checkInOpensAt ?? startsAt - 1h` through `endsAt + 12h`. A client that
  // reimplemented it would drift from it, which is how a Check in button came
  // to be offered for an event a week away and refused every time it was
  // pressed.
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };

  const source = (...segments: string[]) =>
    fs
      .readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')
      .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ')
      .replace(new RegExp('//[^\\n]*', 'g'), ' ');

  it('takes the answer off the page rather than computing one', () => {
    const adapter = source('lib', 'event-attendees.ts');

    expect(adapter).toMatch(/acceptsCheckIn: Boolean\(page\.acceptsCheckIn\)/);
    // No arithmetic on the schedule anywhere in the client's attendee path.
    expect(adapter).not.toMatch(/startsAt[\s\S]{0,40}getTime\(\)/);
  });

  it('gates the button on it', () => {
    const screen = source('app', 'community-life', 'attendees.tsx');

    expect(screen).toMatch(/acceptsCheckIn \?/);
  });

  it('says when the door opens rather than only that it is shut', () => {
    const screen = source('app', 'community-life', 'attendees.tsx');

    expect(screen).toContain('Check-in opens');
  });
});

describe('an occurrence is an event', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };

  const screen = fs
    .readFileSync(
      path.join(process.cwd(), 'src', 'app', 'community-life', 'attendees.tsx'),
      'utf8'
    )
    .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ')
    .replace(new RegExp('//[^\\n]*', 'g'), ' ');

  it('reads both through the same route', () => {
    // A series occurrence *is* a `CommunityEvent` carrying a `SeriesId`, so its
    // identifier is an event identifier. The second path was an imagined
    // contract for a case the first already covered.
    expect(screen).toMatch(/const subjectId = eventId \?\? occurrenceId;/);
  });

  it('no longer calls the gap adapter that had no route behind it', () => {
    expect(screen).not.toMatch(/useAttendees\b/);
    expect(screen).not.toMatch(/useCheckInAttendee\b/);
  });

  it('does not declare a gap for something the platform serves', () => {
    expect(screen).not.toContain('eventRegistration');
  });
});
