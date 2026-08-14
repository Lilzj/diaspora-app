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
// There is no geographic realtime channel (FRONTEND-MAPS-GAP-018), so this
// polls once a minute and the banner says so. §43 forbids claiming real-time
// safety data is current when it is not, and "live" is precisely the word that
// would make a member trust a road closure that cleared four minutes ago.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
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
import { useAlertArea, useCommunityAlerts, useMapRealtime } from '@/hooks/maps';
import { useMapSessionStore } from '@/store/map-session';
import { getActiveLocation, useLocationStore } from '@/store/location';
import { useConnectivityStore } from '@/lib/connectivity';
import { alertMarker } from '@/lib/maps/markers';
import { classifyError } from '@/lib/maps/errors';
import { trackMapsEvent } from '@/lib/maps/analytics';
import { viewportFromCenter, viewportToBounds } from '@/lib/maps/geo';
import type { AlertSeverity, CommunityAlert, MapDisplayMode, MapViewport } from '@/types/maps';
import { useBottomInset } from '@/components/layout/bottom-inset';

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

  const [viewport, setViewport] = useState<MapViewport>(() =>
    viewportFromCenter(
      { latitude: activeLocation.latitude, longitude: activeLocation.longitude },
      8
    )
  );

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

  const area = useAlertArea(selected?.id);

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
      </View>

      {showMap ? (
        <View style={{ flex: displayMode === 'split' ? 1 : 3 }}>
          <DiasporaMap
            viewport={viewport}
            onViewportChange={setViewport}
            markers={markers}
            circles={
              // Drawn only when the adapter actually supplied an area. An alert
              // without one is a point, and `<AlertAreaNote>` says why.
              selected && area.data
                ? [
                    {
                      id: `alert-area-${selected.id}`,
                      center: area.data.center,
                      radiusMetres: area.data.radiusMetres ?? 300,
                      fillColor: `${tokens.color.error.default}1A`,
                      strokeColor: `${tokens.color.error.default}66`,
                    },
                  ]
                : undefined
            }
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
          {alerts.isLoading ? (
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
    </SafeAreaView>
  );
}
