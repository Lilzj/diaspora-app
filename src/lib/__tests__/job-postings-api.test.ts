// ─────────────────────────────────────────────────────────────────────────────
// Posting a job — 14 Sep 2026
//
// Found by trying to set up a test job for a walkthrough. `app/job/create.tsx`
// posted a legacy shape to `POST /jobs` — no employer, category key, job type,
// experience level or country — under a hard-coded "Amara Kone", and never
// published. Every posting was refused. These tests pin the sequence the server
// actually runs (employer → draft → terms → publish) and the half-way outcome a
// member must be told about.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import {
  createJobPosting,
  currencyForCountry,
  fetchJobCategories,
  jobPostingFormProblem,
  postJob,
  resolvePostingEmployer,
  toPostJobInput,
  type JobPostingForm,
  type PostJobInput,
} from '@/lib/job-postings-api';

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

const EMPLOYER = '01a05770-33f2-7600-8000-000000000001';
const JOB = '01a05771-aaaa-7000-8000-000000000001';

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient);
});

afterEach(() => {
  api.restore();
});

const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'r1' } });

function problem(status: number, code: string) {
  return { type: 'about:blank', title: 'Refused', status, code, detail: `Refused: ${code}` };
}

function draft(overrides: Record<string, unknown> = {}) {
  return { jobId: JOB, slug: 'walkthrough-test-job', title: 'Walkthrough test job', status: 'Draft', revision: 1, canApply: false, ...overrides };
}

function input(overrides: Partial<PostJobInput> = {}): PostJobInput {
  return {
    title: 'Walkthrough test job',
    description: 'A test posting for the two-account walkthrough. Please ignore.',
    categoryKey: 'hospitality',
    jobType: 'PartTime',
    experienceLevel: 'Entry',
    countryCode: 'mu',
    cityName: 'Rose Hill',
    workplaceType: 'OnSite',
    offersVisaSponsorship: false,
    pay: null,
    vacancyCount: 1,
    ...overrides,
  };
}

function form(overrides: Partial<JobPostingForm> = {}): JobPostingForm {
  return {
    categoryKey: 'hospitality',
    jobType: 'PartTime',
    experienceLevel: 'Entry',
    title: 'Walkthrough  test job',
    description: 'A test posting.',
    payMinimum: '',
    payMaximum: '',
    payCurrency: 'MUR',
    payPeriod: 'Monthly',
    vacancies: '1',
    countryCode: 'mu',
    cityName: ' Rose Hill ',
    workplaceType: 'OnSite',
    offersVisaSponsorship: false,
    ...overrides,
  };
}

describe('createJobPosting', () => {
  it('sends every field CreateJobRequest marks required, under the member’s employer', async () => {
    api.onPost('/jobs/').reply(201, envelope(draft()));

    await createJobPosting({ ...input(), employerId: EMPLOYER });

    const body = JSON.parse(api.history.post[0].data);
    expect(body).toMatchObject({
      employerId: EMPLOYER,
      title: 'Walkthrough test job',
      categoryKey: 'hospitality',
      jobType: 'PartTime',
      experienceLevel: 'Entry',
      countryCode: 'MU',
      cityName: 'Rose Hill',
      workplaceType: 'OnSite',
    });
    // The fixture identity every posting used to carry.
    expect(api.history.post[0].data).not.toMatch(/user-123|Amara Kone/);
  });
});

describe('postJob', () => {
  it('creates a draft, sets the pay against its revision, then publishes', async () => {
    api.onPost('/jobs/').reply(201, envelope(draft()));
    api.onPut(`/jobs/${JOB}`).reply(200, envelope(draft({ revision: 2 })));
    api.onPost(`/jobs/${JOB}/publish`).reply(200, envelope(draft({ revision: 3, status: 'Open', canApply: true })));

    const outcome = await postJob(
      EMPLOYER,
      input({ pay: { minimum: 18000, maximum: 22000, currency: 'MUR', period: 'Monthly' }, vacancyCount: 2 })
    );

    expect(outcome.kind).toBe('published');
    expect(outcome.job.status).toBe('Open');

    const terms = JSON.parse(api.history.put[0].data);
    expect(terms).toMatchObject({
      title: 'Walkthrough test job',
      jobType: 'PartTime',
      experienceLevel: 'Entry',
      countryCode: 'MU',
      salaryMinimum: 18000,
      salaryMaximum: 22000,
      salaryCurrency: 'MUR',
      salaryPeriod: 'Monthly',
      vacancyCount: 2,
      baseRevision: 1,
    });
    expect(JSON.parse(api.history.post[1].data)).toEqual({ openImmediately: true });
  });

  it('skips the edit when there is nothing the create request could not carry', async () => {
    api.onPost('/jobs/').reply(201, envelope(draft()));
    api.onPost(`/jobs/${JOB}/publish`).reply(200, envelope(draft({ status: 'Open' })));

    const outcome = await postJob(EMPLOYER, input());

    expect(outcome.kind).toBe('published');
    expect(api.history.put).toHaveLength(0);
  });

  it('reports a draft — not a failure — when publishing is refused after the draft exists', async () => {
    api.onPost('/jobs/').reply(201, envelope(draft()));
    api.onPost(`/jobs/${JOB}/publish`).reply(409, problem(409, 'jobs.posting.already-published'));

    const outcome = await postJob(EMPLOYER, input());

    // A member told "failed" here posts the job a second time.
    expect(outcome.kind).toBe('draft');
    expect(outcome.job.jobId).toBe(JOB);
  });

  it('throws when the draft itself is refused, because nothing was created', async () => {
    api.onPost('/jobs/').reply(404, problem(404, 'jobs.category.not-found'));

    await expect(postJob(EMPLOYER, input())).rejects.toBeDefined();
    expect(api.history.post).toHaveLength(1);
  });
});

