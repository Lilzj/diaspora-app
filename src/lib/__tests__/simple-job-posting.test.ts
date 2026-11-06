/**
 * Simple jobs (owner's request, 4 Nov 2026): "Two cleaners needed in Port
 * Louis, 200 rupees a day, one day." One screen, no employer to register
 * first, and a schedule the server keeps.
 */
import {
  emptySimpleJobForm,
  postSimpleJob,
  simpleJobClosingAt,
  simpleJobDescription,
  simpleJobFormProblem,
  simpleJobRequirements,
  simpleToFullForm,
  toSimplePostInput,
  type SimpleJobForm,
} from '@/lib/simple-job-posting';
import { describeSchedule, placesLeftLabel } from '@/lib/job-detail-api';

const mockResolveEmployer = jest.fn();
const mockPostJob = jest.fn();
const mockRegisterEmployer = jest.fn();

jest.mock('@/lib/job-postings-api', () => ({
  ...jest.requireActual('@/lib/job-postings-api'),
  resolvePostingEmployer: () => mockResolveEmployer(),
  postJob: (...args: unknown[]) => mockPostJob(...args),
}));
jest.mock('@/lib/jobs-hiring-api', () => ({
  ...jest.requireActual('@/lib/jobs-hiring-api'),
  registerEmployer: (...args: unknown[]) => mockRegisterEmployer(...args),
}));

declare const process: { cwd(): string };
const fs: { readFileSync(path: string, encoding: string): string } = require('fs');
const path: { join(...parts: string[]): string } = require('path');

const TODAY = '2026-11-05';

function cleaners(overrides: Partial<SimpleJobForm> = {}): SimpleJobForm {
  return {
    ...emptySimpleJobForm('MU', 'MUR', TODAY),
    title: 'Two cleaners needed',
    categoryKey: 'hospitality',
    people: '2',
    cityName: 'Port Louis',
    payAmount: '200',
    payPer: 'Daily',
    startsOn: '2026-11-12',
    lengthAmount: '1',
    lengthUnit: 'Days',
    ...overrides,
  };
}

describe('the simple form', () => {
  it('asks only what someone needs to decide', () => {
    const empty = emptySimpleJobForm('MU', 'MUR', TODAY);
    expect(simpleJobRequirements(empty).filter((r) => !r.ok).map((r) => r.label)).toEqual([
      'What the job is',
      'Kind of work',
      'Where',
      'Pay',
    ]);
    expect(simpleJobRequirements(cleaners()).every((r) => r.ok)).toBe(true);
  });

  it('refuses a past start, a length that is not real, and a pay that is not a number', () => {
    expect(simpleJobFormProblem(cleaners(), TODAY)).toBeNull();
    expect(simpleJobFormProblem(cleaners({ startsOn: '2026-11-01' }), TODAY)).toMatch(/start date/);
    expect(simpleJobFormProblem(cleaners({ lengthAmount: '25', lengthUnit: 'Hours' }), TODAY)).toMatch(/24 hours/);
    expect(simpleJobFormProblem(cleaners({ lengthAmount: '0' }), TODAY)).toMatch(/365 days/);
    expect(simpleJobFormProblem(cleaners({ payAmount: 'two hundred' }), TODAY)).toMatch(/pay/);
    expect(simpleJobFormProblem(cleaners({ people: '0' }), TODAY)).toMatch(/how many people/);
  });

  it('sends a Temporary, on-site Simple job with its places, pay and schedule', () => {
    expect(toSimplePostInput(cleaners())).toMatchObject({
      title: 'Two cleaners needed',
      categoryKey: 'hospitality',
      jobType: 'Temporary',
      experienceLevel: 'Entry',
      countryCode: 'MU',
      cityName: 'Port Louis',
      workplaceType: 'OnSite',
      pay: { minimum: 200, currency: 'MUR', period: 'Daily' },
      vacancyCount: 2,
      postingMode: 'Simple',
      startsOn: '2026-11-12',
      lengthAmount: 1,
      lengthUnit: 'Days',
    });
  });

  it('writes the job in a sentence when the poster wrote no details', () => {
    // "12 Nov", as the page says it. It read "starting 2026-11-12" until 6 Nov 2026.
    expect(simpleJobDescription(cleaners())).toMatch(/^2 people needed in Port Louis\. .+\. 1 day, starting 12 Nov\.$/);
    expect(simpleJobDescription(cleaners({ details: 'Bring gloves.' }))).toBe('Bring gloves.');
  });

  // Left to the server it was midnight UTC: "Closes 7 Nov" on a 6 Nov job in
  // Mauritius, and 19:00 on the day in Toronto.
  it('stops taking interest at midnight on the poster’s own clock, at the end of the last day', () => {
    const localMidnight = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();

    expect(toSimplePostInput(cleaners()).closingAt).toBe(localMidnight(2026, 11, 13));
    expect(simpleJobClosingAt({ startsOn: '2026-11-12', lengthAmount: '3', lengthUnit: 'Days' })).toBe(
      localMidnight(2026, 11, 15)
    );
    // Counted in hours: the work ends with its start day, as on the server.
    expect(simpleJobClosingAt({ startsOn: '2026-12-31', lengthAmount: '4', lengthUnit: 'Hours' })).toBe(
      localMidnight(2027, 1, 1)
    );
    expect(simpleJobClosingAt({ startsOn: '', lengthAmount: '1', lengthUnit: 'Days' })).toBeNull();
  });

  it('carries what was typed into the full form', () => {
    expect(simpleToFullForm(cleaners({ details: 'Bring gloves.' }))).toMatchObject({
      title: 'Two cleaners needed',
      categoryKey: 'hospitality',
      jobType: 'Temporary',
      description: 'Bring gloves.',
      payMinimum: '200',
      payPeriod: 'Daily',
      vacancies: '2',
      cityName: 'Port Louis',
    });
  });
});

