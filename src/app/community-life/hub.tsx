// ─────────────────────────────────────────────────────────────────────────────
// `/community-life/hub` — kept as a redirect, not as a screen
//
// This route rendered the Community Life landing page. That screen now lives at
// `/community-life` itself, so there is one page rather than two with the same
// title linking to each other.
//
// ── Why a redirect rather than a deleted file ────────────────────────────────
//
// `/community-life/hub` is a real path that shipped in an APK. A member with it
// in their history, and any notification or gap-preview payload generated with
// it in `actionRoute`, would hit an unmatched route if the file simply went
// away. This sends them to the same content they were expecting.
//
// `Redirect` rather than a `useEffect` + `router.replace`: the effect form
// mounts a screen first, which is the frame of the wrong page this avoids.
// ─────────────────────────────────────────────────────────────────────────────

import { Redirect } from 'expo-router';

export default function CommunityLifeHubRedirect() {
  return <Redirect href="/community-life" />;
}
