// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Country Intelligence client (Remediation Wave D-5)
//
// `/api/v1/intelligence` is the **third** URL space served by
// `Diaspora.Modules.Guides`, mapped by `IntelligenceEndpointContributor`. It
// carries official notices, the embassy directory, visa advisories, emergency
// numbers, the public-holiday calendar and the one-call country dashboard.
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// **Nothing.** The wave's brief said embassies and visa advisories "render from
// fixtures". They did not: there was no embassy screen, no visa screen and no
// fixture for either. `grep -rn "embass" src` before this wave found a single
// word inside an unrelated marketing paragraph. This is the first consumer the
// surface has ever had, which is why the reads below are complete and the
// editorial writes are not offered — see the end of this header.
//
// ── The six things worth knowing before calling anything here ───────────────
//
// **1. `locatedIn` and `serving` are different questions and neither defaults to
// the other.** "Missions in the United Kingdom" and "missions serving British
// nationals" are lists with almost no overlap. A single `country` parameter
// would have answered whichever the last caller had in mind, so the endpoint
// takes two and `fetchEmbassies` passes both through.
//
// **2. `appliesTo` widens rather than narrows.** A visa advisory naming no
// nationality applies to everybody, so filtering by nationality returns
// advisories naming it *and* advisories naming nobody. A client that
// post-filtered on `appliesToCountryCode === nationality` would throw away the
// universal rules and tell most members no rules exist for them — which is both
// wrong and the most dangerous kind of wrong this surface can be.
//
// **3. `GET /intelligence/search` does NOT return `items`.** It returns
// `OfficialNoticeSearchResponse`, a hand-rolled page whose rows are named
// **`results`**. `readPage` keys on `Array.isArray(payload.items)`, so passing
// it this response yields an **empty page with no error** — the exact failure
// that made every comment thread in this application render "no comments yet".
// `toNoticeSearchPage` is the explicit adapter and `searchOfficialNotices` uses
// it. Every other list here is `CursorPagedResult<T>` or a bare array, and
// `readPage` handles those.
//
// **4. `activeOnly` defaults differently per route, and the defaults are not
// cosmetic.** Visa advisories default `activeOnly` to **true** — a screen
// showing expired entry rules is a screen that gets somebody turned away at a
// border. Notices default it to **false**, because an editor's list has to show
// drafts. Neither default is restated here; both are the server's.
//
// **5. Severity is `Informational`, not `Info`.** The enum member is spelled out
// and `ToWire` is `ToString()`. `SEVERITY_ORDER` below mirrors the enum's
// ascending order, which is load-bearing on the server for ranking and digests.
//
// **6. Reading needs no account, anywhere.** Every route in this file is
// anonymous by design — "an emergency number in particular must be reachable by
// somebody who has never signed in and is not about to."
//
// ── What this file deliberately does not offer ──────────────────────────────
//
// **The editorial writes.** Creating an embassy, publishing a visa advisory,
// saving a country's emergency numbers, adding a holiday and the whole official
// -notice workflow all exist on the server and all sit behind
// `IntelligencePolicies.ManageDirectory`, `ManageVisas`, `ManageNotices`,
// `VerifyNotices`, `PublishNotices` or `ManageAuthorities` — **staff-only gates
// whose feature flags are hard-set to staff at `AccessTier.Limited`**. There is
// no member-facing screen for any of them and inventing one would be inventing
// an affordance no member can use. They are catalogued in the wave report rather
// than wrapped here.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { readPage, unwrapEnvelope, type Page } from './platform-envelope';
import type {
  CountryIntelligenceResponse,
  EmbassyDirectoryQuery,
  EmbassyResponse,
  EmergencyContactsResponse,
  IntelligenceCapabilitiesResponse,
  IssuingAuthorityResponse,
  NoticeCategoryResponse,
  NoticeSeverity,
  OfficialNoticeCardResponse,
  OfficialNoticeDetail,
  OfficialNoticeListQuery,
  OfficialNoticeSearchQuery,
  OfficialNoticeSearchResponse,
  PublicHolidayQuery,
  PublicHolidayResponse,
  VisaAdvisoryQuery,
  VisaAdvisoryResponse,
} from '@/types/country-intelligence';

const ROOT = '/intelligence';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

// ── Limits and vocabularies, as the server applies them ──────────────────────

/** `IntelligenceLimits.DefaultPageSize` / `MaxPageSize`. */
export const INTELLIGENCE_DEFAULT_PAGE_SIZE = 20;
export const INTELLIGENCE_MAX_PAGE_SIZE = 50;
export const INTELLIGENCE_MIN_PAGE_SIZE = 1;

/** `IntelligenceLimits.DashboardHolidayHorizonDays`. */
export const HOLIDAY_HORIZON_DAYS = 90;

