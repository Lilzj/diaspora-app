// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the marketplace catalogue, as the create screens speak it
//
// Lifted out of `app/marketplace/create.tsx` on 15 Sep 2026 so the swap screen
// files a listing under the same catalogue keys and condition names as the sale
// screen does, rather than a second copy of the table that could drift from it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The client's category ids, as the seeded catalogue's keys.
 *
 * `CategoryKey` is `required` and matched **by key** — an unrecognised value is
 * refused, never defaulted. The two vocabularies were never the same: the client
 * says `phones`, `laptops`, `tvs`, `appliances`, `kitchen` and `african_food`,
 * and the catalogue says `mobile-phones`, `computers`, `tv-video`,
 * `home-appliances`, `kitchen-dining` and `imported-groceries`. Fourteen of the
 * twenty-five happen to coincide; the rest did not, and `african_food` could not
 * have matched anything under any normalisation because it carries an
 * underscore where every seeded key uses a hyphen.
 *
 * Total by construction over the client's own ids, so adding a category to
 * `mockMarketplaceCategories` without deciding its server key is a type error
 * rather than a listing the server refuses.
 */
export const MARKETPLACE_CATEGORY_KEYS: Record<string, string> = {
  phones: 'mobile-phones',
  laptops: 'computers',
  tablets: 'tablets',
  furniture: 'furniture',
  tvs: 'tv-video',
  appliances: 'home-appliances',
  kitchen: 'kitchen-dining',
  baby: 'baby',
  clothing: 'clothing',
  shoes: 'shoes',
  books: 'books',
  cars: 'cars',
  motorcycles: 'motorcycles',
  bicycles: 'bicycles',
  electronics: 'electronics',
  gaming: 'gaming',
  sports: 'sports',
  beauty: 'beauty',
  food: 'food',
  african_food: 'imported-groceries',
  utensils: 'kitchenware',
  office: 'office-furniture',
  tools: 'tools-diy',
  instruments: 'music-film',
  other: 'other',
};

/** A client category id as a catalogue key, or null when there is no honest match. */
export function toListingCategoryKey(categoryId: string | null): string | null {
  if (!categoryId) return null;
  return MARKETPLACE_CATEGORY_KEYS[categoryId] ?? null;
}

/** The form's condition labels, as the contract's. `Very Good` is the client's own word. */
export function toListingCondition(condition: string): string {
  switch (condition) {
    case 'Like New':
      return 'LikeNew';
    case 'Very Good':
      return 'Excellent';
    default:
      return condition;
  }
}

// ── The served taxonomy (13 Oct 2026) ───────────────────────────────────────
//
// Both marketplace create screens listed `mockMarketplaceCategories` and mapped
// its ids through the table above. "Baby" mapped to `baby`, which the server
// does not have (`baby-products`), so a baby item could not be listed at all;
// and the subcategory was a free-text tag the server never filed by. The
// screens now list `GET /marketplace/categories` and send its keys.

/** `ListingCategoryResponse` — one node of the commerce taxonomy. */
export interface MarketplaceCategory {
  categoryId: string;
  key: string;
  name: string;
  parentKey?: string | null;
  depth: number;
  iconKey?: string | null;
  order: number;
  isActive: boolean;
}

/** `GET /marketplace/categories` — anonymous, flat, ordered by the server. */
export async function fetchMarketplaceCategories(): Promise<MarketplaceCategory[]> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { apiClient } = require('@/lib/apiClient') as typeof import('@/lib/apiClient');
  const response = await apiClient.get<{ data: MarketplaceCategory[] }>('/marketplace/categories');
  return (response.data?.data ?? []).filter((category) => category.isActive !== false);
}

const CATEGORY_EMOJI: Record<string, string> = {
  electronics: '📱',
  furniture: '🛋️',
  'home-appliances': '🔌',
  'home-garden': '🪴',
  vehicles: '🚗',
  'real-estate': '🏠',
  clothing: '👕',
  beauty: '💄',
  'baby-products': '🍼',
  toys: '🧸',
  books: '📚',
  sports: '⚽',
  food: '🍲',
  services: '🛠️',
  tickets: '🎟️',
  'digital-goods': '💾',
  other: '📦',
};

/** An emoji for a top-level category; the server's icon key names an icon set. */
export function marketplaceCategoryEmoji(key: string | null | undefined): string {
  return (key && CATEGORY_EMOJI[key]) || '🏷️';
}

/**
 * A saved draft's category as a server key: drafts written before 13 Oct 2026
 * hold the fixture's ids (`phones`), newer ones hold keys already.
 */
export function draftCategoryKey(saved: string | null | undefined): string | null {
  if (!saved) return null;
  return MARKETPLACE_CATEGORY_KEYS[saved] ?? saved;
}

