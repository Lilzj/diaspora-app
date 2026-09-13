// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Metric key reconciliation (Frontend Phase 15)
//
// **Two vocabularies name the same fifteen numbers, and until this file existed
// nothing translated between them.**
//
// The backend's `AnalyticsMetricCatalog` carries both spellings on every row:
//
//     Key           "content_views"     — Phase 7's snake spelling
//     CatalogueKey  "content.views"     — Phase 15's dotted spelling
//
// and it publishes *different ones on different routes*. The Phase 15 dataset
// (`/analytics/content/{type}/{id}`, `/analytics/creators/me`) sends the dotted
// key. `/analytics/access` sends the **snake** key in `restrictedMetrics`,
// because that list is built from `AnalyticsMetricCatalog.CreatorHeadline`,
// which is a list of `Key` and not of `CatalogueKey`.
//
// ── The bug this closes, which was real and silent ───────────────────────────
//
// `canViewMetric` in `lib/analytics/access.ts` and `applyAccessRestrictions` in
// `hooks/analytics.ts` both test `access.restrictedMetrics.includes(metric.key)`
// where `metric.key` is a dotted `AnalyticsMetricKey`. The server's list is
// snake. `['content_views'].includes('content.views')` is `false`, for every
// metric, for ever — so metric restriction was **non-functional** rather than
// merely wrong: a caller the server had explicitly withheld every headline
// metric from would have been shown every one of them, had anything upstream
// produced them.
//
// The honest fix is to translate at the boundary rather than to widen a type.
// Widening `restrictedMetrics` to `string[]` would have made the compiler stop
// complaining and left the comparison exactly as broken.
//
// ── Why the map is static, and why it is not only static ─────────────────────
//
// The pairs below are transcribed from `AnalyticsMetricCatalog` in the backend
// repository, which is the one place both spellings are declared together. A
// static map is required rather than merely convenient: the access response is
// normalised the moment it arrives, which can be — and usually is — before any
// `/analytics/definitions` call has resolved. A translation that depended on a
// second request would be absent exactly when the first screen needs it.
//
// `learnCatalogueKeys` then lets the definitions arm fold in whatever pairs the
// deployment actually publishes, so a backend that adds a metric is translated
// correctly by the *next* client session rather than by the next release. It is
// additive only — a pair can be learned, never unlearned — for the same reason
// `registerAllowedProperties` is additive: a caller must not be able to widen or
// blank a security-adjacent table by clearing it.
//
// ── The one rule every entry obeys ───────────────────────────────────────────
//
// **A translation only succeeds into a key this build knows.** `catalogueKeyFor`
// checks `ANALYTICS_DEFINITIONS`, so a metric the server has and this client has
// never heard of resolves to `null` and is dropped, rather than becoming a
// restriction against a key nothing can match or a tile with no definition
// behind it. Dropping is the conservative direction for a *dataset* row; for a
// *restriction* it is the permissive one, which is why the drop is counted and
// reported rather than swallowed — see `translateRestrictedMetrics`.
// ─────────────────────────────────────────────────────────────────────────────

import type { AnalyticsMetricKey } from '@/types/analytics';
import { ANALYTICS_DEFINITIONS } from './definitions';

/**
 * The platform's own `Key` → `CatalogueKey` pairs.
 *
 * Fifteen, transcribed from `AnalyticsMetricCatalog`. Every value is checked
 * against `ANALYTICS_DEFINITIONS` at translation time rather than asserted here,
 * so a future edit that removes a definition degrades to a dropped metric rather
 * than to a runtime lookup of `undefined.label`.
 *
 * Two of the pairs are the ones most likely to be got wrong by hand, and both
 * are worth reading twice:
 *
 *   `follower_growth` → `growth.members.net`, **not** `reach.followers`. The
 *   platform serves `followers` as not-measured (it has no total from before it
 *   started watching) and `follower_growth` as the real net movement. Mapping
 *   the growth figure onto the total would put a small number under a label
 *   meaning a large one.
 *
 *   `profile_views` → `provider.profileViews`. The client's catalogue files
 *   profile views under the provider domain; the platform files the same metric
 *   under the creator's. One metric, two filing systems, and the dotted key is
 *   the one the tiles render.
 */
