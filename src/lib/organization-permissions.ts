// ─────────────────────────────────────────────────────────────────────────────
// Organisation roles and permissions — the presentation layer over the
// capability set the server already answers
//
// ── Why this file is small, and must stay small ──────────────────────────────
//
// `OrganizationCapabilities` is fetched, never computed. The comment on its
// declaration in `types/community-advanced.ts` is explicit about it: the
// frontend makes no authoritative authorisation decision, and every gated route
// refuses independently, so a hidden button is a convenience rather than a
// control.
//
// Nothing here decides anything. It turns the ten booleans the server sends
// into something a member can read — a role name, a list of what that role may
// do — and answers two questions the UI has to ask before it draws a
// destructive control. The moment this file starts *deriving* a capability from
// a role it has become a second, client-side permission system that can
// disagree with the server, which is the failure mode the fetched-not-computed
// rule exists to prevent.
//
// ── The two role vocabularies ────────────────────────────────────────────────
//
// Diaspora has two. `types/community-advanced.ts` has the canonical six —
// Owner, Administrator, Organizer, Treasurer, Moderator, Member — used by the
// gap API, the org dashboard and the membership screens. `types/creator.ts` has
// a second, lowercase four — owner, manager, moderator, contributor — used only
// by Creator Studio's organisation card.
//
// The second one is not a model, it is a label. `describeCreatorRole` below
// exists so the card can keep rendering its badge while everything behind the
// card reads the canonical set, and it is the only place the two meet.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  OrganizationCapabilities,
  OrganizationRole,
} from '@/types/community-advanced';
import type { OrganizationRole as CreatorOrganizationRole } from '@/types/creator';

// ─────────────────────────────────────────────────────────────────────────────
// The capability vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** Every capability flag on `OrganizationCapabilities`, with a readable name. */
export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  canManageMembers: 'Manage members',
  canApproveMembers: 'Approve applications',
  canManageTiers: 'Manage membership tiers',
  canManageEvents: 'Manage events',
  canManageCampaigns: 'Manage fundraising',
  canManageVolunteers: 'Manage volunteering',
  canManagePolls: 'Manage polls',
  canPublishAnnouncements: 'Publish posts',
  canViewAnalytics: 'View analytics',
  canViewFinancials: 'View financials',
};

export type CapabilityKey =
  | 'canManageMembers'
  | 'canApproveMembers'
  | 'canManageTiers'
  | 'canManageEvents'
  | 'canManageCampaigns'
  | 'canManageVolunteers'
  | 'canManagePolls'
  | 'canPublishAnnouncements'
  | 'canViewAnalytics'
  | 'canViewFinancials';

/**
 * The flags, in the order a member should read them.
 *
 * Members first because that is what the Members tab is about, financials last
 * because it is the one a Treasurer has and nobody else does.
 */
export const CAPABILITY_ORDER: CapabilityKey[] = [
  'canManageMembers',
  'canApproveMembers',
  'canManageTiers',
  'canPublishAnnouncements',
  'canManageEvents',
  'canManageCampaigns',
  'canManageVolunteers',
  'canManagePolls',
  'canViewAnalytics',
  'canViewFinancials',
];

/** The capabilities this caller holds, and the ones they do not, in reading order. */
export function splitCapabilities(capabilities: OrganizationCapabilities): {
  granted: CapabilityKey[];
  withheld: CapabilityKey[];
} {
  const granted: CapabilityKey[] = [];
  const withheld: CapabilityKey[] = [];

  for (const key of CAPABILITY_ORDER) {
    (capabilities[key] ? granted : withheld).push(key);
  }

  return { granted, withheld };
}

/** True when the caller holds no management capability at all. */
export function isReadOnly(capabilities: OrganizationCapabilities): boolean {
  return CAPABILITY_ORDER.every((key) => !capabilities[key]);
}

// ─────────────────────────────────────────────────────────────────────────────
// The role catalogue
// ─────────────────────────────────────────────────────────────────────────────

export interface RoleDescriptor {
  role: OrganizationRole;
  icon: string;
  description: string;
  /**
   * What this role conventionally carries.
   *
   * **Not authoritative, and labelled as such wherever it is shown.** The
   * server grants capabilities per member, not per role name, and an
   * organisation may have narrowed a role. This is the description of the role,
   * which is what somebody choosing a role for a member needs to read; the
   * capabilities actually in force for a given caller come from
   * `useOrganizationCapabilities`.
   */
  conventional: CapabilityKey[];
}

const ALL: CapabilityKey[] = CAPABILITY_ORDER;