describe('resolvePostingEmployer', () => {
  it('answers the member’s sole employer', async () => {
    api
      .onGet('/jobs/employers/dashboard')
      .reply(200, envelope({ employerId: EMPLOYER, employerName: 'Mensah Home Services' }));

    await expect(resolvePostingEmployer()).resolves.toEqual({
      kind: 'one',
      employerId: EMPLOYER,
      employerName: 'Mensah Home Services',
    });
  });

  it('answers none for jobs.employer.not-found, whose way out is registering', async () => {
    api.onGet('/jobs/employers/dashboard').reply(404, problem(404, 'jobs.employer.not-found'));

    await expect(resolvePostingEmployer()).resolves.toEqual({ kind: 'none' });
  });

  it('lets any other failure fail, rather than sending a member to register an employer they have', async () => {
    api.onGet('/jobs/employers/dashboard').networkError();

    await expect(resolvePostingEmployer()).rejects.toBeDefined();
  });
});

describe('fetchJobCategories', () => {
  it('offers the active top-level categories, in the catalogue’s order', async () => {
    api.onGet('/jobs/categories').reply(
      200,
      envelope([
        { categoryId: '2', key: 'hospitality', name: 'Hospitality', order: 1, isActive: true, parentKey: null },
        { categoryId: '1', key: 'healthcare', name: 'Healthcare', order: 0, isActive: true, parentKey: null },
        { categoryId: '3', key: 'old', name: 'Old', order: 2, isActive: false, parentKey: null },
        { categoryId: '4', key: 'nursing', name: 'Nursing', order: 3, isActive: true, parentKey: 'healthcare' },
      ])
    );

    const categories = await fetchJobCategories();
    expect(categories.map((category) => category.key)).toEqual(['healthcare', 'hospitality']);
  });
});

describe('the form', () => {
  it('asks for a category before anything else', () => {
    expect(jobPostingFormProblem(form({ categoryKey: null }), 0)).toMatch(/category/i);
    expect(jobPostingFormProblem(form(), 0)).toBeNull();
  });

  it('refuses a title under the server’s three characters, and an empty description', () => {
    expect(jobPostingFormProblem(form({ title: 'ab' }), 1)).toMatch(/title/i);
    expect(jobPostingFormProblem(form({ description: '   ' }), 1)).toMatch(/Describe/);
  });

  it('treats pay as optional, but only sensible pay as pay', () => {
    expect(jobPostingFormProblem(form(), 1)).toBeNull();
    expect(jobPostingFormProblem(form({ payMinimum: 'lots' }), 1)).toMatch(/number/);
    expect(jobPostingFormProblem(form({ payMaximum: '5000' }), 1)).toMatch(/lowest/);
    expect(jobPostingFormProblem(form({ payMinimum: '5000', payMaximum: '4000' }), 1)).toMatch(/cannot be less/);
  });

  it('needs a two-letter country', () => {
    expect(jobPostingFormProblem(form({ countryCode: 'Mauritius' }), 2)).toMatch(/two-letter/);
    expect(jobPostingFormProblem(form(), 'all')).toBeNull();
  });

  it('becomes the input the calls send, with blank pay as no pay', () => {
    expect(toPostJobInput(form())).toMatchObject({
      title: 'Walkthrough test job',
      countryCode: 'MU',
      cityName: 'Rose Hill',
      pay: null,
      vacancyCount: 1,
    });

    expect(toPostJobInput(form({ payMinimum: '18,000', vacancies: '2' })).pay).toEqual({
      minimum: 18000,
      maximum: null,
      currency: 'MUR',
      period: 'Monthly',
    });
  });

  it('defaults the currency from the country the member posts in', () => {
    expect(currencyForCountry('mu')).toBe('MUR');
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry(undefined)).toBe('USD');
  });
});

describe('the Post a job screen', () => {
  const source = fs
    .readFileSync(path.join(process.cwd(), 'src', 'app', 'job', 'create.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('posts through the real sequence, not the legacy payload', () => {
    expect(source).toContain('postJob(');
    expect(source).not.toContain("apiClient.post('/jobs'");
    expect(source).not.toMatch(/user-123|Amara Kone/);
  });

  it('offers the server’s categories, not the fixture list', () => {
    expect(source).toContain('fetchJobCategories');
    expect(source).not.toContain('mockJobCategories');
  });

  it('lets the Jobs service decide whether the member may post, not a device rule for a hard-coded country', () => {
    // Decided 14 Sep 2026: a verified account is enough, which the Jobs service
    // grants as the `jobs.post` feature on the member's access decision.
    expect(source).toContain("grantedFeatures.includes('jobs.post')");
    expect(source).not.toContain("evaluateAction('CreateJob'");
    expect(source).not.toContain('useCapabilityGate');
  });

  it('collects nothing the platform cannot keep', () => {
    expect(source).not.toMatch(/Simulated GPS|contactPhone|responsibilitiesText|accommodationIncluded/);
  });
});
