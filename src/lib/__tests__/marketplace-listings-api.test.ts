// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Marketplace listing lifecycle and card contract
//
// Regression cover for the three defects the Final Runtime Gap Closure phase
// found by driving media → create → publish → discovery against the real
// backend, a real PostgreSQL and a second authenticated account.
//
//   **DEFECT-008** — no member could create a listing at all. Every listing
//   write answers `403 marketplace.not-seller` until a seller profile exists,
//   and no surface in this application had ever called `POST /marketplace/sellers`.
//
//   **DEFECT-009** — the search response was cast to the client's view model
//   rather than mapped to it. The server sends `listingId`, a `price` object,
//   `coverMediaId` and `publishedAt`; the card reads `id`, `price`, `coverImage`
//   and `createdAt`. Tapping any listing navigated to `/marketplace/undefined`.
//
//   **DEFECT-011** — `POST /marketplace/listings` creates a **Draft**, and the
//   screen said "Listing Published! Your item is now visible" without ever
//   calling the publish route.
//
// Every test here asserts on the requests made and on the mapping, because in
// all three cases the screen was already behaving as though it had worked.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import {
  createAndPublishMarketplaceListing,
  ensureSellerProfile,
  isNotPublishableError,
  isNotSellerError,
  listingIdOf,
  problemDetail,
  toMarketplaceListing,
  toMarketplaceListings,
} from '../marketplace-listings-api';
import type { MarketplaceListingCardResponse } from '@/types/marketplace';

let api: MockAdapter;

const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'test' } });

/** A problem document in the shape the platform actually returns. */
const problem = (code: string, detail: string) => ({ code, detail, title: 'Error', status: 400 });

/** The created-listing response, keyed as the server keys it. */
const CREATED = { listingId: '01a01b2b-6366-7875-a231-4d587b064772', status: 'Draft' };

beforeEach(() => {
  api = new MockAdapter(apiClient);
});

afterEach(() => {
  api.restore();
});

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT-008 — the seller profile
// ═════════════════════════════════════════════════════════════════════════════

