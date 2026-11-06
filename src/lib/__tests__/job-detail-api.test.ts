// ─────────────────────────────────────────────────────────────────────────────
// One job, as its page reads it — 15 Sep 2026
//
// The walkthrough's test job was "Walkthrough test job - please ignore": part
// time, hospitality, Rose Hill, MUR 15,000 a month, under "Walkthrough Test
// Employer". Its page showed "Employer (Community Member)", pay " /mo" and the
// location "Unknown", because it read the pre-backend fixture shape. These tests
// pin what that same response must read as, and the rules the page applies to
// it: whether it is open, what the reader may do, and what the owner may do.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import {
  applicantCountLabel,
  applyStateOf,
  archiveJob,
  categoryLabel,
  closeJob,
  describeSalary,
  employerKindLabel,
  employerResponsiveness,
  fetchJob,
  fetchSimilarJobs,
  formatJobDate,
  formatPay,
  groupDigits,
  isOnEmployerTeam,
  jobConversationSubtitle,
  jobManagementErrorMessage,
  jobPlaceLabel,
  jobStanding,
  openingsLabel,
  ownerActionsFor,
  workArrangementFacts,
} from '@/lib/job-detail-api';
import type { JobResponse, JobStatus } from '@/types/jobs-hiring';

const JOB = '01a0a162-7d03-7a7f-a613-9fe144d60657';
const EMPLOYER = '01a0a15f-1c2e-7b44-9d10-6f0e2a4b8c11';
const DAVID = '01a05770-33f2-7600-8000-0000000000da';

/** `GET /jobs/01a0a162-…` as the server answered it for Aisha on 14 Sep 2026, before she applied. */
function walkthroughJob(overrides: Partial<JobResponse> = {}): JobResponse {
  return {
    jobId: JOB,
    slug: 'walkthrough-test-job-please-ignore',
    title: 'Walkthrough test job - please ignore',
    summary: 'Test posting for the two account walkthrough on 14 Sep 2026.',
    description: 'Test posting for the two account walkthrough on 14 Sep 2026. Please do not apply',
    employer: {
      employerId: EMPLOYER,
      ownerUserId: DAVID,
      slug: 'walkthrough-test-employer',
      displayName: 'Walkthrough Test Employer',
      tagline: null,
      organizationType: 'Individual',
      isIntermediary: false,
      companySize: 'Unspecified',
      countryCode: 'MU',
      isVerified: false,
      verificationBadge: null,
      logoMediaId: null,
      coverMediaId: null,
      websiteUrl: null,
      careersUrl: null,
      averageResponseHours: null,
      ghostingRate: null,
      offerAcceptanceRate: null,
    },
    categoryKey: 'hospitality',
    jobType: 'PartTime',
    experienceLevel: 'Entry',
    educationLevel: 'None',
    tags: [],
    skills: [],
    responsibilities: [],
    requirements: [],
    benefits: [],
    location: { countryCode: 'MU', regionName: null, cityName: 'Rose Hill', areaId: null, displayName: 'Rose Hill' },
    workArrangement: {
      workplaceType: 'OnSite',
      isRemote: false,
      offersVisaSponsorship: false,
      offersRelocationAssistance: false,
      onSiteDaysPerWeek: null,
      remotePolicy: null,
    },
    salary: {
      isDisclosed: true,
      minimum: 15000,
      maximum: null,
      currencyCode: 'MUR',
      period: 'Monthly',
      isNegotiable: false,
      isUnpaid: false,
    },
    status: 'Open',
    visibility: 'Public',
    isFeatured: false,
    isVerified: false,
    vacancyCount: 1,
    remainingVacancies: 1,
    requiresResume: false,
    publishedAt: '2026-09-14T16:26:00.000Z',
    closingAt: null,
    closureReason: null,
    media: [],
    providers: [],
    guides: [],
    screeningQuestions: [],
    engagement: { viewCount: 3, applicationCount: 0, saveCount: 0 },
    revision: 3,
    hasApplied: false,
    isSaved: false,
    canApply: true,
    canManage: false,
    ...overrides,
  };
}

const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'r1' } });

function problem(status: number, code: string) {
  return { type: 'about:blank', title: 'Refused', status, code, detail: `Refused: ${code}` };
}

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient);
});

afterEach(() => {
  api.restore();
});

