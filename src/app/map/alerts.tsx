// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — live community alerts (Frontend Phase 8, §27, §28, §29)
//
// §53's Journey 9: alert → map marker → detail → affected area → share.
//
// ── This is not a second feed ────────────────────────────────────────────────
//
// §27 forbids a parallel notification system. Every alert here is a **B9
// Community Update** — the same records the Knowledge tab shows, read through
// the same certified contract, translated onto the alert vocabulary by
// `toCommunityAlert`. Publishing still happens in the existing Community Update
// composer, which the backend authorizes; this screen creates nothing.
//
// ── Expiry ───────────────────────────────────────────────────────────────────
//
// §29 says expired alerts do not stay visible. That is enforced in
// `lib/maps/markers.ts` — `alertMarker` returns null for anything expired,
// withdrawn or cancelled — so no map can show one even if a screen forgets to
// filter. This screen filters the *list* for the same reason, and the two
// filters agree because they read the same computed `status`.
//
// ── Freshness ────────────────────────────────────────────────────────────────
//
// Live where the platform can say so. Since 16 Sep 2026 every change to a public
// alert is announced on the map cells it touches, and `useMapRealtime` joins the
// viewport's cells and refetches when one arrives. With no connection, or a
// viewport too wide to watch, it polls once a minute and the banner says so —
// §43 forbids calling data live when it is not, and "live" is precisely the word
// that would make a member trust a road closure that cleared four minutes ago.
//
// ── Affected areas ───────────────────────────────────────────────────────────
//
// Drawn only where the alert's author stated one (`affectedRadiusMetres`,
// FRONTEND-MAPS-GAP-017). A circle nobody stated would be the app deciding the
// scope of somebody's emergency.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AlertCard,
  AlertFreshnessBanner,
  DiasporaMap,
  MapEmptyState,
  MapErrorState,
  MapLoadingState,
  MapModeSwitcher,
} from '@/components/maps';
import { useCommunityAlerts, useMapRealtime } from '@/hooks/maps';
import { useMapSessionStore } from '@/store/map-session';
import { getActiveLocation, hasCoordinate, locationLabel, useLocationStore } from '@/store/location';
import { GlobalLocationSelector } from '@/components/GlobalLocationSelector';
import { useConnectivityStore } from '@/lib/connectivity';
import { alertMarker } from '@/lib/maps/markers';
import { classifyError } from '@/lib/maps/errors';
import { trackMapsEvent } from '@/lib/maps/analytics';
import { isPlacedViewport, viewportFromCenter, viewportToBounds } from '@/lib/maps/geo';
import type { AlertSeverity, CommunityAlert, MapDisplayMode, MapViewport } from '@/types/maps';
import { useBottomInset } from '@/components/layout/bottom-inset';

/** How far around a member's place the map opens. A town, not a country. */
const ALERTS_RADIUS_KM = 8;

/**
 * How far around a country's centre the map opens when the member has only a
 * country. A centroid is not where anybody is (`lib/location/country-centroids`),
 * so eight kilometres around it would be "near" an arbitrary field. This is the
 * widest circle the platform answers, and the screen calls it a wide view of the
 * country rather than claiming it is all of it.
 */
const ALERTS_COUNTRY_RADIUS_KM = 500;

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
};

