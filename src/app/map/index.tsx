// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — map-first discovery (Frontend Phase 8, §10, §11, §12, §13)
//
// The screen §53's Journeys 1, 2, 3, 4 and 10 all run through: open the map,
// grant location, see what is nearby, filter it, select a result, open it,
// navigate to it.
//
// ── What it does not do ──────────────────────────────────────────────────────
//
// It runs no search of its own. Every result comes from the certified routes
// through `useMapSearch`, which is the same `/housing`, `/marketplace`,
// `/jobs`, `/listings`, `/community-life/*` and community-update contracts the
// list tabs already use. §31–§37 forbid duplicating those and §12 forbids a
// second search backend; this screen adds neither.
//
// It also does not request location on mount. §5 forbids making permission
// mandatory, so the map opens on the member's chosen location — which
// `store/location.ts` has always owned — and the location card is an offer
// rather than a gate. Journey 1 begins with the member accepting that offer.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { SearchBar } from '@/components/SearchBar';
import {
  AlertFreshnessBanner,
  CategoryFilterBar,
  DiasporaMap,
  HeatMapLegend,
  LayerPicker,
  LocationPermissionCard,
  MapEmptyState,
  MapErrorState,
  MapLoadingState,
  MapModeSwitcher,
  MapResultList,
  MapsGapNotice,
  MarkerCallout,
  SearchThisAreaButton,
} from '@/components/maps';
import {
  useCommunityAlerts,
  useCurrentLocation,
  useHeatLayer,
  useMapRealtime,
  useMapSearch,
  usePlaceOutlines,
  useServerClusters,
} from '@/hooks/maps';
import { useMapSessionStore } from '@/store/map-session';
import { getActiveLocation, useLocationStore } from '@/store/location';
import { useConnectivityStore } from '@/lib/connectivity';
import { getMapFeatureFlags } from '@/config/map-config';
import { classifyError } from '@/lib/maps/errors';
import { trackMapsEvent } from '@/lib/maps/analytics';
import { boundsToViewport, openingViewport, viewportToBounds, viewportToZoom } from '@/lib/maps/geo';
import { outlineAttributions, outlinePolygons } from '@/lib/maps/place-outlines';
import { useChromeInset } from '@/components/layout/bottom-inset';
import { DISCOVERY_CATEGORIES, type HeatMapTimeRange, type MapSearchResult } from '@/types/maps';

/**
 * How far around the member the discovery map opens, in kilometres. The same
 * town and country spans the alerts map uses, so the two maps agree about what
 * "here" looks like.
 */
const MAP_OPENING_RADIUS_KM = { point: 2, place: 8, country: 250 } as const;

