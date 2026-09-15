// ─────────────────────────────────────────────────────────────────────────────
// The listing on the wire, and the listing this application draws
//
// The fixtures below are copied from `ListingResponse` and its nested records
// field by field — `listingId`, `price.amount`, `seller.displayName`,
// `inventory.quantity`, `listingType`. Written from the client's own type they
// would have passed against the broken code, which is how `listing.intent`
// stayed undefined after everything around it had been fixed.
// ─────────────────────────────────────────────────────────────────────────────

import {
  describeSwapTopUp,
  describeSwapWants,
  isPurchasable,
  listingIntent,
  swapTermsOf,
  swapTopUpAttributeValue,
  toListing,
  type ListingWire,
} from '../marketplace-wire';

/** `ListingResponse`, as the detail route answers it. */
function wire(overrides: Partial<ListingWire> = {}): ListingWire {
  return {
    listingId: '0198f0aa-9999-4444-8888-777766665555',
    title: 'Hand-woven baskets',
    slug: 'hand-woven-baskets',
    description: 'Three nested baskets made by a co-operative.',
    categoryKey: 'furniture',
    categoryName: 'Furniture',
    listingType: 'FixedPrice',
    condition: 'New',
    status: 'Active',
    price: {
      isDisclosed: true,
      amount: 1200,
      currency: 'MUR',
      isNegotiable: true,
      isFree: false,
      minimumOffer: 900,
    },
    inventory: { quantity: 3, available: 3, },
    location: {
      countryCode: 'MU',
      cityName: 'Port Louis',
      neighbourhood: 'Caudan',
      displayName: 'Caudan, Port Louis',
    },
    fulfillment: { offersPickup: true, offersDelivery: false, offersShipping: false },
    media: [{ mediaId: 'm1', role: 'Cover', order: 1 }],
    seller: {
      sellerId: 'seller-1',
      displayName: 'Aline Ramgoolam',
      slug: 'aline',
      sellerType: 'Member',
      isVerified: true,
      badge: 'Trusted',
      memberSince: '2025-01-04T00:00:00Z',
    },
    engagement: { views: 42 },
    createdAt: '2026-09-01T09:00:00Z',
    ...overrides,
  };
}

describe('the id', () => {
  it('reads listingId, which is what the platform calls it', () => {
    expect(toListing(wire()).id).toBe('0198f0aa-9999-4444-8888-777766665555');
  });

  it('is never the string undefined', () => {
    expect(toListing({}).id).toBe('');
  });
});

describe('the price', () => {
  it('reads the amount out of the price object', () => {
    expect(toListing(wire()).price).toBe(1200);
    expect(toListing(wire()).currency).toBe('MUR');
  });

  it('carries whether offers are invited', () => {
    expect(toListing(wire()).negotiable).toBe(true);
  });

  it('leaves an undisclosed price undefined rather than showing a zero', () => {
    // **A price on request is not a free item.** A zero here is a number
    // somebody would act on.
    const listing = toListing(wire({
      price: { isDisclosed: false, amount: null, currency: 'MUR' },
    }));

    expect(listing.price).toBeUndefined();
  });

  it('reads a free listing as free rather than as undisclosed', () => {
    const listing = toListing(wire({
      price: { isDisclosed: true, amount: 0, currency: 'MUR', isFree: true },
    }));

    expect(listing.price).toBe(0);
  });
});

describe('how many there are', () => {
  it('reads the quantity out of the inventory object', () => {
    expect(toListing(wire()).quantity).toBe(3);
  });

  it('is undefined when the platform tracks no inventory', () => {
    expect(toListing(wire({ inventory: null })).quantity).toBeUndefined();
  });
});

describe('the seller', () => {
  it('reads displayName, which the render wants as name', () => {
    // **The fatal one.** `listing.seller.name.split(' ')` threw during render
    // and took the process down.
    expect(toListing(wire()).seller.name).toBe('Aline Ramgoolam');
  });

  it('never leaves the name undefined, whatever the payload', () => {
    expect(toListing({}).seller.name).toBe('Seller');
    expect(toListing(wire({ seller: null })).seller.name).toBe('Seller');
  });

  it('carries the id and the verification through', () => {
    expect(toListing(wire()).seller.sellerId).toBe('seller-1');
    expect(toListing(wire()).seller.isVerified).toBe(true);
  });

  it('invents no avatar, phone or response time', () => {
    // None of them are on the wire. The render guards each one; a placeholder
    // here would be a fact nobody supplied.
    const seller = toListing(wire()).seller;

    expect(seller.avatarUrl).toBeUndefined();
    expect(seller.contactPhone).toBeUndefined();
    expect(seller.responseTime).toBeUndefined();
  });

  it('keeps memberSince, which the tenure line is computed from', () => {
    expect(toListing(wire()).seller.memberSince).toBe('2025-01-04T00:00:00Z');
  });
});

describe('what kind of listing it is', () => {
  it.each([
    ['FixedPrice', 'Selling'],
    ['Negotiable', 'Selling'],
    ['BusinessInventory', 'Selling'],
    ['Wanted', 'Wanted'],
    ['Giveaway', 'Giving Away'],
    ['Swap', 'Exchange / Swap'],
  ] as const)('reads %s as %s', (type, expected) => {
    expect(listingIntent(type)).toBe(expected);
  });

  it('never leaves the label blank', () => {
    // `intent` was undefined on every listing, so the header rendered an empty
    // label where the kind of listing goes.
    expect(listingIntent(undefined)).toBe('Selling');
    expect(listingIntent('SomethingNew')).toBe('Selling');
    expect(toListing(wire()).intent).toBe('Selling');
  });
});

