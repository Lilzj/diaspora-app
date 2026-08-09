// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Provider analytics (Frontend Phase 15, §17)
//
// Discovery, contacts, leads and reviews, plus the provider funnel:
// impression → profile → contact → lead → conversion.
//
// §17 forbids exposing private customer information, and the shape of the data
// model is what enforces it: a lead **count** is safe, a lead **list** is a list
// of people who contacted a business and is not analytics. There is no contract
// in the register that returns one, and no field in `AnalyticsFunnelStep` that
// could carry one.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SubjectDashboard } from '@/components/analytics';

export default function ProviderAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SubjectDashboard
      subject={{ type: 'provider', id: id ?? null }}
      title="Your listing"
      subtitle="How people find and contact you"
      funnelKey="provider"
      breakdowns={['source', 'community', 'neighborhood']}
      gapDetail="Diaspora does not record profile views, search impressions or contact taps yet, so these figures come from a development adapter. Your reviews and rating are real."
    />
  );
}
