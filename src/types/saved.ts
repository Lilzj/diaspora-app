// ─────────────────────────────────────────────────────────────────────────────
// Community Knowledge — Saved Collections Types
// ─────────────────────────────────────────────────────────────────────────────

export type SavedContentType =
  | 'Listing'
  | 'Guide'
  | 'CommunityUpdate'
  | 'Job'
  | 'Housing'
  | 'Marketplace'
  | 'Event'
  | 'Organization';

export interface SavedItem {
  savedId: string;
  userId: string;
  contentType: SavedContentType;
  contentId: string;
  createdAt: string;
}

export interface SavedCollection {
  contentType: SavedContentType;
  label: string;
  icon: string;
  count: number;
  isAvailable: boolean;
  thumbnails: string[];
}

export const SAVED_COLLECTION_CONFIG: Record<SavedContentType, { label: string; icon: string; isAvailable: boolean }> = {
  Listing: { label: 'Providers', icon: '📍', isAvailable: true },
  Guide: { label: 'Guides', icon: '📖', isAvailable: true },
  CommunityUpdate: { label: 'Updates', icon: '📢', isAvailable: true },
  Job: { label: 'Jobs', icon: '💼', isAvailable: true },
  Housing: { label: 'Housing', icon: '🏠', isAvailable: true },
  Marketplace: { label: 'Marketplace', icon: '🛒', isAvailable: true },
  Event: { label: 'Events', icon: '🎉', isAvailable: true },
  Organization: { label: 'Community Groups', icon: '🏛', isAvailable: true },
};
