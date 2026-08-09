// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Content item analytics (Frontend Phase 15,
// §22 · §23 · §24)
//
// **One route for every content type**, and that is the point.
//
// §22 forbids duplicating creator analytics for guides. §23 forbids a second
// event analytics system. §24 requires event analytics to be able to represent an
// organization or community dimension rather than assuming an individual creator.
// All three are satisfied by the same decision: content performance is one
// dataset with a subject *type*, not six dashboards.
//
// A guide, an event, a community update, a job, a marketplace listing and a
// housing listing all answer the same questions — who saw it, where did they come
// from, what did they do next — and building six screens to ask them would have
// produced six vocabularies and six charts. That is the failure this whole phase
// exists to correct, at the scale it had already reached.
//
// The type segment is validated against the subject union rather than trusted: a
// route with an unknown type renders "nothing to report on here" instead of
// requesting analytics for a subject that does not exist.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { AnalyticsEmptyState, AnalyticsScreen, SubjectDashboard } from '@/components/analytics';
import type { AnalyticsSubjectType } from '@/types/analytics';

/** The content types that have a per-item dashboard. */
const CONTENT_TYPES: AnalyticsSubjectType[] = [
  'guide',
  'event',
  'update',
  'job',
  'listing',
  'housing',
];

const TITLES: Partial<Record<AnalyticsSubjectType, { title: string; subtitle: string }>> = {
  guide: { title: 'Guide', subtitle: 'Who read it, and how they found it' },
  event: { title: 'Event', subtitle: 'Who saw it, and who came' },
  update: { title: 'Update', subtitle: 'Who saw it, and who shared it' },
  job: { title: 'Job', subtitle: 'Who saw it, and who applied' },
  listing: { title: 'Listing', subtitle: 'Who saw it, and who got in touch' },
  housing: { title: 'Housing listing', subtitle: 'Who saw it, and who enquired' },
};

/** The funnel that applies, where one does. §32's five, and no invented sixth. */
const FUNNELS: Partial<Record<AnalyticsSubjectType, string>> = {
  job: 'job',
  listing: 'marketplace',
  housing: 'housing',
};

export default function ContentAnalyticsScreen() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();

  const subjectType = CONTENT_TYPES.find((candidate) => candidate === type);

  // An unknown type is a bad route, not an empty dataset. Requesting analytics
  // for a subject that does not exist would produce a plausible-looking dashboard
  // about nothing.
  if (!subjectType || !id) {
    return (
      <AnalyticsScreen title="Analytics" dataset={null}>
        <AnalyticsEmptyState
          reason="no-data"
          title="Nothing to report on here"
          body="This link points at something Diaspora does not have analytics for."
        />
      </AnalyticsScreen>
    );
  }

  const copy = TITLES[subjectType] ?? { title: 'Content', subtitle: 'How it is doing' };

  return (
    <SubjectDashboard
      subject={{ type: subjectType, id }}
      title={copy.title}
      subtitle={copy.subtitle}
      funnelKey={FUNNELS[subjectType]}
      breakdowns={['source', 'community', 'country']}
      gapDetail="Diaspora records no view, impression or save yet, so these figures come from a development adapter. Where a real count exists — registrations on an event, applications on a job — it is marked as real."
    />
  );
}
