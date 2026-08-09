// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics stack (Frontend Phase 15)
//
// Every analytics surface lives under `/analytics`, including the ones that
// describe a subject reached from elsewhere in the app — a job's analytics is
// `/analytics/content/job/[id]`, not `/job/[id]/analytics`.
//
// That is a deliberate choice and it is §2's, applied to routing. Analytics
// scattered across twelve feature folders is how a platform ends up with twelve
// analytics implementations, and this phase exists because that had already
// begun. One route tree means one place to look, one layout, and one obvious
// answer to "where does a new dashboard go".
//
// The existing analytics screens stay where they are — `/creator/analytics`,
// `/monetization/analytics`, `/community-life/dashboard/analytics`,
// `/community/[slug]/statistics`. They work, they are linked from their own
// features, and moving them would break deep links to gain tidiness. They now
// link *into* this tree for the dimensions they lack.
// ─────────────────────────────────────────────────────────────────────────────

import { Stack } from 'expo-router';

export default function AnalyticsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
