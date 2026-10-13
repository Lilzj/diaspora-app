// ─────────────────────────────────────────────────────────────────────────────
// The provider wizard sends a category the server knows
//
// Until 13 Oct 2026 the wizard sent its fixture's own id (`cat-1`). The server
// resolves an id, slug, name or alias — never `cat-1` — so every registration
// answered 404 CategoryNotFound, shown to the member as "could not reach
// Diaspora". The slugs below are production's ten top-level categories, read
// from `providers.provider_service_categories` (depth 1) that day.
// ─────────────────────────────────────────────────────────────────────────────

import { mockCategories } from '@/mocks/data';

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
    expect(mockCategories.length).toBeGreaterThan(0);
    for (const category of mockCategories) {
      expect(SERVER_TOP_LEVEL_SLUGS).toContain(category.slug);
    }
  });

  it('sends the slug, never the fixture id', () => {
    const fs = require('fs') as { readFileSync(p: string, e: string): string };
    const path = require('path') as { join(...s: string[]): string };
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'app', '(tabs)', 'post.tsx'), 'utf8');

    expect(source).toMatch(/category: categoryKey\(selectedCategories\[0\]\)/);
    expect(source).not.toMatch(/category: selectedCategories\[0\]/);
  });
});
