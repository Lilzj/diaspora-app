// ═════════════════════════════════════════════════════════════════════════════
// Diaspora Platform — Jobs hiring workflow, development handlers for the REAL
// contract (Remediation Wave K)
//
// `Diaspora.Modules.Jobs` serves 28 routes under `/api/v1/jobs`. **Fifteen of
// them are the hiring workflow** — apply, list, withdraw, decide, interviews,
// offers, candidate profile, candidate dashboard, employer registration,
// employer update, employer dashboard — and until this wave not one had a
// frontend consumer, so nothing answered them.
//
// **Every shape here was written from the module's own source** — `Api/*.cs`,
// `Contracts/V1/Requests/*.cs`, `Contracts/V1/Responses/*.cs`,
// `Domain/Policies/ApplicationStatusTransitions.cs` — and **not** from what
// `lib/jobs-hiring-api.ts` expects. The wire types below are therefore declared
// in this file rather than imported from `@/types/jobs-hiring`: typing this
// handler with the client's own types would make it impossible for TypeScript to
// ever show a divergence between the two, because the mock would agree with the
// client by construction.
//
//   > A development handler written from the client's expectations proves the
//   > client is self-consistent. It proves nothing about the platform.
//
// ── What was already here, and why it is not enough ──────────────────────────
//
// `mocks/handlers/jobs.ts` exists and was audited line by line against the
// backend before this file was written. It is a **different universe**: it
// serves the pre-backend `JobOpportunity` fixture — `providerId`,
// `benefitsFlags`, `employmentType: 'Full-Time'`, a `{ data, pagination }`
// envelope the platform has never returned — and it answers a `GET /employers/
// {id}` route that **does not exist on the backend at all**. It is left in place
// because the browse and detail screens still render from it; nothing in this
// file touches it and nothing here imports from it.
//
// One consequence matters for registration order: that handler's first pattern
// is `mock.onGet(/\/jobs/)`, **unanchored**, which matches every GET whose path
// contains `/jobs` — including `/jobs/applications` and
// `/jobs/candidate/dashboard`. axios-mock-adapter is first-match-wins, so this
// file must be registered **before** `setupJobsMocks`. See `mocks/index.ts`.
//
// ── The refusals this file ENFORCES rather than describes ────────────────────
//
// Each is a real refusal on the real server, in the real order, and each would
// otherwise be invisible until a deployment.
//
//   1. **Applying creates the candidate profile — 14 Sep 2026.** It used to
//      answer `jobs.not-candidate` (403) for a member without one, and the app
//      sent them off to write a headline first. `ApplyToJobCommandHandler` now
//      makes the profile, private and with no headline, in the same commit as a
//      member's first application — so a refused application makes none.
//
//   2. **The apply checks run in the candidate's order, not the validator's.**
//      Visibility, then whether the job is still open, then self-application,
//      then duplicate, then the daily ceiling, then the résumé, then the
//      answers. Telling somebody their cover letter is too long before telling
//      them the job closed last week would be the wrong way round, and the
//      handler says so in a comment. Reproduced exactly.
//
//   3. **A draft or hidden posting is 404, not 403.** Answering "applications
//      are closed" would tell a stranger who guessed an identifier that there is
//      something behind it.
//
//   4. **`jobs.application.self` is a 400, not a 403.** It is
//      `Error.Validation` in `JobErrors.cs:487`. A recruiter for the hiring
//      employer cannot apply to their own posting — they could then decide on
//      it — and the status code is the one the platform actually sends.
//
//   5. **An unparseable status filter is DROPPED, not refused.** `ParseMany`
//      (`JobWireNames.cs:147-163`) keeps what it understands and returns null
//      when nothing survives, and the query filter treats null as **no filter at
//      all** — so `?status=under_review` returns the complete list at HTTP 200.
//      That looks like a working filter with a wide match, which is why the
//      client refuses anything but the exact wire spelling on the way out.
//
//   6. **Parsing is case-insensitive, so it is SEPARATORS that break, not
//      case.** `Enum.TryParse(ignoreCase: true)` forgives `underreview` and
//      `UNDERREVIEW`; it cannot read `under_review` or `under-review`, which is
//      the kebab-cased spelling every other list surface in this application
//      uses. Both halves are modelled, because a client relying on exact-match
//      rejection to catch its own casing bugs is relying on something that is
//      not there.
//
//   7. **`Withdrawn` is unreachable through `/decide`.** The route separation is
//      the design: withdrawal is the candidate's decision under its own policy
//      and must not be issuable by an employer passing an enum value. Sending it
//      here is `jobs.application.transition-invalid`.
//
//   8. **The transition table, exactly.** Forward one step, reject from
//      anywhere, and the single legal backward move — `InterviewScheduled` to
//      `Shortlisted`, because a cancelled interview genuinely returns the
//      candidate to the shortlist.
//
//   9. **Withdrawal is the applicant's and nobody else's — not even staff.**
//      `RequireOwner` rather than a permission
//      (`WithdrawApplicationCommandHandler.cs:57-64`).
//
//  10. **The interview mode decides which detail is mandatory.** `OnSite` needs
//      an address; `Phone`, `Video`, `Panel` and `Technical` need a joining URL.
//      A cross-border candidate told only "Tuesday at ten" cannot tell whether
//      they need a visa appointment.
//
//  11. **Naming an employer you do not belong to is 403, not an empty list.**
//      `jobs.not-employer` on the applications list and the dashboard.
//
//  12. **The employer dashboard with no `employerId` and no sole membership is a
//      404.** `ResolveSoleEmployerAsync` returns null for both zero and several,
//      and the handler answers `jobs.employer.not-found` rather than picking one.
//
//  13. **`countryCode` must be exactly two characters** on employer
//      registration. The validator applies `.Length(2)` before any round trip.
//
//  14. **Creating a candidate profile twice is a 409.** It is not an upsert.
//
// ── The properties this file MODELS rather than refuses ──────────────────────
//
//  15. **Enum values are PascalCase; property names are camelCase.** In the same
//      object. `JobWireNames.ToWire` is `value.ToString()`. This is the opposite
//      of Community, which is camelCase throughout and renders on adjacent
//      screens.
//
//  16. **The list is a genuine `CursorPagedResult<T>`** —
//      `{ items, nextCursor, hasMore, totalCount }` — so `readPage` absorbs it.
//      Emitted in that shape so the client's page handling is exercised against
//      the real one rather than against a hand-rolled envelope.
//
//  17. **Withdrawal and the visibility change answer `data: null`.** The
//      non-generic `PlatformResults.Ok` writes `ApiResponse<object?>(null, …)`.
//      A client expecting a record back gets nothing, here as in production.
//
//  18. **`employerName` is the empty string on the apply response.**
//      `ApplyToJobCommandHandler.cs:205` passes `string.Empty` explicitly rather
//      than loading the employer. A confirmation screen reading it renders a
//      blank, and it should find that out here.
//
//  19. **`candidateHeadline`, `applicantName` and `applicantIsVerified` are
//      present on an employer's list and absent on a candidate's own tracker.**
//      One record, two audiences. The name and verified status come from the
//      member's account, not the candidate profile, and the headline is null for
//      an applicant who never wrote one.
//
//  20. **`daysWaiting` is null once decided**, not 0. And
//      `hoursToFirstResponse` is null while still waiting, which is not
//      "answered immediately".
//
//  21. **Every responsiveness rate is null below the sample threshold.** A rate
//      computed from one or two events is noise presented as a fact about a
//      named organisation. `EMPLOYER_OTHER` has evidence; the caller's own
//      employer does not, so a screen that coalesced null to 0 has something to
//      fail against.
//
//  22. **`applicationsByStatus` is keyed by the PascalCase status and omits
//      statuses with none.** Not present-and-zero.
//
//  23. **An offer's `status` is computed against the clock**, so one past its
//      deadline reads `Expired` before any sweep, and `canRespond` is false.
//
// ── What is deliberately NOT here ───────────────────────────────────────────
//
// **`GET /jobs/employers/{idOrSlug}` is served** — an employer's public
// profile, anonymous on the server (gaps G-1 and G-2). This header called it
// absent ("NG-04") after the server had added it, and the employer page went on
// calling `GET /employers/{id}`, a route nobody wrote, until 15 Sep 2026.
//
// **`GET /jobs/candidate/profile` is served** — the member's own profile, or
// `jobs.not-candidate` before they have one. It was listed here as absent after
// the server had added it.
//
// **No `GET /jobs/applications/{id}`, no `GET /jobs/interviews`, no
// `GET /jobs/offers`.** None of the three exist. An application's history is
// returned by `apply` and `decide` only; a candidate's interviews and offers
// arrive inside the dashboard and nowhere else.
//
// **Nothing here touches Media.** Attachments are `mediaId` references and this
// handler stores the identifier without claiming, uploading or serving anything.
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';

const ROOT = '/jobs';

type Reply = [number, unknown];

// ── The wire, as the server spells it ────────────────────────────────────────
//
// Declared here rather than imported. See the header.

type WireApplicationStatus =
  | 'Submitted'
  | 'UnderReview'
  | 'Shortlisted'
  | 'InterviewScheduled'
  | 'InterviewCompleted'
  | 'OfferExtended'
  | 'Accepted'
  | 'Rejected'
  | 'Withdrawn';

type WireInterviewMode = 'Phone' | 'Video' | 'OnSite' | 'Panel' | 'Technical' | 'Assessment';

type WireInterviewOutcome =
  | 'Pending'
  | 'Passed'
  | 'Failed'
  | 'NoShow'
  | 'Cancelled'
  | 'Inconclusive';

type WireOfferStatus = 'Draft' | 'Extended' | 'Accepted' | 'Rejected' | 'Withdrawn' | 'Expired';

/** `Domain/Enums/JobStatus.cs`. */
type WireJobStatus =
  | 'Draft'
  | 'Published'
  | 'Open'
  | 'ReceivingApplications'
  | 'Interviewing'
  | 'OfferMade'
  | 'Filled'
  | 'Expired'
  | 'Archived';

type WireEventKind =
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

/** Property 15. `value.ToString()` on the CLR enum, so PascalCase, exactly. */
const APPLICATION_STATUSES: readonly WireApplicationStatus[] = [
  'Submitted',
  'UnderReview',
  'Shortlisted',
  'InterviewScheduled',
  'InterviewCompleted',
  'OfferExtended',
  'Accepted',
  'Rejected',
  'Withdrawn',
];

const TERMINAL_STATUSES: readonly WireApplicationStatus[] = ['Accepted', 'Rejected', 'Withdrawn'];

/**
 * Property 8 — `Domain/Policies/ApplicationStatusTransitions.cs`, transcribed.
 *
 * `Withdrawn` is absent from every target list because it is reached only
 * through the candidate's own route. `CanTransition` special-cases it; the
 * decide endpoint cannot supply it, so this table is the whole rule for that
 * endpoint.
 */
const ALLOWED_TRANSITIONS: Readonly<
  Record<WireApplicationStatus, readonly WireApplicationStatus[]>
> = {
  Submitted: ['UnderReview', 'Shortlisted', 'Rejected'],
  UnderReview: ['Shortlisted', 'InterviewScheduled', 'Rejected'],
  Shortlisted: ['InterviewScheduled', 'OfferExtended', 'Rejected'],
  InterviewScheduled: ['InterviewCompleted', 'Shortlisted', 'Rejected'],
  InterviewCompleted: ['InterviewScheduled', 'OfferExtended', 'Rejected'],
  OfferExtended: ['Accepted', 'Rejected'],
  Accepted: [],
  Rejected: [],
  Withdrawn: [],
};

