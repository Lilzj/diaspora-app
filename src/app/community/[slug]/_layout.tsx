// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community context restoration (Frontend Phase 13, §53, §54)
//
// §53: "Deep links must restore appropriate community context." This layout is
// where that happens, once, for every screen beneath it.
//
// ── Why the layout and not each screen ───────────────────────────────────────
//
// There are fourteen screens under `[slug]`. If each applied the context itself,
// the guarantee would be fourteen separate remembered steps — and the one that
// forgot would render Nigerian events under a Ghanaian URL, which is precisely the
// stale-data leak §42 calls a critical correctness requirement.
//
// Because the layout applies it, a child screen cannot be reached without the
// context already being right. `useScopedContent` inside any of them resolves
// against a scope this component set, and the query key it derives already carries
// that scope's token.
//
// ── Why it does not clobber the member's own selection on the way out ────────
//
// Opening `/community/ghanaian/events` from a notification sets the active
// community to Ghanaian, and that is correct — the member followed a link about
// Ghanaian events. It stays set afterwards, deliberately: §54 says do not lose the
// community selection when navigating between screens, and restoring the previous
// one on unmount would mean tapping through from Ghanaian events to a Ghanaian
// listing lost the context halfway.
//
// The `<CommunitySelectorSheet>` is always one tap away, and the header states
// which community is active, so the change is visible rather than silent.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCommunity } from '@/hooks/communities';
import { useCommunityContextStore } from '@/store/community-context';

export default function CommunityDetailLayout() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const community = useCommunity(slug);
  const applySelection = useCommunityContextStore((s) => s.applySelection);
  const activeCommunityId = useCommunityContextStore((s) => s.activeCommunityId);

  useEffect(() => {
    // The slug resolves to an id only once the community has loaded — GAP-002
    // requires the contract to accept either form, and until it answers there is
    // no id to scope to. Children render their loading state meanwhile rather
    // than briefly resolving against the *previous* community, which would fetch
    // the wrong scope and cache it under the wrong key.
    if (!community.data) return;
    if (activeCommunityId === community.data.id) return;

    applySelection({
      mode: 'SELECTED_COMMUNITY',
      communityIds: [community.data.id],
    });
  }, [activeCommunityId, applySelection, community.data]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="statistics" />
      <Stack.Screen name="rules" />
      <Stack.Screen name="moderators" />
      <Stack.Screen name="ambassadors" />
      <Stack.Screen name="initiatives/index" />
      <Stack.Screen name="initiatives/[initiativeId]" />
      <Stack.Screen name="initiatives/edit" />
      <Stack.Screen name="moderation" />
      <Stack.Screen name="guides" />
      <Stack.Screen name="jobs" />
      <Stack.Screen name="marketplace" />
      <Stack.Screen name="housing" />
      <Stack.Screen name="events" />
      <Stack.Screen name="providers" />
      <Stack.Screen name="organizations" />
      <Stack.Screen name="updates" />
      <Stack.Screen name="close" />
      <Stack.Screen name="ownership" />
    </Stack>
  );
}
