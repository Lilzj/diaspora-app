// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Jobs hiring-workflow hooks (Remediation Wave K)
//
// The stable interface over `lib/jobs-hiring-api.ts`. A screen calls
// `useMyApplications()` and receives rows; it never builds a query key, never
// decodes a cursor and never decides what a mutation invalidates.
//
// ── Where an infinite query is honest, and where it is not ───────────────────
//
// **Exactly one route in this module is paged**: `GET /jobs/applications`. It
// returns a genuine `CursorPagedResult<T>` with a `nextCursor` and a `hasMore`
// and accepts the cursor back, so it gets `useInfiniteQuery`.
//
// **Nothing else does.** Both dashboards return a single record with fixed-size
// arrays inside it — `recentApplications`, `outstandingOffers`,
// `upcomingInterviews`, `recentJobs`, `savedClosingSoon` — and there is no
// parameter that asks for more of any of them. A "see all interviews" control is
// therefore not implementable against this backend and no hook here pretends
// otherwise; see `INTERVIEW_AND_OFFER_LIST_ROUTES_ABSENT`.
//
// ── Why the apply mutation is not optimistic, ever ───────────────────────────
//
// **An apply must never report success unless the server confirmed it.** There
// is no idempotency key anywhere on this module and a repeat is a 409, so an
// optimistic "Applied ✓" that later rolled back would be the application telling
// a member their CV had gone to an employer when it had not. `useApplyToJob`
// exposes the settled state and nothing before it.
//
// The same reasoning applies to withdrawal and to an offer response, which are
// the other two irreversible things a member does here.
//
// ── What a mutation writes, and what it can only invalidate ──────────────────
//
// `apply` and `decide` return the **full** application, history included, and
// there is no route that could fetch it again — so their answers are written
// into `jobsHiringKeys.application(id)` rather than discarded. That cache entry
// is the only place an application's timeline ever exists on the device.
//
// `withdraw` and the visibility change answer **`data: null`**, so they are
// invalidations by necessity rather than by choice.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  allowedDecisionsFrom,
  applyToJob,
  changeCandidateVisibility,
  createCandidateProfile,
  decideApplication,
  extendOffer,
  fetchApplications,
  fetchCandidateDashboard,
  fetchCandidateProfile,
  fetchEmployerDashboard,
  jobsHiringErrorMessage,
  jobsHiringKeys,
  recordInterviewOutcome,
  registerEmployer,
  respondToOffer,
  scheduleInterview,
  updateCandidateProfile,
  updateEmployer,
  withdrawApplication,
} from '@/lib/jobs-hiring-api';
import type {
  ApplicationCardResponse,
  ApplicationListQuery,
  ApplyToJobRequest,
  CandidateDashboardResponse,
  CandidateProfileResponse,
  CandidateVisibility,
  CreateCandidateProfileRequest,
  DecideApplicationRequest,
  EmployerDashboardResponse,
  EmployerDecisionStatus,
  EmployerResponse,
  ExtendOfferRequest,
  InterviewResponse,
  JobApplicationResponse,
  JobOfferResponse,
  RecordInterviewOutcomeRequest,
  RegisterEmployerRequest,
  RespondToOfferRequest,
  ScheduleInterviewRequest,
  UpdateCandidateProfileRequest,
  UpdateEmployerRequest,
  WithdrawApplicationRequest,
} from '@/types/jobs-hiring';

/**
 * A 401 or a 403 from this module is "sign in" or "you do not have access", not
 * "try again". A 404 is equally final — the posting is gone. A 409 is a refusal
 * with a reason, and retrying one is three round trips to be told the same thing.
 */
function shouldRetry(failureCount: number, cause: unknown): boolean {
  const status = (cause as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403 || status === 404 || status === 409) return false;
  return failureCount < 1;
}

/** A sentence for the member, or null. */
function messageFor(query: { isError: boolean; error: unknown }): string | null {
  return query.isError ? jobsHiringErrorMessage(query.error) : null;
}

