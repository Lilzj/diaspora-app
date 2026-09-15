// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Jobs hiring-workflow client (Remediation Wave K)
//
// `Diaspora.Modules.Jobs` serves 28 routes under `/api/v1/jobs`, of which
// **fifteen are the hiring workflow** and none of them had a frontend consumer.
// The client base URL is `.../v1`, so every path here starts `/jobs/...` and the
// platform's `RoutePrefixCompatibilityMiddleware` maps it onto `/api/v1/jobs/...`.
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// One line. `app/job/[id].tsx` did `apiClient.post('/jobs/{id}/apply', {})` and
// nothing else in the codebase touched the workflow. There was no applications
// list, no withdrawal, no employer decision, no interview, no offer, no
// candidate profile, no employer registration and no dashboard.
//
// `types/job.ts` and `mocks/handlers/jobs.ts` are a **different, older universe**
// — `JobOpportunity`, `providerId`, `benefitsFlags`, an unversioned `/jobs`
// search with a `pagination` envelope the platform has never returned. Nothing
// here imports from either. They are left in place because the browse and detail
// screens still render from them; see the wave report for what that costs.
//
// ── The seven things worth knowing before calling anything here ──────────────
//
// **1. Enum values are PascalCase, property names are camelCase.** In the same
// object. `JobWireNames.ToWire` is `value.ToString()` — see the header of
// `types/jobs-hiring.ts`. Community, on adjacent screens, is camelCase for both.
//
// **2. An unparseable status filter is silently dropped, not refused — and it
// is separators that break, not case.** `Enum.TryParse(ignoreCase: true)`
// forgives `underreview` and `UNDERREVIEW`; what it cannot read is
// `under_review` or `under-review`, which is the kebab-cased spelling every
// *other* list surface in this application uses for a filter value. `ParseMany`
// keeps what it understands and returns null when nothing survives, and a null
// filter set is **no filter at all** — so a misspelled chip returns
// *everything*, at HTTP 200, looking exactly like a working filter with a broad
// match. `assertKnownStatuses` refuses anything but the exact wire spelling on
// the way out instead, which is stricter than the server and is the only rule
// that distinguishes the two outcomes from this side.
//
// **3. Two routes answer `200` with `data: null`.** Withdrawal and the candidate
// visibility change. `PlatformResults.Ok(context, Result)` — the non-generic
// overload at `Diaspora.Platform/Http/PlatformResults.cs:29-37` — writes
// `ApiResponse<object?>(null, …)`. So there is no record to write into the cache
// and both are invalidations by necessity.
//
// **4. `POST /{jobId}/apply` is not retryable.** No idempotency key exists on
// this module, in a header or a body, and a second apply is
// `jobs.application.already-applied` (409). A network failure with no response
// is therefore genuinely ambiguous — the application may or may not have landed
// — and `applyToJob` never resolves unless the server answered. See its note.
//
// **5. `GET /jobs/applications` is a real `CursorPagedResult<T>`** and `readPage`
// absorbs it. Verified rather than assumed: `ListApplicationsQuery` is typed
// `IQuery<CursorPagedResult<ApplicationCardResponse>>` and that record names its
// rows `items` (`SharedKernel/Pagination/CursorPagedResult.cs:8`), which is the
// key `toPage` branches on. Contrast `CommentThreadResponse`, which names them
// `comments` and comes back as an empty page with no error.
//
// **6. The applications route is the whole hiring workflow's only list.**
// Interviews and offers have no list route at all — they arrive inside
// `GET /jobs/candidate/dashboard` and nowhere else.
//
// **7. Authorisation is checked twice and the second check is invisible here.**
// Every route names a policy, and every handler additionally asks the employer
// aggregate whether the caller may act on *this* record. A caller with
// `jobs.applications.decide` who is not a `Recruiter` of the hiring employer is
// still refused. Nothing in this file may pre-empt that: `canWithdraw` and
// `canRespond` come off the server's records and are read, never derived.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { readPage, type Page } from './platform-envelope';
import type {
  ApplicationCardResponse,
  ApplicationListQuery,
  ApplicationStatus,
  ApplyToJobRequest,
  CandidateDashboardResponse,
  CandidateProfileResponse,
  CandidateVisibility,
  ChangeCandidateVisibilityRequest,
  CreateCandidateProfileRequest,
  DecideApplicationRequest,
  EmployerDashboardResponse,
  EmployerDecisionStatus,
  EmployerResponse,
  ExtendOfferRequest,
  InterviewMode,
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

const ROOT = '/jobs';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

// ── Capabilities this module does not have ───────────────────────────────────
//
// Named as constants rather than simply omitted, so that a reader who finds the
// DTO in the backend and comes looking for the client function finds out here
// why there isn't one. Each was established by reading every `Map*` call in
// `Diaspora.Modules.Jobs/Api/` — there are 28 and no more.

// **An employer profile CAN be read — corrected 15 Sep 2026.** This section
// used to export `EMPLOYER_PROFILE_ROUTE_ABSENT` ("NG-04, confirmed"), written
// from a reading of `Api/EmployerEndpoints.cs` taken before the server added
// `GET /jobs/employers/{idOrSlug}` (anonymous; gaps G-1 and G-2). The employer
// page was left calling a route that never existed on the strength of it. The
// read lives in `lib/employer-profile-api.ts`.

/**
 * There is no `GET /jobs/applications/{id}`.
 *
 * A full `JobApplicationResponse` — the record carrying `answers`,
 * `attachments` and `history` — is returned by `apply` and by `decide` and by
 * nothing else. The list route returns `ApplicationCardResponse`, which
 * deliberately carries no history: an applicant list of twenty rows must not
 * drag several hundred timeline entries with it.
 *
 * So an application timeline is visible **only in the moment it is written**.
 * The hooks cache what a mutation returned for exactly this reason.
 */
export const APPLICATION_DETAIL_ROUTE_ABSENT =
  'No backend route reads one application. GET /jobs/applications returns cards without history.';

/**
 * Interviews and offers are write-only collections.
 *
 * `POST /applications/{id}/interviews`, `POST /interviews/{id}/outcome`,
 * `POST /applications/{id}/offers` and `POST /offers/{id}/respond` all exist.
 * **No route lists either.** A candidate sees theirs inside
 * `GET /jobs/candidate/dashboard` — `outstandingOffers` and `upcomingInterviews`
 * — and an employer sees `upcomingInterviewCount` and `outstandingOfferCount`,
 * which are numbers.
 *
 * An employer-side interview schedule or offer list is therefore not buildable
 * against this backend, and this client does not pretend otherwise.
 */
export const INTERVIEW_AND_OFFER_LIST_ROUTES_ABSENT =
  'No backend route lists interviews or offers. A candidate reads them from the dashboard; ' +
  'an employer gets counts only.';

// ── Request plumbing ─────────────────────────────────────────────────────────

/** Drops nulls, undefineds and blanks so axios does not serialise `?jobId=null`. */
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

async function post<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.post<Envelope<T>>(url, data);
  return response.data.data;
}

