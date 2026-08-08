// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community context persistence (Frontend Phase 13, §45)
//
// §45 asks for the primary community, the selected community, community
// preferences and cached community metadata to survive a restart, and then adds
// the sentence that decides the shape of this file:
//
//     "Do not persist sensitive membership information unnecessarily."
//
// ── What is written to disk, and what is not ─────────────────────────────────
//
//   WRITTEN      the active community id and the active mode — the member's
//                current *view selection*, which is what makes the app open
//                where they left it.
//                the recently-visited community ids, capped.
//                the display preferences from `CommunityPreferences` — the
//                privacy toggles and the cross-community default.
//                a small metadata cache: id, slug, name, type, origin, identity,
//                status. Enough to render a switcher and a badge offline.
//
//   NOT WRITTEN  the membership set. Not the states, not the roles, not the
//                capabilities, not `isPrimary`, not the interested list.
//
// The distinction matters more here than it would in another phase. A device is
// lost, seized at a border, shared with family, or handed to a shop for repair.
// A file on it saying *"this person is a member of the Nigerian community, a
// moderator of the Ghanaian one, and interested in two others"* is a record of
// nationality, affiliation and community standing sitting unencrypted in
// AsyncStorage. §41 calls community membership sensitive; the honest reading of
// that is that it does not belong in a plaintext key-value store to save one
// network request.
//
// So membership is **server state only**, held in TanStack Query's in-memory
// cache, and it is gone when the process is. Offline, the app knows which
// community the member was looking at and can render its name and flag from the
// metadata cache — and it says "you are offline, showing saved information"
// rather than pretending to know the membership state.
//
// ── Why the primary community is not persisted either ────────────────────────
//
// It looks like it should be: §45 names it. But the primary community *is* a
// membership field, and persisting it would persist the single most identifying
// element of the set. The active-community id covers the practical need — the
// app reopens on the right community — and when membership loads, the real
// primary arrives with it. The one behaviour lost is that a member whose active
// selection was `PRIMARY_COMMUNITY` sees an unresolved scope for the few hundred
// milliseconds before membership loads, which renders as a skeleton rather than
// as wrong data.
//
// ── The `dev-` guard ─────────────────────────────────────────────────────────
//
// Development community ids are prefixed `dev-`. `readCommunityContext` drops
// any persisted id carrying that prefix when the build cannot reach the
// development adapter, so a device that ran a preview build and then took a
// production update does not open pointing at a community that does not exist —
// and never sends a fabricated id to a real route.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CommunityId,
  CommunityMode,
  CommunityPreferences,
  CommunityRef,
  CommunityStatus,
} from '@/types/community-directory';
import { defaultCommunityPreferences } from '@/types/community-directory';
import { areMultiCommunityGapsEnabled } from '@/config/multi-community-gaps';

/**
 * The prefix every development community id carries.
 *
 * Exported so the mock data, the adapter and this guard cannot disagree about
 * what it is.
 */
export const DEV_COMMUNITY_ID_PREFIX = 'dev-';

export function isDevelopmentCommunityId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(DEV_COMMUNITY_ID_PREFIX);
}

const KEYS = {
  /** The active view selection. Not a membership. */
  CONTEXT: 'diaspora_community_context',
  /** Display and privacy preferences. No membership data. */
  PREFERENCES: 'diaspora_community_preferences',
  /** Metadata for rendering names and badges offline. */
  METADATA: 'diaspora_community_metadata',
} as const;

/** How many communities the metadata cache holds. Bounded on purpose (§60). */
const METADATA_LIMIT = 60;

/** How many recently-visited ids are kept. */
const RECENT_LIMIT = 8;

// ═════════════════════════════════════════════════════════════════════════════
// THE ACTIVE SELECTION
// ═════════════════════════════════════════════════════════════════════════════

export interface PersistedCommunityContext {
  activeCommunityId: CommunityId | null;
  mode: CommunityMode;
  /** Explicit multi-selection for `CROSS_COMMUNITY`. View state, not membership. */
  selectedCommunityIds: CommunityId[];
  recentCommunityIds: CommunityId[];
  /** ISO. Drives "showing information saved on <date>" when offline. */
  savedAt: string;
}

/**
 * A minimal community record, for rendering a name and a badge offline.
 *
 * Note what is absent: no member count, no statistics, no description. A
 * statistic read from disk would be shown next to a date nobody looks at, and
 * §29 requires a figure to carry its freshness — which a stale cached number
 * cannot honestly do. Names and flags do not go stale in the same way.
 */
export interface PersistedCommunityMetadata extends CommunityRef {
  status: CommunityStatus;
  savedAt: string;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A corrupt entry is discarded rather than crashing a launch. The next write
    // replaces it.
    return null;
  }
}

