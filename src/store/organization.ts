// ─────────────────────────────────────────────────────────────────────────────
// The organisations Creator Studio's Organizations section lists
//
// ── Why these ids and not the ones that were here ────────────────────────────
//
// This store used to hold four invented organisations — `org-mna`, `org-asn`,
// `org-ldh`, `org-wac` — with names, counts and a `permissions: string[]` that
// existed nowhere else in the app.
//
// Diaspora already has an organisation system. `types/community-advanced.ts`
// declares `OrganizationCapabilities`, which the server answers and the client
// never computes; `hooks/community-life.ts` exposes it as
// `useOrganizationCapabilities` alongside a paged member roster, a role
// assignment mutation, a dashboard and analytics; and three screens under
// `/community-life/dashboard` already use all of it.
//
// The invented ids were the thing keeping the two apart. `capabilitiesFor` in
// the gap handler returns an all-false capability set for an organisation it
// does not know, so a management sheet asking about `org-mna` would be told the
// caller may do nothing — correctly, and uselessly.
//
// These are the canonical three. The role spread is not arbitrary either: it is
// exactly the three tiers `MOCK_CAPABILITIES` grants, so the sheet can be
// exercised as an Owner who may do everything, an Organizer who may run events
// but not touch members or money, and a Member who may do nothing — each
// refused server-side rather than merely undrawn.
//
// `CreatorOrganization` survives as the shape of the *card*: logo, category,
// counts, a role label. Everything behind the card reads the canonical model.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { CreatorOrganization, OrganizationRole } from '@/types/creator';

export const mockOrganizations: CreatorOrganization[] = [
  {
    id: 'org-1',
    name: 'Peckham Fellowship Church',
    logo: 'https://images.unsplash.com/photo-1548625361-155deee2614a?w=120',
    category: 'Churches',
    userRole: 'owner',
    verified: true,
    membersCount: 420,
    followersCount: 2450,
    unreadMessagesCount: 14,
    postsCount: 38,
    eventsCount: 5,
    description:
      'A welcoming diaspora church community based in South London, supporting members with weekly services, networking, and cultural adaptation support.',
    // Kept for the card's own use only. The capability set in force comes from
    // `useOrganizationCapabilities`; nothing is gated on this array.
    permissions: ['all_access', 'manage_members', 'publish_events', 'publish_posts', 'manage_roles', 'financials'],
    location: 'Peckham, London',
  },
  {
    id: 'org-3',
    name: 'East London Nigerian Union',
    logo: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=120',
    category: 'Associations',
    userRole: 'manager',
    verified: true,
    membersCount: 890,
    followersCount: 1890,
    unreadMessagesCount: 6,
    postsCount: 64,
    eventsCount: 12,
    description:
      'Connecting Nigerian families and businesses in East London, celebrating national culture, and organizing welfare programs for new arrivals.',
    permissions: ['publish_events', 'publish_posts', 'manage_volunteers', 'manage_polls'],
    location: 'Stratford, London',
  },
  {
    id: 'org-2',
    name: 'Ghanaian Students & Professionals Association',
    logo: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=120',
    category: 'Student Associations',
    userRole: 'contributor',
    verified: true,
    membersCount: 310,
    followersCount: 1120,
    unreadMessagesCount: 2,
    postsCount: 22,
    eventsCount: 3,
    description:
      'Empowering Ghanaian students and young professionals across London through academic assistance, career mentorship, and networking opportunities.',
    permissions: [],
    location: 'Bloomsbury, London',
  },
];

interface OrganizationState {
  organizations: CreatorOrganization[];
  activeOrganizationId: string | null;
  activeRoleTab: 'all' | 'owner' | 'manager' | 'moderator' | 'contributor';
  selectedOrgDetailModalId: string | null;

  // Actions
  setActiveOrganizationId: (id: string | null) => void;
  setActiveRoleTab: (tab: 'all' | 'owner' | 'manager' | 'moderator' | 'contributor') => void;
  setSelectedOrgDetailModalId: (id: string | null) => void;
  updateOrganizationRole: (orgId: string, newRole: OrganizationRole) => void;
}

export const useOrganizationStore = create<OrganizationState>((set) => ({
  organizations: mockOrganizations,
  activeOrganizationId: 'org-1',
  activeRoleTab: 'all',
  selectedOrgDetailModalId: null,

  setActiveOrganizationId: (activeOrganizationId) => set({ activeOrganizationId }),
  setActiveRoleTab: (activeRoleTab) => set({ activeRoleTab }),
  setSelectedOrgDetailModalId: (selectedOrgDetailModalId) => set({ selectedOrgDetailModalId }),
  updateOrganizationRole: (orgId, newRole) => set((state) => ({
    organizations: state.organizations.map((org) =>
      org.id === orgId ? { ...org, userRole: newRole } : org
    ),
  })),
}));
