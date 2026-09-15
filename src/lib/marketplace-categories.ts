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
