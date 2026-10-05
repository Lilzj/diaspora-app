import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '@/lib/apiClient';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useThemeTokens } from '@/design-system';
import { backOr } from '@/lib/navigation';

/**
 * `NeighborhoodProfileResponse`, as much of it as this screen reads.
 *
 * Declared here rather than imported from `@/mocks/handlers/location`, whose
 * `NeighborhoodOverview` describes a shape the server has never sent. Three of
 * its fields do not exist on the real contract at all, which is how this screen
 * came to render fabricated numbers — see the note on the quality indexes below.
 *
 * The identifier is `areaId`, not `id`: neighbourhoods are Location areas rather
 * than a Housing entity, and they are the one read on the platform that does not
 * key on `id`.
 */
interface NeighborhoodProfile {
  areaId: string;
  name: string;
  slug: string;
  countryCode: string;
  cityName?: string | null;
  regionName?: string | null;
  description?: string | null;
  overview?: string | null;
  safetySummary?: string | null;
  transportSummary?: string | null;
  costOfLivingSummary?: string | null;
  communitySummary?: string | null;
  /**
   * Bands, not scores. Every member of `NeighborhoodLivingIndexResponse` is a
   * string — "High", "Moderate" — and `assessed` says whether anybody has filled
   * them in at all. There is no numeric walkability percentage anywhere on the
   * platform.
   */
  livingIndex?: {
    walkability: string;
    costOfLiving: string;
    accessibility: string;
    assessed: boolean;
  } | null;
  statistics?: {
    listingCount: number;
    insightCount: number;
    /** Keyed `providers`, `jobs`, `housing`, `marketplace`, `events`, `organizations`. */
    nearbyResourceCounts?: Record<string, number>;
  } | null;
}

