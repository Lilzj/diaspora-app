// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — offering something to swap
//
// **The swap screen sent a made-up seller and always said it had worked.** It
// posted a body the server could not bind — no category key, no country, an
// `intent` of "Exchange / Swap" and a `seller` block naming "Amara Kone" with a
// 4.8 rating — and then showed "Swap Listed! 🔄 Your swap listing is now visible"
// whatever came back. Nothing was ever listed, and the seller it described did
// not exist.
//
// Since 15 Sep 2026 a swap is a listing type of its own on the platform. It is
// created and published through the same sequence as any listing
// (`createAndPublishMarketplaceListing`), as the signed-in member's own seller
// profile, and carries its terms as two attributes:
//
//   swap-wants    what the member would take in exchange — required to go live
//   swap-top-up   none | seller-adds | buyer-adds, with the amount as the price
//
// A swap also needs a photograph to go live, like every listing.
// ─────────────────────────────────────────────────────────────────────────────

import { toListingCategoryKey, toListingCondition } from './marketplace-categories';
import { SWAP_TOP_UP_KEY, SWAP_WANTS_KEY, swapTopUpAttributeValue } from './marketplace-wire';
import type { SwapTopUp } from '@/types/marketplace';

/** `MarketplaceLimits.MinTitle` / `MaxTitle`. */
export const SWAP_TITLE_MIN = 3;
export const SWAP_TITLE_MAX = 140;

/** `MarketplaceLimits.MaxAttributeValue` — what the wanted line is stored in. */
export const SWAP_WANTS_MAX = 500;

/** Everything the swap screen collects. */
export interface SwapDraft {
  title: string;
  description: string;
  /** The client's category id (`phones`), mapped to the catalogue key on the way out. */
  categoryId: string | null;
  /** The form's condition label (`Like New`). */
  condition: string;
  /** The uploaded photograph's media id. Never a device URI. */
  photoMediaId: string | null;
  wants: string;
  topUp: SwapTopUp;
  /** As typed. Only read when somebody adds money. */
  topUpAmount: string;
  currency: string;
  countryCode: string;
  cityName: string;
  neighbourhood: string;
}

export type SwapStep = 'offering' | 'wants' | 'place';

/** A typed amount as a number, or null when nothing usable was typed. */
export function parseTopUp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed.replace(/[,\s]/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

/** Why a step cannot move on, in a sentence — or null when it can. */
export function swapStepProblem(step: SwapStep, draft: SwapDraft): string | null {
  switch (step) {
    case 'offering': {
      const title = draft.title.trim();
      if (title.length < SWAP_TITLE_MIN) {
        return `Give your item a title of at least ${SWAP_TITLE_MIN} characters.`;
      }
      if (title.length > SWAP_TITLE_MAX) return `Keep the title under ${SWAP_TITLE_MAX} characters.`;
      if (!draft.description.trim()) return 'Describe the item: its condition, and anything that comes with it.';
      if (!toListingCategoryKey(draft.categoryId)) return 'Choose a category for your item.';
      if (!draft.photoMediaId) return 'Add a photo of your item. A swap cannot go live without one.';
      return null;
    }
    case 'wants': {
      const wants = draft.wants.trim();
      if (!wants) return 'Say what you would take in exchange.';
      if (wants.length > SWAP_WANTS_MAX) return `Keep what you want under ${SWAP_WANTS_MAX} characters.`;
      if (draft.topUp !== 'None') {
        const amount = parseTopUp(draft.topUpAmount);
        if (amount === null || amount <= 0) return 'Enter the top-up amount, or choose no top-up.';
      }
      return null;
    }
    case 'place':
      if (!/^[A-Za-z]{2}$/.test(draft.countryCode.trim())) return 'Choose the country the item is in.';
      if (!draft.cityName.trim()) return 'Enter the town the item is in.';
      return null;
    default:
      return null;
  }
}

/**
 * `CreateListingRequest` for a swap.
 *
 * No seller identity, rating or status: the seller is whoever the token says it
 * is, and a new listing is a draft until it is published.
 */
export function buildSwapListingRequest(draft: SwapDraft) {
  const amount = draft.topUp === 'None' ? null : parseTopUp(draft.topUpAmount);

  const payload = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    categoryKey: toListingCategoryKey(draft.categoryId),
    countryCode: draft.countryCode.trim().toUpperCase(),
    listingType: 'Swap',
    condition: toListingCondition(draft.condition),
    // The top-up, when somebody adds money. An even swap has no price at all.
    price: amount ?? undefined,
    currency: amount === null ? undefined : draft.currency,
    isNegotiable: false,
    cityName: draft.cityName.trim() || undefined,
    neighbourhood: draft.neighbourhood.trim() || undefined,
    offersPickup: true,
    attributes: [
      { key: SWAP_WANTS_KEY, value: draft.wants.trim(), displayName: 'Wants in exchange' },
      { key: SWAP_TOP_UP_KEY, value: swapTopUpAttributeValue(draft.topUp), displayName: 'Cash top-up' },
    ],
    mediaIds: draft.photoMediaId ? [draft.photoMediaId] : [],
  };

  return payload;
}