describe('reading a job', () => {
  it('answers the job the server sent', async () => {
    api.onGet(`/jobs/${JOB}`).reply(200, envelope(walkthroughJob()));

    await expect(fetchJob(JOB)).resolves.toMatchObject({ jobId: JOB, canApply: true });
  });

  it('answers null when the platform says the job is not there', async () => {
    api.onGet(`/jobs/${JOB}`).reply(404, problem(404, 'jobs.posting.not-found'));
    await expect(fetchJob(JOB)).resolves.toBeNull();

    api.resetHandlers();
    // An identifier that is not a GUID never reaches the handler: a bare 404.
    api.onGet('/jobs/not-a-job').reply(404);
    await expect(fetchJob('not-a-job')).resolves.toBeNull();
  });

  it('throws for a read that failed, so a dropped connection is never "not found"', async () => {
    // "Opportunity Not Found … expired, archived, or removed" was shown for exactly this.
    api.onGet(`/jobs/${JOB}`).networkError();
    await expect(fetchJob(JOB)).rejects.toBeDefined();

    api.resetHandlers();
    api.onGet(`/jobs/${JOB}`).reply(500, problem(500, 'platform.unexpected'));
    await expect(fetchJob(JOB)).rejects.toBeDefined();

    api.resetHandlers();
    api.onGet(`/jobs/${JOB}`).timeout();
    await expect(fetchJob(JOB)).rejects.toBeDefined();
  });

  it('asks for similar jobs by the parameters the browse route binds, and leaves this one out', async () => {
    api.onGet('/jobs').reply((config) => {
      expect(config.params).toMatchObject({ category: 'hospitality', country: 'MU' });
      expect(config.params).not.toHaveProperty('latitude');
      return [
        200,
        envelope({
          items: [{ jobId: JOB }, { jobId: 'other-1' }, { jobId: 'other-2' }],
          nextCursor: null,
          hasMore: false,
          totalCount: 3,
        }),
      ];
    });

    const similar = await fetchSimilarJobs(walkthroughJob());
    expect(similar.map((row) => row.jobId)).toEqual(['other-1', 'other-2']);
  });
});

describe('managing a job', () => {
  it('closes with the outcome the owner chose', async () => {
    api.onPost(`/jobs/${JOB}/close`).reply(200, envelope(walkthroughJob({ status: 'Expired', canApply: false, canManage: true })));

    const closed = await closeJob(JOB, { outcome: 'withdrawn' });

    expect(JSON.parse(api.history.post[0].data)).toEqual({ outcome: 'withdrawn' });
    expect(closed.status).toBe('Expired');
  });

  it('removes a job through the archive route, which answers no record', async () => {
    api.onPost(`/jobs/${JOB}/archive`).reply(200, envelope(null));

    await expect(archiveJob(JOB)).resolves.toBeUndefined();
    expect(api.history.post[0].url).toBe(`/jobs/${JOB}/archive`);
  });

  it('says what a refused change means', () => {
    const refused = (code: string, status = 409) => ({ response: { status, data: problem(status, code) } });

    expect(jobManagementErrorMessage(refused('jobs.posting.filled'))).toBe('This job is already marked as filled.');
    expect(jobManagementErrorMessage(refused('jobs.not-employer', 403))).toBe('Your account does not manage this job.');
    expect(jobManagementErrorMessage(new Error('Network Error'))).toBe('We could not reach the jobs service just now.');
  });
});

