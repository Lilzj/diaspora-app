// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Reputation store
//
// ── What this was ───────────────────────────────────────────────────────────
//
// `loadReputation()` set a 300 ms timer and then assigned `mockUserReputation`
// from `mocks/community-data.ts`. Four screens rendered a member's level,
// score, badges and progress-to-next-level from a fixture, with a delay that
// made it look like a network call.
//
// ── What it is ──────────────────────────────────────────────────────────────
//
// A thin cache over `GET /api/v1/trust/reputation/me`. It survives rather than
// being replaced by `hooks/trust.ts`'s `useMyReputation` because
// `app/guide/create.tsx` reads it alongside `store/trust.ts` in code that is not
// a hook, and because `app/(tabs)/profile.tsx` wants the value without owning
// the fetch.
//
// `components/UpdateCard.tsx` was the second such consumer and is no longer:
// it read the level to decide who could confirm an alert, gating a capability
// B6 grants every authenticated member.
//
// `app/profile/reputation.tsx` reads the hook directly instead. Both end up
// asking the same route; only one of them is the cache.
//
// The route never 404s — a member with no scoring history is a `Member` on zero
// points — so a null `reputation` here means "not loaded" or "the call failed",
// never "this member has none".
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type { UserReputation } from '@/types/reputation';
import { fetchMyReputation, trustErrorMessage } from '@/lib/trust-api';

interface ReputationState {
  reputation: UserReputation | null;
  isLoading: boolean;
  /** A sentence for the member, or null. Set when the last load failed. */
  error: string | null;
  setReputation: (rep: UserReputation) => void;
  loadReputation: () => Promise<void>;
}

export const useReputationStore = create<ReputationState>((set, get) => ({
  reputation: null,
  isLoading: false,
  error: null,

  loadReputation: async () => {
    // Concurrent callers are common here: the profile tab and a card on the
    // same screen both ask on mount. One request, not two — the module's whole
    // rate-limit budget is ten a minute.
    if (get().isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const profile = await fetchMyReputation();

      // The wire shape and `UserReputation` were written against each other
      // field for field, so the only adjustment is `nextLevel`: the server may
      // omit the property entirely at the top of the ladder, and the view model
      // distinguishes only `null`. Normalised here so a screen's
      // `reputation.nextLevel && …` guard means one thing.
      set({
        reputation: {
          ...profile,
          nextLevel: profile.nextLevel ?? null,
          levelChangedAt: profile.levelChangedAt ?? null,
        },
        isLoading: false,
        error: null,
      });
    } catch (cause) {
      set({ isLoading: false, error: trustErrorMessage(cause) });
    }
  },

  setReputation: (rep) => set({ reputation: rep, error: null }),
}));
