/**
 * The application's primary navigation destinations.
 *
 * Two surfaces render this list: the tab bar in `app/(tabs)/_layout.tsx`, and
 * the scroll-end menu that stack screens raise when the member reaches the
 * bottom of a page. They used to declare the destinations independently, and
 * had drifted — different icon sizes, different label casing, different label
 * sizes, and two different oranges for the selected state. Both now read from
 * here, so a change to the navigation model can only be made in one place.
 */

export type TabKey = 'home' | 'discover' | 'create' | 'messages' | 'knowledge' | 'profile';

export interface NavDestination {
  key: TabKey;
  label: string;
  /** Icon shown when the destination is selected. */
  icon: string;
  /** Icon shown when it is not — the shape change is what carries the state
   *  for members who cannot distinguish the active tint. */
  iconOutline: string;
  route: string;
  /** Create is the primary action, so it renders slightly larger. */
  iconSize: number;
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { key: 'home', label: 'Home', icon: 'home', iconOutline: 'home-outline', route: '/(tabs)', iconSize: 22 },
  { key: 'discover', label: 'Discover', icon: 'search', iconOutline: 'search-outline', route: '/(tabs)/discover', iconSize: 22 },
  { key: 'create', label: 'Create', icon: 'add-circle', iconOutline: 'add-circle-outline', route: '/(tabs)/create', iconSize: 26 },
  { key: 'messages', label: 'Messages', icon: 'chatbubble-ellipses', iconOutline: 'chatbubble-ellipses-outline', route: '/(tabs)/messages', iconSize: 22 },
  { key: 'knowledge', label: 'Knowledge', icon: 'book', iconOutline: 'book-outline', route: '/(tabs)/knowledge', iconSize: 22 },
  { key: 'profile', label: 'Profile', icon: 'person', iconOutline: 'person-outline', route: '/(tabs)/profile', iconSize: 22 },
] as const;

/** Height of the navigation bar's content, excluding the bottom safe-area inset. */
export const NAV_BAR_HEIGHT = 60;

/**
 * Bottom padding a scroll view needs so its last item clears the navigation bar.
 *
 * Screens were each inventing this number, which is why some had content
 * trapped behind the bar. `spacing[6]` of breathing room sits between the last
 * item and the bar itself.
 *
 * **Prefer `useBottomInset` from `components/layout/bottom-inset`.** This is the
 * pure-function form of `useBottomInset({ chrome: 'scroll-end-nav' })`, kept
 * because it can be asserted on without rendering. A screen should not call it
 * directly — the hook knows about the three kinds of bottom chrome and this
 * only knows about one.
 */
export const navContentInset = (bottomInset: number, navVisible = true) =>
  (navVisible ? NAV_BAR_HEIGHT : 0) + bottomInset + 24;

/** Formats an unread count for a navigation badge. */
export const formatBadgeCount = (count: number): string => (count > 99 ? '99+' : String(count));
