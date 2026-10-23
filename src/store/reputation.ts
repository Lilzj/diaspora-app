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
// It then became a thin cache over `GET /api/v1/trust/reputation/me` with a
// fetch of its own, beside `hooks/trust.ts`'s `useMyReputation` — two caches
// for one route. The Profile tab filled this one and the reputation screen the
// other, so opening the dashboard from the tab cost two requests out of the
// module's ten a minute (FE-11, 23 Oct 2026).
//
// ── What it is ──────────────────────────────────────────────────────────────
//
// A synchronous mirror of the hook's cache, with no fetch of its own.
// `useMyReputation` hydrates it whenever its query resolves, the way
// `useTrustProfile` hydrates `store/trust.ts`. It survives because
// `lib/trustEngine.ts` reads it with `getState()` from code that is not a hook.
//
// The route never 404s — a member with no scoring history is a `Member` on zero
// points — so a null `reputation` here means "not loaded yet", never "this
// member has none".
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type { UserReputation } from '@/types/reputation';
import type { WireReputationProfile } from '@/types/trust';

interface ReputationState {
  reputation: UserReputation | null;
  /** Called by `useMyReputation` with what the server sent. */
  hydrateFromReputationProfile: (profile: WireReputationProfile) => void;
}

export const useReputationStore = create<ReputationState>((set) => ({
  reputation: null,

  hydrateFromReputationProfile: (profile) =>
    // The wire shape and `UserReputation` were written against each other
    // field for field, so the only adjustment is `nextLevel`: the server may
    // omit the property entirely at the top of the ladder, and the view model
    // distinguishes only `null`. Normalised here so a reader's
    // `reputation.nextLevel && …` guard means one thing.
    set({
      reputation: {
        ...profile,
        nextLevel: profile.nextLevel ?? null,
        levelChangedAt: profile.levelChangedAt ?? null,
      },
    }),
}));
