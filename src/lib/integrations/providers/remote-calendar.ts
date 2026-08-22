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
// Remediation Wave C-05. The calendar proxy is real — five routes under
// `/api/v1/integrations/calendar` — so this provider calls the certified client
// rather than `integrations-gap-api.ts`.
//
// What has *not* changed is the honest outcome on a stock deployment.
// `NotConfiguredCalendarProvider` is what a backend with no vendor contract
// registers, so every call below answers `integrations.provider.not-configured`
// → 400 → `ConfigurationMissing`. That is a better failure than the gap error
// it replaces: it is the deployment's own answer, it distinguishes "this
// platform has no adapter" from "this build cannot ask", and it changes to a
// success the day an operator contracts one without this file changing.
import * as integrationsApi from '@/lib/integrations/certified-client';
import { acquireIdempotencyKey, releaseIdempotencyKey } from '@/lib/idempotency';
import { backendGapError, integrationError } from '../errors';
import type { CalendarProvider, PermissionSnapshot } from './types';

/**
 * The idempotency scope for one exported entry.
 *
 * `(sourceId, calendarId)` is the pair the register named and the pair the
 * server deduplicates on, so the key must be stable across a retry of the same
 * export and different for a different calendar — exporting one event to two
 * calendars is two entries, not a duplicate.
 */
function exportScope(sourceId: string, calendarId: string): { operation: string; subject: string; discriminator: string } {
  return { operation: 'calendar.export', subject: sourceId, discriminator: calendarId };
}

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
 * A remote calendar backed by the platform's own proxy.
 *
 * Every method delegates to `integrations/certified-client.ts`, which calls
 * `/api/v1/integrations/calendar/*`. The proxy exists for the reason the
 * backend states in one sentence: "a device that could list calendars directly
 * would be a device holding a Google access token."
 */
export function remoteCalendarProvider(provider: IntegrationProviderId): CalendarProvider {
  return {
    descriptor: {
      id: provider,
      label: labelFor(provider),
      // `BACKEND_CONNECTED`, and it is a claim about the *route* rather than
      // about the grant: this provider now talks to a certified contract. Whether
      // the deployment can serve it is a separate question, answered by
      // `GET /integrations/capabilities` and rendered from there — the two are
      // deliberately not conflated, because "the platform has no such feature"
      // and "this deployment has not configured it" are different sentences with
      // different owners.
      mode: 'BACKEND_CONNECTED',
      // Omitted rather than nulled: `ProviderDescriptor.gapId` is
      // `string | undefined`, and there is no gap to name any more.
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
      return integrationsApi.fetchRemoteCalendars(provider);
    },

    /**
     * Writes an entry.
     *
     * **The `Idempotency-Key` header is mandatory on this route** — a blank one
     * is a 400 before a provider is called — and the key is acquired from the
     * platform's existing store rather than minted here, so a retry after a
     * timeout presents the same key and the server returns the recorded outcome
     * instead of writing a second entry into somebody's calendar.
     *
     * Released only on success. A failure leaves the key in place, which is the
     * whole point: the *next* attempt is the retry the key exists to make safe.
     */
    async createEvent(calendarId: string, draft: CalendarEventDraft): Promise<CalendarEventRef> {
      const scope = exportScope(draft.sourceId, calendarId);
      const key = await acquireIdempotencyKey(scope);

      const written = await integrationsApi.createRemoteCalendarEvent(
        provider,
        calendarId,
        draft,
        key
      );

      await releaseIdempotencyKey(scope);
      return written;
    },

    async updateEvent(ref: CalendarEventRef, draft: CalendarEventDraft): Promise<CalendarEventRef> {
      // A replacement is scoped to the external entry rather than to the source,
      // so an edit does not reuse the key that created it — the server would
      // answer with the *creation's* recorded outcome and the edit would appear
      // to have succeeded without changing anything.
      const scope = exportScope(ref.externalEventId, ref.calendarId);
      const key = await acquireIdempotencyKey(scope);

      const written = await integrationsApi.updateRemoteCalendarEvent(
        provider,
        ref.externalEventId,
        ref.calendarId,
        draft,
        key
      );

      await releaseIdempotencyKey(scope);
      return written;
    },

    async deleteEvent(ref: CalendarEventRef): Promise<void> {
      // No key. The route is idempotent by construction — a link already
      // removed is a 200, and an external id this platform never recorded
      // writing is also a 200 that does nothing — so a retry is already safe
      // and a key would only add a way to get it wrong.
      await integrationsApi.deleteRemoteCalendarEvent(provider, ref.externalEventId, ref.calendarId);
    },

    async findExported(sourceId: string, calendarId: string): Promise<CalendarEventRef | null> {
      try {
        return await integrationsApi.findRemoteExportedEvent(provider, sourceId, calendarId);
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
