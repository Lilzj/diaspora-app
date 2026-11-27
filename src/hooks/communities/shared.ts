// Communities hooks: what more than one file in this directory needs. ./index.ts does not
// re-export it, so nothing here is part of the module's public surface unless index.ts names it.

import type { CommunityUnavailableReason } from '@/types/community-directory';

// ═════════════════════════════════════════════════════════════════════════════
// DIRECTORY — GAP-001
// ═════════════════════════════════════════════════════════════════════════════

export interface CommunityQueryMeta {
  /** True when the development adapter answered. Screens must render a marker. */
  isSimulated: boolean;
  /** Set where the surface cannot be shown at all. Drives the §74 states. */
  unavailable: CommunityUnavailableReason | null;
}

/**
 * The meta a hook over a **real** route reports. Never simulated, and never
 * `feature-disabled` for want of the preview flag.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * The directory, the profile, the membership set and the capability set moved to
 * `community-entity-api` — "the six that are real now" — and the hooks kept
 * `enabled: … && areMultiCommunityGapsEnabled()` and `gapMeta`. That flag is
 * `areSimulatedFeaturesEnabled()`: true under `__DEV__`, and in a release build
 * only when `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1`. `eas.json` sets it on the
 * `preview` profile and **not** on `production`.
 *
 * So every APK anybody tested — all built from `preview` — showed communities
 * working, and the build that ships would have fetched none of them: no
 * directory, no community page, no memberships, and every capability false. The
 * comment above `useAvailableCommunities` even named it — a fallback "when the
 * directory query cannot run — a release build" — written when the directory was
 * still simulated, and true of the real one only because of this gate.
 */
export function realMeta(query: { isError: boolean }): CommunityQueryMeta {
  return { isSimulated: false, unavailable: query.isError ? 'error' : null };
}
