// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community discovery (Frontend Phase 13, §31)
//
// §31's directory: search, browse, suggestions, membership state per row, and the
// full set of §74 states. Backed by FRONTEND-PHASE13-GAP-001 through the
// development adapter, and marked as such on the screen.
//
// Two decisions worth stating:
//
//   **No "Popular" tab.** §31 forbids implying popularity the backend does not
//   provide authoritative metrics for. The adapter reports every member count as
//   simulated, so a popularity ranking would be a ranking of invented numbers. The
//   sort control offers Name and Recently added, and the directory route *rejects*
//   `sort=members` rather than silently falling back — a 422 a reviewer can see
//   beats a quiet downgrade nobody notices.
//
//   **Type filters, not country filters, are primary.** A country filter exists —
//   filtering communities *by* country of origin is a legitimate thing to want —
//   but it sits behind the type chips, because leading with it would teach the
//   member that a community is a country. §2.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndFlatList } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { SearchBar } from '@/components/SearchBar';
import type {
  CommunityDiscoverySort,
  CommunityType,
  CommunityUnavailableReason,
} from '@/types/community-directory';
import {
  useCommunityContext,
  useCommunityDirectory,
  useCommunitySuggestions,
} from '@/hooks/communities';
import { getActiveLocation, useLocationStore } from '@/store/location';
import { useConnectivityStore } from '@/lib/connectivity';
import { trackCommunityEvent } from '@/lib/community/analytics';
import {
  CommunityOfflineBanner,
  CommunityRow,
  CommunityUnavailablePanel,
  MultiCommunityGapNotice,
  communityTypeLabel,
} from '@/components/community-directory';
import { backOr } from '@/lib/navigation';

const TYPE_FILTERS: (CommunityType | 'All')[] = [
  'All',
  'NationalDiaspora',
  'RegionalDiaspora',
  'EthnoLinguistic',
  'CityChapter',
  'FaithCommunity',
  'InterestCommunity',
];

/** §31's sorts, minus the one the backend cannot support honestly. */
const SORTS: { value: CommunityDiscoverySort; label: string }[] = [
  { value: 'relevance', label: 'Suggested' },
  { value: 'name', label: 'A–Z' },
  { value: 'recent', label: 'Newest' },
];

