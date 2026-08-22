// ─────────────────────────────────────────────────────────────────────────────
// Creator drafts — seeded from a fixture, now empty
//
// ── What this store used to do ───────────────────────────────────────────────
//
// `drafts: mockCreatorDrafts`, and `loadDrafts()` waited 150ms before `set()`ing
// the same fixture back. Three half-written pieces — with titles, excerpts,
// progress percentages and "autosaved" badges — appeared in every member's Draft
// Center, under a "Drafts (3)" category chip, on every account. A member who had
// never started writing anything was shown three of their own drafts, each with
// a Continue button.
//
// That is worse than a wrong count. A draft is a promise that unfinished work is
// safe: the "Autosaved" chip on `DraftCard` says so explicitly. Showing three
// drafts that do not exist teaches a member to trust an autosave that never ran,
// and the day they write something real into one of these screens and close the
// app, they find out.
//
// ── Why it is empty rather than wired ────────────────────────────────────────
//
// There is no creator-drafts route. The Creator module's whole HTTP surface —
// `Api/CreatorEndpointContributors.cs`, `Api/CreatorEndpoints.cs`,
// `Api/ProgrammeEndpoints.cs` — has nothing about drafts, and no other module
// serves a cross-domain draft list.
//
// One *domain* does have real drafts: `GET /guides/mine/drafts`, already wrapped
// by **`useMyGuideDrafts()` in `hooks/guides.ts`**. That is the route to reach
// for when the Draft Center is rebuilt. It is deliberately not called from here,
// for two reasons. It returns guide drafts and this store's `CreatorDraft` is a
// seven-domain shape with `progressPercent`, `estimatedCompletion` and
// `autoSaveStatus` fields no route populates — filling those in client-side is
// the same invention this change removes. And a zustand store is the wrong place
// to own a server list: every other real list in this app is a react-query hook,
// so the Draft Center should call `useMyGuideDrafts()` directly rather than
// mirror it into global state.
//
// Until that rebuild, the honest state is: nothing here, and a reason.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { CreatorDraft, ContentType } from '@/types/creator';

/**
 * Rendered verbatim by any consumer still showing this store's empty list.
 *
 * The sentence used to be *"Diaspora cannot list your drafts yet — there is no
 * route for them"*, and the second half was never true: `GET /guides/mine/drafts`
 * exists, and this file's own header says so two paragraphs above. What is true
 * is narrower — **this store's** shape has no route, because `CreatorDraft`
 * spans seven domains and carries `progressPercent`, `estimatedCompletion` and
 * `autoSaveStatus`, which nothing populates.
 *
 * The Draft Center no longer depends on it: `WorkspaceSection` renders guide
 * drafts out of the workspace fan-out, which reads the real route. This stays
 * for any consumer that has not moved.
 */
export const CREATOR_DRAFTS_UNAVAILABLE_REASON =
  'This list covers drafts across every kind of content, and Diaspora only stores guide drafts today. Your guide drafts are in the Draft Center and in the guide editor.';

interface CreatorDraftState {
  drafts: CreatorDraft[];
  isLoading: boolean;

  /**
   * True while no route can serve this list. Additive: it lets a consumer say
   * "we cannot show your drafts" instead of "you have no drafts", which are
   * different statements and only one of them is true.
   */
  isUnavailable: boolean;
  /** Human-readable companion to `isUnavailable`. */
  unavailableReason: string;

  // Actions
  loadDrafts: () => void;
  renameDraft: (id: string, newTitle: string) => void;
  duplicateDraft: (id: string) => void;
  deleteDraft: (id: string) => void;
  saveDraft: (id: string, title: string, excerpt: string) => void;
  createDraft: (title: string, draftType: ContentType) => CreatorDraft;
}

export const useCreatorDraftStore = create<CreatorDraftState>((set) => ({
  drafts: [],
  isLoading: false,
  isUnavailable: true,
  unavailableReason: CREATOR_DRAFTS_UNAVAILABLE_REASON,

  /**
   * Signature kept; the fake latency and the re-seed are gone. There is no
   * request to make, so there is no loading state to enter — a spinner here
   * would only be a costume for the fixture that used to follow it.
   */
  loadDrafts: () => {
    set({
      drafts: [],
      isLoading: false,
      isUnavailable: true,
      unavailableReason: CREATOR_DRAFTS_UNAVAILABLE_REASON,
    });
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
      // Was 'saved'. Nothing saved it. There is no duplicate/clone route in any
      // module, so a copy made here has never been anywhere but this process.
      autoSaveStatus: 'failed',
    };
    return { drafts: [...state.drafts, cloned] };
  }),

  deleteDraft: (id) => set((state) => ({
    drafts: state.drafts.filter((d) => d.id !== id),
  })),

  saveDraft: (id, title, excerpt) => set((state) => ({
    // `autoSaveStatus` stays whatever it was rather than flipping to 'saved':
    // this writes to memory, and the card renders that field as a green
    // "Autosaved" badge. Nothing may claim a save that no route performed.
    drafts: state.drafts.map((d) => (d.id === id ? { ...d, title, excerpt, lastEdited: 'Not saved' } : d)),
  })),

  /**
   * Builds a draft record and **does not store it**.
   *
   * The signature is unchanged because callers destructure the return value, but
   * the `set()` is gone. Pushing a new card into the Draft Center — badged
   * "Autosaved", with a progress bar — would tell a member their new draft is
   * being kept, and there is no route that keeps it; it would vanish on the next
   * app start with no warning and no way to recover what they typed into it.
   *
   * The caller in `sections/WorkspaceSection` now routes to the real publish
   * flows instead, which do reach a server.
   */
  createDraft: (title, draftType) => ({
    id: `dr-${Date.now()}`,
    title,
    draftType,
    lastEdited: 'Not saved',
    autoSaveStatus: 'failed',
    estimatedCompletion: '',
    excerpt: '',
    progressPercent: 0,
    publishingIdentityId: '',
  }),
}));