// ── Identities the development store knows ───────────────────────────────────
//
// Exported so a test names the same thing the handler does rather than pasting
// a GUID twice and diverging on the third paste.

/** The signed-in member this handler answers for. */
export const DEV_CALLER_USER_ID = '00000000-0000-4000-a000-000000000001';
export const DEV_CALLER_CANDIDATE_ID = '00000000-0000-4000-a000-000000000002';

/** An employer the caller has nothing to do with. Most postings belong to it. */
export const DEV_EMPLOYER_OTHER = '00000000-0000-4000-b000-000000000001';
/** The employer the caller is a `Recruiter` of. The employer-side surfaces use it. */
export const DEV_EMPLOYER_MINE = '00000000-0000-4000-b000-000000000002';

export const DEV_JOB_OPEN = '00000000-0000-4000-c000-000000000001';
/** `requiresResume: true`, and the caller has no default résumé. */
export const DEV_JOB_REQUIRES_RESUME = '00000000-0000-4000-c000-000000000002';
/** Closed to applications. */
export const DEV_JOB_CLOSED = '00000000-0000-4000-c000-000000000003';
/** Past its closing date. A different refusal from closed, deliberately. */
export const DEV_JOB_EXPIRED = '00000000-0000-4000-c000-000000000004';
/** Every vacancy filled. A third refusal. */
export const DEV_JOB_NO_VACANCIES = '00000000-0000-4000-c000-000000000005';
/** Posted by the employer the caller works for. Self-application. */
export const DEV_JOB_MINE = '00000000-0000-4000-c000-000000000006';
/** Carries one required screening question. */
export const DEV_JOB_WITH_QUESTION = '00000000-0000-4000-c000-000000000007';
export const DEV_SCREENING_QUESTION_ID = '00000000-0000-4000-d000-000000000001';
/** A draft. Invisible to everyone but its employer — 404, never 403. */
export const DEV_JOB_DRAFT = '00000000-0000-4000-c000-000000000008';

/**
 * The caller's daily application ceiling.
 *
 * `JobOptions.MaxApplicationsPerCandidatePerDay` on the server. Small here so
 * the 429 is reachable in a test without sending fifty requests.
 */
export const DEV_MAX_APPLICATIONS_PER_DAY = 5;

/** A fixed clock, so `daysWaiting` and `hoursRemaining` are the same on every run. */
const NOW = new Date('2026-08-18T09:00:00.000Z');

interface DevPosting {
  jobId: string;
  slug: string;
  title: string;
  employerId: string;
  employerName: string;
  /** Whether the aggregate would answer `AcceptsApplications(now)`. */
  acceptsApplications: boolean;
  remainingVacancies: number;
  closingDatePassed: boolean;
  requiresResume: boolean;
  /** A draft or hidden posting. Resolves as **not found** to anyone but its employer. */
  isVisible: boolean;
  screeningQuestions: { questionId: string; text: string; isRequired: boolean }[];
}

const POSTINGS: readonly DevPosting[] = [
  {
    jobId: DEV_JOB_OPEN,
    slug: 'senior-care-assistant-manchester',
    title: 'Senior Care Assistant',
    employerId: DEV_EMPLOYER_OTHER,
    employerName: 'Meridian Care Group',
    acceptsApplications: true,
    remainingVacancies: 3,
    closingDatePassed: false,
    requiresResume: false,
    isVisible: true,
    screeningQuestions: [],
  },
  {
    jobId: DEV_JOB_REQUIRES_RESUME,
    slug: 'registered-nurse-icu-berlin',
    title: 'Registered Nurse — ICU',
    employerId: DEV_EMPLOYER_OTHER,
    employerName: 'Meridian Care Group',
    acceptsApplications: true,
    remainingVacancies: 2,
    closingDatePassed: false,
    requiresResume: true,
    isVisible: true,
    screeningQuestions: [],
  },
  {
    jobId: DEV_JOB_CLOSED,
    slug: 'warehouse-operative-rotterdam',
    title: 'Warehouse Operative',
    employerId: DEV_EMPLOYER_OTHER,
    employerName: 'Meridian Care Group',
    acceptsApplications: false,
    remainingVacancies: 1,
    closingDatePassed: false,
    requiresResume: false,
    isVisible: true,
    screeningQuestions: [],
  },
  {
    jobId: DEV_JOB_EXPIRED,
    slug: 'seasonal-farm-hand-almeria',
    title: 'Seasonal Farm Hand',
    employerId: DEV_EMPLOYER_OTHER,
    employerName: 'Meridian Care Group',
    acceptsApplications: false,
    remainingVacancies: 4,
    closingDatePassed: true,
    requiresResume: false,
    isVisible: true,
    screeningQuestions: [],
  },
  {
    jobId: DEV_JOB_NO_VACANCIES,
    slug: 'kitchen-porter-dublin',
    title: 'Kitchen Porter',
    employerId: DEV_EMPLOYER_OTHER,
    employerName: 'Meridian Care Group',
    acceptsApplications: false,
    remainingVacancies: 0,
    closingDatePassed: false,
    requiresResume: false,
    isVisible: true,
    screeningQuestions: [],
  },
  {
    jobId: DEV_JOB_MINE,
    slug: 'community-outreach-lead-london',
    title: 'Community Outreach Lead',
    employerId: DEV_EMPLOYER_MINE,
    employerName: 'Adanna Community Services',
    acceptsApplications: true,
    remainingVacancies: 1,
    closingDatePassed: false,
    requiresResume: false,
    isVisible: true,
    screeningQuestions: [],
  },
  {
    jobId: DEV_JOB_WITH_QUESTION,
    slug: 'hgv-driver-class-2-leeds',
    title: 'HGV Driver (Class 2)',
    employerId: DEV_EMPLOYER_OTHER,
    employerName: 'Meridian Care Group',
    acceptsApplications: true,
    remainingVacancies: 2,
    closingDatePassed: false,
    requiresResume: false,
    isVisible: true,
    screeningQuestions: [
      {
        questionId: DEV_SCREENING_QUESTION_ID,
        text: 'Do you hold a current Driver CPC?',
        isRequired: true,
      },
    ],
  },
  {
    jobId: DEV_JOB_DRAFT,
    slug: 'unpublished-draft',
    title: 'Draft posting',
    employerId: DEV_EMPLOYER_OTHER,
    employerName: 'Meridian Care Group',
    acceptsApplications: true,
    remainingVacancies: 1,
    closingDatePassed: false,
    requiresResume: false,
    isVisible: false,
    screeningQuestions: [],
  },
];

// ── The mutable store ────────────────────────────────────────────────────────

interface DevApplication {
  applicationId: string;
  jobId: string;
  employerId: string;
  candidateId: string;
  /** Who may withdraw it. Ownership, not a permission. */
  applicantUserId: string;
  candidateHeadline: string | null;
  status: WireApplicationStatus;
  stageKey: string | null;
  coverLetter: string | null;
  resumeId: string | null;
  resumeLabel: string | null;
  answers: { questionId: string; questionText: string; answer: string }[];
  attachments: { attachmentId: string; kind: string; mediaId: string; fileName: string | null }[];
  history: {
    entryId: string;
    kind: WireEventKind;
    fromStatus: WireApplicationStatus | null;
    toStatus: WireApplicationStatus | null;
    note: string | null;
    occurredAt: string;
    /** Property 19's sibling: the server filters the timeline by this flag. */
    isVisibleToCandidate: boolean;
  }[];
  submittedAt: string;
  firstViewedAt: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  hoursToFirstResponse: number | null;
  revision: number;
}

interface DevInterview {
  interviewId: string;
  applicationId: string;
  jobId: string;
  employerId: string;
  roundNumber: number;
  title: string | null;
  mode: WireInterviewMode;
  scheduledAt: string;
  durationMinutes: number;
  timeZoneId: string | null;
  locationAddress: string | null;
  joiningUrl: string | null;
  instructions: string | null;
  participants: { name: string; role: string | null }[];
  outcome: WireInterviewOutcome;
  isCancelled: boolean;
  completedAt: string | null;
  feedback: string | null;
  candidateFeedback: string | null;
  revision: number;
}

interface DevOffer {
  offerId: string;
  applicationId: string;
  jobId: string;
  employerId: string;
  salaryAmount: number;
  currencyCode: string;
  salaryPeriod: string;
  startDate: string | null;
  expiresAt: string;
  benefitsSummary: string | null;
  notes: string | null;
  includesRelocation: boolean;
  includesVisaSponsorship: boolean;
  /** The stored status. `Expired` is derived on read — property 23. */
  status: WireOfferStatus;
  extendedAt: string | null;
  answeredAt: string | null;
  responseReason: string | null;
  revision: number;
}

interface DevCandidateProfile {
  candidateId: string;
  /** Null for a profile a first application made, until the member writes one. */
  headline: string | null;
  summary: string | null;
  countryCode: string | null;
  cityName: string | null;
  experienceLevel: string;
  remotePreference: string;
  noticePeriodDays: number | null;
  isOpenToWork: boolean;
  visibility: string;
  expectedSalaryMinimum: number | null;
  expectedSalaryCurrency: string | null;
  expectedSalaryPeriod: string | null;
  expectedSalaryFlexible: boolean;
  revision: number;
}

interface DevEmployer {
  employerId: string;
  slug: string;
  displayName: string;
  legalName: string | null;
  registrationNumber: string | null;
  organizationType: string;
  companySize: string;
  foundedYear: number | null;
  countryCode: string;
  description: string | null;
  tagline: string | null;
  logoMediaId: string | null;
  coverMediaId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  careersUrl: string | null;
  isVerified: boolean;
  /** Property 21: null means "not enough evidence", and it is not zero. */
  averageResponseHours: number | null;
  ghostingRate: number | null;
  offerAcceptanceRate: number | null;
  decidedCount: number;
  revision: number;
}

interface DevState {
  candidateProfile: DevCandidateProfile | null;
  /** Whether the caller has a default résumé. False makes `requiresResume` bite. */
  hasDefaultResume: boolean;
  applications: DevApplication[];
  interviews: DevInterview[];
  offers: DevOffer[];
  employers: Record<string, DevEmployer>;
  /** Employers the caller is a member of, with at least `Recruiter`. */
  memberships: string[];
  /** A posting's status once its team has closed or removed it. Absent means as seeded. */
  postingStatus: Record<string, WireJobStatus>;
  closureReason: Record<string, string | null>;
  sequence: number;
}

let state: DevState = freshState({ withCandidateProfile: true });

/**
 * The employers that exist before anybody registers one.
 *
 * `DEV_EMPLOYER_OTHER` has enough decided applications for its rates to be
 * published; `DEV_EMPLOYER_MINE` does not, so its every rate is null. That
 * asymmetry is property 21 made reachable: a screen that renders "0% ghosting"
 * over a null has something to fail against without anyone having to construct
 * a special case.
 */
