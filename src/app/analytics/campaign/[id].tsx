// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Fundraising campaign analytics (Frontend Phase 15)
//
// A campaign's giving over a period, for the people who run it:
// `GET /analytics/campaigns/{campaignId}` (served since 20 Oct 2026), read in
// every build through the owner arm of `useAnalyticsDataset`.
//
// Raised, gifts, supporters and refunds against the previous period of equal
// length; raised to date; progress toward the target where the campaign set one
// (otherwise "Toward the target" is listed as not counted, never drawn at zero);
// and a daily series of what was raised and how many gifts. Amounts carry the
// campaign's own currency and are never converted.
//
// Visits to the campaign page and shares are not recorded and the server lists
// them as unavailable. Anybody who may not run the campaign gets the same 404
// as for a campaign that does not exist, and `/analytics/access` answers "no"
// before that is asked.
//
// Not to be confused with `/analytics/monetization`, which is a member's paid
// promotions — the advertising module's figures, not a fundraising campaign.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SubjectDashboard } from '@/components/analytics';

export default function CampaignAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SubjectDashboard
      subject={{ type: 'campaign', id: id ?? null }}
      title="Campaign giving"
      subtitle="What this campaign raised, and from how many people"
      gapDetail="Raised, gifts, supporters and refunds are counted from the campaign's completed donations. Visits to the campaign page and shares are not recorded."
    />
  );
}
