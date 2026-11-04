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
// A buying request sends its highest budget as the price (the card shows it
// under "Buying"); the server has no budget range to send the lowest to.
// ─────────────────────────────────────────────────────────────────────────────

export interface ListingFields {
  /** One asking price. */
  price: boolean;
  /** A lowest and highest budget, for a buying request. */
  budgetRange: boolean;
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
    return { price: false, budgetRange: true, negotiable: false, quantity: false, condition: 'accepted' };
  }

  if (isFree(intent)) {
    return { price: false, budgetRange: false, negotiable: false, quantity: true, condition: 'item' };
  }

  return { price: true, budgetRange: false, negotiable: true, quantity: true, condition: 'item' };
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