/**
 * Everything the workflow touched, after a write.
 *
 * Both dashboards and every applications list are derived from the same rows, so
 * a decision, a withdrawal, an interview or an offer moves numbers on all of
 * them. Invalidating the module's root is one line and one refetch of whatever
 * happens to be mounted, which is cheaper than reasoning about which of six
 * surfaces a given transition touched — and is right when that reasoning is
 * wrong.
 */
function invalidateWorkflow(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: jobsHiringKeys.all });
}

// ── The candidate's applications ─────────────────────────────────────────────

export interface UseApplicationsResult {
  applications: ApplicationCardResponse[];
  /**
   * What the server said the population is, or null.
   *
   * `CursorPagedResult.TotalCount` is `int?` — counting is expensive and the
   * route declines — so null means "not counted" rather than zero, and
   * `applications.length` is the number received rather than the number that
   * exist.
   */
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
 * `GET /jobs/applications`, paged.
 *
 * The employer's applicant list and the candidate's tracker are the same query
 * read from opposite ends, so this one hook serves both — `useMyApplications`
 * and `useEmployerApplications` are the two named entry points and neither adds
 * anything but a scope.
 *
 * `getNextPageParam` stops on `hasMore` and never on an empty page. The rule is
 * the same one Wave D-2 established for feeds: a page that came back short is
 * not proof of the end, and a page that came back full is not proof of another.
 */
export function useApplications(
  query: ApplicationListQuery = {},
  options: { enabled?: boolean } = {}
): UseApplicationsResult {
  const infinite = useInfiniteQuery({
    queryKey: jobsHiringKeys.applicationList(query),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchApplications({ ...query, cursor: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    enabled: options.enabled ?? true,
    // A minute. An applicant list moves when somebody applies or a recruiter
    // decides, neither of which happens between two glances at the same screen.
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });

  const applications = useMemo(
    () => infinite.data?.pages.flatMap((page) => page.items) ?? [],
    [infinite.data]
  );

  return {
    applications,
    // The first page's figure. Later pages restate it, and the first is the one
    // the member's scroll position was established against.
    totalCount: infinite.data?.pages[0]?.totalCount ?? null,
    isLoading: infinite.isLoading,
    isRefreshing: infinite.isRefetching,
    // Settled, successful and genuinely empty. Not true while loading and not
    // true on failure: "you have not applied to anything" and "we could not load
    // your applications" need different words on the screen.
    isEmpty: infinite.isSuccess && applications.length === 0,
    hasMore: infinite.hasNextPage,
    isFetchingMore: infinite.isFetchingNextPage,
    error: messageFor(infinite),
    loadMore: () => {
      if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
    },
    refresh: () => void infinite.refetch(),
  };
}

/**
 * The caller's own application tracker.
 *
 * `employerId` is deliberately not accepted: omitting it is what scopes the
 * query to the caller, and a hook that let one through would be a tracker that
 * could be pointed at an employer's applicant list by passing a parameter.
 */
export function useMyApplications(
  query: Omit<ApplicationListQuery, 'employerId' | 'cursor'> = {}
): UseApplicationsResult {
  return useApplications({ ...query, employerId: null });
}

/**
 * An employer's applicant list.
 *
 * Requires membership of the named employer; the server answers
 * `jobs.employer.not-owned` (403) otherwise, and `shouldRetry` does not retry
 * it. Disabled until there is an identifier, because a request with none is the
 * caller's own tracker rendered under an employer heading.
 */
export function useEmployerApplications(
  employerId: string | null,
  query: Omit<ApplicationListQuery, 'employerId' | 'cursor'> = {}
): UseApplicationsResult {
  return useApplications(
    { ...query, employerId: employerId ?? undefined },
    { enabled: Boolean(employerId) }
  );
}

// ── Applying ─────────────────────────────────────────────────────────────────

export interface UseApplyToJobResult {
  apply: (request?: ApplyToJobRequest) => Promise<JobApplicationResponse>;
  isApplying: boolean;
  /** The application the **server** created, or null. Never a local optimism. */
  application: JobApplicationResponse | null;
  error: string | null;
  reset: () => void;
}

/**
 * `POST /jobs/{jobId}/apply`.
 *
 * **Nothing here is optimistic and nothing here swallows a failure.** `apply`
 * rejects when the server refused, so a caller that awaits it and then shows a
 * confirmation is showing one for an application that exists. A caller that
 * fired and forgot would be showing one for an application that may not.
 *
 * There is no idempotency key on this module, so this must not be retried
 * automatically: `retry: false`, unconditionally. A timeout with no response is
 * genuinely ambiguous and the honest answer to the member is "we could not
 * confirm this was sent", which is what `jobsHiringErrorMessage` falls through
 * to.
 *
 * The returned application is written into the cache because there is no route
 * that could fetch it again.
 */
export function useApplyToJob(jobId: string | null): UseApplyToJobResult {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: (request: ApplyToJobRequest = {}) => applyToJob(jobId as string, request),
    onSuccess: (application) => {
      // The only copy of this record that will ever exist on the device.
      client.setQueryData(jobsHiringKeys.application(application.applicationId), application);
      invalidateWorkflow(client);
    },
    // A repeat apply is a 409, not a second application. See the note above.
    retry: false,
  });

  return {
    apply: (request: ApplyToJobRequest = {}) => {
      if (!jobId) {
        return Promise.reject(new Error('Cannot apply without a job identifier.'));
      }
      return mutation.mutateAsync(request);
    },
    isApplying: mutation.isPending,
    application: mutation.data ?? null,
    error: mutation.isError ? jobsHiringErrorMessage(mutation.error) : null,
    reset: () => mutation.reset(),
  };
}

export interface UseWithdrawApplicationResult {
  withdraw: (applicationId: string, request?: WithdrawApplicationRequest) => Promise<void>;
  isWithdrawing: boolean;
  error: string | null;
}

/**
 * `POST /jobs/applications/{id}/withdraw`.
 *
 * **The applicant themselves, and nobody else.** The handler requires ownership
 * rather than a permission, so this must never be wired to an employer surface —
 * withdrawing on somebody's behalf is not an action this platform offers.
 *
 * Answers `data: null`, so the only correct follow-up is an invalidation. The
 * row does not disappear: it comes back with `status: 'Withdrawn'` and
 * `isActive: false`, which is the honest record and is what the list should
 * render.
 */
export function useWithdrawApplication(): UseWithdrawApplicationResult {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      applicationId,
      request,
    }: {
      applicationId: string;
      request: WithdrawApplicationRequest;
    }) => withdrawApplication(applicationId, request),
    onSuccess: () => invalidateWorkflow(client),
    retry: false,
  });

  return {
    withdraw: (applicationId: string, request: WithdrawApplicationRequest = {}) =>
      mutation.mutateAsync({ applicationId, request }),
    isWithdrawing: mutation.isPending,
    error: mutation.isError ? jobsHiringErrorMessage(mutation.error) : null,
  };
}