export const ROLE_CATALOGUE: RoleDescriptor[] = [
  {
    role: 'Owner',
    icon: '👑',
    description: 'Full control, including ownership transfer and closing the organisation.',
    conventional: ALL,
  },
  {
    role: 'Administrator',
    icon: '⚙️',
    description: 'Everything an Owner can do, apart from transferring ownership.',
    conventional: ALL,
  },
  {
    role: 'Organizer',
    icon: '📅',
    description: 'Runs events, volunteering and polls, and posts on behalf of the organisation.',
    conventional: [
      'canManageEvents',
      'canManageVolunteers',
      'canManagePolls',
      'canPublishAnnouncements',
      'canViewAnalytics',
    ],
  },
  {
    role: 'Treasurer',
    icon: '💷',
    description: 'Runs fundraising and is the only role that sees the money.',
    conventional: [
      'canManageCampaigns',
      'canViewFinancials',
      'canViewAnalytics',
      'canManageTiers',
    ],
  },
  {
    role: 'Moderator',
    icon: '🛡️',
    description: 'Reviews membership applications and moderates what the organisation publishes.',
    conventional: ['canApproveMembers', 'canPublishAnnouncements'],
  },
  {
    role: 'Member',
    icon: '👤',
    description: 'Belongs to the organisation. No management rights.',
    conventional: [],
  },
];

export function describeRole(role: OrganizationRole | null | undefined): RoleDescriptor {
  return ROLE_CATALOGUE.find((entry) => entry.role === role) ?? ROLE_CATALOGUE[ROLE_CATALOGUE.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Owner protection — §23
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether this member's role may be changed, and why not when it may not.
 *
 * The last Owner is the case that matters: demoting them leaves an organisation
 * nobody can administer, and nothing downstream would refuse it because from
 * the server's point of view it is a legitimate role assignment by somebody who
 * holds `canManageMembers`.
 *
 * `ownerCount` is the number of Owners **currently loaded**. On a paged roster
 * that can undercount, which is why this refuses on `<= 1` rather than `=== 1`
 * — a page that shows one Owner and might be hiding another is not a page to
 * demote from. The Members tab loads with `role` unfiltered for exactly this
 * reason.
 */
export function canChangeRole(
  member: { userId: string; role: OrganizationRole },
  options: { capabilities: OrganizationCapabilities; ownerCount: number; selfUserId?: string },
): { allowed: true } | { allowed: false; reason: string } {
  if (!options.capabilities.canManageMembers) {
    return { allowed: false, reason: 'Your role does not include managing members.' };
  }

  if (member.role === 'Owner' && options.ownerCount <= 1) {
    return {
      allowed: false,
      reason:
        'This is the only owner. Add a second owner before changing this one, so the organisation is never left without one.',
    };
  }

  if (options.selfUserId && member.userId === options.selfUserId && member.role === 'Owner') {
    return {
      allowed: false,
      reason: 'You cannot change your own owner role here. Transfer ownership instead.',
    };
  }

  return { allowed: true };
}

/** Whether this member may be removed from the organisation. */
export function canRemoveMember(
  member: { userId: string; role: OrganizationRole },
  options: { capabilities: OrganizationCapabilities; ownerCount: number; selfUserId?: string },
): { allowed: true } | { allowed: false; reason: string } {
  if (!options.capabilities.canManageMembers) {
    return { allowed: false, reason: 'Your role does not include managing members.' };
  }

  if (member.role === 'Owner') {
    return {
      allowed: false,
      reason: 'Owners cannot be removed. Change their role first, or transfer ownership.',
    };
  }

  if (options.selfUserId && member.userId === options.selfUserId) {
    return { allowed: false, reason: 'To leave an organisation, use your membership rather than this list.' };
  }

  return { allowed: true };
}

/** The roles this caller may assign, given what they hold themselves. */
export function assignableRoles(capabilities: OrganizationCapabilities): OrganizationRole[] {
  if (!capabilities.canManageMembers) return [];

  // Only an Owner may make another Owner. Everyone else who can manage members
  // can assign the roles below their own ceiling.
  return capabilities.role === 'Owner'
    ? ROLE_CATALOGUE.map((entry) => entry.role)
    : ROLE_CATALOGUE.filter((entry) => entry.role !== 'Owner').map((entry) => entry.role);
}

// ─────────────────────────────────────────────────────────────────────────────
// The Creator Studio role label
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The badge on Creator Studio's organisation card.
 *
 * `CreatorOrganization.userRole` is a display label, not a permission. It is
 * rendered on the card and used for the role filter chips, and nothing is
 * gated on it — the sheet behind the card reads
 * `useOrganizationCapabilities`.
 */
export function describeCreatorRole(role: CreatorOrganizationRole): {
  label: string;
  icon: string;
  canonical: OrganizationRole;
} {
  switch (role) {
    case 'owner':
      return { label: 'Owner', icon: '👑', canonical: 'Owner' };
    case 'manager':
      return { label: 'Manager', icon: '⚙️', canonical: 'Administrator' };
    case 'moderator':
      return { label: 'Moderator', icon: '🛡️', canonical: 'Moderator' };
    case 'contributor':
      return { label: 'Contributor', icon: '✍️', canonical: 'Member' };
  }
}
