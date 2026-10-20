// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Neighbourhood analytics (Frontend Phase 15, §14)
//
// **A neighbourhood is the area around a point** since the place catalogue was
// retired (14 Oct 2026). The subject id carries the point —
// `lat,lng,CC[,radiusKm]`, built by `neighborhoodSubjectId` — and the dataset
// is composed from two real routes (20 Oct 2026):
//
//   `GET /geo/area`                        homes, items for sale, jobs and
//                                          community updates listed in the circle;
//   `GET /community-life/area/activity`    upcoming events, organisations, and
//                                          the RSVPs and attendance on events
//                                          there over the chosen range.
//
// Reached as `/analytics/neighborhood/<point id>`, or with `latitude`,
// `longitude`, `countryCode` (and optionally `radiusKm`, `name`) as parameters —
// the same parameters `/map/area` takes. An old catalogue id has no point, and
// the dashboard says there is nothing to show for it rather than reading a
// retired route.
//
// §14 forbids fabricating location intelligence, and a neighbourhood is small
// enough that fabrication has consequences. Nothing here is simulated, and
// nothing the routes do not count — member numbers, growth — is drawn.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SubjectDashboard } from '@/components/analytics';
import { neighborhoodSubjectId } from '@/lib/analytics-api';

export default function NeighborhoodAnalyticsScreen() {
  const params = useLocalSearchParams<{
    id: string;
    latitude?: string;
    longitude?: string;
    countryCode?: string;
    radiusKm?: string;
    name?: string;
  }>();

  const latitude = Number(params.latitude);
  const longitude = Number(params.longitude);
  const radiusKm = params.radiusKm ? Number(params.radiusKm) : undefined;
  const fromPoint =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    params.latitude !== undefined &&
    params.longitude !== undefined &&
    /^[A-Za-z]{2}$/.test(params.countryCode ?? '')
      ? neighborhoodSubjectId({
          latitude,
          longitude,
          countryCode: params.countryCode as string,
          radiusKm: radiusKm !== undefined && Number.isFinite(radiusKm) ? radiusKm : undefined,
        })
      : null;

  return (
    <SubjectDashboard
      subject={{ type: 'neighborhood', id: fromPoint ?? params.id ?? null, label: params.name ?? null }}
      title={params.name || 'Neighbourhood'}
      subtitle="What is here, and how it is used"
      breakdowns={['category', 'community']}
      gapDetail="The counts of homes, items for sale, jobs, updates, events and organisations here are real — they come from Diaspora's own area routes. Member numbers and growth for an area are not recorded."
    />
  );
}