describe('what the page prints', () => {
  it('prints the walkthrough job as the member should have read it', () => {
    const job = walkthroughJob();

    expect(describeSalary(job.salary)).toBe('MUR 15,000 a month');
    expect(jobPlaceLabel(job.location)).toBe('Rose Hill, Mauritius');
    expect(employerKindLabel(job.employer)).toBe('Individual employer · Mauritius');
    expect(jobConversationSubtitle(job)).toBe('Walkthrough Test Employer · Rose Hill, Mauritius');
  });

  it('never prints the fixture-era fallbacks', () => {
    const job = walkthroughJob({
      location: { countryCode: 'MU', regionName: null, cityName: null, areaId: null, displayName: 'MU' },
      salary: { isDisclosed: false, minimum: null, maximum: null, currencyCode: null, period: null, isNegotiable: false, isUnpaid: false },
    });

    const printed = [describeSalary(job.salary), jobPlaceLabel(job.location), jobConversationSubtitle(job)].join(' | ');

    expect(printed).toBe('Pay not stated | Mauritius | Walkthrough Test Employer · Mauritius');
    expect(printed).not.toMatch(/Unknown|undefined|null|\/mo|Community Member/);
  });

  it('groups digits by hand, the same on every phone', () => {
    expect(groupDigits(15000)).toBe('15,000');
    expect(groupDigits(999)).toBe('999');
    expect(groupDigits(1234567)).toBe('1,234,567');
    expect(groupDigits(11.5)).toBe('11.50');
    expect(groupDigits(1250)).toBe('1,250');
  });

  it('prints a band, a negotiable figure and unpaid work', () => {
    expect(formatPay({ minimum: 26000, maximum: 31000, currency: 'GBP', period: 'Yearly' })).toBe('GBP 26,000–31,000 a year');
    expect(formatPay({ minimum: 18000, maximum: 18000, currency: 'MUR', period: 'Monthly' })).toBe('MUR 18,000 a month');
    expect(formatPay({ minimum: 12, currency: 'GBP', period: 'Hourly', negotiable: true })).toBe('GBP 12 an hour, negotiable');
    expect(
      describeSalary({ isDisclosed: true, minimum: 0, maximum: null, currencyCode: null, period: null, isNegotiable: false, isUnpaid: true })
    ).toBe('Unpaid');
  });

  it('names a category from the catalogue, or makes the key readable', () => {
    expect(categoryLabel('hospitality', [{ key: 'hospitality', name: 'Hospitality & Tourism' }])).toBe('Hospitality & Tourism');
    expect(categoryLabel('home-services')).toBe('Home services');
    expect(categoryLabel(null)).toBe('');
  });

  it('counts openings and applicants in words', () => {
    expect(openingsLabel({ vacancyCount: 1, remainingVacancies: 1 })).toBe('1 opening');
    expect(openingsLabel({ vacancyCount: 3, remainingVacancies: 1 })).toBe('1 of 3 openings left');
    expect(applicantCountLabel(0)).toBe('No applications yet');
    expect(applicantCountLabel(1)).toBe('1 person has applied');
    expect(applicantCountLabel(1200)).toBe('1,200 people have applied');
  });

  it('writes a date on the phone’s calendar day, and nothing for no date', () => {
    expect(formatJobDate('2026-09-14T12:00:00.000Z')).toBe('14 Sep 2026');
    expect(formatJobDate(null)).toBe('');
    expect(formatJobDate('not a date')).toBe('');
  });

  it('says a sponsorship is not offered rather than leaving it out', () => {
    const facts = workArrangementFacts(walkthroughJob());

    expect(facts).toContainEqual({ label: 'Visa sponsorship', value: 'Not offered' });
    expect(facts).toContainEqual({ label: 'Where', value: 'On site' });
    expect(facts).toContainEqual({ label: 'Experience', value: 'Entry level' });
    expect(facts.find((fact) => fact.label === 'Education')).toBeUndefined();

    const hybrid = workArrangementFacts(
      walkthroughJob({
        workArrangement: { workplaceType: 'Hybrid', isRemote: false, offersVisaSponsorship: true, offersRelocationAssistance: true, onSiteDaysPerWeek: 2, remotePolicy: null },
        requiresResume: true,
      })
    );
    expect(hybrid).toContainEqual({ label: 'Where', value: 'Hybrid, 2 days a week on site' });
    expect(hybrid).toContainEqual({ label: 'CV', value: 'Required to apply' });
  });

  // The simple form asks none of these, and files the job as entry level itself.
  it('says nothing on a simple job that its poster was never asked', () => {
    const labels = workArrangementFacts(walkthroughJob({ postingMode: 'Simple' })).map((fact) => fact.label);
    expect(labels).toEqual(['Where']);

    const sponsored = workArrangementFacts(
      walkthroughJob({
        postingMode: 'Simple',
        workArrangement: { workplaceType: 'OnSite', isRemote: false, offersVisaSponsorship: true, offersRelocationAssistance: false, onSiteDaysPerWeek: null, remotePolicy: null },
      })
    );
    expect(sponsored).toContainEqual({ label: 'Visa sponsorship', value: 'Offered' });
    expect(sponsored.find((fact) => fact.label === 'Relocation help')).toBeUndefined();
  });

  it('prints an employer’s record only when there is one — null is not zero', () => {
    expect(employerResponsiveness(walkthroughJob().employer)).toEqual([]);
    expect(employerResponsiveness({ averageResponseHours: 41.5, ghostingRate: 0.18 })).toEqual([
      'Usually replies within 2 days.',
      'Leaves 18% of applications unanswered.',
    ]);
    expect(employerResponsiveness({ averageResponseHours: 0.2, ghostingRate: null })).toEqual([
      'Usually replies within an hour.',
    ]);
  });
});

