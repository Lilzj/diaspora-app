// ─────────────────────────────────────────────────────────────────────────────
// Creator workspace — the unified content list, and why it is empty
//
// ── What this store used to do ───────────────────────────────────────────────
//
// It opened seeded: `items: mockCreatorContent`, `archivedItems:
// mockArchivedItems`, straight out of `mocks/creator-data.ts`. `loadContent()`
// then waited 200ms and `set()` the *same two fixtures* back, so the one action
// that looked like a fetch was a timer over a constant.
//
// The harm is not that the numbers were wrong. It is that **every member saw the
// same seven items and was told they were theirs**. A housing listing in
// Manchester, a marketplace item, a guide with 4,200 views and 118 bookmarks —
// the whole Workspace tab, the category counts, the health badge in the Creator
// Studio header, the archive centre, all of it, identical for every account and
// belonging to none of them. Someone who had never published anything opened
// Creator Studio and was shown a body of work, an audience, and an engagement
// history that did not exist. Downstream screens inherited this without ever
// importing a fixture themselves: `sections/WorkspaceSection`, `creator/index`
// and `ContentHealthCenterModal` all read this store and trusted it.
//
// ── Why it stayed empty, and what changed ─────────────────────────────────
//
// This header used to say: *"Because there is nothing to wire it to … **There is
// no route that lists a creator's content, and no route that lists archived
// content.** Not one, in any module, for the unified shape this store models."*
// It named two per-domain routes it knew about, added two it said had no
// frontend client, and concluded:
//
//   > Building the workspace properly means either building the fan-out over the
//   > `/mine` routes with only the fields those routes actually carry, or a real
//   > unified route. Neither is a store change.
//
// The fan-out now exists — `lib/creator/workspace.ts` — and this store reads it.
// Four routes, verified against a running deployment: `GET /guides/mine`,
// `GET /marketplace/listings/mine`, `GET /housing/listings/mine` and
// `GET /community-life/events/mine`.
//
// The old header was right about one thing and this change keeps it: assembling
// the shape must not mean **inventing `healthScore`, `healthStatus` and
// `healthRecommendations`**. Those three are now optional on
// `UnifiedContentItem`, the fan-out leaves them undefined, and
// `ContentHealthBadge` renders "Health not measured" rather than a score nothing
// computed.
//
// ── The 403 is a state, not a failure ────────────────────────────────────
//
// Marketplace and Housing refuse their `/mine` routes until the member has a
// seller or landlord profile. `sources` carries that per vertical, so the
// workspace can show a guide author their guides *and* say plainly that a seller
// profile has not been set up — rather than showing an error, or an empty list
// that reads as "you have published nothing".
//
// ── What the actions still do not do ─────────────────────────────────────
//
// Reading is wired; **writing is not.** There is no unified status route, no
// duplicate route and no bulk route in any module, so `updateItemStatus`,
// `duplicateItem`, `renewListing` and `executeBulkAction` still move local rows
// only, and every caller of them says so on screen. `executeBulkAction` in
// particular still refuses to return `success: true`.
// ──────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import {
  fetchWorkspaceArchive,
  fetchWorkspaceContent,
  workspaceCoverageNote,
  type WorkspaceSource,
} from '@/lib/creator/workspace';
import { UnifiedContentItem, ContentStatus, BulkActionType, ArchivedItem } from '@/types/creator';

/**
 * The identity a row carries before the screen has supplied the real one.
 *
 * Empty rather than plausible: a placeholder name is rendered on a card as the
 * author, and the whole reason this store stopped seeding fixtures is that it
 * was attributing content to the wrong person.
 */
const ANONYMOUS_IDENTITY: UnifiedContentItem['publishingIdentity'] = {
  id: '',
  name: '',
  type: 'personal',
  avatar: '',
  handle: '',
  verified: false,
  followerCount: 0,
};

/** A live row, in the shape the archive list renders. */
function toArchivedItem(item: UnifiedContentItem): ArchivedItem {
  return {
    id: item.id,
    title: item.title,
    contentType: item.contentType,
    archiveDate: item.lastUpdated,
    archiveReason: 'User Archived',
    originalStatus: item.currentStatus,
    publishingIdentityName: item.publishingIdentity.name,
  };
}

/**
 * What to show when **not one** vertical answered.
 *
 * It used to read *"Diaspora cannot list your published content yet — no route
 * serves a creator's own items"*, which was true when written and is not: four
 * routes serve them. The sentence is now reserved for the case where every one
 * of the four failed, which is a transport problem rather than a missing
 * capability — and it says so, because telling a member the platform cannot do
 * something when their connection dropped sends them to the wrong conclusion.
 */
export const CONTENT_WORKSPACE_UNAVAILABLE_REASON =
  'Your content could not be loaded just now. This is not a problem with anything you have published.';

interface ContentManagementState {
  items: UnifiedContentItem[];
  archivedItems: ArchivedItem[];
  isLoading: boolean;
  error: string | null;

  /**
   * True for as long as no route can serve this list. Additive — nothing is
   * required to read it, but a consumer that does can distinguish "you have
   * nothing published" from "we cannot tell you what you have published".
   */
  isUnavailable: boolean;
  /** Human-readable companion to `isUnavailable`. Safe to render verbatim. */
  unavailableReason: string;
  /** Per-vertical outcome, so a screen can say *which* list is missing and why. */
  sources: WorkspaceSource[];
  /** One sentence naming the verticals not covered, or null when all are. */
  coverageNote: string | null;
  /**
   * Who the rows are published as.
   *
   * Set by the workspace screen from the real session. The store must never
   * invent it — an earlier version hard-coded a name, a handle, an avatar and a
   * verification tick, and restoring somebody's content under another member's
   * identity is a worse claim than a wrong number.
   */
  publishingIdentity: UnifiedContentItem['publishingIdentity'];
  setPublishingIdentity: (identity: UnifiedContentItem['publishingIdentity']) => void;

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
  getHealthStats: () => { healthy: number; needsAttention: number; expiringSoon: number; actionRequired: number; overallScore: number; assessed: number };
}

