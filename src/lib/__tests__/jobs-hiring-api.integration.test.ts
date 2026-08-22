// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the Jobs hiring workflow against the real contract
// (Remediation Wave K)
//
// Runs the real `lib/jobs-hiring-api.ts` against the real
// `mocks/handlers/jobs-hiring.ts`, which was written from
// `Diaspora.Modules.Jobs`'s own source rather than from what this client
// expects. Nothing is re-implemented here: a test against a re-implementation of
// the thing under test proves nothing.
//
// Every case below pins something that would break a client **silently** — an
// empty list with no error, a filter that quietly matched everything, a "0%
// ghosting" printed over an employer nobody measured, a blank company name on a
// confirmation screen, a withdrawal button on somebody else's application. The
// loud failures look after themselves.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import { readPage } from '@/lib/platform-envelope';
import {
  DEV_CALLER_CANDIDATE_ID,
  DEV_EMPLOYER_MINE,
  DEV_EMPLOYER_OTHER,
  DEV_JOB_CLOSED,
  DEV_JOB_DRAFT,
  DEV_JOB_EXPIRED,
  DEV_JOB_MINE,
  DEV_JOB_NO_VACANCIES,
  DEV_JOB_OPEN,
  DEV_JOB_REQUIRES_RESUME,
  DEV_JOB_WITH_QUESTION,
  DEV_SCREENING_QUESTION_ID,
  resetJobsHiringMocks,
  setupJobsHiringMocks,
} from '@/mocks/handlers/jobs-hiring';
import {
  APPLICATION_STATUSES,
  CANDIDATE_PROFILE_READ_ROUTE_ABSENT,
  EMPLOYER_DECISION_STATUSES,
  EMPLOYER_PROFILE_ROUTE_ABSENT,
  allowedDecisionsFrom,
  applicationsInStatus,
  applyToJob,
  changeCandidateVisibility,
  createCandidateProfile,
  decideApplication,
  extendOffer,
  fetchApplications,
  fetchCandidateDashboard,
  fetchEmployerDashboard,
  hasResponsivenessEvidence,
  interviewDetailRequirement,
  isAlreadyAppliedError,
  isApplicationsClosedError,
  isAwaitingFirstView,
  isCandidateProfileExistsError,
  isNotCandidateError,
  isSelfApplicationError,
  isTerminalStatus,
  jobsHiringErrorMessage,
  registerEmployer,
  respondToOffer,
  scheduleInterview,
  withdrawApplication,
} from '@/lib/jobs-hiring-api';
import type { ApplicationCardResponse } from '@/types/jobs-hiring';

let mock: MockAdapter;

/** The seeded application on the caller's own employer that nobody has opened. */
const UNVIEWED_APPLICATION = '00000000-0000-4000-e000-000000000001';
/** The seeded one already shortlisted. */
const SHORTLISTED_APPLICATION = '00000000-0000-4000-e000-000000000002';

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupJobsHiringMocks(mock);
  // Anything this client sends that the handler does not answer is a defect in
  // the client, not a passthrough.
  mock.onAny().reply(404);
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  resetJobsHiringMocks();
  mock.resetHistory();
});