export default function NeighborhoodHubScreen() {
  const tokens = useThemeTokens();
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<NeighborhoodProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        // Remediation. This called `GET /neighborhood/{id}`, which has never
        // existed on the backend — no module publishes a `/neighborhood`
        // prefix. Every request 404'd, was caught below, and the screen showed
        // "Hub Not Found" for every neighbourhood on the platform, including
        // the real ones.
        //
        // The real route is `GET /housing/neighborhoods/{idOrSlug}` →
        // `GetNeighborhoodProfileQuery`. It binds either an area GUID or a slug,
        // so the slug-keyed links already minted elsewhere keep working.
        const res = await apiClient.get<{ data: NeighborhoodProfile }>(
          `/housing/neighborhoods/${encodeURIComponent(id)}`
        );
        setData(res.data.data);
      } catch (err) {
        console.error('Failed to load neighborhood details', err);
        setError('Neighborhood details could not be found.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [id]);

  // The six counts the resource dashboard shows. Absent rather than zero when
  // the server did not publish them: "0 providers here" and "we do not know how
  // many providers are here" are different claims, and only one of them is true.
  const counts = data?.statistics?.nearbyResourceCounts;
  const countFor = (resource: string): string =>
    typeof counts?.[resource] === 'number' ? String(counts[resource]) : '—';

  const handleResourcePress = (tabName: string) => {
    // This used to overwrite the member's active location with the hub's, built
    // from the fixture's `latitude`/`longitude`. `NeighborhoodProfileResponse`
    // carries **no coordinates** — a neighbourhood is a Location area and the
    // profile does not repeat its geometry — and `PlatformLocation` requires a
    // point, so the only way to keep this behaviour would be to write the
    // member's *old* coordinates under the *new* neighbourhood's name. Discover
    // would then search where the member already was while claiming to search
    // here, which is worse than not re-centring at all.
    //
    // So the hub navigates and leaves the location alone. Re-centring on a
    // neighbourhood needs a route that returns its centroid; none does today.
    router.push({
      pathname: '/discover',
      params: { tab: tabName },
    });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Top Header */}
      <View className="px-6 py-4 flex-row items-center border-b border-faint bg-surface-card">
        <TouchableOpacity
          onPress={() => backOr()}
          className="p-2 bg-surface-background rounded-full mr-3.5 border border-subtle"
        >
          <Ionicons name="arrow-back" size={18} color={tokens.color.text.secondary} />
        </TouchableOpacity>
        <Text className="text-lg font-black text-content-primary flex-1">Neighborhood Hub</Text>
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator color="#F59300" size="large" />
          <Text className="text-xs font-bold text-content-faint mt-2">Loading neighborhood context...</Text>
        </View>
      ) : error || !data ? (
        <View className="flex-1 justify-center items-center px-8">
          <Text className="text-5xl mb-4">📍</Text>
          <Text className="text-base font-black text-content-primary">Hub Not Found</Text>
          <Text className="text-xs text-content-muted text-center mt-1.5 leading-relaxed">
            {error || 'This neighborhood could not be located in our current geographic directory.'}
          </Text>
          <TouchableOpacity
            onPress={() => backOr()}
            className="mt-6 bg-surface-inverse px-6 py-3 rounded-xl active:bg-surface-inverse"
          >
            <Text className="text-content-inverse font-extrabold text-xs">Return to Discover</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}>
          {/* Cover Panel with Gradient Overlays */}
          <View className="bg-primary-500 py-10 px-6 justify-center relative overflow-hidden">
            {/* Background elements */}
            <View className="absolute right-0 bottom-0 opacity-10">
              <Ionicons name="earth" size={240} color="#000" />
            </View>
            
            {/* The flag was `countryCode === 'GB' ? '🇬🇧' : '🇲🇺'` — every country
                on earth other than the United Kingdom was shown the flag of
                Mauritius. The profile carries a country code and no country
                name, so the code is what is rendered. */}
            <View className="flex-row items-center mb-1.5">
              <Text className="text-xs font-black text-white/80 uppercase tracking-widest">
                {[data.cityName, data.regionName, data.countryCode].filter(Boolean).join(', ')}
              </Text>
            </View>
            <Text className="text-3xl font-black text-white tracking-tight">{data.name}</Text>
            <Text className="text-xs font-extrabold text-white/90 mt-1">
              Active Community Hub Node
            </Text>
          </View>

          {/* Description Block */}
          {(data.overview || data.description || data.communitySummary) && (
            <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
              <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-2.5">About This Area</Text>
              <Text className="text-sm font-semibold text-content-secondary leading-relaxed">
                {data.overview || data.description || data.communitySummary}
              </Text>
            </View>
          )}

          {/*
            ── Why these are bands and not scores ─────────────────────────────

            This block used to read `data.stats.safetyScore`, `costOfLiving` and
            `walkability` and render "87/100", "Medium" and "78%". **None of
            those three fields exists on the server.** They came from
            `NeighborhoodOverview` in the mock handler, and the profile route has
            never sent a numeric safety score or a walkability percentage —
            `NeighborhoodLivingIndexResponse` is nine *string bands* plus an
            `assessed` flag, and safety is a prose summary.

            A precise-looking number about how safe a neighbourhood is, invented
            on the client, is close to the worst thing this application could
            print: it is exactly the figure somebody uses to decide where to move
            their family. So the bands are shown as bands, only when the index
            has actually been assessed, and the safety *summary* is shown as the
            prose it is.
          */}
          {data.livingIndex?.assessed && (
            <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
              <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-3.5">Neighborhood Quality Indexes</Text>
              <View className="flex-row gap-3">
                <View className="flex-1 bg-surface-background rounded-2xl p-4 border border-faint items-center">
                  <Text className="text-2xl mb-1">💰</Text>
                  <Text className="text-[10px] text-content-faint font-extrabold uppercase">Cost of living</Text>
                  <Text className="text-base font-black text-content-primary mt-0.5">{data.livingIndex.costOfLiving}</Text>
                </View>

                <View className="flex-1 bg-surface-background rounded-2xl p-4 border border-faint items-center">
                  <Text className="text-2xl mb-1">🚶</Text>
                  <Text className="text-[10px] text-content-faint font-extrabold uppercase">Walkability</Text>
                  <Text className="text-base font-black text-content-primary mt-0.5">{data.livingIndex.walkability}</Text>
                </View>

                <View className="flex-1 bg-surface-background rounded-2xl p-4 border border-faint items-center">
                  <Text className="text-2xl mb-1">♿</Text>
                  <Text className="text-[10px] text-content-faint font-extrabold uppercase">Accessibility</Text>
                  <Text className="text-base font-black text-content-primary mt-0.5">{data.livingIndex.accessibility}</Text>
                </View>
              </View>
            </View>
          )}

          {data.safetySummary ? (
            <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
              <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-2.5">Safety</Text>
              <Text className="text-sm font-semibold text-content-secondary leading-relaxed">
                {data.safetySummary}
              </Text>
            </View>
          ) : null}

          <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
            {/*
              Frontend Phase 8. This opens the fuller view: the dimension
              breakdown, the cost-of-living categories, the safety methodology
              and limitations, and side-by-side comparison with nearby areas —
              with each figure marked as published or estimated.
            */}
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/map/neighborhood/[id]', params: { id } })}
              accessibilityRole="button"
              accessibilityLabel={`See the full breakdown for ${data.name}, including safety, cost of living and how it compares with nearby areas`}
              className="flex-row items-center justify-center mt-4 py-3 rounded-2xl border border-subtle active:bg-surface-background"
            >
              <Ionicons name="stats-chart-outline" size={14} color={tokens.color.text.secondary} />
              <Text className="text-[11px] font-black text-content-tertiary uppercase tracking-wider ml-2">
                Safety, cost & comparison
              </Text>
            </TouchableOpacity>
          </View>

          {/* Local Resources Dashboard */}
          <View className="bg-surface-card px-6 py-5 border-b border-faint mb-6">
            <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-3.5">
              Available Resources In This Hub
            </Text>
            
            <View className="flex-col gap-2.5">
              {/* Service Providers */}
              <TouchableOpacity
                onPress={() => handleResourcePress('Providers')}
                className="flex-row items-center justify-between p-4 bg-surface-background border border-faint rounded-2xl active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-9 h-9 bg-[#EBF5FF] rounded-xl items-center justify-center mr-3">
                    <Ionicons name="business" size={16} color="#1E88E5" />
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-content-strong">Service Providers</Text>
                    <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Shops, restaurants, beauty services</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-sm font-black text-content-strong mr-2">{countFor('providers')}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#C7C7CC" />
                </View>
              </TouchableOpacity>

              {/* Jobs */}
              <TouchableOpacity
                onPress={() => handleResourcePress('Jobs')}
                className="flex-row items-center justify-between p-4 bg-surface-background border border-faint rounded-2xl active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-9 h-9 bg-[#EDFDF5] rounded-xl items-center justify-center mr-3">
                    <Ionicons name="briefcase" size={16} color="#2E7D32" />
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-content-strong">Job Openings</Text>
                    <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Local listings, commercial projects</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-sm font-black text-content-strong mr-2">{countFor('jobs')}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#C7C7CC" />
                </View>
              </TouchableOpacity>

              {/* Housing */}
              <TouchableOpacity
                onPress={() => handleResourcePress('Housing')}
                className="flex-row items-center justify-between p-4 bg-surface-background border border-faint rounded-2xl active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-9 h-9 bg-[#FFF8E1] rounded-xl items-center justify-center mr-3">
                    <Ionicons name="home" size={16} color="#F57F17" />
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-content-strong">Homes & Housing</Text>
                    <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Rentals, flat shares, room listings</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-sm font-black text-content-strong mr-2">{countFor('housing')}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#C7C7CC" />
                </View>
              </TouchableOpacity>

              {/* Marketplace */}
              <TouchableOpacity
                onPress={() => handleResourcePress('Marketplace')}
                className="flex-row items-center justify-between p-4 bg-surface-background border border-faint rounded-2xl active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-9 h-9 bg-[#F3E5F5] rounded-xl items-center justify-center mr-3">
                    <Ionicons name="cart" size={16} color="#7B1FA2" />
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-content-strong">Buy & Sell</Text>
                    <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Marketplace goods, items wanted</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-sm font-black text-content-strong mr-2">{countFor('marketplace')}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#C7C7CC" />
                </View>
              </TouchableOpacity>

              {/* Events & Community Life */}
              <TouchableOpacity
                onPress={() => handleResourcePress('Community')}
                className="flex-row items-center justify-between p-4 bg-surface-background border border-faint rounded-2xl active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-9 h-9 bg-[#FDF2F8] rounded-xl items-center justify-center mr-3">
                    <Ionicons name="people" size={16} color="#C2185B" />
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-content-primary">Community Life</Text>
                    <Text className="text-[10px] text-content-faint font-semibold mt-0.5">Events, local gatherings, organisations</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-sm font-black text-content-strong mr-2">
                    {countFor('events')}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#C7C7CC" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <View className="h-10" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
