// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Employer analytics (Frontend Phase 15, §19)
//
// Job performance and the candidate funnel: view → apply → shortlist → interview
// → hire.
//
// ── Counts at every stage, including hire ────────────────────────────────────
//
// §19 warns against exposing candidate PII unnecessarily. The funnel here carries
// **counts only** at every step — there is no field in `AnalyticsFunnelStep` for
// a candidate, and the register's contract explicitly forbids offering a
// candidate list at any stage.
//
// There is also no demographic breakdown of applicants, and the register says why
// in one line: it would be both a privacy failure and, in most jurisdictions, an
// employment-law one. A dashboard that showed "applications by country of origin"
// would be handing an employer the raw material for discrimination, legibly.
//
// Small-number suppression matters more here than almost anywhere: an employer
// with two applicants seeing "1 shortlisted" has learnt something about a named
// individual, because they know who the two are.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SubjectDashboard } from '@/components/analytics';

export default function EmployerAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SubjectDashboard
      subject={{ type: 'employer', id: id ?? null }}
      title="Hiring"
      subtitle="How your jobs are doing"
      funnelKey="job"
      breakdowns={['community', 'country', 'source']}
      gapDetail="Diaspora does not record job views or search appearances yet, so those come from a development adapter. Every figure in the funnel is a count — this dashboard has no way to show you who applied, and will not gain one."
    />
  );
}
