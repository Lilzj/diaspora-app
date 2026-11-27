// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — a screen shell's long list (FARCH-004, 27 Nov 2026)
//
// The area shells (`CommunityScreen`, `CreatorScreen`) drew every screen in one
// ScrollView, so a screen whose list pages drew its rows with `.map()` inside
// it, and every page the member asked for stayed mounted for as long as the
// screen was open. A shell given `list` draws the screen as one FlashList
// instead: what the screen draws above its list is the list's header, and the
// rows are recycled as they scroll.
//
// Everything the shell's ScrollView did, the list does: the same bottom inset,
// the same keyboard handling, the same pull to refresh, and the navigation bar
// raised at the end of the content.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Platform, type RefreshControlProps } from 'react-native';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import { ScrollEndFlashList } from '@/components/ScrollEndNavigationMenu';
import { useBottomInset } from '@/components/layout/bottom-inset';

/**
 * What a screen gives its shell: the rows and how to draw them, what the list
 * says in place of rows, and what follows them ("Show more", a create button).
 * The shell draws loading and a failed read itself, as it always has.
 */
export type ScreenList<T> = Pick<
  FlashListProps<T>,
  | 'data'
  | 'renderItem'
  | 'keyExtractor'
  | 'getItemType'
  | 'extraData'
  | 'ListEmptyComponent'
  | 'ListFooterComponent'
  | 'ItemSeparatorComponent'
  | 'onEndReached'
  | 'onEndReachedThreshold'
>;

interface ScreenListBodyProps<T> {
  list: ScreenList<T>;
  /**
   * The first read is in flight. Only the header is drawn, where the shell says
   * so: no rows, no empty state and no footer, as the scroll view drew nothing
   * of the screen's content but the spinner.
   */
  loading?: boolean;
  /** Above the rows: the shell's gap notice and what the screen draws above its list. */
  header: React.ReactNode;
  /** Whether the list raises the shared navigation bar at its end. */
  scrollEnd: boolean;
  /** Whether that bar is drawn, for a shell that turns it off while a footer is pinned. */
  endNavigation?: boolean;
  /** Height of a footer the shell pins below the list. */
  footerHeight: number;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

/** Stable, so a list still loading is handed the same empty list on every render. */
const NO_ROWS: never[] = [];

/** The shell's body, as one virtualised list. */
export function ScreenListBody<T>({
  list,
  loading = false,
  header,
  scrollEnd,
  endNavigation = true,
  footerHeight,
  refreshControl,
}: ScreenListBodyProps<T>) {
  const bottomInset = useBottomInset({ footerHeight });
  const shared = {
    ...list,
    ...(loading ? { data: NO_ROWS, ListEmptyComponent: null, ListFooterComponent: null } : null),
    ListHeaderComponent: <>{header}</>,
    showsVerticalScrollIndicator: false,
    // Without this the first tap on a control while the keyboard is up is
    // spent dismissing it, which reads as a dead button.
    keyboardShouldPersistTaps: 'handled' as const,
    keyboardDismissMode: Platform.OS === 'ios' ? ('interactive' as const) : ('on-drag' as const),
    refreshControl,
  };

  return scrollEnd ? (
    <ScrollEndFlashList {...shared} endNavigation={endNavigation} footerHeight={footerHeight} />
  ) : (
    <FlashList {...shared} contentContainerStyle={{ paddingBottom: bottomInset }} />
  );
}
