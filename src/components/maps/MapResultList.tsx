// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the accessible result list and the marker callout
// (Frontend Phase 8, §11, §50)
//
// §50 is the section this file exists for: *do not make the map the only way to
// discover information*. This list is not a fallback and is not a lesser view —
// it carries every result the map carries, with the same distances, the same
// provenance markers and the same actions, and it is reachable from a control
// in the header of every map screen rather than from a menu.
//
// ── Synchronisation, and the loop it would otherwise cause ───────────────────
//
// §11 wants selection to flow both ways: tapping a pin focuses the row, tapping
// a row focuses the pin. Implemented naively that is an infinite loop — the
// list scrolls to the selection, which fires a selection, which scrolls the
// list. `selectionOrigin` on the store records which side acted, and this
// component only auto-scrolls when the selection came from the *map*. Its own
// selections it ignores, because the member is already looking at the row they
// just tapped.
//
// ── Virtualisation ───────────────────────────────────────────────────────────
//
// `FlashList`, already a platform dependency and already used elsewhere in this
// app. §41 asks for a virtualized list and the marker volumes in §60 make that
// non-negotiable: a `ScrollView` of 1,000 rows allocates 1,000 view trees on
// mount and drops frames on the first flick.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { formatDistance } from '@/utils/geo';
import { toKm } from '@/lib/maps/geo';
import type { MapSearchResult, MapMarker } from '@/types/maps';
import { CATEGORY_LABELS } from './MapPrimitives';
import { SourceBadge } from './MapsGapNotice';

export interface MapResultListProps {
  results: MapSearchResult[];
  selectedMarkerId?: string | null;
  /** Which side made the current selection. Only 'map' triggers auto-scroll. */
  selectionOrigin?: 'map' | 'list' | null;
  onSelect: (result: MapSearchResult) => void;
  onOpen: (result: MapSearchResult) => void;
  ListHeaderComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  onEndReached?: () => void;
  testID?: string;
}

export function MapResultList({
  results,
  selectedMarkerId,
  selectionOrigin,
  onSelect,
  onOpen,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  onEndReached,
  testID,
}: MapResultListProps) {
  const listRef = useRef<FlashListRef<MapSearchResult>>(null);

  // See the header. Scrolling in response to the list's own selection would
  // yank the row out from under the finger that just tapped it.
  useEffect(() => {
    if (!selectedMarkerId || selectionOrigin !== 'map') return;

    const index = results.findIndex((result) => result.marker.id === selectedMarkerId);
    if (index < 0) return;

    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
  }, [results, selectedMarkerId, selectionOrigin]);

  const renderItem = useCallback(
    ({ item }: { item: MapSearchResult }) => (
      <MapResultRow
        result={item}
        isSelected={item.marker.id === selectedMarkerId}
        onSelect={() => onSelect(item)}
        onOpen={() => onOpen(item)}
      />
    ),
    [onOpen, onSelect, selectedMarkerId]
  );

  return (
    <FlashList
      ref={listRef}
      data={results}
      renderItem={renderItem}
      keyExtractor={(item) => item.marker.id}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={ListFooterComponent}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      contentContainerStyle={{ paddingBottom: 24 }}
      testID={testID ?? 'map-result-list'}
      accessibilityLabel={`${results.length} result${results.length === 1 ? '' : 's'} on the map`}
    />
  );
}

