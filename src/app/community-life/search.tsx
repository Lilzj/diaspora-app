// ─────────────────────────────────────────────────────────────────────────────
// Unified Community Life search (§40)
//
// One box across events, organizations, memberships, campaigns, volunteer
// opportunities, polls and neighbourhood events.
//
// Two of those seven — events and organizations — are searched through **B12's
// real** query parameters. The other five go to the adapter. The repository
// merges the two result sets and every row keeps its `source`, so this screen
// can say which half of a result list is real rather than quietly blending
// them. That labelling is the honest version of a federated search that does
// not exist yet, and GAP-021 proposes the route that replaces it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  EmptyState,
  InlineRefusal,
  SimulatedFigure,
  VerifiedFigure,
} from '@/components/community';
import { useCommunitySearch } from '@/hooks/community-life';
import { useLocationStore } from '@/store/location';
import { trackCommunityEvent } from '@/lib/community-analytics';
import type { CommunityEntityType, CommunitySearchResult } from '@/types/community-advanced';

const TYPE_FILTERS: { value: CommunityEntityType | 'all'; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'event', label: 'Events' },
  { value: 'series', label: 'Recurring' },
  { value: 'organization', label: 'Organisations' },
  { value: 'membership', label: 'Membership' },
  { value: 'campaign', label: 'Fundraising' },
  { value: 'opportunity', label: 'Volunteering' },
  { value: 'poll', label: 'Polls' },
];

const TYPE_ICON: Record<CommunityEntityType, string> = {
  event: 'calendar-outline',
  series: 'repeat-outline',
  organization: 'business-outline',
  membership: 'card-outline',
  campaign: 'heart-outline',
  opportunity: 'hand-left-outline',
  poll: 'bar-chart-outline',
  announcement: 'megaphone-outline',
};

