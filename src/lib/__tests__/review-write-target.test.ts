// ─────────────────────────────────────────────────────────────────────────────
// A rating nobody could give
//
// The backend shipped three review routes and every one of them worked:
//
//     POST /providers/{providerId}/reviews
//     POST /marketplace/sellers/{sellerId}/reviews
//     POST /housing/landlords/{landlordId}/reviews
//
// `write-review.tsx` called only the first. So sellers and landlords could be
// rated by the platform and by nobody using it — the star on both detail screens
// was correct, honest, and permanently absent, because no member could produce
// one. A capability reachable only by `curl` is not shipped.
//
// ── Why the reservation matters ──────────────────────────────────────────────
//
// The two new routes require a completed transaction: marketplace gates on a
// `ListingReservation` in `Completed`, housing on `Occupied`. The review is keyed
// on the **reservation**, not the counterparty, so a repeat buyer rates each
// purchase and the unique index enforces one review per transaction.
//
// A screen that only discovers this at submit time has already taken somebody's
// words for a review it cannot deliver.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildReviewRequest,
  describeReviewFailure,
  needsReservation,
} from '../reviews/write-target';

describe('where a review is sent', () => {
  it('sends a provider review to the route that has always worked', () => {
    const { request } = buildReviewRequest({ subject: 'provider', subjectId: 'p1', rating: 5 });

    expect(request?.path).toBe('/providers/p1/reviews');
    // No reservation: providers were never gated on one.
    expect(request?.body).toEqual({ rating: 5 });
  });

  it('sends a seller review to the marketplace route with its reservation', () => {
    const { request } = buildReviewRequest({
      subject: 'seller',
      subjectId: 's1',
      reservationId: 'r1',
      rating: 4,
    });

    expect(request?.path).toBe('/marketplace/sellers/s1/reviews');
    expect(request?.body).toEqual({ reservationId: 'r1', rating: 4 });
  });

  it('sends a landlord review to the housing route with its reservation', () => {
    const { request } = buildReviewRequest({
      subject: 'landlord',
      subjectId: 'l1',
      reservationId: 'r2',
      rating: 3,
    });

    expect(request?.path).toBe('/housing/landlords/l1/reviews');
    expect(request?.body).toEqual({ reservationId: 'r2', rating: 3 });
  });

  it('escapes an identifier rather than pasting it into a path', () => {
    const { request } = buildReviewRequest({ subject: 'provider', subjectId: 'a/b', rating: 5 });

    expect(request?.path).toBe('/providers/a%2Fb/reviews');
  });

  it('knows which subjects the platform gates on a transaction', () => {
    expect(needsReservation('provider')).toBe(false);
    expect(needsReservation('seller')).toBe(true);
    expect(needsReservation('landlord')).toBe(true);
  });
});

describe('what is refused before the request is made', () => {
  it('refuses a seller review with no reservation, and says why', () => {
    const { request, refusal } = buildReviewRequest({
      subject: 'seller',
      subjectId: 's1',
      rating: 5,
    });

    expect(request).toBeUndefined();
    // The rule, not the failure. Someone who has not finished a purchase is not
    // doing anything wrong, and "something went wrong" would suggest they were.
    expect(refusal?.message).toContain('once a purchase from them is complete');
  });

  it('refuses a landlord review with no reservation', () => {
    const { refusal } = buildReviewRequest({ subject: 'landlord', subjectId: 'l1', rating: 5 });

    expect(refusal?.message).toContain('once your tenancy has started');
  });

  it('refuses a rating outside the range the server accepts', () => {
    for (const rating of [0, 6, -1, 2.5]) {
      expect(buildReviewRequest({ subject: 'provider', subjectId: 'p1', rating }).refusal).toBeDefined();
    }
  });

  it('refuses when nobody is named', () => {
    expect(buildReviewRequest({ subject: 'provider', subjectId: null, rating: 5 }).refusal).toBeDefined();
  });
});

describe('empty prose is omitted, not sent', () => {
  it('drops a whitespace-only title and body', () => {
    // Both are nullable on the wire. An empty string is a review that says
    // nothing while looking like one that does.
    const { request } = buildReviewRequest({
      subject: 'provider',
      subjectId: 'p1',
      rating: 5,
      title: '   ',
      body: '\n\t ',
    });

    expect(request?.body).toEqual({ rating: 5 });
  });

  it('trims what it does send', () => {
    const { request } = buildReviewRequest({
      subject: 'provider',
      subjectId: 'p1',
      rating: 5,
      title: '  Good  ',
      body: '  Fast delivery.  ',
    });

    expect(request?.body).toEqual({ rating: 5, title: 'Good', body: 'Fast delivery.' });
  });
});

describe('the server’s refusal, in the member’s terms', () => {
  // Every code here was read off the module. The first draft of this mapping
  // invented `marketplace.review.no-completed-reservation` and
  // `housing.review.no-occupied-reservation`; the real ones are
  // `no-completed-purchase` and `no-tenancy`, so both would have fallen through
  // to the generic apology and hidden the one refusal a member can act on.
  it('explains the gate rather than apologising for it', () => {
    expect(describeReviewFailure('marketplace.review.no-completed-purchase').message).toContain(
      'once a purchase from them is complete',
    );
    expect(describeReviewFailure('housing.review.no-tenancy').message).toContain(
      'once your tenancy has started',
    );
  });

  it('tells somebody who already rated that they can revise it', () => {
    expect(describeReviewFailure('marketplace.review.already-written').title).toBe('Already rated');
    expect(describeReviewFailure('housing.review.already-written').title).toBe('Already rated');
  });

  it('does not invite a retry once the edit window has closed', () => {
    const described = describeReviewFailure('housing.review.edit-window-closed');

    expect(described.message).not.toMatch(/try again/i);
    expect(described.message).toContain('still stands');
  });

  it('keeps the server’s own words for anything unrecognised', () => {
    // Flattening an unknown refusal into a generic apology hides what the server
    // said, which is the only clue anybody has.
    expect(describeReviewFailure('some.new.code', 'Reviews are paused in your country.').message).toBe(
      'Reviews are paused in your country.',
    );
  });

  it('falls back to something actionable when the server says nothing', () => {
    expect(describeReviewFailure(null).message).toContain('Check your connection');
    expect(describeReviewFailure(undefined, '   ').message).toContain('Check your connection');
  });
});
