// Discover: the search a member is running. What they typed, the tab and category, where it reaches
// (their own place, or the place a search sentence from Home named), and the filters a sentence
// sets the way the sheet would. Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which
// composes it.

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { resolveDiscoverScope } from '@/lib/domain/discover-scope';
import { sentenceScope, sentenceFromParams } from '@/lib/platform/search-sentence';
import type { SentenceSearch } from '@/lib/platform/search-place';
import { priceFilterCurrency } from '@/lib/platform/discover-filters';
import { useLocationStore, getActiveLocation } from '@/store/location';
import { type DiscoverTab, isDiscoverTab } from '@/components/screens/discover/tabs';

export function useDiscoverSearch() {
  const store = useLocationStore();
  const activeLocation = getActiveLocation(store);

  // The place an empty state can name, or empty when there is nothing to name.
  // `locationLabel` joins only the parts that exist and answers "Set your
  // location" for the unknown location, which is not a place and must not be
  // dropped into "No providers match in ...".
  const searchRadius = store.searchRadius;

  // ── How far each tab reaches — 15 Sep 2026 ────────────────────────────────
  //
  // "Country-wide" used to send the national centroid as a point, which the
  // server snapped to one town, and "5 km" narrowed to the nearest town's area,
  // which no home has. `resolveDiscoverScope` turns the store into the whole
  // country, the member's town, or a real distance, and each tab below sends
  // only the names its route binds. See `lib/discover-scope.ts`.
  const storeScope = useMemo(
    () => resolveDiscoverScope(activeLocation, searchRadius),
    [activeLocation, searchRadius]
  );

  // ── A search sentence from the Home bar (owner, 5 Nov 2026) ───────────────
  //
  // "3 bedroom flat in Grand Baie" opens here with its place already found
  // (`lib/search-place.ts`). That place is searched for this search only: the
  // member's own location is left alone, and clearing the sentence, or choosing
  // another place in the header, goes back to it.
  const [sentence, setSentence] = useState<SentenceSearch | null>(null);
  const sentenceArea = useMemo(() => (sentence ? sentenceScope(sentence) : null), [sentence]);
  const scope = sentenceArea ?? storeScope;
  // The country the lines below name: the sentence's, when it named one.
  const scopeCountryName =
    sentence?.place?.kind === 'country' ? sentence.place.name : activeLocation.countryName?.trim() || '';

  // The currency the sheet's price boxes are in: the searched country's.
  const priceCurrency = priceFilterCurrency(scope);

  const emptyStatePlace = scope.kind === 'country' ? scopeCountryName : scope.cityName || scopeCountryName;

  // `tab` and `query` from any screen; the rest from a search sentence (`lib/search-sentence.ts`).
  const params = useLocalSearchParams<Record<string, string>>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DiscoverTab>('Providers');

  useEffect(() => {
    if (params.tab && isDiscoverTab(params.tab)) {
      setActiveTab(params.tab);
    }
    if (params.query) {
      setSearchQuery(params.query);
    }
  }, [params.tab, params.query]);

  // Job specific filters state
  const [selectedJobType, setSelectedJobType] = useState<string | null>(null);
  const [bedroomsCount, setBedroomsCount] = useState<number | null>(null);
  // "flat", "individual house": the accommodation types a search sentence named.
  const [homeTypes, setHomeTypes] = useState<readonly string[]>([]);

  // The sentence's filters are set the way the sheet sets them, so the sheet
  // shows them. `at` changes on every search from Home, so typing the same
  // sentence again applies it again.
  const sentenceLocationKey = useRef<string | null>(null);
  const locationKey = [
    activeLocation.countryCode,
    activeLocation.cityName,
    activeLocation.latitude,
    activeLocation.longitude,
    activeLocation.precision,
  ].join('|');

  useEffect(() => {
    const read = sentenceFromParams(params);
    if (!read) {
      // Opened by a link that carries no sentence ("Find Jobs"): the last one no longer applies.
      sentenceLocationKey.current = null;
      setSentence(null);
      return;
    }

    sentenceLocationKey.current = locationKey;
    setSentence(read);
    setActiveTab(read.tab);
    setSearchQuery(read.words);
    setSelectedCategory(null);
    setBedroomsCount(read.minBedrooms);
    setHomeTypes(read.homeTypes);
    setSelectedJobType(read.jobType);
    // Only a new search applies; the location is read here, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.at]);

  // Choosing another place in the header is choosing where to search.
  useEffect(() => {
    if (sentenceLocationKey.current === null || sentenceLocationKey.current === locationKey) return;

    sentenceLocationKey.current = null;
    setSentence((current) => (current?.place ? { ...current, place: null } : current));
  }, [locationKey]);

  const clearSentence = useCallback(() => {
    sentenceLocationKey.current = null;
    setSentence(null);
    setSearchQuery('');
    setBedroomsCount(null);
    setHomeTypes([]);
    setSelectedJobType(null);
  }, []);

  // The radius control reaches round the sentence's town while there is one; a
  // town-wide or country-wide choice is the member's own place again.
  const changeRadius = useCallback(
    (value: number) => {
      store.setSearchRadius(value);
      setSentence((current) => {
        const place = current?.place;
        if (!current || !place) return current;
        if ((place.kind === 'town' || place.kind === 'near-me') && value > 0) {
          return { ...current, place: { ...place, radiusKm: value } };
        }
        return { ...current, place: null };
      });
    },
    [store]
  );

  const sentenceRadius = (() => {
    const place = sentence?.place;
    if (place?.kind === 'near-me') return place.radiusKm;
    if (place?.kind === 'town' && place.latitude !== null) return place.radiusKm;
    return null;
  })();

  // ── Search history starts empty, because it is a history ──────────────────
  //
  // These two lists were `useState(['Jollof', 'Braids', 'Peckham'])` and
  // `useState(['Mama Afrika', 'Visa application', 'Brixton market',
  // 'Immigration tips'])`. A member four minutes into their first session was
  // shown three searches they had never run, under the heading "RECENT
  // SEARCHES", and four London-specific terms under "POPULAR SEARCHES" that no
  // popularity signal had ever been computed for.
  //
  // Recents accumulate from `handleSearch` within the session. Suggestions stay
  // empty until the platform serves a real popularity ranking — the sections
  // below render nothing when their list is empty, which is the honest state.
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [suggestions] = useState<string[]>([]);

  const handleSuggestionPress = (query: string) => {
    setSearchQuery(query);
  };

  const clearRecent = () => setRecentSearches([]);

  return {
    activeLocation, searchRadius, sentence, scope, scopeCountryName, priceCurrency, emptyStatePlace,
    searchQuery, setSearchQuery, selectedCategory, setSelectedCategory, activeTab, setActiveTab,
    selectedJobType, setSelectedJobType, bedroomsCount, setBedroomsCount, homeTypes, clearSentence,
    changeRadius, sentenceRadius, recentSearches, suggestions, handleSuggestionPress, clearRecent,
  };
}

/** What `useDiscoverSearch` holds, as the screen reads it. */
export type DiscoverSearch = ReturnType<typeof useDiscoverSearch>;
