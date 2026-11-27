// Discover: the rows of the tab in view, as the screen's one list reads them.
//
// ── One virtualised list for six tabs (FARCH-004, 27 Nov 2026) ───────────────
//
// The tabs drew their rows with `.map()` inside the screen's ScrollView, so
// nothing was virtualised: every row of every page a member asked for stayed
// mounted, each with its photograph, for as long as the tab was open. Discover
// is the platform's main discovery surface and its rows are its heaviest.
//
// One FlashList now holds the screen. The search sections are its header, the
// tab's rows are its data, and `DiscoverResults` draws the tab's notes above the
// rows, what it says in their place, and its "Show more" below them. Each kind
// of row is its own item type, so a provider row is recycled into a provider row
// and never into a job.
//
// ── Why the rows are built here and drawn by a module-level function ─────────
//
// FlashList redraws a row only when its item or `renderItem` changes. So the
// rows are memoised on what they show, the renderer is a module-level function
// rather than a closure the screen re-creates, and the cards are memoised on
// their props: a keystroke in the search box redraws the header and leaves the
// rows alone.

import React, { useMemo } from 'react';
import { View } from 'react-native';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { JobCard } from '@/components/JobCard';
import { HousingCard } from '@/components/HousingCard';
import { MarketplaceCard } from '@/components/MarketplaceCard';
import { GuideResultCard } from '@/components/guides/GuideResultCard';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { useCommunityAccess } from '@/components/FeatureGate';
import { ProviderResultCard, providersFailed } from '@/components/screens/discover/ProviderResults';
import { jobsFailed } from '@/components/screens/discover/JobResults';
import { guidesFailed } from '@/components/screens/discover/GuideResults';
import { housingFailed } from '@/components/screens/discover/HousingResults';
import { marketplaceFailed } from '@/components/screens/discover/MarketplaceResults';
import type { DiscoverCategories } from '@/components/screens/discover/useDiscoverCategories';
import type { GuideTab } from '@/components/screens/discover/useGuideTab';
import type { JobTab } from '@/components/screens/discover/useJobTab';
import type { ListingSearches } from '@/components/screens/discover/useListingSearches';
import type { OriginFilter } from '@/components/screens/discover/useOriginFilter';
import type { ProviderTab } from '@/components/screens/discover/useProviderTab';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { DiscoverView } from '@/components/screens/discover/useDiscoverView';

/** Everything the tab's results read. */
export interface DiscoverResultsProps {
  categories: DiscoverCategories;
  guides: GuideTab;
  jobs: JobTab;
  listings: ListingSearches;
  origin: OriginFilter;
  providers: ProviderTab;
  search: DiscoverSearch;
  view: DiscoverView;
}

type Provider = OriginFilter['filteredListings'][number];
type Job = OriginFilter['filteredJobs'][number];
type Guide = GuideTab['filteredGuides'][number];
type Home = OriginFilter['displayedHousingListings'][number];
type Item = OriginFilter['displayedMarketplaceListings'][number];

export type DiscoverRow =
  | { kind: 'provider'; key: string; provider: Provider }
  | { kind: 'job'; key: string; job: Job }
  | { kind: 'guide'; key: string; guide: Guide; categoryName?: string }
  | { kind: 'home'; key: string; home: Home }
  | { kind: 'item'; key: string; item: Item }
  /** The marketplace grid: two cards side by side, as one row. */
  | { kind: 'item-pair'; key: string; items: readonly Item[] };

/** Stable, so an empty list is the same empty list on every render. */
const NO_ROWS: DiscoverRow[] = [];

/**
 * Whether the tab in view is on its first read, so only its skeleton is drawn —
 * from real request state, per tab.
 *
 * Housing and Marketplace still drive the `isLoading` state directly from
 * their own `useEffect` fetchers; the three certified reads report their own.
 * The Updates and Community tabs never load, because neither issues a request.
 */
export function discoverLoading({ guides, jobs, listings, providers, search }: DiscoverResultsProps): boolean {
  const { activeTab } = search;
  if (activeTab === 'Providers') return providers.providerSearch.isLoading;
  if (activeTab === 'Jobs') return jobs.jobSearch.isLoading;
  if (activeTab === 'Guides') return guides.guideSearch.isLoading;
  if (activeTab === 'Housing' || activeTab === 'Marketplace') return listings.isLoading;
  return false;
}

