// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Provider analytics (Frontend Phase 15, §17)
//
// **Real since 13 Sep 2026.** This screen reads `GET /analytics/providers/me`, a
// certified `AnalyticsDataset` of the member's own provider profiles summed
// together: views, unique viewers, enquiries, saves and profiles published, with
// a views series and a top-profiles board carrying enquiries beside views.
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
//   enquiries          the first message in a conversation opened from the
//                      profile — once per conversation; a chat opened and never
//                      written in is not one (13 Sep 2026)
//   saves              the profile's save button — Providers hands the save to
//                      Community, which publishes it
//   profiles published `ProviderPublished`
//
// ── What it does not show ────────────────────────────────────────────────────
//
// No leads or conversion rate: a lead needs a reply joined to the enquiry, which
// nothing defines, and a provider sells nothing through the profile. Calls and
// directions are recorded nowhere. Search appearances are recorded by the search
// screen and published as no figure. Reviews and the rating stay on the provider
// profile, which already shows them.
//
// §17 forbids exposing private customer information, and the shape of the data
// is what enforces it: an enquiry **count** is safe, a list of who wrote to a
// business is not analytics — it is their inbox. Nothing the route returns could
// carry one.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useAuthStore } from '@/store/auth';
import { SubjectDashboard } from '@/components/analytics';
import { useOwnerHoldings } from '@/hooks/analytics';
import { OWNER_HOLDINGS_EMPTY } from '@/lib/analytics/owner-holdings';

export default function ProviderAnalyticsScreen() {
  // The provider subject is the caller's own account — the member, never one
  // provider's id. From the session rather than a route parameter, so there is no
  // parameter to get wrong or to manipulate; the dataset route is `/me`.
  const userId = useAuthStore((state) => state.user?.userId ?? null);

  // Whether there is anything for this dashboard to be about, asked of the
  // module that owns it. Without it the screen showed a grid of zeros to a
  // member who has never listed one. See `lib/analytics/owner-holdings.ts`.
  const holdings = useOwnerHoldings('provider');

  return (
    <SubjectDashboard
      subject={{ type: 'provider', id: userId }}
      holdings={{ ...holdings, empty: OWNER_HOLDINGS_EMPTY.provider }}
      title="Your business"
      subtitle="How your provider profile is doing"
      funnelKey="provider"
      breakdowns={['source', 'community', 'neighborhood']}
      // Shown only where the certified route did not answer and the development
      // adapter did, which is a preview build with the provider route unreachable.
      gapDetail="Your views, enquiries, saves and profiles published come from Diaspora. Search appearances, leads, the funnel and the breakdowns are not counted yet, so any shown here come from a development adapter. Every figure is a count — this dashboard has no way to show you who viewed, wrote to or saved your profile, and will not gain one."
    />
  );
}