async function put<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.put<Envelope<T>>(url, data);
  return response.data.data;
}

// ── Vocabularies the server accepts ──────────────────────────────────────────
//
// Exported so a picker is built from the set the server can parse rather than
// from a hand-written list beside it. Property 2 in the header is why this
// matters more than it looks: a value the server cannot parse is *dropped*, not
// refused, so a picker offering a wrong spelling produces an unfiltered list
// that looks like a working filter with a wide match.

/** Every status an application can hold. The filter vocabulary of the list route. */
export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'Submitted',
  'UnderReview',
  'Shortlisted',
  'InterviewScheduled',
  'InterviewCompleted',
  'OfferExtended',
  'Accepted',
  'Rejected',
  'Withdrawn',
] as const;

/**
 * The statuses an employer may move an application **to**.
 *
 * `Withdrawn` is absent because it is the candidate's own decision with its own
 * route and its own policy, and `Submitted` because it is where an application
 * starts rather than somewhere it can be sent.
 */
export const EMPLOYER_DECISION_STATUSES: readonly EmployerDecisionStatus[] = [
  'UnderReview',
  'Shortlisted',
  'InterviewScheduled',
  'InterviewCompleted',
  'OfferExtended',
  'Accepted',
  'Rejected',
] as const;

/**
 * The legal moves, mirroring `Domain/Policies/ApplicationStatusTransitions.cs`.
 *
 * Duplicated on the device for **one** purpose: disabling a control the server
 * would refuse, so an employer is not offered "extend an offer" on an
 * application that was rejected last week. It is not an authority — the server's
 * `MoveTo` is, and it answers `jobs.application.transition-invalid`. A screen
 * must still handle that failure, because this table can drift and the server's
 * cannot.
 *
 * The asymmetry is the design: an employer walks an application forward one step
 * at a time and may reject at any point; a candidate may withdraw from every
 * non-terminal state, including the day before an offer.
 */
const ALLOWED_DECISIONS: Readonly<Record<ApplicationStatus, readonly EmployerDecisionStatus[]>> = {
  Submitted: ['UnderReview', 'Shortlisted', 'Rejected'],
  UnderReview: ['Shortlisted', 'InterviewScheduled', 'Rejected'],
  // Some employers offer straight off a shortlist. Uncommon, entirely legitimate.
  Shortlisted: ['InterviewScheduled', 'OfferExtended', 'Rejected'],
  // A cancelled interview returns the candidate to the shortlist. The one
  // backward move the domain permits.
  InterviewScheduled: ['InterviewCompleted', 'Shortlisted', 'Rejected'],
  InterviewCompleted: ['InterviewScheduled', 'OfferExtended', 'Rejected'],
  OfferExtended: ['Accepted', 'Rejected'],
  Accepted: [],
  Rejected: [],
  Withdrawn: [],
};