// ── The employer's decisions ─────────────────────────────────────────────────

export interface UseDecideApplicationResult {
  decide: (
    applicationId: string,
    request: DecideApplicationRequest
  ) => Promise<JobApplicationResponse>;
  isDeciding: boolean;
  error: string | null;
  /**
   * What this application may become, from its current status.
   *
   * Mirrors the domain's transition table so a control the server would refuse
   * is not offered. It is **not** an authority — the server's `MoveTo` is — and a
   * screen must still handle `jobs.application.transition-invalid`.
   */
  allowedFrom: (status: ApplicationCardResponse['status']) => readonly EmployerDecisionStatus[];
}

/**
 * `POST /jobs/applications/{id}/decide`.
 *
 * Returns the updated application with its employer-filtered history, so the
 * answer is written into the cache rather than thrown away.
 *
 * `reasonVisibleToCandidate` is the caller's decision and the client states it
 * explicitly on every request — the server's default is `true`, and publishing a
 * rejection reason to a candidate should never happen because a form field was
 * left untouched.
 */
export function useDecideApplication(): UseDecideApplicationResult {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      applicationId,
      request,
    }: {
      applicationId: string;
      request: DecideApplicationRequest;
    }) => decideApplication(applicationId, request),
    onSuccess: (application) => {
      client.setQueryData(jobsHiringKeys.application(application.applicationId), application);
      invalidateWorkflow(client);
    },
    retry: false,
  });

  return {
    decide: (applicationId: string, request: DecideApplicationRequest) =>
      mutation.mutateAsync({ applicationId, request }),
    isDeciding: mutation.isPending,
    error: mutation.isError ? jobsHiringErrorMessage(mutation.error) : null,
    allowedFrom: allowedDecisionsFrom,
  };
}