const PHASE7_TO_CATALOGUE: Record<string, AnalyticsMetricKey> = {
  content_views: 'content.views',
  unique_viewers: 'content.uniqueViewers',
  reach: 'content.reach',
  saves: 'content.saves',
  shares: 'content.shares',
  comments: 'content.comments',
  helpful_votes: 'content.helpfulVotes',
  engagement_rate: 'content.engagementRate',
  followers: 'reach.followers',
  follower_growth: 'growth.members.net',
  profile_views: 'provider.profileViews',
  conversion: 'conversion.count',
  content_published: 'content.published',
  revenue: 'revenue.gross',
  // Added 13 Sep 2026 with the enquiries tile. A listing's row in the content
  // table arrives with the snake key; without this pair the column is dropped.
  enquiries: 'content.enquiries',
};

/** Whether a string is a catalogue key this build can render. */
export function isCatalogueKey(key: string): key is AnalyticsMetricKey {
  return Object.prototype.hasOwnProperty.call(ANALYTICS_DEFINITIONS, key);
}

/**
 * The dotted catalogue key for a metric key in either spelling.
 *
 * Accepts a dotted key unchanged, so a caller normalising a mixed list — which
 * is what `restrictedMetrics` may become the day the backend fixes its own
 * key-space — does not need to know which spelling arrived.
 *
 * Returns `null` for anything this build cannot render. See the file header for
 * why that is the right answer rather than a passthrough.
 */
export function catalogueKeyFor(key: string): AnalyticsMetricKey | null {
  const trimmed = key.trim();
  if (trimmed.length === 0) return null;
  if (isCatalogueKey(trimmed)) return trimmed;

  const mapped = PHASE7_TO_CATALOGUE[trimmed];
  return mapped && isCatalogueKey(mapped) ? mapped : null;
}

/**
 * Folds the deployment's own pairs into the table.
 *
 * Called by the certified definitions arm with the `key`/`catalogueKey` columns
 * `GET /api/v1/analytics/definitions` serves. Additive only, and a pair whose
 * target this build does not know is ignored rather than stored — an unknown
 * target would only produce a `null` translation later, and storing it would
 * make the table lie about what it can do.
 */
export function learnCatalogueKeys(
  pairs: readonly { key: string; catalogueKey: string }[]
): void {
  for (const pair of pairs) {
    const source = pair.key?.trim();
    const target = pair.catalogueKey?.trim();
    if (!source || !target) continue;
    if (!isCatalogueKey(target)) continue;
    PHASE7_TO_CATALOGUE[source] = target;
  }
}

/**
 * Translates a server-published metric key list into catalogue keys.
 *
 * Reports what it could not translate rather than discarding it silently,
 * because the two lists this is used for want opposite treatment of an unknown
 * key and the caller is the one that knows which it is holding:
 *
 *   For `restrictedMetrics`, an untranslated key is a **withholding this client
 *   cannot honour**. It is safe today only because a metric this build cannot
 *   name is also a metric it cannot render — but that is a coincidence of two
 *   catalogues rather than a guarantee, so the count is surfaced in development.
 *
 *   For `unavailableMetrics` and served metrics, an untranslated key is a row
 *   the client would have no definition, label or format for, and dropping it is
 *   simply correct.
 */
export function translateMetricKeys(keys: readonly string[] | null | undefined): {
  keys: AnalyticsMetricKey[];
  untranslated: string[];
} {
  const translated: AnalyticsMetricKey[] = [];
  const untranslated: string[] = [];

  for (const raw of keys ?? []) {
    if (typeof raw !== 'string') continue;
    const mapped = catalogueKeyFor(raw);
    if (mapped === null) {
      untranslated.push(raw);
      continue;
    }
    // A server that sent the same metric under both spellings — which the
    // `/access` and dataset routes between them genuinely could — must not
    // produce a duplicated restriction.
    if (!translated.includes(mapped)) translated.push(mapped);
  }

  return { keys: translated, untranslated };
}
