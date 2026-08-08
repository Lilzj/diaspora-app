import { create } from 'zustand';
import { UnifiedContentItem, ContentStatus, BulkActionType, ArchivedItem } from '@/types/creator';
import { mockCreatorContent, mockArchivedItems } from '@/mocks/creator-data';

interface ContentManagementState {
  items: UnifiedContentItem[];
  archivedItems: ArchivedItem[];
  isLoading: boolean;
  error: string | null;

  // Fetch & Reload
  loadContent: () => void;

  // Item Actions
  updateItemStatus: (id: string, newStatus: ContentStatus) => void;
  archiveItem: (id: string, reason?: ArchivedItem['archiveReason']) => void;
  restoreItem: (id: string) => void;
  deleteItem: (id: string) => void;
  deletePermanently: (id: string) => void;
  duplicateItem: (id: string) => void;
  renewListing: (id: string) => void;
  
  // Bulk Actions
  executeBulkAction: (action: BulkActionType, itemIds: string[]) => { success: boolean; count: number };

  // Health calculation
  getHealthStats: () => { healthy: number; needsAttention: number; expiringSoon: number; actionRequired: number; overallScore: number };
}

export const useContentManagementStore = create<ContentManagementState>((set, get) => ({
  items: mockCreatorContent,
  archivedItems: mockArchivedItems,
  isLoading: false,
  error: null,

  loadContent: () => {
    set({ isLoading: true });
    // Simulated async load
    setTimeout(() => {
      set({ items: mockCreatorContent, archivedItems: mockArchivedItems, isLoading: false });
    }, 200);
  },

  updateItemStatus: (id, newStatus) => set((state) => {
    const updated = state.items.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          currentStatus: newStatus,
          lastUpdated: 'Just now',
        };
      }
      return item;
    });
    return { items: updated };
  }),

  archiveItem: (id, reason = 'User Archived') => set((state) => {
    const targetItem = state.items.find((i) => i.id === id);
    if (!targetItem) return state;

    const newArchived: ArchivedItem = {
      id: `arch-${Date.now()}`,
      title: targetItem.title,
      contentType: targetItem.contentType,
      archiveDate: 'Just now',
      archiveReason: reason,
      originalStatus: targetItem.currentStatus,
      publishingIdentityName: targetItem.publishingIdentity.name,
    };

    return {
      items: state.items.filter((i) => i.id !== id),
      archivedItems: [newArchived, ...state.archivedItems],
    };
  }),

  restoreItem: (id) => set((state) => {
    const targetArchived = state.archivedItems.find((a) => a.id === id);
    if (!targetArchived) return state;

    const restoredItem: UnifiedContentItem = {
      id: `restored-${Date.now()}`,
      title: targetArchived.title,
      contentType: targetArchived.contentType,
      currentStatus: targetArchived.originalStatus || 'Published',
      createdDate: 'Restored Item',
      lastUpdated: 'Just now',
      views: 0,
      bookmarks: 0,
      commentsCount: 0,
      messagesCount: 0,
      unreadMessagesCount: 0,
      publishingIdentity: {
        id: 'user-me',
        name: targetArchived.publishingIdentityName || 'Joshua',
        type: 'personal',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
        handle: '@joshua_uk',
        verified: true,
        followerCount: 980,
      },
      healthScore: 90,
      healthStatus: 'healthy',
      healthRecommendations: [],
    };

    return {
      archivedItems: state.archivedItems.filter((a) => a.id !== id),
      items: [restoredItem, ...state.items],
    };
  }),

  deleteItem: (id) => set((state) => ({
    items: state.items.filter((i) => i.id !== id),
  })),

  deletePermanently: (id) => set((state) => ({
    archivedItems: state.archivedItems.filter((a) => a.id !== id),
  })),

  duplicateItem: (id) => set((state) => {
    const itemToClone = state.items.find((i) => i.id === id);
    if (!itemToClone) return state;

    const cloned: UnifiedContentItem = {
      ...itemToClone,
      id: `clone-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: `${itemToClone.title} (Copy)`,
      createdDate: 'Just now',
      lastUpdated: 'Just duplicated',
      views: 0,
      bookmarks: 0,
      commentsCount: 0,
      messagesCount: 0,
      unreadMessagesCount: 0,
      currentStatus: itemToClone.contentType === 'Guide' ? 'Draft' : 'Available',
    };

    return { items: [cloned, ...state.items] };
  }),

  renewListing: (id) => set((state) => {
    const updated = state.items.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          lastUpdated: 'Renewed today',
          currentStatus: 'Available' as ContentStatus,
          healthScore: 98,
          healthStatus: 'healthy' as const,
          healthRecommendations: [],
        };
      }
      return item;
    });
    return { items: updated };
  }),

  executeBulkAction: (action, itemIds) => {
    const { items, archiveItem, deleteItem, updateItemStatus, renewListing } = get();
    let affectedCount = 0;

    itemIds.forEach((id) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;

      switch (action) {
        case 'archive':
          archiveItem(id, 'User Archived');
          affectedCount++;
          break;
        case 'delete':
          deleteItem(id);
          affectedCount++;
          break;
        case 'pause':
          updateItemStatus(id, 'Paused');
          affectedCount++;
          break;
        case 'renew':
          renewListing(id);
          affectedCount++;
          break;
        case 'mark_sold':
          updateItemStatus(id, 'Sold');
          affectedCount++;
          break;
        case 'mark_filled':
          updateItemStatus(id, 'Filled');
          affectedCount++;
          break;
        case 'mark_rented':
          updateItemStatus(id, 'Rented');
          affectedCount++;
          break;
        default:
          affectedCount++;
          break;
      }
    });

    return { success: true, count: affectedCount };
  },

  getHealthStats: () => {
    const items = get().items;
    let healthy = 0;
    let needsAttention = 0;
    let expiringSoon = 0;
    let actionRequired = 0;
    let totalScore = 0;

    items.forEach((item) => {
      totalScore += item.healthScore;
      if (item.healthStatus === 'healthy') healthy++;
      else if (item.healthStatus === 'needs_attention') needsAttention++;
      else if (item.healthStatus === 'expiring_soon') expiringSoon++;
      else if (item.healthStatus === 'action_required') actionRequired++;
    });

    const overallScore = items.length > 0 ? Math.round(totalScore / items.length) : 100;
    return { healthy, needsAttention, expiringSoon, actionRequired, overallScore };
  },
}));
