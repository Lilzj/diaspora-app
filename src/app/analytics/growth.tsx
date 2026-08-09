// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Growth analytics (Frontend Phase 15, §10)
//
// Net change and growth rate per entity type.
//
// The important behaviour is what this screen does **not** do: it never computes
// growth from two totals. The platform retains one point in time, so subtracting
// last month's cached figure from this month's would be arithmetic on two numbers
// produced by different code paths at different times — and would report growth
// when a cache expired. Where the adapter has no growth figure, the card renders
// "not enough history" rather than a subtraction. That is FRONTEND-PHASE15-GAP-002
// and it is a retention problem before it is an endpoint problem.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { SubjectDashboard } from '@/components/analytics';

export default function GrowthAnalyticsScreen() {
  return (
    <SubjectDashboard
      subject={{ type: 'platform', id: null }}
      title="Growth"
      subtitle="What is growing, and how fast"
      metrics={[
        'growth.members.net',
        'growth.members.rate',
        'growth.content.new',
        'growth.creators.new',
        'growth.providers.new',
        'growth.organizations.new',
        'growth.listings.new',
        'growth.jobs.new',
        'growth.housing.new',
      ]}
      breakdowns={['country', 'community', 'contentType']}
      gapDetail="Growth is a difference between two points in time, and Diaspora currently keeps only one. Until daily snapshots are retained, every figure here comes from a development adapter — and no growth rate on this screen is worked out by subtracting two cached numbers."
    />
  );
}