export default function CommunityDiscoveryScreen() {
  const { tokens } = useTheme();
  const context = useCommunityContext();
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const activeLocation = getActiveLocation(useLocationStore());

  const [query, setQuery] = useState('');
  const [type, setType] = useState<CommunityType | 'All'>('All');
  const [sort, setSort] = useState<CommunityDiscoverySort>('relevance');
  const [onlyUnjoined, setOnlyUnjoined] = useState(false);

  const directory = useCommunityDirectory({
    query: query.trim() || undefined,
    types: type === 'All' ? undefined : [type],
    sort,
    includeJoined: !onlyUnjoined,
    limit: 30,
  });

  const suggestions = useCommunitySuggestions(activeLocation.countryCode);

  React.useEffect(() => {
    trackCommunityEvent('community.directory.viewed');
  }, []);

  const unavailable: CommunityUnavailableReason | null = useMemo(() => {
    if (directory.unavailable === 'feature-disabled') return 'feature-disabled';
    if (directory.isLoading) return 'loading';
    if (directory.isError) return isOnline ? 'error' : 'offline';
    if ((directory.data?.items.length ?? 0) === 0) return 'empty';
    return null;
  }, [directory.data, directory.isError, directory.isLoading, directory.unavailable, isOnline]);

  const showSuggestions =
    !query.trim() && type === 'All' && (suggestions.data?.length ?? 0) > 0 && !onlyUnjoined;

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => backOr()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>

        <View className="flex-1 ml-2">
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-lg font-black"
          >
            Communities
          </Text>
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold"
          >
            Find the communities you belong to, or want to know about
          </Text>
        </View>

        {/* Since 11 Sep 2026: whoever founds a community owns it. Shown to every
            signed-in member; founding needs a verified identity, and the server
            says so in words if the member's is not yet — a hidden button would
            leave them no way to learn why. */}
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Start a community"
          onPress={() => router.push('/community/create' as never)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="mr-4"
        >
          <Ionicons name="add-circle-outline" size={24} color={tokens.color.primary[600]} />
        </TouchableOpacity>

        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Community settings"
          onPress={() => router.push('/community/settings')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="options-outline" size={22} color={tokens.color.text.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollEndFlatList
        data={directory.data?.items ?? []}
        keyExtractor={(entry) => entry.community.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}
        // §77: 1,200 communities cost the same to scroll as 20.
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View>
            {!isOnline ? (
              <View className="mb-3">
                <CommunityOfflineBanner savedAt={context.hydratedFrom} />
              </View>
            ) : null}

            <View className="mb-3">
              <SearchBar
                value={query}
                onChangeText={(next) => {
                  setQuery(next);
                  if (next.trim().length > 2) {
                    trackCommunityEvent('community.searched', { hasQuery: true });
                  }
                }}
                placeholder="Search by name, country or region"
              />
            </View>

            {/*
              Two guards on one disclosure, deliberately. `isSimulated` is what
              the repository answered on this request; the notice itself returns
              null once the register marks the gap connected. Either alone would
              be enough today, and keeping both means a screen that goes quiet
              only when the data and the register agree it should.
            */}
            {directory.isSimulated ? (
              <View className="mb-3">
                <MultiCommunityGapNotice gapKey="communityDirectory" compact />
              </View>
            ) : null}

            {/* Type chips */}
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={TYPE_FILTERS}
              keyExtractor={(item) => item}
              className="mb-2"
              renderItem={({ item }) => {
                const isActive = type === item;
                return (
                  <TouchableOpacity
                    accessible
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`Show ${item === 'All' ? 'all kinds of community' : communityTypeLabel(item)}`}
                    onPress={() => {
                      setType(item);
                      trackCommunityEvent('community.filter.applied', {
                        scope: item,
                      });
                    }}
                    activeOpacity={0.7}
                    style={{
                      backgroundColor: isActive
                        ? tokens.color.primary[500]
                        : tokens.color.neutral[100],
                    }}
                    className="rounded-full px-3 py-1.5 mr-2"
                  >
                    <Text
                      style={{
                        color: isActive ? tokens.color.text.inverse : tokens.color.text.secondary,
                      }}
                      className="text-[11px] font-bold"
                    >
                      {item === 'All' ? 'All kinds' : communityTypeLabel(item)}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            {/* Sort + membership filter */}
            <View className="flex-row items-center justify-between mb-4">
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Sort communities"
                className="flex-row"
              >
                {SORTS.map((option) => {
                  const isActive = sort === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      accessible
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isActive, checked: isActive }}
                      accessibilityLabel={`Sort by ${option.label}`}
                      onPress={() => setSort(option.value)}
                      className="mr-3"
                    >
                      <Text
                        style={{
                          color: isActive
                            ? tokens.color.primary[600]
                            : tokens.color.text.placeholder,
                        }}
                        className="text-[11px] font-black uppercase tracking-wider"
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                accessible
                accessibilityRole="switch"
                accessibilityState={{ checked: onlyUnjoined }}
                accessibilityLabel="Only show communities I have not joined"
                onPress={() => setOnlyUnjoined((prev) => !prev)}
                className="flex-row items-center"
              >
                <Ionicons
                  name={onlyUnjoined ? 'checkbox' : 'square-outline'}
                  size={15}
                  color={onlyUnjoined ? tokens.color.primary[500] : tokens.color.text.placeholder}
                />
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[10px] font-bold ml-1"
                >
                  Not joined
                </Text>
              </TouchableOpacity>
            </View>

            {/* Suggestions — §55. The reason is shown, never implied by order. */}
            {showSuggestions ? (
              <View className="mb-5">
                <Text
                  accessibilityRole="header"
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-black uppercase tracking-widest mb-2"
                >
                  Suggested for you
                </Text>

                {/*
                  No notice since 20 Oct 2026. Suggestions (FRONTEND-PHASE13-GAP-020)
                  read `GET /recommendations/communities`, each with the server's
                  reason, so there is nothing simulated here to mark. The notice
                  that stood here said otherwise for a day after they went real.
                */}
                {(suggestions.data ?? []).slice(0, 3).map((entry) => (
                  <CommunityRow
                    key={`suggested-${entry.community.id}`}
                    community={entry.community}
                    membershipState={entry.membershipState}
                    isPrimary={entry.isPrimary}
                    reason={entry.reason}
                    onPress={() => router.push(`/community/${entry.community.slug}`)}
                  />
                ))}
              </View>
            ) : null}

            {!unavailable ? (
              <Text
                accessibilityRole="header"
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-black uppercase tracking-widest mb-2"
              >
                {query.trim() ? 'Search results' : 'All communities'}
                {typeof directory.data?.totalCount === 'number'
                  ? ` · ${directory.data.totalCount}`
                  : ''}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <CommunityRow
            community={item.community}
            membershipState={item.membershipState}
            isPrimary={item.isPrimary}
            reason={item.reason}
            onPress={() => {
              trackCommunityEvent('community.viewed', { communityId: item.community.id });
              router.push(`/community/${item.community.slug}`);
            }}
          />
        )}
        ListEmptyComponent={
          unavailable ? (
            <CommunityUnavailablePanel
              reason={unavailable}
              subject="communities"
              gapKey="communityDirectory"
              onAction={
                unavailable === 'error' || unavailable === 'offline'
                  ? () => void directory.refetch()
                  : undefined
              }
            />
          ) : null
        }
        ListFooterComponent={
          <View className="mt-4">
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Compare communities side by side"
              onPress={() => router.push('/community/compare')}
              activeOpacity={0.8}
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="flex-row items-center rounded-2xl border p-3"
            >
              <Ionicons name="git-compare-outline" size={18} color={tokens.color.secondary[500]} />
              <View className="flex-1 ml-2.5">
                <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
                  Compare communities
                </Text>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-semibold mt-0.5"
                >
                  Put two or three side by side
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
            </TouchableOpacity>

            {directory.isSimulated ? (
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="See which community features are waiting on a backend"
                onPress={() => router.push('/community/gaps')}
                activeOpacity={0.8}
                className="flex-row items-center justify-center py-3 mt-2"
              >
                <Ionicons name="flask-outline" size={13} color={tokens.color.text.placeholder} />
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-bold ml-1.5"
                >
                  What is not connected yet
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}