/**
 * `NoticeSeverity` in the enum's own ascending order.
 *
 * The order is load-bearing on the server — ranking, dashboard leads and
 * digest truncation all compare these — so a client that sorts or thresholds on
 * severity must use this array rather than a re-derived one.
 */
export const SEVERITY_ORDER: readonly NoticeSeverity[] = [
  'Informational',
  'Low',
  'Medium',
  'High',
  'Critical',
] as const;

/** Whether a notice is urgent enough to lead a page. `High` and above, as the dashboard counts it. */
export function isUrgentSeverity(severity: NoticeSeverity): boolean {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf('High');
}

export function clampIntelligenceLimit(limit: number | null | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return INTELLIGENCE_DEFAULT_PAGE_SIZE;
  return Math.min(
    INTELLIGENCE_MAX_PAGE_SIZE,
    Math.max(INTELLIGENCE_MIN_PAGE_SIZE, Math.floor(limit))
  );
}

// ── Cache keys ───────────────────────────────────────────────────────────────

export const countryIntelligenceKeys = {
  all: ['country-intelligence'] as const,
  capabilities: () => ['country-intelligence', 'capabilities'] as const,

  country: (countryCode: string, locale?: string | null) =>
    ['country-intelligence', 'country', countryCode.toUpperCase(), locale ?? null] as const,

  embassies: (query: EmbassyDirectoryQuery = {}) =>
    ['country-intelligence', 'embassies', filterToken(query)] as const,
  embassy: (embassyId: string) => ['country-intelligence', 'embassy', embassyId] as const,

  visas: (countryCode: string, query: VisaAdvisoryQuery = {}) =>
    ['country-intelligence', 'visas', countryCode.toUpperCase(), filterToken(query)] as const,
  visa: (advisoryId: string) => ['country-intelligence', 'visa', advisoryId] as const,

  emergency: (countryCode: string, locale?: string | null) =>
    ['country-intelligence', 'emergency', countryCode.toUpperCase(), locale ?? null] as const,

  holidays: (countryCode: string, query: PublicHolidayQuery = {}) =>
    ['country-intelligence', 'holidays', countryCode.toUpperCase(), filterToken(query)] as const,

  notices: (query: OfficialNoticeListQuery = {}) =>
    ['country-intelligence', 'notices', filterToken(query)] as const,
  notice: (noticeId: string) => ['country-intelligence', 'notice', noticeId] as const,
  noticeSearch: (query: OfficialNoticeSearchQuery = {}) =>
    ['country-intelligence', 'notice-search', filterToken(query)] as const,

  categories: (locale?: string | null) =>
    ['country-intelligence', 'categories', locale ?? null] as const,
  authorities: (countryCode: string) =>
    ['country-intelligence', 'authorities', countryCode.toUpperCase()] as const,
};

/** `cursor` is excluded — an infinite query owns the page pointer. */
function filterToken(query: object): string {
  const entries = Object.entries(query)
    .filter(
      ([name, value]) =>
        name !== 'cursor' && value !== undefined && value !== null && value !== ''
    )
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
}

// ── Request plumbing ─────────────────────────────────────────────────────────

