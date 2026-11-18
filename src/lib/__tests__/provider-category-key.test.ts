// ─────────────────────────────────────────────────────────────────────────────
// The provider wizard sends a category the server knows
//
// Until 13 Oct 2026 the wizard sent its fixture's own id (`cat-1`). The server
// resolves an id, slug, name or alias — never `cat-1` — so every registration
// answered 404 CategoryNotFound, shown to the member as "could not reach
// Diaspora". The slugs below are production's ten top-level categories, read
// from `providers.provider_service_categories` (depth 1) that day.
// ─────────────────────────────────────────────────────────────────────────────

import {
  providerCategories,
  providerCategoryIcon,
  providerCategoryKey,
} from '@/lib/reference/provider-categories';

const SERVER_TOP_LEVEL_SLUGS = [
  'auto-transport',
  'community-associations',
  'education',
  'events',
  'faith-worship',
  'finance-legal',
  'food-restaurants',
  'government-embassies',
  'hair-beauty',
  'health-wellness',
  'home-services',
  'it-tech',
  'other',
  'retail-shopping',
];

describe('the provider wizard category', () => {
  it('offers only categories the server can resolve, by slug', () => {
    expect(providerCategories.length).toBeGreaterThan(0);
    for (const category of providerCategories) {
      expect(SERVER_TOP_LEVEL_SLUGS).toContain(category.slug);
    }
  });

  // The table moved out of `@/mocks/data` on 18 Nov 2026 (FBL-002). It was
  // never reference data and never a taxonomy -- the server has owned that
  // since 13 Oct -- so it is filed as the two closed tables it actually is.
  it('translates a legacy draft id and leaves a slug alone', () => {
    expect(providerCategoryKey('cat-1')).toBe('food-restaurants');
    expect(providerCategoryKey('food-restaurants')).toBe('food-restaurants');
    expect(providerCategoryKey(undefined)).toBe('');

    // A slug the server serves that the old fixture never had.
    expect(providerCategoryKey('faith-worship')).toBe('faith-worship');
  });

  it('answers an emoji for every slug the server serves', () => {
    for (const slug of SERVER_TOP_LEVEL_SLUGS) {
      expect(providerCategoryIcon(slug).length).toBeGreaterThan(0);
    }

    // Folded in from the inline fallback map inside `categoryIcon`, so the two
    // cannot disagree about a category the server serves.
    const faith = providerCategories.find((category) => category.slug === 'faith-worship');
    expect(providerCategoryIcon('faith-worship')).toBe(faith?.icon);

    const unknown = providerCategories.find((category) => category.slug === 'other');
    expect(providerCategoryIcon('not-a-category')).toBe(unknown?.icon);
  });

  it('sends the slug, never the fixture id', () => {
    const fs = require('fs') as { readFileSync(p: string, e: string): string };
    const path = require('path') as { join(...s: string[]): string };
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'app', '(tabs)', 'post.tsx'), 'utf8');

    expect(source).toMatch(/category: categoryKey\(selectedCategories\[0\]\)/);
    expect(source).not.toMatch(/category: selectedCategories\[0\]/);

    // And it lists the server's categories, not the fixture's (13 Oct 2026).
    expect(source).toMatch(/useServiceCategories\(\)/);
    expect(source).not.toMatch(/providerCategories\.map\(/);
  });

  it('offers the categories in the shared dropdown with search, and the town in the shared picker', () => {
    const fs = require('fs') as { readFileSync(p: string, e: string): string };
    const path = require('path') as { join(...s: string[]): string };
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'app', '(tabs)', 'post.tsx'), 'utf8');
    // One dropdown with search, multi-select, keyed on slugs (14 Oct 2026);
    // the first choice is still the category and the rest are tags.
    expect(source).toMatch(/<SearchableSelect\s+multiple/);
    expect(source).toContain('key: cat.slug');
    expect(source).toContain('category: categoryKey(selectedCategories[0])');
    expect(source).toContain('tags: selectedCategories.slice(1).map(categoryKey)');
    expect(source).toContain('<TownPicker');
  });
});
