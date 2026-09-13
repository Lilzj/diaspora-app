// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Marketplace seller analytics (Frontend Phase 15, §18)
//
// **Real since 13 Sep 2026.** This screen reads `GET /analytics/sellers/me`, a
// certified `AnalyticsDataset` of the seller's own listings summed together:
// views, unique viewers, sales, conversion rate, enquiries and listings
// published, with a views series and a top-listings board. Before that it read the development
// adapter, in every build, because the dataset hook had no seller arm — so a
// release build showed nothing and a preview build showed invented figures.
//
// ── Where each figure comes from ─────────────────────────────────────────────
//
//   views              the listing screen's `content.viewed`
//   unique viewers     the same events, counted across this seller's listings
//                      only — never across everything they published, which
//                      would count their guide readers as listing viewers
//   sales              `ListingSold`, as analytics records it
//   conversion rate    sales ÷ views on the server; absent, not 0%, for a
//                      listing nobody opened
//   enquiries          the first message in a conversation about a listing,
//                      from Conversations — once per conversation; a chat
//                      opened and never written in is not one (13 Sep 2026)
//   listings published `ListingPublished`
//
// **Revenue is not measured here** and arrives in `unavailableMetrics`: money is
// the financial platform's, and the wallet is where a seller finds it.
// **Impressions, the funnel and the breakdowns are not computed.** In a
// release build those sections are absent rather than zeroed — "not computed" and
// "nobody did it" are different sentences.
//
// The operational view — offers and reservations waiting, listings about to
// expire — is `GET /marketplace/sellers/me/dashboard`, which this complements.
//
// §18 forbids duplicating marketplace business logic and none is duplicated: the
// dashboard computes no price, no fee and no settlement.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useAuthStore } from '@/store/auth';
import { SubjectDashboard } from '@/components/analytics';

export default function SellerAnalyticsScreen() {
  // The seller subject is the caller's own seller account. The id comes from the
  // session rather than from a route parameter, so there is no parameter to
  // manipulate. `/analytics/access` checks it is the caller before the dataset
  // is requested, and the dataset route is `/me`, so it has no id to change.
  const userId = useAuthStore((state) => state.user?.userId ?? null);

  return (
    <SubjectDashboard
      subject={{ type: 'seller', id: userId }}
      title="Selling"
      subtitle="How your listings are doing"
      funnelKey="marketplace"
      breakdowns={['category', 'community', 'placement']}
      // Shown only where the certified route did not answer and the development
      // adapter did, which is a preview build with the seller route unreachable.
      gapDetail="Your views, sales, conversion rate and enquiries come from Diaspora. Impressions, the funnel and the breakdowns by category, community and placement are not counted yet, so any shown here come from a development adapter. Revenue is in your wallet."
    />
  );
}
