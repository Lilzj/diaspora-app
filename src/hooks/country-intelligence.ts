// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Country Intelligence hooks (Remediation Wave D-5)
//
// The stable interface over `lib/country-intelligence-api.ts`.
//
// ── Where an infinite query is honest ────────────────────────────────────────
//
// **Embassies, visa advisories and the notice list** are `CursorPagedResult<T>`
// and get `useInfiniteQuery`. **The holiday calendar, the notice categories and
// the issuing-authority directory are bare arrays with no cursor** and are plain
// queries — a `loadMore` on them would be a control with nothing behind it.
//
// **Notice search is cursor-paged but does not name its rows `items`.** It is
// wired through `searchOfficialNotices`, which applies `toNoticeSearchPage`; a
// hook that had used `readPage` would have returned an empty list for ever with
// no error at all.
//
// ── Why the emergency hook is different from every other hook in this app ────
//
// It retries where the others do not, and it keeps its data for a day rather
// than for minutes. Both are deliberate. The response is shaped to be cached
// offline because the moment somebody needs an ambulance number is the moment
// their connection is least likely to be working, and a hook that discarded the
// numbers it already had because they were four minutes stale would be doing the
// opposite of what the contract was designed for.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  clampIntelligenceLimit,
  countryIntelligenceKeys,
  fetchCountryIntelligence,
  fetchEmbassies,
  fetchEmbassy,
  fetchEmergencyContacts,
  fetchIntelligenceCapabilities,
  fetchIssuingAuthorities,
  fetchNoticeCategories,
  fetchOfficialNotices,
  fetchPublicHolidays,
  fetchVisaAdvisories,
  fetchVisaAdvisory,
  intelligenceErrorMessage,
  isEmergencyDirectoryMissing,
  searchOfficialNotices,
} from '@/lib/country-intelligence-api';
import type {
  CountryIntelligenceResponse,
  EmbassyDirectoryQuery,
  EmbassyResponse,
  EmergencyContactsResponse,
  IntelligenceCapabilitiesResponse,
  IssuingAuthorityResponse,
  NoticeCategoryResponse,
  OfficialNoticeCardResponse,
  OfficialNoticeListQuery,
  OfficialNoticeSearchQuery,
  PublicHolidayQuery,
  PublicHolidayResponse,
  VisaAdvisoryQuery,
  VisaAdvisoryResponse,
} from '@/types/country-intelligence';

