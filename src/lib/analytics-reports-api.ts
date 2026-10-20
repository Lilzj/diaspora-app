// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Saved analytics reports and CSV exports (20 Oct 2026)
//
// ✅ EVERY ROUTE IN THIS FILE IS REAL: `Diaspora.Modules.Analytics` serves
//    `/analytics/reports` and `/analytics/exports` since backend a7a94da,
//    closing FRONTEND-PHASE15-GAP-026 and -027.
//
// Kept apart from `analytics-api.ts` on purpose. That arm reads money and
// `analytics-boundary.test.ts` holds it to exporting no write function at all;
// a report definition and an export job are writes of configuration, not of
// money, and putting them here keeps that guard exactly as strict as it was.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE_URL, apiClient } from './apiClient';
import { toFinancialError } from './financial-errors';
import type {
  AnalyticsExport,
  AnalyticsExportFormat,
  AnalyticsQuery,
  AnalyticsReport,
  AnalyticsVisualization,
} from '@/types/analytics';

interface Envelope<T> {
  data: T;
}

async function read<T>(path: string, params?: object, signal?: AbortSignal): Promise<T> {
  try {
    const response = await apiClient.get<Envelope<T>>(path, { params, signal });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// WRITES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Writes are classified `mutating`, as every other client here does, so a
 * transport failure is an *indeterminate* outcome rather than a failed one: a
 * report whose save timed out may well be saved.
 */
async function write<T>(
  method: 'post' | 'put' | 'delete',
  path: string,
  body?: unknown
): Promise<T> {
  try {
    const response =
      method === 'delete'
        ? await apiClient.delete<Envelope<T>>(path)
        : method === 'put'
          ? await apiClient.put<Envelope<T>>(path, body)
          : await apiClient.post<Envelope<T>>(path, body);
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SAVED REPORTS — FRONTEND-PHASE15-GAP-027 (served since 20 Oct 2026)
//
// Owner-only definitions. Only `sharing: "private"` is accepted, and
// `scope=shared` is always empty: nothing can be shared yet.
// ═════════════════════════════════════════════════════════════════════════════

export interface SaveReportInput {
  name: string;
  description?: string | null;
  query: AnalyticsQuery;
  visualization: AnalyticsVisualization;
  /** The server accepts `private` alone. */
  sharing: 'private';
}

export async function fetchAnalyticsReports(
  scope: 'mine' | 'favorites',
  signal?: AbortSignal
): Promise<AnalyticsReport[]> {
  return (await read<AnalyticsReport[] | null>('/analytics/reports', { scope }, signal)) ?? [];
}

export async function fetchAnalyticsReport(
  reportId: string,
  signal?: AbortSignal
): Promise<AnalyticsReport> {
  return read<AnalyticsReport>(`/analytics/reports/${encodeURIComponent(reportId)}`, undefined, signal);
}

export async function createAnalyticsReport(input: SaveReportInput): Promise<AnalyticsReport> {
  return write<AnalyticsReport>('post', '/analytics/reports', input);
}

export async function updateAnalyticsReport(
  reportId: string,
  input: Partial<SaveReportInput> & { isFavorite?: boolean }
): Promise<AnalyticsReport> {
  return write<AnalyticsReport>('put', `/analytics/reports/${encodeURIComponent(reportId)}`, input);
}

export async function deleteAnalyticsReport(reportId: string): Promise<{ reportId: string }> {
  return write<{ reportId: string }>('delete', `/analytics/reports/${encodeURIComponent(reportId)}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORTS — FRONTEND-PHASE15-GAP-026 (served since 20 Oct 2026)
//
// CSV only. The job is produced through the dashboard's own read, so it holds
// what the caller could already see; its link lasts twelve hours.
// ═════════════════════════════════════════════════════════════════════════════

interface ExportWire extends Omit<AnalyticsExport, 'status' | 'format'> {
  status: string;
  format: string;
}

/**
 * The server answers the link as a path on its own origin
 * (`/api/v1/analytics/exports/{id}/download?token=…`). The system browser that
 * opens it needs the host, and the token in the path is the credential.
 */
export function absoluteExportUrl(downloadUrl: string | null | undefined): string | null {
  if (!downloadUrl) return null;
  if (/^https?:\/\//i.test(downloadUrl)) return downloadUrl;
  const origin = API_BASE_URL.replace(/^(https?:\/\/[^/]+).*$/i, '$1');
  return `${origin}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`;
}

function toExport(wire: ExportWire): AnalyticsExport {
  const status = (['queued', 'running', 'ready', 'failed', 'expired'] as const).find(
    (known) => known === wire.status
  );

  return {
    ...wire,
    format: 'csv',
    // An unknown status is not "ready". It is treated as still working, and the
    // poll's own bound turns a job that never settles into a failure.
    status: status ?? 'queued',
    downloadUrl: absoluteExportUrl(wire.downloadUrl),
  };
}

export async function requestAnalyticsExport(
  query: AnalyticsQuery,
  format: AnalyticsExportFormat
): Promise<AnalyticsExport> {
  return toExport(await write<ExportWire>('post', '/analytics/exports', { query, format }));
}

export async function fetchAnalyticsExport(
  exportId: string,
  signal?: AbortSignal
): Promise<AnalyticsExport> {
  return toExport(
    await read<ExportWire>(`/analytics/exports/${encodeURIComponent(exportId)}`, undefined, signal)
  );
}
