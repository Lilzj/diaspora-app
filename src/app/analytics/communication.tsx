// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Communication analytics (Frontend Phase 15, §28 · §29)
//
// Notifications and messaging, and the smallest dashboard in the phase by
// deliberate design.
//
// §29 is the strictest constraint in the brief and is treated as a hard boundary
// rather than a guideline: **message contents, private conversations and
// participant information never appear.** The enforcement is structural — there
// is no type in the Phase 15 model with a field for any of them, so no contract
// change on the backend could surface one without a corresponding frontend change
// that would be visible in review.
//
// What is here is four aggregate counts and two rates. That is what §29 permits,
// and the shortness of the list is the point rather than an omission.
//
// The notification categories come from B13's real `/notifications/categories` —
// §28 forbids creating another notification service and this screen creates none,
// it reads the existing vocabulary as its breakdown dimension.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { SubjectDashboard } from '@/components/analytics';

export default function CommunicationAnalyticsScreen() {
  return (
    <SubjectDashboard
      subject={{ type: 'platform', id: null }}
      title="Communication"
      subtitle="Notifications and messages"
      metrics={[
        'notification.delivered',
        'notification.opened',
        'notification.readRate',
        'notification.actionRate',
        'notification.dismissed',
        'messaging.conversationsStarted',
        'messaging.messagesSent',
        'messaging.responseRate',
      ]}
      breakdowns={['category', 'community']}
      gapDetail="Diaspora records no delivery receipt, open or dismissal, so the notification figures come from a development adapter. The messaging figures are aggregate counts only and always will be — no report in this application can show a message, a conversation or who was in one."
    />
  );
}
