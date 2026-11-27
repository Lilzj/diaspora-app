// This route composes the screen. Each concern is a hook and each part of the page a section,
// in `src/components/screens/discover`; the hooks run in the order below and the
// sections read them as props (FSOLID-001).
// ─────────────────────────────────────────────────────────────────────────────
// Remediation — the four tabs that never asked the platform anything
//
// Housing and Marketplace already read certified routes. The other four did not:
//
//     mockListings          → Providers tab
//     mockJobs              → Jobs tab
//     mockGuides            → Guides tab
//     mockCommunityUpdates  → Updates tab
//
// each filtered in-memory. So the platform's main discovery surface showed the
// same fabricated businesses — with ratings, review counts, "● Open Now" and a
// **"✓ VERIFIED" badge** — to every member on every device, and tapping one
// opened `/provider/{fixtureId}`, which is the screen whose `?? mockListings[0]`
// fallback was the highest-severity defect in this whole sweep.
//
// All four now read real routes, confirmed against the backend's actual HTTP
// mappings rather than inferred from names:
//
//     GET /providers              SearchProvidersQuery → ProviderPageResponse
//     GET /jobs                   SearchJobsQuery      ("BrowseJobs")
//     GET /guides                 SearchGuidesQuery    → CursorPagedResult<GuideCard…>
//     (no route)                  community updates
//
// Two of those are worth stating precisely, because the obvious guess is wrong
// in both cases: **there is no `GET /guides/search`** — guides search *is* the
// bare `GET /guides` — and **there is no `GET /jobs/search`**; the POST variant
// exists but browse is the bare `GET /jobs`.
//
// Community updates have **no list route anywhere on the platform**. Not a DTO
// without a mapping: there is no `/community/updates` segment, `GET
// /community/posts` is a by-id read with no collection route, listing is
// feed-only via `GET /community/feeds/{feedKey}`, and the only thing the backend
// calls an "update" is a *campaign* update on a different aggregate in a
// different module. So that tab says what is unavailable instead of inventing a
// local alert feed.
//
// ── The category rows ────────────────────────────────────────────────────────
//
// Every taxonomy here was a fixture whose ids matched nothing on any route, so
// picking a chip filtered fabricated rows and would have been silently dropped
// against a real one. Each tab now uses the taxonomy route that genuinely exists
// for it, and the tabs that have none say so rather than showing a dead row:
//
//     Providers    GET /providers/categories    → useServiceCategories
//     Guides       GET /guides/categories       → useGuideCategories
//     Jobs         GET /jobs/categories         — exists, no client yet
//     Marketplace  GET /marketplace/categories  — exists, no client yet
//     Housing      none — the taxonomy is split into `accommodation-types`
//                  and `amenities`, and neither is a category list
// ─────────────────────────────────────────────────────────────────────────────

import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// Hyperlocal Discovery Engine Integrations
import { GlobalLocationSelector } from '@/components/GlobalLocationSelector';
// Frontend Phase 13 — Multi-Community Expansion.
//
// The audit found this screen filtering on `owner.originCountry?.code` — a country
// filter doing a community filter's job, which is the conflation §2 forbids. The
// migration is deliberately conservative and is registered as
// FRONTEND-PHASE13-GAP-009:
//
//   * The country picker stays. Filtering by country of origin is a legitimate
//     thing to want, and removing it would be a regression (§69).
//   * When a *community* scope is active it drives the filter instead, through the
//     one projection in `lib/community/scope.ts`.
//   * The list says which of the two is happening. `<CommunityScopeNote>` states
//     that community matching is done by country of origin, because it is.
//
// With no community selected — `ALL_COMMUNITIES` — the behaviour is byte-identical
// to what it was before this phase.
import { CommunityFilterBar, CommunityScopeNote } from '@/components/community-directory';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useDiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import { useDiscoverTour } from '@/components/screens/discover/useDiscoverTour';
import { useDiscoverView } from '@/components/screens/discover/useDiscoverView';
import { useDiscoverFilters } from '@/components/screens/discover/useDiscoverFilters';
import { useHousingSheet } from '@/components/screens/discover/useHousingSheet';
import { useMarketSheet } from '@/components/screens/discover/useMarketSheet';
import { useListingSearches } from '@/components/screens/discover/useListingSearches';
import { useProviderTab } from '@/components/screens/discover/useProviderTab';
import { useJobTab } from '@/components/screens/discover/useJobTab';
import { useOriginFilter } from '@/components/screens/discover/useOriginFilter';
import { useGuideTab } from '@/components/screens/discover/useGuideTab';
import { useDiscoverCategories } from '@/components/screens/discover/useDiscoverCategories';
import { useMapPins } from '@/components/screens/discover/useMapPins';
import { DiscoverHeader } from '@/components/screens/discover/DiscoverHeader';
import { DiscoverTabRow } from '@/components/screens/discover/DiscoverTabRow';
import { RadiusControl } from '@/components/screens/discover/RadiusControl';
import { SearchSuggestions } from '@/components/screens/discover/SearchSuggestions';
import { CategoryChips } from '@/components/screens/discover/CategoryChips';
import { MapPreview } from '@/components/screens/discover/MapPreview';
import { DiscoverResults } from '@/components/screens/discover/DiscoverResults';
import { DiscoverFilterSheet } from '@/components/screens/discover/DiscoverFilterSheet';

