// Automation hooks: scopes. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useAuthStore } from '@/store/auth';
import { useCommunityContextStore } from '@/store/community-context';
import { useAutomationScopeStore } from '@/store/automation-scope';
import { useMyOrganizations } from '@/hooks/community-life';
import { type AutomationOwnerKind, type AutomationScope } from '@/types/automation';
import { useAutomationAccess } from './catalog';

/**
 * The member's own scope.
 *
 * The default for every personal automation, and the fallback when a screen
 * does not name one. `ownerId` falls back to `me` rather than to an empty
 * string so a cache key is readable and so a signed-out reader's key cannot
 * collide with a member whose id happens to be blank.
 */
export function usePersonalScope(): AutomationScope {
  const user = useAuthStore((state) => state.user);

  return useMemo(
    () => ({
      ownerKind: 'user' as const,
      ownerId: user?.userId ?? 'me',
      ownerLabel: user?.fullName ?? 'You',
      communityIds: [],
      isCrossCommunity: false,
      countryCodes: [],
      neighbourhoodIds: [],
    }),
    [user?.userId, user?.fullName]
  );
}

/**
 * A scope for any owner kind the member may act as.
 *
 * §45 requires every automation to name its owner, and the domain supports
 * nine. Without this, every screen would have to assume one — and the first
 * version of this phase assumed `user`, which left the community, creator and
 * business templates built and unreachable.
 *
 * A non-personal scope still belongs to *this member acting in a role*, so the
 * owner id is theirs for every kind except `community` and `organization`,
 * which name the space rather than the person. That distinction is what makes
 * `scopeToken` produce different cache entries for "my creator automations" and
 * "Nigeria's automations" while keeping both under this member's key.
 */
export function useScopeFor(ownerKind: AutomationOwnerKind): AutomationScope {
  const user = useAuthStore((state) => state.user);
  const activeCommunityId = useCommunityContextStore((state) => state.activeCommunityId);
  const selected = useCommunityContextStore((state) => state.selectedCommunityIds);

  // The organisations this member helps run, and which of them the automation
  // screens are acting for. See the `organization` branch below.
  const { data: organizations } = useMyOrganizations();
  const chosenOrganizationId = useAutomationScopeStore((state) => state.organizationId);

  return useMemo(() => {
    const personalId = user?.userId ?? 'me';

    if (ownerKind === 'community') {
      const communityId = activeCommunityId ?? selected[0] ?? '';
      return {
        ownerKind,
        ownerId: communityId,
        ownerLabel: communityId || 'A community',
        // Empty when the member has no community selected — which validation
        // then reports, rather than this silently inventing one. §14.
        communityIds: communityId ? [communityId] : [],
        isCrossCommunity: selected.length > 1,
        countryCodes: [],
        neighbourhoodIds: [],
      };
    }

    if (ownerKind === 'organization') {
      // **This used to be the member's own user id.** An organisation automation
      // is owned by the organisation, and the platform reads `ownerId` as one:
      // sent a member id it found no organisation, granted nothing, and refused
      // the write — if a member could ever have reached it, which they could
      // not, because the Center offered no organisation to act for either.
      //
      // The one the member chose, or the first they help run. Empty when they
      // run none, which validation reports rather than this inventing one. §14.
      const organization =
        organizations.find((entry) => entry.organizationId === chosenOrganizationId) ??
        organizations[0];

      return {
        ownerKind,
        ownerId: organization?.organizationId ?? '',
        ownerLabel: organization?.name ?? 'Your organization',
        communityIds: [],
        isCrossCommunity: false,
        countryCodes: [],
        neighbourhoodIds: [],
      };
    }

    return {
      ownerKind,
      ownerId: personalId,
      ownerLabel: user?.fullName ?? 'You',
      communityIds: [],
      isCrossCommunity: false,
      countryCodes: [],
      neighbourhoodIds: [],
    };
  }, [
    ownerKind,
    user?.userId,
    user?.fullName,
    activeCommunityId,
    selected,
    organizations,
    chosenOrganizationId,
  ]);
}

/**
 * A community scope, from the community the member is currently in.
 *
 * §14: an automation must state which communities it acts in, and a member
 * belongs to many. This reads Phase 13's existing context store rather than
 * keeping a second notion of "the current community" — two would eventually
 * disagree, and the one the automation used would be the wrong one.
 */
export function useCommunityScope(communityId?: string | null): AutomationScope | null {
  const activeCommunityId = useCommunityContextStore((state) => state.activeCommunityId);
  const selected = useCommunityContextStore((state) => state.selectedCommunityIds);

  const id = communityId ?? activeCommunityId;

  return useMemo(() => {
    if (!id) return null;

    return {
      ownerKind: 'community' as const,
      ownerId: id,
      ownerLabel: id,
      communityIds: [id],
      // True only when the member has deliberately selected more than one.
      // Deriving it from the selection rather than from a screen's guess is
      // what keeps §14's "every automation must clearly define its scope" true
      // without every screen having to think about it.
      isCrossCommunity: selected.length > 1,
      countryCodes: [],
      neighbourhoodIds: [],
    };
  }, [id, selected.length]);
}

// ═════════════════════════════════════════════════════════════════════════════
// SCOPE SWITCHING — §14 · §45
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The scopes this member can create automations for, as a picker's options.
 *
 * Derived from the capability set alone, so a scope the server did not grant
 * cannot be offered. `allowedOwnerKinds` is the single derivation; this wraps
 * it with the labels a picker needs.
 */
export function useAvailableScopes(): {
  kinds: AutomationOwnerKind[];
  isLoading: boolean;
} {
  const personal = usePersonalScope();
  const { access, isLoading } = useAutomationAccess(personal);

  // **Asked about the community by its own id.** The platform answers
  // `canCreateForCommunity` for the scope it is given, and asked with the
  // personal scope the question it evaluates is "does this member run the
  // community whose id is their own user id" — which is always no. So no member
  // was ever offered a community's automations here, including the founder of
  // one, which is how it was found on the device on 11 Sep 2026. The community
  // scope this chip opens is the member's active community (`useScopeFor`), so
  // that is the one asked about.
  const community = useScopeFor('community');
  const { access: communityAccess } = useAutomationAccess(community, {
    enabled: community.communityIds.length > 0,
  });

  // And the same for an organisation, which had the same defect one layer down:
  // asked with the personal scope, `canCreateForOrganization` evaluates the
  // organisation authority against the member's own user id and is always false.
  const organization = useScopeFor('organization');
  const { access: organizationAccess } = useAutomationAccess(organization, {
    enabled: organization.ownerId.length > 0,
  });

  const kinds = useMemo(() => {
    if (access.provenance !== 'server') return [];

    const result: AutomationOwnerKind[] = [];
    if (access.canCreatePersonal) result.push('user');
    if (access.canCreateForCreator) result.push('creator');
    if (communityAccess.provenance === 'server' && communityAccess.canCreateForCommunity) {
      result.push('community');
    }
    if (
      organizationAccess.provenance === 'server' &&
      organizationAccess.canCreateForOrganization
    ) {
      result.push('organization');
    }
    if (access.canCreateForBusiness) result.push('provider', 'employer', 'landlord', 'seller');
    // `platform` is deliberately never added here, whatever the capability set
    // says. §66: platform-wide automation is not a member surface, and the
    // picker is not the place to introduce one.
    return result;
  }, [access, communityAccess, organizationAccess]);

  return { kinds, isLoading };
}