export default function MapDiscoveryScreen() {
  const { tokens } = useTheme();

  // Carried in from whichever surface opened the map, so a member arriving from
  // the Housing tab sees homes rather than the default mix, and one arriving
  // from a neighbourhood page opens over that neighbourhood.
  const params = useLocalSearchParams<{ category?: string; lat?: string; lon?: string }>();

  const {
    viewport,
    displayMode,
    categories,
    activeLayer,
    query,
    selectedMarkerId,
    selectionOrigin,
    followUser,
    deviceLocation,
    setViewport,
    setDisplayMode,
    toggleCategory,
    setActiveLayer,
    setQuery,
    selectMarker,
    clearSelection,
    setFollowUser,
    markViewportSearched,
  } = useMapSessionStore();

  const activeLocation = useLocationStore(getActiveLocation);
  const isOffline = useConnectivityStore((s) => !s.isOnline);
  const flags = getMapFeatureFlags();
  const location = useCurrentLocation();

  const { setCategories } = useMapSessionStore();
  const [showLocationCard, setShowLocationCard] = useState(true);
  const [timeRange, setTimeRange] = useState<HeatMapTimeRange>('30d');
  const [showLayers, setShowLayers] = useState(false);

  // Reads the existing permission answer without prompting. §5: a map that
  // prompts the instant it opens is a map that gets denied.
  useEffect(() => {
    void location.check();
    trackMapsEvent('maps.opened', { surface: 'discovery', displayMode });

    // An incoming category narrows the map to it. Alerts are kept alongside
    // whatever else was asked for: a member looking at housing still wants to
    // know the road is closed.
    if (params.category && DISCOVERY_CATEGORIES.includes(params.category as never)) {
      const requested = params.category as (typeof DISCOVERY_CATEGORIES)[number];
      setCategories(requested === 'alert' ? ['alert'] : [requested, 'alert']);
    }
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The map opens where the member already told us they are, unless the caller
  // named a place. `store/location.ts` has owned "where am I" since before this
  // phase and this screen does not become a second source of truth for it.
  //
  // ── Sized, not only centred ─────────────────────────────────────────────────
  //
  // This used to move the centre and keep whatever span the session held — and
  // the session opens on a zero-span placeholder, so the map opened with no size
  // at all. Nothing drawn through that projection was finite, and the first
  // place outline drawn through it crashed the app (17 Sep 2026). An unsized view
  // is now rebuilt around the place at a zoom that suits it; a view the member
  // has already sized keeps its zoom.
  useEffect(() => {
    const incomingLat = Number(params.lat);
    const incomingLon = Number(params.lon);
    const hasIncoming = Number.isFinite(incomingLat) && Number.isFinite(incomingLon);

    const target = hasIncoming
      ? { latitude: incomingLat, longitude: incomingLon }
      : { latitude: activeLocation.latitude, longitude: activeLocation.longitude };

    // A named point is a street's worth; a place is a town's; a country's centroid
    // is not a place at all, so it opens wide.
    const radiusKm = hasIncoming
      ? MAP_OPENING_RADIUS_KM.point
      : activeLocation.precision === 'country'
        ? MAP_OPENING_RADIUS_KM.country
        : MAP_OPENING_RADIUS_KM.place;

    const next = openingViewport(viewport, target, radiusKm);
    if (next && next !== viewport) setViewport(next);
    // On a deliberate location change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocation.latitude, activeLocation.longitude, activeLocation.precision, params.lat, params.lon]);

  const bounds = useMemo(() => viewportToBounds(viewport), [viewport]);

  const search = useMapSearch({ viewport, categories, query });
  const alerts = useCommunityAlerts(bounds, categories.includes('alert'));
  const heat = useHeatLayer(activeLayer, bounds, {
    zoom: viewportToZoom(viewport),
    timeRange,
  });
  const realtime = useMapRealtime(bounds, categories.includes('alert'));

  // Zoomed out, the map draws the platform's totals per town rather than a
  // counted page of pins (FRONTEND-MAPS-GAP-002). Not while a heat layer is on:
  // the layer is the aggregate then, and two would compete.
  const serverClusters = useServerClusters(viewport, categories, !activeLayer);
  const showsTotals = serverClusters.isAvailable && serverClusters.page !== null;

  // Where the places on screen end, where the platform holds a sourced outline
  // (FRONTEND-MAPS-GAP-016). Not under a heat layer, which is its own aggregate.
  // The credit is read from the outlines drawn, so it shows exactly while they do.
  const placeOutlines = usePlaceOutlines(viewport, !activeLayer);
  const outlines = useMemo(() => placeOutlines.page?.outlines ?? [], [placeOutlines.page]);
  const outlineShapes = useMemo(
    () => outlinePolygons(outlines, tokens.color.primary[500]),
    [outlines, tokens.color.primary]
  );
  const outlineCredits = useMemo(() => outlineAttributions(outlines), [outlines]);

  // Full screen, the map runs under the gesture bar; split, the list is below it.
  const chromeInset = useChromeInset('none');

  const results = search.data?.results ?? [];
  const markers = useMemo(() => results.map((result) => result.marker), [results]);

  const selectedResult = useMemo(
    () => results.find((result) => result.marker.id === selectedMarkerId) ?? null,
    [results, selectedMarkerId]
  );

  const handleOpen = useCallback((result: MapSearchResult) => {
    const destination = result.marker.destination;
    if (!destination) return;
    trackMapsEvent('maps.nearby_result.viewed', { markerCategory: result.marker.category });
    router.push({ pathname: destination.pathname as never, params: destination.params as never });
  }, []);

  const handleNavigate = useCallback((result: MapSearchResult) => {
    router.push({
      pathname: '/map/route',
      params: {
        destLat: String(result.marker.coordinate.latitude),
        destLon: String(result.marker.coordinate.longitude),
        destLabel: result.marker.title,
      },
    });
  }, []);

  const handleModeChange = useCallback(
    (mode: typeof displayMode) => {
      trackMapsEvent('maps.display_mode.switched', {
        displayMode: mode,
        previousDisplayMode: displayMode,
      });
      setDisplayMode(mode);
    },
    [displayMode, setDisplayMode]
  );

  const handleWiden = useCallback(() => {
    setViewport({
      ...viewport,
      latitudeDelta: viewport.latitudeDelta * 2.5,
      longitudeDelta: viewport.longitudeDelta * 2.5,
    });
  }, [setViewport, viewport]);

  const handleSearchThisArea = useCallback(() => {
    search.searchThisArea();
    markViewportSearched(viewport);
  }, [markViewportSearched, search, viewport]);

  const searchError = search.isError ? classifyError(search.error) : null;
  const showMap = displayMode === 'map' || displayMode === 'split';
  const showList = displayMode === 'list' || displayMode === 'split';

  const listHeader = (
    <View className="px-4 pt-3 pb-2 gap-2">
      {alerts.data && alerts.data.length > 0 ? (
        <AlertFreshnessBanner
          mode={realtime.mode}
          lastUpdatedAt={realtime.lastUpdatedAt}
          isOffline={isOffline}
        />
      ) : null}

      {search.data?.hasSimulatedResults ? (
        <MapsGapNotice gapKey="viewportSearch" compact />
      ) : null}

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest"
      >
        {search.isFetching
          ? 'Searching…'
          : `${results.length} result${results.length === 1 ? '' : 's'} in this area`}
      </Text>

      {showsTotals ? (
        <Text
          testID="map-town-totals-note"
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold"
        >
          The map shows how many there are in each town. Zoom in to see each one.
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View className="px-4 pt-2 pb-3 gap-3" style={{ backgroundColor: tokens.color.surface.card }}>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ width: 40, height: 40 }}
            className="items-center justify-center"
          >
            <Ionicons name="arrow-back" size={20} color={tokens.color.text.primary} />
          </Pressable>

          <View className="flex-1">
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Search homes, jobs, events, services"
              onSubmit={handleSearchThisArea}
            />
          </View>
        </View>

        <MapModeSwitcher mode={displayMode} onChange={handleModeChange} />
      </View>

      <View className="py-2.5" style={{ backgroundColor: tokens.color.surface.card }}>
        <CategoryFilterBar
          categories={DISCOVERY_CATEGORIES}
          active={categories}
          counts={search.data?.counts}
          onToggle={(category) => {
            trackMapsEvent('maps.filter.applied', { filterKey: category });
            toggleCategory(category);
          }}
        />
      </View>

      {/* ── Location offer ────────────────────────────────────────────────── */}
      {showLocationCard && !deviceLocation && location.permission.status !== 'granted' ? (
        <View className="px-4 pt-3">
          <LocationPermissionCard
            permission={location.permission}
            isResolving={location.isResolving}
            error={location.error}
            isSimulated={location.isSimulated}
            onRequest={() => void location.request()}
            onOpenSettings={() => void location.openSettings()}
            onRetry={() => void location.refresh()}
            onContinueWithout={() => setShowLocationCard(false)}
          />
        </View>
      ) : null}

      {/* ── Layers ────────────────────────────────────────────────────────── */}
      {showLayers ? (
        <View className="py-3" style={{ backgroundColor: tokens.color.surface.card }}>
          <LayerPicker
            layers={[
              'community-activity',
              'housing-availability',
              'housing-price',
              'marketplace-activity',
              'jobs',
              'events',
              'safety',
              'cost-of-living',
            ]}
            active={activeLayer}
            onChange={(layer) => {
              setActiveLayer(layer);
              if (layer) trackMapsEvent('maps.layer.selected', { layerId: layer });
            }}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            disabledReason={
              flags.heatMapsEnabled
                ? undefined
                : 'Map layers need an aggregate the Diaspora backend does not publish yet, so they are not available in this build. FRONTEND-MAPS-GAP-012.'
            }
          />
        </View>
      ) : null}

      {/* ── Map ───────────────────────────────────────────────────────────── */}
      {showMap ? (
        <View style={{ flex: displayMode === 'split' ? 1 : 3 }}>
          <DiasporaMap
            viewport={viewport}
            onViewportChange={setViewport}
            markers={markers}
            serverClusters={showsTotals ? serverClusters.page!.clusters : null}
            polygons={outlineShapes.length > 0 ? outlineShapes : undefined}
            dataAttributions={outlineCredits}
            chromeBottomInset={displayMode === 'map' ? chromeInset : 0}
            heatLayers={heat.data ? [heat.data] : undefined}
            selectedMarkerId={selectedMarkerId}
            onSelectMarker={(marker) => selectMarker(marker?.id ?? null, 'map')}
            userLocation={deviceLocation}
            followUser={followUser}
            onFollowUserChange={setFollowUser}
            onOpenLayers={() => setShowLayers((open) => !open)}
            hasLayers
          >
            <SearchThisAreaButton
              visible={search.isViewportDirty}
              isFetching={search.isFetching}
              onPress={handleSearchThisArea}
            />

            {activeLayer && heat.data ? (
              <View className="absolute left-3 right-3 bottom-3">
                <HeatMapLegend data={heat.data} />
              </View>
            ) : null}

            {!activeLayer ? (
              <MarkerCallout
                result={selectedResult}
                onOpen={handleOpen}
                onClose={clearSelection}
                onNavigate={() => selectedResult && handleNavigate(selectedResult)}
              />
            ) : null}
          </DiasporaMap>
        </View>
      ) : null}

      {/* ── List — §50's accessible alternative ───────────────────────────── */}
      {showList ? (
        <View style={{ flex: displayMode === 'split' ? 1 : 3 }}>
          {search.isLoading ? (
            <MapLoadingState label="Finding what is near you…" />
          ) : searchError ? (
            <View className="px-4 pt-3">
              <MapErrorState
                kind={isOffline ? 'offline' : searchError}
                onRetry={() => void search.refetch()}
                onWiden={handleWiden}
              />
            </View>
          ) : (
            <MapResultList
              results={results}
              selectedMarkerId={selectedMarkerId}
              selectionOrigin={selectionOrigin}
              onSelect={(result) => selectMarker(result.marker.id, 'list')}
              onOpen={handleOpen}
              ListHeaderComponent={listHeader}
              ListEmptyComponent={
                <MapEmptyState
                  hasFilters={categories.length < DISCOVERY_CATEGORIES.length || Boolean(query)}
                  onClearFilters={() => setQuery('')}
                  onWiden={handleWiden}
                />
              }
            />
          )}
        </View>
      ) : null}

      {/* In map-only mode the list is one control away, and the map's own
          accessibility label says so. §50 does not require the list to be on
          screen, only that it exists and is reachable. */}
      {displayMode === 'map' && !search.isLoading && results.length === 0 && !searchError ? (
        <View className="absolute left-4 right-4 bottom-24">
          <MapEmptyState
            hasFilters={categories.length < DISCOVERY_CATEGORIES.length || Boolean(query)}
            onWiden={handleWiden}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
