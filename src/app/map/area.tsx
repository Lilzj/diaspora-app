// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the area around a point (14 Oct 2026)
//
// The owner retired the platform's own place catalogue. A neighbourhood page
// used to describe a named catalogue node, and only the handful of places the
// catalogue held had one. This screen describes a circle instead: what is
// within 1, 2, 5 or 10 km of a Google place the member picked, of a map cell's
// centre, or of where the member is, in any country.
//
// One read, `GET /geo/area`, gives the counts, the rent index and the safety
// counts. Members' own insights come from `GET /housing/area/insights` and new
// ones go to `POST` on the same path, moderated before they appear.
//
// Three rules hold on this screen:
//   * **No safety score, ever.** Safety is what named sources counted, one
//     source at a time; a source that does not publish here says "not
//     available here", which is not zero.
//   * **No guessed rent.** Too few homes listed is "not enough nearby listings
//     yet", with the sample sizes, never an index from a thin sample.
//   * **No inferred name.** The title is the place the member picked, or a
//     description of the circle. The platform never names a point itself.
//
// Params: `latitude`, `longitude`, `countryCode`, `name`, `placeId`, `radiusKm`,
// `origin` (`place`, `cell` or `me`). Without a point it opens on the member's
// own location, and without one of those it asks for a place.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AddressSearchField } from '@/components/maps/AddressSearchField';
import {
  CostOfLivingPanel,
  DiasporaMap,
  MapErrorState,
  MapLoadingState,
  PrimaryButton,
  SafetyCountsPanel,
  SecondaryButton,
} from '@/components/maps';
import { useAreaReport } from '@/hooks/maps';
import { useMemberPoint } from '@/hooks/member-point';
import { useAreaInsights, useSubmitAreaInsight } from '@/hooks/area-insights';
import { classifyError } from '@/lib/maps/errors';
import { trackMapsEvent } from '@/lib/maps/analytics';
import { viewportFromCenter } from '@/lib/maps/geo';
import { AREA_RADII_KM, DEFAULT_AREA_RADIUS_KM, type AreaReport } from '@/lib/maps/geo-client';
import {
  areaTitle,
  costOfLivingUnavailableText,
  parseAreaPoint,
  type ChosenPoint,
} from '@/lib/maps/area-copy';
import {
  AREA_INSIGHT_CATEGORIES,
  AREA_INSIGHT_CATEGORY_LABELS,
  AREA_INSIGHT_MAX_LENGTH,
  type AreaInsight,
  type AreaInsightCategory,
} from '@/lib/area-insights-api';
import { useBottomInset } from '@/components/layout/bottom-inset';

/** The counts the area route publishes, in the order a member reads them. */
const COUNT_ROWS: readonly { key: string; label: string; noun: string }[] = [
  { key: 'housing', label: 'Homes', noun: 'homes' },
  { key: 'marketplace', label: 'For sale', noun: 'items for sale' },
  { key: 'jobs', label: 'Jobs', noun: 'jobs' },
  { key: 'events', label: 'Events', noun: 'events' },
  { key: 'updates', label: 'Updates', noun: 'community updates' },
];

function parseRadius(value: string | undefined): number {
  const parsed = Number(value);
  return (AREA_RADII_KM as readonly number[]).includes(parsed) ? parsed : DEFAULT_AREA_RADIUS_KM;
}

