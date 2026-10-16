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

import { toListingCondition } from './marketplace-categories';
import { SWAP_TOP_UP_KEY, SWAP_WANTS_KEY, swapTopUpAttributeValue } from './marketplace-wire';
import type { SwapTopUp } from '@/types/marketplace';
import { draftCategoryKey } from '@/lib/marketplace-categories';
import { ownPinOrTown } from './place-coordinates';

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
  /** Where the picked town is (Google); absent when typed with no match. */
  latitude?: number | null;
  longitude?: number | null;
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

/**
 * What a step will not go forward without, by the name the member reads.
 *
 * <p>
 * Presence only: whether there is something in the field, not whether what is
 * in it will do. The two are different messages — "Still needed: Description"
 * tells somebody to write one, and "Keep the title under 140 characters" tells
 * somebody the opposite of that, so a rule that mixed them would name a field
 * as missing while the member is looking straight at what they typed in it.
 * </p>
 * <p>
 * The labels are the ones on the fields on the screen. They are declared here
 * rather than in the screen so that the sentence and the name come from one
 * place: this is the whole of what the step requires, read two ways.
 * </p>
 */
export function swapStepRequirements(
  step: SwapStep,
  draft: SwapDraft
): { label: string; ok: boolean; problem: string }[] {
  switch (step) {
    case 'offering':
      return [
        {
          label: 'Item title',
          ok: draft.title.trim().length > 0,
          problem: `Give your item a title of at least ${SWAP_TITLE_MIN} characters.`,
        },
        {
          label: 'Description',
          ok: draft.description.trim().length > 0,
          problem: 'Describe the item: its condition, and anything that comes with it.',
        },
        {
          label: 'Category',
          ok: draftCategoryKey(draft.categoryId) !== null,
          problem: 'Choose a category for your item.',
        },
        {
          label: 'Photo',
          ok: Boolean(draft.photoMediaId),
          problem: 'Add a photo of your item. A swap cannot go live without one.',
        },
      ];
    case 'wants':
      return [
        {
          label: 'What you would take',
          ok: draft.wants.trim().length > 0,
          problem: 'Say what you would take in exchange.',
        },
        {
          // Only asked for when somebody is adding money. A swap with no
          // top-up has nothing to state, and listing it as missing would
          // demand a figure the member deliberately did not want to give.
          label: 'Top-up amount',
          ok: draft.topUp === 'None' || parseTopUp(draft.topUpAmount) !== null,
          problem: 'Enter the top-up amount, or choose no top-up.',
        },
      ];
    case 'place':
      return [
        {
          // The member's country of residence, never asked (14 Oct 2026). Only
          // missing when the profile has none, and that is where to fix it.
          label: 'Country of residence (set it on your profile)',
          ok: /^[A-Za-z]{2}$/.test(draft.countryCode.trim()),
          problem: 'Your profile has no country of residence. Set it on your profile, then list the swap.',
        },
        {
          label: 'Town or city',
          ok: draft.cityName.trim().length > 0,
          problem: 'Choose the town the item is in.',
        },
      ];
    default:
      return [];
  }
}

/**
 * Why a step cannot move on, in a sentence — or null when it can.
 *
 * A missing field first, in the words above; then the rules about what is in a
 * field that is filled in. Missing first because being told a title is too
 * short is no use to somebody who has not yet written the description either.
 */
export function swapStepProblem(step: SwapStep, draft: SwapDraft): string | null {
  const missing = swapStepRequirements(step, draft).find((requirement) => !requirement.ok);
  if (missing) return missing.problem;

  switch (step) {
    case 'offering': {
      const title = draft.title.trim();
      if (title.length < SWAP_TITLE_MIN) {
        return `Give your item a title of at least ${SWAP_TITLE_MIN} characters.`;
      }
      if (title.length > SWAP_TITLE_MAX) return `Keep the title under ${SWAP_TITLE_MAX} characters.`;
      return null;
    }
    case 'wants': {
      if (draft.wants.trim().length > SWAP_WANTS_MAX) {
        return `Keep what you want under ${SWAP_WANTS_MAX} characters.`;
      }
      if (draft.topUp !== 'None') {
        const amount = parseTopUp(draft.topUpAmount);
        if (amount !== null && amount <= 0) return 'The top-up amount must be more than zero.';
      }
      return null;
    }
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

  const townPoint = ownPinOrTown(null, draft.cityName, draft);
  const payload = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    // A server key since 13 Oct 2026; an older draft's fixture id is translated.
    categoryKey: draftCategoryKey(draft.categoryId),
    countryCode: draft.countryCode.trim().toUpperCase(),
    listingType: 'Swap',
    condition: toListingCondition(draft.condition),
    // The top-up, when somebody adds money. An even swap has no price at all.
    price: amount ?? undefined,
    currency: amount === null ? undefined : draft.currency,
    isNegotiable: false,
    cityName: draft.cityName.trim() || undefined,
    // The town's coordinates, which the listing is filed by (14 Oct 2026).
    latitude: townPoint?.latitude,
    longitude: townPoint?.longitude,
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