describe('posting a simple job', () => {
  beforeEach(() => {
    mockResolveEmployer.mockReset();
    mockPostJob.mockReset().mockResolvedValue({ kind: 'published', job: { jobId: 'j1', title: 'Two cleaners needed' } });
    mockRegisterEmployer.mockReset();
  });

  it('needs no employer first: one is made in the poster’s own name', async () => {
    mockResolveEmployer.mockResolvedValue({ kind: 'none' });
    mockRegisterEmployer.mockResolvedValue({ employerId: 'e-new' });

    await postSimpleJob(cleaners(), { displayName: 'Ama Mensah' });

    expect(mockRegisterEmployer).toHaveBeenCalledWith({
      displayName: 'Ama Mensah',
      organizationType: 'Individual',
      countryCode: 'MU',
    });
    expect(mockPostJob).toHaveBeenCalledWith('e-new', expect.objectContaining({ postingMode: 'Simple' }));
  });

  it('posts under the employer a member already has', async () => {
    mockResolveEmployer.mockResolvedValue({ kind: 'one', employerId: 'e1', employerName: 'Ama Mensah' });

    await postSimpleJob(cleaners(), { displayName: 'Ama Mensah' });

    expect(mockRegisterEmployer).not.toHaveBeenCalled();
    expect(mockPostJob).toHaveBeenCalledWith('e1', expect.anything());
  });
});

describe('what a simple job says', () => {
  it('says when the work is, from the date’s own digits', () => {
    expect(describeSchedule({ startsOn: '2026-11-12', lengthAmount: 1, lengthUnit: 'Days' })).toBe('12 Nov · 1 day');
    expect(describeSchedule({ startsOn: '2026-12-05', lengthAmount: 4, lengthUnit: 'Hours' })).toBe('5 Dec · 4 hours');
    expect(describeSchedule({ startsOn: null, lengthAmount: null, lengthUnit: null })).toBeNull();
  });

  it('says how many places are left', () => {
    expect(placesLeftLabel({ vacancyCount: 2, remainingVacancies: 1 })).toBe('1 of 2 places left');
    expect(placesLeftLabel({ vacancyCount: 2, remainingVacancies: 0 })).toBe('All places filled');
    expect(placesLeftLabel({ vacancyCount: 1, remainingVacancies: 1 })).toBe('1 place');
    expect(placesLeftLabel({})).toBeNull();
  });
});

describe('the post screen', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'job', 'create.tsx'), 'utf8');

  it('opens on the simple form, with the full one under More options', () => {
    expect(screen).toMatch(/useState<'simple' \| 'full'>\('simple'\)/);
    expect(screen).toContain('<SimpleJobForm');
    expect(screen).toContain('onMoreOptions={openFullForm}');
    expect(screen).toContain('postSimpleJob(');
  });
});