function seedEmployers(): Record<string, DevEmployer> {
  return {
    [DEV_EMPLOYER_OTHER]: {
      employerId: DEV_EMPLOYER_OTHER,
      slug: 'meridian-care-group',
      displayName: 'Meridian Care Group',
      legalName: 'Meridian Care Group Ltd',
      registrationNumber: '09182736',
      organizationType: 'Healthcare',
      companySize: 'Large',
      foundedYear: 1998,
      countryCode: 'GB',
      description: 'Residential and domiciliary care across the north of England.',
      tagline: 'Care that travels with you',
      logoMediaId: null,
      coverMediaId: null,
      contactEmail: null,
      contactPhone: null,
      websiteUrl: 'https://example.invalid/meridian',
      careersUrl: null,
      isVerified: true,
      averageResponseHours: 41.5,
      ghostingRate: 0.18,
      offerAcceptanceRate: 0.62,
      decidedCount: 214,
    revision: 3,
    },
    [DEV_EMPLOYER_MINE]: {
      employerId: DEV_EMPLOYER_MINE,
      slug: 'adanna-community-services',
      displayName: 'Adanna Community Services',
      legalName: null,
      registrationNumber: null,
      organizationType: 'NonProfit',
      companySize: 'Micro',
      foundedYear: 2024,
      countryCode: 'GB',
      description: null,
      tagline: null,
      logoMediaId: null,
      coverMediaId: null,
      contactEmail: null,
      contactPhone: null,
      websiteUrl: null,
      careersUrl: null,
      isVerified: false,
      // Below the sample threshold. Null, not 0. Property 21.
      averageResponseHours: null,
      ghostingRate: null,
      offerAcceptanceRate: null,
      decidedCount: 2,
      revision: 1,
    },
  };
}

function freshState(options: { withCandidateProfile: boolean }): DevState {
  const employers = seedEmployers();

  const profile: DevCandidateProfile | null = options.withCandidateProfile
    ? {
        candidateId: DEV_CALLER_CANDIDATE_ID,
        headline: 'Registered nurse, 8 years, ICU',
        summary: null,
        countryCode: 'GB',
        cityName: 'Manchester',
        experienceLevel: 'Senior',
        remotePreference: 'OnSiteOnly',
        noticePeriodDays: 30,
        isOpenToWork: true,
        // Created private, always. There is no request field that could say
        // otherwise, and nothing but the visibility route changes it.
        visibility: 'Private',
        expectedSalaryMinimum: null,
        expectedSalaryCurrency: null,
        expectedSalaryPeriod: null,
        expectedSalaryFlexible: false,
        revision: 1,
      }
    : null;

  return {
    candidateProfile: profile,
    // False on purpose: it is what makes `DEV_JOB_REQUIRES_RESUME` refuse with
    // `jobs.application.resume-required` rather than quietly succeeding. No
    // route on this module uploads a résumé, so there is no way to make it true
    // from a screen — which is itself true of the backend.
    hasDefaultResume: false,
    applications: seedApplications(),
    interviews: [],
    offers: [],
    employers,
    memberships: [DEV_EMPLOYER_MINE],
    postingStatus: {},
    closureReason: {},
    // Starts past the seeded identifiers. `nextId` pads the sequence into the
    // same GUID shape the seeds use, so starting at zero made the first
    // application created at runtime collide with
    // `00000000-0000-4000-e000-000000000001` — the seeded one belonging to
    // somebody else. Every lookup then found the seed, and a withdrawal of the
    // caller's own brand-new application answered "you are not the applicant".
    sequence: 100,
  };
}

/**
 * Two applications on the caller's own employer, from other candidates.
 *
 * They exist so the employer-side surfaces — the applicant list, the decision
 * control, scheduling, offers — have something to work the moment the app
 * starts, rather than requiring somebody to first apply as somebody else, which
 * this handler has no way to let them do.
 *
 * The caller's own tracker starts **empty**, which is the honest first-run state
 * for a member who has not applied to anything.
 */
function seedApplications(): DevApplication[] {
  return [
    {
      applicationId: '00000000-0000-4000-e000-000000000001',
      jobId: DEV_JOB_MINE,
      employerId: DEV_EMPLOYER_MINE,
      candidateId: '00000000-0000-4000-a000-000000000101',
      applicantUserId: '00000000-0000-4000-a000-000000000100',
      candidateHeadline: 'Youth worker, 5 years, east London',
      status: 'Submitted',
      stageKey: 'applied',
      coverLetter: 'I have run three youth programmes in Newham and would love to help here.',
      resumeId: null,
      resumeLabel: null,
      answers: [],
      attachments: [],
      history: [
        {
          entryId: '00000000-0000-4000-f000-000000000001',
          kind: 'Submitted',
          fromStatus: null,
          toStatus: 'Submitted',
          note: null,
          occurredAt: '2026-08-04T10:15:00.000Z',
          isVisibleToCandidate: true,
        },
      ],
      submittedAt: '2026-08-04T10:15:00.000Z',
      // Nobody has opened it. Fourteen days ago, so `daysWaiting` is 14 and the
      // employer dashboard's `staleApplicationCount` has something in it.
      firstViewedAt: null,
      decidedAt: null,
      decisionReason: null,
      // Still waiting. Null, not 0 — property 20.
      hoursToFirstResponse: null,
      revision: 1,
    },
    {
      applicationId: '00000000-0000-4000-e000-000000000002',
      jobId: DEV_JOB_MINE,
      employerId: DEV_EMPLOYER_MINE,
      candidateId: '00000000-0000-4000-a000-000000000103',
      applicantUserId: '00000000-0000-4000-a000-000000000102',
      candidateHeadline: 'Community organiser, Lagos and Manchester',
      status: 'Shortlisted',
      stageKey: 'screening',
      coverLetter: null,
      resumeId: null,
      resumeLabel: null,
      answers: [],
      attachments: [],
      history: [
        {
          entryId: '00000000-0000-4000-f000-000000000002',
          kind: 'Submitted',
          fromStatus: null,
          toStatus: 'Submitted',
          note: null,
          occurredAt: '2026-08-12T08:00:00.000Z',
          isVisibleToCandidate: true,
        },
        {
          entryId: '00000000-0000-4000-f000-000000000003',
          kind: 'StatusChanged',
          fromStatus: 'Submitted',
          toStatus: 'Shortlisted',
          // An internal note. The candidate's copy of this timeline does not
          // carry it, and the filtering happens on the server.
          note: 'Strong fit, but we already have someone at second interview.',
          occurredAt: '2026-08-13T16:30:00.000Z',
          isVisibleToCandidate: false,
        },
      ],
      submittedAt: '2026-08-12T08:00:00.000Z',
      firstViewedAt: '2026-08-13T16:00:00.000Z',
      decidedAt: null,
      decisionReason: null,
      hoursToFirstResponse: 32,
      revision: 2,
    },
  ];
}

/**
 * Resets the development store.
 *
 * `withCandidateProfile: false` produces a member who has never made one — the
 * member whose first application now creates it, and whose profile read answers
 * `jobs.not-candidate` until then.
 */
export function resetJobsHiringMocks(
  options: { withCandidateProfile?: boolean } = {}
): void {
  state = freshState({ withCandidateProfile: options.withCandidateProfile ?? true });
}

// ── Envelope and problem, byte-identical to the platform's ───────────────────

