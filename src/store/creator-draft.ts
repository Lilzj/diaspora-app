import { create } from 'zustand';
import { CreatorDraft, ContentType } from '@/types/creator';
import { mockCreatorDrafts } from '@/mocks/creator-data';

interface CreatorDraftState {
  drafts: CreatorDraft[];
  isLoading: boolean;

  // Actions
  loadDrafts: () => void;
  renameDraft: (id: string, newTitle: string) => void;
  duplicateDraft: (id: string) => void;
  deleteDraft: (id: string) => void;
  saveDraft: (id: string, title: string, excerpt: string) => void;
  createDraft: (title: string, draftType: ContentType) => CreatorDraft;
}

export const useCreatorDraftStore = create<CreatorDraftState>((set, get) => ({
  drafts: mockCreatorDrafts,
  isLoading: false,

  loadDrafts: () => {
    set({ isLoading: true });
    setTimeout(() => {
      set({ drafts: mockCreatorDrafts, isLoading: false });
    }, 150);
  },

  renameDraft: (id, newTitle) => set((state) => ({
    drafts: state.drafts.map((d) => (d.id === id ? { ...d, title: newTitle, lastEdited: 'Renamed just now' } : d)),
  })),

  duplicateDraft: (id) => set((state) => {
    const target = state.drafts.find((d) => d.id === id);
    if (!target) return state;

    const cloned: CreatorDraft = {
      ...target,
      id: `dr-clone-${Date.now()}`,
      title: `${target.title} (Copy)`,
      lastEdited: 'Just duplicated',
      autoSaveStatus: 'saved',
    };
    return { drafts: [...state.drafts, cloned] };
  }),

  deleteDraft: (id) => set((state) => ({
    drafts: state.drafts.filter((d) => d.id !== id),
  })),

  saveDraft: (id, title, excerpt) => set((state) => ({
    drafts: state.drafts.map((d) => (d.id === id ? { ...d, title, excerpt, lastEdited: 'Just saved', autoSaveStatus: 'saved' } : d)),
  })),

  createDraft: (title, draftType) => {
    const newDraft: CreatorDraft = {
      id: `dr-${Date.now()}`,
      title,
      draftType,
      lastEdited: 'Just now',
      autoSaveStatus: 'saved',
      estimatedCompletion: '5 mins read',
      excerpt: 'Draft content placeholder...',
      progressPercent: 10,
      publishingIdentityId: 'user-me',
    };
    set((state) => ({ drafts: [newDraft, ...state.drafts] }));
    return newDraft;
  },
}));