/** Whether an application has reached an ending it cannot move from. */
export function isTerminalStatus(status: ApplicationStatus): boolean {
  return status === 'Accepted' || status === 'Rejected' || status === 'Withdrawn';
}

/**
 * What an employer may move this application to, right now.
 *
 * Empty for a terminal status, which is what a decision control should render as
 * "no further action" rather than as a disabled picker with seven greyed rows.
 */
export function allowedDecisionsFrom(status: ApplicationStatus): readonly EmployerDecisionStatus[] {
  return ALLOWED_DECISIONS[status] ?? [];
}

/**
 * Refuses any spelling that is not the wire's own.
 *
 * Property 2 made loud, and deliberately **stricter than the server**. The
 * server forgives case and silently drops separators, and from this side those
 * two outcomes are indistinguishable: one returns the right rows, the other
 * returns *all* of them, both at HTTP 200 with no diagnostic anywhere. A member
 * would read the second as "I have 40 applications under review".
 *
 * So a chip sending `'under_review'` — the kebab/snake spelling every other list
 * surface in this application uses — fails here, loudly, at the call site that
 * built it, rather than rendering an unfiltered list under a filter's name.
 */
function assertKnownStatuses(statuses: readonly ApplicationStatus[] | null | undefined): void {
  if (!statuses || statuses.length === 0) return;

  const unknown = statuses.filter((status) => !APPLICATION_STATUSES.includes(status));
  if (unknown.length === 0) return;

  throw new Error(
    `Unknown application status: ${unknown.join(', ')}. ` +
      'The server drops values it cannot parse, so this would have returned an unfiltered list ' +
      'at HTTP 200. Values are PascalCase with no separators: ' +
      `${APPLICATION_STATUSES.join(', ')}.`
  );
}

/**
 * Which detail `ScheduleInterviewRequest` requires for a given mode.
 *
 * `ScheduleInterviewCommandHandler.cs:88-95` refuses the mismatched pair with
 * `jobs.interview.location.invalid`. Encoded here so a scheduling form asks for
 * the right field rather than discovering it from a 400 after the employer has
 * filled in everything else.
 *
 * `Assessment` requires neither: an assessment is a link the candidate is sent
 * or a task they are given, and the handler does not insist on either.
 */
export function interviewDetailRequirement(mode: InterviewMode): 'address' | 'joiningUrl' | 'none' {
  if (mode === 'OnSite') return 'address';
  if (mode === 'Assessment') return 'none';
  return 'joiningUrl';
}

// ── Cache keys ───────────────────────────────────────────────────────────────
//
// Everything here is caller-scoped through the bearer token: the same
// `GET /jobs/applications` is one member's tracker and another's, under an
// identical key. That is handled by clearing the cache on sign-in and sign-out,
// as every other read in this client does, rather than by putting a member id in
// the key.

export const jobsHiringKeys = {
  all: ['jobs-hiring'] as const,

  applications: () => ['jobs-hiring', 'applications'] as const,
  applicationList: (query: ApplicationListQuery = {}) =>
    ['jobs-hiring', 'applications', 'list', applicationQueryToken(query)] as const,
  /**
   * One application's full record.
   *
   * There is no route that fetches this — see `APPLICATION_DETAIL_ROUTE_ABSENT`
   * — so nothing ever populates this key from the network. It holds what `apply`
   * and `decide` returned, and that is the only way an application's history is
   * ever on the device.
   */
  application: (applicationId: string) =>
    ['jobs-hiring', 'applications', 'detail', applicationId] as const,

  /**
   * One job, `GET /jobs/{jobId}`. Under the module root on purpose: an
   * application or a withdrawal changes its `hasApplied`, and the workflow
   * invalidation reaches it without anyone remembering to.
   */
  job: (jobId: string) => ['jobs-hiring', 'job', jobId] as const,

  candidateDashboard: () => ['jobs-hiring', 'candidate', 'dashboard'] as const,
  /** `GET /jobs/candidate/profile` — null before the member has a profile. */
  candidateProfile: () => ['jobs-hiring', 'candidate', 'profile'] as const,

  employerDashboard: (employerId?: string | null) =>
    ['jobs-hiring', 'employer', 'dashboard', employerId ?? 'default'] as const,
  /** What a registration or an update returned. The public read is `employerProfile`. */
  employer: (employerId: string) => ['jobs-hiring', 'employer', employerId] as const,
  /** `GET /jobs/employers/{idOrSlug}` — the profile as this viewer may see it. */
  employerProfile: (idOrSlug: string) => ['jobs-hiring', 'employer-profile', idOrSlug] as const,
  /** The employer's open jobs, `POST /jobs/search` with `employerId`. */
  employerJobs: (employerId: string) => ['jobs-hiring', 'employer-jobs', employerId] as const,
};

