import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';

import { ContributorRow, useContributorDirectory } from '@/components/knowledge/ContributorDirectory';
import { useKnowledgeSearchStore } from '@/store/knowledge-search';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { ListState } from '@/components/ListState';
import { useThemeTokens } from '@/design-system';
import {
  countryFlagEmoji,
  fetchKnowledgeCountries,
  fetchKnowledgeStatistics,
  knowledgeCountryKeys,
  type KnowledgeCountrySummary,
} from '@/lib/api/knowledge-countries-api';
import type { PublicCreator } from '@/types/creator-economy';

// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Knowledge Hub, "Contributors" tab
//
// ── Contributors are real (20 Oct 2026) ──────────────────────────────────────
//
// This tab once ranked fixture authors, then said "Diaspora does not have a
// contributor directory" on the strength of an audit that was wrong: the Creator
// module serves `GET /creators` (search, country, facets). The list now comes
// from there (`ContributorDirectory`); each row opens the contributor's page.
//
// ── What replaced the fabricated country cards, and it is real ───────────────
//
// The footer listed `mockCountryStats` — hand-written provider counts, expert
// counts, "updates today" figures and landmark photographs. The platform does
// keep country knowledge figures, on two routes no frontend file had called:
//
//     GET /knowledge/countries                            (ListCountryDirectoriesQuery)
//     GET /knowledge/countries/{countryCode}/statistics   (GetKnowledgeStatisticsQuery)
//
// Both are wired here through `lib/knowledge-countries-api.ts`. The country grid
// is the first; the panel that appears once a country filter is chosen is the
// second.
//
// **The old `CountryStats` component is deliberately not reused.** It renders
// `providerCount`, `expertCount`, `updatesToday`, `flag` and
// `landmarkImageUrl` — five fields the real contract does not have and Knowledge
// genuinely does not know. Feeding it real data would have meant inventing those
// five again, so the rows below render only fields the server actually returns.
//
// ── Why the search filter is applied on the client here ──────────────────────
//
// `ListCountryDirectoriesQuery` is deliberately unpaged and takes no query
// parameter — the backend's own note says there are fewer than two hundred
// countries and a cursor over a list that short is machinery nobody needs. So
// the whole list is in hand and narrowing it locally cannot hide a row the
// server did not send. That is the opposite of the client-side narrowing
// `community-directory-api.ts` warns about, where the server had paged first.
//
// ── One list for the whole tab (FARCH-004, 27 Nov 2026) ──────────────────────
//
// The contributor directory pages ("Show more contributors"), and it drew its
// rows with `.map()` in the header of this tab's country list, so every page a
// member asked for stayed mounted. The tab is one FlashList now: the
// contributors are its first rows and the countries its last, and what sits
// between them (the end of the directory, the chosen country's figures and
// "Browse by country") is one row of its own. Each kind is its own item type,
// so a contributor's row is never recycled into a country's.
// ─────────────────────────────────────────────────────────────────────────────

/** A contributor, what sits between the contributors and the countries, or a country. */
type TabRow =
  | { kind: 'contributor'; key: string; creator: PublicCreator }
  | { kind: 'between'; key: string; content: React.ReactElement }
  | { kind: 'country'; key: string; country: KnowledgeCountrySummary };

/** Module-level, so the list keeps a row until its item changes. */
function renderTabRow({ item }: ListRenderItemInfo<TabRow>) {
  switch (item.kind) {
    case 'contributor':
      return <ContributorRow creator={item.creator} />;
    case 'between':
      return item.content;
    case 'country':
      return <CountryRow country={item.country} />;
  }
}

const tabRowKey = (row: TabRow) => row.key;
const tabRowType = (row: TabRow) => row.kind;

