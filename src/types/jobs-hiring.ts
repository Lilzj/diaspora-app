// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Jobs hiring-workflow wire mirror (Remediation Wave K)
//
// `Diaspora.Modules.Jobs` serves 28 routes under `/api/v1/jobs`. This client
// supported exactly four of them — browse, detail, create, and a blind
// `POST /{id}/apply` — and consumed **none** of the hiring workflow: no
// applications list, no withdrawal, no employer decision, no interviews, no
// offers, no candidate profile, no dashboards, no employer registration.
//
// Every name below is the name the wire uses. Nothing is renamed for taste:
// a field called `stageKey` on the server is `stageKey` here, so that a reader
// holding the backend source and this file can compare them line for line
// without a translation table in the middle. Where the platform's own spelling
// is a trap — `hoursToFirstResponse` being null rather than 0, `canWithdraw`
// being the server's answer rather than a status check — the trap is documented
// on the field.
//
// ── The four things worth knowing before touching any of this ────────────────
//
// **1. Enum values are PascalCase.** All of them. `JobWireNames.ToWire` is
// `value.ToString()` on the CLR enum member — `Application/Services/
// JobWireNames.cs:22-78` — so the wire carries `UnderReview`, `InterviewScheduled`,
// `OnSite`, `VerifiedEmployers`, `RecruitmentAgency`. This is the **opposite of
// Community**, whose every enum is camelCase (`hateSpeech`, `verifiedMembers`)
// and which is consumed on adjacent screens, and it matches Recommendations.
// A client that lower-cased a status here would have every filter silently drop.
//
// Property *names* are camelCase — `Program.cs:126` sets
// `PropertyNamingPolicy = CamelCase` — so the mix is camelCase keys holding
// PascalCase values, in the same object. That is genuinely what arrives.
//
// **2. Parsing is case-insensitive and forgiving, which hides mistakes.**
// `JobWireNames.Parse` uses `Enum.TryParse(ignoreCase: true)` and returns null
// rather than throwing, and `ParseMany` **drops** the values it cannot read
// (`JobWireNames.cs:147-163`). So `?status=underreview&status=nonsense` is not a
// 400 — it applies the first filter and silently ignores the second.
//
// Because case is forgiven, it is **separators** that break: `under_review` and
// `under-review` — the spelling every other list surface in this application
// uses for a filter value — are unreadable and dropped. And a filter set that
// ends up empty is treated as *no filter*, so a chip sending one returns the
// **complete** list at HTTP 200. Not an empty one: a wrong filter here looks
// like a working filter with a very broad match, which is far harder to notice.
//
// **3. The one list route is a real `CursorPagedResult<T>`.** `GET /jobs/
// applications` returns `{ items, nextCursor, hasMore, totalCount }` —
// `ListApplicationsQuery.cs:17` types it, `SharedKernel/Pagination/
// CursorPagedResult.cs:8` names the rows `items`. So `readPage` in
// `lib/platform-envelope.ts` absorbs it correctly, unlike `CommentThreadResponse`
// which names its rows `comments` and comes back empty. It was checked rather
// than assumed; see the note over `fetchApplications`.
//
// **4. No route in this module takes an idempotency key.** Not as a header, not
// as a body field. Automation requires one in the *body* and reads no headers;
// several other modules ship an `IdempotencyHeader` class. Jobs has neither —
// `grep -r Idempot` across the module finds only doc comments on the two save
// routes, which are idempotent by construction. Apply is therefore **not**
// safe to retry: a second `POST /{jobId}/apply` is `jobs.application.already-applied`.
//
// ── What this module does NOT offer, and each absence is load-bearing ────────
//
// Confirmed by reading every `Map*` call in `Api/` — there are 28 and no more:
//
//   * **`GET /employers/{idOrSlug}` exists** (gaps G-1 and G-2, anonymous). This
//     line said the opposite — "NG-04, confirmed" — until 15 Sep 2026, and the
//     employer page kept calling a route that never existed because of it.
//     No route lists the employers a member belongs to.
//   * **`GET /candidate/profile` exists** (the server closed gap G-5). It
//     answers the member's own profile, or `jobs.not-candidate` before they have
//     one — and since 14 Sep 2026 a member's first application creates one.
//   * **No `GET /applications/{id}`.** An application detail — the record with
//     `answers`, `attachments` and `history` on it — is returned by `apply`,
//     `decide` and nothing else. There is no route that re-reads one.
//   * **No `GET /interviews` and no `GET /offers`.** Both are write-only
//     collections. A candidate's interviews and offers arrive **only** inside
//     `GET /candidate/dashboard`, and an employer sees counts and nothing more.
//   * **No route lists an employer's team**, sets hiring regions, or manages a
//     pipeline. `SetHiringRegionsRequest` and `HiringPipelineResponse` exist as
//     contracts with no endpoint on top — which is exactly the shape of thing a
//     grep finds and mistakes for a capability.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enumerations, PascalCase on the wire ─────────────────────────────────────
//
// Declared as unions of the exact strings rather than as `string`, so that a
// screen switching on a status is checked at compile time against the set the
// server can actually emit. The numeric values in the CLR enums are irrelevant
// on the wire and are deliberately not mirrored.

/**
 * `Domain/Enums/ApplicationStatus.cs`.
 *
 * `Withdrawn` is reachable **only** through `POST /applications/{id}/withdraw`.
 * `DecideApplicationRequest` cannot produce it — the route separation is the
 * point, and a client that offered "mark as withdrawn" on an employer surface
 * would be building a control the server refuses.
 */
export type ApplicationStatus =
  | 'Submitted'
  | 'UnderReview'
  | 'Shortlisted'
  | 'InterviewScheduled'
  | 'InterviewCompleted'
  | 'OfferExtended'
  | 'Accepted'
  | 'Rejected'
  | 'Withdrawn';

/** `Domain/Enums/InterviewMode.cs`. Decides which detail the schedule requires. */
export type InterviewMode = 'Phone' | 'Video' | 'OnSite' | 'Panel' | 'Technical' | 'Assessment';

/**
 * `Domain/Enums/InterviewOutcome.cs`.
 *
 * `Pending` is the default and means "not yet held or not yet recorded". It is
 * on every scheduled interview, so it is not an outcome to render as one.
 * `Cancelled` is set by the aggregate, never by `RecordInterviewOutcomeRequest`.
 */
export type InterviewOutcome = 'Pending' | 'Passed' | 'Failed' | 'NoShow' | 'Cancelled' | 'Inconclusive';