function ok(data: unknown): Reply {
  return [200, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
}

function created(data: unknown): Reply {
  return [201, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
}

/**
 * Property 17. `PlatformResults.Ok(context, Result)` — the non-generic overload
 * — writes `ApiResponse<object?>(null, …)`. Not a 204, and not the record.
 */
function okNull(): Reply {
  return ok(null);
}

function problem(status: number, code: string, title: string, detail: string): Reply {
  return [
    status,
    {
      type: `https://diaspora.app/errors/${code.toLowerCase()}`,
      title,
      status,
      detail,
      code,
      correlationId: 'dev',
      traceId: 'dev',
      timestamp: 'dev',
    },
  ];
}

const validation = (code: string, detail: string) => problem(400, code, 'Validation failed', detail);
const notFound = (code: string, detail: string) => problem(404, code, 'Not found', detail);
const forbidden = (code: string, detail: string) => problem(403, code, 'Forbidden', detail);
const conflict = (code: string, detail: string) => problem(409, code, 'Conflict', detail);

// ── Request plumbing ─────────────────────────────────────────────────────────

function body(config: { data?: unknown }): Record<string, unknown> {
  if (typeof config.data !== 'string') return (config.data as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(config.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function query(config: { params?: Record<string, unknown> }): Record<string, unknown> {
  return config.params ?? {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function flag(value: unknown): boolean {
  return value === true || value === 'true';
}

function idFrom(url: string | undefined, after: string): string | null {
  if (!url) return null;
  const match = new RegExp(`${after}/([^/?]+)`).exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

function nextId(prefix: string): string {
  state.sequence += 1;
  return `${prefix}${String(state.sequence).padStart(12, '0')}`;
}

function findPosting(jobId: string | null): DevPosting | undefined {
  return POSTINGS.find((posting) => posting.jobId === jobId);
}

function findApplication(applicationId: string | null): DevApplication | undefined {
  return state.applications.find((application) => application.applicationId === applicationId);
}

function isTerminal(status: WireApplicationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Whole days, floored — `ApplicationMapper`'s own arithmetic. */
function daysSince(iso: string): number {
  return Math.floor((NOW.getTime() - new Date(iso).getTime()) / 86_400_000);
}

// ── Reading a status filter the way the server reads it ──────────────────────

/**
 * Properties 5 and 6.
 *
 * `ParseMany` parses each value case-insensitively, **drops** the ones it cannot
 * read, and returns null when nothing survives — which the query filter treats
 * as "no status filter" rather than as "nothing matches". So a client sending
 * one good value and one bad one gets the good filter applied, and a client
 * sending only bad ones gets the **entire** list.
 *
 * That second case is the dangerous one and it is why this is modelled rather
 * than simplified: a kebab-cased chip returns everything and looks like it
 * worked. Case is forgiven, so `UNDERREVIEW` is a hit — which means an
 * exact-match rejection is not something a client can lean on to catch its own
 * spelling mistakes.
 */
function parseStatuses(raw: unknown): WireApplicationStatus[] | null {
  const values = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];

  const parsed = values
    .map((value) => String(value).trim().toLowerCase())
    .map((value) => APPLICATION_STATUSES.find((status) => status.toLowerCase() === value))
    .filter((status): status is WireApplicationStatus => status !== undefined);

  const distinct = [...new Set(parsed)];
  return distinct.length > 0 ? distinct : null;
}

// ── Projections ──────────────────────────────────────────────────────────────

/**
 * Members as `IMemberProfileService` names them: by their account, never by a
 * candidate profile. An applicant missing from here reads as an account that can
 * no longer be found — no name, and no verdict on verification.
 */
const DEV_MEMBERS: Record<string, { displayName: string; isVerified: boolean }> = {
  [DEV_CALLER_USER_ID]: { displayName: 'Amara Okafor', isVerified: true },
  '00000000-0000-4000-a000-000000000100': { displayName: 'Tunde Bakare', isVerified: true },
  '00000000-0000-4000-a000-000000000102': { displayName: 'Ngozi Eze', isVerified: false },
};

/**
 * `ApplicationCardResponse`.
 *
 * Property 19: `candidateHeadline`, `applicantName` and `applicantIsVerified`
 * are populated on an employer's list and null on the candidate's own tracker,
 * because the handler only resolves applicants for the employer view.
 *
 * Property 20: `daysWaiting` is null once decided, not zero.
 */
function toCard(application: DevApplication, forEmployer: boolean): unknown {
  const employer = state.employers[application.employerId];
  const posting = findPosting(application.jobId);

  return {
    applicationId: application.applicationId,
    jobId: application.jobId,
    jobTitle: posting?.title ?? '',
    jobSlug: posting?.slug ?? '',
    employerId: application.employerId,
    employerName: employer?.displayName ?? '',
    employerLogoMediaId: employer?.logoMediaId ?? null,
    candidateId: application.candidateId,
    candidateHeadline: forEmployer ? application.candidateHeadline : null,
    applicantName: forEmployer ? DEV_MEMBERS[application.applicantUserId]?.displayName ?? null : null,
    applicantIsVerified: forEmployer
      ? DEV_MEMBERS[application.applicantUserId]?.isVerified ?? null
      : null,
    status: application.status,
    stageKey: application.stageKey,
    submittedAt: application.submittedAt,
    lastActivityAt:
      application.history.length > 0
        ? application.history[application.history.length - 1].occurredAt
        : null,
    hasBeenViewed: application.firstViewedAt !== null,
    daysWaiting: application.decidedAt === null ? daysSince(application.submittedAt) : null,
    isActive: !isTerminal(application.status),
    attachmentCount: application.attachments.length,
  };
}

/**
 * `JobApplicationResponse`.
 *
 * `forEmployer` selects the timeline: a candidate reading their own application
 * sees the entries marked visible to them, an employer sees all of them. The
 * filtering is the server's and a client must never redo it — it has no way to
 * know which audience the array it is holding was built for.
 *
 * `employerName` is passed as the empty string on the apply path — property 18 —
 * which is the caller's job to reproduce, not this function's.
 */
function toApplication(
  application: DevApplication,
  forEmployer: boolean,
  employerName: string
): unknown {
  const posting = findPosting(application.jobId);

  return {
    applicationId: application.applicationId,
    jobId: application.jobId,
    jobTitle: posting?.title ?? '',
    jobSlug: posting?.slug ?? '',
    employerId: application.employerId,
    employerName,
    candidateId: application.candidateId,
    status: application.status,
    stageKey: application.stageKey,
    coverLetter: application.coverLetter,
    resumeId: application.resumeId,
    resumeLabel: application.resumeLabel,
    answers: application.answers,
    attachments: application.attachments,
    history: application.history
      .filter((entry) => forEmployer || entry.isVisibleToCandidate)
      .map(({ isVisibleToCandidate: _hidden, ...entry }) => entry),
    submittedAt: application.submittedAt,
    firstViewedAt: application.firstViewedAt,
    decidedAt: application.decidedAt,
    decisionReason: application.decisionReason,
    hoursToFirstResponse: application.hoursToFirstResponse,
    isActive: !isTerminal(application.status),
    // The server's answer, so the client never derives one. The rule is
    // "not terminal" today and the client must not hold a second opinion.
    canWithdraw: !isTerminal(application.status),
    revision: application.revision,
  };
}

function toInterview(interview: DevInterview, forEmployer: boolean): unknown {
  const posting = findPosting(interview.jobId);
  const employer = state.employers[interview.employerId];

  return {
    interviewId: interview.interviewId,
    applicationId: interview.applicationId,
    jobId: interview.jobId,
    jobTitle: posting?.title ?? '',
    employerName: employer?.displayName ?? '',
    roundNumber: interview.roundNumber,
    title: interview.title,
    mode: interview.mode,
    scheduledAt: interview.scheduledAt,
    durationMinutes: interview.durationMinutes,
    timeZoneId: interview.timeZoneId,
    locationAddress: interview.locationAddress,
    joiningUrl: interview.joiningUrl,
    instructions: interview.instructions,
    participants: interview.participants,
    outcome: interview.outcome,
    isCancelled: interview.isCancelled,
    cancellationReason: null,
    rescheduleCount: 0,
    completedAt: interview.completedAt,
    // The panel's notes. Present for the employer only — a candidate's copy has
    // never carried it and a screen must not expect it to.
    feedback: forEmployer ? interview.feedback : null,
    candidateFeedback: interview.candidateFeedback,
    revision: interview.revision,
  };
}

/**
 * `JobOfferResponse`, with property 23 applied.
 *
 * `status` and `canRespond` are computed **against the clock** rather than read
 * off the stored row, exactly as `OfferMapper` does, so an offer past its
 * deadline reads `Expired` before any sweep has written that down. A candidate
 * must never be shown a live offer they can no longer accept.
 */
function toOffer(offer: DevOffer): unknown {
  const posting = findPosting(offer.jobId);
  const employer = state.employers[offer.employerId];

  const msRemaining = new Date(offer.expiresAt).getTime() - NOW.getTime();
  const hasLapsed = offer.status === 'Extended' && msRemaining <= 0;
  const status: WireOfferStatus = hasLapsed ? 'Expired' : offer.status;
  const canRespond = status === 'Extended';

  return {
    offerId: offer.offerId,
    applicationId: offer.applicationId,
    jobId: offer.jobId,
    jobTitle: posting?.title ?? '',
    employerId: offer.employerId,
    employerName: employer?.displayName ?? '',
    salaryAmount: offer.salaryAmount,
    currencyCode: offer.currencyCode,
    salaryPeriod: offer.salaryPeriod,
    startDate: offer.startDate,
    expiresAt: offer.expiresAt,
    // Null once it is no longer answerable — which is not "no time left", it is
    // "the question no longer applies".
    hoursRemaining: canRespond ? Math.round(msRemaining / 3_600_000) : null,
    benefitsSummary: offer.benefitsSummary,
    notes: offer.notes,
    includesRelocation: offer.includesRelocation,
    includesVisaSponsorship: offer.includesVisaSponsorship,
    status,
    extendedAt: offer.extendedAt,
    answeredAt: offer.answeredAt,
    responseReason: offer.responseReason,
    supersedesOfferId: null,
    canRespond,
    revision: offer.revision,
  };
}

function toEmployer(employer: DevEmployer, forMember: boolean): unknown {
  return {
    employerId: employer.employerId,
    slug: employer.slug,
    displayName: employer.displayName,
    // Present to the team and to staff only.
    legalName: forMember ? employer.legalName : null,
    registrationNumber: forMember ? employer.registrationNumber : null,
    organizationType: employer.organizationType,
    isIntermediary:
      employer.organizationType === 'RecruitmentAgency' ||
      employer.organizationType === 'StaffingFirm',
    companySize: employer.companySize,
    foundedYear: employer.foundedYear,
    countryCode: employer.countryCode,
    description: employer.description,
    tagline: employer.tagline,
    logoMediaId: employer.logoMediaId,
    coverMediaId: employer.coverMediaId,
    contactEmail: employer.contactEmail,
    contactPhone: employer.contactPhone,
    websiteUrl: employer.websiteUrl,
    careersUrl: employer.careersUrl,
    status: 'Active',
    isVerified: employer.isVerified,
    verificationState: employer.isVerified ? 'Verified' : null,
    verificationBadge: employer.isVerified ? 'Verified employer' : null,
    // No route sets these. `SetHiringRegionsRequest` is a contract with no
    // endpoint on top, so the array is empty on every deployment.
    hiringRegions: [],
    // Absent entirely rather than empty for a non-member. The whole array is
    // omitted by the mapper, which is not the same as an employer with no team.
    members: forMember
      ? [{ userId: DEV_CALLER_USER_ID, role: 'Owner', joinedAt: '2026-02-01T00:00:00.000Z' }]
      : null,
    responsiveness: toResponsiveness(employer),
    openJobCount: POSTINGS.filter(
      (posting) => posting.employerId === employer.employerId && posting.acceptsApplications
    ).length,
    registeredAt: '2026-02-01T00:00:00.000Z',
    revision: employer.revision,
    viewerRole: state.memberships.includes(employer.employerId) ? 'Owner' : null,
  };
}

/** Property 21. Every rate is null below the sample threshold, and null is not 0. */
function toResponsiveness(employer: DevEmployer): unknown {
  return {
    averageResponseHours: employer.averageResponseHours,
    ghostingRate: employer.ghostingRate,
    offerAcceptanceRate: employer.offerAcceptanceRate,
    decidedCount: employer.decidedCount,
  };
}

/**
 * Property 22. Keyed by the PascalCase status, and a status with no
 * applications is **absent** rather than present with 0.
 */
function countByStatus(applications: DevApplication[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const application of applications) {
    counts[application.status] = (counts[application.status] ?? 0) + 1;
  }
  return counts;
}

/** A `JobCardResponse`, for the two dashboards that carry arrays of them. */
function toJobCard(posting: DevPosting): unknown {
  const employer = state.employers[posting.employerId];

  return {
    jobId: posting.jobId,
    slug: posting.slug,
    title: posting.title,
    summary: `${posting.title} at ${posting.employerName}.`,
    employerId: posting.employerId,
    employerName: posting.employerName,
    employerLogoMediaId: null,
    isEmployerVerified: employer?.isVerified ?? false,
    isIntermediary: false,
    categoryKey: 'care',
    jobType: 'FullTime',
    experienceLevel: 'Mid',
    countryCode: 'GB',
    locationLabel: 'Manchester, United Kingdom',
    workplaceType: 'OnSite',
    isRemote: false,
    offersVisaSponsorship: true,
    offersRelocationAssistance: false,
    salary: {
      isDisclosed: true,
      minimum: 26000,
      maximum: 31000,
      currencyCode: 'GBP',
      period: 'Yearly',
      isNegotiable: false,
      isUnpaid: false,
    },
    tags: ['care', 'sponsorship'],
    skills: ['Patient care', 'Safeguarding'],
    status: posting.acceptsApplications ? 'Open' : 'Expired',
    isFeatured: false,
    isVerified: true,
    publishedAt: '2026-07-20T09:00:00.000Z',
    closingAt: '2026-09-30T23:59:59.000Z',
    applicationCount: state.applications.filter((a) => a.jobId === posting.jobId).length,
    hasApplied: state.applications.some(
      (a) => a.jobId === posting.jobId && a.applicantUserId === DEV_CALLER_USER_ID
    ),
    isSaved: false,
    recommendationReason: null,
  };
}

/**
 * Where a seeded posting stands. `JobStatusTransitions.cs` for the moves the job
 * page makes; the seed flags stand in for what the aggregate would hold.
 */
function statusOf(posting: DevPosting): WireJobStatus {
  const changed = state.postingStatus[posting.jobId];
  if (changed) return changed;
  if (!posting.isVisible) return 'Draft';
  if (posting.acceptsApplications) {
    return state.applications.some((a) => a.jobId === posting.jobId) ? 'ReceivingApplications' : 'Open';
  }
  // Closed to applications for a reason the status itself does not carry: the
  // closing date passed, or the seats are gone. Otherwise the team closed it.
  return posting.closingDatePassed || posting.remainingVacancies === 0 ? 'Open' : 'Expired';
}

/** `JobPosting.AcceptsApplications(now)`: an accepting status, a seat left, and before the closing date. */
function acceptsNow(posting: DevPosting): boolean {
  const status = statusOf(posting);
  return (
    (status === 'Open' || status === 'ReceivingApplications' || status === 'Interviewing') &&
    posting.remainingVacancies > 0 &&
    !posting.closingDatePassed
  );
}

/** A `JobResponse` — `Application/Mapping/JobMapper.cs` `ToResponse`. */
function toJobResponse(posting: DevPosting): unknown {
  const employer = state.employers[posting.employerId];
  const isTeam = state.memberships.includes(posting.employerId);
  const applications = state.applications.filter((a) => a.jobId === posting.jobId);

  return {
    jobId: posting.jobId,
    slug: posting.slug,
    title: posting.title,
    summary: `${posting.title} at ${posting.employerName}.`,
    description: `${posting.title} at ${posting.employerName}. Shifts are agreed in advance and training is paid.`,
    employer: {
      employerId: posting.employerId,
      // The member a message reaches. The caller owns their own employer.
      ownerUserId: isTeam ? DEV_CALLER_USER_ID : '00000000-0000-4000-a000-000000000901',
      slug: employer?.slug ?? posting.employerId,
      displayName: employer?.displayName ?? posting.employerName,
      tagline: employer?.tagline ?? null,
      organizationType: employer?.organizationType ?? 'Other',
      isIntermediary:
        employer?.organizationType === 'RecruitmentAgency' || employer?.organizationType === 'StaffingFirm',
      companySize: employer?.companySize ?? 'Unspecified',
      countryCode: employer?.countryCode ?? 'GB',
      isVerified: employer?.isVerified ?? false,
      verificationBadge: employer?.isVerified ? 'Verified employer' : null,
      logoMediaId: null,
      coverMediaId: null,
      websiteUrl: employer?.websiteUrl ?? null,
      careersUrl: employer?.careersUrl ?? null,
      // Property 21. Null below the sample threshold.
      averageResponseHours: employer?.averageResponseHours ?? null,
      ghostingRate: employer?.ghostingRate ?? null,
      offerAcceptanceRate: employer?.offerAcceptanceRate ?? null,
    },
    categoryKey: 'care',
    jobType: 'FullTime',
    experienceLevel: 'Mid',
    educationLevel: 'None',
    tags: ['care', 'sponsorship'],
    skills: [{ key: 'patient-care', name: 'Patient care', minimumProficiency: 'Intermediate', isEssential: true }],
    // Objects, not strings. A page that renders the line itself throws.
    responsibilities: [
      { lineId: '00000000-0000-4000-f000-000000000001', text: 'Support residents with daily living', isEssential: false },
    ],
    requirements: [
      { lineId: '00000000-0000-4000-f000-000000000002', text: 'The right to work in the UK', isEssential: true },
      { lineId: '00000000-0000-4000-f000-000000000003', text: 'A year of care experience', isEssential: false },
    ],
    benefits: [],
    location: {
      countryCode: 'GB',
      regionName: 'Greater Manchester',
      cityName: 'Manchester',
      areaId: null,
      displayName: 'Manchester',
    },
    workArrangement: {
      workplaceType: 'OnSite',
      isRemote: false,
      offersVisaSponsorship: true,
      offersRelocationAssistance: false,
      onSiteDaysPerWeek: null,
      remotePolicy: null,
    },
    salary: {
      isDisclosed: true,
      minimum: 26000,
      maximum: 31000,
      currencyCode: 'GBP',
      period: 'Yearly',
      isNegotiable: false,
      isUnpaid: false,
    },
    status: statusOf(posting),
    visibility: 'Public',
    isFeatured: false,
    isVerified: true,
    vacancyCount: Math.max(1, posting.remainingVacancies),
    remainingVacancies: posting.remainingVacancies,
    requiresResume: posting.requiresResume,
    publishedAt: posting.isVisible ? '2026-07-20T09:00:00.000Z' : null,
    closingAt: posting.closingDatePassed ? '2026-08-01T23:59:59.000Z' : '2026-09-30T23:59:59.000Z',
    closureReason: state.closureReason[posting.jobId] ?? null,
    media: [],
    providers: [],
    guides: [],
    screeningQuestions: posting.screeningQuestions,
    engagement: { viewCount: 40 + applications.length * 7, applicationCount: applications.length, saveCount: 3 },
    revision: 1,
    hasApplied: applications.some((a) => a.applicantUserId === DEV_CALLER_USER_ID),
    isSaved: false,
    canApply: acceptsNow(posting),
    canManage: isTeam,
  };
}

// ── The handlers ─────────────────────────────────────────────────────────────

export function setupJobsHiringMocks(mock: MockAdapter): void {
  // ── Applications list ─────────────────────────────────────────────────────
  //
  // Registered first, and before `handlers/jobs.ts`'s unanchored `/\/jobs/`
  // GET pattern, which would otherwise answer this path with a fixture array.

  mock.onGet(new RegExp(`^${ROOT}/applications/?(\\?.*)?$`)).reply((config) => {
    const parameters = query(config);
    const employerId = text(parameters.employerId);

    // Which end of the query this is comes from what was supplied, not from a
    // flag. Naming an employer requires membership of it.
    if (employerId !== null && !state.memberships.includes(employerId)) {
      return forbidden(
        'jobs.not-employer',
        'You do not belong to that employer.'
      );
    }

    const forEmployer = employerId !== null;
    const statuses = parseStatuses(parameters.status);

    let rows = state.applications.filter((application) =>
      forEmployer
        ? application.employerId === employerId
        : application.applicantUserId === DEV_CALLER_USER_ID
    );

    const jobId = text(parameters.jobId);
    if (jobId) rows = rows.filter((application) => application.jobId === jobId);

    // Property 5. A null filter is no filter, which is what an entirely
    // unparseable `?status=` produces.
    if (statuses) rows = rows.filter((application) => statuses.includes(application.status));

    if (flag(parameters.active)) rows = rows.filter((a) => !isTerminal(a.status));

    const stageKey = text(parameters.stage);
    if (stageKey) rows = rows.filter((application) => application.stageKey === stageKey);

    if (flag(parameters.unviewed)) rows = rows.filter((a) => a.firstViewedAt === null);

    const oldestFirst = flag(parameters.oldest);
    rows = [...rows].sort((left, right) => {
      const delta =
        new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime();
      return oldestFirst ? delta : -delta;
    });

    const limit = Number(parameters.limit ?? 20) || 20;
    const offset = parameters.cursor ? Number(parameters.cursor) || 0 : 0;
    const page = rows.slice(offset, offset + limit);
    const nextCursor = offset + limit < rows.length ? String(offset + limit) : null;

    // Property 16. A real `CursorPagedResult<T>`: rows under `items`, so
    // `readPage` finds them. `totalCount` is populated here; the server's is
    // `int?` and some routes decline, which is why the client treats null as
    // "not counted" rather than as zero.
    return ok({
      items: page.map((application) => toCard(application, forEmployer)),
      nextCursor,
      hasMore: nextCursor !== null,
      totalCount: rows.length,
    });
  });

  // ── Withdraw ──────────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`^${ROOT}/applications/[^/]+/withdraw$`)).reply((config) => {
    const application = findApplication(idFrom(config.url, 'applications'));

    if (!application) {
      return notFound('jobs.application.not-found', 'That application could not be found.');
    }

    // Property 9. The applicant themselves and nobody else — not staff, not the
    // employer. Ownership, not a permission.
    if (application.applicantUserId !== DEV_CALLER_USER_ID) {
      return forbidden('jobs.not-applicant', 'Only the applicant can withdraw an application.');
    }

    if (isTerminal(application.status)) {
      return conflict(
        application.status === 'Withdrawn'
          ? 'jobs.application.already-withdrawn'
          : 'jobs.application.not-withdrawable',
        'This application has already reached an ending.'
      );
    }

    const reason = text(body(config).reason);

    application.history.push({
      entryId: nextId('00000000-0000-4000-f000-'),
      kind: 'Withdrawn',
      fromStatus: application.status,
      toStatus: 'Withdrawn',
      note: reason,
      occurredAt: NOW.toISOString(),
      isVisibleToCandidate: true,
    });
    application.status = 'Withdrawn';
    application.decidedAt = NOW.toISOString();
    application.revision += 1;

    // Property 17. 200 with `data: null` — the withdrawn application is not
    // returned, so a client has nothing to write into its cache.
    return okNull();
  });

  // ── Decide ────────────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`^${ROOT}/applications/[^/]+/decide$`)).reply((config) => {
    const application = findApplication(idFrom(config.url, 'applications'));

    if (!application) {
      return notFound('jobs.application.not-found', 'That application could not be found.');
    }

    // The policy is necessary and never sufficient: the handler asks the
    // employer aggregate whether the caller may act on *this* application.
    if (!state.memberships.includes(application.employerId)) {
      return forbidden('jobs.not-recruiter', 'You are not a recruiter for this employer.');
    }

    const payload = body(config);
    const target = APPLICATION_STATUSES.find(
      (status) => status.toLowerCase() === String(payload.status ?? '').trim().toLowerCase()
    );

    // Property 7. `Withdrawn` parses perfectly well as a status and is still
    // refused here, because `ApplicationStatusTransitions` only permits it as
    // the candidate's own exit and the decide route can never be that.
    if (!target || target === 'Withdrawn' || target === 'Submitted') {
      return conflict(
        'jobs.application.transition-invalid',
        'That is not a move this application can make.'
      );
    }

    if (isTerminal(application.status)) {
      return conflict(
        'jobs.application.already-decided',
        'This application has already been decided.'
      );
    }

    // Property 8, the table exactly.
    if (!ALLOWED_TRANSITIONS[application.status].includes(target)) {
      return conflict(
        'jobs.application.transition-invalid',
        `An application cannot move from ${application.status} to ${target}.`
      );
    }

    const reason = text(payload.reason);
    // The server's default is true. A client that omitted it published the
    // reason to the candidate, so the same default applies here.
    const visible = payload.reasonVisibleToCandidate !== false;

    // Measured, not claimed: only the first move counts as a response, and it
    // is recorded in the same transaction as the decision so the two can never
    // disagree.
    if (application.hoursToFirstResponse === null) {
      application.hoursToFirstResponse = Math.round(
        (NOW.getTime() - new Date(application.submittedAt).getTime()) / 3_600_000
      );
      application.firstViewedAt = application.firstViewedAt ?? NOW.toISOString();
    }

    application.history.push({
      entryId: nextId('00000000-0000-4000-f000-'),
      kind: 'StatusChanged',
      fromStatus: application.status,
      toStatus: target,
      note: reason,
      occurredAt: NOW.toISOString(),
      isVisibleToCandidate: visible,
    });

    application.status = target;
    application.revision += 1;

    if (isTerminal(target)) {
      application.decidedAt = NOW.toISOString();
      // Only what the employer chose to share. An invisible reason stays on the
      // record and off the response.
      application.decisionReason = visible ? reason : null;
      const employer = state.employers[application.employerId];
      if (employer) employer.decidedCount += 1;
    }

    const employerName = state.employers[application.employerId]?.displayName ?? '';
    return ok(toApplication(application, true, employerName));
  });

  // ── Interviews ────────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`^${ROOT}/applications/[^/]+/interviews$`)).reply((config) => {
    const application = findApplication(idFrom(config.url, 'applications'));

    if (!application) {
      return notFound('jobs.application.not-found', 'That application could not be found.');
    }

    if (!state.memberships.includes(application.employerId)) {
      return forbidden('jobs.not-recruiter', 'You are not a recruiter for this employer.');
    }

    if (isTerminal(application.status)) {
      return conflict(
        'jobs.application.already-decided',
        'This application has already been decided.'
      );
    }

    const payload = body(config);
    const mode = String(payload.mode ?? '');
    const scheduledAt = text(payload.scheduledAt);
    const durationMinutes = Number(payload.durationMinutes ?? 0);

    const knownModes: WireInterviewMode[] = [
      'Phone',
      'Video',
      'OnSite',
      'Panel',
      'Technical',
      'Assessment',
    ];
    const parsedMode = knownModes.find((known) => known.toLowerCase() === mode.toLowerCase());

    if (!parsedMode) {
      return validation('jobs.interview.location.invalid', `Unknown interview mode '${mode}'.`);
    }

    if (!scheduledAt || new Date(scheduledAt).getTime() <= NOW.getTime()) {
      return validation('jobs.interview.in-past', 'An interview cannot be scheduled in the past.');
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return validation('jobs.interview.duration.invalid', 'A duration in minutes is required.');
    }

    // Property 10. The mode decides which detail is mandatory. A cross-border
    // candidate told only "Tuesday at ten" cannot tell whether they need a visa
    // appointment, and catching that when the employer schedules it is far
    // better than an hour beforehand.
    const address = text(payload.locationAddress);
    const joiningUrl = text(payload.joiningUrl);

    if (parsedMode === 'OnSite' && !address) {
      return validation(
        'jobs.interview.location.invalid',
        'An on-site interview needs an address.'
      );
    }

    if (parsedMode !== 'OnSite' && parsedMode !== 'Assessment' && !joiningUrl) {
      return validation(
        'jobs.interview.location.invalid',
        'A remote interview needs a joining link.'
      );
    }

    const round =
      state.interviews.filter((interview) => interview.applicationId === application.applicationId)
        .length + 1;

    const interview: DevInterview = {
      interviewId: nextId('00000000-0000-4000-9000-'),
      applicationId: application.applicationId,
      jobId: application.jobId,
      employerId: application.employerId,
      roundNumber: round,
      title: text(payload.title),
      mode: parsedMode,
      scheduledAt,
      durationMinutes,
      timeZoneId: text(payload.timeZoneId),
      locationAddress: address,
      joiningUrl,
      instructions: text(payload.instructions),
      participants: Array.isArray(payload.participants)
        ? (payload.participants as { name?: unknown; role?: unknown }[]).map((participant) => ({
            name: String(participant?.name ?? ''),
            role: text(participant?.role),
          }))
        : [],
      outcome: 'Pending',
      isCancelled: false,
      completedAt: null,
      feedback: null,
      candidateFeedback: null,
      revision: 1,
    };

    state.interviews.push(interview);

    // Scheduling moves the application, which is why an applicant list has to be
    // invalidated alongside. The move is legal from `Shortlisted` and
    // `UnderReview`; from anywhere else the application stays where it is,
    // exactly as the aggregate leaves it.
    if (ALLOWED_TRANSITIONS[application.status].includes('InterviewScheduled')) {
      application.history.push({
        entryId: nextId('00000000-0000-4000-f000-'),
        kind: 'InterviewScheduled',
        fromStatus: application.status,
        toStatus: 'InterviewScheduled',
        note: null,
        occurredAt: NOW.toISOString(),
        isVisibleToCandidate: true,
      });
      application.status = 'InterviewScheduled';
      application.revision += 1;
    }

    return created(toInterview(interview, true));
  });

  mock.onPost(new RegExp(`^${ROOT}/interviews/[^/]+/outcome$`)).reply((config) => {
    const interviewId = idFrom(config.url, 'interviews');
    const interview = state.interviews.find((entry) => entry.interviewId === interviewId);

    if (!interview) {
      return notFound('jobs.interview.not-found', 'That interview could not be found.');
    }

    if (!state.memberships.includes(interview.employerId)) {
      return forbidden('jobs.not-recruiter', 'You are not a recruiter for this employer.');
    }

    if (interview.outcome !== 'Pending') {
      return conflict(
        'jobs.interview.already-completed',
        'This interview already has an outcome.'
      );
    }

    const payload = body(config);
    const recordable: WireInterviewOutcome[] = ['Passed', 'Failed', 'NoShow', 'Inconclusive'];
    const outcome = recordable.find(
      (known) => known.toLowerCase() === String(payload.outcome ?? '').toLowerCase()
    );

    if (!outcome) {
      return validation(
        'jobs.interview.not-scheduled',
        'Pass one of Passed, Failed, NoShow or Inconclusive.'
      );
    }

    interview.outcome = outcome;
    interview.completedAt = NOW.toISOString();
    // Two fields, never one. The panel's note is internal and the candidate's is
    // what the employer chose to share.
    interview.feedback = text(payload.feedback);
    interview.candidateFeedback = text(payload.candidateFeedback);
    interview.revision += 1;

    return ok(toInterview(interview, true));
  });

  // ── Offers ────────────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`^${ROOT}/applications/[^/]+/offers$`)).reply((config) => {
    const application = findApplication(idFrom(config.url, 'applications'));

    if (!application) {
      return notFound('jobs.application.not-found', 'That application could not be found.');
    }

    if (!state.memberships.includes(application.employerId)) {
      return forbidden('jobs.not-recruiter', 'You are not a recruiter for this employer.');
    }

    const live = state.offers.find(
      (offer) =>
        offer.applicationId === application.applicationId &&
        (offer.status === 'Draft' || offer.status === 'Extended')
    );

    if (live) {
      return conflict('jobs.offer.already-extended', 'This application already has an offer.');
    }

    const payload = body(config);
    const salaryAmount = Number(payload.salaryAmount);
    const currencyCode = text(payload.currencyCode);
    const expiresAt = text(payload.expiresAt);

    // The salary is required here and not on a posting. A candidate being asked
    // to accept a job — very often to move country for it — is entitled to the
    // number in writing.
    if (!Number.isFinite(salaryAmount) || salaryAmount <= 0 || !currencyCode) {
      return validation('jobs.offer.terms.invalid', 'An offer needs a salary and a currency.');
    }

    if (!expiresAt || new Date(expiresAt).getTime() <= NOW.getTime()) {
      return validation(
        'jobs.offer.expiry.in-past',
        'An offer must have a deadline in the future.'
      );
    }

    // Stated, never inferred: the server's default is `true`, so an omitted
    // field extends the offer to the candidate rather than leaving it a draft.
    const extendImmediately = payload.extendImmediately !== false;

    const offer: DevOffer = {
      offerId: nextId('00000000-0000-4000-8000-'),
      applicationId: application.applicationId,
      jobId: application.jobId,
      employerId: application.employerId,
      salaryAmount,
      currencyCode: currencyCode.toUpperCase(),
      salaryPeriod: String(payload.salaryPeriod ?? 'Yearly'),
      startDate: text(payload.startDate),
      expiresAt,
      benefitsSummary: text(payload.benefitsSummary),
      notes: text(payload.notes),
      includesRelocation: payload.includesRelocation === true,
      includesVisaSponsorship: payload.includesVisaSponsorship === true,
      status: extendImmediately ? 'Extended' : 'Draft',
      extendedAt: extendImmediately ? NOW.toISOString() : null,
      answeredAt: null,
      responseReason: null,
      revision: 1,
    };

    state.offers.push(offer);

    if (extendImmediately && ALLOWED_TRANSITIONS[application.status].includes('OfferExtended')) {
      application.history.push({
        entryId: nextId('00000000-0000-4000-f000-'),
        kind: 'OfferExtended',
        fromStatus: application.status,
        toStatus: 'OfferExtended',
        note: null,
        occurredAt: NOW.toISOString(),
        isVisibleToCandidate: true,
      });
      application.status = 'OfferExtended';
      application.revision += 1;
    }

    return created(toOffer(offer));
  });

  mock.onPost(new RegExp(`^${ROOT}/offers/[^/]+/respond$`)).reply((config) => {
    const offerId = idFrom(config.url, 'offers');
    const offer = state.offers.find((entry) => entry.offerId === offerId);

    if (!offer) {
      return notFound('jobs.offer.not-found', 'That offer could not be found.');
    }

    const application = findApplication(offer.applicationId);

    // The candidate's route, and ownership decides it — an employer cannot
    // accept on somebody's behalf.
    if (!application || application.applicantUserId !== DEV_CALLER_USER_ID) {
      return forbidden('jobs.not-applicant', 'Only the candidate can answer this offer.');
    }

    if (offer.status === 'Draft') {
      return conflict('jobs.offer.not-extended', 'This offer has not been sent yet.');
    }

    if (offer.status !== 'Extended') {
      return conflict('jobs.offer.already-decided', 'This offer has already been answered.');
    }

    // Property 23. The clock decides, not the stored row.
    if (new Date(offer.expiresAt).getTime() <= NOW.getTime()) {
      return conflict('jobs.offer.expired', 'This offer has expired.');
    }

    const payload = body(config);
    const accept = payload.accept === true;

    offer.status = accept ? 'Accepted' : 'Rejected';
    offer.answeredAt = NOW.toISOString();
    offer.responseReason = text(payload.reason);
    offer.revision += 1;

    // The candidate turning an offer down is recorded as a rejection of the
    // application, with the offer holding who declined and why.
    const applicationTarget: WireApplicationStatus = accept ? 'Accepted' : 'Rejected';
    application.history.push({
      entryId: nextId('00000000-0000-4000-f000-'),
      kind: 'OfferAnswered',
      fromStatus: application.status,
      toStatus: applicationTarget,
      note: offer.responseReason,
      occurredAt: NOW.toISOString(),
      isVisibleToCandidate: true,
    });
    application.status = applicationTarget;
    application.decidedAt = NOW.toISOString();
    application.revision += 1;

    return ok(toOffer(offer));
  });

  // ── Apply ─────────────────────────────────────────────────────────────────
  //
  // Registered after the `/applications/*` patterns so the broader `/{jobId}/`
  // shape cannot shadow them.

  mock.onPost(new RegExp(`^${ROOT}/[^/]+/apply$`)).reply((config) => {
    // Property 1. No profile gate: a member's first application makes their
    // candidate profile, below, once nothing is left to refuse it.
    const jobId = config.url?.split('/').slice(-2)[0] ?? null;
    const posting = findPosting(jobId);

    // Property 3. Visibility first, and before any reason that would confirm the
    // posting exists. A draft reads as not found to everyone but its employer.
    if (!posting || !posting.isVisible) {
      return notFound('jobs.posting.not-found', 'That job could not be found.');
    }

    // Property 2. The order below is the candidate's, not the validator's.
    if (!posting.acceptsApplications) {
      // The most specific reason available, so the candidate knows whether to
      // wait or move on.
      if (posting.remainingVacancies === 0) {
        return conflict('jobs.posting.no-vacancies', 'Every vacancy on this role is filled.');
      }
      if (posting.closingDatePassed) {
        return conflict('jobs.posting.expired', 'This role closed to applications.');
      }
      return conflict('jobs.application.closed', 'This role is not taking applications.');
    }

    // Property 4. A **400**, not a 403 — `Error.Validation` in JobErrors.cs:487.
    // A recruiter applying to their own employer's posting would create an
    // application they can then decide on.
    if (state.memberships.includes(posting.employerId)) {
      return validation(
        'jobs.application.self',
        'You cannot apply to a role posted by an employer you work for.'
      );
    }

    const already = state.applications.find(
      (application) =>
        application.jobId === posting.jobId &&
        application.applicantUserId === DEV_CALLER_USER_ID
    );

    if (already) {
      return conflict('jobs.application.already-applied', 'You have already applied to this job.');
    }

    const sentToday = state.applications.filter(
      (application) => application.applicantUserId === DEV_CALLER_USER_ID
    ).length;

    if (sentToday >= DEV_MAX_APPLICATIONS_PER_DAY) {
      return problem(
        429,
        'jobs.applications.too-many',
        'Too many requests',
        'You have reached today’s application limit.'
      );
    }

    const payload = body(config);
    const requestedResume = text(payload.resumeId);

    // A résumé identifier is guessable, and an application carrying somebody
    // else's document would be a data leak with a plausible-looking cause. No
    // route on this module creates one, so every identifier is somebody else's.
    if (requestedResume) {
      return notFound('jobs.resume.not-found', 'That CV could not be found.');
    }

    if (posting.requiresResume && !state.hasDefaultResume) {
      return validation(
        'jobs.application.resume-required',
        'This role requires a CV and you have not added one.'
      );
    }

    // The question text is taken from the **posting**, never from the request: a
    // candidate must not be able to choose what they appear to have been asked.
    const supplied = new Map<string, string>();
    if (Array.isArray(payload.answers)) {
      for (const answer of payload.answers as { questionId?: unknown; answer?: unknown }[]) {
        const questionId = text(answer?.questionId);
        const value = text(answer?.answer);
        if (questionId && value) supplied.set(questionId, value);
      }
    }

    const answers: DevApplication['answers'] = [];
    for (const question of posting.screeningQuestions) {
      const value = supplied.get(question.questionId);
      if (!value) {
        if (question.isRequired) {
          return validation(
            'jobs.application.answer.invalid',
            'A required screening question was left blank.'
          );
        }
        continue;
      }
      answers.push({
        questionId: question.questionId,
        questionText: question.text,
        answer: value,
      });
    }

    const attachments: DevApplication['attachments'] = Array.isArray(payload.attachments)
      ? (payload.attachments as { kind?: unknown; mediaId?: unknown; fileName?: unknown }[]).map(
          (attachment) => ({
            attachmentId: nextId('00000000-0000-4000-7000-'),
            kind: String(attachment?.kind ?? 'Other'),
            mediaId: String(attachment?.mediaId ?? ''),
            fileName: text(attachment?.fileName),
          })
        )
      : [];

    const candidate = state.candidateProfile ?? provisionCandidateProfile();

    const application: DevApplication = {
      applicationId: nextId('00000000-0000-4000-e000-'),
      jobId: posting.jobId,
      employerId: posting.employerId,
      candidateId: candidate.candidateId,
      applicantUserId: DEV_CALLER_USER_ID,
      candidateHeadline: candidate.headline,
      status: 'Submitted',
      stageKey: 'applied',
      coverLetter: text(payload.coverLetter),
      resumeId: null,
      resumeLabel: null,
      answers,
      attachments,
      history: [
        {
          entryId: nextId('00000000-0000-4000-f000-'),
          kind: 'Submitted',
          fromStatus: null,
          toStatus: 'Submitted',
          note: null,
          occurredAt: NOW.toISOString(),
          isVisibleToCandidate: true,
        },
      ],
      submittedAt: NOW.toISOString(),
      firstViewedAt: null,
      decidedAt: null,
      decisionReason: null,
      hoursToFirstResponse: null,
      revision: 1,
    };

    state.applications.push(application);

    // Property 18. `employerName: string.Empty`, explicitly, because the handler
    // does not load the employer on this path. A confirmation screen that read
    // it would render a blank where a company name should be.
    return created(toApplication(application, false, ''));
  });

  // ── Candidate profile ─────────────────────────────────────────────────────

  mock.onGet(new RegExp(`^${ROOT}/candidate/profile$`)).reply(() => {
    if (!state.candidateProfile) {
      return forbidden('jobs.not-candidate', 'You do not have a professional profile yet.');
    }

    return ok(toCandidateProfile(state.candidateProfile));
  });

  mock.onPost(new RegExp(`^${ROOT}/candidate/profile$`)).reply((config) => {
    // Property 14. Not an upsert.
    if (state.candidateProfile) {
      return conflict(
        'jobs.candidate.already-exists',
        'You already have a professional profile.'
      );
    }

    const payload = body(config);

    // Optional since 14 Sep 2026. Only one that is too long is refused.
    const headline = text(payload.headline);

    if (headline && headline.length > 200) {
      return validation('jobs.candidate.headline.invalid', 'The headline or summary is too long.');
    }

    state.candidateProfile = {
      candidateId: DEV_CALLER_CANDIDATE_ID,
      headline,
      summary: text(payload.summary),
      countryCode: text(payload.countryCode),
      cityName: text(payload.cityName),
      // The create request carries none of these. They are the aggregate's
      // defaults, and a screen expecting to have set them will see otherwise.
      experienceLevel: 'Entry',
      remotePreference: 'Flexible',
      noticePeriodDays: null,
      isOpenToWork: true,
      // Created private. There is no field on the request that could say
      // otherwise, and only the visibility route changes it.
      visibility: 'Private',
      expectedSalaryMinimum: null,
      expectedSalaryCurrency: null,
      expectedSalaryPeriod: null,
      expectedSalaryFlexible: false,
      revision: 1,
    };

    return created(toCandidateProfile(state.candidateProfile));
  });

  mock.onPut(new RegExp(`^${ROOT}/candidate/profile$`)).reply((config) => {
    if (!state.candidateProfile) {
      return forbidden('jobs.not-candidate', 'You do not have a professional profile yet.');
    }

    const payload = body(config);
    const headline = text(payload.headline);

    if (headline && headline.length > 200) {
      return validation('jobs.candidate.headline.invalid', 'The headline or summary is too long.');
    }

    // A whole-document save: an omitted optional field is **cleared**, not left
    // alone. Modelled rather than merged, because a screen that sent only the
    // field it edited would blank the rest.
    state.candidateProfile = {
      ...state.candidateProfile,
      headline,
      summary: text(payload.summary),
      countryCode: text(payload.countryCode),
      cityName: text(payload.cityName),
      experienceLevel: String(payload.experienceLevel ?? 'Entry'),
      remotePreference: String(payload.remotePreference ?? 'Flexible'),
      expectedSalaryMinimum:
        typeof payload.expectedSalaryMinimum === 'number' ? payload.expectedSalaryMinimum : null,
      expectedSalaryCurrency: text(payload.expectedSalaryCurrency),
      expectedSalaryPeriod: text(payload.expectedSalaryPeriod),
      expectedSalaryFlexible: payload.expectedSalaryFlexible === true,
      noticePeriodDays:
        typeof payload.noticePeriodDays === 'number' ? payload.noticePeriodDays : null,
      isOpenToWork: payload.isOpenToWork !== false,
      revision: state.candidateProfile.revision + 1,
    };

    return ok(toCandidateProfile(state.candidateProfile));
  });

  mock.onPut(new RegExp(`^${ROOT}/candidate/profile/visibility$`)).reply((config) => {
    if (!state.candidateProfile) {
      return forbidden('jobs.not-candidate', 'You do not have a professional profile yet.');
    }

    const known = ['Private', 'VerifiedEmployers', 'Members', 'Public'];
    const requested = String(body(config).visibility ?? '');
    const visibility = known.find((entry) => entry.toLowerCase() === requested.toLowerCase());

    if (!visibility) {
      // The server's own code here is `jobs.candidate.headline.invalid`, which
      // is a mislabelled error on the backend rather than anything the client
      // did — `ChangeCandidateVisibilityCommandHandler.cs:39`. Reproduced
      // exactly, so that a client which surfaced the code to a member finds out
      // it says the wrong thing.
      return validation('jobs.candidate.headline.invalid', `Unknown visibility '${requested}'.`);
    }

    state.candidateProfile.visibility = visibility;
    state.candidateProfile.revision += 1;

    // Property 17 again. 200 with `data: null` — the profile is not returned.
    return okNull();
  });

  // ── Candidate dashboard ───────────────────────────────────────────────────

  mock.onGet(new RegExp(`^${ROOT}/candidate/dashboard(\\?.*)?$`)).reply(() => {
    const mine = state.applications.filter(
      (application) => application.applicantUserId === DEV_CALLER_USER_ID
    );

    const myApplicationIds = new Set(mine.map((application) => application.applicationId));

    const outstandingOffers = state.offers
      .filter(
        (offer) => myApplicationIds.has(offer.applicationId) && offer.status === 'Extended'
      )
      .map(toOffer);

    const upcomingInterviews = state.interviews
      .filter(
        (interview) =>
          myApplicationIds.has(interview.applicationId) &&
          !interview.isCancelled &&
          new Date(interview.scheduledAt).getTime() > NOW.getTime()
      )
      // The candidate's copy. `feedback` is the panel's and is not on it.
      .map((interview) => toInterview(interview, false));

    return ok({
      // Null when the member has not created a profile. The client prompts, and
      // the rest of the dashboard is still populated — this route is gated on
      // `jobs.saved.manage`, not on having a profile.
      candidateId: state.candidateProfile?.candidateId ?? null,
      profileCompletenessPercent: state.candidateProfile ? 45 : null,
      outstandingOffers,
      upcomingInterviews,
      activeApplicationCount: mine.filter((a) => !isTerminal(a.status)).length,
      totalApplicationCount: mine.length,
      unviewedApplicationCount: mine.filter(
        (a) => a.firstViewedAt === null && !isTerminal(a.status)
      ).length,
      applicationsByStatus: countByStatus(mine),
      recentApplications: mine
        .slice()
        .sort(
          (left, right) =>
            new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime()
        )
        .slice(0, 5)
        // A candidate's own tracker. No headline — property 19.
        .map((application) => toCard(application, false)),
      savedJobCount: 0,
      savedClosingSoon: [],
      activeAlertCount: 0,
      recommended: [toJobCard(POSTINGS[0])],
    });
  });

  // ── Employers ─────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`^${ROOT}/employers/dashboard(\\?.*)?$`)).reply((config) => {
    const requested = text(query(config).employerId);

    // Property 12. `ResolveSoleEmployerAsync` returns null for both zero
    // memberships and several, and the handler answers not-found rather than
    // picking one for you.
    const employerId = requested ?? (state.memberships.length === 1 ? state.memberships[0] : null);

    if (!employerId) {
      return notFound(
        'jobs.employer.not-found',
        'Name the employer whose dashboard you want.'
      );
    }

    const employer = state.employers[employerId];
    if (!employer) {
      return notFound('jobs.employer.not-found', 'That employer could not be found.');
    }

    // Property 11.
    if (!state.memberships.includes(employerId)) {
      return forbidden('jobs.not-employer', 'You do not belong to that employer.');
    }

    const rows = state.applications.filter(
      (application) => application.employerId === employerId
    );
    const postings = POSTINGS.filter((posting) => posting.employerId === employerId);

    // Unanswered past the platform's threshold. It is what feeds the employer's
    // public ghosting rate, and showing it to them before it shows to candidates
    // is the fair order.
    const staleThresholdDays = 7;

    return ok({
      employerId,
      employerName: employer.displayName,
      isVerified: employer.isVerified,
      draftCount: 0,
      openCount: postings.filter((posting) => posting.acceptsApplications).length,
      closedCount: postings.filter((posting) => !posting.acceptsApplications).length,
      filledCount: 0,
      totalApplicationCount: rows.length,
      activeApplicationCount: rows.filter((a) => !isTerminal(a.status)).length,
      unviewedApplicationCount: rows.filter((a) => a.firstViewedAt === null).length,
      staleApplicationCount: rows.filter(
        (a) => a.decidedAt === null && daysSince(a.submittedAt) >= staleThresholdDays
      ).length,
      applicationsByStatus: countByStatus(rows),
      upcomingInterviewCount: state.interviews.filter(
        (interview) =>
          interview.employerId === employerId &&
          new Date(interview.scheduledAt).getTime() > NOW.getTime()
      ).length,
      outstandingOfferCount: state.offers.filter(
        (offer) => offer.employerId === employerId && offer.status === 'Extended'
      ).length,
      responsiveness: toResponsiveness(employer),
      recentJobs: postings.map(toJobCard),
    });
  });

  // The public profile, by identifier or slug. Registered AFTER the dashboard:
  // ASP.NET prefers the literal `dashboard` segment over the parameter, while
  // axios-mock-adapter answers with the first pattern that matches.
  mock.onGet(new RegExp(`^${ROOT}/employers/[^/?]+$`)).reply((config) => {
    const idOrSlug = idFrom(config.url, 'employers');
    const employer = Object.values(state.employers).find(
      (candidate) => candidate.employerId === idOrSlug || candidate.slug === idOrSlug
    );

    if (!employer) {
      return notFound('jobs.employer.not-found', 'That employer could not be found.');
    }

    // `EmployerMapper`: the registry details and the team go to the team only.
    return ok(toEmployer(employer, state.memberships.includes(employer.employerId)));
  });

  mock.onPost(new RegExp(`^${ROOT}/employers/?$`)).reply((config) => {
    const payload = body(config);
    const displayName = text(payload.displayName);
    const countryCode = text(payload.countryCode);
    const organizationType = text(payload.organizationType);

    if (!displayName || displayName.trim().length < 2) {
      return validation('jobs.employer.name.invalid', 'A display name is required.');
    }

    if (!organizationType) {
      return validation('jobs.employer.name.invalid', 'An organisation type is required.');
    }

    // Property 13. `.Length(2)`, applied before any round trip. A three-letter
    // code is a 400 rather than a silent normalisation.
    if (!countryCode || countryCode.trim().length !== 2) {
      return validation(
        'jobs.country.invalid',
        'A country code must be exactly two characters.'
      );
    }

    const employerId = nextId('00000000-0000-4000-b000-');

    const employer: DevEmployer = {
      employerId,
      slug:
        text(payload.slug) ??
        displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      displayName,
      legalName: text(payload.legalName),
      registrationNumber: text(payload.registrationNumber),
      organizationType,
      companySize: text(payload.companySize) ?? 'Unspecified',
      foundedYear: typeof payload.foundedYear === 'number' ? payload.foundedYear : null,
      countryCode: countryCode.toUpperCase(),
      description: text(payload.description),
      tagline: null,
      logoMediaId: null,
      coverMediaId: null,
      contactEmail: null,
      contactPhone: null,
      websiteUrl: null,
      careersUrl: null,
      // Registered unverified. Verification is Trust's, and no route on this
      // module grants it.
      isVerified: false,
      // Nothing measured yet, so every rate is null. Not 0.
      averageResponseHours: null,
      ghostingRate: null,
      offerAcceptanceRate: null,
      decidedCount: 0,
      revision: 1,
    };

    state.employers[employerId] = employer;
    // The caller becomes its first owner. No route adds a second member, so the
    // registering account is the only one that can ever act on it.
    state.memberships.push(employerId);

    return created(toEmployer(employer, true));
  });

  mock.onPut(new RegExp(`^${ROOT}/employers/[^/]+$`)).reply((config) => {
    const employerId = idFrom(config.url, 'employers');
    const employer = employerId ? state.employers[employerId] : undefined;

    if (!employer) {
      return notFound('jobs.employer.not-found', 'That employer could not be found.');
    }

    if (!state.memberships.includes(employer.employerId)) {
      return forbidden('jobs.employer.not-owned', 'You do not manage this employer.');
    }

    const payload = body(config);
    const displayName = text(payload.displayName);
    const countryCode = text(payload.countryCode);

    if (!displayName) {
      return validation('jobs.employer.name.invalid', 'A display name is required.');
    }

    if (!countryCode || countryCode.trim().length !== 2) {
      return validation(
        'jobs.country.invalid',
        'A country code must be exactly two characters.'
      );
    }

    // Optimistic concurrency. Omitting `baseRevision` opts into last-writer-wins,
    // which is the server's behaviour and not an oversight here.
    if (
      typeof payload.baseRevision === 'number' &&
      payload.baseRevision !== employer.revision
    ) {
      return conflict(
        'jobs.revision-conflict',
        'Somebody else changed this employer while you were editing.'
      );
    }

    Object.assign(employer, {
      displayName,
      legalName: text(payload.legalName),
      registrationNumber: text(payload.registrationNumber),
      organizationType: text(payload.organizationType) ?? employer.organizationType,
      companySize: text(payload.companySize) ?? 'Unspecified',
      foundedYear: typeof payload.foundedYear === 'number' ? payload.foundedYear : null,
      countryCode: countryCode.toUpperCase(),
      description: text(payload.description),
      contactEmail: text(payload.contactEmail),
      contactPhone: text(payload.contactPhone),
      websiteUrl: text(payload.websiteUrl),
      careersUrl: text(payload.careersUrl),
      logoMediaId: text(payload.logoMediaId),
      coverMediaId: text(payload.coverMediaId),
      tagline: text(payload.tagline),
      revision: employer.revision + 1,
    });

    return ok(toEmployer(employer, true));
  });

  // ── One job, and its team's three moves ───────────────────────────────────
  //
  // GUID-shaped identifiers only, so `/jobs/categories` and the other named
  // reads never land here — and so this answers before `handlers/jobs.ts`'s
  // unanchored pattern, which would hand the page a list.

  const GUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

  mock.onGet(new RegExp(`^${ROOT}/${GUID}$`)).reply((config) => {
    const posting = findPosting(config.url?.split('/').pop() ?? null);
    if (!posting) return notFound('jobs.posting.not-found', 'That job could not be found.');

    // Property 3. A draft or a removed posting is not found to anyone but its team.
    const status = statusOf(posting);
    const hidden = status === 'Draft' || status === 'Archived';
    if (hidden && !state.memberships.includes(posting.employerId)) {
      return notFound('jobs.posting.not-found', 'That job could not be found.');
    }
    return ok(toJobResponse(posting));
  });

  mock.onPost(new RegExp(`^${ROOT}/${GUID}/close$`)).reply((config) => {
    const posting = findPosting(config.url?.split('/').slice(-2)[0] ?? null);
    if (!posting) return notFound('jobs.posting.not-found', 'That job could not be found.');
    if (!state.memberships.includes(posting.employerId)) {
      return forbidden('jobs.not-employer', 'You do not manage this employer.');
    }

    const current = statusOf(posting);
    const outcome = text(body(config).outcome)?.toLowerCase() === 'filled' ? 'Filled' : 'Expired';
    const from: Record<WireJobStatus, WireJobStatus[]> = {
      Draft: [],
      Published: ['Expired'],
      Open: ['Filled', 'Expired'],
      ReceivingApplications: ['Filled', 'Expired'],
      Interviewing: ['Filled', 'Expired'],
      OfferMade: ['Filled', 'Expired'],
      Filled: [],
      Expired: [],
      Archived: [],
    };

    if (current !== outcome && !from[current].includes(outcome)) {
      const code =
        current === 'Filled'
          ? 'jobs.posting.filled'
          : current === 'Expired'
            ? 'jobs.posting.expired'
            : current === 'Archived'
              ? 'jobs.posting.archived-immutable'
              : current === 'Draft'
                ? 'jobs.posting.not-published'
                : 'jobs.posting.not-open';
      return conflict(code, 'That job cannot move to that status.');
    }

    state.postingStatus[posting.jobId] = outcome;
    state.closureReason[posting.jobId] = text(body(config).reason);
    return ok(toJobResponse(posting));
  });

  // `POST /jobs/search`, for the filter a screen sends today — one employer's
  // open jobs. Open only, which is the server's default too.
  mock.onPost(new RegExp(`^${ROOT}/search(\\?.*)?$`)).reply((config) => {
    const employerId = text(body(config).employerId);
    const items = POSTINGS.filter((posting) => posting.isVisible && acceptsNow(posting))
      .filter((posting) => !employerId || posting.employerId === employerId)
      .map(toJobCard);

    return ok({ items, nextCursor: null, hasMore: false, totalCount: null, facets: null });
  });

  mock.onPost(new RegExp(`^${ROOT}/${GUID}/archive$`)).reply((config) => {
    const posting = findPosting(config.url?.split('/').slice(-2)[0] ?? null);
    if (!posting) return notFound('jobs.posting.not-found', 'That job could not be found.');
    if (!state.memberships.includes(posting.employerId)) {
      return forbidden('jobs.not-employer', 'You do not manage this employer.');
    }
    state.postingStatus[posting.jobId] = 'Archived';
    // Property 17. The non-generic result.
    return okNull();
  });
}

