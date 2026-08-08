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
  {
    id: 'org-mna',
    name: 'Mauritius Nigerians Association',
    type: 'organization',
    avatar: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=250&q=80',
    handle: '@mauritius_nigerians',
    verified: true,
    followerCount: 2450,
    badgeText: 'Verified Association',
  },
  {
    id: 'org-asn',
    name: 'African Students Network',
    type: 'community',
    avatar: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=250&q=80',
    handle: '@african_students_uk',
    verified: true,
    followerCount: 1890,
    badgeText: 'Student Hub',
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
