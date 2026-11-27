// Discover: the pins on the inline map preview, mapped from each tab's own shape.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { useMemo } from 'react';
import { pinPlaceOf } from '@/lib/platform/listing-place';
import { useMemberCurrency } from '@/lib/domain/member-currency';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { OriginFilter } from '@/components/screens/discover/useOriginFilter';

/** One pin on the inline map preview. */
interface MapPin {
  id: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  priceText?: string;
  rating?: number;
}

export function useMapPins(search: DiscoverSearch, origin: OriginFilter) {
  const { activeTab } = search;
  const {
    filteredListings, filteredJobs, displayedHousingListings, displayedMarketplaceListings,
  } = origin;

  // Compute pins for map representation
  /**
   * Pins for the inline map preview.
   *
   * ── Why this stopped being one `any[]` walk over four shapes ──────────────
   *
   * It read `item.listingId || item.jobId || item.id`, `item.title` and
   * `item.rating?.average` off an `any`, which happened to line up with the four
   * *fixtures*. Two of those four are certified now and the third and fourth
   * always were, and the real shapes do not agree: a provider is `providerId` /
   * `name` / `reviewSummary.average`, not `listingId` / `title` / `rating`. Under
   * `any` that mismatch is invisible — every pin would have carried an empty id
   * and an undefined title, and tapping one would have gone nowhere.
   *
   * So each tab maps its own shape, explicitly. `unknown` rather than `any` for
   * the two opaque ones, so nothing is read without being narrowed first.
   */
  // A listing with no currency on it is in the member's own, never GBP.
  const memberCurrency = useMemberCurrency();
  const mapPins = useMemo<MapPin[]>(() => {

    if (activeTab === 'Providers') {
      return filteredListings.flatMap((item) => {
        const coordinates = pinPlaceOf(item.location as Record<string, unknown>);
        if (!coordinates) return [];

        return [
          {
            id: item.providerId,
            title: item.name,
            category: item.category.name,
            ...coordinates,
            rating: item.reviewSummary.average,
          },
        ];
      });
    }

    if (activeTab === 'Jobs') {
      return filteredJobs.flatMap((item) => {
        const coordinates = pinPlaceOf(item.location as Record<string, unknown> | undefined);
        if (!coordinates) return [];

        const category = item.category;

        return [
          {
            id: String(item.jobId ?? item.id ?? ''),
            title: String(item.title ?? ''),
            category:
              typeof category === 'string'
                ? category
                : String((category as Record<string, unknown> | undefined)?.name ?? 'Job'),
            ...coordinates,
          },
        ];
      });
    }

    if (activeTab === 'Housing') {
      return displayedHousingListings.flatMap((item) => {
        const coordinates = pinPlaceOf(item.location as unknown as Record<string, unknown>);
        if (!coordinates) return [];

        return [
          {
            id: item.id,
            title: item.title,
            category: 'Housing',
            ...coordinates,
            priceText: item.rent != null ? `${item.rent} ${item.currency}` : undefined,
            rating: item.host?.rating?.average,
          },
        ];
      });
    }

    if (activeTab === 'Marketplace') {
      return displayedMarketplaceListings.flatMap((item) => {
        const coordinates = pinPlaceOf(item.location as unknown as Record<string, unknown>);
        if (!coordinates) return [];

        return [
          {
            id: item.id,
            title: item.title,
            category: 'Marketplace',
            ...coordinates,
            priceText: item.price !== undefined ? `${item.price} ${item.currency || memberCurrency.code}` : undefined,
            rating: item.seller?.rating,
          },
        ];
      });
    }

    return [];
  }, [activeTab, filteredListings, filteredJobs, displayedHousingListings, displayedMarketplaceListings, memberCurrency.code]);

  return { mapPins };
}

/** What `useMapPins` holds, as the screen reads it. */
export type MapPins = ReturnType<typeof useMapPins>;
