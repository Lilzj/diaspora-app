// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Provider analytics (Frontend Phase 15, §17)
//
// **Real since 13 Sep 2026.** This screen reads `GET /analytics/providers/me`, a
// certified `AnalyticsDataset` of the member's own provider profiles summed
// together: views, unique viewers, saves and profiles published, with a views
// series and a top-profiles board.
//
// Before that it was `/analytics/provider/[id]`, over the development adapter in
// every build, and **nothing in the app linked to it** — no hub row, no link from
// the provider's own profile. Its id came from the route, and `/analytics/access`
// read a `provider` subject only as one provider profile, so the dashboard asked
// for with the member's own id would have been refused to every provider. It now
// takes the caller from the session, as Selling, Letting and Hiring do, and the
// hub and the owner's view of their own provider profile both open it.
//
// ── Where each figure comes from ─────────────────────────────────────────────
//
//   views              the provider screen's `content.viewed`; an owner opening
//                      their own profile is not counted
//   unique viewers     the same events, counted across this member's profiles
//   saves              the profile's save button — Providers hands the save to
//                      Community, which publishes it
//   profiles published `ProviderPublished`
//
// ── What it does not show ────────────────────────────────────────────────────
//
// No enquiries, leads or conversion rate. Calls and directions are recorded
// nowhere; a message starts a conversation, which the Conversations module
// publishes and analytics does not count yet. Search appearances are recorded by
// the search screen and published as no figure. Reviews and the rating stay on
// the provider profile, which already shows them.
//
// §17 forbids exposing private customer information, and the shape of the data
// is what enforces it: a save **count** is safe, a list of who saved a business
// is not analytics. Nothing the route returns could carry one.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useAuthStore } from '@/store/auth';
import { SubjectDashboard } from '@/components/analytics';

export default function ProviderAnalyticsScreen() {
  // The provider subject is the caller's own account — the member, never one
  // provider's id. From the session rather than a route parameter, so there is no
  // parameter to get wrong or to manipulate; the dataset route is `/me`.
  const userId = useAuthStore((state) => state.user?.userId ?? null);

  return (
    <SubjectDashboard
      subject={{ type: 'provider', id: userId }}
      title="Your business"
      subtitle="How your provider profile is doing"
      funnelKey="provider"
      breakdowns={['source', 'community', 'neighborhood']}
      // Shown only where the certified route did not answer and the development
      // adapter did, which is a preview build with the provider route unreachable.
      gapDetail="Your views, saves and profiles published come from Diaspora. Search appearances, enquiries, leads, the funnel and the breakdowns are not counted yet, so any shown here come from a development adapter. Every figure is a count — this dashboard has no way to show you who viewed or saved your profile, and will not gain one."
    />
  );
}
