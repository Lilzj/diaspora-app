/**
 * Discover's results, as the screen's one virtualised list draws them
 * (FARCH-004, 27 Nov 2026).
 *
 * The six tabs drew their rows with `.map()` inside the screen's ScrollView, so
 * every row of every page stayed mounted. One FlashList holds the screen now,
 * and what each tab drew in one place is split three ways: the rows (built by
 * `useDiscoverRows`, drawn by one module-level renderer), what the list draws
 * in their place, and what it draws above and below them. These tests hold the
 * split to what the tabs did before it: the same rows, none while the tab is
 * locked, loading, failed or on the map, the states in the same order, the
 * notes and "Show more" where they were, and one spotlight anchor.
 */
import React from 'react';
import { render, renderHook, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import { TourSpotlight } from '@/components/explore/TourProvider';
import {
  renderDiscoverRow,
  useDiscoverRows,
  type DiscoverResultsProps,
  type DiscoverRow,
} from '../screens/discover/DiscoverRows';
import {
  DiscoverResultsEmpty,
  DiscoverResultsFooter,
  DiscoverResultsHeader,
} from '../screens/discover/DiscoverResults';

let mockAccountState = 'DiasporaVerified';
jest.mock('@/store/auth', () => ({
  useAuthStore: (select: (state: { user: { accountState: string } }) => unknown) =>
    select({ user: { accountState: mockAccountState } }),
}));
jest.mock('@/store/saved', () => ({
  useSavedStore: () => ({ save: jest.fn(), unsave: jest.fn(), isSaved: () => false }),
}));

const provider = (id: string) => ({
  providerId: id,
  name: `Provider ${id}`,
  coverMedia: null,
  category: { name: 'Hair' },
  isVerified: false,
  location: { cityName: 'Port Louis' },
  reviewSummary: { totalReviews: 0, average: 0 },
  isOpenNow: null,
});
const item = (id: string) => ({ id, title: `Item ${id}` });

const paged = (overrides: Record<string, unknown> = {}) => ({
  isLoading: false,
  isError: false,
  error: null,
  hasMore: false,
  loadMore: jest.fn(),
  refresh: jest.fn(),
  isFetchingMore: false,
  loadMoreFailed: false,
  ...overrides,
});

type Overrides = {
  activeTab?: string;
  isMapView?: boolean;
  isGridView?: boolean;
  providers?: Record<string, unknown>;
  providerSearch?: Record<string, unknown>;
  listings?: Record<string, unknown>;
  origin?: Record<string, unknown>;
  guides?: Record<string, unknown>;
};

function results(overrides: Overrides = {}): DiscoverResultsProps {
  return {
    categories: { guideCategories: [{ key: 'visas', name: 'Visas' }] },
    guides: {
      guideSearch: paged(),
      filteredGuides: [{ guideId: 'g1', categoryKey: 'visas', title: 'Getting a visa' }],
      ...overrides.guides,
    },
    jobs: { jobSearch: paged(), retryJobs: jest.fn() },
    listings: {
      isLoading: false,
      housingError: null,
      housingCursor: null,
      housingMore: 'idle',
      loadMoreHousing: jest.fn(),
      housingDistanceNote: 'Distances are approximate.',
      refresh: jest.fn(),
      marketplaceError: null,
      marketCursor: null,
      marketMore: 'idle',
      loadMoreMarketplace: jest.fn(),
      ...overrides.listings,
    },
    origin: {
      filteredListings: [provider('p1'), provider('p2')],
      filteredJobs: [{ jobId: 'j1' }],
      displayedHousingListings: [{ id: 'h1' }],
      displayedMarketplaceListings: [item('m1'), item('m2'), item('m3')],
      housingRatingNote: null,
      marketRatingNote: null,
      ...overrides.origin,
    },
    providers: {
      providerSearch: paged(overrides.providerSearch),
      providerDistanceNote: 'Within 10 km.',
      retryProviders: jest.fn(),
      ...overrides.providers,
    },
    search: { activeTab: overrides.activeTab ?? 'Providers', emptyStatePlace: '' },
    view: { isMapView: overrides.isMapView ?? false, isGridView: overrides.isGridView ?? false, setIsGridView: jest.fn() },
  } as unknown as DiscoverResultsProps;
}

const rowsOf = (props: DiscoverResultsProps) => renderHook(() => useDiscoverRows(props)).result.current;
const kinds = (rows: DiscoverRow[]) => rows.map((row) => `${row.kind}:${row.key}`);
const wrap = (node: React.ReactElement) => render(<ThemeProvider>{node}</ThemeProvider>);

beforeEach(() => {
  mockAccountState = 'DiasporaVerified';
});

describe('the rows', () => {
  it('are the tab’s results, one kind per tab', () => {
    expect(kinds(rowsOf(results()))).toEqual(['provider:provider:p1', 'provider:provider:p2']);
    expect(kinds(rowsOf(results({ activeTab: 'Jobs' })))).toEqual(['job:job:j1']);
    expect(kinds(rowsOf(results({ activeTab: 'Housing' })))).toEqual(['home:home:h1']);
    expect(kinds(rowsOf(results({ activeTab: 'Marketplace' })))).toEqual(['item:item:m1', 'item:item:m2', 'item:item:m3']);
  });

  it('carry a guide’s category name, as the card drew it', () => {
    const [row] = rowsOf(results({ activeTab: 'Guides' }));
    expect(row).toMatchObject({ kind: 'guide', categoryName: 'Visas' });
  });

  it('pair the marketplace grid two to a row, the last alone', () => {
    const rows = rowsOf(results({ activeTab: 'Marketplace', isGridView: true }));
    expect(rows.map((row) => (row.kind === 'item-pair' ? row.items.map((i) => i.id) : row.kind))).toEqual([
      ['m1', 'm2'],
      ['m3'],
    ]);
  });

  it.each([
    ['while the tab is locked', () => { mockAccountState = 'LimitedAccess'; return results(); }],
    ['on the tab’s first read', () => results({ providerSearch: { isLoading: true } })],
    ['when the tab could not ask', () => results({ providerSearch: { isError: true } })],
    ['on the map', () => results({ isMapView: true })],
    ['on a tab with nothing to list', () => results({ activeTab: 'Updates' })],
  ])('are none %s', (_when, props) => {
    expect(rowsOf(props())).toEqual([]);
  });

  it('keep the guides already shown when only "Show more" failed', () => {
    const rows = rowsOf(results({ activeTab: 'Guides', guides: { guideSearch: paged({ error: 'offline' }) } }));
    expect(rows).toHaveLength(1);
  });
});

describe('the row renderer', () => {
  const rows = () => rowsOf(results());

  it('anchors the results spotlight on the first row only', () => {
    const [first, second] = rows();
    const asItem = (row: DiscoverRow, index: number) =>
      renderDiscoverRow({ item: row, index, target: 'Cell' } as never);

    wrap(asItem(first, 0));
    expect(screen.UNSAFE_queryAllByType(TourSpotlight)).toHaveLength(1);
    expect(screen.getByText('Provider p1')).toBeTruthy();

    screen.unmount();
    wrap(asItem(second, 1));
    expect(screen.UNSAFE_queryAllByType(TourSpotlight)).toHaveLength(0);
    expect(screen.getByText('Provider p2')).toBeTruthy();
  });
});

describe('in place of the rows', () => {
  it('draws the locked card first', () => {
    mockAccountState = 'LimitedAccess';
    wrap(<DiscoverResultsEmpty {...results({ providerSearch: { isLoading: true } })} />);
    expect(screen.getByText(/Community access is available after Diaspora Verification/)).toBeTruthy();
    expect(screen.queryByLabelText('Loading providers')).toBeNull();
  });

  it('then the first read', () => {
    wrap(<DiscoverResultsEmpty {...results({ providerSearch: { isLoading: true, isError: true } })} />);
    expect(screen.getByLabelText('Loading providers')).toBeTruthy();
    expect(screen.queryByText('Could not load providers')).toBeNull();
  });

  it('then that the tab could not ask, never that nothing matched', () => {
    wrap(<DiscoverResultsEmpty {...results({ providerSearch: { isError: true } })} />);
    expect(screen.getByText('Could not load providers')).toBeTruthy();
    expect(screen.queryByText(/No providers match/)).toBeNull();
  });

  it('then that nothing matched', () => {
    wrap(<DiscoverResultsEmpty {...results({ origin: { filteredListings: [] } })} />);
    expect(screen.getByText('No providers match nearby')).toBeTruthy();
  });

  it('says why the Updates tab has no rows, inside the spotlight anchor', () => {
    wrap(<DiscoverResultsEmpty {...results({ activeTab: 'Updates' })} />);
    expect(screen.getByText(/Community updates aren.t available yet/)).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(TourSpotlight)).toHaveLength(1);
  });

  it('draws nothing on the map, which draws its own results', () => {
    wrap(<DiscoverResultsEmpty {...results({ isMapView: true, origin: { filteredListings: [] } })} />);
    expect(screen.queryByText(/No providers match/)).toBeNull();
  });
});