export default function DiscoverScreen() {
  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });
  const search = useDiscoverSearch();
  useDiscoverTour(search);
  const view = useDiscoverView();
  const filters = useDiscoverFilters();
  const housingSheet = useHousingSheet(search);
  const marketSheet = useMarketSheet();
  const listings = useListingSearches(search, filters, housingSheet, marketSheet);
  const providers = useProviderTab(search, filters);
  const jobs = useJobTab(search, filters);
  const origin = useOriginFilter(search, filters, listings, providers, jobs);
  const guides = useGuideTab(search);
  const categories = useDiscoverCategories(search);
  const map = useMapPins(search, origin);

  const { searchQuery, selectedCategory, activeTab, recentSearches, suggestions } = search;
  const { isLocationSelectorOpen, setIsLocationSelectorOpen, isMapView } = view;
  const { refreshControl } = listings;
  const { communityProjection, originFilter } = origin;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Search Header Area */}
      <DiscoverHeader search={search} view={view} />

      {/* Main Container */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={refreshControl}>
        
        {/* Tab Row (Providers, Jobs, Housing, Marketplace, Guides, Updates) */}
        <DiscoverTabRow search={search} />

        {/* Frontend Phase 13, §15. The one reusable community filter, on the
            platform's main discovery surface. Reads and writes the same context
            store every other community filter in the app does — §15 forbids a
            separate incompatible filter per feature, and there is only one
            component to mount. */}
        <View className="bg-surface-card border-b border-faint mb-2">
          <CommunityFilterBar compact />
        </View>

        {/* §2 / GAP-009. Where a community scope narrowed the list, say so — and
            say that the narrowing was done by country of origin rather than by a
            community anybody declared. A list that implied otherwise would be the
            exact conflation this phase exists to remove. */}
        {originFilter.source === 'community' ? (
          <View className="px-4 mb-2">
            <CommunityScopeNote projection={communityProjection} compact />
          </View>
        ) : null}

        {/* Radius configuration slider */}
        {activeTab !== 'Guides' && activeTab !== 'Community' && (
          <RadiusControl search={search} view={view} />
        )}

        {/* Suggestions Panel (shown only when query is empty and no category is selected) */}
        {/* Both lists start empty now, so the panel itself has to be conditional —
            otherwise a new member gets an empty bordered box with two headings. */}
        {!searchQuery && !selectedCategory && (recentSearches.length > 0 || suggestions.length > 0) && (
          <SearchSuggestions search={search} />
        )}

        {/* Category Filters row (mainly for Providers, Jobs, Guides, & Housing) */}
        {activeTab !== 'Updates' && activeTab !== 'Community' && (
          <CategoryChips categories={categories} search={search} />
        )}



        {/* Map View Simulation */}
        {isMapView ? (
          <MapPreview map={map} search={search} />
        ) : (
          /* List View Results */
          <DiscoverResults
            categories={categories}
            guides={guides}
            jobs={jobs}
            listings={listings}
            origin={origin}
            providers={providers}
            search={search}
            view={view}
          />
        )}
      </ScrollView>

      {/* Filter Bottom Sheet Modal */}
      {/* The filter sheet carries four fields, including the price range, and
          previously had no keyboard handling at all — on Android 15+ the window
          does not resize, so the lower fields sat behind the keyboard (F-033).
          `Sheet` supplies the avoidance, the bottom safe area, the single scrim
          and the assistive-technology containment. */}
      <DiscoverFilterSheet
        filters={filters}
        housingSheet={housingSheet}
        marketSheet={marketSheet}
        origin={origin}
        search={search}
        view={view}
      />

      {/* Global Location Selector Drawer Modal */}
      <GlobalLocationSelector
        visible={isLocationSelectorOpen}
        onClose={() => setIsLocationSelectorOpen(false)}
      />
    </SafeAreaView>
  );
}
