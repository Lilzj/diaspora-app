// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Engagement analytics (Frontend Phase 15, §34)
//
// DAU, WAU, MAU, sessions and stickiness.
//
// §34's instruction — "do not define 'active user' differently in different
// screens" — is honoured structurally rather than by convention: the three
// activity windows are three entries in one catalogue, they share one definition
// of an active session, and tapping any of them shows that definition. No screen
// in this application carries a definition of its own.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { SubjectDashboard } from '@/components/analytics';

export default function EngagementAnalyticsScreen() {
  return (
    <SubjectDashboard
      subject={{ type: 'platform', id: null }}
      title="Engagement"
      subtitle="Who is actually using Diaspora"
      metrics={[
        'audience.users.active.daily',
        'audience.users.active.weekly',
        'audience.users.active.monthly',
        'audience.stickiness.dau_mau',
        'audience.sessions.count',
        'audience.sessions.duration.median',
        'audience.users.returning',
      ]}
      breakdowns={['country', 'community']}
      gapDetail="Diaspora records no session and no activity event, so there is nothing behind these figures yet. The definitions are the ones a real implementation would have to honour — tap any figure to read them."
    />
  );
}
