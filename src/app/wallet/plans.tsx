// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Legacy plans route (Frontend Phase 6)
//
// Phase 5 put plan comparison at `/wallet/plans`. Phase 6 rebuilt it at
// `/monetization/plans` with the audience surfaces §10 asks for — business,
// organisation, creator, recruiter, landlord and marketplace seller — plus a
// side-by-side comparison table and the plan-change path.
//
// Kept as a redirect rather than deleted: the route is linked from anything
// already installed, and a 404 for somebody on last week's build is a
// regression. Parameters are not forwarded because this route never took any.
// ─────────────────────────────────────────────────────────────────────────────

import { Redirect } from 'expo-router';

export default function LegacyPlansScreen() {
  return <Redirect href="/monetization/plans" />;
}