/**
 * A stable token for the filter half of an applications request.
 *
 * `cursor` is excluded deliberately: it is the page pointer, an infinite query
 * owns it, and folding it into the key would give every page its own cache entry
 * and defeat the query entirely.
 *
 * `statuses` is sorted so that `['Submitted','UnderReview']` and the reverse are
 * one cache entry rather than two holding identical rows.
 */
function applicationQueryToken(query: ApplicationListQuery): string {
  return JSON.stringify({
    employerId: query.employerId ?? null,
    jobId: query.jobId ?? null,
    statuses: query.statuses ? [...query.statuses].sort() : null,
    activeOnly: query.activeOnly ?? false,
    stageKey: query.stageKey ?? null,
    unviewedOnly: query.unviewedOnly ?? false,
    oldestFirst: query.oldestFirst ?? false,
    limit: query.limit ?? null,
  });
}

// ── Applying ─────────────────────────────────────────────────────────────────

/**
 * `POST /jobs/{jobId}/apply` — **201**, policy `jobs.apply.submit`.
 *
 * **This resolves only when the server confirmed the application.** There is no
 * idempotency key on this module and a second apply is a 409, so a client that
 * retried on a timeout would either double-submit or report a success it never
 * saw. Any failure propagates; a caller must not treat a rejected promise as
 * "probably fine".
 *
 * **An account is enough — 14 Sep 2026.** This used to answer
 * `jobs.not-candidate` (403) for a member with no candidate profile, and the app
 * sent them away to write a headline before any employer received anything. The
 * server now creates the candidate profile, private and empty, with a member's
 * first application, and the employer sees the applicant by their account name.
 *
 * The refusals a screen should expect, in the order the handler checks them
 * (`ApplyToJobCommandHandler.cs:85-143`) — the order is the candidate's, not the
 * validator's:
 *
 *   * `jobs.posting.not-found` (404) — including for a draft or hidden posting,
 *     deliberately, so a guessed identifier learns nothing.
 *   * `jobs.posting.no-vacancies` / `jobs.posting.expired` /
 *     `jobs.application.closed` (409) — the most specific reason available, so
 *     the candidate knows whether to wait or move on.
 *   * `jobs.application.self` (**400**, not 403 — it is `Error.Validation` at
 *     `JobErrors.cs:487`) — a recruiter for the hiring employer cannot apply to
 *     their own posting. They could then decide on it.
 *   * `jobs.application.already-applied` (409).
 *   * `jobs.applications.too-many` (429) — a per-candidate daily ceiling.
 *   * `jobs.application.resume-required` (400) — the posting requires one and
 *     the candidate has no default.
 *   * `jobs.application.answer.invalid` (400) — a required screening question
 *     was blank or missing.
 *
 * An empty request is valid. Every field on `ApplyToJobRequest` is optional.
 */
export function applyToJob(
  jobId: string,
  request: ApplyToJobRequest = {}
): Promise<JobApplicationResponse> {
  return post<JobApplicationResponse>(`${ROOT}/${segment(jobId)}/apply`, {
    resumeId: request.resumeId ?? null,
    coverLetter: request.coverLetter ?? null,
    // Sent as arrays rather than omitted: the server's defaults are `[]`, and a
    // request that states what it carries survives a change to that default.
    answers: request.answers ?? [],
    attachments: request.attachments ?? [],
  });
}

/**
 * `GET /jobs/applications` — policy `jobs.applications.review`.
 *
 * **A real `CursorPagedResult<T>`**, so `readPage` handles it. Property 5 in the
 * header records how that was verified rather than assumed; the integration test
 * pins it, because the failure mode when a page shape is wrong is an empty list
 * with no error anywhere.
 *
 * Omitting `employerId` returns the caller's own applications. Supplying it
 * returns that employer's applicant list and **requires membership** — a caller
 * who names an employer they do not belong to gets `jobs.employer.not-owned`
 * (403), not an empty list. There is no parameter that asks for a third party's.
 */
export async function fetchApplications(
  query: ApplicationListQuery = {}
): Promise<Page<ApplicationCardResponse>> {
  assertKnownStatuses(query.statuses);

  const response = await apiClient.get(`${ROOT}/applications`, {
    params: params({
      employerId: query.employerId,
      jobId: query.jobId,
      // Repeated `?status=` values, which is what `string[]? Statuses` binds.
      //
      // This comment used to assert that axios does that by default. It does
      // not — 1.x emits `status[]=A&status[]=B`, ASP.NET binds nothing from it,
      // and the route answered with every application the member had ever sent.
      // `apiClient` now sets `paramsSerializer: { indexes: null }`; see the note
      // there. Left as a correction rather than deleted, because the wrong
      // version sat directly above the call it was wrong about and still read
      // as a reason to trust the code.
      status: query.statuses,
      active: query.activeOnly,
      stage: query.stageKey,
      unviewed: query.unviewedOnly,
      oldest: query.oldestFirst,
      cursor: query.cursor,
      limit: query.limit,
    }),
  });

  return readPage<ApplicationCardResponse>(response.data);
}