function params(source: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(source).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

async function get<T>(url: string, query?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get<Envelope<T>>(url, {
    params: query ? params(query) : undefined,
  });
  return response.data.data;
}

async function getPage<T>(url: string, query?: Record<string, unknown>): Promise<Page<T>> {
  const response = await apiClient.get(url, { params: query ? params(query) : undefined });
  return readPage<T>(response.data);
}

// ── The country dashboard ────────────────────────────────────────────────────

/**
 * `GET /intelligence/countries/{countryCode}` — anonymous.
 *
 * Ten bands in one response. `recordView` defaults to **true** on the server, so
 * simply opening a country page counts as a view; a background refresh that
 * should not count passes `recordView: false`.
 */
export function fetchCountryIntelligence(
  countryCode: string,
  options: { locale?: string; recordView?: boolean } = {}
): Promise<CountryIntelligenceResponse> {
  return get<CountryIntelligenceResponse>(`${ROOT}/countries/${segment(countryCode)}`, options);
}

/** `GET /intelligence/capabilities` — anonymous. Which engine is answering search, and more. */
export function fetchIntelligenceCapabilities(
  options: { locale?: string } = {}
): Promise<IntelligenceCapabilitiesResponse> {
  return get<IntelligenceCapabilitiesResponse>(`${ROOT}/capabilities`, options);
}

// ── Embassies ────────────────────────────────────────────────────────────────

/**
 * `GET /intelligence/embassies` — anonymous, `CursorPagedResult<EmbassyResponse>`.
 *
 * **Send `locatedIn` and `serving` deliberately.** They are different questions
 * and the server applies neither as a default for the other; sending only one is
 * asking only that one.
 */
export function fetchEmbassies(
  query: EmbassyDirectoryQuery = {}
): Promise<Page<EmbassyResponse>> {
  return getPage<EmbassyResponse>(`${ROOT}/embassies`, {
    ...query,
    limit: clampIntelligenceLimit(query.limit),
  });
}

/** `GET /intelligence/embassies/{embassyId}` — anonymous. */
export function fetchEmbassy(
  embassyId: string,
  options: { locale?: string } = {}
): Promise<EmbassyResponse> {
  return get<EmbassyResponse>(`${ROOT}/embassies/${segment(embassyId)}`, options);
}

// ── Visa advisories ──────────────────────────────────────────────────────────

/**
 * `GET /intelligence/countries/{countryCode}/visas` — anonymous.
 *
 * `appliesTo` **widens**: the server matches advisories naming that nationality
 * *and* those naming nobody. Do not post-filter the result on
 * `appliesToCountryCode === nationality` — that discards the universal rules.
 *
 * `activeOnly` is **true** by the server's default, which is the right default
 * for a member: expired entry rules are the ones that get somebody turned away.
 */
export function fetchVisaAdvisories(
  countryCode: string,
  query: VisaAdvisoryQuery = {}
): Promise<Page<VisaAdvisoryResponse>> {
  return getPage<VisaAdvisoryResponse>(`${ROOT}/countries/${segment(countryCode)}/visas`, {
    ...query,
    limit: clampIntelligenceLimit(query.limit),
  });
}

/** `GET /intelligence/visas/{advisoryId}` — anonymous. */
export function fetchVisaAdvisory(
  advisoryId: string,
  options: { locale?: string } = {}
): Promise<VisaAdvisoryResponse> {
  return get<VisaAdvisoryResponse>(`${ROOT}/visas/${segment(advisoryId)}`, options);
}

// ── Emergency ────────────────────────────────────────────────────────────────

/**
 * `GET /intelligence/countries/{countryCode}/emergency` — anonymous.
 *
 * The most important endpoint this module serves. It needs no other call to
 * render and its response is shaped to be cached offline, which is what a client
 * should do with it: the moment somebody needs this is the moment their
 * connection is least likely to be working.
 */
export function fetchEmergencyContacts(
  countryCode: string,
  options: { locale?: string; recordView?: boolean } = {}
): Promise<EmergencyContactsResponse> {
  return get<EmergencyContactsResponse>(
    `${ROOT}/countries/${segment(countryCode)}/emergency`,
    options
  );
}

// ── Holidays ─────────────────────────────────────────────────────────────────

/**
 * `GET /intelligence/countries/{countryCode}/holidays` — anonymous.
 *
 * A **bare array**, with no cursor at all: a country has ten to thirty holidays
 * in a year and both real queries return a set small enough to hand over whole.
 * A range wins over a year when both are given.
 */
export function fetchPublicHolidays(
  countryCode: string,
  query: PublicHolidayQuery = {}
): Promise<Page<PublicHolidayResponse>> {
  return getPage<PublicHolidayResponse>(`${ROOT}/countries/${segment(countryCode)}/holidays`, {
    ...query,
  });
}

// ── Notices ──────────────────────────────────────────────────────────────────

/** `GET /intelligence/notices` — anonymous. `CursorPagedResult`, so `items`. */
export function fetchOfficialNotices(
  query: OfficialNoticeListQuery = {}
): Promise<Page<OfficialNoticeCardResponse>> {
  return getPage<OfficialNoticeCardResponse>(`${ROOT}/notices`, {
    ...query,
    limit: clampIntelligenceLimit(query.limit),
  });
}

/** `GET /intelligence/notices/{noticeId}` — anonymous. Carries the full body. */
export function fetchOfficialNotice(
  noticeId: string,
  options: { locale?: string } = {}
): Promise<OfficialNoticeDetail> {
  return get<OfficialNoticeDetail>(`${ROOT}/notices/${segment(noticeId)}`, options);
}

/**
 * Turns `OfficialNoticeSearchResponse` into a `Page`.
 *
 * **The reason this function exists rather than a `readPage` call.** The search
 * response is hand-rolled and names its rows `results`; `readPage` looks for
 * `items`, finds an object that is not a page, and falls through to its
 * "anything else" branch — an **empty page, no error, no warning**. A screen
 * built on that renders "no official notices" over a full result set, which is
 * indistinguishable from a country that has none.
 *
 * `engine` and `query` are dropped here deliberately: `Page<T>` has nowhere for
 * them, and a caller that wants the diagnostic engine name should call
 * `searchOfficialNoticesRaw`.
 */
export function toNoticeSearchPage(
  response: OfficialNoticeSearchResponse | null | undefined
): Page<OfficialNoticeCardResponse> {
  if (!response || !Array.isArray(response.results)) {
    // A genuinely unreadable payload, not an adapted one: nobody has established
    // that this is a page, so it must not claim to be. `unrecognised` is what
    // distinguishes "the search returned nothing" from "the search returned
    // something this adapter could not read", which is the distinction whose
    // absence let this defect live in `toPage` for two waves.
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
      totalCount: null,
      page: null,
      pageSize: null,
      shape: 'unrecognised',
    };
  }

  return {
    items: response.results,
    nextCursor: typeof response.nextCursor === 'string' ? response.nextCursor : null,
    hasMore: response.hasMore === true,
    // `int?` on the server and frequently null. Not promoted from `results.length`.
    totalCount: typeof response.totalCount === 'number' ? response.totalCount : null,
    page: null,
    pageSize: null,
    // A person read `OfficialNoticeSearchResponse` and mapped `results` on
    // purpose. That is exactly what `adapted` records.
    shape: 'adapted',
  };
}

