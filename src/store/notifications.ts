import { create } from 'zustand';

/**
 * One notification, as the list and the NotificationItem component render it.
 *
 * B13 added the optional fields below. They are a strict superset of what this
 * store has always held, so every existing screen keeps working untouched — and
 * a screen that binds to the server's `NotificationResponse` (src/types/notification.ts)
 * can pass it straight in, because the two shapes agree field for field.
 *
 * `createdAt` is the one field whose meaning differs between the two: the seeded
 * items below hold display strings, while the server sends ISO-8601. Render it
 * with formatRelativeTime() from src/utils/format.ts, which passes a display
 * string through unchanged and formats an instant.
 */
export interface NotificationItemData {
  id: string;
  title: string;
  body: string;
  /** The human-readable label. What the card renders. */
  category: string;
  isRead: boolean;
  createdAt: string;
  targetRoute?: string;

  // ── Added in B13. All optional; nothing existing sets them. ──────────────

  /** The stable catalogue key — what a client should switch on. */
  categoryKey?: string;
  priority?: 'Critical' | 'High' | 'Normal' | 'Low' | 'Silent';
  status?: string;
  isArchived?: boolean;
  isPinned?: boolean;
  isStarred?: boolean;
  /** Which module the fact came from. The "sender" filter. */
  sourceModule?: string;
  entityType?: string;
  entityId?: string;
}

interface NotificationState {
  notifications: NotificationItemData[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  deleteAll: () => void;
  addNotification: (notification: Omit<NotificationItemData, 'id' | 'isRead' | 'createdAt'>) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [
    {
      id: 'notif-creator-1',
      title: 'New Listing Message Received',
      body: 'Marcus S. sent a message regarding: "Toyota Corolla 2018 Hybrid"',
      category: 'Marketplace',
      isRead: false,
      createdAt: '10 mins ago',
      targetRoute: '/profile/creator-dashboard',
    },
    {
      id: 'notif-creator-2',
      title: '🏆 Guide Milestone Achieved!',
      body: 'Your "BRP Verification & NHS Guide" reached 1,000 verified community readers!',
      category: 'Guide Milestone',
      isRead: false,
      createdAt: '2 hours ago',
      targetRoute: '/profile/creator-dashboard',
    },
    {
      id: 'notif-creator-3',
      title: 'Job Received New Applicants',
      body: '3 new resumes received for "Senior React Native Developer (Visa Sponsorship)"',
      category: 'Job Applicants',
      isRead: false,
      createdAt: '4 hours ago',
      targetRoute: '/profile/creator-dashboard',
    },
    {
      id: 'notif-creator-4',
      title: 'Housing Inquiry Received',
      body: 'Adewale T. submitted a rental application for "2-Bedroom Woolwich Flat"',
      category: 'Housing Inquiry',
      isRead: false,
      createdAt: '6 hours ago',
      targetRoute: '/profile/creator-dashboard',
    },
    {
      id: 'notif-creator-5',
      title: 'Content Feedback / Report',
      body: 'Two users reported "Single Furnished Room" as already rented.',
      category: 'Content Report',
      isRead: false,
      createdAt: '1 day ago',
      targetRoute: '/profile/creator-dashboard',
    },
    {
      id: 'notif-creator-6',
      title: 'Verification Approved ✓',
      body: 'Your BRP residency document scan was approved by Diaspora compliance.',
      category: 'Verification',
      isRead: true,
      createdAt: '2 days ago',
      targetRoute: '/profile/trust-center',
    },
    {
      id: 'notif-creator-7',
      title: 'Listing Status Expiring Soon',
      body: 'West African Gala 2026 event starts tomorrow. Review status.',
      category: 'Status Expiration',
      isRead: true,
      createdAt: '2 days ago',
      targetRoute: '/profile/creator-dashboard',
    },
    {
      id: 'notif-creator-8',
      title: 'Draft Auto-Saved ✏️',
      body: 'Your guide draft "Moving to London from Abidjan" was auto-saved.',
      category: 'Draft Auto-Save',
      isRead: true,
      createdAt: '3 days ago',
      targetRoute: '/profile/creator-dashboard',
    },
  ],
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
    })),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
    })),
  deleteNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
  deleteAll: () =>
    set(() => ({
      notifications: [],
    })),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          ...notification,
          id: `notif-${Date.now()}`,
          isRead: false,
          createdAt: 'Just now',
        },
        ...state.notifications,
      ],
    })),
}));
