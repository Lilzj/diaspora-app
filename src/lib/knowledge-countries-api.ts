// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Country Knowledge Directory client
//
// ✅ EVERY ROUTE IN THIS FILE IS REAL, and each one was read in
//    `Diaspora.Modules.Guides/Api/KnowledgeDiscoveryEndpoints.cs` before it was
//    written down here. The group prefix is `GuidesModuleMetadata
//    .KnowledgeRoutePrefix` = `/api/v1/knowledge`; the client's base URL already
//    carries `/api/v1`, so the paths below start `/knowledge/…` exactly as
//    `guides-api.ts` starts `/guides/…`.
//
// ── Why this file exists at all ──────────────────────────────────────────────
//
// The Knowledge Hub's country picker and its country cards were fed by
// `mocks/community-data.ts`'s `mockCountryStats` — a hand-written list of
// countries with hand-written provider counts, expert counts, landmark photos
// and "updates today" figures. None of those numbers were ever computed from
// anything. The platform *does* keep country knowledge figures, and it serves
// them from two routes that no frontend file had ever called:
//
//     GET /knowledge/countries                       → ListCountryDirectoriesQuery
//     GET /knowledge/countries/{countryCode}/statistics → GetKnowledgeStatisticsQuery
//
// So the fixture is not replaced by a nicer fixture. It is replaced by the
// figures the server actually holds, and the fields the server does not hold
// are simply not rendered any more.
//
// ── What the real contract does NOT carry, and must not be invented ──────────
//
// `CountryDirectorySummaryResponse` has **no flag, no landmark image, no
// provider count, no expert count and no "updates today"**. `mockCountryStats`
// had all five. A screen that wants a flag has to derive it from the ISO code
// (see `countryFlagEmoji`, which is a Unicode transformation of a real code and
// not a stored value); a screen that wants a provider count has to ask the
// providers module, because Knowledge genuinely does not know.
//
// ── Neither route is authorised ──────────────────────────────────────────────
//
// The endpoint class states the product argument: a knowledge base that demands
// an account before it will say what it holds cannot persuade anybody to make
// one. Visibility is still applied inside each handler, so an anonymous caller
// and a signed-in one both see published knowledge and nothing else. That means
// these two reads are safe to issue from a signed-out surface.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { readPage } from './platform-envelope';

const ROOT = '/knowledge';

/** The platform-wide success envelope: `{ data, meta }`. */
interface Envelope<T> {
  data: T;
}

/**
 * `CountryDirectorySummaryResponse` — one country on the "browse by country" grid.
 *
 * Field for field with
 * `Diaspora.Modules.Guides/Contracts/V1/Responses/CountryDirectorySummaryResponse.cs`.
 * Deliberately not the full directory: the backend's own comment explains that
 * a grid of a hundred and ninety-five countries each carrying their entries and
 * shelves would be thousands of rows to render a list of names.
 */
export interface KnowledgeCountrySummary {
  /** Upper-case ISO 3166-1 alpha-2. */
  countryCode: string;
  /** Already localized by the server for the requested `locale`. */
  displayName: string;
  summary: string | null;
  primaryLanguage: string | null;
  isPublished: boolean;
  /** Navigation rows this country lists. */
  categoryCount: number;
  /** Published guides for this country. */
  guideCount: number;
  /** Directory view count — the backend's suggested default ordering. */
  directoryViews: number;
}

/**
 * `KnowledgeStatisticsResponse` — one country's headline numbers.
 *
 * Field for field with
 * `Diaspora.Modules.Guides/Contracts/V1/Responses/KnowledgeStatisticsResponse.cs`.
 *
 * Two kinds of number in one response, deliberately: the first block counts the
 * knowledge, the second counts the use. The rates are **computed on the server
 * and are zero rather than undefined** when nothing has happened yet, so a
 * client never has to guard a division that already happened.
 *
 * `lastPublishedAt` is `DateTimeOffset?` and is null for a country nobody has
 * written about yet — which is not the same as "we could not read it".
 */
export interface KnowledgeStatistics {
  countryCode: string;

  // What exists.
  totalGuides: number;
  /** Verified by Trust. */
  verifiedGuides: number;
  /** Carrying an authority badge — narrower than verified. */
  officialGuides: number;
  /** Everything else: written by members, and most of the knowledge. */
  communityGuides: number;
  featuredGuides: number;
  categoryCount: number;
  learningPathCount: number;
  languages: string[];
  lastPublishedAt: string | null;

  // What people did with it. Aggregate totals, no reader identity behind them.
  directoryViews: number;
  categoryViews: number;
  /** Guides opened *from the directory*. Not a guide's own view count. */
  guideDiscoveries: number;
  searches: number;
  discoveryRate: number;
  clickThroughRate: number;
  pathCompletionRate: number;
}

/** Query keys. Namespaced `knowledge-countries`; collides with nothing. */
export const knowledgeCountryKeys = {
  all: ['knowledge-countries'] as const,
  list: (locale?: string) => ['knowledge-countries', 'list', locale ?? null] as const,
  statistics: (countryCode: string) =>
    ['knowledge-countries', 'statistics', countryCode.toUpperCase()] as const,
};

/**
 * `GET /knowledge/countries` — every country the platform holds knowledge for.
 *
 * **Deliberately unpaged by the server**: there are fewer than two hundred
 * countries and the query's own comment says a cursor over a list that short is
 * machinery nobody needs. It answers a bare `IReadOnlyList<T>` inside the
 * envelope, which is `readPage`'s `array` shape — used here rather than
 * `response.data.data` so a route that later grows a page does not turn this
 * into a crash on `.map`.
 *
 * `includeUnpublished` is **not** offered by this function. The backend honours
 * it only for a curator, and a reader-facing picker asking for it would be
 * asking to enumerate the launch schedule.
 */
export async function fetchKnowledgeCountries(
  options: { locale?: string; signal?: AbortSignal } = {}
): Promise<KnowledgeCountrySummary[]> {
  const response = await apiClient.get(`${ROOT}/countries`, {
    params: options.locale ? { locale: options.locale } : undefined,
    signal: options.signal,
  });

  return readPage<KnowledgeCountrySummary>(response.data).items;
}

/**
 * `GET /knowledge/countries/{countryCode}/statistics`.
 *
 * Answers for a country with **no curated directory** rather than failing — an
 * author files a guide against a country, not against a directory, so the guide
 * counts are real even where nobody has arranged a country page. A 400 comes
 * back only for a country code the server cannot normalize.
 */
export async function fetchKnowledgeStatistics(
  countryCode: string,
  options: { signal?: AbortSignal } = {}
): Promise<KnowledgeStatistics> {
  const response = await apiClient.get<Envelope<KnowledgeStatistics>>(
    `${ROOT}/countries/${encodeURIComponent(countryCode)}/statistics`,
    { signal: options.signal }
  );

  return response.data.data;
}

/**
 * A flag emoji derived from an ISO 3166-1 alpha-2 code.
 *
 * This is a **transformation of a real field**, not a stored one: the two
 * letters are mapped to their regional-indicator code points, which is how the
 * Unicode standard defines flag sequences. It is here rather than in a screen
 * because two screens need it and two copies would be two chances to disagree.
 *
 * Returns an empty string for anything that is not two ASCII letters, so a
 * malformed code renders as nothing rather than as mojibake.
 */
export function countryFlagEmoji(countryCode: string): string {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';

  return String.fromCodePoint(
    ...[...code].map((letter) => 0x1f1e6 + (letter.charCodeAt(0) - 65))
  );
}
