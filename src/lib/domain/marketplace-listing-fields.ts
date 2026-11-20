// ─────────────────────────────────────────────────────────────────────────────
// What each kind of marketplace listing asks, and sends (Android UAT, 3 Nov 2026)
//
// The create wizard asked every field of every kind: a buying request was asked
// "Quantity Available", and a donation was offered a price, a negotiable box
// and a price check because the price block tested "not a giveaway" where it
// meant "has a price". The buying request's budget was never sent, because the
// payload read the one `price` field that form does not show.
//
// One map now decides both what the step shows and what the payload carries.
// A buying request sends its budget as the price (the card shows it under
// "Buying"). It asks for one figure, "up to", because that is what the server
// keeps: it asked for a lowest and a highest and dropped the lowest unsaid.
// A range needs a budget-minimum column on the listing (4 Nov 2026).
// ─────────────────────────────────────────────────────────────────────────────

export interface ListingFields {
  /** One asking price. */
  price: boolean;
  /** The most a buyer will pay, for a buying request. */
  budget: boolean;
  /** "Price is negotiable (or best offer)". */
  negotiable: boolean;
  /** "Quantity Available": stock, which only something offered has. */
  quantity: boolean;
  /** Whether the condition is the item's own, or the least the buyer accepts. */
  condition: 'item' | 'accepted';
}

const isBuying = (intent: string) => intent === 'Buying Request' || intent === 'Wanted';
const isFree = (intent: string) => intent === 'Giving Away' || intent === 'Donation';

export function listingFieldsFor(intent: string): ListingFields {
  if (isBuying(intent)) {
    return { price: false, budget: true, negotiable: false, quantity: false, condition: 'accepted' };
  }

  if (isFree(intent)) {
    return { price: false, budget: false, negotiable: false, quantity: true, condition: 'item' };
  }

  return { price: true, budget: false, negotiable: true, quantity: true, condition: 'item' };
}

/** The price, negotiable flag and stock the create call sends for `intent`. */
export function listingPricePayload(
  intent: string,
  form: { price: string; maxPrice: string; negotiable: boolean; quantity: string }
): { price: number | undefined; isNegotiable: boolean; quantity: number | undefined } {
  if (isBuying(intent)) {
    // Stock is not sent: the server tracks it again for any quantity but one,
    // and a buying request has none.
    return { price: Number(form.maxPrice) || undefined, isNegotiable: false, quantity: undefined };
  }

  const quantity = Number(form.quantity) || 1;

  if (isFree(intent)) {
    return { price: 0, isNegotiable: false, quantity };
  }

  return { price: Number(form.price) || undefined, isNegotiable: form.negotiable, quantity };
}
