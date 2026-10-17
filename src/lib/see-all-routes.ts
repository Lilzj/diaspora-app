// ─────────────────────────────────────────────────────────────────────────────
// Where a Home rail's "See all" goes
//
// Added 17 Oct 2026. Each feed section carries a `seeAllRoute` from the
// server's catalogue (`DefaultFeedSectionContributor`), and six of its nine
// named screens this app does not have: `/housing`, `/job`, `/provider`,
// `/marketplace`, `/knowledge/learning-paths`, `/community-life/org`. Those
// folders exist only for a single item (`/housing/[id]`), so the router found
// no index and showed "Unmatched Route". A tester hit it on "Trusted providers"
// and "In the marketplace".
//
// The list views for those four kinds are Discover's tabs, so a rail opens
// Discover on its own tab. Matched on the section's stable `key`; the server's
// route is followed only when it names a screen this app is known to have.
// ─────────────────────────────────────────────────────────────────────────────

import type { FeedSection } from '@/types/recommendations';

export interface SeeAllDestination {
  pathname: string;
  params?: Record<string, string>;
}

const DISCOVER = '/(tabs)/discover';

/** By section key: the screen in this app that lists what the rail holds. */
export const SEE_ALL_BY_KEY: Record<string, SeeAllDestination> = {
  'housing-near-you': { pathname: DISCOVER, params: { tab: 'Housing' } },
  'jobs-for-you': { pathname: DISCOVER, params: { tab: 'Jobs' } },
  'trusted-providers': { pathname: DISCOVER, params: { tab: 'Providers' } },
  'marketplace-near-you': { pathname: DISCOVER, params: { tab: 'Marketplace' } },
  'trending-guides': { pathname: '/(tabs)/knowledge/guides' },
  // There is no learning-path list; Knowledge is where paths are reached.
  'continue-learning': { pathname: '/(tabs)/knowledge' },
  'events-near-you': { pathname: '/community-life' },
  // Organisations are found in Community Life; there is no list of them alone.
  organizations: { pathname: '/community-life' },
  'for-you': { pathname: DISCOVER },
};

/** Server routes that name a screen this app has, for sections not listed above. */
const KNOWN_SCREENS: Record<string, SeeAllDestination> = {
  '/discover': { pathname: DISCOVER },
  '/knowledge/guides': { pathname: '/(tabs)/knowledge/guides' },
  '/community-life': { pathname: '/community-life' },
};

/** Where "See all" goes for this section, or null to offer no "See all". */
export function seeAllDestination(section: Pick<FeedSection, 'key' | 'seeAllRoute'>): SeeAllDestination | null {
  return SEE_ALL_BY_KEY[section.key] ?? (section.seeAllRoute ? KNOWN_SCREENS[section.seeAllRoute] ?? null : null);
}
