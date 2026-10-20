import React from 'react';
import { FlatList, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { ContributorDirectory } from '@/components/knowledge/ContributorDirectory';
import { useKnowledgeSearchStore } from '@/store/knowledge-search';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useThemeTokens } from '@/design-system';
import {
  countryFlagEmoji,
  fetchKnowledgeCountries,
  fetchKnowledgeStatistics,
  knowledgeCountryKeys,
  type KnowledgeCountrySummary,
} from '@/lib/knowledge-countries-api';

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
// ─────────────────────────────────────────────────────────────────────────────

export default function KnowledgeContributorsScreen() {
  const tokens = useThemeTokens();

  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });

  const { searchQuery, selectedCountryCode } = useKnowledgeSearchStore();

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

  const visibleCountries = (countries.data ?? []).filter((country) =>
    query
      ? country.displayName.toLowerCase().includes(query) ||
        country.countryCode.toLowerCase().includes(query)
      : true
  );

  return (
    <View className="flex-1 bg-surface-background">
      <FlatList
        data={visibleCountries}
        keyExtractor={(item) => item.countryCode}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}
        ListHeaderComponent={() => (
          <View>
            {/* The contributor directory, which exists (20 Oct 2026). */}
            <ContributorDirectory query={searchQuery} countryCode={selectedCountryCode} />

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
        )}
        renderItem={({ item }) => <CountryRow country={item} />}
        ListEmptyComponent={() => (
          <View className="items-center justify-center py-12 bg-surface-card rounded-3xl border border-faint p-6">
            {countries.isLoading ? (
              <ActivityIndicator color={tokens.color.text.placeholder} />
            ) : countries.isError ? (
              <>
                <Text className="text-sm font-bold text-content-strong text-center">
                  We could not load the country list
                </Text>
                <TouchableOpacity
                  onPress={() => void countries.refetch()}
                  className="bg-primary-500 px-5 py-2.5 rounded-xl mt-4"
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                >
                  <Text className="text-white font-black text-xs">Try again</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text className="text-4xl mb-2" accessibilityElementsHidden importantForAccessibility="no">
                  🌍
                </Text>
                <Text className="text-sm font-bold text-content-strong">No countries match</Text>
                <Text className="text-xs text-content-faint text-center mt-1 leading-relaxed max-w-[240px]">
                  {query
                    ? 'Try a different search term to find a country page.'
                    : 'The platform does not hold knowledge for any country yet.'}
                </Text>
              </>
            )}
          </View>
        )}
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