// ── Interviews ───────────────────────────────────────────────────────────────

export interface UseScheduleInterviewResult {
  schedule: (applicationId: string, request: ScheduleInterviewRequest) => Promise<InterviewResponse>;
  isScheduling: boolean;
  error: string | null;
}

/**
 * `POST /jobs/applications/{id}/interviews`.
 *
 * Scheduling also moves the application to `InterviewScheduled`, so the whole
 * workflow is invalidated rather than just an interview cache — of which there
 * is none, because no route lists interviews.
 */
export function useScheduleInterview(): UseScheduleInterviewResult {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      applicationId,
      request,
    }: {
      applicationId: string;
      request: ScheduleInterviewRequest;
    }) => scheduleInterview(applicationId, request),
    onSuccess: () => invalidateWorkflow(client),
    retry: false,
  });

  return {
    schedule: (applicationId: string, request: ScheduleInterviewRequest) =>
      mutation.mutateAsync({ applicationId, request }),
    isScheduling: mutation.isPending,
    error: mutation.isError ? jobsHiringErrorMessage(mutation.error) : null,
  };
}

export interface UseRecordInterviewOutcomeResult {
  record: (
    interviewId: string,
    request: RecordInterviewOutcomeRequest
  ) => Promise<InterviewResponse>;
  isRecording: boolean;
  error: string | null;
}

/** `POST /jobs/interviews/{id}/outcome`. Note the route hangs off the interview. */
export function useRecordInterviewOutcome(): UseRecordInterviewOutcomeResult {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      interviewId,
      request,
    }: {
      interviewId: string;
      request: RecordInterviewOutcomeRequest;
    }) => recordInterviewOutcome(interviewId, request),
    onSuccess: () => invalidateWorkflow(client),
    retry: false,
  });

  return {
    record: (interviewId: string, request: RecordInterviewOutcomeRequest) =>
      mutation.mutateAsync({ interviewId, request }),
    isRecording: mutation.isPending,
    error: mutation.isError ? jobsHiringErrorMessage(mutation.error) : null,
  };
}

// ── Offers ───────────────────────────────────────────────────────────────────

export interface UseExtendOfferResult {
  extend: (applicationId: string, request: ExtendOfferRequest) => Promise<JobOfferResponse>;
  isExtending: boolean;
  error: string | null;
}

/**
 * `POST /jobs/applications/{id}/offers`.
 *
 * `extendImmediately` reaches the server stated rather than defaulted — an
 * omitted field sends the offer to the candidate, and a form that meant to save
 * a draft would have sent it.
 */
export function useExtendOffer(): UseExtendOfferResult {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      applicationId,
      request,
    }: {
      applicationId: string;
      request: ExtendOfferRequest;
    }) => extendOffer(applicationId, request),
    onSuccess: () => invalidateWorkflow(client),
    retry: false,
  });

  return {
    extend: (applicationId: string, request: ExtendOfferRequest) =>
      mutation.mutateAsync({ applicationId, request }),
    isExtending: mutation.isPending,
    error: mutation.isError ? jobsHiringErrorMessage(mutation.error) : null,
  };
}

export interface UseRespondToOfferResult {
  respond: (offerId: string, request: RespondToOfferRequest) => Promise<JobOfferResponse>;
  isResponding: boolean;
  error: string | null;
}

/**
 * `POST /jobs/offers/{id}/respond`.
 *
 * Not optimistic, for the same reason applying is not: accepting a job offer is
 * the single most consequential thing a member does on this platform, and an
 * "Accepted" that rolled back would be a person having told an employer they are
 * coming when they have not.
 *
 * Gate the control on `offer.canRespond`, never on the device clock.
 */
