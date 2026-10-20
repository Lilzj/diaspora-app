// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community navigation (Frontend Phase 13, §53)
//
// §53's deep links, as an Expo Router tree:
//
//   /community                         the directory
//   /community/onboarding              §9's flow
//   /community/compare                 §30
//   /community/settings                §40 + §41
//   /community/gaps                    the backend gap register
//   /community/[slug]                  a community profile
//   /community/[slug]/events           §21
//   /community/[slug]/guides           §17
//   /community/[slug]/jobs             §18
//   /community/[slug]/marketplace      §19
//   /community/[slug]/housing          §20
//   /community/[slug]/providers        §22
//   /community/[slug]/organizations    §23
//   /community/[slug]/updates          §24
//   /community/[slug]/statistics       §29
//   /community/[slug]/rules            §36
//   /community/[slug]/moderators       §34
//   /community/[slug]/ambassadors      §35
//   /community/[slug]/initiatives      §35 (and /[initiativeId], /edit)
//   /community/[slug]/moderation       §34's queue
//
// The route parameter is `[slug]` rather than `[id]` deliberately. §53's example
// links are `/community/nigerian`, and a link is something a person shares — an
// opaque `dev-community-nigerian` in a WhatsApp message is not. The repository
// resolves either form (GAP-002 requires the contract to accept both), so the
// route is free to use the readable one.
//
// **Restoring context is the layout's job, not each screen's.** `[slug]/_layout`
// applies the community to the shared context once, so every child screen and
// every query beneath it is already scoped — which is what §53's "deep links must
// restore appropriate community context" means in practice, and what stops eight
// sibling screens each remembering to do it.
// ─────────────────────────────────────────────────────────────────────────────

import { Stack } from 'expo-router';

export default function CommunityLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="compare" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="gaps" />
      <Stack.Screen name="[slug]" />
    </Stack>
  );
}
