// ─────────────────────────────────────────────────────────────────────────────
// Who moderates a community, from the members the platform actually serves
// — 12 Sep 2026
//
// The Moderators and Ambassadors screens read `useCommunityRoleHolders`, whose
// query is `enabled: … && areMultiCommunityGapsEnabled()` — false in every
// release build. So the data never arrived, and the screen's `isEmpty` (which is
// `!isLoading && !isError && length === 0`, all three true for a query that
// never ran) rendered:
//
//     Nothing here yet
//     There is no moderators to show for the communities you have chosen.
//     Try widening your community filter or looking in a wider area.
//
// A community with four moderators, told it had none, and the member blamed for
// their own filter.
//
// **There is a real route.** `GET /communities/{idOrSlug}/members` is served and
// every member row carries its `roles`. A role can only be held with a visible
// membership, so filtering the member list by role gives the true holders —
// there is no separate place a moderator could be hiding.
//
// ── What this deliberately does not invent ──────────────────────────────────
//
// The simulated adapter supplied `bio`, `languages` and `areaLabel`. The members
// route carries none of them, and they are left absent rather than filled with
// anything. `CommunityRoleHolder` types them optional precisely so a real one
// can be built without them.
//
// `since` is the member's `joinedAt`, which is when they joined — **not** when
// they were given the role. Those differ, and the field is documented as "since
// when, where published", so the honest reading is the one the platform can
// actually support. Where `joinedAt` is absent it stays absent.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CommunityMember,
  CommunityRole,
  CommunityRoleHolder,
} from '@/types/community-directory';

/**
 * The members holding `role`, as role holders.
 *
 * Ordered by name so the list is stable between renders — the members route
 * pages by its own cursor and does not promise an order that means anything
 * here.
 */
export function roleHoldersFromMembers(
  members: readonly CommunityMember[],
  role: CommunityRole
): CommunityRoleHolder[] {
  return members
    .filter((member) => member.roles.includes(role))
    .map((member) => ({
      userId: member.userId,
      // Never the id. A GUID where a name belongs is what the organisation
      // members screen still shows, and it is worse than a generic word.
      displayName: member.displayName ?? 'A member',
      role,
      since: member.joinedAt ?? null,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}