/**
 * `Domain/Enums/OfferStatus.cs`.
 *
 * `Expired` is computed **against the clock** by `OfferMapper`, so an offer past
 * its deadline reads `Expired` here before any sweep has written that down —
 * `JobOfferResponse.cs:5-9`. Never derive expiry on the device from `expiresAt`;
 * the server has already done it and its clock is the one that decides.
 */
export type OfferStatus = 'Draft' | 'Extended' | 'Accepted' | 'Rejected' | 'Withdrawn' | 'Expired';

/** `Domain/Enums/SalaryPeriod.cs`. */
export type SalaryPeriod = 'Hourly' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Project';

/**
 * `Domain/Enums/CandidateVisibility.cs`.
 *
 * A profile is **created `Private`** and there is no field on
 * `CreateCandidateProfileRequest` that could say otherwise —
 * `CreateCandidateProfileRequest.cs:9-14`. Visibility is only ever changed by
 * `PUT /candidate/profile/visibility`, which is its own route because it is the
 * setting somebody changes urgently and alone.
 */
export type CandidateVisibility = 'Private' | 'VerifiedEmployers' | 'Members' | 'Public';

/** `Domain/Enums/EmployerOrganizationType.cs`. */
export type EmployerOrganizationType =
  | 'Company'
  | 'Startup'
  | 'RecruitmentAgency'
  | 'StaffingFirm'
  | 'NonProfit'
  | 'Government'
  | 'Educational'
  | 'Healthcare'
  | 'Individual'
  | 'Other';

/** `Domain/Enums/CompanySize.cs`. `Unspecified` is a real value, not an absence. */
export type CompanySize =
  | 'Unspecified'
  | 'Micro'
  | 'Small'
  | 'Medium'
  | 'Large'
  | 'VeryLarge'
  | 'Enterprise';

/** `Domain/Enums/ExperienceLevel.cs`. The candidate's own claim, never computed. */
export type ExperienceLevel =
  | 'Entry'
  | 'Junior'
  | 'Mid'
  | 'Senior'
  | 'Lead'
  | 'Principal'
  | 'Director'
  | 'Executive';

/** `Domain/Enums/EducationLevel.cs`. `None` is a value; it is not "unknown". */
export type EducationLevel =
  | 'None'
  | 'SecondarySchool'
  | 'Vocational'
  | 'Associate'
  | 'Bachelor'
  | 'Master'
  | 'Doctorate'
  | 'Professional';

/** `Domain/Enums/RemotePreference.cs`. */
export type RemotePreference = 'Flexible' | 'OnSiteOnly' | 'HybridPreferred' | 'RemoteOnly';

/** `Domain/Enums/ApplicationAttachmentKind.cs`. */
export type ApplicationAttachmentKind =
  | 'Resume'
  | 'CoverLetter'
  | 'Certificate'
  | 'Portfolio'
  | 'Reference'
  | 'Other';

/** `Domain/Enums/ApplicationEventKind.cs` — the timeline entry kinds. */
export type ApplicationEventKind =
  | 'Submitted'
  | 'StatusChanged'
  | 'StageChanged'
  | 'InterviewScheduled'
  | 'InterviewCompleted'
  | 'OfferExtended'
  | 'OfferAnswered'
  | 'NoteAdded'
  | 'Withdrawn'
  | 'Viewed';

/** `Domain/Enums/EmployerMemberRole.cs`, in ascending authority. */
export type EmployerMemberRole = 'Viewer' | 'Recruiter' | 'Administrator' | 'Owner';

/** `Domain/Enums/EmployerStatus.cs`. */
export type EmployerStatus = 'Active' | 'Suspended' | 'Closed';

/** `Domain/Enums/HiringStageKind.cs`. */
export type HiringStageKind =
  | 'Applied'
  | 'Screening'
  | 'Assessment'
  | 'Interview'
  | 'Reference'
  | 'Offer'
  | 'Hired'
  | 'Rejected';

/** `Domain/Enums/WorkAuthorizationKind.cs`. */
export type WorkAuthorizationKind =
  | 'Citizen'
  | 'PermanentResident'
  | 'WorkPermit'
  | 'StudentVisa'
  | 'DependantVisa'
  | 'TreatyRight'
  | 'RequiresSponsorship'
  | 'Other';

/** `Domain/Enums/LanguageProficiency.cs`. */
export type LanguageProficiency = 'Basic' | 'Conversational' | 'Professional' | 'Fluent' | 'Native';

/** `Domain/Enums/SkillProficiency.cs`. */
export type SkillProficiency = 'Unspecified' | 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';

/** `Domain/Enums/JobType.cs`. */
export type JobType =
  | 'FullTime'
  | 'PartTime'
  | 'Contract'
  | 'Temporary'
  | 'Internship'
  | 'Apprenticeship'
  | 'Freelance'
  | 'Volunteer'
  | 'Seasonal'
  | 'Other';

/** `Domain/Enums/WorkplaceType.cs`. */
export type WorkplaceType = 'OnSite' | 'Hybrid' | 'Remote';

/**
 * `Domain/Enums/JobStatus.cs`.
 *
 * Note `Open` and `ReceivingApplications` are distinct: a posting becomes the
 * second the moment its first application lands
 * (`ApplyToJobCommandHandler.cs:185`). Both accept applications; a client that
 * treated only `Open` as applicable would hide the button on every popular role.
 */
export type JobStatus =
  | 'Draft'
  | 'Published'
  | 'Open'
  | 'ReceivingApplications'
  | 'Interviewing'
  | 'OfferMade'
  | 'Filled'
  | 'Expired'
  | 'Archived';

// ── Requests ─────────────────────────────────────────────────────────────────

/**
 * `Contracts/V1/Requests/ApplicationAnswerRequest.cs`.
 *
 * Only the identifier goes up. The question *text* is copied onto the
 * application by the handler from the posting, so a candidate cannot choose what
 * they appear to have been asked.
 */
export interface ApplicationAnswerRequest {
  questionId: string;
  answer: string;
}

/**
 * `Contracts/V1/Requests/ApplicationAttachmentRequest.cs`.
 *
 * A Media reference, never a file. The document must already be uploaded through
 * `/api/v1/media` before it can be named here.
 */
export interface ApplicationAttachmentRequest {
  kind: ApplicationAttachmentKind;
  mediaId: string;
  fileName?: string | null;
}

/**
 * `Contracts/V1/Requests/ApplyToJobRequest.cs`.
 *
 * **Every field is optional.** An empty body is a valid application: the server
 * falls back to the candidate's default résumé and a posting that requires one
 * and finds none is refused with `jobs.application.resume-required` rather than
 * sent without it (`ApplyToJobCommandHandler.cs:140-143`).
 *
 * There is deliberately no draft state — see the record's own summary.
 */
