// ─────────────────────────────────────────────────────────────────────────────
// Creator activity timeline — seeded from a fixture, now empty
//
// ── What this store used to do ───────────────────────────────────────────────
//
// `events: mockTimelineEvents`. The Workspace section's "Timeline Log" view
// rendered it directly, so every member who flipped that toggle read the same
// invented history of their own account: a guide published on a date they never
// published anything, a listing marked sold, a verification granted, a followers
// milestone reached. `TimelineItem` even links each row back to a content id, so
// tapping one opened the quick-actions sheet for a fixture item.
//
// A fabricated *list* is a false claim about what you have. A fabricated
// *timeline* is a false claim about what you did, and when. It is the shape a
// member would reach for to answer "when did I publish that?" or "was I ever
// verified?" — questions where being confidently wrong is the whole problem.
// A milestone row in particular ("followers_milestone") congratulates somebody
// on an audience they do not have.
//
// ── Why it was empty, and what changed ───────────────────────────────────────
//
// This header used to end: *"the data genuinely exists server-side and genuinely
// cannot be fetched. Wiring this store is one route away — a paginated read over
// `CreatorActivityEntry` — and until that route exists, an empty timeline with a
// stated reason is the only truthful thing to render."*
//
// That was right in every particular, and the route landed.
// `GET /creators/me/activity` is cursor-paged and newest-first (BG-06), and
// `lib/creator/activity.ts` is the client for it. The diagnosis is kept because
// it was exact: `ICreatorActivityRepository` could count entries, count one
// action type, rank a leaderboard and answer whether a source event had been
// seen — and had no method that handed the rows back. The platform recorded a
// creator's activity faithfully and had no way to show it to them.
//
// ── The one thing an empty list still cannot say by itself ───────────────────
//
// `isCreator` is carried through from the response for the reason the route
// carries it: **"you have not started publishing" and "nothing recognised yet"
// are different sentences**, and an empty array cannot separate them.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { fetchCreatorActivity } from '@/lib/creator/activity';
import { CreatorTimelineEvent } from '@/types/creator';

/**
 * Rendered when the history could not be read — a network failure or an outage,
 * and **not** a platform limitation any more.
 *
 * The old text said the platform *serves no route*, which was true when written
 * and is now false. A sentence blaming the platform for a request that happened
 * to fail is the same class of error this programme exists to remove, pointed
 * the other way.
 */
export const CREATOR_TIMELINE_UNAVAILABLE_REASON =
  'Your activity history could not be loaded just now. Pull to refresh to try again.';

interface CreatorTimelineState {
  events: CreatorTimelineEvent[];
  filterType: string; // 'all' | 'published' | 'status_changed' | 'verification' | 'milestones'

  /**
   * True when the history could not be read. Still additive and still worth
   * reading: "no activity yet" and "we could not fetch your activity" look
   * identical on screen and mean opposite things to somebody checking whether
   * their guide ever went out.
   */
  isUnavailable: boolean;
  /** Human-readable companion to `isUnavailable`. */
  unavailableReason: string;

  /** In flight. Distinct from empty, so a first load is not read as "nothing". */
  isLoading: boolean;

  /**
   * Whether the platform recognises this member as a creator.
   *
   * With an empty list: `false` means they have not started publishing, `true`
   * means nothing they have done is recognised yet. Two different screens.
   */
  isCreator: boolean;

  /** The next page, or null at the end. */
  nextCursor: string | null;
  hasMore: boolean;

  // Actions
  load: (identityName: string) => Promise<void>;
  loadMore: (identityName: string) => Promise<void>;
  addEvent: (event: Omit<CreatorTimelineEvent, 'id' | 'timestamp'>) => void;
  setFilterType: (type: string) => void;
  clearHistory: () => void;
}

export const useCreatorTimelineStore = create<CreatorTimelineState>((set, get) => ({
  events: [],
  filterType: 'all',

  // Not unavailable until a read actually fails. Opening `true` would make every
  // member's first frame assert a failure that has not happened.
  isUnavailable: false,
  unavailableReason: CREATOR_TIMELINE_UNAVAILABLE_REASON,
  isLoading: false,
  isCreator: false,
  nextCursor: null,
  hasMore: false,

  /**
   * The first page, replacing whatever is held.
   *
   * A failure sets `isUnavailable` and **leaves the existing events alone** — a
   * refresh that fails must not empty a list the member is already reading.
   */
  load: async (identityName) => {
    set({ isLoading: true });

    try {
      const page = await fetchCreatorActivity(identityName, { limit: 25 });

      set({
        events: page.events,
        isCreator: page.isCreator,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        isUnavailable: false,
        isLoading: false,
      });
    } catch {
      set({ isUnavailable: true, isLoading: false });
    }
  },

  /** The next page, appended. A failure here leaves the list as it is. */
  loadMore: async (identityName) => {
    const { nextCursor, hasMore, isLoading } = get();

    if (!hasMore || !nextCursor || isLoading) return;

    set({ isLoading: true });

    try {
      const page = await fetchCreatorActivity(identityName, { cursor: nextCursor, limit: 25 });

      set((state) => ({
        events: [...state.events, ...page.events],
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false });
    }
  },

  /**
   * Appends one event raised in front of the member during this session.
   *
   * The read route is the source of truth and a reload replaces whatever this
   * added. It exists so an action a member has just taken appears immediately
   * rather than after the outbox has caught up — the entry is recorded from an
   * integration event, so the server's copy lands a moment later.
   */
  addEvent: (event) => set((state) => ({
    events: [
      {
        ...event,
        id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: 'Just now',
      },
      ...state.events,
    ],
  })),

  setFilterType: (filterType) => set({ filterType }),

  /**
   * Clears the local list only. It used to wipe the fixture, which then came
   * back for the next member; it now empties something that was already empty.
   * It must never be presented as "history deleted" — there is no route to
   * delete a `CreatorActivityEntry`, and the server's copy is untouched.
   */
  clearHistory: () => set({ events: [] }),
}));