/**
 * The candidate profile a member's first application makes: private, with
 * nothing written on it. Mirrors `ApplyToJobCommandHandler.ProvisionCandidateAsync`.
 */
function provisionCandidateProfile(): DevCandidateProfile {
  const profile: DevCandidateProfile = {
    candidateId: DEV_CALLER_CANDIDATE_ID,
    headline: null,
    summary: null,
    countryCode: null,
    cityName: null,
    experienceLevel: 'Entry',
    remotePreference: 'Flexible',
    noticePeriodDays: null,
    isOpenToWork: true,
    visibility: 'Private',
    expectedSalaryMinimum: null,
    expectedSalaryCurrency: null,
    expectedSalaryPeriod: null,
    expectedSalaryFlexible: false,
    revision: 1,
  };

  state.candidateProfile = profile;
  return profile;
}

/** `CandidateProfileResponse`. Every collection is empty: no route writes to any. */
function toCandidateProfile(profile: DevCandidateProfile): unknown {
  return {
    candidateId: profile.candidateId,
    userId: DEV_CALLER_USER_ID,
    headline: profile.headline,
    summary: profile.summary,
    countryCode: profile.countryCode,
    cityName: profile.cityName,
    experienceLevel: profile.experienceLevel,
    highestEducation: 'None',
    remotePreference: profile.remotePreference,
    noticePeriodDays: profile.noticePeriodDays,
    isOpenToWork: profile.isOpenToWork,
    visibility: profile.visibility,
    // Present for the owner and nobody else. This handler only ever answers the
    // owner, so it is always here — and a screen must still not assume that on
    // any other reader's copy.
    salaryExpectation: {
      minimum: profile.expectedSalaryMinimum,
      currencyCode: profile.expectedSalaryCurrency,
      period: profile.expectedSalaryPeriod,
      isFlexible: profile.expectedSalaryFlexible,
    },
    // No route on this module writes to any of these, so they are empty on
    // every deployment. Not an omission here: it is the truth about the module.
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    languages: [],
    workAuthorizations: [],
    preferredLocations: [],
    portfolio: [],
    completenessPercent: 45,
    revision: profile.revision,
  };
}