export interface ApplyToJobRequest {
  /** Omitted uses the candidate's default. A résumé owned by somebody else is a 403. */
  resumeId?: string | null;
  coverLetter?: string | null;
  answers?: ApplicationAnswerRequest[];
  attachments?: ApplicationAttachmentRequest[];
}

/** `Contracts/V1/Requests/WithdrawApplicationRequest.cs`. The reason is always optional. */
export interface WithdrawApplicationRequest {
  reason?: string | null;
}

/**
 * `Contracts/V1/Requests/DecideApplicationRequest.cs`.
 *
 * `status` is typed as `EmployerDecisionStatus` rather than `ApplicationStatus`
 * because `Withdrawn` is **not reachable through this shape** — it has its own
 * route, and the separation exists so an employer cannot issue a candidate's
 * withdrawal by passing an enum value (`JobApplicationEndpoints.cs:14-18`).
 *
 * `reasonVisibleToCandidate` defaults to **true** on the server. A screen that
 * left it unset is publishing the reason to the candidate, which is usually
 * right and must never be accidental.
 */
export interface DecideApplicationRequest {
  status: EmployerDecisionStatus;
  reason?: string | null;
  reasonVisibleToCandidate?: boolean;
}

/**
 * The statuses an employer may move an application to.
 *
 * `ApplicationStatus` minus `Submitted` (the starting state, never a target) and
 * minus `Withdrawn` (the candidate's own route). Compare
 * `DecideApplicationRequest.cs:13-16`, which lists exactly these seven.
 */
export type EmployerDecisionStatus =
  | 'UnderReview'
  | 'Shortlisted'
  | 'InterviewScheduled'
  | 'InterviewCompleted'
  | 'OfferExtended'
  | 'Accepted'
  | 'Rejected';

/** `Contracts/V1/Requests/InterviewParticipantRequest.cs`. A name suffices; `userId` is optional. */
export interface InterviewParticipantRequest {
  name: string;
  role?: string | null;
  userId?: string | null;
}

/**
 * `Contracts/V1/Requests/ScheduleInterviewRequest.cs`.
 *
 * **The mode decides which detail is required.** `OnSite` needs
 * `locationAddress`; `Phone`, `Video`, `Panel` and `Technical` need `joiningUrl`.
 * The server answers `jobs.interview.location.invalid` when the pair does not
 * match (`ScheduleInterviewCommandHandler.cs:94`), and
 * `interviewDetailRequirement` in the client encodes the same rule so a form can
 * ask for the right field rather than discover it from a 400.
 */
export interface ScheduleInterviewRequest {
  mode: InterviewMode;
  /** ISO-8601 instant. Must be in the future — `jobs.interview.in-past`. */
  scheduledAt: string;
  durationMinutes: number;
  /** The employer's IANA wall clock. Not redundant with the instant; render both. */
  timeZoneId?: string | null;
  title?: string | null;
  locationAddress?: string | null;
  joiningUrl?: string | null;
  instructions?: string | null;
  participants?: InterviewParticipantRequest[];
}

/**
 * `Contracts/V1/Requests/RecordInterviewOutcomeRequest.cs`.
 *
 * The two feedback fields are separate on purpose: `feedback` is the panel's and
 * is never shown to the candidate, `candidateFeedback` is the version chosen to
 * share. One field would force a choice between an honest internal note and a
 * kind external one.
 */
export interface RecordInterviewOutcomeRequest {
  outcome: RecordableInterviewOutcome;
  /** Internal. Never rendered on a candidate surface. */
  feedback?: string | null;
  candidateFeedback?: string | null;
}

/**
 * The outcomes an employer may record.
 *
 * `Pending` is the default state rather than a conclusion and `Cancelled` is set
 * by the aggregate when an interview is called off — neither is a value this
 * request may carry. `RecordInterviewOutcomeRequest.cs:14` lists exactly these four.
 */
export type RecordableInterviewOutcome = 'Passed' | 'Failed' | 'NoShow' | 'Inconclusive';

/**
 * `Contracts/V1/Requests/ExtendOfferRequest.cs`.
 *
 * **The salary is required here, unlike on a posting.** A candidate asked to
 * accept a job — very often to move country for it — is entitled to the number
 * in writing, and an offer permitting "to be discussed" would be the platform
 * lending its record-keeping to the oldest trick in recruitment.
 *
 * `expiresAt` is enforced against the clock: a past deadline is
 * `jobs.offer.expiry.in-past`.
 */
export interface ExtendOfferRequest {
  salaryAmount: number;
  /** ISO 4217, upper case. Never converted by the platform. */
  currencyCode: string;
  salaryPeriod: SalaryPeriod;
  /** `YYYY-MM-DD`. The wire type is `DateOnly`, not an instant. */
  startDate?: string | null;
  /** ISO-8601 instant. Must be in the future. */
  expiresAt: string;
  benefitsSummary?: string | null;
  notes?: string | null;
  includesRelocation?: boolean;
  includesVisaSponsorship?: boolean;
  /**
   * Send it now, or leave it a draft for internal approval.
   *
   * **Defaults to `true` on the server.** An omitted field extends the offer to
   * the candidate immediately, which is the opposite of what "I only filled in
   * the form" usually means — so the client always states it.
   */
  extendImmediately?: boolean;
}

/** `Contracts/V1/Requests/RespondToOfferRequest.cs`. A declined offer needs no justification. */
export interface RespondToOfferRequest {
  accept: boolean;
  reason?: string | null;
}

/**
 * `Contracts/V1/Requests/CreateCandidateProfileRequest.cs`.
 *
 * Nothing is required. Applying for a job creates an empty profile on its own,
 * so this is for a member who wants to fill one in first. Visibility is
 * deliberately absent: the profile is created `Private`.
 */
export interface CreateCandidateProfileRequest {
  /** Optional since 14 Sep 2026. The one line an employer reads beside a name. */
  headline?: string | null;
  summary?: string | null;
  countryCode?: string | null;
  cityName?: string | null;
}

/**
 * `Contracts/V1/Requests/UpdateCandidateProfileRequest.cs`.
 *
 * A whole-document save: an omitted optional field is a **cleared** field, not
 * an unchanged one. `experienceLevel` becomes required here where the create
 * request had no such field at all.
 *
 * The salary expectation is here because the candidate filters their own
 * searches with it. It is **never disclosed to an employer** — `CandidateMapper`
 * omits `salaryExpectation` for every reader but the owner.
 */
