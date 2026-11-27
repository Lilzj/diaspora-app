// ─────────────────────────────────────────────────────────────────────────────
// Wizard drafts kept on this phone
//
// Added 14 Oct 2026. The business, home and marketplace wizards kept their
// draft in a module variable: "Save & Exit" saved nothing that outlived the
// app, and Creator Studio's Draft Center could not see it. The draft is now
// written to the phone's storage on every change, restored when the wizard
// opens, and listed in the Draft Center with a way back in.
//
// On this phone only. The server stores a business, home or listing only once
// it is created; a half-filled form is not something it holds.
//
// ── One draft hook, 27 Nov 2026 (FARCH-007) ─────────────────────────────────
//
// The business, home and marketplace wizards each held their draft in a module
// variable typed `any`, with the same banner, the same load on opening and the
// same restore and discard, written three times. `useDeviceDraft` is that
// code once. The diaspora verification wizard kept its own draft in storage by
// hand; it uses the hook too, as a kind the Draft Center does not list, and the
// draft a member already had is moved across the first time it is read. The
// guide and alert wizards held theirs in a module variable too, for the session
// only; they use the hook as session kinds, and still never write to the phone.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

/** The wizards the Draft Center lists: things a member is making. */
type ListedDraftKind = 'provider' | 'housing' | 'marketplace';

/**
 * Every wizard that keeps a draft on the phone. `verification` is not listed in
 * the Draft Center: an application for verification is not something a member
 * publishes, and its way back in is the Trust Centre.
 */
export type DeviceDraftKind = ListedDraftKind | 'verification';

/**
 * Wizards whose draft lasts only while the app is open: held in memory and
 * never written to the phone. The guide and alert wizards kept theirs that way
 * before this hook, and still do; whether either should outlive the app is a
 * product decision, not one for a refactor.
 */
type SessionDraftKind = 'guide' | 'update';

/** Every wizard with a draft the server does not hold. */
export type DraftKind = DeviceDraftKind | SessionDraftKind;

/** Where each kind keeps its draft. A new kind has to say. */
const KEPT: Record<DraftKind, 'phone' | 'session'> = {
  provider: 'phone',
  housing: 'phone',
  marketplace: 'phone',
  verification: 'phone',
  guide: 'session',
  update: 'session',
};

function keptOnPhone(kind: DraftKind): kind is DeviceDraftKind {
  return KEPT[kind] === 'phone';
}

export interface DeviceDraftSummary {
  kind: ListedDraftKind;
  title: string;
  savedAt: string;
  /** The wizard that resumes it. */
  route: string;
  /** What kind of thing it is, in the member's words. */
  label: string;
}

const KEY_PREFIX = 'diaspora_wizard_draft_';

const META: Record<ListedDraftKind, { route: string; label: string; untitled: string }> = {
  provider: { route: '/(tabs)/post', label: 'Business', untitled: 'Untitled business' },
  housing: { route: '/housing/create', label: 'Home', untitled: 'Untitled home' },
  marketplace: { route: '/marketplace/create', label: 'Marketplace item', untitled: 'Untitled item' },
};

const KINDS = Object.keys(META) as ListedDraftKind[];

/**
 * Where a kind kept its draft before it came here. Read once if the new place
 * is empty, written to the new place, and removed, so a draft in progress is not
 * lost to the move. The verification wizard stored the draft itself, unwrapped.
 */
const LEGACY_KEYS: Partial<Record<DeviceDraftKind, string>> = {
  verification: 'diaspora_verification_draft',
};

/** The draft each wizard holds this session, so reopening it does not wait on storage. */
const held = new Map<DraftKind, unknown>();

export async function saveDeviceDraft(kind: DeviceDraftKind, data: unknown, title?: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY_PREFIX + kind,
      JSON.stringify({ title: title?.trim() || '', savedAt: new Date().toISOString(), data })
    );
  } catch {
    // Storage full or unavailable: the in-memory draft still stands for this session.
  }
}

export async function loadDeviceDraft<T = unknown>(kind: DeviceDraftKind): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + kind);
    if (raw) return (JSON.parse(raw) as { data: T }).data ?? null;

    const legacyKey = LEGACY_KEYS[kind];
    const legacy = legacyKey ? await AsyncStorage.getItem(legacyKey) : null;
    if (!legacyKey || !legacy) return null;

    const data = JSON.parse(legacy) as T;
    await saveDeviceDraft(kind, data);
    await AsyncStorage.removeItem(legacyKey);
    return data;
  } catch {
    return null;
  }
}

