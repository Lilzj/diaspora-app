// ─────────────────────────────────────────────────────────────────────────────
// Search
//
// ── What this screen used to do ─────────────────────────────────────────────
//
// Every result set on it was a fixture. Seven of them:
//
//     mockListings          → "👤 Service Providers"
//     mockJobs              → "💼 Job Opportunities"
//     mockGuides            → "📖 Evergreen Guides"
//     mockEvents            → "🎉 Community Events"
//     mockOrganizations     → "🏛 Community Hubs"
//     mockCommunityUpdates  → "📢 Community Alerts"
//     mockCategories        → the category chips, and the "Popular Categories" grid
//
// each filtered in-memory with `.toLowerCase().includes(query)`. So the tab that
// answers "is there a plumber near me / is anyone hiring / is there an alert about
// this" answered it from a constant, identically on every device, and never asked
// the platform anything. A member who searched for a business that genuinely
// exists was told there were no results; a member who searched a fixture's
// keyword was shown a business that does not exist, with a rating, a review count
// and a verification badge.
//
// The two worst were the last two. "Community Hubs" attached follower counts to
// organisations nobody runs, and "Community Alerts" presented fabricated local
// warnings — the one category of content on the platform a member might act on
// urgently.
//
// ── What it does now ────────────────────────────────────────────────────────
//
// Nothing on this screen holds a result set of its own. Two certified paths:
//
//   * **Providers** — `GET /providers` → `ProviderPage` of `ProviderSummary`,
//     via the existing `useProviderSearch`. Held here rather than delegated
//     because this is the screen's primary subject, because it is the only
//     domain whose coordinates the map view can plot, and because the category
//     filter needs the resolved category record — see the note on categories
//     below.
//
//   * **Guides, jobs, marketplace, housing, events, organisations and
//     updates** — the shared `<CommunityContentSection>`, which already owns the
//     certified route, the community projection and the §74 loading / error /
//     empty states for all eight domains. §38 forbids a second search engine and
//     this builds none.
//
// ── Remediation Wave I: why this screen is sectioned and will stay sectioned ─
//
// The brief for this wave asked a question rather than naming a fix: *is there a
// backend aggregator, and if not, can cross-domain relevance be computed on the
// device honestly?* The whole backend was read for the answer, and the answer is
// **no to both**, for a reason that is stronger than "nobody has built it yet".
//
//   1. **There is no aggregator, and no `/discovery` prefix.** Every route group
//      in the platform comes from a `<Module>ModuleMetadata.RoutePrefix`
//      constant, and the complete set is `/marketplace`, `/housing`, `/jobs`,
//      `/guides`, `/knowledge`, `/intelligence`, `/communities`,
//      `/community-life`, `/community`, `/location`, `/providers`,
//      `/conversations`, `/recommendations`, `/automations`, `/geo` and the
//      rest — no `/discovery` among them. `GET /discovery/search`, which three
//      gap registers vouched for and several screens once called, has never
//      existed.
//
//   2. **The one aggregator that does exist refuses, in writing, to be the
//      platform's.** `GET /communities/search`
//      (`CommunityProgramme/Api/PollAndAnnouncementEndpoints.cs:239`) really is
//      federated and really is ranked by a server-computed `relevance` — and its
//      own handler says why it federates only four types: *"this module does not
//      re-implement a search over another module's rows"*
//      (`Application/Search/CommunitySearchQuery.cs:22`). It names the types it
//      will not touch rather than silently dropping them. That is a deliberate
//      architectural position, not an omission.
//
//   3. **Exactly one route on the platform exposes a score.** Marketplace,
//      housing, jobs, providers, guides and Community Life all rank server-side
//      — each has a `RankingStrategyRegistry` and an `OrderByDescending` over a
//      score — and every one of them **strips the score from the response DTO**,
//      returning at most a diagnostic `engine` or `ranking` name. Only
//      `CommunitySearchResultResponse` carries a `relevance` number.
//
// (3) is what settles it. To merge these domains into one ranked list, this
// client would have to invent the comparison: nine result types with no common
// score, no common pagination — `items` here, `results` there, `totalMatches`
// against `totalCount` against `totalAvailable` against nothing at all — and no
// statement anywhere about how a housing listing compares to a guide. Any number
// this screen computed would be a number this screen made up, presented under a
// word — *relevance* — that means "the server worked this out". A merged
// ranking is therefore not a harder version of this screen. It is a false one.
//
// So: **one section per domain, each querying its own real route, each holding
// its own loading, empty and error state, none of them re-ordered here.** The
// order of the sections on screen is an editorial choice about what this tab is
// for and is not a claim about relevance. If a platform-wide aggregator is ever
// built — the honest place for it is the backend, where the scores already exist
// and are being thrown away — this screen collapses into one call and one list.
//
// ── What each section asks, after this wave ─────────────────────────────────
//
//     Providers      GET /providers                    held here (see below)
//     Guides         GET /guides                       <CommunityContentSection>
//     Jobs           GET /jobs                         "
//     Marketplace    POST /marketplace/search          "   ← added this wave
//     Housing        GET /housing/search               "   ← added this wave
//     Events         GET /community-life/events        "
//     Organisations  GET /community-life/organizations "
//     Community updates   **no search route exists**   says so, does not
//                                                      render an empty list
//
// ── The four filters that were being thrown away by the server ──────────────
//
// Found by reading the backend's binding attributes rather than its route names,
// which is the only way any of these is visible:
//
//   · `GET /providers` binds `Category`, `OpenNowOnly` and `Sort`. This screen's
//     category chips sent **`categoryId`**, which binds to nothing — so picking
//     "Plumbing" returned the entire provider directory and looked like it had
//     filtered. Fixed in `lib/providers-api.ts`.
//   · `GET /jobs`, `GET /community-life/events` and
//     `GET /community-life/organizations` bind the free text as **`q`** and the
//     place as **`city`**. This screen sent `query` and `cityName` to all three,
//     so those three sections answered a search with an unfiltered browse. Fixed
//     in `lib/community-directory-api.ts`.
//
// An unbound query parameter is discarded by the model binder without an error,
// which is why all four survived every test that asserted a 200.
//
// ── Why the category chips are the provider taxonomy, and what they filter ──
//
// `mockCategories` was a fixture whose ids matched nothing on any real route.
// The real taxonomy is `GET /providers/categories` → `ServiceCategory[]`, via
// the certified `useServiceCategories`.
//
// It is a **service** taxonomy, so it is applied only where it genuinely binds:
//
//   * Providers bind it as `category` — an id, slug, name or legacy alias, all
//     resolved through the catalogue, so the id this screen holds is a valid
//     value. `searchProviders` sent `categoryId` until Wave I and the server
//     bound nothing; see the note on dropped filters above.
//   * Guides bind it as `category`, which `SearchGuidesQuery` reads as a slug.
//
// The other five sections have no binding for **this** taxonomy. `/jobs`,
// `/marketplace/search` and `/community-life/events` each bind a `category` of
// their own from a different, seeded vocabulary; `/community-life/organizations`
// binds `type` from a third; `/housing/search` binds no category at all — its
// taxonomy is split into `accommodationTypes` and `amenities`, neither of which
// is a category list. Sending a service category id into any of them fails in
// one of the two silent ways: dropped by the binder and the whole list comes
// back, or bound and matched against nothing and an empty list comes back under
// a 200. So those five sections are **hidden** while a category is selected, and
// the screen says so. Showing them unfiltered under an active category chip
// would be the same lie told the other way round.
//
// ── Two things that were removed rather than wired ──────────────────────────
//
//   1. **The country filter chips.** Their options were computed by walking
//      `mockListings`, `mockJobs` and `mockGuides` and collecting the origin
//      countries they happened to mention. The control offered a country because
//      a fixture named it. Country-of-origin scoping is now the community
//      filter's job — `<CommunityFilterBar>`, already mounted below, which
//      projects through the one `lib/community/scope.ts` and states that it is
//      doing so.
//
//   2. **`locationQuery`.** Dead state: no input was ever bound to it, so it was
//      permanently `''` and every `matchesLocation` check it guarded was
//      permanently true. It is gone rather than given an input, because the
//      location this screen searches near is the one in the location store, set
//      by `<GlobalLocationSelector>`, and two competing location inputs on one
//      screen is how they come to disagree.
//
// Help & Tutorials stays on fixtures deliberately: `mocks/explore-data.ts` is the
// application's **own help documentation** — "how to verify a provider", written
// as authored steps and shipped in the bundle. It is not member data and not
// platform content, so it is reference material in the same bucket as
// `mocks/countries.ts`, and there is no route that would serve it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SearchBar } from '@/components/SearchBar';
import { CategoryChip } from '@/components/CategoryChip';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { ProviderCard } from '@/components/ProviderCard';
import { mockTutorials } from '@/mocks/explore-data';
import { TutorialCard } from '@/components/explore/TutorialCard';