export interface UpdateCandidateProfileRequest {
  /** Optional. Blank clears it — this is a whole-document save. */
  headline?: string | null;
  summary?: string | null;
  countryCode?: string | null;
  cityName?: string | null;
  experienceLevel: ExperienceLevel;
  remotePreference?: RemotePreference | null;
  /** Never shown to an employer. See above. */
  expectedSalaryMinimum?: number | null;
  expectedSalaryCurrency?: string | null;
  expectedSalaryPeriod?: SalaryPeriod | null;
  expectedSalaryFlexible?: boolean;
  noticePeriodDays?: number | null;
  /** Defaults to `true` on the server. */
  isOpenToWork?: boolean;
  /** Optimistic concurrency. Omitting it opts into last-writer-wins. */
  baseRevision?: number | null;
}

/**
 * The body of `PUT /jobs/candidate/profile/visibility`.
 *
 * Note this route binds the **command** directly rather than a request record —
 * `CandidateEndpoints.cs:61` takes `ChangeCandidateVisibilityCommand` from the
 * body — so the field name comes from the command, not from a `*Request` file.
 * It is the same wire shape either way; the provenance is noted because a reader
 * looking for `ChangeCandidateVisibilityRequest.cs` will not find one.
 */
export interface ChangeCandidateVisibilityRequest {
  visibility: CandidateVisibility;
}

/**
 * `Contracts/V1/Requests/RegisterEmployerRequest.cs`.
 *
 * `legalName` is separate from `displayName` deliberately: candidates recognise
 * the trading name, registries hold the legal one, and Trust checks against the
 * registered one.
 *
 * `countryCode` must be exactly two characters — the validator applies
 * `.Length(2)` (`RegisterEmployerCommandValidator.cs:36-38`) — so a three-letter
 * code is a 400 rather than a silent normalisation.
 */
export interface RegisterEmployerRequest {
  displayName: string;
  legalName?: string | null;
  /** Unvalidated free text: every jurisdiction formats company numbers differently. */
  registrationNumber?: string | null;
  organizationType: EmployerOrganizationType;
  companySize?: CompanySize | null;
  foundedYear?: number | null;
  /** Upper-case ISO 3166-1 alpha-2. Exactly two characters. */
  countryCode: string;
  /** A requested handle. One is derived from the name when omitted. */
  slug?: string | null;
  description?: string | null;
}

/**
 * `Contracts/V1/Requests/UpdateEmployerRequest.cs`.
 *
 * A whole-document save, and **`slug` is not on it**: the deep-link handle is
 * chosen at registration and never again. Branding is by Media reference, never
 * by URL.
 */
export interface UpdateEmployerRequest {
  displayName: string;
  legalName?: string | null;
  registrationNumber?: string | null;
  organizationType: EmployerOrganizationType;
  companySize?: CompanySize | null;
  foundedYear?: number | null;
  countryCode: string;
  description?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  /** Absolute http(s) only — a relative or `javascript:` value is a redirect vector. */
  websiteUrl?: string | null;
  careersUrl?: string | null;
  logoMediaId?: string | null;
  coverMediaId?: string | null;
  tagline?: string | null;
  baseRevision?: number | null;
}

/**
 * The query string of `GET /jobs/applications` — `Api/ApplicationListParameters.cs`.
 *
 * **Which end of the workflow this is comes from what you supply, not a flag.**
 * Naming `employerId` scopes to that employer and requires membership of it;
 * omitting it scopes to the caller's own applications. There is no parameter
 * that asks for somebody else's (`ApplicationListParameters.cs:6-12`).
 */
export interface ApplicationListQuery {
  /** Scopes to an employer's applicant list. Requires membership; omitted means "mine". */
  employerId?: string | null;
  jobId?: string | null;
  /**
   * Repeated `?status=` values.
   *
   * Unparseable entries are **dropped, not refused** — `ParseMany` filters them
   * and returns null when nothing survives, which reads as "no status filter"
   * rather than as an error.
   */
  statuses?: ApplicationStatus[] | null;
  /** Only applications still under consideration. */
  activeOnly?: boolean | null;
  stageKey?: string | null;
  /** Only applications nobody at the employer has opened. The neglect view. */
  unviewedOnly?: boolean | null;
  /** Oldest first, for clearing a backlog. */
  oldestFirst?: boolean | null;
  cursor?: string | null;
  /** The server defaults this to 20 when absent. */
  limit?: number | null;
}

// ── Responses ────────────────────────────────────────────────────────────────

/** `Contracts/V1/Responses/ApplicationAnswerResponse.cs`. */
export interface ApplicationAnswerResponse {
  questionId: string;
  /**
   * The question as it stood **when it was answered**, not the posting's current
   * wording. An employer editing a question after applications arrive does not
   * retroactively rewrite what earlier candidates appear to have been asked.
   */
  questionText: string;
  answer: string;
}

/** `Contracts/V1/Responses/ApplicationAttachmentResponse.cs`. */
export interface ApplicationAttachmentResponse {
  attachmentId: string;
  kind: ApplicationAttachmentKind;
  /** Ask Media for the download link; it is minted against the reader. */
  mediaId: string;
  fileName?: string | null;
}

/**
 * `Contracts/V1/Responses/ApplicationHistoryResponse.cs`.
 *
 * **The list is filtered for the reader by the server**, not by the client. A
 * candidate sees entries marked visible to them; an employer sees theirs,
 * internal notes included. A screen must never filter this again — it has no way
 * to know which audience the array it is holding was built for.
 */
export interface ApplicationHistoryResponse {
  entryId: string;
  kind: ApplicationEventKind;
  fromStatus?: ApplicationStatus | null;
  toStatus?: ApplicationStatus | null;
  note?: string | null;
  occurredAt: string;
}

/**
 * `Contracts/V1/Responses/JobApplicationResponse.cs` — one application in full.
 *
 * Returned by `apply` and by `decide`, and by **nothing else**: there is no
 * `GET /applications/{id}`. A screen that wants this record after the fact
 * cannot re-read it, which is why the hooks write the mutation's answer into the
 * cache rather than invalidating and refetching.
 */
