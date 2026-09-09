// ─────────────────────────────────────────────────────────────────────────────
// Who is putting an event on
//
// ── The crash ───────────────────────────────────────────────────────────────
//
// `EventDetailScreen` read `event.host.type`, `event.host.name`, `event.host.id`
// and `event.host.isVerified`. **The server sends no `host` object.**
// `EventResponse` carries `HostName`, `OrganizerUserId`, `OrganizationId`,
// `OrganizationName` and `IsOrganizerVerified` — five flat fields, no nesting.
//
// So opening any real event threw `TypeError: Cannot read property 'type' of
// undefined` and killed the process. Not a blank section: the whole application
// went to the launcher.
//
// It survived because the mock events in `mocks/community-life-data.ts` *do*
// carry a `host` object, so every development build worked — and because the
// deployment had **zero events**, so nobody could open one. An empty table hid
// a process-killing crash, which is the third time that has happened here.
//
// ── Why a presenter rather than optional chaining ───────────────────────────
//
// `event.host?.type` would have stopped the crash and rendered an empty host
// section on every event on the platform, which is a quieter version of the
// same bug. The fields the server sends are enough to say who is hosting; they
// just have to be read.
// ─────────────────────────────────────────────────────────────────────────────

import type { Event, EventHost } from '@/types/community-life';

/**
 * The host as the screen needs it, from whatever shape the event arrived in.
 *
 * Prefers the flat fields the server sends and falls back to a nested `host`,
 * which is what the mock catalogue and any cached event still hold. Returns
 * null only when there is genuinely nothing to show, so a caller renders no
 * host section rather than an empty one.
 */
export function eventHost(event: Partial<Event> | null | undefined): EventHost | null {
  if (!event) {
    return null;
  }

  // A nested host is either a mock or an older cached event. Trust it as given.
  if (event.host?.name) {
    return event.host;
  }

  const organizationId = event.organizationId ?? null;
  const name = event.hostName ?? event.organizationName ?? null;

  if (!name) {
    return null;
  }

  return {
    // An organisation's page is the organisation's; a person's event points at
    // the person. Which one this is follows from whether an organisation owns
    // it, not from a field the server sends saying so.
    id: organizationId ?? event.organizerUserId ?? '',
    name,
    type: organizationId ? 'Organization' : 'User',
    isVerified: event.isOrganizerVerified ?? false,
  };
}

/**
 * The organisation whose page tapping the host should open, or null.
 *
 * An organisation has a page. A person hosting under their own name has an
 * organisation id of null, and routing them to `/org/{userId}` would open
 * somebody else's organisation or nothing at all — the dead tap this codebase
 * has already been bitten by.
 */
export function eventHostOrgId(event: Partial<Event> | null | undefined): string | null {
  const host = eventHost(event);

  if (!host || host.type !== 'Organization' || !host.id) {
    return null;
  }

  return host.id;
}

/**
 * The **user** to start a conversation with, or null when there is nobody.
 *
 * Deliberately not `eventHost().id`. That is the organisation's id when an
 * organisation hosts, and the screen feeds this straight into
 * `openOrCreateConversation({ recipientId })` — which would have opened a
 * conversation addressed to an organisation id in the user id's place. The
 * organiser is always a person even when they host on an organisation's behalf.
 */
export function eventOrganiserUserId(event: Partial<Event> | null | undefined): string | null {
  if (!event) {
    return null;
  }

  if (event.organizerUserId) {
    return event.organizerUserId;
  }

  // A mock or cached event carries only the nested host, whose id is a user id
  // only when a person is hosting.
  return event.host?.type === 'User' ? event.host.id || null : null;
}
