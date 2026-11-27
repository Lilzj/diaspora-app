// Discover: the origin filter, a community scope or the country picker, and every list it narrows.
// The picker offers the countries of the homes and items on screen, and drops a choice that is no
// longer among them. Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { unratedSortNote } from '@/lib/platform/discover-filters';
import { useCommunityScope } from '@/hooks/communities';
import { getCommunityFeatureFlags } from '@/config/multi-community-gaps';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { DiscoverFilters } from '@/components/screens/discover/useDiscoverFilters';
import type { ListingSearches } from '@/components/screens/discover/useListingSearches';
import type { ProviderTab } from '@/components/screens/discover/useProviderTab';
import type { JobTab } from '@/components/screens/discover/useJobTab';

export function useOriginFilter(
  search: DiscoverSearch,
  filters: DiscoverFilters,
  listings: ListingSearches,
  providers: ProviderTab,
  jobs: JobTab,
) {
  const { activeTab } = search;
  const { housingSort, marketSort } = filters;
  const { housingListings, marketplaceListings } = listings;
  const { baseListings } = providers;
  const { baseJobs } = jobs;

  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);

  // Frontend Phase 13. The active community scope, already projected onto the
  // country-of-origin codes the certified data actually carries.
  const communityFlags = getCommunityFeatureFlags();
  const { projection: communityProjection } = useCommunityScope();

  /**
   * The origin-country codes this screen filters on, and where they came from.
   *
   * The community scope wins when one is active, because the member chose a
   * community and that is the more specific request. The manual country picker is
   * the fallback and is unchanged, which is what keeps §69 true: with no community
   * selected this resolves to exactly `[selectedCountryCode]` — or `[]` — and every
   * filter below behaves as it did before Phase 13.
   */
  const originFilter = useMemo<{ codes: string[]; source: 'community' | 'country' | 'none' }>(() => {
    if (communityFlags.multiCommunityEnabled && !communityProjection.isUnscoped) {
      if (communityProjection.isEmpty) return { codes: [], source: 'community' };
      return { codes: communityProjection.originCountryCodes, source: 'community' };
    }

    return selectedCountryCode
      ? { codes: [selectedCountryCode.toUpperCase()], source: 'country' }
      : { codes: [], source: 'none' };
  }, [communityFlags.multiCommunityEnabled, communityProjection, selectedCountryCode]);

  /**
   * Whether an entity's publisher passes the active origin filter.
   *
   * An entity with no origin does **not** pass a scoped filter. An absent origin is
   * not evidence of belonging, and admitting it would make the filter mean "these
   * countries, plus anything unlabelled" — see `matchesProjection` in
   * `lib/community/scope.ts`, which applies the identical rule on the request path.
   */
  const passesOriginFilter = useCallback(
    (code: string | null | undefined): boolean => {
      if (originFilter.source === 'none') return true;
      // A community scope that resolved to nothing shows nothing, rather than
      // silently widening to everything.
      if (originFilter.codes.length === 0) return false;
      if (!code) return false;
      return originFilter.codes.includes(code.toUpperCase());
    },
    [originFilter]
  );

  const filteredListings = useMemo(
    // `ProviderOwner` carries `originCountryCode` as a bare string — there is no
    // nested `originCountry` object on the certified response, which is the
    // fixture's shape.
    () => baseListings.filter((item) => passesOriginFilter(item.owner.originCountryCode)),
    [baseListings, passesOriginFilter]
  );

  const filteredJobs = useMemo(
    () =>
      baseJobs.filter((item) => {
        const employer = item.employer as Record<string, unknown> | undefined;
        const origin = employer?.originCountry as Record<string, unknown> | undefined;
        const code =
          (typeof origin?.code === 'string' ? origin.code : null) ??
          (typeof employer?.originCountryCode === 'string' ? employer.originCountryCode : null);

        return passesOriginFilter(code);
      }),
    [baseJobs, passesOriginFilter]
  );

  const displayedHousingListings = useMemo(
    () => housingListings.filter((item) => passesOriginFilter(item.host.originCountry?.code)),
    [housingListings, passesOriginFilter]
  );

  const displayedMarketplaceListings = useMemo(
    () => marketplaceListings.filter((item) => passesOriginFilter(item.seller.originCountry?.code)),
    [marketplaceListings, passesOriginFilter]
  );

  // Why "Rating" left the list as it was, when nobody shown has a rating yet.
  const housingRatingNote = unratedSortNote(
    housingSort,
    displayedHousingListings.map((item) => item.host),
    'landlords'
  );
  const marketRatingNote = unratedSortNote(
    marketSort,
    displayedMarketplaceListings.map((item) => item.seller),
    'sellers'
  );

  const availableCountries = useMemo(() => {
    const countriesMap = new Map<string, { code: string; name: string; flag: string }>();

    // Providers and jobs no longer contribute options.
    //
    // The certified provider response carries `owner.originCountryCode` — a bare
    // ISO code, with **no country name and no flag**. This control renders a flag
    // and a name, and there is no route that expands a code into either, so
    // offering a provider's origin here would mean inventing the label. The
    // fixture had a whole `{ code, name, flag }` object to hand, which is the
    // only reason the control ever looked complete.
    //
    // Origin-country scoping is the community filter's job on this screen —
    // `<CommunityFilterBar>`, which resolves real communities with real names.
    if (activeTab === 'Housing') {
      housingListings.forEach((item) => {
        if (item.host.originCountry) {
          countriesMap.set(item.host.originCountry.code, item.host.originCountry);
        }
      });
    } else if (activeTab === 'Marketplace') {
      marketplaceListings.forEach((item) => {
        if (item.seller.originCountry) {
          countriesMap.set(item.seller.originCountry.code, item.seller.originCountry);
        }
      });
    }

    return Array.from(countriesMap.values());
    // `baseListings` and `baseJobs` were listed and never read here, so this
    // recomputed whenever either changed for no reason.
  }, [activeTab, housingListings, marketplaceListings]);

  useEffect(() => {
    if (selectedCountryCode && !availableCountries.some(c => c.code === selectedCountryCode)) {
      setSelectedCountryCode(null);
    }
  }, [availableCountries, selectedCountryCode]);

  return {
    selectedCountryCode, setSelectedCountryCode, communityProjection, originFilter,
    filteredListings, filteredJobs, displayedHousingListings, displayedMarketplaceListings,
    housingRatingNote, marketRatingNote, availableCountries,
  };
}

/** What `useOriginFilter` holds, as the screen reads it. */
export type OriginFilter = ReturnType<typeof useOriginFilter>;
