// Discover: the seven tabs, written once.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.


/**
 * The seven Discover tabs, written once.
 *
 * They used to be written three times -- the `useState` union, the deep-link
 * guard and the tab row -- and kept in step by hand, with `as any` at the two
 * call sites to stop the compiler minding. Derived from this list, they cannot
 * drift.
 */
export const DISCOVER_TABS = [
  'Providers',
  'Jobs',
  'Housing',
  'Marketplace',
  'Guides',
  'Updates',
  'Community',
] as const;

export type DiscoverTab = (typeof DISCOVER_TABS)[number];

/** Narrows a deep-link parameter, which arrives as an arbitrary string. */
export const isDiscoverTab = (value: string): value is DiscoverTab =>
  (DISCOVER_TABS as readonly string[]).includes(value);