/**
 * Reads the persisted selection, applying the `dev-` guard.
 *
 * Returns `null` rather than a default when nothing was saved, so the caller can
 * distinguish "a first run" from "a member who chose All communities".
 */
export async function readCommunityContext(): Promise<PersistedCommunityContext | null> {
  try {
    const stored = safeParse<PersistedCommunityContext>(await AsyncStorage.getItem(KEYS.CONTEXT));
    if (!stored) return null;

    const allowDev = areMultiCommunityGapsEnabled();
    const keep = (id: string) => allowDev || !isDevelopmentCommunityId(id);

    return {
      activeCommunityId:
        stored.activeCommunityId && keep(stored.activeCommunityId) ? stored.activeCommunityId : null,
      mode: stored.mode ?? 'ALL_COMMUNITIES',
      selectedCommunityIds: (stored.selectedCommunityIds ?? []).filter(keep),
      recentCommunityIds: (stored.recentCommunityIds ?? []).filter(keep).slice(0, RECENT_LIMIT),
      savedAt: stored.savedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function writeCommunityContext(
  context: Omit<PersistedCommunityContext, 'savedAt'>
): Promise<void> {
  try {
    const payload: PersistedCommunityContext = {
      ...context,
      recentCommunityIds: context.recentCommunityIds.slice(0, RECENT_LIMIT),
      savedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(KEYS.CONTEXT, JSON.stringify(payload));
  } catch {
    // A failed write means the app reopens unscoped. Not worth surfacing.
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PREFERENCES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Reads the display and privacy preferences.
 *
 * Merged over `defaultCommunityPreferences()`, which is off-by-default for every
 * visibility flag. A partial or older record therefore cannot *enable* a
 * disclosure by omission — a missing `showPrimaryCommunityOnProfile` reads as
 * false, which is the safe answer and the one §41 requires.
 */
export async function readCommunityPreferences(): Promise<CommunityPreferences> {
  try {
    const stored = safeParse<Partial<CommunityPreferences>>(
      await AsyncStorage.getItem(KEYS.PREFERENCES)
    );
    return { ...defaultCommunityPreferences(), ...(stored ?? {}) };
  } catch {
    return defaultCommunityPreferences();
  }
}

export async function writeCommunityPreferences(preferences: CommunityPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.PREFERENCES, JSON.stringify(preferences));
  } catch {
    // Ignored. The server copy is authoritative once GAP-021 lands.
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// METADATA CACHE
// ═════════════════════════════════════════════════════════════════════════════

export async function readCommunityMetadata(): Promise<PersistedCommunityMetadata[]> {
  try {
    const stored = safeParse<PersistedCommunityMetadata[]>(
      await AsyncStorage.getItem(KEYS.METADATA)
    );
    if (!Array.isArray(stored)) return [];

    const allowDev = areMultiCommunityGapsEnabled();
    return stored
      .filter((entry) => entry && typeof entry.id === 'string')
      .filter((entry) => allowDev || !isDevelopmentCommunityId(entry.id))
      .slice(0, METADATA_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Merges communities into the metadata cache, newest first, bounded.
 *
 * Called from the repository when a directory or profile read succeeds, so the
 * cache warms as a side effect of normal use rather than through a sync job.
 */
export async function mergeCommunityMetadata(
  communities: readonly (CommunityRef & { status?: CommunityStatus })[]
): Promise<void> {
  if (communities.length === 0) return;

  try {
    const existing = await readCommunityMetadata();
    const savedAt = new Date().toISOString();

    const merged = new Map<CommunityId, PersistedCommunityMetadata>();

    for (const community of communities) {
      merged.set(community.id, {
        id: community.id,
        slug: community.slug,
        name: community.name,
        type: community.type,
        origin: community.origin,
        identity: community.identity,
        status: community.status ?? 'Active',
        savedAt,
      });
    }

    for (const entry of existing) {
      if (!merged.has(entry.id)) merged.set(entry.id, entry);
    }

    await AsyncStorage.setItem(
      KEYS.METADATA,
      JSON.stringify([...merged.values()].slice(0, METADATA_LIMIT))
    );
  } catch {
    // Ignored. The cache is an optimisation, never a source of truth.
  }
}

/**
 * Clears everything this module owns.
 *
 * Called on sign-out. The active community, the recents and the preferences all
 * describe the person who was signed in, and leaving them for the next member on
 * a shared device would show them somebody else's community selection — the same
 * reasoning `store/auth.ts` already applies to idempotency keys.
 */
export async function clearCommunityPersistence(): Promise<void> {
  try {
    await Promise.all(Object.values(KEYS).map((key) => AsyncStorage.removeItem(key)));
  } catch {
    // Ignored. A failure here must not block signing out.
  }
}