/**
 * `POST /jobs/applications/{applicationId}/withdraw` — **200 with `data: null`**,
 * policy `jobs.application.withdraw`.
 *
 * Returns void rather than the null, so a caller cannot be tempted to read
 * something off it. The withdrawn application is **not** returned, so the only
 * correct follow-up is an invalidation — which is what the hook does.
 *
 * **The applicant themselves, and nobody else — not even staff.**
 * `WithdrawApplicationCommandHandler.cs:57-64` requires ownership rather than a
 * permission, so withdrawing on somebody's behalf is not a support action this
 * module offers. A screen must never expose it on an employer surface.
 *
 * Read `canWithdraw` off the application rather than deriving it: the server
 * answers `jobs.application.not-withdrawable` for a terminal one.
 */
export async function withdrawApplication(
  applicationId: string,
  request: WithdrawApplicationRequest = {}
): Promise<void> {
  await post<null>(`${ROOT}/applications/${segment(applicationId)}/withdraw`, {
    reason: request.reason ?? null,
  });
}

/**
 * `POST /jobs/applications/{applicationId}/decide` — **200**, policy
 * `jobs.applications.decide`.
 *
 * Returns the updated application in full, history included and filtered for the
 * employer — so the answer is worth caching rather than discarding.
 *
 * **`reasonVisibleToCandidate` is stated explicitly, always.** The server
 * defaults it to `true` (`DecideApplicationRequest.cs:29`), so an omitted field
 * publishes the reason to the candidate. That is usually the right choice and
 * must never be an accident; the caller decides and this function does not.
 *
 * Refuses `jobs.application.transition-invalid` for a move
 * `ApplicationStatusTransitions` does not permit, and
 * `jobs.employer.not-owned` for a caller who is not a `Recruiter` of the hiring
 * employer — the policy alone is never sufficient.
 */
export function decideApplication(
  applicationId: string,
  request: DecideApplicationRequest
): Promise<JobApplicationResponse> {
  return post<JobApplicationResponse>(`${ROOT}/applications/${segment(applicationId)}/decide`, {
    status: request.status,
    reason: request.reason ?? null,
    reasonVisibleToCandidate: request.reasonVisibleToCandidate ?? true,
  });
}

// ── Interviews ───────────────────────────────────────────────────────────────

/**
 * `POST /jobs/applications/{applicationId}/interviews` — **201**, policy
 * `jobs.interviews.schedule`.
 *
 * The mode decides which detail is mandatory; see `interviewDetailRequirement`.
 * Scheduling also moves the application to `InterviewScheduled` when it is not
 * there already, so an applicant list must be invalidated alongside.
 *
 * Refusals: `jobs.application.already-decided` (409) on a terminal application,
 * `jobs.interview.location.invalid` (400) for the wrong detail,
 * `jobs.interview.in-past` (400), `jobs.interviews.limit` (409).
 */
export function scheduleInterview(
  applicationId: string,
  request: ScheduleInterviewRequest
): Promise<InterviewResponse> {
  return post<InterviewResponse>(`${ROOT}/applications/${segment(applicationId)}/interviews`, {
    mode: request.mode,
    scheduledAt: request.scheduledAt,
    durationMinutes: request.durationMinutes,
    timeZoneId: request.timeZoneId ?? null,
    title: request.title ?? null,
    locationAddress: request.locationAddress ?? null,
    joiningUrl: request.joiningUrl ?? null,
    instructions: request.instructions ?? null,
    participants: request.participants ?? [],
  });
}

/**
 * `POST /jobs/interviews/{interviewId}/outcome` — **200**, policy
 * `jobs.interviews.record`.
 *
 * Note the route hangs off the **interview**, while scheduling hangs off the
 * application. That is deliberate and the two have different policies.
 *
 * `feedback` is the panel's and is never shown to the candidate;
 * `candidateFeedback` is the version chosen to share. A form with one box for
 * both would put an internal note in front of the person it is about.
 */
export function recordInterviewOutcome(
  interviewId: string,
  request: RecordInterviewOutcomeRequest
): Promise<InterviewResponse> {
  return post<InterviewResponse>(`${ROOT}/interviews/${segment(interviewId)}/outcome`, {
    outcome: request.outcome,
    feedback: request.feedback ?? null,
    candidateFeedback: request.candidateFeedback ?? null,
  });
}

// ── Offers ───────────────────────────────────────────────────────────────────