export function useRespondToOffer(): UseRespondToOfferResult {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ offerId, request }: { offerId: string; request: RespondToOfferRequest }) =>
      respondToOffer(offerId, request),
    onSuccess: () => invalidateWorkflow(client),
    retry: false,
  });

  return {
    respond: (offerId: string, request: RespondToOfferRequest) =>
      mutation.mutateAsync({ offerId, request }),
    isResponding: mutation.isPending,
    error: mutation.isError ? jobsHiringErrorMessage(mutation.error) : null,
  };
}

// ── Dashboards ───────────────────────────────────────────────────────────────

export interface UseCandidateDashboardResult {
  dashboard: CandidateDashboardResponse | null;
  /**
   * Whether the member has no candidate profile yet.
   *
   * `candidateId` comes back **null** in that case, which is the server's way of
   * saying "prompt them". It is not an error and not an empty dashboard: the
   * saved-jobs and recommendation sections are still populated, because the
   * dashboard is gated on `jobs.saved.manage` rather than on having a profile.
   */
  needsProfile: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /jobs/candidate/dashboard`.
 *
 * The only route that returns a candidate's offers or interviews. A screen
 * wanting "all my interviews" has this and nothing else.
 */
export function useCandidateDashboard(
  options: { enabled?: boolean } = {}
): UseCandidateDashboardResult {
  const query = useQuery({
    queryKey: jobsHiringKeys.candidateDashboard(),
    queryFn: fetchCandidateDashboard,
    enabled: options.enabled ?? true,
    // Offers expire and interviews are attended. A minute is short enough that a
    // member returning to the tab sees an accurate countdown.
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });

  return {
    dashboard: query.data ?? null,
    // Only once the answer has arrived. Prompting for a profile while the
    // request is still in flight would flash a call to action at somebody who
    // already has one.
    needsProfile: query.isSuccess && !query.data?.candidateId,
    isLoading: query.isLoading,
    isRefreshing: query.isRefetching,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseEmployerDashboardResult {
  dashboard: EmployerDashboardResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /jobs/employers/dashboard`.
 *
 * `employerId` is optional **by design**: a recruiter belonging to one employer
 * need not name it, and one belonging to several must. Omitting it in the second
 * case is a refusal rather than an arbitrary pick, and the error is surfaced
 * rather than papered over — the member has to choose.
 */
export function useEmployerDashboard(
  employerId?: string | null,
  options: { enabled?: boolean } = {}
): UseEmployerDashboardResult {
  const query = useQuery({
    queryKey: jobsHiringKeys.employerDashboard(employerId),
    queryFn: () => fetchEmployerDashboard(employerId),
    enabled: options.enabled ?? true,
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });

  return {
    dashboard: query.data ?? null,
    isLoading: query.isLoading,
    isRefreshing: query.isRefetching,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

// ── The candidate's profile ──────────────────────────────────────────────────

export interface UseCandidateProfileResult {
  /**
   * The member's candidate profile, or **null when they have none yet**.
   *
   * Read from `GET /jobs/candidate/profile`. Null means the server said so; a
   * read that failed leaves this null too, but with `loadError` set, and a form
   * must not offer to create a profile over a failure it cannot see past.
   */
  profile: CandidateProfileResponse | null;
  /** True until the first answer arrives. */
  isLoading: boolean;
  /** Why the read failed, or null. Not set when the member simply has no profile. */
  loadError: string | null;
  refresh: () => void;
  create: (request: CreateCandidateProfileRequest) => Promise<CandidateProfileResponse>;
  update: (request: UpdateCandidateProfileRequest) => Promise<CandidateProfileResponse>;
  setVisibility: (visibility: CandidateVisibility) => Promise<void>;
  isSaving: boolean;
  error: string | null;
}

/**
 * Read, create, update and hide a candidate profile.
 *
 * **It can be read back now.** This hook used to hold only what a create or
 * update in the same session returned, because the client believed no read
 * route existed — so an edit form started blank and a save wiped whatever the
 * member had stored. The server has served `GET /jobs/candidate/profile` since
 * gap G-5 closed, and since 14 Sep 2026 a member's first application creates the
 * profile, so most members will already have one the first time they open it.
 *
 * `setVisibility` is separate because the server made it separate: it is the one
 * setting somebody changes urgently and alone, and a "hide me" that had to pass
 * a whole-document validation is a "hide me" that can fail on a headline.
 */
export function useCandidateProfile(): UseCandidateProfileResult {
  const client = useQueryClient();

  const cached = useQuery({
    queryKey: jobsHiringKeys.candidateProfile(),
    queryFn: fetchCandidateProfile,
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });

  const store = useCallback(
    (profile: CandidateProfileResponse) => {
      client.setQueryData(jobsHiringKeys.candidateProfile(), profile);
      invalidateWorkflow(client);
    },
    [client]
  );

  const createMutation = useMutation({
    mutationFn: createCandidateProfile,
    onSuccess: store,
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: updateCandidateProfile,
    onSuccess: store,
    retry: false,
  });

  const visibilityMutation = useMutation({
    mutationFn: changeCandidateVisibility,
    // Answers `data: null`, so there is nothing to write — the profile is read
    // again instead, so the choice shown is the stored one.
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: jobsHiringKeys.candidateProfile() });
      invalidateWorkflow(client);
    },
    retry: false,
  });

