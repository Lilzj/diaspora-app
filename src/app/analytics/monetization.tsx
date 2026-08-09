// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization analytics (Frontend Phase 15, §31 · §67)
//
// Placement performance, spend against revenue, and the placement funnel.
//
// ── ROI is deliberately absent ───────────────────────────────────────────────
//
// §31 forbids fabricating ROI without proper attribution data, and Diaspora has
// none: nothing links a placement impression to the purchase that followed it.
//
// The tempting repair is to allocate revenue across concurrent placements in
// proportion to spend. It produces a number that always looks reasonable and is
// never right, and once it is on a screen somebody will budget against it. So the
// card is absent and the gap says why — which is the difference between a
// dashboard that is incomplete and one that is wrong.
//
// ── The entitlement gate is real and stays where it is ───────────────────────
//
// Phase 6's `analytics.advanced` is a live entitlement on real plans, and
// `/monetization/analytics` already gates on it correctly — the premium query
// does not fire at all while the entitlement is false, so premium data is never
// sent to a device that has not bought it and then hidden in the UI. This screen
// does not re-implement that gate; it consumes the payload once Phase 6's hook
// has decided the member may have it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useAuthStore } from '@/store/auth';
import { SubjectDashboard } from '@/components/analytics';

export default function MonetizationAnalyticsScreen() {
  const userId = useAuthStore((state) => state.user?.userId ?? null);

  return (
    <SubjectDashboard
      subject={{ type: 'campaign', id: userId }}
      title="Promotions"
      subtitle="What your spend bought"
      funnelKey="monetization"
      breakdowns={['placement', 'category', 'community']}
      gapDetail="Your spend is real — it comes from your wallet. Impressions, opens and conversions are not recorded against a placement yet, so those come from a development adapter. There is no return-on-investment figure on this screen because Diaspora cannot yet link a purchase to the placement that led to it, and a number invented for that would look reasonable and be wrong."
    />
  );
}
