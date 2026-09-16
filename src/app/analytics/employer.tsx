// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Employer analytics (Frontend Phase 15, §19)
//
// **Real since 13 Sep 2026.** This screen reads `GET /analytics/employers/me`, a
// certified `AnalyticsDataset` of the employer's own jobs summed together:
// views, unique viewers, applications, application rate and jobs published,
// with a views series and a top-jobs board.
//
// Before that it was `/analytics/employer/[id]`, over the development adapter in
// every build, and **nothing in the app linked to it** — no hub row, no link
// from the hiring workspace. Its id came from the route rather than the session,
// which is also how it would have been reached with the employer *profile* id and
// refused: `/analytics/access` answers for the member. It now takes the caller
// from the session, as Selling and Letting do, and the hub and the hiring
// workspace both open it.
//
// ── Where each figure comes from ─────────────────────────────────────────────
//
//   views              the job screen's `content.viewed`
//   unique viewers     the same events, counted across this employer's jobs only
//   applications       `ApplicationSubmitted`, as analytics records it
//   application rate   applications ÷ views on the server; absent, not 0%, for
//                      a job nobody opened
//   jobs published     `JobPublished`
//
// ── Counts only, and no stage after the application ──────────────────────────
//
// §19 warns against exposing candidate PII unnecessarily. The served dataset has
// no candidate funnel at all: shortlists, interviews, offers and hires are not
// counted, because at those stages a small number names a person — an employer
// with two applicants seeing "1 shortlisted" knows who. An application count
// tells an employer nothing their own applicant list does not.
//
// There is also no demographic breakdown of applicants, and the register says why
// in one line: it would be both a privacy failure and, in most jurisdictions, an
// employment-law one. The `country` breakdown below is where a job is advertised,
// never where an applicant is from — and in a release build no breakdown is
// served at all, so the section is absent.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useAuthStore } from '@/store/auth';
import { SubjectDashboard } from '@/components/analytics';
import { useOwnerHoldings } from '@/hooks/analytics';
import { OWNER_HOLDINGS_EMPTY } from '@/lib/analytics/owner-holdings';

export default function EmployerAnalyticsScreen() {
  // The employer subject is the caller's own account — the member, never the
  // employer profile. From the session rather than a route parameter, so there is
  // no parameter to get wrong or to manipulate; the dataset route is `/me`.
  const userId = useAuthStore((state) => state.user?.userId ?? null);

  // Whether there is anything for this dashboard to be about, asked of the
  // module that owns it. Without it the screen showed a grid of zeros to a
  // member who has never listed one. See `lib/analytics/owner-holdings.ts`.
  const holdings = useOwnerHoldings('employer');

  return (
    <SubjectDashboard
      subject={{ type: 'employer', id: userId }}
      holdings={{ ...holdings, empty: OWNER_HOLDINGS_EMPTY.employer }}
      title="Hiring"
      subtitle="How your jobs are doing"
      funnelKey="job"
      breakdowns={['community', 'country', 'source']}
      // Shown only where the certified route did not answer and the development
      // adapter did, which is a preview build with the employer route unreachable.
      gapDetail="Your views, applications and application rate come from Diaspora. Search appearances, the funnel and the breakdowns are not recorded yet, so any shown here come from a development adapter. Every figure is a count — this dashboard has no way to show you who applied, and will not gain one."
    />
  );
}
