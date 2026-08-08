import { create } from 'zustand';
import { CreatorOrganization, OrganizationRole } from '@/types/creator';

export const mockOrganizations: CreatorOrganization[] = [
  {
    id: 'org-mna',
    name: 'Mauritius Nigerians Association',
    logo: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=250&q=80',
    category: 'Cultural & Diaspora Support',
    userRole: 'owner',
    verified: true,
    membersCount: 420,
    followersCount: 2450,
    unreadMessagesCount: 14,
    postsCount: 38,
    eventsCount: 5,
    description: 'Empowering Nigerian expatriates and newcomers in Mauritius with housing assistance, cultural events, and legal registration guides.',
    permissions: ['all_access', 'manage_members', 'publish_events', 'publish_posts', 'manage_roles', 'financials'],
    website: 'https://nigeriansmauritius.org',
    location: 'Port Louis & Ebene, Mauritius',
  },
  {
    id: 'org-asn',
    name: 'African Students Network',
    logo: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=250&q=80',
    category: 'Education & Student Support',
    userRole: 'manager',
    verified: true,
    membersCount: 890,
    followersCount: 1890,
    unreadMessagesCount: 6,
    postsCount: 64,
    eventsCount: 12,
    description: 'Pan-African student association providing visa guidance, university relocation assistance, and career mentorship across UK and European campuses.',
    permissions: ['manage_members', 'publish_events', 'publish_posts', 'moderate_comments'],
    website: 'https://africanstudentsnet.org',
    location: 'London, UK & International',
  },
  {
    id: 'org-ldh',
    name: 'London Diaspora Tech Hub',
    logo: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=250&q=80',
    category: 'Technology & Networking',
    userRole: 'moderator',
    verified: true,
    membersCount: 310,
    followersCount: 1120,
    unreadMessagesCount: 2,
    postsCount: 22,
    eventsCount: 3,
    description: 'Community for immigrant software engineers, product managers, and tech founders building global products.',
    permissions: ['publish_posts', 'moderate_comments', 'review_applicants'],
    website: 'https://diasporatech.io',
    location: 'Tech City, London',
  },
  {
    id: 'org-wac',
    name: 'West African Culinary Collective',
    logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=250&q=80',
    category: 'Food & Hospitality',
    userRole: 'contributor',
    verified: false,
    membersCount: 145,
    followersCount: 640,
    unreadMessagesCount: 0,
    postsCount: 15,
    eventsCount: 2,
    description: 'Foodies, chefs, and grocery suppliers preserving authentic West African flavours abroad.',
    permissions: ['publish_posts', 'submit_drafts'],
    location: 'Peckham, London',
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
  activeOrganizationId: 'org-mna',
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