/**
 * `POST /jobs/applications/{applicationId}/offers` — **201**, policy
 * `jobs.offers.extend`.
 *
 * **`extendImmediately` is stated explicitly, always.** It defaults to `true` on
 * the server, so an omitted field sends the offer to the candidate rather than
 * leaving it a draft for internal approval — and "I only filled in the form" is
 * exactly when that default is wrong.
 *
 * The salary is required by the contract, and that is a decision in the
 * candidate's favour rather than a validation detail: see `ExtendOfferRequest`.
 *
 * Refusals: `jobs.offer.already-extended` (409),
 * `jobs.offer.expiry.in-past` (400), `jobs.offer.terms.invalid` (400).
 */
export function extendOffer(
  applicationId: string,
  request: ExtendOfferRequest
): Promise<JobOfferResponse> {
  return post<JobOfferResponse>(`${ROOT}/applications/${segment(applicationId)}/offers`, {
    salaryAmount: request.salaryAmount,
    currencyCode: request.currencyCode.trim().toUpperCase(),
    salaryPeriod: request.salaryPeriod,
    startDate: request.startDate ?? null,
    expiresAt: request.expiresAt,
    benefitsSummary: request.benefitsSummary ?? null,
    notes: request.notes ?? null,
    includesRelocation: request.includesRelocation ?? false,
    includesVisaSponsorship: request.includesVisaSponsorship ?? false,
    // Never inferred. See above.
    extendImmediately: request.extendImmediately ?? true,
  });
}

/**
 * `POST /jobs/offers/{offerId}/respond` — **200**, policy `jobs.offers.respond`.
 *
 * The candidate's route, and its permission is **granted under restriction** —
 * an offer is time-limited and must not lapse because somebody was suspended
 * (`HiringEndpoints.cs:91-92`).
 *
 * Gate the control on `offer.canRespond`, never on comparing `expiresAt` to the
 * device clock: `status` is already computed against the server's clock, so an
 * offer that reads `Expired` here has expired regardless of what the phone
 * thinks. Refusals: `jobs.offer.expired` (409), `jobs.offer.already-decided`
 * (409), `jobs.offer.not-extended` (409) on a draft.
 */
export function respondToOffer(
  offerId: string,
  request: RespondToOfferRequest
): Promise<JobOfferResponse> {
  return post<JobOfferResponse>(`${ROOT}/offers/${segment(offerId)}/respond`, {
    accept: request.accept,
    reason: request.reason ?? null,
  });
}

// ── The candidate's own surfaces ─────────────────────────────────────────────

/**
 * `POST /jobs/candidate/profile` — **201**, policy `jobs.candidate.manage`.
 *
 * **Created `Private`.** There is no field on the request that could say
 * otherwise, and changing it afterwards is `changeCandidateVisibility`.
 *
 * Nothing is required — a blank headline is sent as null. Refuses
 * `jobs.candidate.already-exists` (409) for a member who already has one, which
 * includes anyone who has applied for a job: this is not an upsert.
 */
export function createCandidateProfile(
  request: CreateCandidateProfileRequest
): Promise<CandidateProfileResponse> {
  return post<CandidateProfileResponse>(`${ROOT}/candidate/profile`, {
    headline: request.headline?.trim() || null,
    summary: request.summary ?? null,
    countryCode: request.countryCode ?? null,
    cityName: request.cityName ?? null,
  });
}

/**
 * `PUT /jobs/candidate/profile` — **200**, policy `jobs.candidate.manage`.
 *
 * A **whole-document save**: an omitted optional field is cleared, not left
 * alone. A screen must start from `fetchCandidateProfile` and send every field
 * back, or it blanks the ones the member did not touch.
 *
 * `isOpenToWork` defaults to `true` server-side and is stated explicitly here
 * for the same reason as `extendImmediately`.
 */
export function updateCandidateProfile(
  request: UpdateCandidateProfileRequest
): Promise<CandidateProfileResponse> {
  return put<CandidateProfileResponse>(`${ROOT}/candidate/profile`, {
    headline: request.headline?.trim() || null,
    summary: request.summary ?? null,
    countryCode: request.countryCode ?? null,
    cityName: request.cityName ?? null,
    experienceLevel: request.experienceLevel,
    remotePreference: request.remotePreference ?? null,
    expectedSalaryMinimum: request.expectedSalaryMinimum ?? null,
    expectedSalaryCurrency: request.expectedSalaryCurrency ?? null,
    expectedSalaryPeriod: request.expectedSalaryPeriod ?? null,
    expectedSalaryFlexible: request.expectedSalaryFlexible ?? false,
    noticePeriodDays: request.noticePeriodDays ?? null,
    isOpenToWork: request.isOpenToWork ?? true,
    baseRevision: request.baseRevision ?? null,
  });
}

/**
 * `PUT /jobs/candidate/profile/visibility` — **200 with `data: null`**, policy
 * `jobs.candidate.manage`.
 *
 * Its own route because it is the one setting a candidate changes urgently and
 * alone — somebody who has just realised their employer can find them wants a
 * single tap, not a form that also rewrites their work history and can fail
 * validation on an unrelated field.
 *
 * Returns void: the profile is not returned, so there is nothing to write into
 * the cache. Note the server answers an unparseable visibility with
 * `jobs.candidate.headline.invalid`, which is a mislabelled error code on the
 * backend rather than anything the client did wrong
 * (`ChangeCandidateVisibilityCommandHandler.cs:39`) — a screen must not surface
 * that string to a member.
 */