/**
 * `GET /intelligence/search` — anonymous, and the whole response.
 *
 * Use this where the engine name or the normalized query matters — an empty
 * state that echoes what was actually searched for, or a support answer to "why
 * did search behave differently in production".
 *
 * **An unavailable engine answers 503 `intelligence.search.unavailable`, never
 * an empty page.** That is stated on the endpoint itself, and it is what makes
 * "no results" trustworthy here.
 */
export async function searchOfficialNoticesRaw(
  query: OfficialNoticeSearchQuery = {}
): Promise<OfficialNoticeSearchResponse> {
  const response = await apiClient.get(`${ROOT}/search`, {
    params: params({ ...query, limit: clampIntelligenceLimit(query.limit) }),
  });
  return unwrapEnvelope<OfficialNoticeSearchResponse>(response.data) as OfficialNoticeSearchResponse;
}

/** The same call, normalised to a `Page` through `toNoticeSearchPage`. */
export async function searchOfficialNotices(
  query: OfficialNoticeSearchQuery = {}
): Promise<Page<OfficialNoticeCardResponse>> {
  return toNoticeSearchPage(await searchOfficialNoticesRaw(query));
}

// ── Catalogue ────────────────────────────────────────────────────────────────

/** `GET /intelligence/categories` — anonymous. A bare array. */
export function fetchNoticeCategories(
  options: { locale?: string; includeArchived?: boolean } = {}
): Promise<Page<NoticeCategoryResponse>> {
  return getPage<NoticeCategoryResponse>(`${ROOT}/categories`, options);
}

/** `GET /intelligence/countries/{countryCode}/authorities` — anonymous. A bare array. */
export function fetchIssuingAuthorities(
  countryCode: string,
  options: { verifiedOnly?: boolean; locale?: string } = {}
): Promise<Page<IssuingAuthorityResponse>> {
  return getPage<IssuingAuthorityResponse>(
    `${ROOT}/countries/${segment(countryCode)}/authorities`,
    options
  );
}

// ── Errors ───────────────────────────────────────────────────────────────────

function problemCode(cause: unknown): string | null {
  const code = (cause as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

function httpStatus(cause: unknown): number | null {
  const value = (cause as { response?: { status?: number } })?.response?.status;
  return typeof value === 'number' ? value : null;
}

/**
 * Whether the search engine could not answer.
 *
 * **503, not an empty page** — the endpoint promises that explicitly. A screen
 * must render this as "search is unavailable" rather than as "nothing found",
 * because on this surface those two are very different statements.
 */
export function isNoticeSearchUnavailable(cause: unknown): boolean {
  return (
    httpStatus(cause) === 503 || problemCode(cause) === 'intelligence.search.unavailable'
  );
}

/**
 * Whether a country simply has no emergency directory yet.
 *
 * Distinct from a transport failure, and the distinction matters more here than
 * anywhere else in the app: "we have not recorded numbers for this country" and
 * "we cannot reach the server" need very different words in front of somebody
 * who is looking for an ambulance.
 */
export function isEmergencyDirectoryMissing(cause: unknown): boolean {
  return problemCode(cause) === 'intelligence.emergency.not-found' || httpStatus(cause) === 404;
}

/** A sentence a member can act on. */
export function intelligenceErrorMessage(cause: unknown): string {
  const code = problemCode(cause);

  if (isNoticeSearchUnavailable(cause)) {
    return 'Official notice search is unavailable just now. Browsing by country still works.';
  }
  if (code === 'intelligence.embassy.not-found') {
    return 'That mission is not in the directory.';
  }
  if (code === 'intelligence.visa.not-found') {
    return 'That advisory is no longer available.';
  }
  if (code === 'intelligence.emergency.not-found') {
    return 'We have not recorded emergency numbers for this country yet.';
  }
  if (code === 'intelligence.country.invalid') {
    return 'That is not a country code we recognise.';
  }

  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) return detail;

  return 'We could not reach the country information service just now.';
}