function MapResultRow({
  result,
  isSelected,
  onSelect,
  onOpen,
}: {
  result: MapSearchResult;
  isSelected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { tokens } = useTheme();
  const { marker } = result;

  return (
    <Pressable
      onPress={onSelect}
      onLongPress={onOpen}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      // The marker's own label, which `lib/maps/markers.ts` wrote as a sentence
      // including the distance and any approximation caveat. The row does not
      // compose its own — one label, one place to get it right.
      accessibilityLabel={marker.accessibilityLabel}
      accessibilityHint="Activate to focus this on the map. Press and hold to open it."
      style={{
        backgroundColor: isSelected ? tokens.color.primary[50] : tokens.color.surface.card,
        borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
      }}
      className="mx-4 mb-2 p-3.5 rounded-2xl border flex-row items-center"
      testID={`map-result-${marker.id}`}
    >
      <View
        style={{ backgroundColor: tokens.color.neutral[100] }}
        className="w-10 h-10 rounded-xl items-center justify-center mr-3"
      >
        <Text className="text-[9px] font-black" style={{ color: tokens.color.text.secondary }}>
          {CATEGORY_LABELS[result.category].slice(0, 4).toUpperCase()}
        </Text>
      </View>

      <View className="flex-1 pr-2">
        <Text
          numberOfLines={1}
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-black"
        >
          {marker.title}
        </Text>

        {marker.subtitle || result.detail ? (
          <Text
            numberOfLines={1}
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-semibold mt-0.5"
          >
            {result.detail ?? marker.subtitle}
          </Text>
        ) : null}

        <View className="flex-row items-center flex-wrap mt-1 gap-1.5">
          {marker.distance ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-wider"
            >
              {formatDistance(toKm(marker.distance))}
            </Text>
          ) : null}

          {marker.isPrivacyReduced ? (
            // §32/§39. A member navigating to an approximate point needs to know
            // they are being sent to a block and not to a door.
            <View className="flex-row items-center">
              <Ionicons name="ellipse-outline" size={9} color={tokens.color.text.placeholder} />
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[9px] font-bold ml-1"
              >
                Approximate
              </Text>
            </View>
          ) : null}

          <SourceBadge source={marker.source} />
        </View>
      </View>

      {marker.badge ? (
        <Text
          style={{ color: tokens.color.primary[500] }}
          className="text-sm font-black"
        >
          {marker.badge}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The preview that appears when a pin is selected.
 *
 * Deliberately not a `@gorhom/bottom-sheet`, even though it is a dependency:
 * this sheet is one fixed height with no snap points and no gesture of its own,
 * and pulling in a gesture-driven sheet for it would add a native dependency to
 * a component whose whole job is to be renderable everywhere the map is —
 * including under Jest, where the map/list synchronisation tests exercise it.
 */
export function MarkerCallout({
  result,
  onOpen,
  onClose,
  onNavigate,
  onSave,
  onShare,
}: {
  result: MapSearchResult | null;
  onOpen: (result: MapSearchResult) => void;
  onClose: () => void;
  onNavigate?: (marker: MapMarker) => void;
  onSave?: (result: MapSearchResult) => void;
  onShare?: (result: MapSearchResult) => void;
}) {
  const { tokens } = useTheme();
  if (!result) return null;

  const { marker } = result;

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="absolute left-3 right-3 bottom-3 rounded-3xl border p-4"
      accessible={false}
      testID="marker-callout"
    >
      <View className="flex-row items-start">
        <View className="flex-1 pr-3">
          <Text
            style={{ color: tokens.color.primary[500] }}
            className="text-[10px] font-black uppercase tracking-widest"
          >
            {CATEGORY_LABELS[result.category]}
          </Text>
          <Text
            numberOfLines={2}
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black mt-0.5 leading-snug"
          >
            {marker.title}
          </Text>
          {result.detail ? (
            <Text
              numberOfLines={1}
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold mt-1"
            >
              {result.detail}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close this preview"
          style={{ backgroundColor: tokens.color.neutral[100], width: 32, height: 32 }}
          className="rounded-full items-center justify-center"
          testID="marker-callout-close"
        >
          <Ionicons name="close" size={15} color={tokens.color.text.secondary} />
        </Pressable>
      </View>

      <View className="flex-row items-center flex-wrap gap-2 mt-2.5">
        {marker.distance ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-wider"
          >
            {formatDistance(toKm(marker.distance))}
          </Text>
        ) : null}
        {marker.isPrivacyReduced ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold"
          >
            · Approximate location
          </Text>
        ) : null}
        <SourceBadge source={marker.source} />
      </View>

      <View className="flex-row gap-2 mt-3.5">
        <Pressable
          onPress={() => onOpen(result)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${marker.title}`}
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="flex-1 py-3 rounded-2xl items-center"
          testID="marker-callout-open"
        >
          <Text className="text-white text-[11px] font-black uppercase tracking-wider">
            View details
          </Text>
        </Pressable>

        {onNavigate ? (
          <Pressable
            onPress={() => onNavigate(marker)}
            accessibilityRole="button"
            accessibilityLabel={`Get directions to ${marker.title}`}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="px-4 py-3 rounded-2xl border items-center justify-center"
            testID="marker-callout-navigate"
          >
            <Ionicons name="navigate-outline" size={16} color={tokens.color.text.secondary} />
          </Pressable>
        ) : null}

        {onSave ? (
          <Pressable
            onPress={() => onSave(result)}
            accessibilityRole="button"
            accessibilityLabel={`Save ${marker.title}`}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="px-4 py-3 rounded-2xl border items-center justify-center"
            testID="marker-callout-save"
          >
            <Ionicons name="bookmark-outline" size={16} color={tokens.color.text.secondary} />
          </Pressable>
        ) : null}

        {onShare ? (
          <Pressable
            onPress={() => onShare(result)}
            accessibilityRole="button"
            accessibilityLabel={`Share ${marker.title}`}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="px-4 py-3 rounded-2xl border items-center justify-center"
            testID="marker-callout-share"
          >
            <Ionicons name="share-outline" size={16} color={tokens.color.text.secondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** The empty state, with the action that can actually change the outcome. */
export function MapEmptyState({
  hasFilters,
  onClearFilters,
  onWiden,
}: {
  hasFilters: boolean;
  onClearFilters?: () => void;
  onWiden?: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <View
      className="items-center py-10 px-6"
      accessible
      accessibilityRole="text"
      accessibilityLabel="No results in this area. Try moving the map, zooming out, or clearing a filter."
      testID="map-empty-state"
    >
      <Ionicons name="map-outline" size={30} color={tokens.color.text.placeholder} />
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black mt-3 text-center"
      >
        Nothing here yet
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-semibold leading-relaxed mt-1.5 text-center"
      >
        {hasFilters
          ? 'There is nothing matching your filters in this part of the map.'
          : 'There is nothing on the map in this area yet.'}
      </Text>

      <View className="flex-row gap-2 mt-4">
        {hasFilters && onClearFilters ? (
          <Pressable
            onPress={onClearFilters}
            accessibilityRole="button"
            accessibilityLabel="Clear the filters"
            style={{ borderColor: tokens.color.border.default }}
            className="px-4 py-2.5 rounded-xl border"
          >
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-black uppercase tracking-wider"
            >
              Clear filters
            </Text>
          </Pressable>
        ) : null}

        {onWiden ? (
          <Pressable
            onPress={onWiden}
            accessibilityRole="button"
            accessibilityLabel="Zoom out to search a wider area"
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="px-4 py-2.5 rounded-xl"
          >
            <Text className="text-white text-[11px] font-black uppercase tracking-wider">
              Search wider
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