  const firstError =
    createMutation.error ?? updateMutation.error ?? visibilityMutation.error ?? null;

  return {
    profile: cached.data ?? null,
    isLoading: cached.isLoading,
    loadError: messageFor(cached),
    refresh: () => void cached.refetch(),
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    setVisibility: visibilityMutation.mutateAsync,
    isSaving:
      createMutation.isPending || updateMutation.isPending || visibilityMutation.isPending,
    error: firstError ? jobsHiringErrorMessage(firstError) : null,
  };
}

// ── Employers ────────────────────────────────────────────────────────────────

export interface UseEmployerRegistrationResult {
  /** The employer this session registered or updated, or null. No read route exists. */
  employer: EmployerResponse | null;
  register: (request: RegisterEmployerRequest) => Promise<EmployerResponse>;
  update: (employerId: string, request: UpdateEmployerRequest) => Promise<EmployerResponse>;
  isSaving: boolean;
  error: string | null;
}

/**
 * Register and manage an employer.
 *
 * Two routes and, again, **no read**: `EMPLOYER_PROFILE_ROUTE_ABSENT`. The
 * caller becomes the employer's first owner, and no route adds a second member,
 * so the registering account is the only one that can act on it.
 *
 * The identifier the registration returns is the one every subsequent employer
 * call needs — `GET /employers/dashboard?employerId=`, the applicant list, the
 * update — and there is nothing that could look it up again. A screen must keep
 * it.
 */
export function useEmployerRegistration(): UseEmployerRegistrationResult {
  const client = useQueryClient();

  const registerMutation = useMutation({
    mutationFn: registerEmployer,
    onSuccess: (employer) => {
      client.setQueryData(jobsHiringKeys.employer(employer.employerId), employer);
      invalidateWorkflow(client);
    },
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({ employerId, request }: { employerId: string; request: UpdateEmployerRequest }) =>
      updateEmployer(employerId, request),
    onSuccess: (employer) => {
      client.setQueryData(jobsHiringKeys.employer(employer.employerId), employer);
      invalidateWorkflow(client);
    },
    retry: false,
  });

  const employer = registerMutation.data ?? updateMutation.data ?? null;
  const firstError = registerMutation.error ?? updateMutation.error ?? null;

  return {
    employer,
    register: registerMutation.mutateAsync,
    update: (employerId: string, request: UpdateEmployerRequest) =>
      updateMutation.mutateAsync({ employerId, request }),
    isSaving: registerMutation.isPending || updateMutation.isPending,
    error: firstError ? jobsHiringErrorMessage(firstError) : null,
  };
}
