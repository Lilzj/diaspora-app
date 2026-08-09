// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Platform analytics (Frontend Phase 15, §9 · §71)
//
// The administrative overview. Hybrid, and marked at field level: the inventory
// counts are **real** — they come from the certified `/jobs`, `/housing`,
// `/marketplace`, `/listings` and `/community-life/*` routes, which return a
// genuine `totalCount` for a filter — and the audience and engagement figures
// come from the development provider. The dataset's status is `PARTIAL` for
// exactly that reason, and each card carries its own provenance.
//
// Access is the server's decision (GAP-025). A caller without
// `canViewAdministrative` never reaches this screen from the hub, and reaching it
// by typing the route renders a refusal rather than a dashboard — the request is
// not made until the capability resolves true.
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
      gapDetail="The counts of what exists — guides, jobs, listings, housing, providers, organizations and events — are real figures from Diaspora's own routes. The member, activity and engagement figures are not: nothing records a session or a view yet, so those come from a development adapter."
    />
  );
}