function shouldRetry(failureCount: number, cause: unknown): boolean {
  const status = (cause as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  return failureCount < 1;
}

function messageFor(query: { isError: boolean; error: unknown }): string | null {
  return query.isError ? intelligenceErrorMessage(query.error) : null;
}

// ── The country dashboard ────────────────────────────────────────────────────

export interface UseCountryIntelligenceResult {
  intelligence: CountryIntelligenceResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Everything official about one country, in one call.
 *
 * `recordView` is left at the server's default of true for the initial load and
 * forced false on a manual refresh, so a pull-to-refresh does not inflate the
 * figure an editorial team reads.
 */
export function useCountryIntelligence(
  countryCode: string | null | undefined,
  options: { locale?: string; enabled?: boolean } = {}
): UseCountryIntelligenceResult {
  const query = useQuery({
    queryKey: countryIntelligenceKeys.country(countryCode ?? '', options.locale),
    queryFn: () => fetchCountryIntelligence(countryCode as string, { locale: options.locale }),
    enabled: Boolean(countryCode) && (options.enabled ?? true),
    // Five minutes. Official information changes on the timescale of government
    // announcements, and a dashboard refetched on every focus is a request per
    // glance at a screen somebody may leave open.
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    intelligence: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/** What this deployment's intelligence surface offers, and which engine answers search. */
export function useIntelligenceCapabilities(): {
  capabilities: IntelligenceCapabilitiesResponse | null;
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: countryIntelligenceKeys.capabilities(),
    queryFn: () => fetchIntelligenceCapabilities(),
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    capabilities: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Embassies ────────────────────────────────────────────────────────────────

export interface UseEmbassiesResult {
  embassies: EmbassyResponse[];
  totalCount: number | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isEmpty: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
}

/**
 * The embassy directory.
 *
 * **Pass `locatedIn` and `serving` deliberately.** They are different questions
 * — where a mission is, and whose nationals it serves — and the server applies
 * neither as a default for the other. A screen asking "which missions can help
 * me here" wants `serving`; a screen asking "what is in this country" wants
 * `locatedIn`; a country page wants both, in two lists.
 */
export function useEmbassies(
  query: EmbassyDirectoryQuery = {},
  options: { enabled?: boolean } = {}
): UseEmbassiesResult {
  const limit = clampIntelligenceLimit(query.limit);

  const infinite = useInfiniteQuery({
    queryKey: countryIntelligenceKeys.embassies({ ...query, limit }),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchEmbassies({ ...query, limit, cursor: pageParam ?? undefined }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    enabled: options.enabled ?? true,
    staleTime: 10 * 60 * 1000,
    retry: shouldRetry,
  });

  const embassies = useMemo(
    () => infinite.data?.pages.flatMap((page) => page.items) ?? [],
    [infinite.data]
  );

  return {
    embassies,
    totalCount: infinite.data?.pages[0]?.totalCount ?? null,
    isLoading: infinite.isLoading,
    isRefreshing: infinite.isRefetching,
    isEmpty: infinite.isSuccess && embassies.length === 0,
    hasMore: infinite.hasNextPage,
    isFetchingMore: infinite.isFetchingNextPage,
    error: messageFor(infinite),
    loadMore: () => {
      if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
    },
    refresh: () => void infinite.refetch(),
  };
}

/** One mission in full. */
export function useEmbassy(embassyId: string | null | undefined): {
  embassy: EmbassyResponse | null;
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: countryIntelligenceKeys.embassy(embassyId ?? ''),
    queryFn: () => fetchEmbassy(embassyId as string),
    enabled: Boolean(embassyId),
    staleTime: 10 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    embassy: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Visa advisories ──────────────────────────────────────────────────────────

export interface UseVisaAdvisoriesResult {
  advisories: VisaAdvisoryResponse[];
  /** The ones that name a nationality — including, possibly, one that is not yours. */
  targeted: VisaAdvisoryResponse[];
  /** The ones that name nobody. **These apply to everybody** and must not be hidden. */
  universal: VisaAdvisoryResponse[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
}

/**
 * Entry rules for a destination.
 *
 * `appliesTo` **widens** the answer — the server returns advisories naming that
 * nationality *and* those naming nobody — so the split below is a presentation
 * aid, never a filter. Dropping `universal` would tell most members that no
 * rules exist for them, which is the failure the endpoint's own documentation
 * calls "the most dangerous kind of wrong this module can be".
 */
export function useVisaAdvisories(
  countryCode: string | null | undefined,
  query: VisaAdvisoryQuery = {}
): UseVisaAdvisoriesResult {
  const limit = clampIntelligenceLimit(query.limit);

  const infinite = useInfiniteQuery({
    queryKey: countryIntelligenceKeys.visas(countryCode ?? '', { ...query, limit }),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchVisaAdvisories(countryCode as string, {
        ...query,
        limit,
        cursor: pageParam ?? undefined,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    enabled: Boolean(countryCode),
    staleTime: 10 * 60 * 1000,
    retry: shouldRetry,
  });

  const advisories = useMemo(
    () => infinite.data?.pages.flatMap((page) => page.items) ?? [],
    [infinite.data]
  );

  return {
    advisories,
    targeted: advisories.filter((advisory) => advisory.appliesToCountryCode !== null),
    universal: advisories.filter((advisory) => advisory.appliesToCountryCode === null),
    totalCount: infinite.data?.pages[0]?.totalCount ?? null,
    isLoading: infinite.isLoading,
    isEmpty: infinite.isSuccess && advisories.length === 0,
    hasMore: infinite.hasNextPage,
    error: messageFor(infinite),
    loadMore: () => {
      if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
    },
    refresh: () => void infinite.refetch(),
  };
}

/** One advisory in full. */
export function useVisaAdvisory(advisoryId: string | null | undefined): {
  advisory: VisaAdvisoryResponse | null;
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: countryIntelligenceKeys.visa(advisoryId ?? ''),
    queryFn: () => fetchVisaAdvisory(advisoryId as string),
    enabled: Boolean(advisoryId),
    staleTime: 10 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    advisory: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Emergency ────────────────────────────────────────────────────────────────

export interface UseEmergencyContactsResult {
  emergency: EmergencyContactsResponse | null;
  isLoading: boolean;
  /**
   * True when this country simply has no directory yet.
   *
   * Kept apart from `error` on purpose: "we have not recorded numbers for this
   * country" and "we could not reach the server" need very different words in
   * front of somebody looking for an ambulance.
   */
  isMissing: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * One country's emergency numbers.
 *
 * **`gcTime` is a day and `staleTime` is an hour**, which is unlike every other
 * read in this client and is the point: the response is shaped to be cached
 * offline, and a hook that discarded numbers it already held because they were
 * minutes old would defeat the one thing this contract was designed for.
 */
export function useEmergencyContacts(
  countryCode: string | null | undefined,
  options: { locale?: string } = {}
): UseEmergencyContactsResult {
  const query = useQuery({
    queryKey: countryIntelligenceKeys.emergency(countryCode ?? '', options.locale),
    queryFn: () => fetchEmergencyContacts(countryCode as string, { locale: options.locale }),
    enabled: Boolean(countryCode),
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    emergency: query.data ?? null,
    isLoading: query.isLoading,
    isMissing: query.isError && isEmergencyDirectoryMissing(query.error),
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

// ── Holidays ─────────────────────────────────────────────────────────────────

/** A bare array with no cursor. A country has ten to thirty holidays in a year. */
export function usePublicHolidays(
  countryCode: string | null | undefined,
  query: PublicHolidayQuery = {}
): {
  holidays: PublicHolidayResponse[];
  /** The ones that shut a government office or a mission — what changes somebody's week. */
  closures: PublicHolidayResponse[];
  isLoading: boolean;
  error: string | null;
} {
  const result = useQuery({
    queryKey: countryIntelligenceKeys.holidays(countryCode ?? '', query),
    queryFn: () => fetchPublicHolidays(countryCode as string, query),
    enabled: Boolean(countryCode),
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  const holidays = result.data?.items ?? [];

  return {
    holidays,
    closures: holidays.filter(
      (holiday) => holiday.closesGovernmentOffices || holiday.closesEmbassies
    ),
    isLoading: result.isLoading,
    error: messageFor(result),
  };
}

// ── Notices ──────────────────────────────────────────────────────────────────

export interface UseOfficialNoticesResult {
  notices: OfficialNoticeCardResponse[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
}

/** `GET /intelligence/notices` — `CursorPagedResult`, so `readPage` absorbs it. */
export function useOfficialNotices(
  query: OfficialNoticeListQuery = {},
  options: { enabled?: boolean } = {}
): UseOfficialNoticesResult {
  const limit = clampIntelligenceLimit(query.limit);

  const infinite = useInfiniteQuery({
    queryKey: countryIntelligenceKeys.notices({ ...query, limit }),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchOfficialNotices({ ...query, limit, cursor: pageParam ?? undefined }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  const notices = useMemo(
    () => infinite.data?.pages.flatMap((page) => page.items) ?? [],
    [infinite.data]
  );

  return {
    notices,
    totalCount: infinite.data?.pages[0]?.totalCount ?? null,
    isLoading: infinite.isLoading,
    isEmpty: infinite.isSuccess && notices.length === 0,
    hasMore: infinite.hasNextPage,
    error: messageFor(infinite),
    loadMore: () => {
      if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
    },
    refresh: () => void infinite.refetch(),
  };
}

/**
 * `GET /intelligence/search`.
 *
 * Goes through `searchOfficialNotices`, which applies `toNoticeSearchPage`
 * because this response names its rows **`results`**. A hook that had reached
 * for `readPage` would have shown an empty result set for ever, with no error.
 *
 * `isUnavailable` is separated from `error` because the endpoint promises a
 * **503 rather than an empty page** when the engine cannot answer — so "search
 * is down" and "nothing matched" are distinguishable here, and a screen must
 * distinguish them.
 */
export function useOfficialNoticeSearch(
  query: OfficialNoticeSearchQuery = {},
  options: { enabled?: boolean } = {}
): UseOfficialNoticesResult & { isUnavailable: boolean } {
  const limit = clampIntelligenceLimit(query.limit);

  const infinite = useInfiniteQuery({
    queryKey: countryIntelligenceKeys.noticeSearch({ ...query, limit }),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      searchOfficialNotices({ ...query, limit, cursor: pageParam ?? undefined }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    enabled: options.enabled ?? true,
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });

  const notices = useMemo(
    () => infinite.data?.pages.flatMap((page) => page.items) ?? [],
    [infinite.data]
  );

  const status = (infinite.error as { response?: { status?: number } } | null)?.response?.status;

  return {
    notices,
    totalCount: infinite.data?.pages[0]?.totalCount ?? null,
    isLoading: infinite.isLoading,
    isEmpty: infinite.isSuccess && notices.length === 0,
    hasMore: infinite.hasNextPage,
    isUnavailable: infinite.isError && status === 503,
    error: messageFor(infinite),
    loadMore: () => {
      if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
    },
    refresh: () => void infinite.refetch(),
  };
}

/** `GET /intelligence/categories` — a bare array. The filter chips. */
export function useNoticeCategories(options: { locale?: string } = {}): {
  categories: NoticeCategoryResponse[];
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: countryIntelligenceKeys.categories(options.locale),
    queryFn: () => fetchNoticeCategories(options),
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    categories: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

/** `GET /intelligence/countries/{countryCode}/authorities` — a bare array. */
export function useIssuingAuthorities(
  countryCode: string | null | undefined,
  options: { verifiedOnly?: boolean } = {}
): {
  authorities: IssuingAuthorityResponse[];
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: countryIntelligenceKeys.authorities(countryCode ?? ''),
    queryFn: () => fetchIssuingAuthorities(countryCode as string, options),
    enabled: Boolean(countryCode),
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    authorities: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}
