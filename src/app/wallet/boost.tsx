// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Legacy promote route (Frontend Phase 6)
//
// Phase 5 put the promotion flow at `/wallet/boost`. Phase 6 rebuilt it as the
// multi-step flow at `/monetization/promote`, which does everything this screen
// did and adds duration selection, the preview, renewal and scheduling around an
// existing placement.
//
// This route is kept and redirects rather than being deleted, because it is not
// only reachable from code this repository controls: the creator workspace links
// to it, and anything already installed carries the old path. §37-16 requires
// that existing functionality does not regress, and a route that 404s for
// somebody on last week's build is a regression.
//
// The parameters pass through unchanged — `/monetization/promote` accepts the
// same `subjectType`, `subjectId` and `title`, and resolves both the wire
// vocabulary (`MarketplaceListing`) and the frontend one (`marketplace`).
// ─────────────────────────────────────────────────────────────────────────────

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function LegacyBoostScreen() {
  const params = useLocalSearchParams<{
    subjectType?: string;
    subjectId?: string;
    title?: string;
  }>();

  return (
    <Redirect
      href={{
        pathname: '/monetization/promote',
        params: {
          ...(params.subjectType ? { subjectType: params.subjectType } : {}),
          ...(params.subjectId ? { subjectId: params.subjectId } : {}),
          ...(params.title ? { title: params.title } : {}),
        },
      }}
    />
  );
}