/** Whether the tab in view says it could not ask, which it says in place of its rows. */
function discoverFailed({ guides, jobs, listings, providers, search }: DiscoverResultsProps): boolean {
  const { activeTab } = search;
  if (activeTab === 'Providers') return providersFailed(providers);
  if (activeTab === 'Jobs') return jobsFailed(jobs);
  if (activeTab === 'Guides') return guidesFailed(guides);
  if (activeTab === 'Housing') return housingFailed(listings);
  if (activeTab === 'Marketplace') return marketplaceFailed(listings);
  return false;
}

function inPairs(items: readonly Item[]): DiscoverRow[] {
  const rows: DiscoverRow[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    rows.push({ kind: 'item-pair', key: `item-pair:${pair.map((item) => item.id).join(':')}`, items: pair });
  }
  return rows;
}

/**
 * The rows the list draws: none while the tab is locked, on its first read, or
 * saying it could not ask, and none on the map, which draws its own.
 */
export function useDiscoverRows(props: DiscoverResultsProps): DiscoverRow[] {
  const unlocked = useCommunityAccess();
  const { activeTab } = props.search;
  const { isMapView, isGridView } = props.view;
  const { guideCategories } = props.categories;
  const { filteredGuides } = props.guides;
  const { filteredListings, filteredJobs, displayedHousingListings, displayedMarketplaceListings } = props.origin;
  const drawn = unlocked && !isMapView && !discoverLoading(props) && !discoverFailed(props);

  return useMemo(() => {
    if (!drawn) return NO_ROWS;
    switch (activeTab) {
      case 'Providers':
        return filteredListings.map((provider): DiscoverRow => ({
          kind: 'provider',
          key: `provider:${provider.providerId}`,
          provider,
        }));
      case 'Jobs':
        return filteredJobs.map((job, index): DiscoverRow => ({
          kind: 'job',
          key: `job:${String(job.jobId ?? job.id ?? index)}`,
          job,
        }));
      case 'Guides':
        return filteredGuides.map((guide): DiscoverRow => ({
          kind: 'guide',
          key: `guide:${guide.guideId}`,
          guide,
          categoryName: guideCategories.find((c) => c.key === guide.categoryKey)?.name,
        }));
      case 'Housing':
        return displayedHousingListings.map((home): DiscoverRow => ({ kind: 'home', key: `home:${home.id}`, home }));
      case 'Marketplace':
        return isGridView
          ? inPairs(displayedMarketplaceListings)
          : displayedMarketplaceListings.map((item): DiscoverRow => ({ kind: 'item', key: `item:${item.id}`, item }));
      default:
        return NO_ROWS;
    }
  }, [
    drawn,
    activeTab,
    isGridView,
    filteredListings,
    filteredJobs,
    filteredGuides,
    guideCategories,
    displayedHousingListings,
    displayedMarketplaceListings,
  ]);
}

function rowCard(row: DiscoverRow): React.ReactElement {
  switch (row.kind) {
    case 'provider':
      return <ProviderResultCard provider={row.provider} />;
    case 'job':
      /* The cast is the same one `CommunityContentSection`
         makes for this route: `useScopedContent` returns
         rows from `GET /jobs` as opaque records because the
         community projection does not need their shape, and
         `JobCard` reads them as the `JobCardResponse` that
         route sends (RMD-009, 24 Nov 2026). Narrowing the
         row itself needs a typed jobs browse client. */
      return <JobCard job={row.job as never} />;
    case 'guide':
      /* `GET /guides` answers `GuideCardResponse`. The old
         `GuideCard` reads a fixture shape (`country.flag`)
         and crashed the tab once a real guide existed
         (16 Oct 2026). */
      return <GuideResultCard guide={row.guide} categoryName={row.categoryName} />;
    case 'home':
      return <HousingCard listing={row.home} />;
    case 'item':
      return <MarketplaceCard listing={row.item} variant="list" />;
    case 'item-pair':
      return (
        <View className="flex-row justify-between">
          {row.items.map((item) => (
            <MarketplaceCard key={item.id} listing={item} variant="grid" />
          ))}
        </View>
      );
  }
}

/** One row, in the results' margin. */
export function renderDiscoverRow({ item: row, index }: ListRenderItemInfo<DiscoverRow>) {
  const card = <View className="px-6">{rowCard(row)}</View>;

  // The results are the third spotlight anchor, and the first row stands for
  // them. Steps that described a badge on an individual card point here: a
  // spotlight around every row would register whichever row happened to render
  // last, so it would land on an arbitrary card.
  return index === 0 ? <TourSpotlight spotlightKey="discover_results">{card}</TourSpotlight> : card;
}

export const discoverRowKey = (row: DiscoverRow) => row.key;

/** A provider row is recycled into a provider row, a grid pair into a grid pair. */
export const discoverRowType = (row: DiscoverRow) => row.kind;
