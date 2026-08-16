import { create } from 'zustand';
import { PublishingIdentity } from '@/types/creator';

export const mockIdentities: PublishingIdentity[] = [
  {
    id: 'user-me',
    name: 'Joshua',
    type: 'personal',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
    handle: '@joshua_uk',
    verified: true,
    followerCount: 980,
    badgeText: 'Verified Contributor',
  },
  // The two organisation identities are the canonical organisations the member
  // holds a role in — the same ids `store/organization.ts` lists and
  // `useOrganizationCapabilities` answers for. They were `org-mna` and
  // `org-asn`, which existed in no other part of the app, so "publishing as"
  // named an organisation that appeared nowhere else.
  //
  // `mocks/creator-data.ts` attributes content to these by array index, not by
  // id, so content attribution follows the rename without further change.
  {
    id: 'org-1',
    name: 'Peckham Fellowship Church',
    type: 'organization',
    avatar: 'https://images.unsplash.com/photo-1548625361-155deee2614a?w=120',
    handle: '@peckham_fellowship',
    verified: true,
    followerCount: 2450,
    badgeText: 'Verified Organisation',
  },
  {
    id: 'org-3',
    name: 'East London Nigerian Union',
    type: 'community',
    avatar: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=120',
    handle: '@eln_union',
    verified: true,
    followerCount: 1890,
    badgeText: 'Community Union',
  },
  {
    id: 'biz-mama-africa',
    name: 'Mama Africa Foods & Spices',
    type: 'business',
    avatar: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=250&q=80',
    handle: '@mama_africa_store',
    verified: true,
    followerCount: 760,
    badgeText: 'Verified Business',
  },
];

interface PublishingIdentityState {
  activeIdentity: PublishingIdentity;
  identities: PublishingIdentity[];
  isSelectorOpen: boolean;

  // Actions
  setActiveIdentity: (identity: PublishingIdentity) => void;
  switchIdentityById: (identityId: string) => void;
  setIsSelectorOpen: (isOpen: boolean) => void;
}

export const usePublishingIdentityStore = create<PublishingIdentityState>((set) => ({
  activeIdentity: mockIdentities[0],
  identities: mockIdentities,
  isSelectorOpen: false,

  setActiveIdentity: (activeIdentity) => set({ activeIdentity }),
  switchIdentityById: (identityId) => set((state) => {
    const found = state.identities.find((i) => i.id === identityId);
    return found ? { activeIdentity: found } : state;
  }),
  setIsSelectorOpen: (isSelectorOpen) => set({ isSelectorOpen }),
}));