export default function CommunitySearchScreen() {
  const { tokens } = useTheme();
  const city = useLocationStore((state) => state.currentLocation?.cityName);

  const [query, setQuery] = useState('');
  const [type, setType] = useState<CommunityEntityType | 'all'>('all');
  const [priceBand, setPriceBand] = useState<'any' | 'free' | 'paid'>('any');
  const [useCity, setUseCity] = useState(true);

  const params = useMemo(
    () => ({
      query,
      types: type === 'all' ? undefined : [type],
      cityName: useCity ? city : undefined,
      priceBand,
    }),
    [query, type, useCity, city, priceBand]
  );

  const { results, backendCount, simulatedCount, isLoading, isError, error, refetch, isEnabled } =
    useCommunitySearch(params, query.trim().length > 1);

  useEffect(() => {
    if (query.trim().length > 1) {
      trackCommunityEvent('community.search.performed', {
        hasQuery: true,
        entityType: type,
        resultCount: results.length,
        filterCount: (type === 'all' ? 0 : 1) + (priceBand === 'any' ? 0 : 1) + (useCity ? 1 : 0),
      });
    }
  }, [results.length]);

  const grouped = useMemo(() => {
    const map = new Map<CommunityEntityType, CommunitySearchResult[]>();
    for (const row of results) {
      const list = map.get(row.entityType) ?? [];
      list.push(row);
      map.set(row.entityType, list);
    }
    return [...map.entries()];
  }, [results]);

  return (
    <CommunityScreen
      title="Search community life"
      isEnabled={isEnabled}
      isLoading={isLoading && query.trim().length > 1}
      error={isError ? error : null}
      onRetry={refetch}
      sticky={
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderBottomColor: tokens.color.border.default,
          }}
          className="border-b px-5 py-3"
        >
          <View
            style={{
              backgroundColor: tokens.color.surface.elevated,
              borderColor: tokens.color.border.default,
            }}
            className="flex-row items-center rounded-full border px-4"
          >
            <Ionicons name="search" size={16} color={tokens.color.text.placeholder} />
            <TextInput
              accessibilityLabel="Search events, organisations, membership, fundraising, volunteering and polls"
              accessibilityHint="Type at least two letters"
              value={query}
              onChangeText={setQuery}
              placeholder="Events, groups, causes, polls…"
              placeholderTextColor={tokens.color.text.placeholder}
              returnKeyType="search"
              autoFocus
              style={{ color: tokens.color.text.primary, minHeight: 44 }}
              className="flex-1 ml-2 text-sm font-semibold"
            />
            {query.length > 0 ? (
              <Ionicons
                name="close-circle"
                size={16}
                color={tokens.color.text.placeholder}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setQuery('')}
              />
            ) : null}
          </View>
        </View>
      }
    >
      <View className="px-5 pt-4">
        <ChipRow accessibilityLabel="Filter by kind" options={TYPE_FILTERS} value={type} onChange={setType} />

        <View className="flex-row mt-1">
          <ChipRow
            accessibilityLabel="Filter by price"
            options={[
              { value: 'any' as const, label: 'Any price' },
              { value: 'free' as const, label: 'Free only' },
            ]}
            value={priceBand === 'paid' ? 'any' : priceBand}
            onChange={(value) => setPriceBand(value)}
          />
        </View>

        {city ? (
          <View className="flex-row mt-1">
            <ChipRow
              accessibilityLabel="Filter by location"
              options={[
                { value: 'city' as const, label: `In ${city}` },
                { value: 'anywhere' as const, label: 'Anywhere' },
              ]}
              value={useCity ? 'city' : 'anywhere'}
              onChange={(value) => setUseCity(value === 'city')}
            />
          </View>
        ) : null}
      </View>

      {query.trim().length <= 1 ? (
        <EmptyState
          icon="search-outline"
          title="What are you looking for?"
          body="Search across events, recurring events, organisations, membership, fundraising, volunteering and polls at once."
        />
      ) : results.length === 0 && !isLoading ? (
        <EmptyState
          icon="search-outline"
          title="Nothing matched"
          body={`Nothing in your community matched “${query.trim()}”. Try a shorter word, or widen the filters.`}
          action="Clear filters"
          onAction={() => {
            setType('all');
            setPriceBand('any');
            setUseCity(false);
          }}
        />
      ) : (
        <View className="px-5 mt-4">
          {/* Where the results came from — §40's labelled merge */}
          <View className="flex-row items-center flex-wrap mb-4">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-bold mr-2"
            >
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </Text>
            {backendCount > 0 ? (
              <View className="mr-2">
                <VerifiedFigure label={`${backendCount} live`} />
              </View>
            ) : null}
            {simulatedCount > 0 ? <SimulatedFigure label={`${simulatedCount} simulated`} /> : null}
          </View>

          {grouped.map(([entityType, rows]) => (
            <View key={entityType} className="mb-5">
              <Text
                accessibilityRole="header"
                style={{ color: tokens.color.text.primary }}
                className="text-sm font-black tracking-tight mb-2.5"
              >
                {TYPE_FILTERS.find((filter) => filter.value === entityType)?.label ?? entityType}
              </Text>

              {rows.map((row) => (
                <View key={`${row.entityType}-${row.entityId}`} className="mb-2.5">
                  <Card
                    onPress={() => router.push(row.actionRoute as never)}
                    accessibilityLabel={`${row.title}. ${row.subtitle ?? ''}${
                      row.locationLabel ? `. ${row.locationLabel}` : ''
                    }${row.distanceKm ? `, ${row.distanceKm.toFixed(1)} kilometres away` : ''}.`}
                    accessibilityHint="Opens it"
                  >
                    <View className="flex-row items-center">
                      <View
                        style={{ backgroundColor: tokens.color.surface.elevated }}
                        className="w-10 h-10 rounded-xl items-center justify-center"
                      >
                        <Ionicons
                          name={TYPE_ICON[row.entityType] as never}
                          size={17}
                          color={tokens.color.text.placeholder}
                        />
                      </View>

                      <View className="flex-1 ml-3">
                        <Text
                          style={{ color: tokens.color.text.primary }}
                          className="text-xs font-black tracking-tight"
                          numberOfLines={2}
                        >
                          {row.title}
                        </Text>
                        {row.subtitle ? (
                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-[11px] font-semibold mt-0.5"
                            numberOfLines={1}
                          >
                            {row.subtitle}
                          </Text>
                        ) : null}
                        {row.locationLabel ? (
                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-[10px] font-bold mt-0.5"
                            numberOfLines={1}
                          >
                            {row.locationLabel}
                            {row.distanceKm ? ` · ${row.distanceKm.toFixed(1)} km` : ''}
                          </Text>
                        ) : null}
                      </View>

                      {row.source === 'simulated' ? (
                        <View className="ml-2">
                          <SimulatedFigure label="Sim" />
                        </View>
                      ) : null}
                    </View>
                  </Card>
                </View>
              ))}
            </View>
          ))}

          <InlineRefusal
            icon="information-circle-outline"
            reason="Events and organisations come from Diaspora's live directory. The other kinds are simulated for now, and are grouped separately rather than mixed in — Diaspora does not yet have one search that ranks them all together."
          />
        </View>
      )}
    </CommunityScreen>
  );
}
