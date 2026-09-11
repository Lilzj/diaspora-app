// ─────────────────────────────────────────────────────────────────────────────
// Closing a community, read the way the platform reads it — 12 Sep 2026
//
// Written before any of this ran against a real server, for the reason the
// automation builder gave us: it saved and tested for weeks while every single
// write was a `400` at model binding, and the screen showed a result anyway. The
// lesson was that a screen's success state proves nothing about a request body.
//
// So these tests do not check that the functions "work". They check the two
// things a green screen cannot:
//
//   **What goes out.** Every field of every write body, against the request
//   records in `CommunityProgrammeRequests.cs`, and every path against the route
//   table in `CommunityEndpoints.cs` — including the two `:guid` constraints,
//   which turn a wrong id into a 404 that looks like "no such request".
//
//   **What comes back.** The mappers, fed the responses the module actually
//   declares — and fed the absences, because `requestedByName` is nullable and
//   the failure mode is a screen printing a GUID where a person's name belongs.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  decideCommunityDeletion,
  decideCommunityOwnership,
  fetchCapabilities,
  fetchCommunityDeletionRequest,
  fetchCommunityDeletionRequests,
  fetchMyCommunityOwnershipOffers,
  offerCommunityOwnership,
  requestCommunityDeletion,
  withdrawCommunityDeletion,
  withdrawCommunityOwnershipOffer,
} from '../community-entity-api';

// ── The platform's side ─────────────────────────────────────────────────────

/** Every field each request record declares, and what it binds as. */
const RECORDS = {
  RequestCommunityDeletionRequest: { reason: 'string' },
  DecideCommunityDeletionRequest: { approve: 'bool', reason: 'string' },
  OfferCommunityOwnershipRequest: { userId: 'guid', message: 'string' },
  DecideCommunityOwnershipRequest: { accept: 'bool', reason: 'string' },
} as const satisfies Record<string, Record<string, string>>;

type RecordName = keyof typeof RECORDS;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everything about `body` the platform would refuse or silently ignore. */
function problemsWith(body: unknown, record: RecordName): string[] {
  if (body === null || body === undefined) return [];
  if (typeof body !== 'object' || Array.isArray(body)) return ['body is not an object'];

  const fields = RECORDS[record] as Record<string, string>;

  return Object.entries(body as Record<string, unknown>).flatMap(([field, value]) => {
    if (!(field in fields)) return [`body.${field} is not read by the platform`];
    if (value === null || value === undefined) return [];

    switch (fields[field]) {
      case 'string':
        return typeof value === 'string' ? [] : [`body.${field} is ${typeof value}, not a string`];
      case 'bool':
        return typeof value === 'boolean' ? [] : [`body.${field} is not a boolean`];
      case 'guid':
        return typeof value === 'string' && GUID.test(value)
          ? []
          : [`body.${field} ${JSON.stringify(value)} is not a Guid`];
      default:
        return [`body.${field} has no declared kind`];
    }
  });
}

// ── Fixtures shaped like the module's responses ─────────────────────────────

const COMMUNITY = 'c2f0b0f4-2d2f-4c1a-9a2f-7c4a2d1e9b01';
const OWNER = '0dc73f0c-7efa-4b60-8706-7a60eacace65';
const HEIR = '4b2e1f9a-8c3d-4a71-b0e5-1f6d9c8a7b32';
const REQUEST_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const TRANSFER_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';

function deletionWire(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    communityId: COMMUNITY,
    communityName: 'Nigerians in Manchester',
    communitySlug: 'nigerians-in-manchester',
    status: 'AwaitingReview',
    reason: 'I can no longer moderate this on my own.',
    requestedBy: OWNER,
    requestedByName: 'Kemi Adeyemi',
    requestedAt: '2026-09-12T09:00:00+00:00',
    effectiveAt: '2026-10-12T09:00:00+00:00',
    reviewedAt: null,
    decisionReason: null,
    ...overrides,
  };
}

function offerWire(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSFER_ID,
    communityId: COMMUNITY,
    communityName: 'Nigerians in Manchester',
    communitySlug: 'nigerians-in-manchester',
    status: 'Offered',
    offeredBy: OWNER,
    offeredByName: 'Kemi Adeyemi',
    offeredTo: HEIR,
    offeredToName: 'David Mensah',
    message: 'You have been running this for a year already.',
    offeredAt: '2026-09-12T09:00:00+00:00',
    expiresAt: '2026-09-26T09:00:00+00:00',
    declineReason: null,
    ...overrides,
  };
}

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient);
});

