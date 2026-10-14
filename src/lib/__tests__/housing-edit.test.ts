// ─────────────────────────────────────────────────────────────────────────────
// Editing a home after it is listed (14 Oct 2026).
//
// Pins the three things the edit screen depends on and nothing on screen can
// show: the PATCH carries only what changed (never the currency, never an
// unchanged field), a cleared deposit goes out as 0 because null means "leave
// it", and photos are attached with a role and detached one reference at a time.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  applyHousingPhotoChanges,
  diffHousingEdit,
  housingEditPhotos,
  removeHousingListingPhoto,
  addHousingListingPhoto,
  setHousingAvailableFrom,
  toHousingEditValues,
  updateHousingListing,
  type HousingListingWire,
} from '../housing-listings-api';

const LISTING_ID = '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const COVER = '11111111-1111-4111-8111-111111111111';
const GALLERY = '22222222-2222-4222-8222-222222222222';
const NEW_PHOTO = '33333333-3333-4333-8333-333333333333';

const wire = (over: Partial<HousingListingWire> = {}): HousingListingWire => ({
  id: LISTING_ID,
  title: 'Two-bed flat near the market',
  summary: 'Bright, quiet, close to the bus.',
  description: 'Second floor.',
  revision: 4,
  leaseType: 'FixedTerm',
  furnishedStatus: 'Furnished',
  price: {
    isDisclosed: true,
    amount: 25000,
    currencyCode: 'MUR',
    period: 'PerMonth',
    depositAmount: 50000,
    isNegotiable: false,
    utilitiesIncluded: false,
    internetIncluded: true,
  },
  capacity: { bedrooms: 2, bathrooms: 1 },
  availability: { availableFrom: '2026-11-01T00:00:00+00:00' },
  media: [
    { mediaId: COVER, role: 'Cover', order: 0 },
    { mediaId: GALLERY, role: 'Gallery', order: 0 },
    { mediaId: COVER, role: 'Gallery', order: 1 },
  ],
  coverImage: { mediaId: COVER, role: 'Cover' },
  ...over,
});

describe('housing edit', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('sends only the changed fields, with the revision, and never the currency', async () => {
    const before = toHousingEditValues(wire());
    const after = { ...before, rentAmount: 27000, utilitiesIncluded: true, title: '  Two-bed flat near the market ' };

    mock.onPatch(`/housing/listings/${LISTING_ID}`).reply(200, { data: {} });

    await updateHousingListing(LISTING_ID, { ...diffHousingEdit(before, after), baseRevision: 4 });

    expect(mock.history.patch).toHaveLength(1);
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({
      rentAmount: 27000,
      utilitiesIncluded: true,
      baseRevision: 4,
    });
  });

  it('sends nothing at all when nothing changed', async () => {
    const before = toHousingEditValues(wire());

    await updateHousingListing(LISTING_ID, { ...diffHousingEdit(before, { ...before }), baseRevision: 4 });

    expect(mock.history.patch).toHaveLength(0);
  });

  it('sends a cleared deposit as 0, because null would mean "leave it"', () => {
    const before = toHousingEditValues(wire());
    expect(diffHousingEdit(before, { ...before, depositAmount: null })).toEqual({ depositAmount: 0 });
  });

  it('sends served furnishing and lease keys when they change, and treats Unspecified as none', () => {
    const before = toHousingEditValues(wire({ leaseType: 'Unspecified' }));
    expect(before.leaseType).toBe('');
    expect(diffHousingEdit(before, { ...before, leaseType: 'MonthToMonth', furnishedStatus: 'PartlyFurnished' })).toEqual({
      leaseType: 'MonthToMonth',
      furnishedStatus: 'PartlyFurnished',
    });
  });

  it('attaches a photo with its role', async () => {
    mock.onPost(`/housing/listings/${LISTING_ID}/media`).reply(200, { data: {} });

    await addHousingListingPhoto(LISTING_ID, NEW_PHOTO, 'Gallery');

    expect(mock.history.post).toHaveLength(1);
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ mediaId: NEW_PHOTO, role: 'Gallery' });
  });

  it('detaches a photo at its own path, once per reference', async () => {
    mock.onDelete(`/housing/listings/${LISTING_ID}/media/${GALLERY}`).reply(204);

    await removeHousingListingPhoto(LISTING_ID, GALLERY);

    expect(mock.history.delete.map((request) => request.url)).toEqual([
      `/housing/listings/${LISTING_ID}/media/${GALLERY}`,
    ]);
  });

  it('adds before it removes, promotes the new cover, and clears every reference of a removed photo', async () => {
    const existing = housingEditPhotos(wire());
    expect(existing).toEqual([
      { mediaId: COVER, isCover: true, references: 2 },
      { mediaId: GALLERY, isCover: false, references: 1 },
    ]);

    const order: string[] = [];
    mock.onPost(`/housing/listings/${LISTING_ID}/media`).reply((config) => {
      order.push(`POST ${JSON.parse(config.data).mediaId} ${JSON.parse(config.data).role}`);
      return [200, { data: {} }];
    });
    mock.onDelete(new RegExp(`/housing/listings/${LISTING_ID}/media/.+`)).reply((config) => {
      order.push(`DELETE ${config.url?.split('/').pop()}`);
      return [204];
    });

    await applyHousingPhotoChanges(LISTING_ID, {
      existing,
      removed: [COVER],
      added: [NEW_PHOTO],
      coverId: GALLERY,
    });

    expect(order).toEqual([
      `POST ${NEW_PHOTO} Gallery`,
      `POST ${GALLERY} Cover`,
      `DELETE ${COVER}`,
      `DELETE ${COVER}`,
    ]);
  });

  it('puts the move-in date on the availability route as midnight UTC', async () => {
    mock.onPut(`/housing/listings/${LISTING_ID}/availability`).reply(200, { data: {} });

    await setHousingAvailableFrom(LISTING_ID, '2026-12-01');

    expect(JSON.parse(mock.history.put[0].data)).toEqual({ availableFrom: '2026-12-01T00:00:00Z' });
  });
});
