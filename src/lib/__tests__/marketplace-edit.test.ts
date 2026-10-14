// ─────────────────────────────────────────────────────────────────────────────
// Editing a marketplace listing — 14 Oct 2026
//
// `PUT /marketplace/listings/{id}` replaces the listing: a field the request
// leaves out is a field the server sets to nothing. These tests pin the two
// things the edit screen depends on:
//
//   * the replacement carries every field the member did not touch, exactly as
//     the listing was read — the brand, the area, the delivery radius, the
//     visibility, the revision — so editing a title blanks nothing;
//   * photo changes reach the media routes by the right paths, and a listing
//     whose cover was removed is given another.
//
// The assertions are on the requests sent, because a replace that blanks a
// field looks exactly like a successful save on the screen that sent it.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import {
  addMarketplaceListingPhoto,
  applyMarketplaceListingPhotoChanges,
  deriveListingSummary,
  fetchMarketplaceListingForEdit,
  removeMarketplaceListingPhoto,
  toUpdateRequest,
  updateMarketplaceListing,
  type MarketplaceListingForEdit,
} from '../marketplace-listings-api';

const ID = '01a01b2b-6366-7875-a231-4d587b064772';
const COVER = '11111111-1111-4111-8111-111111111111';
const GALLERY = '22222222-2222-4222-8222-222222222222';
const NEW_PHOTO = '33333333-3333-4333-8333-333333333333';
const ANOTHER_PHOTO = '55555555-5555-4555-8555-555555555555';
const AREA = '44444444-4444-4444-8444-444444444444';

/** `ListingResponse` as the server sends it, with every optional field filled. */
const LISTING: MarketplaceListingForEdit = {
  listingId: ID,
  title: 'Samsung fridge',
  description: 'Two years old, works perfectly.',
  summary: 'A seller-written summary.',
  listingType: 'FixedPrice',
  condition: 'Good',
  status: 'Active',
  visibility: 'Public',
  contactPreference: 'InApp',
  revision: 7,
  canManage: true,
  price: {
    isDisclosed: true,
    amount: 12000,
    currency: 'MUR',
    isNegotiable: true,
    isFree: false,
    minimumOffer: 10000,
  },
  location: {
    countryCode: 'MU',
    regionName: 'Plaines Wilhems',
    cityName: 'Quatre Bornes',
    neighbourhood: 'Sodnac',
    areaId: AREA,
    displayName: 'Sodnac, Quatre Bornes',
  },
  fulfillment: {
    offersPickup: true,
    offersDelivery: true,
    offersShipping: false,
    isDigital: false,
    deliveryRadiusKm: 15,
    notes: 'Evenings only',
  },
  product: { brand: 'Samsung', model: 'RT38', sku: 'SKU-1', year: 2023 },
  media: [
    { mediaId: COVER, role: 'Cover', order: 0 },
    { mediaId: GALLERY, role: 'Gallery', order: 0 },
  ],
};

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient);
});

afterEach(() => {
  api.restore();
});

describe('the replacement sends back what the member did not change', () => {
  it('carries every unchanged field exactly as the listing was read', async () => {
    api.onGet(`/marketplace/listings/${ID}`).reply(200, { data: LISTING });
    api.onPut(`/marketplace/listings/${ID}`).reply(200, { data: LISTING });

    const read = await fetchMarketplaceListingForEdit(ID);
    await updateMarketplaceListing(ID, toUpdateRequest(read, { title: 'Samsung fridge, 380 L' }));

    expect(api.history.put).toHaveLength(1);
    expect(JSON.parse(api.history.put[0].data)).toEqual({
      title: 'Samsung fridge, 380 L',
      description: 'Two years old, works perfectly.',
      summary: 'A seller-written summary.',
      condition: 'Good',
      price: 12000,
      currency: 'MUR',
      isNegotiable: true,
      minimumOffer: 10000,
      countryCode: 'MU',
      regionName: 'Plaines Wilhems',
      cityName: 'Quatre Bornes',
      neighbourhood: 'Sodnac',
      areaId: AREA,
      offersPickup: true,
      offersDelivery: true,
      offersShipping: false,
      isDigital: false,
      deliveryRadiusKm: 15,
      fulfillmentNotes: 'Evenings only',
      brand: 'Samsung',
      model: 'RT38',
      sku: 'SKU-1',
      year: 2023,
      contactPreference: 'InApp',
      visibility: 'Public',
      baseRevision: 7,
    });
  });

  it('applies the edits the screen offers and nothing else', () => {
    const body = toUpdateRequest(LISTING, {
      price: 9000,
      isNegotiable: false,
      condition: 'Fair',
      offersShipping: true,
      offersDelivery: false,
    });

    expect(body).toMatchObject({
      price: 9000,
      currency: 'MUR',
      isNegotiable: false,
      condition: 'Fair',
      offersPickup: true,
      offersDelivery: false,
      offersShipping: true,
      brand: 'Samsung',
      areaId: AREA,
    });
    // A floor on a fixed price means nothing, and the server drops it anyway.
    expect(body.minimumOffer).toBeUndefined();
  });

  it("keeps the listing's own currency rather than the member's", () => {
    const body = toUpdateRequest(LISTING, { price: 500, fallbackCurrency: 'GBP' });
    expect(body.currency).toBe('MUR');
  });

  it('takes the member currency only for a listing that never had one', () => {
    const unpriced: MarketplaceListingForEdit = {
      ...LISTING,
      price: { isDisclosed: false, amount: null, currency: null, isNegotiable: false, isFree: false },
    };

    expect(toUpdateRequest(unpriced, {}).price).toBeUndefined();
    expect(toUpdateRequest(unpriced, {}).currency).toBeUndefined();
    expect(toUpdateRequest(unpriced, { price: 300, fallbackCurrency: 'MUR' })).toMatchObject({
      price: 300,
      currency: 'MUR',
    });
  });

  it('lets a derived summary follow a new description, and keeps a written one', () => {
    const derived: MarketplaceListingForEdit = {
      ...LISTING,
      summary: deriveListingSummary(LISTING.description),
    };

    expect(toUpdateRequest(derived, { description: 'Now three years old.' }).summary).toBeUndefined();
    expect(toUpdateRequest(derived, { title: 'Fridge' }).summary).toBe(derived.summary);
    expect(toUpdateRequest(LISTING, { description: 'Now three years old.' }).summary).toBe(
      'A seller-written summary.'
    );
  });
});

