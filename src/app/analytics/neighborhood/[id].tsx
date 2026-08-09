// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Neighbourhood analytics (Frontend Phase 15, §14)
//
// **The most connected surface in the phase.** `GET /neighborhood/{id}` returns
// real `resourceCounts` across six domains, so the inventory cards here are
// backend figures with no gap notice — because they are not gaps.
//
// What is simulated is the time dimension: how any of it changed. That is the
// registered gap, and it is narrow and specific rather than "neighbourhood
// analytics does not exist".
//
// §14 forbids fabricating location intelligence, and a neighbourhood is small
// enough that fabrication has consequences — a made-up safety trend for a real
// street is a claim about a real place people live. The safety and cost-of-living
// figures are Phase 8's, with Phase 8's own provenance and freshness, and this
// screen does not re-derive them.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SubjectDashboard } from '@/components/analytics';

export default function NeighborhoodAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SubjectDashboard
      subject={{ type: 'neighborhood', id: id ?? null }}
      title="Neighbourhood"
      subtitle="What is here, and how it is used"
      breakdowns={['category', 'community']}
      gapDetail="The counts of providers, housing, jobs, events, listings and organizations here are real — they come from Diaspora's own neighbourhood route. How they changed over time is not recorded yet, so the trends come from a development adapter."
    />
  );
}