export default function KnowledgeContributorsScreen() {
  const tokens = useThemeTokens();

  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });

  const { searchQuery, selectedCountryCode } = useKnowledgeSearchStore();

  // The contributor directory, which exists (20 Oct 2026).
  const directory = useContributorDirectory({ query: searchQuery, countryCode: selectedCountryCode });

  const countries = useQuery({
    queryKey: knowledgeCountryKeys.list(),
    queryFn: ({ signal }) => fetchKnowledgeCountries({ signal }),
    // An hour. Which countries the platform holds knowledge for is editorial
    // configuration that changes when a country page is launched, not while a
    // member is holding the phone.
    staleTime: 60 * 60 * 1000,
  });

  const statistics = useQuery({
    queryKey: knowledgeCountryKeys.statistics(selectedCountryCode ?? ''),
    queryFn: ({ signal }) => fetchKnowledgeStatistics(selectedCountryCode as string, { signal }),
    enabled: Boolean(selectedCountryCode),
    // Five minutes: the server caches these itself, and the usage counters move
    // slowly enough that a fresher figure would not tell anybody anything new.
    staleTime: 5 * 60 * 1000,
  });

  const query = searchQuery.trim().toLowerCase();

  const visibleCountries = useMemo(
    () =>
      (countries.data ?? []).filter((country) =>
        query
          ? country.displayName.toLowerCase().includes(query) ||
            country.countryCode.toLowerCase().includes(query)
          : true
      ),
    [countries.data, query]
  );

  // Built from what they show, so a row is redrawn only when its contributor or
  // its country changes.
  const contributorRows = useMemo(
    () =>
      directory.rows.map(
        (creator): TabRow => ({ kind: 'contributor', key: `contributor:${creator.creatorId}`, creator })
      ),
    [directory.rows]
  );
  const countryRows = useMemo(
    () =>
      visibleCountries.map(
        (country): TabRow => ({ kind: 'country', key: `country:${country.countryCode}`, country })
      ),
    [visibleCountries]
  );

  // Rebuilt on every render, and the only row that is: the figures and "Show
  // more contributors" change under it.
  const between: TabRow = {
    kind: 'between',
    key: 'between',
    content: (
      <View>
        {directory.footer}

        {/* Real figures for the chosen country, from the statistics route */}
        {selectedCountryCode ? (
          <View className="bg-surface-card rounded-3xl border border-subtle p-5 mb-5">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
              {countryFlagEmoji(selectedCountryCode)} {selectedCountryCode} · Knowledge
            </Text>

            {statistics.isLoading ? (
              <ActivityIndicator color={tokens.color.text.placeholder} />
            ) : statistics.isError ? (
              <Text className="text-xs text-content-muted leading-relaxed">
                We could not load the figures for this country just now.
              </Text>
            ) : statistics.data ? (
              <View>
                <View className="flex-row flex-wrap">
                  <Figure value={statistics.data.totalGuides} label="Guides" />
                  <Figure value={statistics.data.verifiedGuides} label="Verified" />
                  <Figure value={statistics.data.officialGuides} label="Official" />
                  <Figure value={statistics.data.communityGuides} label="Community" />
                  <Figure value={statistics.data.categoryCount} label="Categories" />
                  <Figure value={statistics.data.learningPathCount} label="Learning paths" />
                </View>

                {statistics.data.languages.length > 0 && (
                  <Text className="text-[11px] text-content-faint mt-3 leading-relaxed">
                    Written in {statistics.data.languages.join(', ')}
                  </Text>
                )}

                {/*
                  `lastPublishedAt` is nullable on the wire and null means
                  "nobody has published here yet" — not "we could not read
                  it". The two need different sentences.
                */}
                <Text className="text-[11px] text-content-faint mt-1 leading-relaxed">
                  {statistics.data.lastPublishedAt
                    ? `Last published ${new Date(statistics.data.lastPublishedAt).toLocaleDateString()}`
                    : 'Nothing published for this country yet'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
          🌍 Browse by country
        </Text>
      </View>
    ),
  };

  return (
    <View className="flex-1 bg-surface-background">
      <FlashList
        data={[...contributorRows, between, ...countryRows]}
        keyExtractor={tabRowKey}
        getItemType={tabRowType}
        renderItem={renderTabRow}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}
        // A page of contributors arrives above what follows them. Held in place,
        // a "Show more contributors" at the top of the screen would stay under the
        // member's finger while the rows it asked for loaded out of sight above
        // it. They appear where the button was, as before this was a FlashList.
        maintainVisibleContentPosition={{ disabled: true }}
        ListHeaderComponent={
          <>
            {directory.heading}
            {/* The directory's first read, a failed read, or nobody listed, where its rows would be. */}
            {contributorRows.length === 0 ? <ListState {...directory.state} /> : null}
          </>
        }
        // The country list's own states, where its rows would be. The list
        // itself is never empty: the contributors, and what follows them, are
        // rows too.
        ListFooterComponent={
          countryRows.length === 0 ? (
            <ListState
              loading={countries.isLoading}
              loadingLabel="Loading countries"
              error={countries.isError && { icon: 'earth-outline', title: 'We could not load the country list' }}
              onRetry={() => void countries.refetch()}
              isEmpty
              empty={{
                icon: 'earth-outline',
                title: 'No countries match',
                message: query
                  ? 'Try a different search term to find a country page.'
                  : 'The platform does not hold knowledge for any country yet.',
              }}
            />
          ) : null
        }
      />
    </View>
  );
}

/**
 * One country, showing only what `CountryDirectorySummaryResponse` carries.
 *
 * `directoryViews` is on the card because the backend puts it there for exactly
 * this purpose — it is how many people have asked about the country, which for a
 * diaspora platform is a genuinely different list from the largest countries.
 */
function CountryRow({ country }: { country: KnowledgeCountrySummary }) {
  const flag = countryFlagEmoji(country.countryCode);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/country/${country.countryCode}`)}
      activeOpacity={0.9}
      className="bg-surface-card rounded-2xl border border-subtle p-4 mb-2.5"
      accessibilityRole="button"
      accessibilityLabel={`Open the ${country.displayName} country page`}
    >
      <View className="flex-row items-center">
        {flag ? <Text className="text-2xl mr-2">{flag}</Text> : null}
        <Text className="text-sm font-black text-content-primary flex-1">{country.displayName}</Text>
      </View>

      {country.summary ? (
        <Text className="text-xs text-content-muted mt-1.5 leading-relaxed" numberOfLines={2}>
          {country.summary}
        </Text>
      ) : null}

      <View className="flex-row mt-3">
        <Figure value={country.guideCount} label="Guides" />
        <Figure value={country.categoryCount} label="Categories" />
        <Figure value={country.directoryViews} label="Views" />
      </View>
    </TouchableOpacity>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <View className="mr-6 mb-1">
      <Text className="text-sm font-black text-content-primary">{formatCount(value)}</Text>
      <Text className="text-[10px] text-content-faint font-bold uppercase">{label}</Text>
    </View>
  );
}

/** Thousands abbreviated; everything below is shown exactly as counted. */
function formatCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