export default function AreaScreen() {
  const bottomInset = useBottomInset();
  const { tokens } = useTheme();
  const params = useLocalSearchParams<{
    latitude?: string;
    longitude?: string;
    countryCode?: string;
    name?: string;
    placeId?: string;
    radiusKm?: string;
    origin?: string;
  }>();
  const member = useMemberPoint();

  const fromParams = useMemo(
    () => parseAreaPoint(params, member.countryCode),
    // Only the params decide this; the member's country is a fallback for a missing one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.latitude, params.longitude, params.countryCode, params.name, params.placeId, params.origin]
  );

  const [picked, setPicked] = useState<ChosenPoint | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(() => parseRadius(params.radiusKm));

  const chosen = useMemo<ChosenPoint | null>(
    () => picked ?? fromParams ?? (member.point ? { ...member.point, name: null, origin: 'me' } : null),
    [fromParams, member.point, picked]
  );

  const hasCountry = Boolean(chosen && /^[A-Z]{2}$/.test(chosen.countryCode));
  const report = useAreaReport(chosen && hasCountry ? chosen : null, radiusKm);
  const insights = useAreaInsights(chosen, radiusKm);

  useEffect(() => {
    if (report.data) trackMapsEvent('maps.neighborhood_score.viewed');
  }, [report.data]);

  const handlePicked = useCallback(
    (address: { latitude: number; longitude: number; countryCode: string | null; placeId: string }, text: string) => {
      setPicked({
        latitude: address.latitude,
        longitude: address.longitude,
        countryCode: (address.countryCode || member.countryCode || '').toUpperCase(),
        name: text,
        placeId: address.placeId,
        origin: 'place',
      });
    },
    [member.countryCode]
  );

  const title = areaTitle(report.data ?? null, chosen, radiusKm);

  const viewport = useMemo(
    () =>
      chosen
        ? viewportFromCenter({ latitude: chosen.latitude, longitude: chosen.longitude }, radiusKm * 1.6)
        : null,
    [chosen, radiusKm]
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title={chosen ? title : 'An area'} />

      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset }} keyboardShouldPersistTaps="handled">
        {viewport && chosen ? (
          <View style={{ height: 180 }}>
            <DiasporaMap
              viewport={viewport}
              onViewportChange={() => undefined}
              markers={[]}
              circles={[
                {
                  id: 'area-circle',
                  center: { latitude: chosen.latitude, longitude: chosen.longitude },
                  radiusMetres: radiusKm * 1000,
                  fillColor: `${tokens.color.primary[500]}18`,
                  strokeColor: `${tokens.color.primary[500]}66`,
                },
              ]}
              clustering={false}
              showControls={false}
              accessibilityLabel={`Map of the area within ${radiusKm} km of ${title}.`}
            />
          </View>
        ) : null}

        <View className="px-4 pt-4">
          {/* ── Where ─────────────────────────────────────────────────────── */}
          <AddressSearchField
            label={chosen ? 'Look at another place' : 'Choose a place'}
            placeholder="A town, district or neighbourhood"
            regionsOnly
            near={chosen ? { latitude: chosen.latitude, longitude: chosen.longitude } : undefined}
            onResolved={(address, text) =>
              handlePicked(
                {
                  latitude: address.latitude,
                  longitude: address.longitude,
                  countryCode: address.countryCode,
                  placeId: address.placeId,
                },
                text
              )
            }
            testID="area-place-search"
          />

          {!chosen ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed"
              testID="area-needs-place"
            >
              Diaspora knows your country but not where in it you are. Choose a place above, or set your
              location, to see what is around it.
            </Text>
          ) : null}

          {member.point && picked ? (
            <View className="mb-3">
              <SecondaryButton label="Back to around me" icon="locate-outline" onPress={() => setPicked(null)} />
            </View>
          ) : null}

          {chosen ? (
            <>
              {/* ── Radius ─────────────────────────────────────────────────── */}
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="How far around"
                style={{ backgroundColor: tokens.color.neutral[100] }}
                className="flex-row rounded-2xl p-1"
              >
                {AREA_RADII_KM.map((value) => {
                  const isActive = value === radiusKm;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setRadiusKm(value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`${value} kilometres`}
                      style={{ backgroundColor: isActive ? tokens.color.surface.card : 'transparent' }}
                      className="flex-1 py-2.5 rounded-xl items-center"
                      testID={`area-radius-${value}`}
                    >
                      <Text
                        style={{ color: isActive ? tokens.color.text.primary : tokens.color.text.placeholder }}
                        className="text-[11px] font-black"
                      >
                        {value} km
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {!hasCountry ? (
                <View className="mt-4">
                  <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
                    Diaspora does not know which country this point is in. Choose the place by name above.
                  </Text>
                </View>
              ) : report.isLoading ? (
                <MapLoadingState label="Looking at what is around…" />
              ) : report.isError || !report.data ? (
                <View className="mt-4">
                  <MapErrorState
                    kind={report.isError ? classifyError(report.error) : 'not-found'}
                    onRetry={() => void report.refetch()}
                  />
                </View>
              ) : (
                <AreaBody report={report.data} chosen={chosen} radiusKm={radiusKm} />
              )}

              {/* ── What members say ───────────────────────────────────────── */}
              <AreaInsightsSection
                chosen={chosen}
                insights={insights.data ?? []}
                isLoading={insights.isLoading}
                isError={insights.isError}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AreaBody({ report, chosen, radiusKm }: { report: AreaReport; chosen: ChosenPoint; radiusKm: number }) {
  const { tokens } = useTheme();

  return (
    <View className="mt-4">
      {/* ── Counts ───────────────────────────────────────────────────────── */}
      <View
        style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
        className="rounded-3xl border p-5"
      >
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-black uppercase tracking-widest"
        >
          {`Within ${report.radiusKm} km · ${report.countryName}`}
        </Text>

        <View className="flex-row flex-wrap gap-2 mt-3">
          {COUNT_ROWS.map(({ key, label, noun }) => {
            const count = report.resourceCounts[key];
            const known = typeof count === 'number' && !report.unavailableResourceTypes.includes(key);
            const atLeast = known && report.lowerBoundResourceTypes.includes(key);
            return (
              <View
                key={key}
                style={{ backgroundColor: tokens.color.neutral[100] }}
                className="px-3 py-2 rounded-xl"
                accessible
                accessibilityRole="text"
                // An absent count is one the platform could not take, which is not zero.
                accessibilityLabel={
                  known
                    ? `${atLeast ? 'At least ' : ''}${count} ${noun} within ${report.radiusKm} kilometres`
                    : `${label}: not counted here`
                }
                testID={`area-count-${key}`}
              >
                <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
                  {known ? `${atLeast ? '≥' : ''}${count}` : '—'}
                </Text>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[9px] font-black uppercase tracking-wider"
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>

        <View className="mt-4 gap-2">
          <SecondaryButton
            label="See these on the map"
            icon="map-outline"
            onPress={() =>
              router.push({
                pathname: '/map',
                params: { lat: String(report.latitude), lon: String(report.longitude) },
              })
            }
          />
          <SecondaryButton
            label="Events around here"
            icon="calendar-outline"
            onPress={() =>
              router.push({
                pathname: '/community-life/neighborhood',
                params: {
                  latitude: String(chosen.latitude),
                  longitude: String(chosen.longitude),
                  radiusKm: String(radiusKm),
                  ...(chosen.name ? { name: chosen.name } : {}),
                },
              })
            }
          />
          <SecondaryButton
            label="Compare with another place"
            icon="git-compare-outline"
            onPress={() =>
              router.push({
                pathname: '/map/compare',
                params: {
                  latitudeA: String(chosen.latitude),
                  longitudeA: String(chosen.longitude),
                  countryCodeA: chosen.countryCode,
                  ...(chosen.name ? { nameA: chosen.name } : {}),
                  radiusKm: String(radiusKm),
                },
              })
            }
          />
        </View>
      </View>

      {/* ── Cost of living ───────────────────────────────────────────────── */}
      <View className="mt-4">
        {report.costOfLiving.index ? (
          <CostOfLivingPanel index={report.costOfLiving.index} />
        ) : (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-3xl border p-5"
          >
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest"
            >
              Cost of living
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed mt-2"
              testID="area-cost-unavailable"
            >
              {costOfLivingUnavailableText(report.costOfLiving)}
            </Text>
          </View>
        )}
      </View>

      {/* ── Safety: sourced counts only, never a score ───────────────────── */}
      <View className="mt-4">
        {report.safety.counts.length > 0 ? (
          <SafetyCountsPanel counts={report.safety.counts} limitations={report.safety.limitations} />
        ) : (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-3xl border p-5"
          >
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest"
            >
              Safety
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed mt-2"
              testID="area-safety-unavailable"
            >
              Safety figures are not available here. Diaspora does not give places a safety score.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function AreaInsightsSection({
  chosen,
  insights,
  isLoading,
  isError,
}: {
  chosen: ChosenPoint;
  insights: AreaInsight[];
  isLoading: boolean;
  isError: boolean;
}) {
  const { tokens } = useTheme();
  const submit = useSubmitAreaInsight();
  const [category, setCategory] = useState<AreaInsightCategory>('Community');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);

  const trimmed = body.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= AREA_INSIGHT_MAX_LENGTH && !submit.isPending;

  const send = () => {
    if (!canSend) return;
    submit.mutate(
      {
        latitude: chosen.latitude,
        longitude: chosen.longitude,
        placeName: chosen.name ?? null,
        placeId: chosen.placeId ?? null,
        countryCode: chosen.countryCode || null,
        category,
        body: trimmed,
      },
      {
        onSuccess: () => {
          setBody('');
          setSent(true);
        },
      }
    );
  };

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-3xl border p-5 mt-4"
      testID="area-insights"
    >
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest"
      >
        What members say about this area
      </Text>

      {isLoading ? (
        <ActivityIndicator size="small" color={tokens.color.primary[500]} style={{ marginTop: 12 }} />
      ) : isError ? (
        <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold mt-2">
          Members&apos; notes could not be loaded just now.
        </Text>
      ) : insights.length === 0 ? (
        <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold mt-2">
          Nobody has shared anything about this area yet.
        </Text>
      ) : (
        insights.map((insight) => (
          <View
            key={insight.id}
            style={{ borderTopColor: tokens.color.border.default }}
            className="border-t pt-3 mt-3"
          >
            <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-black uppercase">
              {AREA_INSIGHT_CATEGORY_LABELS[insight.category as AreaInsightCategory] ?? insight.category}
              {insight.placeName ? ` · ${insight.placeName}` : ''}
              {typeof insight.distanceKm === 'number' ? ` · ${insight.distanceKm.toFixed(1)} km away` : ''}
            </Text>
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-semibold mt-1 leading-relaxed">
              {insight.body}
            </Text>
            {insight.status !== 'Approved' && insight.isAuthor ? (
              <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold mt-1">
                Only you can see this until a moderator has read it.
              </Text>
            ) : null}
          </View>
        ))
      )}

      {/* ── Share one ─────────────────────────────────────────────────────── */}
      <View style={{ borderTopColor: tokens.color.border.default }} className="border-t pt-4 mt-4">
        <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black">
          Share something you know about this area
        </Text>

        <View className="flex-row flex-wrap gap-1.5 mt-2" accessibilityRole="radiogroup" accessibilityLabel="Topic">
          {AREA_INSIGHT_CATEGORIES.map((value) => {
            const isActive = value === category;
            return (
              <Pressable
                key={value}
                onPress={() => setCategory(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                style={{
                  backgroundColor: isActive ? tokens.color.primary[500] : tokens.color.neutral[100],
                }}
                className="px-2.5 py-1.5 rounded-full"
              >
                <Text
                  style={{ color: isActive ? tokens.color.text.inverse : tokens.color.text.secondary }}
                  className="text-[11px] font-bold"
                >
                  {AREA_INSIGHT_CATEGORY_LABELS[value]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          value={body}
          onChangeText={(text) => {
            setBody(text);
            setSent(false);
          }}
          placeholder="Quiet after ten, buses every few minutes, a good market on Saturdays…"
          placeholderTextColor={tokens.color.text.placeholder}
          multiline
          maxLength={AREA_INSIGHT_MAX_LENGTH}
          accessibilityLabel="What you know about this area"
          style={{
            color: tokens.color.text.primary,
            borderColor: tokens.color.border.default,
            minHeight: 72,
            textAlignVertical: 'top',
          }}
          className="border rounded-2xl px-3 py-2 mt-3 text-sm"
          testID="area-insight-body"
        />
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold mt-1 text-right">
          {`${trimmed.length}/${AREA_INSIGHT_MAX_LENGTH}`}
        </Text>

        {trimmed.length === 0 && !sent ? (
          <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mt-1">
            Write what you want to share to send it.
          </Text>
        ) : null}

        <View className="mt-2">
          <PrimaryButton
            label={submit.isPending ? 'Sending…' : 'Send for review'}
            icon="send-outline"
            onPress={send}
            disabled={!canSend}
          />
        </View>

        {sent ? (
          <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold mt-2" testID="area-insight-sent">
            Thank you. A moderator reads every note before it appears.
          </Text>
        ) : null}
        {submit.isError ? (
          <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold mt-2">
            That could not be sent just now. Please try again.
          </Text>
        ) : null}
      </View>
    </View>
  );
}
