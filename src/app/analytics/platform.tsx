// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Platform analytics (Frontend Phase 15, §9 · §71)
//
// Real since 20 Oct 2026: `GET /analytics/platform` answers totals (guides,
// jobs, listings, homes, businesses, members) and what was new in the period,
// with a daily or weekly series, for any signed-in member. Figures the platform
// does not record are listed by the server as unavailable, never invented.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { SubjectDashboard } from '@/components/analytics';

export default function PlatformAnalyticsScreen() {
  return (
    <SubjectDashboard
      subject={{ type: 'platform', id: null }}
      title="Platform"
      subtitle="Everything, across Diaspora"
      breakdowns={['country', 'community', 'contentType']}
    />
  );
}