afterEach(() => {
  api.restore();
});

function lastRequest(method: 'post' | 'delete' | 'get') {
  const calls = api.history[method];
  return calls[calls.length - 1];
}

function lastBody(method: 'post' | 'delete'): unknown {
  const data = lastRequest(method)?.data;
  return data === undefined ? undefined : JSON.parse(data as string);
}

// ═════════════════════════════════════════════════════════════════════════════
// WHAT GOES OUT
// ═════════════════════════════════════════════════════════════════════════════

describe('the bodies the platform is sent', () => {
  it('asks to close a community with nothing but the reason', async () => {
    api.onPost(/\/communities\/.+\/deletion-request/).reply(200, { data: deletionWire() });

    await requestCommunityDeletion('nigerians-in-manchester', {
      reason: 'I can no longer moderate this on my own.',
    });

    expect(problemsWith(lastBody('post'), 'RequestCommunityDeletionRequest')).toEqual([]);
    expect(lastRequest('post').url).toBe('/communities/nigerians-in-manchester/deletion-request');
  });

  it('sends a decision the platform can bind, approval and refusal alike', async () => {
    api.onPost(/\/communities\/deletion-requests\/.+\/decision/).reply(200, {
      data: deletionWire({ status: 'Approved' }),
    });

    await decideCommunityDeletion(REQUEST_ID, true);
    expect(problemsWith(lastBody('post'), 'DecideCommunityDeletionRequest')).toEqual([]);
    // `approve` is a bool on the platform and there is no default that means
    // "yes" — a missing field would read as a refusal with no reason.
    expect((lastBody('post') as { approve: unknown }).approve).toBe(true);

    await decideCommunityDeletion(REQUEST_ID, false, 'This community has 4,300 members.');
    expect(problemsWith(lastBody('post'), 'DecideCommunityDeletionRequest')).toEqual([]);
    expect(lastBody('post')).toMatchObject({
      approve: false,
      reason: 'This community has 4,300 members.',
    });
  });

  it('offers a community with a member id the route can bind as a Guid', async () => {
    api.onPost(/\/communities\/.+\/ownership-offers/).reply(200, { data: offerWire() });

    await offerCommunityOwnership('nigerians-in-manchester', {
      userId: HEIR,
      message: 'You have been running this for a year already.',
    });

    expect(problemsWith(lastBody('post'), 'OfferCommunityOwnershipRequest')).toEqual([]);
    expect(lastRequest('post').url).toBe('/communities/nigerians-in-manchester/ownership-offers');
  });

  it('answers an offer with the accept flag, never an empty body', async () => {
    api.onPost(/\/communities\/ownership-offers\/.+\/decision/).reply(200, {
      data: offerWire({ status: 'Accepted' }),
    });

    await decideCommunityOwnership(TRANSFER_ID, true);
    expect(problemsWith(lastBody('post'), 'DecideCommunityOwnershipRequest')).toEqual([]);
    expect((lastBody('post') as { accept: unknown }).accept).toBe(true);

    await decideCommunityOwnership(TRANSFER_ID, false, 'I do not have the time.');
    expect(lastBody('post')).toMatchObject({ accept: false, reason: 'I do not have the time.' });
  });

  it('withdraws by the same path it asked on', async () => {
    api.onDelete(/\/communities\/.+\/deletion-request/).reply(200, {
      data: deletionWire({ status: 'Withdrawn' }),
    });
    api.onDelete(/\/communities\/.+\/ownership-offers/).reply(200, {
      data: offerWire({ status: 'Withdrawn' }),
    });

    await withdrawCommunityDeletion('nigerians-in-manchester');
    expect(lastRequest('delete').url).toBe('/communities/nigerians-in-manchester/deletion-request');

    await withdrawCommunityOwnershipOffer('nigerians-in-manchester');
    expect(lastRequest('delete').url).toBe('/communities/nigerians-in-manchester/ownership-offers');
  });

  it('puts ids in the path the way the `:guid` route constraints require', async () => {
    api.onPost(/\/communities\/deletion-requests\/.+\/decision/).reply(200, { data: deletionWire() });
    api.onPost(/\/communities\/ownership-offers\/.+\/decision/).reply(200, { data: offerWire() });

    await decideCommunityDeletion(REQUEST_ID, true);
    const deletionSegment = lastRequest('post').url!.split('/')[3];
    expect(deletionSegment).toMatch(GUID);

    await decideCommunityOwnership(TRANSFER_ID, true);
    const transferSegment = lastRequest('post').url!.split('/')[3];
    expect(transferSegment).toMatch(GUID);
  });

  it('escapes a slug rather than letting it change the route', async () => {
    api.onPost(/\/communities\/.+\/deletion-request/).reply(200, { data: deletionWire() });

    await requestCommunityDeletion('a/b', { reason: 'x'.repeat(20) });

    // A slug with a slash in it would otherwise post to a route that is not the
    // one the caller named — and `/communities/a/b/deletion-request` binds `a`.
    expect(lastRequest('post').url).toBe('/communities/a%2Fb/deletion-request');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WHAT COMES BACK
// ═════════════════════════════════════════════════════════════════════════════

describe('what the module answers with', () => {
  it('reads a request in full', async () => {
    api.onGet(/\/communities\/.+\/deletion-request/).reply(200, { data: deletionWire() });

    const request = await fetchCommunityDeletionRequest('nigerians-in-manchester');

    expect(request).toMatchObject({
      id: REQUEST_ID,
      status: 'AwaitingReview',
      communitySlug: 'nigerians-in-manchester',
      requestedByName: 'Kemi Adeyemi',
      effectiveAt: '2026-10-12T09:00:00+00:00',
    });
  });

  it('answers null where no community was ever asked to close', async () => {
    // The route answers with no request rather than a 404 — a screen that threw
    // here would show an error on every community nobody has asked to close.
    api.onGet(/\/communities\/.+\/deletion-request/).reply(200, { data: null });

    await expect(fetchCommunityDeletionRequest('nigerians-in-manchester')).resolves.toBeNull();
  });

  it('leaves an unnamed requester unnamed rather than printing the id', async () => {
    api.onGet(/\/communities\/.+\/deletion-request/).reply(200, {
      data: deletionWire({ requestedByName: null }),
    });

    const request = await fetchCommunityDeletionRequest('nigerians-in-manchester');

    expect(request!.requestedByName).toBeNull();
    // The screen falls back to "its owner". What it must never do is what the
    // organisation members screen still does: show the GUID.
    expect(request!.requestedByName).not.toBe(OWNER);
  });

  it('reads the review queue as a page, and an absent page as empty', async () => {
    api.onGet('/communities/deletion-requests').reply(200, {
      data: { items: [deletionWire()], nextCursor: 'c2', hasMore: true },
    });

    const page = await fetchCommunityDeletionRequests('AwaitingReview');
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe('c2');
    expect(page.hasMore).toBe(true);
    expect(lastRequest('get').params).toMatchObject({ status: 'AwaitingReview' });

    api.resetHandlers();
    api.onGet('/communities/deletion-requests').reply(200, { data: { items: null } });

    const empty = await fetchCommunityDeletionRequests();
    expect(empty.items).toEqual([]);
    expect(empty.hasMore).toBe(false);
  });

  it('reads the offers made to this member', async () => {
    api.onGet('/communities/ownership-offers/mine').reply(200, { data: [offerWire()] });

    const offers = await fetchMyCommunityOwnershipOffers();

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      id: TRANSFER_ID,
      status: 'Offered',
      offeredByName: 'Kemi Adeyemi',
      expiresAt: '2026-09-26T09:00:00+00:00',
    });
  });

  it('treats an absent offer list as none, not as a crash', async () => {
    api.onGet('/communities/ownership-offers/mine').reply(200, { data: null });

    await expect(fetchMyCommunityOwnershipOffers()).resolves.toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WHO IS OFFERED THE DOOR
// ═════════════════════════════════════════════════════════════════════════════

describe('the two new capabilities', () => {
  it('reads them from the server when it reports them', async () => {
    api.onGet(/\/communities\/.+\/capabilities/).reply(200, {
      data: {
        communityId: COMMUNITY,
        canRequestDeletion: true,
        canTransferOwnership: true,
      },
    });

    const capabilities = await fetchCapabilities(COMMUNITY);

    expect(capabilities.canRequestDeletion).toBe(true);
    expect(capabilities.canTransferOwnership).toBe(true);
  });

  it('is false where the server said nothing — absence is refusal', async () => {
    // An older deployment that does not serve these fields must not be read as
    // granting them. This is the exact shape of the disclosure defects: a
    // missing capability read as `undefined` and then as truthy somewhere else.
    api.onGet(/\/communities\/.+\/capabilities/).reply(200, {
      data: { communityId: COMMUNITY },
    });

    const capabilities = await fetchCapabilities(COMMUNITY);

    expect(capabilities.canRequestDeletion).toBe(false);
    expect(capabilities.canTransferOwnership).toBe(false);
  });
});
