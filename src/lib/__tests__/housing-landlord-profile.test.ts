// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the housing landlord precondition
//
// The housing twin of DEFECT-008, found by the E2E completion phase and fixed
// alongside it. `HousingAuthorizationService` resolves a landlord before any
// listing write and answers `403 housing.not-landlord`; `POST /housing/landlords`
// is published and was called by no surface in this application.
//
// Every test asserts on the requests made, because — as with the marketplace —
// the screen was already behaving as though it had worked.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import {
  createAndPublishListing,
  ensureLandlordProfile,
  isNotLandlordError,
} from '../housing-listings-api';

let api: MockAdapter;

const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'test' } });
const problem = (code: string, detail: string) => ({ code, detail, title: 'Error', status: 403 });

const NOT_LANDLORD = problem(
  'housing.not-landlord',
  'Set up a landlord profile before listing a property.'
);

const CREATED = { id: '01a01b39-8265-70a9-a056-80f3e844a54c', status: 'Draft' };

beforeEach(() => {
  api = new MockAdapter(apiClient);
});

afterEach(() => {
  api.restore();
});

describe('the landlord profile no surface ever created', () => {
  it('creates a landlord profile when the member has none', async () => {
    api.onGet('/housing/dashboard').reply(403, NOT_LANDLORD);
    api.onPost('/housing/landlords').reply(201, envelope({ landlordId: 'l-1' }));

    await ensureLandlordProfile({ displayName: 'Adaeze Nwosu', countryCode: 'NG' });

    const created = api.history.post.filter((r) => r.url === '/housing/landlords');
    expect(created).toHaveLength(1);
    expect(JSON.parse(created[0].data)).toEqual({
      displayName: 'Adaeze Nwosu',
      countryCode: 'NG',
      kind: 'Individual',
    });
  });

  it('does not create a second profile for a member who already lets', async () => {
    api.onGet('/housing/dashboard').reply(200, envelope({ landlord: { landlordId: 'l-1' } }));
    api.onPost('/housing/landlords').reply(201, envelope({ landlordId: 'l-2' }));

    await ensureLandlordProfile({ displayName: 'Adaeze Nwosu', countryCode: 'NG' });

    expect(api.history.post.filter((r) => r.url === '/housing/landlords')).toHaveLength(0);
  });

  it('treats a 409 on creation as the profile already existing', async () => {
    api.onGet('/housing/dashboard').reply(403, NOT_LANDLORD);
    api.onPost('/housing/landlords').reply(409, problem('housing.landlord-exists', 'Already a landlord.'));

    await expect(
      ensureLandlordProfile({ displayName: 'Adaeze Nwosu', countryCode: 'NG' })
    ).resolves.toBeUndefined();
  });

  /** A 500 is not evidence of absence; answering `false` would create a duplicate. */
  it('does not treat an unrelated failure as "no profile"', async () => {
    api.onGet('/housing/dashboard').reply(500);
    api.onPost('/housing/landlords').reply(201, envelope({ landlordId: 'l-1' }));

    await expect(
      ensureLandlordProfile({ displayName: 'Adaeze Nwosu', countryCode: 'NG' })
    ).rejects.toBeDefined();
    expect(api.history.post.filter((r) => r.url === '/housing/landlords')).toHaveLength(0);
  });

  it('recognises the refusal a listing write returns without a profile', () => {
    expect(isNotLandlordError({ response: { data: NOT_LANDLORD } })).toBe(true);
    expect(isNotLandlordError({ response: { data: problem('housing.listing.not-publishable', '…') } })).toBe(false);
  });
});

describe('the full sequence from the create screen', () => {
  it('ensures the profile, then creates, then publishes — in that order', async () => {
    api.onGet('/housing/dashboard').reply(403, NOT_LANDLORD);
    api.onPost('/housing/landlords').reply(201, envelope({ landlordId: 'l-1' }));
    api.onPost('/housing/listings').reply(201, envelope(CREATED));
    api.onPost(`/housing/listings/${CREATED.id}/publish`).reply(200, envelope({}));

    const outcome = await createAndPublishListing(
      { title: 'Two-bedroom flat in Yaba' },
      { displayName: 'Adaeze Nwosu', countryCode: 'NG' }
    );

    expect(outcome).toEqual({ kind: 'published', listingId: CREATED.id });
    expect(api.history.post.map((r) => r.url)).toEqual([
      '/housing/landlords',
      '/housing/listings',
      `/housing/listings/${CREATED.id}/publish`,
    ]);
  });

  /**
   * The landlord argument is optional so every existing caller and test keeps
   * working. Without it the function must behave exactly as it did before.
   */
  it('skips the profile step entirely when no landlord is supplied', async () => {
    api.onPost('/housing/listings').reply(201, envelope(CREATED));
    api.onPost(`/housing/listings/${CREATED.id}/publish`).reply(200, envelope({}));

    await createAndPublishListing({ title: 'x' });

    expect(api.history.get.filter((r) => r.url === '/housing/dashboard')).toHaveLength(0);
    expect(api.history.post.map((r) => r.url)).toEqual([
      '/housing/listings',
      `/housing/listings/${CREATED.id}/publish`,
    ]);
  });

  /** A profile failure is a creation failure: the member has nothing. */
  it('throws without creating a listing when the profile cannot be opened', async () => {
    api.onGet('/housing/dashboard').reply(403, NOT_LANDLORD);
    api.onPost('/housing/landlords').reply(400, problem('Platform.Validation.Failed', 'A display name is required.'));
    api.onPost('/housing/listings').reply(201, envelope(CREATED));

    await expect(
      createAndPublishListing({ title: 'x' }, { displayName: '', countryCode: 'NG' })
    ).rejects.toBeDefined();

    expect(api.history.post.filter((r) => r.url === '/housing/listings')).toHaveLength(0);
  });
});
