// ─────────────────────────────────────────────────────────────────────────────
// `/profile/creator-dashboard` — the old Creator Studio, now a redirect
//
// Its four sections live on `/creator`, which is titled Creator Studio and has
// the shell this screen never had: the gap notice, the access refusal, the
// error state, the retry and the pull-to-refresh.
//
// The file stays because the route shipped. It is in `monetization/promote`'s
// route map, it was the destination of `/creator`'s "Elsewhere" row, it is a
// recommendation `actionRoute` in the creator mocks, and it can be in a
// member's history. Deleting it would turn all of those into an unmatched
// route — which is exactly the defect this pass found at `/settings`, where a
// notification deep-linked to a screen that did not exist.
//
// `Redirect` rather than a `useEffect` with `router.replace`: it runs during
// render, so there is no frame in which an empty screen is visible, and it
// leaves nothing on the back stack to return to.
// ─────────────────────────────────────────────────────────────────────────────

import { Redirect } from 'expo-router';

export default function CreatorDashboardRedirect() {
  return <Redirect href="/creator" />;
}