export interface JobApplicationResponse {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  jobSlug: string;
  employerId: string;
  /**
   * **Empty string on the `apply` response.**
   * `ApplyToJobCommandHandler.cs:205` passes `employerName: string.Empty`
   * explicitly rather than loading the employer. A confirmation screen reading
   * this straight off the apply answer renders a blank where a company name
   * should be; take the name from the job that was applied to.
   */
  employerName: string;
  candidateId: string;
  status: ApplicationStatus;
  /** The employer's own pipeline stage. Their vocabulary, not the platform's. */
  stageKey?: string | null;
  coverLetter?: string | null;
  resumeId?: string | null;
  resumeLabel?: string | null;
  answers: ApplicationAnswerResponse[];
  attachments: ApplicationAttachmentResponse[];
  /** Already filtered for the reader. See `ApplicationHistoryResponse`. */
  history: ApplicationHistoryResponse[];
  submittedAt: string;
  firstViewedAt?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  /**
   * How long the candidate waited for a first response.
   *
   * **Null while still waiting, which is not zero** and must never render as
   * "answered immediately". The field's own doc comment says so.
   */
  hoursToFirstResponse?: number | null;
  isActive: boolean;
  /**
   * The **server's** answer to whether this can be withdrawn.
   *
   * Read it rather than deriving one from `status`. The rule is
   * `!IsTerminal(status)` today, and a client that reimplemented it would be a
   * second opinion that drifts — and would offer a control the server refuses.
   */
  canWithdraw: boolean;
  revision: number;
}

/**
 * `Contracts/V1/Responses/ApplicationCardResponse.cs` — one row of a list.
 *
 * The employer's applicant list and the candidate's tracker are the **same query
 * read from opposite ends**, so this one record renders both. Two fields
 * distinguish them: `candidateHeadline` is populated on the employer's list only
 * (`ListApplicationsQueryHandler.cs:131-138`), and nothing on a candidate's
 * tracker carries a headline at all.
 */
export interface ApplicationCardResponse {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  jobSlug: string;
  employerId: string;
  employerName: string;
  employerLogoMediaId?: string | null;
  candidateId: string;
  /**
   * The applicant's headline, when they wrote one. Employer's list only; null on a
   * candidate's own tracker and for an applicant who never wrote a headline.
   */
  candidateHeadline?: string | null;
  /**
   * Who applied, by the name on their Diaspora account. Employer's list only.
   *
   * Added 14 Sep 2026: the list used to carry the headline and nothing else, so an
   * applicant with no headline reached the employer as "Applicant". Null on a
   * candidate's own tracker and when the account can no longer be found.
   */
  applicantName?: string | null;
  /**
   * Whether the applicant's account is verified now. Null wherever `applicantName`
   * is — an unanswered question is not "unverified".
   */
  applicantIsVerified?: boolean | null;
  status: ApplicationStatus;
  stageKey?: string | null;
  submittedAt: string;
  lastActivityAt?: string | null;
  /**
   * Whether a human at the employer has opened it.
   *
   * This and `daysWaiting` are what make a candidate's tracker honest — an
   * application sitting unopened for three weeks is exactly what the platform
   * should be saying out loud.
   */
  hasBeenViewed: boolean;
  /** Whole days since submission with no decision. **Null once decided**, not 0. */
  daysWaiting?: number | null;
  isActive: boolean;
  attachmentCount: number;
}

/** `Contracts/V1/Responses/InterviewParticipantResponse.cs`. */
export interface InterviewParticipantResponse {
  name: string;
  role?: string | null;
}

/**
 * `Contracts/V1/Responses/InterviewResponse.cs`.
 *
 * `timeZoneId` travels beside the instant so both clocks can be rendered —
 * "14:00 your time, 16:00 in Berlin". A candidate three zones away given only an
 * instant does the arithmetic themselves, and the cost of getting it wrong is
 * the job.
 */
export interface InterviewResponse {
  interviewId: string;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  employerName: string;
  roundNumber: number;
  title?: string | null;
  mode: InterviewMode;
  scheduledAt: string;
  durationMinutes: number;
  /** The employer's IANA wall clock. Render both. */
  timeZoneId?: string | null;
  locationAddress?: string | null;
  joiningUrl?: string | null;
  instructions?: string | null;
  participants: InterviewParticipantResponse[];
  outcome: InterviewOutcome;
  isCancelled: boolean;
  cancellationReason?: string | null;
  /** Surfaced honestly. An employer who has moved it four times has said something. */
  rescheduleCount: number;
  completedAt?: string | null;
  /** The panel's notes. **Employer view only** — absent on a candidate's copy. */
  feedback?: string | null;
  /** What the employer chose to share. Usually empty. */
  candidateFeedback?: string | null;
  revision: number;
}

/**
 * `Contracts/V1/Responses/JobOfferResponse.cs`.
 *
 * `hoursRemaining` exists because a deadline rendered as a date leaves the
 * reader to work out the urgency, and the urgency is the whole point of the
 * field. It is **null once the offer is no longer answerable** — which is not
 * "no time left", it is "the question no longer applies".
 */
export interface JobOfferResponse {
  offerId: string;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  employerId: string;
  employerName: string;
  salaryAmount: number;
  /** ISO 4217. Never converted. */
  currencyCode: string;
  salaryPeriod: SalaryPeriod;
  /** `YYYY-MM-DD`, or null when the first day is still to be agreed. */
  startDate?: string | null;
  expiresAt: string;
  /** Null once the offer is no longer answerable. See above. */
  hoursRemaining?: number | null;
  benefitsSummary?: string | null;
  notes?: string | null;
  includesRelocation: boolean;
  includesVisaSponsorship: boolean;
  /** Computed against the clock. See `OfferStatus`. */
  status: OfferStatus;
  extendedAt?: string | null;
  answeredAt?: string | null;
  responseReason?: string | null;
  /** The offer this one replaced, when terms were revised. */
  supersedesOfferId?: string | null;
  /**
   * The **server's** answer to whether the candidate can still respond.
   *
   * Read it rather than comparing `expiresAt` to the device clock — a phone
   * whose clock is ten minutes fast would hide a live offer, and one ten minutes
   * slow would offer a button that 409s.
   */
  canRespond: boolean;
  revision: number;
}

/** `Contracts/V1/Responses/HiringRegionResponse.cs`. */
export interface HiringRegionResponse {
  countryCode: string;
  /** Per country, because it genuinely varies. A single global flag would lie. */
  sponsorsVisas: boolean;
}

/** `Contracts/V1/Responses/EmployerMemberResponse.cs`. */
export interface EmployerMemberResponse {
  userId: string;
  role: EmployerMemberRole;
  joinedAt: string;
}