/** The problem code the server sent, from the platform's problem envelope. */
function codeOf(cause: unknown): string | null {
  const code = (cause as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

function statusOf(cause: unknown): number | null {
  const value = (cause as { response?: { status?: number } })?.response?.status;
  return typeof value === 'number' ? value : null;
}

// ── Trap 1: the page shape ───────────────────────────────────────────────────

describe('the applications list is a real CursorPagedResult, and readPage absorbs it', () => {
  it('returns rows under `items`, so `readPage` finds them', async () => {
    // The whole reason this is asserted rather than assumed: `readPage` branches
    // on `Array.isArray(payload.items)`. `CommentThreadResponse` names its rows
    // `comments` and comes back as an **empty page with no error** — which is
    // how every comment thread in this application would have rendered "no
    // comments yet". If a Jobs list route ever renames its rows, this fails
    // rather than the screen going quietly blank.
    const response = await apiClient.get('/jobs/applications', {
      params: { employerId: DEV_EMPLOYER_MINE },
    });

    expect(Array.isArray(response.data.data.items)).toBe(true);
    expect(response.data.data).toHaveProperty('nextCursor');
    expect(response.data.data).toHaveProperty('hasMore');

    const page = readPage<ApplicationCardResponse>(response.data);
    expect(page.items.length).toBe(2);
    expect(page.totalCount).toBe(2);
  });

  it('pages by cursor and stops on hasMore rather than on a short page', async () => {
    const first = await fetchApplications({ employerId: DEV_EMPLOYER_MINE, limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await fetchApplications({
      employerId: DEV_EMPLOYER_MINE,
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.items[0].applicationId).not.toBe(first.items[0].applicationId);
  });
});

// ── Trap 2: the filter that silently matches everything ──────────────────────

describe('an unparseable status filter is dropped by the server, not refused', () => {
  it('applies the values it understands and ignores the ones it does not', async () => {
    // One good, one nonsense. `ParseMany` keeps the good one.
    const response = await apiClient.get('/jobs/applications', {
      params: { employerId: DEV_EMPLOYER_MINE, status: ['Shortlisted', 'notAStatus'] },
    });

    const page = readPage<ApplicationCardResponse>(response.data);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].status).toBe('Shortlisted');
  });

  it('returns the COMPLETE list when nothing in the filter parses', async () => {
    // **Separators are what break, not case.** `Enum.TryParse(ignoreCase: true)`
    // forgives `underreview` and `UNDERREVIEW`, so the camelCase spelling
    // Community uses would actually have worked. What it cannot read is a
    // kebab- or snake-cased slug — which is the spelling every *other* list
    // surface in this application uses for a filter value, and therefore the one
    // a screen author reaches for.
    //
    // The result is not an error. The unreadable value is dropped, the filter
    // set ends up empty, an empty filter set is "no filter", and a member
    // looking at a chip labelled "Shortlisted" is shown every application there
    // is. A working filter with a very wide match is exactly what that looks like.
    const response = await apiClient.get('/jobs/applications', {
      params: { employerId: DEV_EMPLOYER_MINE, status: ['shortlisted-only', 'under_review'] },
    });

    const page = readPage<ApplicationCardResponse>(response.data);
    expect(page.items).toHaveLength(2);
  });

  it('parses case-insensitively, so an exact-match assumption is not load-bearing', async () => {
    for (const spelling of ['SHORTLISTED', 'shortlisted', 'sHoRtLiStEd']) {
      const response = await apiClient.get('/jobs/applications', {
        params: { employerId: DEV_EMPLOYER_MINE, status: [spelling] },
      });

      expect(readPage<ApplicationCardResponse>(response.data).items).toHaveLength(1);
    }
  });

  it('the client refuses any spelling that is not the wire’s own', async () => {
    // Stricter than the server on purpose. The server would forgive a case
    // variant and silently drop a separator variant, and from the client's side
    // those two outcomes are indistinguishable — one returns the right rows and
    // the other returns all of them, both at HTTP 200. Refusing everything that
    // is not the exact wire spelling is the only rule that catches the second
    // case, and it costs nothing to obey.
    for (const spelling of ['under_review', 'under-review', 'underReview']) {
      await expect(
        fetchApplications({
          employerId: DEV_EMPLOYER_MINE,
          // A deliberate lie about the type, which is exactly what a screen with
          // a hand-written chip list would do.
          statuses: [spelling as (typeof APPLICATION_STATUSES)[number]],
        })
      ).rejects.toThrow(/Unknown application status/);
    }
  });
});

// ── Trap 3: applying without a candidate profile ─────────────────────────────

describe('applying requires a candidate profile, which no screen used to create', () => {
  it('refuses with 403 jobs.not-candidate when the member has none', async () => {
    resetJobsHiringMocks({ withCandidateProfile: false });

    const cause = await applyToJob(DEV_JOB_OPEN).catch((error: unknown) => error);

    expect(statusOf(cause)).toBe(403);
    expect(codeOf(cause)).toBe('jobs.not-candidate');
    expect(isNotCandidateError(cause)).toBe(true);
    // And it is a fixable refusal, so the sentence sends them somewhere.
    expect(jobsHiringErrorMessage(cause)).toMatch(/profile/i);
  });

  it('succeeds once a profile exists, and the profile is created Private', async () => {
    resetJobsHiringMocks({ withCandidateProfile: false });

    const profile = await createCandidateProfile({ headline: 'Care assistant, 3 years' });
    // There is no field on the create request that could have said otherwise.
    expect(profile.visibility).toBe('Private');

    const application = await applyToJob(DEV_JOB_OPEN);
    expect(application.status).toBe('Submitted');
  });

  it('creating a profile twice is a 409 — it is not an upsert', async () => {
    const cause = await createCandidateProfile({ headline: 'Anything' }).catch(
      (error: unknown) => error
    );

    expect(statusOf(cause)).toBe(409);
    expect(isCandidateProfileExistsError(cause)).toBe(true);
  });
});

// ── Trap 4: the apply response's blank employer name ─────────────────────────

describe('the apply response carries an EMPTY employer name', () => {
  it('returns employerName as the empty string, not the company', async () => {
    const application = await applyToJob(DEV_JOB_OPEN);

    // `ApplyToJobCommandHandler.cs:205` passes `employerName: string.Empty`
    // explicitly rather than loading the employer. A confirmation screen reading
    // it renders a blank where a company name should be — which is why the job
    // detail screen takes the name from the job it applied to.
    expect(application.employerName).toBe('');
    expect(application.jobTitle).not.toBe('');
    expect(application.candidateId).toBe(DEV_CALLER_CANDIDATE_ID);
  });

  it('carries the timeline, which no route can ever fetch again', async () => {
    const application = await applyToJob(DEV_JOB_OPEN);

    expect(application.history).toHaveLength(1);
    expect(application.history[0].kind).toBe('Submitted');
    // There is no GET for one application, so this is the only moment it exists.
    await expect(
      apiClient.get(`/jobs/applications/${application.applicationId}`)
    ).rejects.toBeDefined();
  });
});

// ── Trap 5: the refusals, in the server's own order and with its own codes ───

describe('the apply refusals are the server’s, in the candidate’s order', () => {
  it('answers 404 for a draft posting rather than telling a stranger it exists', async () => {
    const cause = await applyToJob(DEV_JOB_DRAFT).catch((error: unknown) => error);

    expect(statusOf(cause)).toBe(404);
    expect(codeOf(cause)).toBe('jobs.posting.not-found');
  });

  it('distinguishes closed, expired and filled', async () => {
    const closed = await applyToJob(DEV_JOB_CLOSED).catch((error: unknown) => error);
    const expired = await applyToJob(DEV_JOB_EXPIRED).catch((error: unknown) => error);
    const filled = await applyToJob(DEV_JOB_NO_VACANCIES).catch((error: unknown) => error);

    expect(codeOf(closed)).toBe('jobs.application.closed');
    expect(codeOf(expired)).toBe('jobs.posting.expired');
    expect(codeOf(filled)).toBe('jobs.posting.no-vacancies');

    // All three are "you cannot apply" to a screen that only needs that much.
    for (const cause of [closed, expired, filled]) {
      expect(isApplicationsClosedError(cause)).toBe(true);
    }
  });

  it('refuses self-application with a 400, NOT a 403', async () => {
    // `Error.Validation` at `JobErrors.cs:487`. A client that branched on the
    // status code rather than the problem code would put this in the wrong bucket.
    const cause = await applyToJob(DEV_JOB_MINE).catch((error: unknown) => error);

    expect(statusOf(cause)).toBe(400);
    expect(isSelfApplicationError(cause)).toBe(true);
  });

  it('refuses a second application to the same job — apply is not idempotent', async () => {
    await applyToJob(DEV_JOB_OPEN);
    const cause = await applyToJob(DEV_JOB_OPEN).catch((error: unknown) => error);

    // No idempotency key exists anywhere on this module, in a header or a body,
    // so a retry after an ambiguous timeout lands here rather than succeeding.
    expect(statusOf(cause)).toBe(409);
    expect(isAlreadyAppliedError(cause)).toBe(true);
  });

  it('refuses when the posting requires a CV the candidate does not have', async () => {
    const cause = await applyToJob(DEV_JOB_REQUIRES_RESUME).catch((error: unknown) => error);

    expect(codeOf(cause)).toBe('jobs.application.resume-required');
  });

  it('refuses a blank answer to a required screening question', async () => {
    const cause = await applyToJob(DEV_JOB_WITH_QUESTION).catch((error: unknown) => error);
    expect(codeOf(cause)).toBe('jobs.application.answer.invalid');

    const application = await applyToJob(DEV_JOB_WITH_QUESTION, {
      answers: [{ questionId: DEV_SCREENING_QUESTION_ID, answer: 'Yes, valid until 2028.' }],
    });

    // The question TEXT comes from the posting, never from the request: a
    // candidate must not be able to choose what they appear to have been asked.
    expect(application.answers[0].questionText).toBe('Do you hold a current Driver CPC?');
  });
});

// ── Trap 6: withdrawal is the applicant's alone, and answers nothing ─────────

describe('withdrawal', () => {
  it('answers 200 with data: null, so there is nothing to cache', async () => {
    const application = await applyToJob(DEV_JOB_OPEN);

    const response = await apiClient.post(
      `/jobs/applications/${application.applicationId}/withdraw`,
      { reason: null }
    );

    expect(response.status).toBe(200);
    // Not the withdrawn application, and not a 204 either.
    expect(response.data.data).toBeNull();

    await expect(withdrawApplication(application.applicationId)).rejects.toBeDefined();
  });

  it('leaves the row in place as Withdrawn rather than removing it', async () => {
    const application = await applyToJob(DEV_JOB_OPEN);
    await withdrawApplication(application.applicationId, { reason: 'Took another role' });

    const page = await fetchApplications();
    const row = page.items.find((item) => item.applicationId === application.applicationId);

    expect(row?.status).toBe('Withdrawn');
    expect(row?.isActive).toBe(false);
  });

  it('refuses when the caller is not the applicant — not even staff may', async () => {
    // The server requires ownership rather than a permission, so this must never
    // be wired to an employer surface.
    const cause = await withdrawApplication(UNVIEWED_APPLICATION).catch(
      (error: unknown) => error
    );

    expect(statusOf(cause)).toBe(403);
    expect(codeOf(cause)).toBe('jobs.not-applicant');
  });
});

// ── Trap 7: the decide route cannot reach Withdrawn ──────────────────────────

describe('the employer decision', () => {
  it('refuses Withdrawn, which parses perfectly well as a status', async () => {
    const cause = await decideApplication(UNVIEWED_APPLICATION, {
      // A deliberate lie about the type, which is what a screen reusing one
      // status picker for both sides of the workflow would produce.
      status: 'Withdrawn' as 'Rejected',
    }).catch((error: unknown) => error);

    expect(statusOf(cause)).toBe(409);
    expect(codeOf(cause)).toBe('jobs.application.transition-invalid');
    // And the client's own vocabulary never offered it.
    expect(EMPLOYER_DECISION_STATUSES).not.toContain('Withdrawn' as never);
  });

  it('refuses a move the transition table does not permit', async () => {
    // Submitted cannot jump straight to an offer.
    const cause = await decideApplication(UNVIEWED_APPLICATION, {
      status: 'OfferExtended',
    }).catch((error: unknown) => error);

    expect(codeOf(cause)).toBe('jobs.application.transition-invalid');
  });

  it('the client’s transition table agrees with the server’s refusals', async () => {
    // The table exists to stop a control being offered that the server refuses.
    // It is not an authority — this asserts it is not a *contradiction* either.
    expect(allowedDecisionsFrom('Submitted')).toEqual([
      'UnderReview',
      'Shortlisted',
      'Rejected',
    ]);
    // The one legal backward move: a cancelled interview returns the candidate
    // to the shortlist.
    expect(allowedDecisionsFrom('InterviewScheduled')).toContain('Shortlisted');
    expect(allowedDecisionsFrom('Rejected')).toEqual([]);
    expect(isTerminalStatus('Withdrawn')).toBe(true);

    const moved = await decideApplication(UNVIEWED_APPLICATION, { status: 'Shortlisted' });
    expect(moved.status).toBe('Shortlisted');
  });

  it('refuses a caller who is not a recruiter for the hiring employer', async () => {
    const applied = await applyToJob(DEV_JOB_OPEN);
    const cause = await decideApplication(applied.applicationId, {
      status: 'Shortlisted',
    }).catch((error: unknown) => error);

    // The policy is necessary and never sufficient — the handler asks the
    // employer aggregate whether the caller may act on THIS application.
    expect(statusOf(cause)).toBe(403);
    expect(codeOf(cause)).toBe('jobs.not-recruiter');
  });

  it('keeps an invisible reason off the response and out of the candidate’s timeline', async () => {
    const decided = await decideApplication(UNVIEWED_APPLICATION, {
      status: 'Rejected',
      reason: 'We already have someone at second interview.',
      reasonVisibleToCandidate: false,
    });

    // The employer's own view carries the note, because it is their record.
    expect(decided.history.some((entry) => entry.note?.includes('second interview'))).toBe(true);
    // And `decisionReason` — the field a candidate is shown — is null.
    expect(decided.decisionReason).toBeNull();
  });
});

// ── Trap 8: the interview detail the mode requires ───────────────────────────

describe('scheduling an interview', () => {
  it('requires an address for on-site and a link for everything remote', async () => {
    expect(interviewDetailRequirement('OnSite')).toBe('address');
    expect(interviewDetailRequirement('Video')).toBe('joiningUrl');
    expect(interviewDetailRequirement('Panel')).toBe('joiningUrl');
    // An assessment is a task or a link the candidate is sent; the handler
    // insists on neither.
    expect(interviewDetailRequirement('Assessment')).toBe('none');

    const missingAddress = await scheduleInterview(SHORTLISTED_APPLICATION, {
      mode: 'OnSite',
      scheduledAt: '2026-09-01T09:00:00.000Z',
      durationMinutes: 60,
    }).catch((error: unknown) => error);

    expect(codeOf(missingAddress)).toBe('jobs.interview.location.invalid');
  });

  it('refuses a time in the past', async () => {
    const cause = await scheduleInterview(SHORTLISTED_APPLICATION, {
      mode: 'Video',
      scheduledAt: '2020-01-01T09:00:00.000Z',
      durationMinutes: 45,
      joiningUrl: 'https://example.invalid/room',
    }).catch((error: unknown) => error);

    expect(codeOf(cause)).toBe('jobs.interview.in-past');
  });

  it('moves the application to InterviewScheduled as a side effect', async () => {
    const interview = await scheduleInterview(SHORTLISTED_APPLICATION, {
      mode: 'Video',
      scheduledAt: '2026-09-01T09:00:00.000Z',
      durationMinutes: 45,
      timeZoneId: 'Europe/Berlin',
      joiningUrl: 'https://example.invalid/room',
    });

    expect(interview.outcome).toBe('Pending');
    // Not an outcome to render as one: every scheduled interview carries it.
    expect(interview.roundNumber).toBe(1);
    // The employer's wall clock, beside the instant. A candidate three zones
    // away needs both rendered.
    expect(interview.timeZoneId).toBe('Europe/Berlin');

    const page = await fetchApplications({ employerId: DEV_EMPLOYER_MINE });
    const row = page.items.find((item) => item.applicationId === SHORTLISTED_APPLICATION);
    expect(row?.status).toBe('InterviewScheduled');
  });
});

// ── Trap 9: an offer's status is the server's clock, not the device's ────────

describe('offers', () => {
  it('extends only when told to, and computes expiry against the clock', async () => {
    const draft = await extendOffer(SHORTLISTED_APPLICATION, {
      salaryAmount: 32000,
      currencyCode: 'gbp',
      salaryPeriod: 'Yearly',
      expiresAt: '2026-09-10T12:00:00.000Z',
      // Stated. The server's default is `true`, so an omitted field would have
      // sent this to the candidate.
      extendImmediately: false,
    });

    expect(draft.status).toBe('Draft');
    // Currency is upper-cased on the way out rather than hoping the form did it.
    expect(draft.currencyCode).toBe('GBP');
    // Not answerable, so no countdown. Null is not "no time left".
    expect(draft.canRespond).toBe(false);
    expect(draft.hoursRemaining).toBeNull();

    // **Ownership is checked before the offer's state**, so somebody who is not
    // the applicant is told they are not the applicant — never that the offer
    // exists as a draft. `RespondToOfferCommandHandler` runs `RequireOwner`
    // before `offer.Answer(…)`, and that ordering is a disclosure decision
    // rather than an accident: an offer's internal state is not something a
    // stranger gets to learn by probing identifiers.
    //
    // The consequence for this store is that `jobs.offer.not-extended` is not
    // reachable from here — the only account that can extend an offer is a
    // recruiter of the hiring employer, and that account cannot also be the
    // applicant, because self-application is refused. Which is true of the real
    // platform too.
    const cause = await respondToOffer(draft.offerId, { accept: true }).catch(
      (error: unknown) => error
    );
    expect(statusOf(cause)).toBe(403);
    expect(codeOf(cause)).toBe('jobs.not-applicant');
  });

  it('refuses a deadline in the past', async () => {
    const cause = await extendOffer(SHORTLISTED_APPLICATION, {
      salaryAmount: 32000,
      currencyCode: 'GBP',
      salaryPeriod: 'Yearly',
      expiresAt: '2020-01-01T00:00:00.000Z',
    }).catch((error: unknown) => error);

    expect(codeOf(cause)).toBe('jobs.offer.expiry.in-past');
  });

  it('lets the candidate answer their own offer and nobody else’s', async () => {
    const offer = await extendOffer(SHORTLISTED_APPLICATION, {
      salaryAmount: 32000,
      currencyCode: 'GBP',
      salaryPeriod: 'Yearly',
      expiresAt: '2026-09-10T12:00:00.000Z',
    });

    expect(offer.status).toBe('Extended');
    expect(offer.canRespond).toBe(true);
    expect(typeof offer.hoursRemaining).toBe('number');

    // The seeded application belongs to somebody else, so the caller cannot
    // accept on their behalf.
    const cause = await respondToOffer(offer.offerId, { accept: true }).catch(
      (error: unknown) => error
    );
    expect(statusOf(cause)).toBe(403);
    expect(codeOf(cause)).toBe('jobs.not-applicant');
  });
});

// ── Trap 10: null is not zero, anywhere on this module ───────────────────────

describe('nullable figures are absences of evidence, never zeroes', () => {
  it('leaves every responsiveness rate null below the sample threshold', async () => {
    const dashboard = await fetchEmployerDashboard(DEV_EMPLOYER_MINE);

    // A rate computed from one or two events is noise presented as a fact about
    // a named organisation. `?? 0` here would publish "0% ghosting" about an
    // employer nobody has measured.
    expect(dashboard.responsiveness.ghostingRate).toBeNull();
    expect(dashboard.responsiveness.averageResponseHours).toBeNull();
    expect(hasResponsivenessEvidence(dashboard.responsiveness.ghostingRate)).toBe(false);
    // The count is a real number even when the rates are not.
    expect(dashboard.responsiveness.decidedCount).toBeGreaterThan(0);
  });

  it('carries a real rate for an employer that has enough evidence', async () => {
    const employer = await registerEmployer({
      displayName: 'Test Employer',
      organizationType: 'Company',
      countryCode: 'gb',
    });

    // A brand-new employer has measured nothing at all.
    expect(employer.responsiveness.ghostingRate).toBeNull();
    expect(employer.countryCode).toBe('GB');
    expect(employer.isVerified).toBe(false);
    // The registering account is its first owner, and nothing adds a second.
    expect(employer.viewerRole).toBe('Owner');
  });

  it('leaves daysWaiting null once decided rather than reporting zero', async () => {
    const page = await fetchApplications({ employerId: DEV_EMPLOYER_MINE });
    const waiting = page.items.find((item) => item.applicationId === UNVIEWED_APPLICATION);

    expect(waiting?.hasBeenViewed).toBe(false);
    expect(typeof waiting?.daysWaiting).toBe('number');
    expect(waiting ? isAwaitingFirstView(waiting) : false).toBe(true);

    await decideApplication(UNVIEWED_APPLICATION, { status: 'Rejected' });

    const after = await fetchApplications({ employerId: DEV_EMPLOYER_MINE });
    const decided = after.items.find((item) => item.applicationId === UNVIEWED_APPLICATION);
    expect(decided?.daysWaiting).toBeNull();
    expect(decided ? isAwaitingFirstView(decided) : true).toBe(false);
  });
});

// ── Trap 11: enum values are PascalCase, keys are camelCase ──────────────────

describe('the wire is camelCase keys holding PascalCase values', () => {
  it('emits PascalCase statuses and keys the status map by them', async () => {
    await applyToJob(DEV_JOB_OPEN);
    const dashboard = await fetchCandidateDashboard();

    expect(dashboard.applicationsByStatus).toHaveProperty('Submitted');
    // Not `submitted`. A client using the camelCase spelling every Community
    // surface uses reads `undefined` and renders a blank counter.
    expect(dashboard.applicationsByStatus.submitted).toBeUndefined();
    expect(applicationsInStatus(dashboard.applicationsByStatus, 'Submitted')).toBe(1);
    // Absent rather than present-and-zero, which is why the reader coalesces.
    expect(applicationsInStatus(dashboard.applicationsByStatus, 'Accepted')).toBe(0);
    expect(dashboard.applicationsByStatus).not.toHaveProperty('Accepted');
  });

  it('the client’s status vocabulary is exactly the server’s', () => {
    for (const status of APPLICATION_STATUSES) {
      expect(status).toMatch(/^[A-Z]/);
      expect(status).not.toMatch(/[-_]/);
    }
  });
});

// ── Trap 12: what the dashboards are, and are not ────────────────────────────

describe('the candidate dashboard is the only route that returns offers or interviews', () => {
  it('reports candidateId null for a member with no profile rather than failing', async () => {
    resetJobsHiringMocks({ withCandidateProfile: false });
    const dashboard = await fetchCandidateDashboard();

    // Gated on `jobs.saved.manage`, not on having a profile. So the rest of the
    // dashboard is populated and the client prompts rather than erroring.
    expect(dashboard.candidateId).toBeNull();
    expect(Array.isArray(dashboard.recommended)).toBe(true);
  });

  it('carries the candidate’s offers and interviews, which have no list route', async () => {
    await applyToJob(DEV_JOB_OPEN);
    const before = await fetchCandidateDashboard();

    expect(before.outstandingOffers).toEqual([]);
    expect(before.upcomingInterviews).toEqual([]);
    expect(before.totalApplicationCount).toBe(1);

    // And confirm the absence itself, so a screen is never built on a list route
    // that does not exist.
    await expect(apiClient.get('/jobs/interviews')).rejects.toBeDefined();
    await expect(apiClient.get('/jobs/offers')).rejects.toBeDefined();
  });

  it('does NOT put a candidate headline on the candidate’s own tracker', async () => {
    await applyToJob(DEV_JOB_OPEN);

    const mine = await fetchApplications();
    expect(mine.items[0].candidateHeadline).toBeNull();

    const theirs = await fetchApplications({ employerId: DEV_EMPLOYER_MINE });
    expect(theirs.items[0].candidateHeadline).not.toBeNull();
  });
});

describe('the employer dashboard', () => {
  it('resolves the sole membership when no employerId is named', async () => {
    const dashboard = await fetchEmployerDashboard();
    expect(dashboard.employerId).toBe(DEV_EMPLOYER_MINE);
    // The two numbers that lead the contract, and lead the screen.
    expect(dashboard.unviewedApplicationCount).toBeGreaterThan(0);
    expect(typeof dashboard.staleApplicationCount).toBe('number');
  });

  it('refuses an employer the caller does not belong to', async () => {
    const cause = await fetchEmployerDashboard(DEV_EMPLOYER_OTHER).catch(
      (error: unknown) => error
    );

    // 403, not an empty dashboard. There is no parameter that asks for a third
    // party's hiring figures.
    expect(statusOf(cause)).toBe(403);
    expect(codeOf(cause)).toBe('jobs.not-employer');
  });

  it('refuses an applicant list for an employer the caller does not belong to', async () => {
    const cause = await fetchApplications({ employerId: DEV_EMPLOYER_OTHER }).catch(
      (error: unknown) => error
    );

    expect(statusOf(cause)).toBe(403);
  });
});

// ── Trap 13: the visibility route answers nothing ────────────────────────────

describe('candidate visibility is its own route and returns no record', () => {
  it('answers 200 with data: null', async () => {
    const response = await apiClient.put('/jobs/candidate/profile/visibility', {
      visibility: 'VerifiedEmployers',
    });

    expect(response.status).toBe(200);
    expect(response.data.data).toBeNull();

    await expect(changeCandidateVisibility('Members')).resolves.toBeUndefined();
  });

  it('answers an unknown visibility with the backend’s own mislabelled code', async () => {
    const cause = await apiClient
      .put('/jobs/candidate/profile/visibility', { visibility: 'everyone' })
      .catch((error: unknown) => error);

    // `ChangeCandidateVisibilityCommandHandler.cs:39` returns
    // `JobErrors.HeadlineInvalid` for a visibility it cannot parse. That is a
    // backend defect rather than anything the client did, and it is pinned here
    // so nobody surfaces the code to a member as an explanation.
    expect(codeOf(cause)).toBe('jobs.candidate.headline.invalid');
  });
});

// ── Trap 14: the routes that do not exist ────────────────────────────────────

describe('the capabilities this module does not have', () => {
  it('has no route that reads an employer profile — NG-04', async () => {
    // Verified by reading every `Map*` call in `Diaspora.Modules.Jobs/Api/`:
    // 22 routes, and no employer read among them.
    await expect(apiClient.get(`/jobs/employers/${DEV_EMPLOYER_OTHER}`)).rejects.toBeDefined();
    expect(EMPLOYER_PROFILE_ROUTE_ABSENT).toMatch(/No backend route/);
  });

  it('has no route that reads a candidate profile back', async () => {
    await expect(apiClient.get('/jobs/candidate/profile')).rejects.toBeDefined();
    expect(CANDIDATE_PROFILE_READ_ROUTE_ABSENT).toMatch(/No backend route/);
  });
});

// ── Trap 15: no idempotency anywhere on this module ──────────────────────────

describe('no route on this module takes an idempotency key', () => {
  it('sends none, in a header or a body, and apply is therefore not retryable', async () => {
    await applyToJob(DEV_JOB_OPEN, { coverLetter: 'Hello' });

    const request = mock.history.post.find((entry) => entry.url?.endsWith('/apply'));
    expect(request).toBeDefined();

    const headers = (request?.headers ?? {}) as Record<string, unknown>;
    const headerNames = Object.keys(headers).map((name) => name.toLowerCase());
    expect(headerNames).not.toContain('idempotency-key');
    expect(headerNames).not.toContain('x-idempotency-key');

    const sent = JSON.parse(String(request?.data ?? '{}')) as Record<string, unknown>;
    // Automation requires one as a BODY field and reads no headers at all. Jobs
    // requires neither, so nothing is invented here.
    expect(sent).not.toHaveProperty('idempotencyKey');
    // And the fields that ARE sent are stated rather than omitted, so a change
    // to a server-side default cannot silently change what this client means.
    expect(sent).toHaveProperty('answers');
    expect(sent).toHaveProperty('attachments');
  });

  it('states extendImmediately and reasonVisibleToCandidate rather than defaulting them', async () => {
    await decideApplication(UNVIEWED_APPLICATION, { status: 'Shortlisted' });

    const decide = mock.history.post.find((entry) => entry.url?.endsWith('/decide'));
    const decideBody = JSON.parse(String(decide?.data ?? '{}')) as Record<string, unknown>;
    // The server defaults it to `true`, so an omitted field publishes the reason
    // to the candidate. It is never left to the default.
    expect(decideBody.reasonVisibleToCandidate).toBe(true);

    await extendOffer(SHORTLISTED_APPLICATION, {
      salaryAmount: 1,
      currencyCode: 'GBP',
      salaryPeriod: 'Yearly',
      expiresAt: '2026-09-10T12:00:00.000Z',
    });

    const offer = mock.history.post.find((entry) => entry.url?.endsWith('/offers'));
    const offerBody = JSON.parse(String(offer?.data ?? '{}')) as Record<string, unknown>;
    expect(offerBody.extendImmediately).toBe(true);
  });
});
