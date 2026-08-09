// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Marketplace seller analytics (Frontend Phase 15, §18)
//
// Listing performance and the seven-step marketplace funnel §32 names:
// impression → view → save → contact → offer → reservation → purchase.
//
// **Sales and refunds are real.** They come from B15's certified purchase and
// transaction contracts and render as backend figures beside the simulated
// discovery metrics — which is the whole reason `AnalyticsMetric` carries
// provenance per field rather than per screen. A seller looking at this can tell
// which numbers Diaspora actually knows.
//
// §18 forbids duplicating marketplace business logic and none is duplicated: the
// dashboard reads existing contracts and computes no price, no fee and no
// settlement.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useAuthStore } from '@/store/auth';
import { SubjectDashboard } from '@/components/analytics';

export default function SellerAnalyticsScreen() {
  // The seller subject is the caller's own seller account. The id comes from the
  // session rather than from a route parameter, so there is no parameter to
  // manipulate — the same protection the creator subject gets from having no id
  // at all.
  const userId = useAuthStore((state) => state.user?.userId ?? null);

  return (
    <SubjectDashboard
      subject={{ type: 'seller', id: userId }}
      title="Selling"
      subtitle="How your listings are doing"
      funnelKey="marketplace"
      breakdowns={['category', 'community', 'placement']}
      gapDetail="Your sales and refunds are real figures from your wallet. Impressions, views, saves and contacts are not recorded yet, so those come from a development adapter — which is also why the funnel above the sale step is simulated."
    />
  );
}