describe('DEFECT-008 — the seller profile no surface ever created', () => {
  it('creates a seller profile when the member has none', async () => {
    api.onGet('/marketplace/sellers/me/dashboard').reply(403, problem('marketplace.not-seller', 'Set up a seller profile before doing that.'));
    api.onPost('/marketplace/sellers').reply(201, envelope({ sellerId: 's-1' }));

    await ensureSellerProfile({ displayName: 'Ngozi Okafor', countryCode: 'NG' });

    const created = api.history.post.filter((r) => r.url === '/marketplace/sellers');
    expect(created).toHaveLength(1);
    expect(JSON.parse(created[0].data)).toEqual({
      displayName: 'Ngozi Okafor',
      countryCode: 'NG',
      kind: 'Individual',
    });
  });

  it('does not create a second profile for a member who already sells', async () => {
    api.onGet('/marketplace/sellers/me/dashboard').reply(200, envelope({ seller: { sellerId: 's-1' } }));
    api.onPost('/marketplace/sellers').reply(201, envelope({ sellerId: 's-2' }));

    await ensureSellerProfile({ displayName: 'Ngozi Okafor', countryCode: 'NG' });

    expect(api.history.post.filter((r) => r.url === '/marketplace/sellers')).toHaveLength(0);
  });

  /** Two create screens racing must not surface an error about a profile nobody asked about. */
  it('treats a 409 on creation as the profile already existing', async () => {
    api.onGet('/marketplace/sellers/me/dashboard').reply(403, problem('marketplace.not-seller', 'Set up a seller profile before doing that.'));
    api.onPost('/marketplace/sellers').reply(409, problem('marketplace.seller-exists', 'You already have a seller profile.'));

    await expect(ensureSellerProfile({ displayName: 'Ngozi Okafor', countryCode: 'NG' })).resolves.toBeUndefined();
  });

  /**
   * A 500 is not evidence that the member has no profile. Answering "none" would
   * make the caller create a duplicate, so the failure is propagated instead.
   */
  it('does not treat an unrelated failure as "no profile"', async () => {
    api.onGet('/marketplace/sellers/me/dashboard').reply(500);
    api.onPost('/marketplace/sellers').reply(201, envelope({ sellerId: 's-1' }));

    await expect(ensureSellerProfile({ displayName: 'Ngozi Okafor', countryCode: 'NG' })).rejects.toBeDefined();
    expect(api.history.post.filter((r) => r.url === '/marketplace/sellers')).toHaveLength(0);
  });

  it('recognises the refusal a listing write returns without a profile', () => {
    expect(isNotSellerError({ response: { data: problem('marketplace.not-seller', 'Set up a seller profile before doing that.') } })).toBe(true);
    expect(isNotSellerError({ response: { data: problem('marketplace.listing.not-publishable', '…') } })).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT-011 — create is a draft; publish is a separate route
// ═════════════════════════════════════════════════════════════════════════════

describe('DEFECT-011 — create makes a draft, and publish is a second call', () => {
  const asSeller = () => {
    api.onGet('/marketplace/sellers/me/dashboard').reply(200, envelope({ seller: { sellerId: 's-1' } }));
  };

  it('creates and then publishes, in that order', async () => {
    asSeller();
    api.onPost('/marketplace/listings').reply(201, envelope(CREATED));
    api.onPost(`/marketplace/listings/${CREATED.listingId}/publish`).reply(200, envelope({}));

    const outcome = await createAndPublishMarketplaceListing({ title: 'Aso Oke wrapper' }, { displayName: 'Ngozi', countryCode: 'NG' });

    expect(outcome).toEqual({ kind: 'published', listingId: CREATED.listingId });
    expect(api.history.post.map((r) => r.url)).toEqual([
      '/marketplace/listings',
      `/marketplace/listings/${CREATED.listingId}/publish`,
    ]);
  });

  it('asks for immediate activation, because the member pressed publish', async () => {
    asSeller();
    api.onPost('/marketplace/listings').reply(201, envelope(CREATED));
    api.onPost(`/marketplace/listings/${CREATED.listingId}/publish`).reply(200, envelope({}));

    await createAndPublishMarketplaceListing({ title: 'x' }, { displayName: 'Ngozi', countryCode: 'NG' });

    const publish = api.history.post.find((r) => r.url?.endsWith('/publish'));
    expect(JSON.parse(publish!.data)).toEqual({ activateImmediately: true });
  });

  /**
   * The listing is saved. Reporting that as a creation failure would tell the
   * member their work was lost when it was not — the distinction the whole
   * three-outcome shape exists for.
   */
  it('reports draft-only, and keeps the server sentence, when publication is refused', async () => {
    asSeller();
    api.onPost('/marketplace/listings').reply(201, envelope(CREATED));
    api.onPost(`/marketplace/listings/${CREATED.listingId}/publish`).reply(
      400,
      problem(
        'marketplace.listing.not-publishable',
        'Before this listing can be published it still needs at least one photograph. [missing: photograph]'
      )
    );

    const outcome = await createAndPublishMarketplaceListing({ title: 'x' }, { displayName: 'Ngozi', countryCode: 'NG' });

    expect(outcome.kind).toBe('draft-only');
    expect(outcome).toMatchObject({ listingId: CREATED.listingId, reason: 'incomplete' });
    expect((outcome as { detail: string }).detail).toContain('photograph');
  });

  it('still reports draft-only when publication fails for an unrecognised reason', async () => {
    asSeller();
    api.onPost('/marketplace/listings').reply(201, envelope(CREATED));
    api.onPost(`/marketplace/listings/${CREATED.listingId}/publish`).reply(500);

    const outcome = await createAndPublishMarketplaceListing({ title: 'x' }, { displayName: 'Ngozi', countryCode: 'NG' });

    expect(outcome).toMatchObject({ kind: 'draft-only', listingId: CREATED.listingId, reason: 'unknown' });
  });

  /** A creation failure is the case where the member has nothing, and it throws. */
  it('throws when creation itself fails, and never calls publish', async () => {
    asSeller();
    api.onPost('/marketplace/listings').reply(400, problem('Platform.Validation.Failed', 'A category is required.'));

    await expect(
      createAndPublishMarketplaceListing({ title: 'x' }, { displayName: 'Ngozi', countryCode: 'NG' })
    ).rejects.toBeDefined();

    expect(api.history.post.filter((r) => r.url?.endsWith('/publish'))).toHaveLength(0);
  });

  it('takes the listing id from `listingId`, which is the field the server sends', () => {
    expect(listingIdOf({ listingId: 'abc' })).toBe('abc');
    expect(listingIdOf({ id: 'fallback' })).toBe('fallback');
    expect(() => listingIdOf({})).toThrow(/no listing identifier/i);
  });

  it('recognises the publish prerequisite refusal and keeps its detail', () => {
    const cause = {
      response: {
        data: problem('marketplace.listing.not-publishable', 'Before this listing can be published it still needs at least one photograph. [missing: photograph]'),
      },
    };
    expect(isNotPublishableError(cause)).toBe(true);
    expect(problemDetail(cause)).toContain('[missing: photograph]');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT-009 — the card contract
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A verbatim search item, copied from
 * `runtime-validation/e2e/evidence-marketplace.json`. Not hand-written: the
 * point of this fixture is that it is what the server actually sent.
 */
const SERVER_CARD: MarketplaceListingCardResponse = {
  listingId: '01a01b2b-6366-7875-a231-4d587b064772',
  title: 'Hand-woven Aso Oke wrapper e2e414',
  slug: 'hand-woven-aso-oke-wrapper-e2e414-lagos',
  summary: 'A full six-yard Aso Oke wrapper woven in Iseyin.',
  categoryKey: 'electronics',
  listingType: 'FixedPrice',
  condition: 'New',
  status: 'Active',
  price: { isDisclosed: true, amount: 45000, currency: 'NGN', isNegotiable: true, isFree: false, minimumOffer: null },
  available: 1,
  location: { countryCode: 'NG', regionName: 'Lagos', cityName: 'Lagos', neighbourhood: null, areaId: null, displayName: 'Lagos, Lagos, NG' },
  coverMediaId: '8ae0dbb1-ae23-4fb6-8630-93a6f375d466',
  tags: [],
  seller: {
    sellerId: '01a01b2b-630a-75bc-9c43-7de81aab7c7e',
    displayName: 'Ngozi Textiles e2e414',
    slug: 'ngozi-textiles-e2e414',
    sellerType: 'Individual',
    isVerified: false,
    badge: null,
    logoMediaId: null,
    completedSales: 0,
    cancellationRate: null,
    averageResponseMinutes: null,
    memberSince: '2026-08-19T17:57:03.370526+00:00',
  },
  isFeatured: false,
  isVerified: false,
  offersDelivery: true,
  offersShipping: false,
  viewCount: 0,
  saveCount: 0,
  publishedAt: '2026-08-19T17:57:03.808853+00:00',
  expiresAt: null,
  isSaved: false,
  distanceKm: null,
};

describe('DEFECT-009 — the shape the screens read did not exist', () => {
  /** The defect itself: the identifier every card key, tap and save depends on. */
  it('takes the id from `listingId`, because the server sends no `id`', () => {
    expect('id' in SERVER_CARD).toBe(false);
    expect(toMarketplaceListing(SERVER_CARD).id).toBe(SERVER_CARD.listingId);
  });

  it('flattens the price object the card renders as a number', () => {
    const listing = toMarketplaceListing(SERVER_CARD);
    expect(listing.price).toBe(45000);
    expect(listing.currency).toBe('NGN');
    expect(listing.negotiable).toBe(true);
  });

  it('reads the cover from `coverMediaId`, not a `coverImage` URL', () => {
    expect(toMarketplaceListing(SERVER_CARD).coverImage).toBe('8ae0dbb1-ae23-4fb6-8630-93a6f375d466');
  });

  it('reads the date from `publishedAt`, because there is no `createdAt`', () => {
    expect(toMarketplaceListing(SERVER_CARD).createdAt).toBe(SERVER_CARD.publishedAt);
  });

  it('maps the location onto the names the card reads', () => {
    const { location } = toMarketplaceListing(SERVER_CARD);
    expect(location.cityName).toBe('Lagos');
    expect(location.areaName).toBe('Lagos');
    expect(location.addressLine).toBe('Lagos, Lagos, NG');
  });

  it('maps the seller name from `displayName`', () => {
    expect(toMarketplaceListing(SERVER_CARD).seller).toMatchObject({
      sellerId: SERVER_CARD.seller!.sellerId,
      name: 'Ngozi Textiles e2e414',
      isVerified: false,
    });
  });

  /**
   * The sharpest of the three. `create.tsx` used to send `rating: 4.8` and two
   * invented `countryVerifications` on the object a buyer uses to decide whether
   * a stranger is safe to meet. The mapping must not reintroduce that from the
   * other direction.
   */
  it('invents no trust data the server did not send', () => {
    const { seller } = toMarketplaceListing(SERVER_CARD);
    expect(seller.rating).toBeUndefined();
    expect(seller.reputationLevel).toBeUndefined();
    expect(seller.yearsOnPlatform).toBeUndefined();
    expect(seller.countryVerifications).toBeUndefined();
  });

  it('derives pickup-only from the two fulfilment flags rather than a field', () => {
    expect(toMarketplaceListing(SERVER_CARD).pickupOnly).toBe(false);
    expect(
      toMarketplaceListing({ ...SERVER_CARD, offersDelivery: false, offersShipping: false }).pickupOnly
    ).toBe(true);
  });

  it('survives a card the server widened, or narrowed', () => {
    const sparse: MarketplaceListingCardResponse = { listingId: 'only-an-id' };
    const listing = toMarketplaceListing(sparse);
    expect(listing.id).toBe('only-an-id');
    // Undefined, not 0: the cards render 0 as FREE, and a card that says
    // nothing about its price is not a free item.
    expect(listing.price).toBeUndefined();
    expect(listing.coverImage).toBe('');
    expect(listing.seller.sellerId).toBe('');
  });

  /** A card with no identifier would render as one that goes nowhere. */
  it('drops a card the server sent without an identifier rather than rendering it', () => {
    const page = [SERVER_CARD, {} as MarketplaceListingCardResponse];
    const mapped = toMarketplaceListings(page);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].id).toBe(SERVER_CARD.listingId);
  });

  it('says "price on request" for an undisclosed price rather than "free"', () => {
    const wanted = toMarketplaceListing({
      ...SERVER_CARD,
      listingType: 'Wanted',
      price: { isDisclosed: false, amount: null, currency: null, isNegotiable: false, isFree: false },
    });
    expect(wanted.price).toBeUndefined();
  });

  it('reads a swap as a swap, with what it wants, even when its price is zero', () => {
    const swap = toMarketplaceListing({
      ...SERVER_CARD,
      listingType: 'Swap',
      swapWants: 'A bigger bicycle',
      swapTopUp: 'None',
      price: { isDisclosed: true, amount: 0, currency: 'MUR', isNegotiable: false, isFree: true },
    });
    expect(swap.intent).toBe('Exchange / Swap');
    expect(swap.swap).toEqual({ wants: 'A bigger bicycle', topUp: 'None' });
    expect(toMarketplaceListing(SERVER_CARD).swap).toBeUndefined();
  });

  it('maps every card in a page', () => {
    expect(toMarketplaceListings([SERVER_CARD, { ...SERVER_CARD, listingId: 'second' }])).toHaveLength(2);
  });
});
