// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community repositories (Frontend Phase 13, §12, §43, §61,
// §64)
//
// §64's repository layer. Every hook here is the *stable domain interface* a
// screen depends on, and each one decides for itself which arm answers:
//
//   CommunityDirectoryRepository     → development adapter        GAP-001
//   CommunityProfileRepository       → development adapter        GAP-002
//   CommunityMembershipRepository    → development adapter        GAP-003/004/005
//   CommunityRoleRepository          → development adapter        GAP-006/018
//   CommunityStatisticsRepository    → adapter, **hybrid marks**  GAP-007
//   CommunityGovernanceRepository    → certified routes           GAP-016/017/019
//   CommunityScopedContentRepository → **certified routes**       GAP-009
//
// Five properties every hook holds to, because screens rely on them:
//
//   **`isSimulated` travels with the data.** A hook that can return simulated
//   data always reports it, so a screen cannot render an invented member count
//   without having had the opportunity to mark it. The hybrid hooks report it
//   *per metric* — marking a real event count as simulated would be its own kind
//   of lie.
//
//   **A disabled build is not an error state.** Gap queries are `enabled: false`
//   in a release build rather than left to fail, so a production binary shows
//   "not available yet" rather than a spinner resolving into an error.
//
//   **The scope is resolved once, here.** Screens never combine a mode with a
//   membership set; they ask for a scope and get one. §12 forbids
//   `activeCommunityId` scattered through components, and the way that holds is
//   that no component has the pieces to assemble a scope itself.
//
//   **Server state stays server state.** Membership, roles and capabilities are
//   TanStack Query data. Nothing here mirrors them into Zustand (§44), because a
//   mirrored capability is a capability that outlives its revocation.
//
//   **Nothing is ranked here.** §25 forbids implementing recommendation scoring
//   in the frontend and this file implements none. Ordering is the server's, or
//   it is a documented client behaviour (name, distance) that the UI labels.
// ─────────────────────────────────────────────────────────────────────────────

// On '@/lib/api/community-gap-directory-api', imported by 7 of the files here:
//
// The query keys stay in the adapter's module because the cache namespace is
// shared by every hook below. Nothing governance-related is simulated any more:
// initiatives (FRONTEND-PHASE13-GAP-019) became real on 20 Oct 2026.

// On '@/lib/api/community-entity-api', imported by 6 of the files here:
//
// ── The six that are real now ───────────────────────────────────────────────
//
// B18 serves the community entity, so the directory, the profile, the caller's
// membership set, the membership transitions, the primary community and the
// capability set all come from the certified arm — FRONTEND-PHASE13-GAP-001
// through -006.
//
// **The split is deliberately partial and stays that way.** Since 20 Oct 2026
// (backend d07a707 and the community moderation queue) statistics, comparison,
// rules, notices, role holders, preferences and the moderation queue are real
// too, and suggestions were already. Initiatives followed the same day (backend
// e57082e), with their participation and progress updates.
//
// Same names, same signatures.

export * from './directory';
export * from './context';
export * from './membership';
export * from './governance';
export * from './initiatives';
export * from './moderation';
export * from './administration';
export type { CommunityQueryMeta } from './shared';
