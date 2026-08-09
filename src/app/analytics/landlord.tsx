// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Housing analytics (Frontend Phase 15, §20)
//
// Listing performance and the enquiry funnel: impression → view → save → enquiry
// → application.
//
// ── The breakdown that is deliberately absent ────────────────────────────────
//
// There is no breakdown of enquirers by country or by community on this screen,
// and the gap register's contract does not offer the dimension either.
//
// That is not an oversight. Housing is where discrimination risk is highest on
// this platform, and a dashboard that let a landlord see "enquiries by country of
// origin" would be handing them the raw material for it — legibly, with a chart.
// §20 says do not expose renter information; refusing the dimension outright is
// the version of that which survives a backend that later offers it.
//
// Location performance is offered, because where a property is advertised is a
// property of the property.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useAuthStore } from '@/store/auth';
import { SubjectDashboard } from '@/components/analytics';

export default function LandlordAnalyticsScreen() {
  const userId = useAuthStore((state) => state.user?.userId ?? null);

  return (
    <SubjectDashboard
      subject={{ type: 'landlord', id: userId }}
      title="Letting"
      subtitle="How your listings are doing"
      funnelKey="housing"
      breakdowns={['neighborhood', 'source', 'placement']}
      gapDetail="Diaspora records no impression, view or save on a housing listing yet, so these figures come from a development adapter. Enquiries and applications will be real once the contract exists — the records do, the aggregate does not."
    />
  );
}
