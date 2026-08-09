// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — government information providers (Frontend Phase 16, §19 · §20 · §60)
//
// Two implementations of `GovernmentProvider`, and a hard rule that shapes
// both: **nothing here fabricates a government source.**
//
// §19 says "do not fabricate government integrations" and "do not label
// unofficial information as government information". Those are the easiest
// instructions in the brief to violate accidentally, because a plausible
// simulated advisory is indistinguishable from a real one on screen — and a
// wrong visa advisory is not a cosmetic bug. Somebody could miss a flight, or a
// deadline, because of it.
//
// So the development adapter is constrained in three ways the other adapters in
// this phase are not:
//
//   1. **Every simulated item's `source.kind` is `curated`, never `official`.**
//      There is no code path in this file that produces `kind: 'official'`. A
//      real official feed can only come from the certified backend, which does
//      not have one yet (FRONTEND-PHASE16-GAP-011).
//
//   2. **Every simulated item's authority names Diaspora's development
//      environment**, not a real ministry. There is no fixture containing the
//      words "Home Office" or "Ministry of Foreign Affairs" attributed as a
//      publisher.
//
//   3. **Every simulated item is `verification: 'unverified'`.** The badge a
//      member sees says so.
//
// The result is that a development build shows the *shape* of the surface —
// layout, sourcing, staleness, country-awareness, empty and error states — and
// tells the truth about every item on it. Somebody screenshotting it cannot
// accidentally publish a fake government advisory.
//
// ── Country-awareness is structural, not a filter ────────────────────────────
//
// §60 forbids showing one country's information to somebody browsing another.
// `listNotices` takes a required `countryCode` and there is no "all countries"
// call to accidentally render — the same technique the gap API uses by putting
// the country in the path rather than the query string.
// ─────────────────────────────────────────────────────────────────────────────

import { getIntegrationConfig } from '@/config/integration-config';
import { INTEGRATION_GAPS } from '@/config/integration-gaps';
import * as gapApi from '@/lib/integrations-gap-api';
import { backendGapError, integrationError } from '../errors';
import type { GovernmentNotice } from '@/types/integrations';
import type { GovernmentProvider } from './types';

/**
 * The adapter, backed by the simulated proxy.
 *
 * Delegates to `integrations-gap-api.ts`, which calls `assertEnabled()` — so in
 * a release build every method rejects before a request is made.
 *
 * The `kind` downgrade below is the load-bearing line in this file. Even though
 * the mock handler is written to return `curated`, this provider re-asserts it
 * on the way out: a fixture edited later, or a handler that gained an
 * `official` branch, would otherwise silently start attributing content to a
 * government. Enforcing it at the boundary means the guarantee survives changes
 * to the data.
 */
export const adapterGovernmentProvider: GovernmentProvider = {
  descriptor: {
    id: 'government.curated',
    label: 'Country information',
    mode: 'DEVELOPMENT_PROVIDER',
    gapId: INTEGRATION_GAPS.governmentNotices.id,
  },

  async supportedCountries(): Promise<string[]> {
    const sources = await gapApi.fetchGovernmentSources();
    return sources.map((source) => source.countryCode);
  },

  async listNotices(countryCode, options = {}): Promise<GovernmentNotice[]> {
    const notices = await gapApi.fetchGovernmentNotices(countryCode, options);

    return notices.map((notice) => ({
      ...notice,
      source: {
        ...notice.source,
        // Never `official` from a simulated source. See the header.
        kind: notice.source.kind === 'official' ? 'curated' : notice.source.kind,
        verification: 'unverified',
        // A simulated item has no official URL to offer. Carrying one would
        // invite a member to click through to a page that does not correspond
        // to what they just read.
        officialUrl: null,
      },
    }));
  },
};

/**
 * The production answer.
 *
 * `supportedCountries` returns an empty array rather than throwing, and that
 * distinction matters: the connection centre asks "which countries do we cover"
 * before it asks for anything, and an empty answer renders "no country
 * information is available in this build" — a complete, honest state. Throwing
 * there would surface an error banner on a screen that is working correctly.
 *
 * `listNotices` throws, because by then the member has asked a specific
 * question and deserves a specific answer rather than an empty list that reads
 * as "there are no advisories for your country" — which is the opposite of the
 * truth and is the single most dangerous wrong answer this surface can give.
 */
export const unavailableGovernmentProvider: GovernmentProvider = {
  descriptor: {
    id: 'government.official',
    label: 'Country information',
    mode: 'BACKEND_GAP',
    gapId: INTEGRATION_GAPS.governmentNotices.id,
  },

  async supportedCountries(): Promise<string[]> {
    return [];
  },

  async listNotices(): Promise<GovernmentNotice[]> {
    throw backendGapError(
      INTEGRATION_GAPS.governmentNotices.id,
      'Official country information',
      'government.official'
    );
  },
};

/**
 * The certified provider, for the day the proxy exists.
 *
 * Written now and unreachable today — `getIntegrationConfig().governmentEnabled`
 * is false unless a deployment sets it — for the same reason `native-map.tsx`
 * was written before its module existed: it is the proof that the interface is
 * adequate for a real source, not just for a simulated one. It found one thing:
 * a real source needs `supportedCountries` to be a *server* answer, because
 * which countries have a live feed is a deployment fact the client cannot know.
 */
export const certifiedGovernmentProvider: GovernmentProvider = {
  descriptor: {
    id: 'government.official',
    label: 'Country information',
    mode: 'BACKEND_CONNECTED',
  },

  async supportedCountries(): Promise<string[]> {
    if (!getIntegrationConfig().governmentEnabled) return [];
    throw integrationError('ConfigurationMissing', {
      provider: 'government.official',
      message: 'Country information is not configured for this deployment.',
    });
  },

  async listNotices(): Promise<GovernmentNotice[]> {
    throw backendGapError(
      INTEGRATION_GAPS.governmentProxy.id,
      'Official country information',
      'government.official'
    );
  },
};
