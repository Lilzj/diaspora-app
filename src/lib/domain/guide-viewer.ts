// ─────────────────────────────────────────────────────────────────────────────
// The reader's own state on a guide
//
// The guide read carries `viewer` (since 4 Nov 2026): whether the signed-in
// reader saved the guide and how they voted. The save button used to send
// `saved: true` on every tap and draw a fixed "Save guide", so saving changed
// nothing a member could see (UAT, 3 Nov 2026). It now draws the server's
// answer, and a second tap removes the save.
// ─────────────────────────────────────────────────────────────────────────────

import type { GuideResponse, GuideViewerResponse } from '@/types/guides';

export interface GuideViewerState {
  isSaved: boolean;
  vote: GuideViewerResponse['vote'];
}

/** The reader's state, or "not saved, no vote" when signed out or not sent. */
export function viewerStateOf(guide: Pick<GuideResponse, 'viewer'> | null | undefined): GuideViewerState {
  const viewer = guide?.viewer;
  return { isSaved: viewer?.isSaved === true, vote: viewer?.vote ?? null };
}

export interface SaveControl {
  label: string;
  icon: string;
  /** What a tap asks for: the opposite of the current state. */
  nextSaved: boolean;
}

export function saveControlFor(state: GuideViewerState, isPending: boolean): SaveControl {
  if (state.isSaved) {
    return { label: isPending ? 'Removing…' : 'Saved', icon: '✅', nextSaved: false };
  }
  return { label: isPending ? 'Saving…' : 'Save guide', icon: '🔖', nextSaved: true };
}
