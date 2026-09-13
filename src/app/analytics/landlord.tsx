// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Housing analytics (Frontend Phase 15, §20)
//
// **Real since 13 Sep 2026.** This screen reads `GET /analytics/landlords/me`, a
// certified `AnalyticsDataset` of the landlord's own housing listings summed
// together: views, unique viewers, viewings booked, viewing rate and homes
// published, with a views series and a top-listings board. Before that it read
// the development adapter in every build — a release build showed nothing, and a
// preview build showed impressions, saves and enquiries Diaspora has never
// counted for a home.
//
// ── Where each figure comes from ─────────────────────────────────────────────
//
//   views              the home screen's `content.viewed`
//   unique viewers     the same events, counted across this landlord's homes
//                      only — never across everything they published
//   viewings           `ViewingScheduled`, as analytics records it
//   viewing rate       viewings ÷ views on the server; absent, not 0%, for a
//                      home nobody opened
//   homes published    `HousingPublished`
//
// The server reads by the member's user id, never the landlord *profile* id:
// Housing keeps a profile per member with its own identifier, and a dashboard
// keyed by it answered nothing for anybody.
//
// **There is no revenue here, withheld or otherwise**: rent is not taken through
// Diaspora. **Impressions, saves, enquiries, applications, the funnel and the
// breakdowns are not computed.** In a release build those sections are absent
// rather than zeroed — "not computed" and "nobody did it" are different sentences.
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
// the version of that which survives a backend that later offers it. The served
// dataset has no such dimension, and names nobody who booked a viewing.
//
// Location performance is offered, because where a property is advertised is a
// property of the property.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useAuthStore } from '@/store/auth';
import { SubjectDashboard } from '@/components/analytics';

export default function LandlordAnalyticsScreen() {
  // The landlord subject is the caller's own account. The id comes from the
  // session rather than from a route parameter, so there is no parameter to
  // manipulate. `/analytics/access` checks it is the caller before the dataset
  // is requested, and the dataset route is `/me`, so it has no id to change.
  const userId = useAuthStore((state) => state.user?.userId ?? null);

  return (
    <SubjectDashboard
      subject={{ type: 'landlord', id: userId }}
      title="Letting"
      subtitle="How your listings are doing"
      funnelKey="housing"
      breakdowns={['neighborhood', 'source', 'placement']}
      // Shown only where the certified route did not answer and the development
      // adapter did, which is a preview build with the landlord route unreachable.
      gapDetail="Your views, viewings and viewing rate come from Diaspora. Impressions, saves, enquiries, applications, the funnel and the breakdowns by neighbourhood, source and placement are not counted yet, so any shown here come from a development adapter."
    />
  );
}
