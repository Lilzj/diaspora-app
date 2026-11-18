// ─────────────────────────────────────────────────────────────────────────────
// Provider categories — the two jobs the client still does itself.
//
// **This is the leftover the FBL-002 move was supposed to find.** The audit's
// own words: a genuine leftover fixture hides in a list of nineteen false
// positives. Nineteen production files imported from `@/mocks`; eighteen wanted
// reference data; this one did not.
//
// `mockCategories` was the client's category *taxonomy* until 13 Oct 2026, when
// it turned out the server resolves a category by id, slug, name or alias and
// never by `cat-1` — so every provider registration answered 404
// CategoryNotFound, shown to the member as "could not reach Diaspora". The
// taxonomy moved to `GET /providers/categories` (`fetchServiceCategories`) and
// every screen that *listed* categories was rewired.
//
// Two uses survived, and neither is a taxonomy:
//
//   1. **Legacy draft ids.** A post drafted before 13 Oct holds `cat-1` rather
//      than a slug. `categoryKey` translates it so the draft can still be
//      published. This table is the translation, and it is finite and closed:
//      no new id will ever be minted.
//
//   2. **Emoji.** The server's `icon` field names an icon set, not an emoji, so
//      the chips need a client-side mapping. Four slugs the server serves were
//      never in the fixture and were carried in a second, inline map inside
//      `categoryIcon`; they are folded in below, so there is one table rather
//      than two that can disagree.
//
// Neither job is a fixture's and neither is reference data in the sense
// `countries.ts` is — which is exactly why moving the array into
// `src/lib/reference` wholesale would have laundered a leftover into something
// that reads authoritative. It is filed here as what it does.
//
// `provider-category-key.test.ts` holds every slug below to the set the server
// served on 13 Oct 2026, so a drift between the two is a failing test rather
// than a chip with no icon.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderCategoryPresentation {
  /**
   * The id the client minted before 13 Oct 2026, where one existed. Present
   * only so a draft saved then can still be published; absent for the slugs
   * that were never in the fixture.
   */
  legacyId?: string;

  /** The key the server resolves. */
  slug: string;

  /** For a reader, not for the wire. */
  name: string;

  /** The chip's emoji. The server's own icon field names an icon set. */
  icon: string;
}

export const providerCategories: ProviderCategoryPresentation[] = [
  { legacyId: 'cat-1', slug: 'food-restaurants', name: 'Food & Restaurants', icon: '🍛' },
  { legacyId: 'cat-2', slug: 'hair-beauty', name: 'Hair & Beauty', icon: '💇' },
  { legacyId: 'cat-3', slug: 'retail-shopping', name: 'Retail & Shopping', icon: '🛍️' },
  { legacyId: 'cat-4', slug: 'health-wellness', name: 'Health & Wellness', icon: '💪' },
  { legacyId: 'cat-5', slug: 'home-services', name: 'Home Services', icon: '🏠' },
  { legacyId: 'cat-6', slug: 'auto-transport', name: 'Auto & Transport', icon: '🚗' },
  { legacyId: 'cat-7', slug: 'finance-legal', name: 'Finance & Legal', icon: '⚖️' },
  { legacyId: 'cat-8', slug: 'education', name: 'Education', icon: '📚' },
  { legacyId: 'cat-9', slug: 'events', name: 'Events', icon: '🎉' },
  { legacyId: 'cat-10', slug: 'it-tech', name: 'IT & Tech', icon: '💻' },

  // Served by the server, never in the fixture. These were the inline fallback
  // map inside `categoryIcon`; folded in so one table answers both questions.
  { slug: 'faith-worship', name: 'Faith & Worship', icon: '🙏' },
  { slug: 'community-associations', name: 'Community Associations', icon: '🤝' },
  { slug: 'government-embassies', name: 'Government & Embassies', icon: '🏛️' },
  { slug: 'other', name: 'Other', icon: '🏷️' },
];

/** The emoji for a category chip, or a neutral tag when the slug is unknown. */
export function providerCategoryIcon(slug: string): string {
  return providerCategories.find((category) => category.slug === slug)?.icon ?? '🏷️';
}

/**
 * The key the server resolves for a picked category.
 *
 * Picks have been slugs since 13 Oct 2026, so this is a no-op for anything
 * chosen since; a draft saved before holds a `cat-n` id and is translated.
 */
export function providerCategoryKey(picked: string | undefined): string {
  if (!picked) return '';

  return providerCategories.find((category) => category.legacyId === picked)?.slug ?? picked;
}