export default function CommunityAlertsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const activeLocation = useLocationStore(getActiveLocation);
  const deviceLocation = useMapSessionStore((s) => s.deviceLocation);
  const isOffline = useConnectivityStore((s) => !s.isOnline);

  const [displayMode, setDisplayMode] = useState<MapDisplayMode>('split');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choosingPlace, setChoosingPlace] = useState(false);
  const isPlaced = hasCoordinate(activeLocation);
  const isCountryOnly = isPlaced && activeLocation.precision === 'country';
  const openingRadiusKm = isCountryOnly ? ALERTS_COUNTRY_RADIUS_KM : ALERTS_RADIUS_KM;

  const [viewport, setViewport] = useState<MapViewport>(() =>
    viewportFromCenter(
      { latitude: activeLocation.latitude, longitude: activeLocation.longitude },
      openingRadiusKm
    )
  );

  // The location store may still be loading on a cold start, so the first
  // viewport can be built from nothing. Open on the member's location when it
  // arrives, and again whenever they move it.
  //
  // ── Rebuilt, not re-centred ───────────────────────────────────────────────
  //
  // This used to move only the centre. A viewport built from a NaN centre also
  // has a NaN width, because the width is scaled by the centre's latitude, so
  // the centre arrived and the width stayed NaN for the life of the screen:
  // every alert request was a 400 and the list said "Something went wrong"
  // (17 Sep 2026, found on a device, cold-started into this screen). A whole new
  // viewport also gives a member who picks a town the town's zoom, rather than
  // keeping the country-wide one they opened on.
  useEffect(() => {
    if (!Number.isFinite(activeLocation.latitude) || !Number.isFinite(activeLocation.longitude)) return;
    const center = { latitude: activeLocation.latitude, longitude: activeLocation.longitude };
    setViewport((current) => {
      const opening = viewportFromCenter(center, openingRadiusKm);
      // The same place at the same zoom is not a move: keep the member's pan.
      return isPlacedViewport(current) &&
        current.center.latitude === center.latitude &&
        current.center.longitude === center.longitude &&
        current.latitudeDelta === opening.latitudeDelta
        ? current
        : opening;
    });
  }, [activeLocation.latitude, activeLocation.longitude, openingRadiusKm]);

  const bounds = useMemo(() => viewportToBounds(viewport), [viewport]);
  const alerts = useCommunityAlerts(bounds);
  const realtime = useMapRealtime(bounds);

  const origin = deviceLocation?.coordinate ?? {
    latitude: activeLocation.latitude,
    longitude: activeLocation.longitude,
  };

  // §29. Expired and withdrawn alerts are filtered out here as well as in the
  // marker converter — the list and the map must not disagree about what is
  // still happening.
  const active = useMemo(
    () =>
      (alerts.data ?? [])
        .filter(
          (alert) =>
            alert.status !== 'Expired' &&
            alert.status !== 'Withdrawn' &&
            alert.status !== 'Cancelled'
        )
        // Most serious first. A road closure and an emergency in the same list
        // ordered by time would bury the one that matters.
        .sort(
          (a, b) =>
            SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
            new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        ),
    [alerts.data]
  );

  const markers = useMemo(
    () => active.flatMap((alert) => alertMarker(alert, origin) ?? []),
    [active, origin]
  );

  const selected = useMemo(
    () => active.find((alert) => alert.id === selectedId) ?? null,
    [active, selectedId]
  );

  // Every stated area, the selected one drawn more strongly. A member deciding
  // whether a closure affects their street needs the circles they did not tap on.
  const circles = useMemo(
    () =>
      active
        .filter((alert) => alert.area?.radiusMetres)
        .map((alert) => ({
          id: `alert-area-${alert.id}`,
          center: alert.area!.center,
          radiusMetres: alert.area!.radiusMetres!,
          fillColor: `${tokens.color.error.default}${alert.id === selectedId ? '26' : '12'}`,
          strokeColor: `${tokens.color.error.default}${alert.id === selectedId ? '99' : '40'}`,
        })),
    [active, selectedId, tokens.color.error.default]
  );

  const handleOpen = useCallback((alert: CommunityAlert) => {
    trackMapsEvent('maps.community_alert.viewed', {
      alertKind: alert.kind,
      alertSeverity: alert.severity,
    });
    router.push({ pathname: '/update/[id]', params: { id: alert.id } });
  }, []);

  const handleShare = useCallback(async (alert: CommunityAlert) => {
    trackMapsEvent('maps.community_alert.shared', {
      alertKind: alert.kind,
      alertSeverity: alert.severity,
      shareChannel: 'system',
    });

    await Share.share({
      // The area name, not the coordinate. §39: a shared alert should say
      // "Rye Lane" and not hand a precise position to whatever app receives it.
      message: `${alert.title} — ${alert.areaName}, ${alert.cityName}. Reported on Diaspora.`,
    });
  }, []);

  const showMap = displayMode === 'map' || displayMode === 'split';
  const showList = displayMode === 'list' || displayMode === 'split';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Community alerts" />

      <View className="px-4 pb-3 gap-2.5">
        <MapModeSwitcher mode={displayMode} onChange={setDisplayMode} />
        <AlertFreshnessBanner
          mode={realtime.mode}
          lastUpdatedAt={realtime.lastUpdatedAt}
          isOffline={isOffline}
        />
        {isCountryOnly ? (
          <Pressable
            onPress={() => setChoosingPlace(true)}
            accessibilityRole="button"
            accessibilityLabel={`No place chosen, so this is a wide view of ${locationLabel(activeLocation)}. Choose a place for alerts near you.`}
            testID="alerts-country-only"
            className="flex-row items-center justify-between gap-3"
          >
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="flex-1 text-xs font-semibold leading-snug"
            >
              No place chosen, so this is a wide view of {locationLabel(activeLocation)}.
            </Text>
            <Text
              style={{ color: tokens.color.primary[500] }}
              className="text-xs font-black uppercase tracking-wider"
            >
              Choose a place
            </Text>
          </Pressable>
        ) : null}
      </View>

      {showMap ? (
        <View style={{ flex: displayMode === 'split' ? 1 : 3 }}>
          <DiasporaMap
            viewport={viewport}
            onViewportChange={setViewport}
            markers={markers}
            circles={circles.length > 0 ? circles : undefined}
            selectedMarkerId={selected ? `alert:${selected.id}` : null}
            onSelectMarker={(marker) =>
              setSelectedId(marker ? marker.entityId ?? null : null)
            }
            userLocation={deviceLocation}
            accessibilityLabel={`Map showing ${markers.length} active community alert${
              markers.length === 1 ? '' : 's'
            }. Switch to list view to read them.`}
          />
        </View>
      ) : null}

      {showList ? (
        <ScrollView
          style={{ flex: displayMode === 'split' ? 1 : 3 }}
          contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 8, paddingBottom: bottomInset }}
        >
          {!isPlaced ? (
            // Nothing is asked for until the member is somewhere: an alert is
            // near a place, and "near nowhere" has no answer worth loading.
            <View className="items-center py-10 px-6" testID="alerts-no-place">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-base font-black text-center"
              >
                Where should we look?
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed mt-1.5 text-center"
              >
                Alerts are about a place. Choose yours to see what members nearby have reported.
              </Text>
              <Pressable
                onPress={() => setChoosingPlace(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose a place"
                style={{ backgroundColor: tokens.color.primary[500] }}
                className="mt-4 px-5 py-2.5 rounded-xl"
              >
                <Text className="text-white text-xs font-black uppercase tracking-wider">
                  Choose a place
                </Text>
              </Pressable>
            </View>
          ) : alerts.isLoading ? (
            <MapLoadingState label="Loading alerts…" />
          ) : alerts.isError ? (
            <MapErrorState
              kind={isOffline ? 'offline' : classifyError(alerts.error)}
              onRetry={() => void alerts.refetch()}
            />
          ) : active.length === 0 ? (
            <MapEmptyState
              hasFilters={false}
              onWiden={() =>
                setViewport({
                  ...viewport,
                  latitudeDelta: viewport.latitudeDelta * 2.5,
                  longitudeDelta: viewport.longitudeDelta * 2.5,
                })
              }
            />
          ) : (
            active.map((alert) => (
              <View key={alert.id}>
                <AlertCard alert={alert} onPress={() => setSelectedId(alert.id)} />

                {selected?.id === alert.id ? (
                  <View className="flex-row gap-2 mt-2">
                    <Pressable
                      onPress={() => handleOpen(alert)}
                      accessibilityRole="button"
                      accessibilityLabel={`Read the full alert: ${alert.title}`}
                      style={{ backgroundColor: tokens.color.primary[500] }}
                      className="flex-1 py-2.5 rounded-xl items-center"
                    >
                      <Text className="text-white text-[10px] font-black uppercase tracking-wider">
                        Read
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/map/route',
                          params: {
                            destLat: String(alert.coordinate.latitude),
                            destLon: String(alert.coordinate.longitude),
                            destLabel: alert.areaName,
                          },
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Get directions to ${alert.areaName}`}
                      style={{
                        backgroundColor: tokens.color.surface.card,
                        borderColor: tokens.color.border.default,
                      }}
                      className="flex-1 py-2.5 rounded-xl border items-center"
                    >
                      <Text
                        style={{ color: tokens.color.text.secondary }}
                        className="text-[10px] font-black uppercase tracking-wider"
                      >
                        Directions
                      </Text>
                    </Pressable>

                    {alert.isShareable ? (
                      <Pressable
                        onPress={() => void handleShare(alert)}
                        accessibilityRole="button"
                        accessibilityLabel={`Share the alert: ${alert.title}`}
                        style={{
                          backgroundColor: tokens.color.surface.card,
                          borderColor: tokens.color.border.default,
                        }}
                        className="flex-1 py-2.5 rounded-xl border items-center"
                      >
                        <Text
                          style={{ color: tokens.color.text.secondary }}
                          className="text-[10px] font-black uppercase tracking-wider"
                        >
                          Share
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      ) : null}

      <GlobalLocationSelector visible={choosingPlace} onClose={() => setChoosingPlace(false)} />
    </SafeAreaView>
  );
}