export async function changeCandidateVisibility(visibility: CandidateVisibility): Promise<void> {
  const request: ChangeCandidateVisibilityRequest = { visibility };
  await put<null>(`${ROOT}/candidate/profile/visibility`, request);
}

/**
 * `GET /jobs/candidate/profile` — the member's own candidate profile, policy
 * `jobs.candidate.manage`.
 *
 * **Null before they have one**, which the server says as `jobs.not-candidate`.
 * Anything else propagates: a request that failed is not an answer of "none",
 * and a form that took it as one would offer to create a profile that exists.
 */
export async function fetchCandidateProfile(): Promise<CandidateProfileResponse | null> {
  try {
    return await get<CandidateProfileResponse>(`${ROOT}/candidate/profile`);
  } catch (cause) {
    if (isNotCandidateError(cause)) return null;
    throw cause;
  }
}

/**
 * `GET /jobs/candidate/dashboard` — policy `jobs.saved.manage`.
 *
 * Note the policy: the job seeker's dashboard is gated on **saved-jobs
 * management**, not on `jobs.candidate.manage`. A member who can save a job can
 * read this, whether or not they have a candidate profile — `candidateId` comes
 * back null when they have none, and the client prompts.
 *
 * The only route on the module that returns a candidate's interviews or offers.
 */
export function fetchCandidateDashboard(): Promise<CandidateDashboardResponse> {
  return get<CandidateDashboardResponse>(`${ROOT}/candidate/dashboard`);
}

// ── Employers ────────────────────────────────────────────────────────────────

/**
 * `POST /jobs/employers` — **201**, policy `jobs.employer.create`.
 *
 * Registers an employer with the caller as its **first owner**. There is no
 * route that adds a second member, so the registering account is the only one
 * that can act on it until one exists.
 *
 * `countryCode` must be exactly two characters — the validator applies
 * `.Length(2)` before any database round trip. Upper-cased here rather than
 * hoping the form did it.
 */
export function registerEmployer(request: RegisterEmployerRequest): Promise<EmployerResponse> {
  return post<EmployerResponse>(`${ROOT}/employers`, {
    displayName: request.displayName,
    legalName: request.legalName ?? null,
    registrationNumber: request.registrationNumber ?? null,
    organizationType: request.organizationType,
    companySize: request.companySize ?? null,
    foundedYear: request.foundedYear ?? null,
    countryCode: request.countryCode.trim().toUpperCase(),
    slug: request.slug ?? null,
    description: request.description ?? null,
  });
}

/**
 * `PUT /jobs/employers/{employerId}` — **200**, policy `jobs.employer.manage`.
 *
 * A whole-document save, and **`slug` is not on it**: the handle is chosen at
 * registration and never again. Branding is by Media reference, never by URL —
 * upload through `/api/v1/media` first and send the identifier.
 *
 * The policy is necessary and not sufficient: the handler additionally requires
 * the caller to be an `Administrator` of this employer.
 */
export function updateEmployer(
  employerId: string,
  request: UpdateEmployerRequest
): Promise<EmployerResponse> {
  return put<EmployerResponse>(`${ROOT}/employers/${segment(employerId)}`, {
    displayName: request.displayName,
    legalName: request.legalName ?? null,
    registrationNumber: request.registrationNumber ?? null,
    organizationType: request.organizationType,
    companySize: request.companySize ?? null,
    foundedYear: request.foundedYear ?? null,
    countryCode: request.countryCode.trim().toUpperCase(),
    description: request.description ?? null,
    contactEmail: request.contactEmail ?? null,
    contactPhone: request.contactPhone ?? null,
    websiteUrl: request.websiteUrl ?? null,
    careersUrl: request.careersUrl ?? null,
    logoMediaId: request.logoMediaId ?? null,
    coverMediaId: request.coverMediaId ?? null,
    tagline: request.tagline ?? null,
    baseRevision: request.baseRevision ?? null,
  });
}

/**
 * `GET /jobs/employers/dashboard` — policy `jobs.applications.review`.
 *
 * `employerId` is **optional by design**: a recruiter who belongs to exactly one
 * employer should not have to name it, and one who belongs to several must
 * (`EmployerEndpoints.cs:54-55`). Omitting it when the caller belongs to several
 * is a refusal rather than an arbitrary pick.
 */
export function fetchEmployerDashboard(
  employerId?: string | null
): Promise<EmployerDashboardResponse> {
  return get<EmployerDashboardResponse>(`${ROOT}/employers/dashboard`, { employerId });
}

// ── Reading what came back ───────────────────────────────────────────────────

