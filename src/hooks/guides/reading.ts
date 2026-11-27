// Guides hooks: reading. ./index.ts is the overview of the whole module.

import { useQuery } from '@tanstack/react-query';
import {
  compareGuideVersions,
  fetchGuide,
  fetchGuideBySlug,
  fetchGuidePreview,
  fetchGuideTranslations,
  fetchGuideVersion,
  fetchGuideVersions,
  guideKeys,
} from '@/lib/api/guides-api';
import type {
  GuideCardResponse,
  GuideResponse,
  GuideVersionDiffResponse,
  GuideVersionResponse,
  GuideVersionSummaryResponse,
} from '@/types/guides';
import { messageFor, shouldRetry } from './shared';

// ── One guide ────────────────────────────────────────────────────────────────

export interface UseGuideResult {
  guide: GuideResponse | null;
  isLoading: boolean;
  /**
   * True when the server answered 404.
   *
   * Distinguished from a general error because visibility is applied inside the
   * handler: a draft, a hidden guide and a deleted one are all 404 to everybody
   * but their author, so this is "not available to you" rather than "gone".
   */
  isNotFound: boolean;
  error: string | null;
  refresh: () => void;
}

/** `GET /guides/{guideId}` — anonymous. */
export function useGuide(guideId: string | null | undefined): UseGuideResult {
  const query = useQuery({
    queryKey: guideKeys.guide(guideId ?? ''),
    queryFn: () => fetchGuide(guideId as string),
    enabled: Boolean(guideId),
    staleTime: 2 * 60 * 1000,
    retry: shouldRetry,
  });

  const status = (query.error as { response?: { status?: number } } | null)?.response?.status;

  return {
    guide: query.data ?? null,
    isLoading: query.isLoading,
    isNotFound: query.isError && status === 404,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/** `GET /guides/slug/{slug}` — the handle a deep link carries. */
export function useGuideBySlug(slug: string | null | undefined): UseGuideResult {
  const query = useQuery({
    queryKey: guideKeys.guideBySlug(slug ?? ''),
    queryFn: () => fetchGuideBySlug(slug as string),
    enabled: Boolean(slug),
    staleTime: 2 * 60 * 1000,
    retry: shouldRetry,
  });

  const status = (query.error as { response?: { status?: number } } | null)?.response?.status;

  return {
    guide: query.data ?? null,
    isLoading: query.isLoading,
    isNotFound: query.isError && status === 404,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/** `GET /guides/{guideId}/preview` — `guides.drafts.view`. The author's own draft. */
export function useGuidePreview(guideId: string | null | undefined): UseGuideResult {
  const query = useQuery({
    queryKey: guideKeys.preview(guideId ?? ''),
    queryFn: () => fetchGuidePreview(guideId as string),
    enabled: Boolean(guideId),
    staleTime: 0,
    retry: shouldRetry,
  });

  const status = (query.error as { response?: { status?: number } } | null)?.response?.status;

  return {
    guide: query.data ?? null,
    isLoading: query.isLoading,
    isNotFound: query.isError && status === 404,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/** `GET /guides/{guideId}/translations` — a bare array; the language switcher. */
export function useGuideTranslations(guideId: string | null | undefined): {
  translations: GuideCardResponse[];
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: guideKeys.translations(guideId ?? ''),
    queryFn: () => fetchGuideTranslations(guideId as string),
    enabled: Boolean(guideId),
    staleTime: 10 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    translations: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Versions ─────────────────────────────────────────────────────────────────

/**
 * `GET /guides/{guideId}/versions` — **anonymous**.
 *
 * A bare array, newest first, capped at fifty by the server. The read is public
 * on purpose: a reader who acted on a fee or a deadline should be able to see
 * that it changed, and a history visible only to its author is a record kept by
 * the one person it could exonerate.
 */
export function useGuideVersions(guideId: string | null | undefined): {
  versions: GuideVersionSummaryResponse[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const query = useQuery({
    queryKey: guideKeys.versions(guideId ?? ''),
    queryFn: () => fetchGuideVersions(guideId as string),
    enabled: Boolean(guideId),
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    versions: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/** `GET /guides/{guideId}/versions/{versionNumber}` — what readers were actually shown. */
export function useGuideVersion(
  guideId: string | null | undefined,
  versionNumber: number | null | undefined
): { version: GuideVersionResponse | null; isLoading: boolean; error: string | null } {
  const query = useQuery({
    queryKey: guideKeys.version(guideId ?? '', versionNumber ?? 0),
    queryFn: () => fetchGuideVersion(guideId as string, versionNumber as number),
    enabled: Boolean(guideId) && typeof versionNumber === 'number',
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    version: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

/**
 * `GET /guides/{guideId}/versions/compare`.
 *
 * **Unchanged sections are omitted from the answer.** A screen that rendered
 * "3 of 12 sections changed" needs the version detail for the denominator; this
 * response only carries the numerator.
 */
export function useGuideVersionDiff(
  guideId: string | null | undefined,
  fromVersion: number | null | undefined,
  toVersion: number | null | undefined
): { diff: GuideVersionDiffResponse | null; isLoading: boolean; error: string | null } {
  const enabled =
    Boolean(guideId) && typeof fromVersion === 'number' && typeof toVersion === 'number';

  const query = useQuery({
    queryKey: guideKeys.versionDiff(guideId ?? '', fromVersion ?? 0, toVersion ?? 0),
    queryFn: () =>
      compareGuideVersions(guideId as string, fromVersion as number, toVersion as number),
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    diff: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}