export async function clearDeviceDraft(kind: DeviceDraftKind): Promise<void> {
  // The session's copy too. Discarding a draft from the Draft Center used to leave
  // the wizard's own copy behind, so the wizard offered it again until the app
  // restarted.
  held.delete(kind);
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + kind);
    const legacyKey = LEGACY_KEYS[kind];
    if (legacyKey) await AsyncStorage.removeItem(legacyKey);
  } catch {
    // Nothing to do: a draft that could not be removed is offered again, not lost.
  }
}

export async function listDeviceDrafts(): Promise<DeviceDraftSummary[]> {
  const found: DeviceDraftSummary[] = [];
  for (const kind of KINDS) {
    try {
      const raw = await AsyncStorage.getItem(KEY_PREFIX + kind);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { title?: string; savedAt?: string };
      found.push({
        kind,
        title: parsed.title || META[kind].untitled,
        savedAt: parsed.savedAt ?? '',
        route: META[kind].route,
        label: META[kind].label,
      });
    } catch {
      // An unreadable entry is skipped rather than breaking the list.
    }
  }
  return found.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** The drafts on this phone, re-read each time the screen comes into view. */
export function useDeviceDrafts(): { drafts: DeviceDraftSummary[]; discard: (kind: ListedDraftKind) => void } {
  const [drafts, setDrafts] = useState<DeviceDraftSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listDeviceDrafts().then((list) => {
        if (active) setDrafts(list);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  const discard = useCallback((kind: ListedDraftKind) => {
    void clearDeviceDraft(kind);
    setDrafts((current) => current.filter((draft) => draft.kind !== kind));
  }, []);

  return { drafts, discard };
}

export interface DeviceDraft<T> {
  /** A draft is waiting to be restored or discarded. */
  bannerVisible: boolean;
  /** Keep the form as it stands: for this session, and on the phone. */
  save: (data: T, title?: string) => void;
  /**
   * The held draft, and the banner hidden. Null when there is none: discarded from
   * the Draft Center while the wizard stood open, say, when a banner left up would
   * offer a Restore that did nothing.
   */
  restore: () => T | null;
  /** Throw the draft away. */
  discard: () => void;
  /** Forget the draft once the form it belongs to has been sent. */
  clear: () => void;
  /** Whether this session holds a draft, restored or not: every save makes one. */
  hasDraft: () => boolean;
}

/** Throw a draft away: this session's copy, and the phone's when it keeps one. */
function forget(kind: DraftKind): void {
  if (keptOnPhone(kind)) void clearDeviceDraft(kind);
  else held.delete(kind);
}

/**
 * One wizard's draft. The banner shows when a draft is held this session or kept
 * on the phone; restoring hands the draft back for the wizard to fill its fields
 * from, and the wizard saves on every change it cares about. A session kind is
 * never read from or written to the phone.
 */
export function useDeviceDraft<T>(kind: DraftKind): DeviceDraft<T> {
  // Known on the first render when this session already holds one, so the banner
  // does not wait for an effect to appear.
  const [bannerVisible, setBannerVisible] = useState(() => held.has(kind));

  useEffect(() => {
    if (!keptOnPhone(kind) || held.has(kind)) return;
    let active = true;
    void loadDeviceDraft<T>(kind).then((saved) => {
      if (!saved || held.has(kind)) return;
      // Held even if the wizard has closed meanwhile, so reopening it offers the
      // draft at once; only the banner of a closed wizard is left alone.
      held.set(kind, saved);
      if (active) setBannerVisible(true);
    });
    return () => {
      active = false;
    };
  }, [kind]);

  const save = useCallback(
    (data: T, title?: string) => {
      held.set(kind, data);
      if (keptOnPhone(kind)) void saveDeviceDraft(kind, data, title);
    },
    [kind]
  );

  const restore = useCallback((): T | null => {
    setBannerVisible(false);
    return (held.get(kind) as T | undefined) ?? null;
  }, [kind]);

  const discard = useCallback(() => {
    forget(kind);
    setBannerVisible(false);
  }, [kind]);

  const clear = useCallback(() => {
    forget(kind);
  }, [kind]);

  const hasDraft = useCallback(() => held.has(kind), [kind]);

  return { bannerVisible, save, restore, discard, clear, hasDraft };
}