/**
 * `Contracts/V1/Responses/EmployerResponsivenessResponse.cs`.
 *
 * **Every rate is nullable and null means "not enough evidence".** A rate
 * computed from one or two events is noise presented as a fact about a named
 * organisation. Below the sample threshold the field is null and a client must
 * render nothing rather than a number — `?? 0` here would publish "0% ghosting"
 * about an employer nobody has measured.
 */
export interface EmployerResponsivenessResponse {
  averageResponseHours?: number | null;
  ghostingRate?: number | null;
  offerAcceptanceRate?: number | null;
  decidedCount: number;
}

/**
 * `Contracts/V1/Responses/EmployerResponse.cs` — one employer profile in full.
 *
 * Returned by `POST /jobs/employers`, `PUT /jobs/employers/{id}` and the public
 * read `GET /jobs/employers/{idOrSlug}`. To anyone off the team, `legalName`,
 * `registrationNumber` and `members` are absent and `viewerRole` is null.
 */
export interface EmployerResponse {
  employerId: string;
  slug: string;
  displayName: string;
  /** Present to the team and to staff only. */
  legalName?: string | null;
  registrationNumber?: string | null;
  organizationType: EmployerOrganizationType;
  /** Whether candidates are dealing with an agency rather than the hirer. */
  isIntermediary: boolean;
  companySize: CompanySize;
  foundedYear?: number | null;
  countryCode: string;
  description?: string | null;
  tagline?: string | null;
  logoMediaId?: string | null;
  coverMediaId?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  websiteUrl?: string | null;
  careersUrl?: string | null;
  status: EmployerStatus;
  isVerified: boolean;
  verificationState?: string | null;
  /** The badge label Trust granted. Rendered, never interpreted. */
  verificationBadge?: string | null;
  hiringRegions: HiringRegionResponse[];
  /**
   * The team. Present to the team and to staff only — **never to candidates**,
   * where the whole array is absent rather than empty.
   */
  members?: EmployerMemberResponse[] | null;
  responsiveness: EmployerResponsivenessResponse;
  openJobCount: number;
  registeredAt: string;
  revision: number;
  /** This viewer's role here, when they belong. Null otherwise. */
  viewerRole?: EmployerMemberRole | null;
}

/** `Contracts/V1/Responses/JobSalaryResponse.cs`. */
export interface JobSalaryResponse {
  /** False means the posting declined to say. Every other field is then null. */
  isDisclosed: boolean;
  minimum?: number | null;
  maximum?: number | null;
  currencyCode?: string | null;
  period?: SalaryPeriod | null;
  isNegotiable: boolean;
  isUnpaid: boolean;
}

/**
 * `Contracts/V1/Responses/JobCardResponse.cs`.
 *
 * Mirrored here because both dashboards carry arrays of it — `savedClosingSoon`,
 * `recommended` and `recentJobs`. It is **not** the legacy `JobOpportunity` in
 * `types/job.ts`, which is a fixture shape with no backend behind it: different
 * identifier field, different salary record, different employer record.
 */
export interface JobCardResponse {
  /** "Simple" (short one-off work, "I'm interested") or "Standard". Absent from servers before 5 Nov 2026. */
  postingMode?: 'Simple' | 'Standard';
  /** YYYY-MM-DD: the day the work starts, for a job with a schedule. */
  startsOn?: string | null;
  lengthAmount?: number | null;
  lengthUnit?: 'Hours' | 'Days' | null;
  /** Places advertised and still open: "1 of 2 places left". */
  vacancyCount?: number;
  remainingVacancies?: number;
  jobId: string;
  slug: string;
  title: string;
  summary: string;
  employerId: string;
  employerName: string;
  employerLogoMediaId?: string | null;
  isEmployerVerified: boolean;
  isIntermediary: boolean;
  categoryKey: string;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  countryCode: string;
  locationLabel: string;
  workplaceType: WorkplaceType;
  isRemote: boolean;
  offersVisaSponsorship: boolean;
  offersRelocationAssistance: boolean;
  salary: JobSalaryResponse;
  tags: string[];
  skills: string[];
  status: JobStatus;
  isFeatured: boolean;
  isVerified: boolean;
  publishedAt?: string | null;
  closingAt?: string | null;
  applicationCount: number;
  /** Whether this viewer has applied. **Null when anonymous**, which is not false. */
  hasApplied?: boolean | null;
  isSaved?: boolean | null;
  /** The viewer belongs to the employer (since 16 Oct 2026). Null when anonymous. */
  canManage?: boolean | null;
  /** Why this was recommended, on a recommendations surface. Null elsewhere. */
  recommendationReason?: string | null;
}

// ── One job in full ──────────────────────────────────────────────────────────
//
// `GET /jobs/{jobId}` answers `JobResponse`. The job page read it as the legacy
// `JobOpportunity` until 15 Sep 2026, so every member saw "Employer (Community
// Member)", pay as " /mo" and the location "Unknown" on a posting whose employer,
// pay and town were all on the wire.

/** `Domain/Enums/JobVisibility.cs`. */
export type JobVisibility = 'Public' | 'Unlisted' | 'Private';

/**
 * `Contracts/V1/Responses/JobEmployerSummaryResponse.cs` — the employer, as a job
 * detail renders it.
 */
export interface JobEmployerSummaryResponse {
  employerId: string;
  /**
   * The member who owns the employer, and so who a message about the job
   * reaches. **An employer is not a user**: its identifier is a profile's, and a
   * conversation addressed to it reaches nobody.
   */
  ownerUserId?: string | null;
  slug: string;
  displayName: string;
  tagline?: string | null;
  organizationType: EmployerOrganizationType;
  /** Whether candidates deal with an intermediary rather than the hirer. */
  isIntermediary: boolean;
  companySize: CompanySize;
  countryCode: string;
  isVerified: boolean;
  /** The badge label Trust granted. Rendered, never interpreted. */
  verificationBadge?: string | null;
  logoMediaId?: string | null;
  coverMediaId?: string | null;
  websiteUrl?: string | null;
  careersUrl?: string | null;
  /** Mean hours to a first response. **Null below the sample threshold**, which is not 0. */
  averageResponseHours?: number | null;
  /** Share of applications never answered, 0–1. Null below the sample threshold. */
  ghostingRate?: number | null;
  /** Share of offers accepted, 0–1. Null below the sample threshold. */
  offerAcceptanceRate?: number | null;
}

/** `Contracts/V1/Responses/JobLocationResponse.cs`. */
export interface JobLocationResponse {
  /** Upper-case ISO 3166-1 alpha-2. Present even for a remote role. */
  countryCode: string;
  regionName?: string | null;
  cityName?: string | null;
  areaId?: string | null;
  /** The employer's pin (WGS84). Null when none was given. */
  latitude?: number | null;
  longitude?: number | null;
  /** `CityName ?? RegionName ?? CountryCode` — the most specific place named. */
  displayName: string;
}