// Certified provider client — `GET /providers` and `GET /providers/categories`.
import { useProviderSearch, useServiceCategories } from '@/hooks/providers';

// Hyperlocal integrations
import { useLocationStore, getActiveLocation, locationLabel } from '@/store/location';
import { providerScopeParams, resolveDiscoverScope } from '@/lib/discover-scope';
import { GlobalLocationSelector } from '@/components/GlobalLocationSelector';
import { MapPreviewCard } from '@/components/MapPreviewCard';

// Frontend Phase 18 — §30's single saved-search control. See the call site.
import { SaveSearchButton } from '@/components/automation';

// Frontend Phase 13 — Multi-Community Expansion (§38, GAP-010).
//
// The community filter is now the only origin-country scoping control on this
// screen; the fixture-derived country chips it used to sit beside are gone.
import {
  CommunityContentSection,
  CommunityFilterBar,
  CommunityScopeNote,
} from '@/components/community-directory';
import { useCommunityScope } from '@/hooks/communities';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { trackContentImpression } from '@/lib/analytics/content-events';
import { photoUriOf } from '@/lib/media-url';

/** A pin on the map view. Only providers carry coordinates this screen can plot. */
interface MapPin {
  id: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  rating: number;
}

export default function SearchScreen() {
  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });

  const params = useLocalSearchParams<{ category?: string }>();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(params.category ?? null);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [isLocationSelectorOpen, setIsLocationSelectorOpen] = useState(false);

  // Frontend Phase 13. The active community scope. The sections apply the
  // projection themselves through `useScopedContent`; this is read here only to
  // render the note that says a projection is in force.
  const { projection: communityProjection } = useCommunityScope();

  const store = useLocationStore();
  const activeLocation = getActiveLocation(store);

  /** The real service taxonomy. Replaces `mockCategories`. */
  const { categories, isLoading: categoriesLoading } = useServiceCategories();

  /**
   * The selected category, resolved against the real taxonomy.
   *
   * Two different spellings leave this screen, because two routes bind two
   * different fields — `categoryId` for providers, the slug for guides. Holding
   * the whole record rather than a bare string is what keeps those from being
   * swapped, which would fail silently on both.
   */
  const activeCategory = useMemo(
    () => categories.find((c) => c.categoryId === selectedCategory) ?? null,
    [categories, selectedCategory]
  );

  // A deep link may name a category before the taxonomy has loaded, and it may
  // name one that no longer exists. `activeCategory` being null while
  // `selectedCategory` is set is the second case, and the chips simply show
  // nothing selected — the filter is not applied on a guess.
  const hasCategoryFilter = Boolean(activeCategory);

  /**
   * `GET /providers`.
   *
   * `enabled` gates the request on the member having actually searched: this is
   * the search tab, and mounting it should not issue a platform-wide provider
   * read before a word is typed.
   */
  const hasCriteria = Boolean(query.trim()) || hasCategoryFilter || hasSearched;

  const providerSearch = useProviderSearch(
    {
      query: query.trim() || undefined,
      categoryId: activeCategory?.categoryId,
      // The whole country, the member's town, or a real distance — the same
      // reach Discover uses. See `lib/discover-scope.ts`.
      ...providerScopeParams(resolveDiscoverScope(activeLocation, store.searchRadius)),
    },
    { enabled: hasCriteria }
  );

  const providers = providerSearch.page?.items ?? [];

  /**
   * One impression per provider the member was actually shown.
   *
   * **Wired here and deliberately nowhere else.** `content.impression` is
   * registered and client-submittable, and its own schema says "accepted and
   * stored; no metric is served from it yet, because reach is not published".
   * An event that feeds nothing should cost as little as it earns, so it goes
   * on the one surface the platform would need reach for first rather than on
   * every list in the app.
   *
   * Keyed on a fingerprint of the ids rather than on `providers`, which is a
   * fresh array on every render — emitting inside the map, or on the array
   * identity, would fill the two-hundred-record ring buffer with one search.
   */
  const providerImpressionKey = providers.map((item) => item.providerId).join(',');

  useEffect(() => {
    if (!providerImpressionKey) return;

    providerImpressionKey.split(',').forEach((providerId, index) => {
      trackContentImpression({
        contentType: 'provider',
        contentId: providerId,
        position: index + 1,
        surface: 'search',
      });
    });
  }, [providerImpressionKey]);

  /**
   * Map pins.
   *
   * Providers only. The previous version also plotted `mockJobs` and
   * `mockEvents`, whose coordinates were fixture constants — a map of places
   * that do not exist is a worse failure than a sparse one, and the jobs and
   * events sections are owned by `<CommunityContentSection>` now, so this screen
   * does not hold their rows to plot. A provider with no coordinates is skipped
   * rather than pinned at a default, which would put it in the Gulf of Guinea.
   */
  const mapPins = useMemo<MapPin[]>(() => {
    const pins: MapPin[] = [];

    for (const item of providers) {
      const { latitude, longitude } = item.location;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;

      pins.push({
        id: item.providerId,
        title: item.name,
        category: item.category.name,
        latitude,
        longitude,
        distanceKm: item.location.distanceKm ?? 0,
        rating: item.reviewSummary.average,
      });
    }

    return pins;
  }, [providers]);

  /** Help articles matching the query. In-bundle documentation — see the header. */
  const filteredHelpTutorials = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return mockTutorials.filter(
      (tut) =>
        tut.title.toLowerCase().includes(q) ||
        tut.summary.toLowerCase().includes(q) ||
        tut.steps.some(
          (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
        )
    );
  }, [query]);

  const clearSearch = () => {
    setQuery('');
    setSelectedCategory(null);
    setHasSearched(false);
  };

  /**
   * Whether the screen is showing its pre-search landing view.
   *
   * Unchanged in spirit from the original, minus the dead `locationQuery`.
   */
  const showLanding = !query && !hasSearched && !selectedCategory;

  /**
   * Whether to say "nothing at all matched".
   *
   * Deliberately narrow. This screen can only speak for the one result set it
   * owns — providers — because the other five report their own states inside
   * `<CommunityContentSection>`. Claiming "no results" over sections that are
   * still loading, or that failed, is the collapse of *error* into *empty* that
   * the blocked-list screen documents at length: opposite facts, and the
   * reassuring one is the wrong guess.
   */
  const providersEmpty =
    !providerSearch.isLoading && !providerSearch.isError && providers.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      {/* Search Header */}
      <View className="bg-surface-card px-4 pt-2 pb-3 border-b border-faint">
        <View className="flex-row items-center">
          <View className="flex-1">
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="What are you looking for?"
              editable
              autoFocus={!params.category}
              onSubmit={() => setHasSearched(true)}
            />
            {/* Custom Proximity Switcher Trigger / Input */}
            <TouchableOpacity
              onPress={() => setIsLocationSelectorOpen(true)}
              className="mt-2 h-11 bg-surface-background border border-subtle rounded-xl px-3.5 flex-row items-center justify-between"
            >
              <View className="flex-row items-center">
                <Text className="text-sm mr-2">📍</Text>
                <Text className="text-xs font-black text-content-strong">
                  Search Near: {locationLabel(activeLocation)}
                </Text>
              </View>
              <Text className="text-xs text-content-muted font-bold">Change ▾</Text>
            </TouchableOpacity>
          </View>
          <View className="ml-2 h-full justify-start pt-2">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={viewMode === 'list' ? 'Show results on a map' : 'Show results as a list'}
              onPress={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
              className="w-10 h-10 items-center justify-center mb-2"
            >
              <Text className="text-lg">{viewMode === 'list' ? '🗺️' : '📋'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Frontend Phase 13, §38/§54. The same community filter component every
            other scoped surface mounts. The selection lives in the shared context
            store, so navigating from a result to its detail screen and back does
            not lose it — which is what §54 asks for. */}
        <View className="-mx-4 mt-3">
          <CommunityFilterBar compact />
        </View>

        {!communityProjection.isUnscoped ? (
          <View className="mt-1">
            <CommunityScopeNote projection={communityProjection} compact />
          </View>
        ) : null}

        {/* Category Chips — the real service taxonomy. */}
        {categories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-3"
            contentContainerStyle={{ paddingRight: 16 }}
          >
            <CategoryChip
              label="All"
              isSelected={!selectedCategory}
              onPress={() => setSelectedCategory(null)}
            />
            {categories.slice(0, 6).map((cat) => (
              <CategoryChip
                key={cat.categoryId}
                label={cat.name}
                icon={cat.icon ?? undefined}
                isSelected={selectedCategory === cat.categoryId}
                onPress={() =>
                  setSelectedCategory(selectedCategory === cat.categoryId ? null : cat.categoryId)
                }
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {/* Content */}
      {showLanding ? (
        <ScrollView
          className="flex-1 px-6 pt-6"
          contentContainerStyle={{ paddingBottom: bottomInset }}
        >
          {/* ── Why there are no "Recent Searches" here any more ──────────────
              The list was a hardcoded array — 'Cleaner', 'Driver', 'African
              food' — presented under a clock icon as *this member's* search
              history. Nobody had searched for any of them. There is no
              search-history route on the platform, and nothing on the device
              records one, so the section is gone rather than invented. */}

          <Text className="text-sm font-semibold text-content-faint uppercase tracking-wider mb-3">
            Popular Categories
          </Text>

          {categoriesLoading ? (
            <ActivityIndicator className="mt-4" />
          ) : categories.length === 0 ? (
            <Text className="text-sm text-content-muted font-semibold">
              Service categories are unavailable just now.
            </Text>
          ) : (
            <View className="flex-row flex-wrap">
              {categories.map((cat) => (
                <CategoryChip
                  key={cat.categoryId}
                  label={cat.name}
                  icon={cat.icon ?? undefined}
                  onPress={() => {
                    setSelectedCategory(cat.categoryId);
                    setHasSearched(true);
                  }}
                />
              ))}
            </View>
          )}
        </ScrollView>
      ) : viewMode === 'map' ? (
        <View className="flex-1 p-4 bg-surface-background">
          <MapPreviewCard
            center={activeLocation}
            pins={mapPins}
            radiusKm={store.searchRadius > 0 ? store.searchRadius : 5}
          />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 py-4"
          contentContainerStyle={{ paddingBottom: bottomInset }}
          showsVerticalScrollIndicator={false}
        >
          {/* Frontend Phase 18, §30. The one saved-search control, shared by
              every list surface: this screen passes its own filters and knows
              nothing about alerts, frequencies or automations. §30 forbids
              duplicating saved-search logic across modules, and the way that is
              kept is that there is nothing here to duplicate. */}
          <View className="mb-5">
            <SaveSearchButton
              subject="providers"
              criteria={{
                ...(query ? { q: query } : {}),
                ...(activeCategory ? { categoryId: activeCategory.categoryId } : {}),
              }}
              querySummary={[query, activeCategory?.name].filter(Boolean).join(' · ')}
              suggestedName={query || activeCategory?.name || 'Saved search'}
            />
          </View>

          {/* ❓ HELP & TUTORIALS SECTION */}
          {filteredHelpTutorials.length > 0 && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest">
                  ❓ Help &amp; Tutorials ({filteredHelpTutorials.length})
                </Text>
              </View>
              {filteredHelpTutorials.map((item) => (
                <TutorialCard key={item.id} tutorial={item} />
              ))}
            </View>
          )}

          {/* 👤 SERVICE PROVIDERS — GET /providers */}
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-3 px-1">
              <Text className="text-xs font-black text-content-faint uppercase tracking-widest">
                👤 Service Providers
                {providers.length > 0 ? ` (${providers.length})` : ''}
              </Text>
            </View>

            {providerSearch.isLoading ? (
              <ActivityIndicator className="my-4" />
            ) : providerSearch.isError ? (
              /* Distinct from the empty state on purpose. "There are no plumbers
                 near you" and "we could not ask" are opposite facts. */
              <View className="bg-surface-card rounded-2xl border border-subtle p-4">
                <Text className="text-xs font-bold text-content-secondary">
                  We could not reach service providers just now.
                </Text>
              </View>
            ) : providersEmpty ? (
              <View className="bg-surface-card rounded-2xl border border-subtle p-4">
                <Text className="text-xs font-bold text-content-secondary">
                  No service providers matched this search.
                </Text>
              </View>
            ) : (
              providers.map((item) => (
                <ProviderCard
                  key={item.providerId}
                  listingId={item.providerId}
                  title={item.name}
                  category={item.category.name}
                  areaName={item.location.areaName ?? undefined}
                  distanceKm={item.location.distanceKm ?? undefined}
                  rating={item.reviewSummary.average}
                  reviewCount={item.reviewSummary.totalReviews}
                  // The anonymous image route, from the cover's id (14 Oct 2026).
                  coverImageUrl={photoUriOf(item.coverMedia) ?? undefined}
                  isVerified={item.isVerified}
                  isOpenNow={item.isOpenNow ?? undefined}
                  variant="list"
                />
              ))
            )}
          </View>

          {/* 📖 GUIDES — GET /guides, which binds the taxonomy as a slug. */}
          <View className="mb-6">
            <CommunityContentSection
              domain="guide"
              query={query.trim() || undefined}
              category={activeCategory?.slug}
              hideScopeNote
            />
          </View>

          {hasCategoryFilter ? (
            /* Sections that cannot honour the active category are withheld rather
               than shown unfiltered. See the header: none of `/jobs`,
               `/marketplace/search`, `/housing/search`, `/community-life/events`
               or `/community-life/organizations` binds the *service* taxonomy —
               three of them bind a category of their own from a different
               vocabulary, `/housing/search` binds none at all, and
               `/community-life/organizations` binds `type`. A value from the
               wrong vocabulary matches nothing and returns an empty page under a
               200; a parameter the server drops returns everything wearing a
               filter's clothes. Both lie, in opposite directions. */
            <View className="bg-surface-card rounded-2xl border border-subtle p-4 mb-6">
              <Text className="text-xs font-bold text-content-secondary">
                Jobs, marketplace, housing, events and organisations are not shown
                while a service category is selected — that filter applies to
                service providers and guides only.
              </Text>
            </View>
          ) : (
            <>
              {/* 💼 JOBS — GET /jobs */}
              <View className="mb-6">
                <CommunityContentSection
                  domain="job"
                  query={query.trim() || undefined}
                  hideScopeNote
                />
              </View>

              {/* 🛒 MARKETPLACE — POST /marketplace/search */}
              <View className="mb-6">
                <CommunityContentSection
                  domain="marketplace"
                  query={query.trim() || undefined}
                  hideScopeNote
                />
              </View>

              {/* 🏠 HOUSING — GET /housing/search */}
              <View className="mb-6">
                <CommunityContentSection
                  domain="housing"
                  query={query.trim() || undefined}
                  hideScopeNote
                />
              </View>

              {/* 🎉 EVENTS — GET /community-life/events */}
              <View className="mb-6">
                <CommunityContentSection
                  domain="event"
                  query={query.trim() || undefined}
                  hideScopeNote
                />
              </View>

              {/* 🏛 ORGANISATIONS — GET /community-life/organizations */}
              <View className="mb-6">
                <CommunityContentSection
                  domain="organization"
                  query={query.trim() || undefined}
                  hideScopeNote
                />
              </View>

              {/* 📢 COMMUNITY UPDATES — **no search route exists on the
                  platform**, so this section says that rather than showing an
                  empty list. See `NOT_SEARCHABLE_DOMAINS` in
                  `CommunityContentSection` for the three routes that were
                  checked and what each of them actually is. The distinction it
                  draws — "we did not look" versus "nothing matched" — is the one
                  §2 exists for, and this section is where it was being lost. */}
              <View className="mb-6">
                <CommunityContentSection domain="update" hideScopeNote />
              </View>
            </>
          )}

          {providersEmpty && filteredHelpTutorials.length === 0 && query ? (
            <EmptyState
              icon="🔍"
              title="Nothing matched that search"
              description={`We could not find service providers matching "${query}". The sections above report separately on guides, jobs, events and organisations.`}
              action={<Button label="Clear Search" variant="outline" size="sm" onPress={clearSearch} />}
            />
          ) : null}

          <View className="h-10" />
        </ScrollView>
      )}

      {/* Global Location Selector modal drawer */}
      <GlobalLocationSelector
        visible={isLocationSelectorOpen}
        onClose={() => setIsLocationSelectorOpen(false)}
      />
    </SafeAreaView>
  );
}
