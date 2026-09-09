// ─────────────────────────────────────────────────────────────────────────────
// Who is putting an event on
//
// The crash these pin: `EventDetailScreen` read `event.host.type` against an
// object the platform never sends, and opening any real event took the whole
// application to the launcher. Mock events do carry a nested host, so every
// development build worked; the deployment had no events, so nobody could open
// one. An empty table hid a process-killing crash.
// ─────────────────────────────────────────────────────────────────────────────

import { eventHost, eventHostOrgId, eventOrganiserUserId } from '../event-host';
import type { Event } from '@/types/community-life';

/** A personal event: no organisation, a host name, a real organiser. */
const personal = {
  hostName: 'Joshua Gbogodor',
  organizerUserId: 'user-1',
  organizationId: null,
  organizationName: null,
  isOrganizerVerified: true,
} as Partial<Event>;

/** An organisation's event. The organiser is still a person. */
const organisational = {
  hostName: null,
  organizerUserId: 'user-1',
  organizationId: 'org-9',
  organizationName: 'East London Nigerian Union',
  isOrganizerVerified: true,
} as Partial<Event>;

describe('reading a host off the flat wire fields', () => {
  it('names a person hosting under their own name', () => {
    const host = eventHost(personal);

    expect(host?.name).toBe('Joshua Gbogodor');
    expect(host?.type).toBe('User');
    expect(host?.id).toBe('user-1');
    expect(host?.isVerified).toBe(true);
  });

  it('names the organisation when one owns the event', () => {
    const host = eventHost(organisational);

    expect(host?.name).toBe('East London Nigerian Union');
    expect(host?.type).toBe('Organization');
    expect(host?.id).toBe('org-9');
  });

  it('decides the type from who owns it, not from a field saying so', () => {
    // There is no `hostType` on the wire. An organisation id is the whole of
    // the evidence.
    expect(eventHost({ ...personal, organizationId: 'org-9' })?.type).toBe('Organization');
  });

  it('does not throw on an event with no host information at all', () => {
    // The literal crash. Not an empty section — the process died.
    expect(() => eventHost({})).not.toThrow();
    expect(eventHost({})).toBeNull();
    expect(eventHost(null)).toBeNull();
    expect(eventHost(undefined)).toBeNull();
  });

  it('prefers a nested host when one is there, for mocks and cached events', () => {
    const host = eventHost({
      host: { id: 'org-3', name: 'Mock Union', type: 'Organization', isVerified: true },
      hostName: 'Somebody Else',
    } as Partial<Event>);

    expect(host?.name).toBe('Mock Union');
  });
});

describe('where tapping the host goes', () => {
  it('opens the organisation that owns the event', () => {
    expect(eventHostOrgId(organisational)).toBe('org-9');
  });

  it('goes nowhere for a person, rather than to an organisation that is not theirs', () => {
    // `/community-life/org/{userId}` would open somebody else's organisation
    // or nothing — the dead tap this codebase has already been bitten by.
    expect(eventHostOrgId(personal)).toBeNull();
  });

  it('goes nowhere when there is no host', () => {
    expect(eventHostOrgId({})).toBeNull();
  });
});

describe('who a message to the organiser reaches', () => {
  it('is the person, even when an organisation hosts', () => {
    // **The assertion that matters.** The screen feeds this straight into
    // `openOrCreateConversation({ recipientId })`. The old code passed
    // `host.id`, which is the *organisation's* id on an organisation's event —
    // a conversation addressed to an organisation id in a user id's place.
    expect(eventOrganiserUserId(organisational)).toBe('user-1');
    expect(eventHost(organisational)?.id).toBe('org-9');
  });

  it('is the person on a personal event', () => {
    expect(eventOrganiserUserId(personal)).toBe('user-1');
  });

  it('falls back to a nested host only when that host is a person', () => {
    expect(eventOrganiserUserId({
      host: { id: 'u-7', name: 'A Person', type: 'User', isVerified: false },
    } as Partial<Event>)).toBe('u-7');

    expect(eventOrganiserUserId({
      host: { id: 'org-3', name: 'An Org', type: 'Organization', isVerified: false },
    } as Partial<Event>)).toBeNull();
  });

  it('is null when there is nobody to write to', () => {
    // The screen shows "Organizer contact is not available in-app." rather
    // than opening a conversation addressed to nothing.
    expect(eventOrganiserUserId({})).toBeNull();
    expect(eventOrganiserUserId(null)).toBeNull();
  });
});