/** `Contracts/V1/Responses/JobWorkArrangementResponse.cs`. The employer's own statement. */
export interface JobWorkArrangementResponse {
  workplaceType: WorkplaceType;
  isRemote: boolean;
  offersVisaSponsorship: boolean;
  offersRelocationAssistance: boolean;
  /** Present only for a hybrid arrangement. */
  onSiteDaysPerWeek?: number | null;
  remotePolicy?: string | null;
}

/**
 * `Contracts/V1/Responses/JobDetailLineResponse.cs` — one bulleted line.
 *
 * **An object, not a string.** The old page mapped these straight into a
 * `<Text>`, which throws for any posting that has one.
 */
export interface JobDetailLineResponse {
  lineId: string;
  text: string;
  /** On a requirement, whether it is a hard bar rather than a preference. */
  isEssential: boolean;
}

/** `Contracts/V1/Responses/JobSkillResponse.cs`. */
export interface JobSkillResponse {
  key: string;
  name: string;
  minimumProficiency: SkillProficiency;
  isEssential: boolean;
}

/** `Contracts/V1/Responses/JobEngagementResponse.cs`. Shown to candidates too, deliberately. */
export interface JobEngagementResponse {
  viewCount: number;
  applicationCount: number;
  saveCount: number;
}

/** `Contracts/V1/Responses/JobScreeningQuestionResponse.cs`. */
export interface JobScreeningQuestionResponse {
  questionId: string;
  text: string;
  isRequired: boolean;
}

/** `Contracts/V1/Responses/JobMediaReferenceResponse.cs`. A media id, never a URL. */
export interface JobMediaReferenceResponse {
  mediaId: string;
  role: string;
  caption?: string | null;
}

/** `Contracts/V1/Responses/JobProviderReferenceResponse.cs`. `name` is null when Providers could not answer. */
export interface JobProviderReferenceResponse {
  providerId: string;
  role?: string | null;
  note?: string | null;
  name?: string | null;
  slug?: string | null;
  isVerified?: boolean | null;
  averageRating?: number | null;
  logoMediaId?: string | null;
}

/** `Contracts/V1/Responses/JobGuideReferenceResponse.cs`. `title` is null when Guides could not answer. */
export interface JobGuideReferenceResponse {
  guideId: string;
  label?: string | null;
  isAutomatic: boolean;
  title?: string | null;
  slug?: string | null;
  summary?: string | null;
  isVerified?: boolean | null;
}

/**
 * `Contracts/V1/Responses/JobResponse.cs` — one job posting in full.
 *
 * The viewer-relative fields at the bottom are the server's answers, not rules
 * for the client to re-derive: `canApply` already accounts for the status, the
 * closing date and the vacancies. `canManage` is "may manage it", which staff
 * may for every job; `isOnEmployerTeam` is "it is theirs", the owner check.
 */
export interface JobResponse {
  /** "Simple" (short one-off work, "I'm interested") or "Standard". Absent from servers before 5 Nov 2026. */
  postingMode?: 'Simple' | 'Standard';
  /** YYYY-MM-DD: the day the work starts, for a job with a schedule. */
  startsOn?: string | null;
  lengthAmount?: number | null;
  lengthUnit?: 'Hours' | 'Days' | null;
  jobId: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  employer: JobEmployerSummaryResponse;
  categoryKey: string;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  educationLevel: EducationLevel;
  tags: string[];
  skills: JobSkillResponse[];
  responsibilities: JobDetailLineResponse[];
  requirements: JobDetailLineResponse[];
  benefits: JobDetailLineResponse[];
  location: JobLocationResponse;
  workArrangement: JobWorkArrangementResponse;
  salary: JobSalaryResponse;
  status: JobStatus;
  visibility: JobVisibility;
  isFeatured: boolean;
  isVerified: boolean;
  vacancyCount: number;
  remainingVacancies: number;
  requiresResume: boolean;
  publishedAt?: string | null;
  closingAt?: string | null;
  /** Why the employer closed it. Applicants are owed an explanation. */
  closureReason?: string | null;
  media: JobMediaReferenceResponse[];
  providers: JobProviderReferenceResponse[];
  guides: JobGuideReferenceResponse[];
  screeningQuestions: JobScreeningQuestionResponse[];
  engagement: JobEngagementResponse;
  revision: number;
  /** Whether this viewer has applied. **Null when anonymous**, which is not false. */
  hasApplied?: boolean | null;
  isSaved?: boolean | null;
  canApply: boolean;
  /**
   * Whether this viewer may manage the job through the owner's routes. Since
   * 7 Nov 2026 only the employer's team; servers before then also said yes to
   * platform staff on any job. Not the owner check — see `isOnEmployerTeam`.
   */
  canManage: boolean;
  /**
   * Whether this viewer is platform staff, who act on the job only through
   * moderation. Absent from servers before 7 Nov 2026; read it through
   * `isStaffViewer()` in `lib/job-detail-api.ts`.
   */
  canModerate?: boolean;
  /**
   * Whether this viewer belongs to the employer's team. Absent from servers
   * before 6 Nov 2026, which sent only `canManage`; read it through
   * `isOnEmployerTeam()` in `lib/job-detail-api.ts`.
   */
  isOnEmployerTeam?: boolean;
}

/**
 * `Contracts/V1/Requests/CloseJobRequest.cs`.
 *
 * `filled` lands on `Filled`; anything else — `withdrawn` or nothing — on
 * `Expired`. The reason is shown to everyone who can still open the posting.
 */
export interface CloseJobRequest {
  outcome?: 'filled' | 'withdrawn' | null;
  reason?: string | null;
}

/** `Contracts/V1/Responses/CandidateSkillResponse.cs`. */
export interface CandidateSkillResponse {
  key: string;
  name: string;
  proficiency: SkillProficiency;
  yearsOfExperience?: number | null;
}

/** `Contracts/V1/Responses/CandidateExperienceResponse.cs`. Dates are `YYYY-MM-DD`. */
export interface CandidateExperienceResponse {
  entryId: string;
  title: string;
  organization: string;
  countryCode?: string | null;
  cityName?: string | null;
  start: string;
  end?: string | null;
  isCurrent: boolean;
  description?: string | null;
}

