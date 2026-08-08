/**
 * Diaspora Conversations — Draft Store
 *
 * Persists per-conversation drafts including text and queued attachments.
 * Survives navigation; cleared when message is sent.
 */

import { create } from 'zustand';
import type { AttachmentUploadState } from '@/types/conversation';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface DraftAttachment {
  localId: string;
  type: 'image' | 'document' | 'voice';
  uri: string;             // Local file URI
  fileName?: string;
  sizeBytes?: number;
  mimeType?: string;
  durationSeconds?: number; // For voice
  uploadState: AttachmentUploadState;
  uploadProgress?: number;
  uploadedUrl?: string;    // Set once uploaded
}

export interface ConversationDraft {
  conversationId: string;
  text: string;
  attachments: DraftAttachment[];
  replyToMessageId?: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------

interface DraftState {
  drafts: Record<string, ConversationDraft>;

  // Text
  updateDraftText: (conversationId: string, text: string) => void;
  getDraftText: (conversationId: string) => string;

  // Reply
  setReplyTo: (conversationId: string, messageId: string | undefined) => void;
  getReplyTo: (conversationId: string) => string | undefined;

  // Attachments
  addAttachment: (conversationId: string, attachment: DraftAttachment) => void;
  updateAttachmentState: (
    conversationId: string,
    localId: string,
    state: AttachmentUploadState,
    progress?: number,
    uploadedUrl?: string
  ) => void;
  removeAttachment: (conversationId: string, localId: string) => void;
  getAttachments: (conversationId: string) => DraftAttachment[];

  // Clear
  clearDraft: (conversationId: string) => void;
}

// ---------------------------------------------------------------------------
// STORE
// ---------------------------------------------------------------------------

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: {},

  updateDraftText: (conversationId, text) => {
    set((state) => ({
      drafts: {
        ...state.drafts,
        [conversationId]: {
          ...(state.drafts[conversationId] || { conversationId, text: '', attachments: [] }),
          text,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  },

  getDraftText: (conversationId) => get().drafts[conversationId]?.text ?? '',

  setReplyTo: (conversationId, messageId) => {
    set((state) => ({
      drafts: {
        ...state.drafts,
        [conversationId]: {
          ...(state.drafts[conversationId] || { conversationId, text: '', attachments: [] }),
          replyToMessageId: messageId,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  },

  getReplyTo: (conversationId) => get().drafts[conversationId]?.replyToMessageId,

  addAttachment: (conversationId, attachment) => {
    set((state) => {
      const draft = state.drafts[conversationId] || { conversationId, text: '', attachments: [] };
      return {
        drafts: {
          ...state.drafts,
          [conversationId]: {
            ...draft,
            attachments: [...draft.attachments, attachment],
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  updateAttachmentState: (conversationId, localId, uploadState, progress, uploadedUrl) => {
    set((state) => {
      const draft = state.drafts[conversationId];
      if (!draft) return state;
      return {
        drafts: {
          ...state.drafts,
          [conversationId]: {
            ...draft,
            attachments: draft.attachments.map((a) =>
              a.localId === localId
                ? {
                    ...a,
                    uploadState,
                    uploadProgress: progress ?? a.uploadProgress,
                    uploadedUrl: uploadedUrl ?? a.uploadedUrl,
                  }
                : a
            ),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  removeAttachment: (conversationId, localId) => {
    set((state) => {
      const draft = state.drafts[conversationId];
      if (!draft) return state;
      return {
        drafts: {
          ...state.drafts,
          [conversationId]: {
            ...draft,
            attachments: draft.attachments.filter((a) => a.localId !== localId),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  getAttachments: (conversationId) => get().drafts[conversationId]?.attachments ?? [],

  clearDraft: (conversationId) => {
    set((state) => {
      const updated = { ...state.drafts };
      delete updated[conversationId];
      return { drafts: updated };
    });
  },
}));
