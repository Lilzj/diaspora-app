// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — one job's hooks: read it, and manage it if it is yours
//
// Over `lib/job-detail-api.ts`. The job is cached under the hiring module's root
// (`jobsHiringKeys.job`), so applying or withdrawing — which invalidate that root
// — refresh the page's "you applied" without the page asking.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  archiveJob,
  closeJob,
  fetchJob,
  fetchSimilarJobs,
  jobManagementErrorMessage,
  type CloseOutcome,
} from '@/lib/job-detail-api';
import { publishJobPosting } from '@/lib/job-postings-api';
import { jobsHiringErrorMessage, jobsHiringKeys } from '@/lib/jobs-hiring-api';
import type { JobCardResponse, JobResponse } from '@/types/jobs-hiring';

/** Refusals are answers; only a failure that might pass is worth a second try. */
function shouldRetry(failureCount: number, cause: unknown): boolean {
  const status = (cause as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403 || status === 404 || status === 409) return false;
  return failureCount < 1;
}

export interface UseJobResult {
  job: JobResponse | null;
  /** True until the first answer. */
  isLoading: boolean;
  /** The platform answered that this job is not there for this reader. */
  isNotFound: boolean;
  /** Why the read failed, or null. **Not** set for a job that is not there. */
  loadError: string | null;
  refresh: () => Promise<unknown>;
}

/** `GET /jobs/{jobId}`, keeping "not there" and "could not ask" apart. */
export function useJob(jobId: string | null | undefined): UseJobResult {
  const query = useQuery({
    queryKey: jobsHiringKeys.job(jobId ?? ''),
    queryFn: () => fetchJob(jobId as string),
    enabled: Boolean(jobId),
    staleTime: 30 * 1000,
    retry: shouldRetry,
  });

  return {
    job: query.data ?? null,
    isLoading: Boolean(jobId) && query.isLoading,
    isNotFound: !jobId || (query.isSuccess && query.data === null),
    loadError: query.isError ? jobsHiringErrorMessage(query.error) : null,
    refresh: () => query.refetch(),
  };
}

/** Other jobs like this one. A failure here costs a section, never the page. */
export function useSimilarJobs(job: JobResponse | null): JobCardResponse[] {
  const query = useQuery({
    queryKey: [...jobsHiringKeys.job(job?.jobId ?? ''), 'similar'],
    queryFn: () => fetchSimilarJobs(job as JobResponse),
    enabled: Boolean(job) && job?.canManage === false,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return query.data ?? [];
}

export interface UseManageJobResult {
  publish: () => Promise<void>;
  close: (outcome: CloseOutcome) => Promise<void>;
  archive: () => Promise<void>;
  isWorking: boolean;
  /** A sentence for a refused change. */
  errorMessage: (cause: unknown) => string;
}

/**
 * Publish, close and remove a job — for the employer's team only.
 *
 * Nothing is optimistic. Each write waits for the server, then the hiring root is
 * invalidated: the job, the employer dashboard's open roles and the applicant
 * lists all read differently once a job closes.
 */
export function useManageJob(jobId: string | null | undefined): UseManageJobResult {
  const client = useQueryClient();

  const settle = () => client.invalidateQueries({ queryKey: jobsHiringKeys.all });

  const publishMutation = useMutation({
    mutationFn: () => publishJobPosting(jobId as string),
    onSuccess: settle,
    retry: false,
  });

  const closeMutation = useMutation({
    mutationFn: (outcome: CloseOutcome) => closeJob(jobId as string, { outcome }),
    onSuccess: (job) => {
      client.setQueryData(jobsHiringKeys.job(job.jobId), (previous: JobResponse | null | undefined) =>
        // The close answer carries no viewer state; keep what the read said.
        previous ? { ...job, hasApplied: previous.hasApplied, isSaved: previous.isSaved } : job
      );
      return settle();
    },
    retry: false,
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveJob(jobId as string),
    onSuccess: settle,
    retry: false,
  });

  const guard = <T,>(run: () => Promise<T>): Promise<T> =>
    jobId ? run() : Promise.reject(new Error('Cannot manage a job without its identifier.'));

  return {
    publish: () => guard(async () => void (await publishMutation.mutateAsync())),
    close: (outcome) => guard(async () => void (await closeMutation.mutateAsync(outcome))),
    archive: () => guard(() => archiveMutation.mutateAsync()),
    isWorking: publishMutation.isPending || closeMutation.isPending || archiveMutation.isPending,
    errorMessage: jobManagementErrorMessage,
  };
}