/** `Contracts/V1/Responses/CandidateEducationResponse.cs`. */
export interface CandidateEducationResponse {
  entryId: string;
  institution: string;
  qualification?: string | null;
  fieldOfStudy?: string | null;
  level: EducationLevel;
  countryCode?: string | null;
  start: string;
  end?: string | null;
  isCurrent: boolean;
}

/** `Contracts/V1/Responses/CandidateCertificationResponse.cs`. */
export interface CandidateCertificationResponse {
  entryId: string;
  name: string;
  issuer?: string | null;
  credentialId?: string | null;
  countryCode?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  hasExpired: boolean;
  mediaId?: string | null;
}

/** `Contracts/V1/Responses/CandidateLanguageResponse.cs`. */
export interface CandidateLanguageResponse {
  code: string;
  proficiency: LanguageProficiency;
}

/** `Contracts/V1/Responses/CandidateWorkAuthorizationResponse.cs`. */
export interface CandidateWorkAuthorizationResponse {
  countryCode: string;
  kind: WorkAuthorizationKind;
  expiresOn?: string | null;
  isUnrestricted: boolean;
  hasExpired: boolean;
}

/** `Contracts/V1/Responses/CandidatePreferredLocationResponse.cs`. */
export interface CandidatePreferredLocationResponse {
  countryCode: string;
  cityName?: string | null;
  willRelocate: boolean;
}

/** `Contracts/V1/Responses/CandidatePortfolioItemResponse.cs`. */
export interface CandidatePortfolioItemResponse {
  itemId: string;
  label: string;
  url?: string | null;
  mediaId?: string | null;
  description?: string | null;
}

/**
 * `Contracts/V1/Responses/CandidateSalaryExpectationResponse.cs`.
 *
 * **Present for the owner and nobody else.** `CandidateMapper` omits the whole
 * record for any other reader — handing one side of a negotiation the other
 * side's floor is a thing job products do, and one this platform will not.
 */
export interface CandidateSalaryExpectationResponse {
  minimum?: number | null;
  currencyCode?: string | null;
  period?: SalaryPeriod | null;
  isFlexible: boolean;
}

/**
 * `Contracts/V1/Responses/CandidateProfileResponse.cs`.
 *
 * Returned by `GET`, `POST` and `PUT /jobs/candidate/profile`. The read answers
 * `jobs.not-candidate` before a member has a profile; `fetchCandidateProfile`
 * turns that into null.
 *
 * Every collection on it (`skills`, `experience`, `education`, …) comes back as
 * an array, and **no route on this module writes to any of them**. They are
 * populated by paths that do not exist yet, so they render empty on every
 * deployment. The arrays are typed rather than omitted because they genuinely
 * arrive, and a screen that reads them is reading the truth.
 */
export interface CandidateProfileResponse {
  candidateId: string;
  userId: string;
  /** Null until the member writes one. A first application creates a profile without it. */
  headline?: string | null;
  summary?: string | null;
  countryCode?: string | null;
  cityName?: string | null;
  experienceLevel: ExperienceLevel;
  highestEducation: EducationLevel;
  remotePreference: RemotePreference;
  noticePeriodDays?: number | null;
  isOpenToWork: boolean;
  /** Private by default. Changed only through the visibility route. */
  visibility: CandidateVisibility;
  /** Owner only. See the record's own note. */
  salaryExpectation?: CandidateSalaryExpectationResponse | null;
  skills: CandidateSkillResponse[];
  experience: CandidateExperienceResponse[];
  education: CandidateEducationResponse[];
  certifications: CandidateCertificationResponse[];
  languages: CandidateLanguageResponse[];
  workAuthorizations: CandidateWorkAuthorizationResponse[];
  preferredLocations: CandidatePreferredLocationResponse[];
  portfolio: CandidatePortfolioItemResponse[];
  /** The dashboard's nudge; owner-facing. */
  completenessPercent?: number | null;
  revision: number;
}

/**
 * `Contracts/V1/Responses/CandidateDashboardResponse.cs`.
 *
 * The order of the fields is the candidate's, not the platform's: offers first
 * because they expire, then interviews because they are attended, then
 * applications waiting, then saved jobs closing soon. Recommendations come last
 * — a surface leading with suggestions would be optimising for engagement over
 * the thing the member came to do.
 *
 * **This is the only route that returns a candidate's interviews or offers.**
 * Neither collection has a list endpoint of its own.
 */
export interface CandidateDashboardResponse {
  /** **Null when the member has not created a profile yet.** The client prompts. */
  candidateId?: string | null;
  profileCompletenessPercent?: number | null;
  /** Offers waiting on the candidate. These expire, so they lead. */
  outstandingOffers: JobOfferResponse[];
  upcomingInterviews: InterviewResponse[];
  activeApplicationCount: number;
  totalApplicationCount: number;
  /** Applications the employer has not opened. Honest, and often the real story. */
  unviewedApplicationCount: number;
  /**
   * Counts keyed by the **PascalCase wire status** — `{ "Submitted": 3 }`.
   *
   * A key the client spelled `submitted` finds nothing. Statuses with no
   * applications may be absent rather than present with 0.
   */
  applicationsByStatus: Record<string, number>;
  recentApplications: ApplicationCardResponse[];
  savedJobCount: number;
  /** Saved jobs whose closing date is near. The nudge that actually helps. */
  savedClosingSoon: JobCardResponse[];
  activeAlertCount: number;
  /** Each carries the reason it was suggested, in `recommendationReason`. */
  recommended: JobCardResponse[];
}

/**
 * `Contracts/V1/Responses/EmployerDashboardResponse.cs`.
 *
 * `unviewedApplicationCount` and `staleApplicationCount` lead deliberately. The
 * most useful thing a hiring dashboard can do is say how many people are waiting
 * on you — and the second number, the one that feeds the employer's public
 * ghosting rate, is shown to them before it shows to candidates. That is the
 * fair order and a client must preserve it.
 */
export interface EmployerDashboardResponse {
  employerId: string;
  employerName: string;
  isVerified: boolean;
  draftCount: number;
  openCount: number;
  closedCount: number;
  filledCount: number;
  totalApplicationCount: number;
  activeApplicationCount: number;
  unviewedApplicationCount: number;
  /** Unanswered past the platform's threshold. Feeds the public ghosting rate. */
  staleApplicationCount: number;
  /** Keyed by PascalCase status, like the candidate dashboard's. */
  applicationsByStatus: Record<string, number>;
  upcomingInterviewCount: number;
  outstandingOfferCount: number;
  responsiveness: EmployerResponsivenessResponse;
  /** The postings most in need of attention, newest first. */
  recentJobs: JobCardResponse[];
}