describe('above and below the rows', () => {
  it('notes how far the distances reach, but not while the tab loads', () => {
    wrap(<DiscoverResultsHeader {...results()} />);
    expect(screen.getByText('Within 10 km.')).toBeTruthy();

    screen.unmount();
    wrap(<DiscoverResultsHeader {...results({ providerSearch: { isLoading: true } })} />);
    expect(screen.queryByText('Within 10 km.')).toBeNull();
  });

  it('counts the marketplace items, with a "+" while more remain', () => {
    wrap(<DiscoverResultsHeader {...results({ activeTab: 'Marketplace', listings: { marketCursor: 'next' } })} />);
    expect(screen.getByText('3+ items nearby')).toBeTruthy();
  });

  it('offers the next page below the rows, and the locked tab offers nothing', () => {
    wrap(<DiscoverResultsFooter {...results({ providerSearch: { hasMore: true } })} />);
    expect(screen.getByLabelText('Show more providers')).toBeTruthy();

    screen.unmount();
    mockAccountState = 'LimitedAccess';
    wrap(<DiscoverResultsFooter {...results({ providerSearch: { hasMore: true } })} />);
    expect(screen.queryByLabelText('Show more providers')).toBeNull();
  });

  it('offers no next page while the tab loads', () => {
    wrap(<DiscoverResultsFooter {...results({ providerSearch: { hasMore: true, isLoading: true } })} />);
    expect(screen.queryByLabelText('Show more providers')).toBeNull();
  });
});
