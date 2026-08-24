// ─────────────────────────────────────────────────────────────────────────────
// Where a review is written, and what the route needs to accept it
//
// ── Why this is a module and not three `if`s in a screen ─────────────────────
//
// Three review routes exist and they do not take the same body:
//
//     POST /providers/{providerId}/reviews          { rating, title?, body? }
//     POST /marketplace/sellers/{sellerId}/reviews  { reservationId, rating, … }
//     POST /housing/landlords/{landlordId}/reviews  { reservationId, rating, … }
//
// The two new ones require a **reservation**, because a rating has to be earned:
// marketplace gates on a `ListingReservation` in `Completed`, housing on
// `HousingReservationStatus.Occupied`. Sending the provider body to either
// answers a validation failure that says nothing useful, and a screen that
// discovers this at submit time has already taken the member's words.
//
// Keeping the mapping here means the screen can refuse *before* collecting a
// review it cannot deliver, and the shapes can be asserted without rendering
// anything.
// ─────────────────────────────────────────────────────────────────────────────

/** Who is being reviewed. */
export type ReviewSubject = 'provider' | 'seller' | 'landlord';

export interface ReviewTargetInput {
  subject: ReviewSubject;
  /** The provider, seller or landlord being reviewed. */
  subjectId?: string | null;
  /**
   * The transaction being reviewed. Required for `seller` and `landlord`.
   *
   * The review is keyed on the reservation rather than the counterparty, so a
   * repeat buyer rates each purchase separately and the unique index enforces
   * one review per transaction rather than one per person.
   */
  reservationId?: string | null;
  rating: number;
  title?: string | null;
  body?: string | null;
}

export interface ReviewRequest {
  path: string;
  body: Record<string, unknown>;
}

/** Why a review cannot be sent, in words a member can act on. */
export interface ReviewRefusal {
  title: string;
  message: string;
}

const SUBJECT_PATH: Record<ReviewSubject, (id: string) => string> = {
  provider: (id) => `/providers/${encodeURIComponent(id)}/reviews`,
  seller: (id) => `/marketplace/sellers/${encodeURIComponent(id)}/reviews`,
  landlord: (id) => `/housing/landlords/${encodeURIComponent(id)}/reviews`,
};

/** The subjects whose route will not accept a review without a transaction. */
const NEEDS_RESERVATION: ReadonlySet<ReviewSubject> = new Set<ReviewSubject>(['seller', 'landlord']);

export function needsReservation(subject: ReviewSubject): boolean {
  return NEEDS_RESERVATION.has(subject);
}

/**
 * The request for this review, or the reason it cannot be made.
 *
 * Never throws and never guesses: a missing reservation is a refusal the caller
 * can render, not an exception or a request the server will reject.
 */
export function buildReviewRequest(
  input: ReviewTargetInput
): { request: ReviewRequest; refusal?: undefined } | { request?: undefined; refusal: ReviewRefusal } {
  const { subject, subjectId, reservationId, rating } = input;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return {
      refusal: {
        title: 'Rating required',
        // The bound is the server's; saying it here avoids a round trip that
        // ends in a validation message written for a developer.
        message: 'Choose a rating between 1 and 5 stars.',
      },
    };
  }

  if (!subjectId) {
    return {
      refusal: {
        title: 'Nothing to review',
        message: 'We do not know who this review is for.',
      },
    };
  }

  if (needsReservation(subject) && !reservationId) {
    return {
      refusal: {
        title: 'No completed transaction',
        // Stating the rule rather than the failure. A member who has not
        // finished a purchase or moved in is not doing anything wrong, and
        // "something went wrong" would suggest they were.
        message:
          subject === 'seller'
            ? 'You can rate a seller once a purchase from them is complete.'
            : 'You can rate a landlord once your tenancy has started.',
      },
    };
  }

  const trimmedTitle = input.title?.trim();
  const trimmedBody = input.body?.trim();

  return {
    request: {
      path: SUBJECT_PATH[subject](subjectId),
      body: {
        // Omitted rather than sent empty: the fields are nullable on the wire,
        // and an empty string is a review that says nothing while looking like
        // one that does.
        ...(needsReservation(subject) ? { reservationId } : {}),
        rating,
        ...(trimmedTitle ? { title: trimmedTitle } : {}),
        ...(trimmedBody ? { body: trimmedBody } : {}),
      },
    },
  };
}

/**
 * The server's refusal, in the member's terms.
 *
 * The gate is the interesting case: both routes refuse a review with no
 * qualifying transaction, and that is a rule rather than a fault. Anything
 * unrecognised keeps its own message rather than being flattened into a
 * generic apology that hides what the server said.
 */
export function describeReviewFailure(code: string | null | undefined, fallback?: string | null): ReviewRefusal {
  switch (code) {
    // ── Every code below was read off the module, not guessed ───────────────
    //
    // The first draft invented `marketplace.review.no-completed-reservation`
    // and `housing.review.no-occupied-reservation`. The real ones are
    // `no-completed-purchase` and `no-tenancy`, so both would have fallen
    // through to the generic apology and hidden the one refusal a member can
    // actually act on.
    case 'marketplace.review.no-completed-purchase':
      return {
        title: 'No completed purchase',
        message: 'You can rate a seller once a purchase from them is complete.',
      };
    case 'housing.review.no-tenancy':
      return {
        title: 'Tenancy has not started',
        message: 'You can rate a landlord once your tenancy has started.',
      };
    case 'marketplace.review.already-written':
    case 'housing.review.already-written':
      return {
        title: 'Already rated',
        message: 'You have already rated this one. Opening it again lets you revise what you wrote.',
      };
    case 'marketplace.review.edit-window-closed':
    case 'housing.review.edit-window-closed':
      return {
        title: 'Too late to change this',
        // A closed window is not a failure to retry, and saying "try again"
        // would send somebody back into a form that cannot succeed.
        message: 'The period for revising this review has closed. What you wrote still stands.',
      };
    case 'marketplace.review.self':
    case 'housing.review.self':
      return {
        title: 'You cannot rate yourself',
        message: 'This listing is yours.',
      };
    case 'marketplace.review.rating-out-of-range':
    case 'housing.review.rating-out-of-range':
      return {
        title: 'Rating required',
        message: 'Choose a rating between 1 and 5 stars.',
      };
    default:
      return {
        title: 'Review not submitted',
        message:
          fallback?.trim() ||
          'We could not save your review. Check your connection and try again.',
      };
  }
}
