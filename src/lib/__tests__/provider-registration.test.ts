// ─────────────────────────────────────────────────────────────────────────────
// Registering a provider — the outcome contract (UAT-002)
//
// The defect this guards against is not "the request was malformed". It is
// **the screen said something that was not true**: `/post` reported
// *"Listing Published! Your business is now live on Diaspora"* having made no
// network call at all, and cleared the member's draft on the way.
//
// So these tests are about what `createAndPublishProvider` *claims*:
//
//   · it never reports `published` unless `PUT .../status` succeeded;
//   · a failure after creation is `draft-only` with a reason, not a thrown
//     error — the provider exists by then and the member must be told so;
//   · a failure *of* creation throws, because then nothing exists and the
//     screen must not offer a listing to open;
//   · the steps that did not land are named, so the screen can say which.
//
// `backend-request-binding-drift.test.ts` covers the other half — that the
// payloads bind against the real route inventory. The two together are what the
// old flow had neither of.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import { createAndPublishProvider, registerProvider } from '@/lib/provider-registration-api';

const PROVIDER_ID = '9f1c1f6e-6c1a-4a3f-9a4a-2f2c9a1b0001';

const envelope = <T,>(data: T) => ({ data });

const MINIMAL = {
  name: 'Mama Afrika Kitchen',
  providerType: 'Business',
  category: 'Food & Restaurants',
};

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
});

/** Creation succeeds; the caller decides what happens to everything after it. */
function givenProviderCreates() {
  // The server's own field is `providerId` (ProviderResponse). This mock said
  // `id` — the same mistake the client made — so it passed while every real
  // registration sent its next calls to /providers/undefined (13 Oct 2026).
  mock.onPost('/providers').reply(201, envelope({ providerId: PROVIDER_ID, status: 'Draft' }));
}

describe('createAndPublishProvider', () => {
  it('reports published only when the status call succeeded', async () => {
    givenProviderCreates();
    mock.onPut(`/providers/${PROVIDER_ID}/status`).reply(200, envelope({}));

    const outcome = await createAndPublishProvider({ provider: MINIMAL });

    expect(outcome).toEqual({
      kind: 'published',
      providerId: PROVIDER_ID,
      incomplete: [],
    });
  });

  it('publishes with Active, because ProviderStatus has no Published member', async () => {
    givenProviderCreates();
    mock.onPut(`/providers/${PROVIDER_ID}/status`).reply(200, envelope({}));

    await createAndPublishProvider({ provider: MINIMAL });

    const statusCall = mock.history.put.find((call) => call.url?.endsWith('/status'));

    // Sending the word the UI uses — "Published" — is refused by the server.
    // The enum is Draft, PendingReview, Active, Paused, Suspended, Closed,
    // Archived.
    expect(JSON.parse(statusCall!.data)).toEqual({ status: 'Active' });
  });

  it.each([
    [409, 'incomplete'],
    [422, 'incomplete'],
    [403, 'refused'],
    [500, 'unknown'],
  ])('maps a %s from publish to draft-only "%s"', async (status, reason) => {
    givenProviderCreates();
    mock.onPut(`/providers/${PROVIDER_ID}/status`).reply(status as number);

    const outcome = await createAndPublishProvider({ provider: MINIMAL });

    // The distinction matters: incomplete is the member's to finish, refused is
    // not worth retrying, unknown is. One message for all three would leave a
    // member with an invisible listing and no idea which.
    expect(outcome).toMatchObject({ kind: 'draft-only', providerId: PROVIDER_ID, reason });
  });

  it('throws when creation itself fails, because then nothing exists', async () => {
    mock.onPost('/providers').reply(500);

    // Deliberately not an outcome. A `draft-only` here would send the member to
    // a success screen offering to open a draft that was never created — which
    // is the original defect with a different noun.
    await expect(createAndPublishProvider({ provider: MINIMAL })).rejects.toBeDefined();
  });

  it('still publishes when a service fails, and names the step', async () => {
    givenProviderCreates();
    mock.onPost(`/providers/${PROVIDER_ID}/services`).reply(500);
    mock.onPut(`/providers/${PROVIDER_ID}/status`).reply(200, envelope({}));

    const outcome = await createAndPublishProvider({
      provider: MINIMAL,
      services: [{ name: 'Jollof Rice & Chicken' }],
    });

    // The listing is live and useful without its menu. Failing the whole
    // publication over one service would be a worse outcome for the member than
    // a live listing they can add a dish to.
    expect(outcome).toEqual({
      kind: 'published',
      providerId: PROVIDER_ID,
      incomplete: ['services'],
    });
  });

  it('names every step that did not land', async () => {
    givenProviderCreates();
    mock.onPost(`/providers/${PROVIDER_ID}/services`).reply(500);
    mock.onPut(`/providers/${PROVIDER_ID}/operating-hours`).reply(500);
    mock.onPut(`/providers/${PROVIDER_ID}/status`).reply(200, envelope({}));

    const outcome = await createAndPublishProvider({
      provider: MINIMAL,
      services: [{ name: 'Jollof Rice & Chicken' }],
      hours: [{ dayOfWeek: 'Monday', isClosed: true, windows: [] }],
    });

    expect(outcome.incomplete).toEqual(['services', 'hours']);
  });

  it('sends the whole week in one call, so a schedule cannot half-save', async () => {
    givenProviderCreates();
    mock.onPut(`/providers/${PROVIDER_ID}/operating-hours`).reply(200, envelope({}));
    mock.onPut(`/providers/${PROVIDER_ID}/status`).reply(200, envelope({}));

    await createAndPublishProvider({
      provider: MINIMAL,
      hours: [
        { dayOfWeek: 'Monday', isClosed: false, windows: [{ opensAt: '09:00', closesAt: '18:00' }] },
        { dayOfWeek: 'Sunday', isClosed: true, windows: [] },
      ],
    });

    const hoursCalls = mock.history.put.filter((call) => call.url?.endsWith('/operating-hours'));

    expect(hoursCalls).toHaveLength(1);
    expect(JSON.parse(hoursCalls[0].data).hours).toHaveLength(2);
  });

  it('skips the optional calls entirely when there is nothing to send', async () => {
    givenProviderCreates();
    mock.onPut(`/providers/${PROVIDER_ID}/status`).reply(200, envelope({}));

    await createAndPublishProvider({ provider: MINIMAL, services: [], hours: [], photos: [] });

    expect(mock.history.post.filter((call) => call.url?.endsWith('/services'))).toHaveLength(0);
    expect(mock.history.put.filter((call) => call.url?.endsWith('/operating-hours'))).toHaveLength(0);
  });
});

describe('the create response', () => {
  it('refuses to continue without the providerId rather than calling /providers/undefined', async () => {
    mock.onPost('/providers').reply(201, envelope({ id: PROVIDER_ID, status: 'Draft' }));

    await expect(registerProvider({ name: 'X', providerType: 'Business', category: 'hair-beauty' })).rejects.toThrow();
  });
});
