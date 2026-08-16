// ─────────────────────────────────────────────────────────────────────────────
// `/creator/content` — the third surface for published work, now a redirect
//
// ── What was here ────────────────────────────────────────────────────────────
//
// A screen titled "Your content — what you have published, and how it is
// doing": a filtered list of published items ordered by performance, and then a
// section headed "Managing your content — drafts, archive, status changes and
// bulk actions all live in Creator Studio", whose three rows all pushed to
// `/profile/creator-dashboard`.
//
// So it showed you your content and then told you to go somewhere else to do
// anything with it. That was defensible while Studio was a different screen.
// Now that Workspace is a section of `/creator`, the handoff is a scroll, and
// keeping this would mean two lists of the same content reading different
// sources — which is how the app came to answer "how complete is my profile?"
// two different ways.
//
// ── Why it redirects rather than being deleted ───────────────────────────────
//
// The route shipped and is linked from the creator mocks' recommendation
// `actionRoute`s. An unmatched route is worse than a redirect.
//
// It lands on `/creator`, which opens on whichever section the member last
// used. Forcing Workspace here would override a member who deliberately left
// the screen on Overview; the Quick actions tile labelled "My content" is the
// affordance that selects Workspace, and it is one tap from where this lands.
// ─────────────────────────────────────────────────────────────────────────────

import { Redirect } from 'expo-router';

export default function CreatorContentRedirect() {
  return <Redirect href="/creator" />;
}