describe('where a job stands', () => {
  const NOW = new Date('2026-09-15T08:00:00.000Z');

  it('is taking applications when the server says an application would be accepted', () => {
    expect(jobStanding(walkthroughJob(), NOW)).toEqual({ label: 'Taking applications', tone: 'open', explanation: null });
  });

  it('explains an open status that cannot take applications, instead of contradicting it', () => {
    expect(jobStanding(walkthroughJob({ canApply: false, closingAt: '2026-09-10T00:00:00.000Z' }), NOW).explanation).toBe(
      'The closing date for this job has passed.'
    );
    expect(jobStanding(walkthroughJob({ canApply: false, remainingVacancies: 0 }), NOW).explanation).toBe(
      'Every opening for this job has been filled.'
    );
  });

  it('carries the employer’s own reason when they gave one', () => {
    expect(jobStanding(walkthroughJob({ status: 'Filled', canApply: false, closureReason: 'We hired locally.' }), NOW)).toEqual({
      label: 'Position filled',
      tone: 'closed',
      explanation: 'We hired locally.',
    });
    expect(jobStanding(walkthroughJob({ status: 'Expired', canApply: false }), NOW).label).toBe('Closed');
  });

  it('tells a team member a removed job is theirs alone to see', () => {
    expect(jobStanding(walkthroughJob({ status: 'Archived', canApply: false, canManage: true }), NOW).explanation).toMatch(
      /Only your team can open this page/
    );
  });
});

describe('what the reader may do', () => {
  it('lets the employer’s team manage, never apply', () => {
    expect(applyStateOf(walkthroughJob({ canManage: true, isOnEmployerTeam: true }))).toEqual({ kind: 'manage' });
    // A server from before 6 Nov 2026 sends only `canManage`: the old reading.
    expect(applyStateOf(walkthroughJob({ canManage: true }))).toEqual({ kind: 'manage' });
  });

  // An Admin's card offered "I'm interested" and the page hid it (6 Nov 2026).
  it('lets staff on somebody else’s job apply like anyone, though they may manage it', () => {
    const asStaff = walkthroughJob({ canManage: true, isOnEmployerTeam: false });

    expect(isOnEmployerTeam(asStaff)).toBe(false);
    expect(applyStateOf(asStaff)).toEqual({ kind: 'open' });
    expect(ownerActionsFor(asStaff).canArchive).toBe(true);
    expect(jobStanding({ ...asStaff, status: 'Archived', canApply: false }).explanation).toBe(
      'This job has been removed from Diaspora.'
    );
  });

  it('shows an application already made — including one since withdrawn', () => {
    expect(applyStateOf(walkthroughJob({ hasApplied: true }))).toEqual({ kind: 'applied' });
  });

  it('offers Apply only when the server would accept it, and says why not otherwise', () => {
    expect(applyStateOf(walkthroughJob())).toEqual({ kind: 'open' });
    expect(applyStateOf(walkthroughJob({ status: 'Expired', canApply: false }))).toEqual({
      kind: 'closed',
      reason: 'This job is no longer taking applications.',
    });
  });
});

describe('what the owner may do', () => {
  const actionsAt = (status: JobStatus) => ownerActionsFor({ status, canManage: true });

  it('follows the server’s transition table', () => {
    expect(actionsAt('Draft')).toEqual({ canPublish: true, closeOutcomes: [], canArchive: true });
    expect(actionsAt('Published')).toEqual({ canPublish: false, closeOutcomes: ['withdrawn'], canArchive: true });
    expect(actionsAt('ReceivingApplications')).toEqual({ canPublish: false, closeOutcomes: ['filled', 'withdrawn'], canArchive: true });
    expect(actionsAt('OfferMade').closeOutcomes).toEqual(['filled', 'withdrawn']);
    expect(actionsAt('Filled')).toEqual({ canPublish: false, closeOutcomes: [], canArchive: true });
    expect(actionsAt('Expired')).toEqual({ canPublish: false, closeOutcomes: [], canArchive: true });
    expect(actionsAt('Archived')).toEqual({ canPublish: false, closeOutcomes: [], canArchive: false });
  });

  it('offers nothing to anyone outside the team', () => {
    expect(ownerActionsFor({ status: 'Open', canManage: false })).toEqual({ canPublish: false, closeOutcomes: [], canArchive: false });
  });
});
