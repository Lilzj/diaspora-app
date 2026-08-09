// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — remote calendar providers (Frontend Phase 16, §6 · §68)
//
// Two implementations of `CalendarProvider` for a calendar that lives on
// somebody else's server:
//
//   `remoteCalendarProvider(provider)` — talks to the proxied routes in
//   `integrations-gap-api.ts`. Reachable only in a development or internal-test
//   build, and it says so: its descriptor's mode is `DEVELOPMENT_PROVIDER`, so
//   every surface that renders it renders the simulation marker (§69).
//
//   `unavailableCalendarProvider(provider, gapId)` — the production answer.
//   Fails cleanly in the §32 vocabulary rather than hanging on a promise
//   nobody will resolve.
//
// ── Why the refusing provider exists at all ──────────────────────────────────
//
// Phase 8 established this and the reasoning is unchanged: without an
// always-present implementation that fails properly, every call site would have
// to check a flag before calling, and the first one that forgot would throw
// inside a render. With it, the answer is a typed `IntegrationError`, the
// screen renders its "not available yet" state, and "fall back gracefully, do
// not crash" holds by construction.
//
// ── The one thing a remote calendar cannot do ────────────────────────────────
//
// `usesDevicePermission` is false and `requestPermission()` throws
// `UnsupportedCapability` rather than returning a permission snapshot. That is
// deliberate: an OAuth scope refusal and an OS permission denial need different
// recoveries — "authorize again" versus "open Settings" — and a remote provider
// that quietly returned a plausible-looking permission state would let a screen
// offer the wrong one. §9 warns specifically against assuming Apple Calendar
// has Google's architecture; this is the same warning pointed the other way.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CalendarEventDraft,
  CalendarEventRef,
  CalendarRef,
  IntegrationCapability,
  IntegrationProviderId,
} from '@/types/integrations';
import { INTEGRATION_GAPS } from '@/config/integration-gaps';
import * as gapApi from '@/lib/integrations-gap-api';
import { backendGapError, integrationError } from '../errors';
import type { CalendarProvider, PermissionSnapshot } from './types';

const REMOTE_CAPABILITIES: readonly IntegrationCapability[] = [
  'calendar.list',
  'calendar.event.create',
  'calendar.event.update',
  'calendar.event.delete',
  'calendar.sync.oneWay',
] as const;

/** The label a member sees. Vendor names are fine here — this is their Google account. */
const LABELS: Partial<Record<IntegrationProviderId, string>> = {
  'calendar.google': 'Google Calendar',
  'calendar.apple': 'Apple Calendar (iCloud)',
};

function labelFor(provider: IntegrationProviderId): string {
  return LABELS[provider] ?? 'Calendar';
}

/**
 * A remote calendar backed by the development adapter.
 *
 * Every method delegates to `integrations-gap-api.ts`, which calls
 * `assertEnabled()` first — so in a release build every one of these rejects
 * with the gap error before a request is made. The guarantee does not depend on
 * this file remembering to check.
 */
export function remoteCalendarProvider(provider: IntegrationProviderId): CalendarProvider {
  return {
    descriptor: {
      id: provider,
      label: labelFor(provider),
      mode: 'DEVELOPMENT_PROVIDER',
      gapId: INTEGRATION_GAPS.googleCalendarList.id,
    },
    capabilities: REMOTE_CAPABILITIES,
    usesDevicePermission: false,

    async getPermission(): Promise<PermissionSnapshot> {
      // A remote calendar has no device permission. Reporting `granted` would
      // be a lie a screen could act on; reporting `unavailable` with
      // `requiresSettings: false` is the accurate answer and steers the UI to
      // the OAuth recovery instead of the Settings one.
      return { state: 'unavailable', requiresSettings: false, canAskAgain: false };
    },

    async requestPermission(): Promise<PermissionSnapshot> {
      throw integrationError('UnsupportedCapability', {
        provider,
        message: 'This calendar is connected by signing in, not by a device permission.',
      });
    },

    async openSettings(): Promise<void> {
      throw integrationError('UnsupportedCapability', { provider });
    },

    listCalendars(): Promise<CalendarRef[]> {
      return gapApi.fetchRemoteCalendars(provider);
    },

    createEvent(calendarId: string, draft: CalendarEventDraft): Promise<CalendarEventRef> {
      return gapApi.createRemoteCalendarEvent(provider, calendarId, draft);
    },

    updateEvent(ref: CalendarEventRef, draft: CalendarEventDraft): Promise<CalendarEventRef> {
      return gapApi.updateRemoteCalendarEvent(provider, ref.externalEventId, ref.calendarId, draft);
    },

    async deleteEvent(ref: CalendarEventRef): Promise<void> {
      await gapApi.deleteRemoteCalendarEvent(provider, ref.externalEventId);
    },

    async findExported(sourceId: string, calendarId: string): Promise<CalendarEventRef | null> {
      try {
        return await gapApi.findRemoteExportedEvent(provider, sourceId, calendarId);
      } catch {
        // "I do not know" rather than "no". §8's conflict behaviour degrades to
        // duplicate on null, which is the safe direction — skipping on an
        // unknown silently drops an event the member asked for.
        return null;
      }
    },
  };
}

/**
 * The production answer for a calendar with no backend.
 *
 * Every method rejects with the same named gap, so a screenshot of any failure
 * state carries the ticket number. `findExported` is the one exception: it
 * returns null rather than throwing, because it is a *question*, and the honest
 * answer to "have I exported this?" from a provider that cannot export is "I do
 * not know" — a rejection here would surface as an error on a screen that is
 * merely deciding which button to show.
 */
export function unavailableCalendarProvider(
  provider: IntegrationProviderId,
  gapKey: keyof typeof INTEGRATION_GAPS
): CalendarProvider {
  const gap = INTEGRATION_GAPS[gapKey];
  const refuse = (): never => {
    throw backendGapError(gap.id, gap.capability, provider);
  };

  return {
    descriptor: {
      id: provider,
      label: labelFor(provider),
      mode: 'BACKEND_GAP',
      gapId: gap.id,
    },
    capabilities: [],
    usesDevicePermission: false,

    async getPermission(): Promise<PermissionSnapshot> {
      return { state: 'unavailable', requiresSettings: false, canAskAgain: false };
    },
    async requestPermission(): Promise<PermissionSnapshot> {
      return refuse();
    },
    async openSettings(): Promise<void> {
      return refuse();
    },
    async listCalendars(): Promise<CalendarRef[]> {
      return refuse();
    },
    async createEvent(): Promise<CalendarEventRef> {
      return refuse();
    },
    async updateEvent(): Promise<CalendarEventRef> {
      return refuse();
    },
    async deleteEvent(): Promise<void> {
      return refuse();
    },
    async findExported(): Promise<CalendarEventRef | null> {
      return null;
    },
  };
}