describe('whether it can be bought', () => {
  const base = {
    price: 1200,
    currency: 'MUR',
    status: 'Active' as const,
    intent: 'Selling' as const,
  };

  it('can be bought when it is on sale, active and priced', () => {
    expect(isPurchasable(base)).toBe(true);
  });

  it('does not offer to sell somebody their own request', () => {
    // **The case the old gate missed.** It read `intent !== 'Swap'`, against a
    // value the platform never sends and the client's union does not contain,
    // so it was always true. A `Wanted` listing is a member asking for
    // something, priced as a budget if at all.
    expect(isPurchasable({ ...base, intent: 'Wanted' })).toBe(false);
  });

  it('does not offer to buy a listing that is not active', () => {
    expect(isPurchasable({ ...base, status: 'Sold' })).toBe(false);
    expect(isPurchasable({ ...base, status: 'Reserved' })).toBe(false);
  });

  it('does not offer to buy something with no price to pay', () => {
    expect(isPurchasable({ ...base, price: 0 })).toBe(false);
    expect(isPurchasable({ ...base, price: undefined })).toBe(false);
  });

  it('does not take a swap’s top-up as the price of the item', () => {
    // 15 Sep 2026. A swap's price is what somebody adds when the two things
    // differ in value; paying it would buy the item for the difference.
    expect(isPurchasable({ ...base, intent: 'Exchange / Swap' })).toBe(false);
  });

  it('does not ask for money without naming a currency', () => {
    // `ListingPriceResponse.Currency` is nullable. Defaulting it would offer to
    // take somebody's money in a currency the seller never named.
    expect(isPurchasable({ ...base, currency: undefined })).toBe(false);
    expect(isPurchasable({ ...base, currency: '' })).toBe(false);
  });
});

describe('the rest of the flattening', () => {
  it('reads the view count out of the engagement object', () => {
    expect(toListing(wire()).viewCount).toBe(42);
  });

  it('reads delivery and pickup out of the fulfillment object', () => {
    expect(toListing(wire()).deliveryAvailable).toBe(false);
    expect(toListing(wire()).pickupOnly).toBe(true);
  });

  it('is not pickup-only when delivery is offered as well', () => {
    const listing = toListing(wire({
      fulfillment: { offersPickup: true, offersDelivery: true, offersShipping: false },
    }));

    expect(listing.pickupOnly).toBe(false);
    expect(listing.deliveryAvailable).toBe(true);
  });

  it('builds no image urls, because marketplace media is private', () => {
    // Each identifier needs `POST /media/{id}/signed-url`, which the screen
    // does asynchronously. A plain URL here would 403 on every render.
    expect(toListing(wire()).gallery ?? []).toEqual([]);
  });
});

describe('a swap — 15 Sep 2026', () => {
  it('reads its terms off the listing, and nothing off a listing that is not a swap', () => {
    const swap = toListing(
      wire({
        listingType: 'Swap',
        swapWants: ' A bigger bicycle ',
        swapTopUp: 'BuyerAdds',
        price: { isDisclosed: true, amount: 500, currency: 'MUR', isNegotiable: false, isFree: false },
      })
    );

    expect(swap.intent).toBe('Exchange / Swap');
    expect(swap.swap).toEqual({ wants: 'A bigger bicycle', topUp: 'BuyerAdds' });
    expect(swap.price).toBe(500);

    expect(toListing(wire()).swap).toBeUndefined();
  });

  it('reads an unknown or missing top-up as an even swap', () => {
    expect(swapTermsOf({ listingType: 'Swap', swapWants: null, swapTopUp: 'Sideways' })).toEqual({
      wants: '',
      topUp: 'None',
    });
  });

  it('says what the lister wants where a price would go', () => {
    expect(describeSwapWants({ wants: 'A laptop', topUp: 'None' })).toBe('Swap for A laptop');
    expect(describeSwapWants({ wants: '', topUp: 'None' })).toBe('Swap');
  });

  it('says who adds money, and says nothing for an even swap or an unstated amount', () => {
    expect(describeSwapTopUp({ wants: 'x', topUp: 'SellerAdds' }, 500, 'Rs ')).toBe('The lister adds Rs 500 on top');
    expect(describeSwapTopUp({ wants: 'x', topUp: 'BuyerAdds' }, 500, 'Rs ')).toBe('The lister asks for Rs 500 on top');
    expect(describeSwapTopUp({ wants: 'x', topUp: 'None' }, 500, 'Rs ')).toBe('');
    expect(describeSwapTopUp({ wants: 'x', topUp: 'BuyerAdds' }, undefined, 'Rs ')).toBe('');
  });

  it('writes the top-up as the attribute value the server reads', () => {
    expect(swapTopUpAttributeValue('None')).toBe('none');
    expect(swapTopUpAttributeValue('SellerAdds')).toBe('seller-adds');
    expect(swapTopUpAttributeValue('BuyerAdds')).toBe('buyer-adds');
  });
});