describe('photos', () => {
  it('attaches and detaches by the listing media routes', async () => {
    api.onPost(`/marketplace/listings/${ID}/media`).reply(200, { data: null });
    api.onDelete(`/marketplace/listings/${ID}/media/${GALLERY}`).reply(200, { data: null });

    await addMarketplaceListingPhoto(ID, NEW_PHOTO);
    await removeMarketplaceListingPhoto(ID, GALLERY);

    expect(api.history.post).toHaveLength(1);
    expect(JSON.parse(api.history.post[0].data)).toEqual({ mediaId: NEW_PHOTO, role: 'Gallery' });
    expect(api.history.delete).toHaveLength(1);
    expect(api.history.delete[0].url).toBe(`/marketplace/listings/${ID}/media/${GALLERY}`);
    // No role: "remove this photo" detaches it from every role it holds.
    expect(api.history.delete[0].params).toBeUndefined();
  });

  it('removes first, adds next, and promotes a remaining photo when the cover goes', async () => {
    api.onPost(`/marketplace/listings/${ID}/media`).reply(200, { data: null });
    api.onDelete(new RegExp(`/marketplace/listings/${ID}/media/.+`)).reply(200, { data: null });

    const failures = await applyMarketplaceListingPhotoChanges(ID, LISTING.media, {
      remove: [COVER],
      add: [NEW_PHOTO],
    });

    expect(failures).toEqual([]);

    expect(api.history.delete.map((request) => [request.url, request.params?.role])).toEqual([
      [`/marketplace/listings/${ID}/media/${COVER}`, undefined],
      // Moved, not copied: the gallery reference of the promoted photo goes.
      [`/marketplace/listings/${ID}/media/${GALLERY}`, 'Gallery'],
    ]);
    expect(api.history.post.map((request) => JSON.parse(request.data))).toEqual([
      { mediaId: NEW_PHOTO, role: 'Gallery' },
      { mediaId: GALLERY, role: 'Cover' },
    ]);
  });

  it('makes a new photo the cover of a listing left with none', async () => {
    api.onPost(`/marketplace/listings/${ID}/media`).reply(200, { data: null });
    api.onDelete(new RegExp(`/marketplace/listings/${ID}/media/.+`)).reply(200, { data: null });

    await applyMarketplaceListingPhotoChanges(ID, [{ mediaId: COVER, role: 'Cover', order: 0 }], {
      remove: [COVER],
      add: [NEW_PHOTO],
    });

    expect(api.history.post.map((request) => JSON.parse(request.data))).toEqual([
      { mediaId: NEW_PHOTO, role: 'Cover' },
    ]);
  });

  it("reports the server's sentence for a refused change and carries on", async () => {
    api
      .onPost(`/marketplace/listings/${ID}/media`)
      .replyOnce(400, { code: 'marketplace.media.limit', detail: 'A listing can hold 24 media items.' })
      .onPost(`/marketplace/listings/${ID}/media`)
      .reply(200, { data: null });

    const failures = await applyMarketplaceListingPhotoChanges(ID, LISTING.media, {
      remove: [],
      add: [NEW_PHOTO, ANOTHER_PHOTO],
    });

    expect(failures).toEqual(['A listing can hold 24 media items.']);
    expect(api.history.post).toHaveLength(2);
  });
});
