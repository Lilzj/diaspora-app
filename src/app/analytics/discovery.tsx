// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Discovery analytics (Frontend Phase 15, §25 · §26 · §27)
//
// Search, recommendations and maps in one screen, because they answer one
// question — how do people find things, and when do they fail to — and three
// separate dashboards would make that question three navigations.
//
// ── The two rules this screen exists to respect ──────────────────────────────
//
//   **§25: no scoring in the frontend.** Recommendation click-through is *read*
//   from the contract, never divided here. A client-computed rate over a filtered
//   breakdown silently changes the denominator, and computing relevance is the
//   recommendation service's job.
//
//   **§26: individual search history is not analytics.** Popular queries appear
//   only as an aggregate the backend published above a minimum-frequency
//   threshold. `store/knowledge-search.ts` holds the member's own recent searches
//   on the device and this screen does not read it — a "your searches" section
//   here would be a member's search history rendered as a dashboard.
//
// Map figures are the coarse ~11 km grid Phase 8 already produces. No coordinate
// reaches this screen, because none leaves the device.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { SubjectDashboard } from '@/components/analytics';

export default function DiscoveryAnalyticsScreen() {
  return (
    <SubjectDashboard
      subject={{ type: 'platform', id: null }}
      title="Discovery"
      subtitle="Search, recommendations and maps"
      metrics={[
        'search.volume',
        'search.noResultRate',
        'search.clickThroughRate',
        'search.toActionRate',
        'recommendation.impressions',
        'recommendation.clickThroughRate',
        'recommendation.dismissals',
        'map.opens',
        'map.markerInteractions',
        'map.routeRequests',
      ]}
      breakdowns={['category', 'community', 'surface']}
      gapDetail="Diaspora does not log searches, recommendation impressions or map interactions yet, so every figure here comes from a development adapter. When search logging does arrive it must count queries above a frequency threshold and never associate one with a member — a diaspora member searching for immigration advice is disclosing something they did not choose to publish."
    />
  );
}
