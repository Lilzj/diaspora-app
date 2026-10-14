// ─────────────────────────────────────────────────────────────────────────────
// Editing a job — 14 Oct 2026.
//
// `PUT /jobs/{jobId}` replaces the whole posting. A field the editor does not
// show and the body leaves out is blanked on the server, not kept: the town,
// the education asked for, the CV requirement, the visibility. These pin that
// the body is the loaded job with only the editor's fields laid over it, and
// that the pay keeps the job's own currency.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  jobEditFormFrom,
  jobEditMissing,
  jobEditProblem,
  toUpdateJobRequest,
  updateJob,
  type UpdateJobRequest,
} from '../job-detail-api';
import type { JobResponse } from '@/types/jobs-hiring';

const JOB_ID = '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f';

// Every value deliberately unlike a default, so a dropped field shows.
const loadedJob = {
  jobId: JOB_ID,
  slug: 'care-assistant-curepipe',
  title: 'Care assistant',
  summary: 'Night shifts at a family-run care home.',
  description: 'Night shifts at a family-run care home. Training given.',
  categoryKey: 'care',
  jobType: 'PartTime',
  experienceLevel: 'Junior',
  educationLevel: 'Vocational',
  location: {
    countryCode: 'MU',
    regionName: 'Plaines Wilhems',
    cityName: 'Curepipe',
    areaId: '11111111-2222-4333-8444-555555555555',
    displayName: 'Curepipe',
  },
  workArrangement: {
    workplaceType: 'Hybrid',
    isRemote: false,
    offersVisaSponsorship: true,
    offersRelocationAssistance: true,
    onSiteDaysPerWeek: 3,
    remotePolicy: 'Within Mauritius',
  },
  salary: {
    isDisclosed: true,
    minimum: 18000,
    maximum: 22000,
    currencyCode: 'MUR',
    period: 'Monthly',
    isNegotiable: true,
    isUnpaid: false,
  },
  status: 'ReceivingApplications',
  visibility: 'Unlisted',
  vacancyCount: 4,
  remainingVacancies: 2,
  requiresResume: true,
  revision: 7,
  canManage: true,
  canApply: false,
} as unknown as JobResponse;

const envelope = <T,>(data: T) => ({ data, meta: {} });

describe('editing a job', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('sends every field the form did not change exactly as loaded', async () => {
    let sent: UpdateJobRequest | null = null;
    mock.onPut(`/jobs/${JOB_ID}`).reply((config) => {
      sent = JSON.parse(config.data as string);
      return [200, envelope({ ...loadedJob, title: 'Senior care assistant', revision: 8 })];
    });

    const form = { ...jobEditFormFrom(loadedJob), title: 'Senior care assistant' };
    // A member in another country: the job's MUR must win over their currency.
    const saved = await updateJob(JOB_ID, toUpdateJobRequest(loadedJob, form, 'GBP'));

    expect(saved.title).toBe('Senior care assistant');
    expect(sent).toEqual<UpdateJobRequest>({
      title: 'Senior care assistant',
      description: 'Night shifts at a family-run care home. Training given.',
      summary: 'Night shifts at a family-run care home.',
      jobType: 'PartTime',
      experienceLevel: 'Junior',
      educationLevel: 'Vocational',
      countryCode: 'MU',
      regionName: 'Plaines Wilhems',
      cityName: 'Curepipe',
      areaId: '11111111-2222-4333-8444-555555555555',
      workplaceType: 'Hybrid',
      offersVisaSponsorship: true,
      offersRelocationAssistance: true,
      onSiteDaysPerWeek: 3,
      remotePolicy: 'Within Mauritius',
      salaryMinimum: 18000,
      salaryMaximum: 22000,
      salaryCurrency: 'MUR',
      salaryPeriod: 'Monthly',
      salaryNegotiable: true,
      visibility: 'Unlisted',
      vacancyCount: 4,
      requiresResume: true,
      baseRevision: 7,
    });
  });

  it('withdraws pay entirely when both figures are cleared', () => {
    const form = { ...jobEditFormFrom(loadedJob), salaryMinimum: '', salaryMaximum: '' };
    const body = toUpdateJobRequest(loadedJob, form, 'GBP');
    expect(body).toMatchObject({ salaryMinimum: null, salaryMaximum: null, salaryCurrency: null, salaryPeriod: null });
  });

  it("states new pay in the member's currency only when the job stated none", () => {
    const unpaid = {
      ...loadedJob,
      salary: { isDisclosed: false, currencyCode: null, period: null, isNegotiable: false, isUnpaid: false },
    } as unknown as JobResponse;
    const form = { ...jobEditFormFrom(unpaid), salaryMinimum: '15000' };
    expect(form.salaryPeriod).toBe('Monthly');
    expect(toUpdateJobRequest(unpaid, form, 'GBP')).toMatchObject({
      salaryMinimum: 15000,
      salaryMaximum: null,
      salaryCurrency: 'GBP',
      salaryPeriod: 'Monthly',
    });
  });

  it('names the missing required field and refuses a count below the seats filled', () => {
    const form = jobEditFormFrom(loadedJob);
    expect(jobEditMissing({ ...form, title: '  ' })).toEqual(['Job title']);
    expect(jobEditMissing({ ...form, description: '' })).toEqual(['Description']);
    expect(jobEditProblem(form, loadedJob)).toBeNull();
    // 4 advertised, 2 remaining: 2 filled.
    expect(jobEditProblem({ ...form, vacancyCount: '1' }, loadedJob)).toMatch(/already filled 2/);
    expect(jobEditProblem({ ...form, salaryMinimum: '30000' }, loadedJob)).toMatch(/lower pay figure/);
  });
});
