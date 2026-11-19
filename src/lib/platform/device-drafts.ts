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
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

export type DeviceDraftKind = 'provider' | 'housing' | 'marketplace';

export interface DeviceDraftSummary {
  kind: DeviceDraftKind;
  title: string;
  savedAt: string;
  /** The wizard that resumes it. */
  route: string;
  /** What kind of thing it is, in the member's words. */
  label: string;
}

const KEY_PREFIX = 'diaspora_wizard_draft_';

const META: Record<DeviceDraftKind, { route: string; label: string; untitled: string }> = {
  provider: { route: '/(tabs)/post', label: 'Business', untitled: 'Untitled business' },
  housing: { route: '/housing/create', label: 'Home', untitled: 'Untitled home' },
  marketplace: { route: '/marketplace/create', label: 'Marketplace item', untitled: 'Untitled item' },
};

const KINDS = Object.keys(META) as DeviceDraftKind[];

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
    return raw ? ((JSON.parse(raw) as { data: T }).data ?? null) : null;
  } catch {
    return null;
  }
}

export async function clearDeviceDraft(kind: DeviceDraftKind): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + kind);
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
export function useDeviceDrafts(): { drafts: DeviceDraftSummary[]; discard: (kind: DeviceDraftKind) => void } {
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

  const discard = useCallback((kind: DeviceDraftKind) => {
    void clearDeviceDraft(kind);
    setDrafts((current) => current.filter((draft) => draft.kind !== kind));
  }, []);

  return { drafts, discard };
}