export const useContentManagementStore = create<ContentManagementState>((set, get) => ({
  // Empty, not seeded. See the header: there is no route behind either list.
  items: [],
  archivedItems: [],
  isLoading: false,
  error: null,
  isUnavailable: false,
  unavailableReason: CONTENT_WORKSPACE_UNAVAILABLE_REASON,
  sources: [],
  coverageNote: null,
  publishingIdentity: ANONYMOUS_IDENTITY,
  setPublishingIdentity: (identity) => set({ publishingIdentity: identity }),

  /**
   * Reads the member's own content out of the four `/mine` routes.
   *
   * Two earlier versions were wrong in opposite directions: the first flipped
   * `isLoading`, waited 200ms and `set()` the same seven fixtures for every
   * account; the second did nothing at all and said the platform could not
   * answer. This one asks.
   *
   * Fire-and-forget rather than awaited, because the signature is `() => void`
   * and every caller is an effect. Failures land in `error` and in `sources`
   * rather than escaping — a workspace that throws shows nothing, and three of
   * the four verticals may have answered perfectly well.
   */
  loadContent: () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });

    const identity = get().publishingIdentity;

    void Promise.all([
      fetchWorkspaceContent(identity),
      fetchWorkspaceArchive(identity),
    ])
      .then(([live, archive]) => {
        set({
          isLoading: false,
          items: live.items,
          archivedItems: archive.items.map(toArchivedItem),
          sources: live.sources,
          coverageNote: workspaceCoverageNote(live.sources),
          isUnavailable: live.isUnavailable,
          error: live.isUnavailable ? CONTENT_WORKSPACE_UNAVAILABLE_REASON : null,
        });
      })
      .catch((cause: unknown) => {
        set({
          isLoading: false,
          isUnavailable: true,
          error: cause instanceof Error ? cause.message : CONTENT_WORKSPACE_UNAVAILABLE_REASON,
        });
      });
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

  /**
   * Restores a row this session archived — and nothing else, because
   * `archivedItems` starts empty and only `archiveItem` above can add to it.
   *
   * The identity block used to be hard-coded: name "Joshua", handle
   * "@joshua_uk", an Unsplash avatar, `verified: true`, 980 followers, and a
   * `healthScore` of 90 invented on the spot. Restoring somebody's content under
   * another member's name and a verification tick they were never granted is a
   * claim about *identity*, which is worse than a wrong number. Everything below
   * is now carried over from the archived record or left neutral.
   */
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
        id: 'local-restore',
        name: targetArchived.publishingIdentityName,
        type: 'personal',
        avatar: '',
        handle: '',
        verified: false,
        followerCount: 0,
      },
      // Health is computed by a service that does not exist. Zero with no
      // recommendations is "unknown", not "perfect".
      healthScore: 0,
      healthStatus: 'needs_attention',
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
          // The three health fields used to be overwritten here with 98 /
          // 'healthy' / no recommendations, so pressing Renew visibly cleared
          // every warning on the card. No route was called and no assessment
          // was re-run; the health fields are left exactly as they were.
        };
      }
      return item;
    });
    return { items: updated };
  }),

  /**
   * **Never reports success.**
   *
   * It used to walk the ids, mutate local state, and return
   * `{ success: true, count: affectedCount }`; `BulkActionToolbar` rendered that
   * count as "Updated N items." A fabricated receipt is far more convincing than
   * a fabricated success message, and the toolbar has since stopped calling this
   * (see `inert-affordances.test.ts`). It stays only so the interface is
   * unchanged for any other caller, and it answers honestly: nothing was
   * reached, so nothing was affected.
   *
   * Worth naming separately: three of the `BulkActionType` verbs — renew/bump,
   * duplicate/clone and bulk anything — have no route in *any* module. They are
   * not waiting on this store; they are waiting on a capability nobody built.
   */
  executeBulkAction: () => ({ success: false, count: 0 }),

  getHealthStats: () => {
    const items = get().items;
    let healthy = 0;
    let needsAttention = 0;
    let expiringSoon = 0;
    let actionRequired = 0;
    let totalScore = 0;

    // Only rows the platform actually scored are counted. Since the fan-out
    // leaves the health fields undefined — nothing computes them — `assessed`
    // is 0 in practice, and every consumer checks it before rendering a grade.
    let assessed = 0;

    items.forEach((item) => {
      if (item.healthScore === undefined && item.healthStatus === undefined) return;
      assessed++;
      totalScore += item.healthScore ?? 0;
      if (item.healthStatus === 'healthy') healthy++;
      else if (item.healthStatus === 'needs_attention') needsAttention++;
      else if (item.healthStatus === 'expiring_soon') expiringSoon++;
      else if (item.healthStatus === 'action_required') actionRequired++;
    });

    // Empty used to score **100**, which the header badge rendered as a green
    // "100%" and the health centre captioned "Excellent! Your content is
    // active, verified, and highly trusted." An audit of nothing is not a pass.
    //
    // The denominator is `assessed` rather than `items.length`, and that matters
    // now that the list is real: a member with nine published items and no
    // health data would otherwise average nine undefined scores to 0 and be
    // shown a failing grade. `assessed` is what consumers gate on — an
    // unassessed set has no score at all rather than a bad one.
    const overallScore = assessed > 0 ? Math.round(totalScore / assessed) : 0;
    return { healthy, needsAttention, expiringSoon, actionRequired, overallScore, assessed };
  },
}));