/**
 * How many applications are in a given status, from a dashboard's map.
 *
 * The map is keyed by the **PascalCase wire status** and a status with none may
 * be **absent rather than zero**, so `dashboard.applicationsByStatus.submitted`
 * is `undefined` twice over — wrong case, and possibly missing. This narrows
 * both in one place.
 */
export function applicationsInStatus(
  byStatus: Record<string, number> | null | undefined,
  status: ApplicationStatus
): number {
  return byStatus?.[status] ?? 0;
}

/**
 * Whether a responsiveness figure may be rendered at all.
 *
 * **Null is not zero.** Every rate on `EmployerResponsivenessResponse` is null
 * below the platform's sample threshold, and a screen that coalesced to 0 would
 * publish "0% ghosting, 0h response time" about an employer nobody has measured
 * — a fabricated endorsement of a named organisation, generated by the platform.
 */
export function hasResponsivenessEvidence(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Whether an application is waiting on an employer who has not opened it.
 *
 * The one derived fact a tracker genuinely needs, and it is two fields rather
 * than one: `daysWaiting` is **null once decided**, so an unopened-but-decided
 * application is not "waiting" no matter what `hasBeenViewed` says.
 */
export function isAwaitingFirstView(card: ApplicationCardResponse): boolean {
  return card.isActive && !card.hasBeenViewed && typeof card.daysWaiting === 'number';
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

/** Whether this failure is "you have already applied to this job". */
export function isAlreadyAppliedError(cause: unknown): boolean {
  return problemCode(cause) === 'jobs.application.already-applied';
}

/**
 * Whether the posting is no longer taking applications.
 *
 * Three codes, because the handler answers the **most specific** reason it can
 * so the candidate knows whether to wait or move on. A screen that wants the
 * distinction should read the code; one that only needs "you cannot apply" wants
 * this.
 */
export function isApplicationsClosedError(cause: unknown): boolean {
  const code = problemCode(cause);
  return (
    code === 'jobs.application.closed' ||
    code === 'jobs.posting.expired' ||
    code === 'jobs.posting.no-vacancies'
  );
}

/**
 * Whether the caller tried to apply to a posting from the hiring employer's own
 * team. A **400**, not a 403 — it is `Error.Validation` on the server.
 */
export function isSelfApplicationError(cause: unknown): boolean {
  return problemCode(cause) === 'jobs.application.self';
}

/**
 * Whether the member has no candidate profile yet.
 *
 * No longer something applying can return: since 14 Sep 2026 a first application
 * creates the profile. Reading, editing or hiding a profile that does not exist
 * still answers it.
 */
export function isNotCandidateError(cause: unknown): boolean {
  return problemCode(cause) === 'jobs.not-candidate';
}

/** Whether the candidate has hit the per-day application ceiling. */
export function isTooManyApplicationsError(cause: unknown): boolean {
  return httpStatus(cause) === 429 || problemCode(cause) === 'jobs.applications.too-many';
}

/** Whether the posting requires a résumé and the candidate has no default. */
export function isResumeRequiredError(cause: unknown): boolean {
  return problemCode(cause) === 'jobs.application.resume-required';
}

/** Whether this member already has a candidate profile. Create is not an upsert. */
export function isCandidateProfileExistsError(cause: unknown): boolean {
  return problemCode(cause) === 'jobs.candidate.already-exists';
}

/** Whether the employer refused because the caller is not on its team. */
export function isNotEmployerMemberError(cause: unknown): boolean {
  const code = problemCode(cause);
  return code === 'jobs.employer.not-owned' || code === 'jobs.not-recruiter';
}

/**
 * A sentence a member can act on, from the platform's problem envelope.
 *
 * Ordered by what the reader most needs to hear. The fall-through prefers the
 * server's own `detail` over a generic line — a rejection reason an employer
 * wrote is worth far more to a candidate than anything this function could say.
 */
export function jobsHiringErrorMessage(cause: unknown): string {
  if (httpStatus(cause) === 401) {
    return 'Sign in to continue with this application.';
  }

  if (isNotCandidateError(cause)) {
    return 'You have not set up a work profile yet.';
  }

  if (isAlreadyAppliedError(cause)) {
    return 'You have already applied to this job.';
  }

  if (isApplicationsClosedError(cause)) {
    return 'This role is no longer taking applications.';
  }

  if (isSelfApplicationError(cause)) {
    return 'You cannot apply to a role posted by an employer you work for.';
  }

  if (isTooManyApplicationsError(cause)) {
    return 'You have reached today’s application limit. Try again tomorrow.';
  }

  if (isResumeRequiredError(cause)) {
    return 'This role requires a CV. Add one to your profile before applying.';
  }

  if (isNotEmployerMemberError(cause)) {
    return 'You do not have access to this employer’s hiring workspace.';
  }

  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) return detail;

  return 'We could not reach the jobs service just now.';
}
