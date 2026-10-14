/**
 * Offering something to swap — 15 Sep 2026.
 *
 * The swap screen posted a body the server could not bind, under a made-up
 * seller, and said "Swap Listed!" whatever happened. A swap is now a listing
 * type of its own; these pin the request it sends and what stops each step.
 */
import { buildSwapListingRequest, parseTopUp, swapStepProblem, type SwapDraft } from '../swap-listings';

function draft(overrides: Partial<SwapDraft> = {}): SwapDraft {
  return {
    title: "Child's bicycle",
    description: 'Outgrown, rides well.',
    categoryId: 'bicycles',
    condition: 'Like New',
    photoMediaId: '01a0a0aa-0000-7000-8000-000000000001',
    wants: 'A bigger bicycle',
    topUp: 'None',
    topUpAmount: '',
    currency: 'MUR',
    countryCode: 'mu',
    cityName: ' Rose Hill ',
    neighbourhood: '',
    ...overrides,
  };
}

describe('the swap request', () => {
  // 14 Oct 2026: filed by the picked town's coordinates, which are optional.
  it('sends the picked town’s latitude and longitude', () => {
    const request = buildSwapListingRequest(draft({ latitude: -20.2397, longitude: 57.4683 }));
    expect(request).toMatchObject({ cityName: 'Rose Hill', latitude: -20.2397, longitude: 57.4683 });
    expect(request).not.toHaveProperty('areaId');
  });

  it('sends no coordinates for a typed town, a half pair, or no town', () => {
    for (const overrides of [
      {},
      { latitude: -20.2, longitude: null },
      { cityName: '', latitude: -20.2397, longitude: 57.4683 },
    ] as Partial<SwapDraft>[]) {
      // Undefined, so the JSON body carries neither key.
      const sent = JSON.parse(JSON.stringify(buildSwapListingRequest(draft(overrides))));
      expect(sent).not.toHaveProperty('latitude');
      expect(sent).not.toHaveProperty('longitude');
    }
  });

  it('is a Swap listing filed under the catalogue key, with its terms as attributes', () => {
    const request = buildSwapListingRequest(draft());

    expect(request.listingType).toBe('Swap');
    expect(request.categoryKey).toBe('bicycles');
    expect(request.countryCode).toBe('MU');
    expect(request.condition).toBe('LikeNew');
    expect(request.cityName).toBe('Rose Hill');
    expect(request.neighbourhood).toBeUndefined();
    expect(request.mediaIds).toEqual(['01a0a0aa-0000-7000-8000-000000000001']);
    expect(request.attributes).toEqual([
      { key: 'swap-wants', value: 'A bigger bicycle', displayName: 'Wants in exchange' },
      { key: 'swap-top-up', value: 'none', displayName: 'Cash top-up' },
    ]);
  });

  it('sends no price for an even swap, so it is never shown as free', () => {
    const request = buildSwapListingRequest(draft({ topUpAmount: '500' }));

    expect(request.price).toBeUndefined();
    expect(request.currency).toBeUndefined();
    expect(request.isNegotiable).toBe(false);
  });

  it('sends the top-up as the price when somebody adds money', () => {
    const request = buildSwapListingRequest(
      draft({ topUp: 'BuyerAdds', topUpAmount: '1,500', currency: 'MUR' })
    );

    expect(request.price).toBe(1500);
    expect(request.currency).toBe('MUR');
    expect(request.attributes[1]).toEqual({ key: 'swap-top-up', value: 'buyer-adds', displayName: 'Cash top-up' });
  });

  it('carries no seller identity, rating or status', () => {
    const request = buildSwapListingRequest(draft()) as Record<string, unknown>;

    expect(request).not.toHaveProperty('seller');
    expect(request).not.toHaveProperty('status');
    expect(request).not.toHaveProperty('intent');
    expect(JSON.stringify(request)).not.toMatch(/Amara Kone|user-123|rating/);
  });
});

describe('what stops each step', () => {
  it('asks for a title, a description, a category and a photo before moving on', () => {
    expect(swapStepProblem('offering', draft({ title: 'ab' }))).toMatch(/at least 3/);
    expect(swapStepProblem('offering', draft({ description: '  ' }))).toMatch(/Describe/);
    expect(swapStepProblem('offering', draft({ categoryId: null }))).toMatch(/category/);
    // An unknown key is no longer refused here (13 Oct 2026): the picker offers
    // only the server's own keys, and the server refuses anything else. The
    // app's private table this checked against was the cause of the "Baby" bug.
    expect(swapStepProblem('offering', draft({ photoMediaId: null }))).toMatch(/photo/);
    expect(swapStepProblem('offering', draft())).toBeNull();
  });

  it('asks what the member wants, and how much when money is added', () => {
    expect(swapStepProblem('wants', draft({ wants: ' ' }))).toMatch(/exchange/);
    expect(swapStepProblem('wants', draft({ wants: 'x'.repeat(501) }))).toMatch(/under 500/);
    expect(swapStepProblem('wants', draft({ topUp: 'SellerAdds', topUpAmount: '' }))).toMatch(/amount/);
    expect(swapStepProblem('wants', draft({ topUp: 'SellerAdds', topUpAmount: '0' }))).toMatch(/amount/);
    expect(swapStepProblem('wants', draft({ topUp: 'SellerAdds', topUpAmount: '200' }))).toBeNull();
    expect(swapStepProblem('wants', draft())).toBeNull();
  });

  it('asks where the item is', () => {
    expect(swapStepProblem('place', draft({ countryCode: '' }))).toMatch(/country/);
    expect(swapStepProblem('place', draft({ cityName: '' }))).toMatch(/town/);
    expect(swapStepProblem('place', draft())).toBeNull();
  });

  it('reads a typed amount, and nothing from nothing', () => {
    expect(parseTopUp('1 200')).toBe(1200);
    expect(parseTopUp('')).toBeNull();
    expect(parseTopUp('abc')).toBeNull();
  });
});
