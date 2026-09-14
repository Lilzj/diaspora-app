// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — posting a job
//
// **Found by trying to set up a test job, 14 Sep 2026.** `app/job/create.tsx`
// posted a six-step form to `POST /jobs` in a shape the server has never
// accepted: no `employerId`, no `categoryKey`, no `jobType`, no
// `experienceLevel`, no `countryCode` — and a hard-coded employer, "Amara Kone",
// `providerId: 'user-123'`, on every posting. Every submission was refused, and
// nothing ever published one either. No member could post a job from the app.
//
// ── The real sequence ────────────────────────────────────────────────────────
//
//   1. **An employer to post under.** A job belongs to an employer profile, not
//      to a person. `GET /jobs/employers/dashboard` resolves the member's sole
//      employer; `jobs.employer.not-found` means none (or several, which the
//      platform cannot list). Registering is `POST /jobs/employers`.
//   2. **`POST /jobs/`** opens the posting as a **draft**. The request is
//      deliberately thin: title, description, category, type, experience level
//      and country.
//   3. **`PUT /jobs/{jobId}`** is the whole-document edit, and the only place
//      pay and the number of vacancies can be set. Sent only when the member
//      stated pay or is hiring more than one person, against the draft's
//      revision.
//   4. **`POST /jobs/{jobId}/publish`** makes it visible and open to
//      applications.
//
// Responsibilities, requirements and benefits have a request type on the server
// (`SetJobDetailsRequest`) and **no route** — so the form does not collect them.
// A field the platform cannot keep is a field a member fills in and loses.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import type {
  ExperienceLevel,
  JobType,
  SalaryPeriod,
  WorkplaceType,
} from '@/types/jobs-hiring';

interface Envelope<T> {
  data: T;
}

/** One entry of `GET /jobs/categories`, the employment-domain catalogue. */
export interface JobCategoryResponse {
  categoryId: string;
  key: string;
  name: string;
  description?: string | null;
  parentKey?: string | null;
  iconKey?: string | null;
  order: number;
  isActive: boolean;
}

/** `Contracts/V1/Requests/CreateJobRequest.cs`. */
export interface CreateJobPostingRequest {
  employerId: string;
  title: string;
  description: string;
  summary?: string | null;
  categoryKey: string;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  /** Upper-case ISO 3166-1 alpha-2. Required even for a remote role. */
  countryCode: string;
  regionName?: string | null;
  cityName?: string | null;
  workplaceType?: WorkplaceType | null;
  offersVisaSponsorship?: boolean;
  offersRelocationAssistance?: boolean;
}

/** The pay a member states on the form. Sent through the whole-document edit. */
export interface JobPay {
  minimum: number;
  maximum?: number | null;
  currency: string;
  period: SalaryPeriod;
  negotiable?: boolean;
}

/** The fields of `JobResponse` this flow reads back. */
export interface JobPostingResponse {
  jobId: string;
  slug: string;
  title: string;
  status: string;
  revision: number;
  canApply?: boolean | null;
}

/** Everything the form collects, before it is split across the three calls. */
export interface PostJobInput extends Omit<CreateJobPostingRequest, 'employerId'> {
  pay?: JobPay | null;
  vacancyCount?: number | null;
}

/**
 * What happened, including the half-way case.
 *
 * `draft` is not a success dressed up: the posting exists, it is not visible,
 * and the member needs to know both — otherwise they post it again and have two.
 */
export type PostJobOutcome =
  | { kind: 'published'; job: JobPostingResponse }
  | { kind: 'draft'; job: JobPostingResponse; cause: unknown };

/** The employer the member posts under, or why there is none to choose. */
export type PostingEmployer =
  | { kind: 'one'; employerId: string; employerName: string }
  | { kind: 'none' };

// ── Reads ────────────────────────────────────────────────────────────────────

/** `GET /jobs/categories` — the active categories, in the catalogue's order. */
export async function fetchJobCategories(): Promise<JobCategoryResponse[]> {
  const response = await apiClient.get<Envelope<JobCategoryResponse[]>>('/jobs/categories');
  const rows = Array.isArray(response.data?.data) ? response.data.data : [];
  return rows
    .filter((category) => category.isActive !== false && !category.parentKey)
    .sort((a, b) => a.order - b.order);
}

/**
 * The member's employer, from `GET /jobs/employers/dashboard`.
 *
 * `jobs.employer.not-found` is the platform's answer for a member with no
 * employer — and for one with several, which it cannot list — so both read as
 * `none`, whose way out is registering. Any other failure propagates: a request
 * that did not arrive must not send a member to register an employer they have.
 */
export async function resolvePostingEmployer(): Promise<PostingEmployer> {
  try {
    const response = await apiClient.get<
      Envelope<{ employerId: string; employerName: string }>
    >('/jobs/employers/dashboard');
    const dashboard = response.data.data;
    return { kind: 'one', employerId: dashboard.employerId, employerName: dashboard.employerName };
  } catch (cause) {
    if (problemCode(cause) === 'jobs.employer.not-found') return { kind: 'none' };
    throw cause;
  }
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** `POST /jobs/` — opens the posting as a draft. */
export async function createJobPosting(
  request: CreateJobPostingRequest
): Promise<JobPostingResponse> {
  const response = await apiClient.post<Envelope<JobPostingResponse>>('/jobs/', {
    employerId: request.employerId,
    title: request.title.trim(),
    description: request.description.trim(),
    summary: request.summary?.trim() || null,
    categoryKey: request.categoryKey,
    jobType: request.jobType,
    experienceLevel: request.experienceLevel,
    countryCode: request.countryCode.trim().toUpperCase(),
    regionName: request.regionName?.trim() || null,
    cityName: request.cityName?.trim() || null,
    workplaceType: request.workplaceType ?? null,
    offersVisaSponsorship: request.offersVisaSponsorship ?? false,
    offersRelocationAssistance: request.offersRelocationAssistance ?? false,
  });
  return response.data.data;
}

/**
 * `PUT /jobs/{jobId}` with the pay and the number of vacancies on it.
 *
 * A whole-document edit: it restates what the draft was created with, so
 * nothing the member entered is cleared by setting the terms. No pay is sent as
 * no pay, which the server shows as "not disclosed" rather than as zero.
 */
export async function setJobTerms(
  job: JobPostingResponse,
  input: PostJobInput
): Promise<JobPostingResponse> {
  const pay = input.pay ?? null;
  const response = await apiClient.put<Envelope<JobPostingResponse>>(
    `/jobs/${encodeURIComponent(job.jobId)}`,
    {
      title: input.title.trim(),
      description: input.description.trim(),
      summary: input.summary?.trim() || null,
      jobType: input.jobType,
      experienceLevel: input.experienceLevel,
      countryCode: input.countryCode.trim().toUpperCase(),
      regionName: input.regionName?.trim() || null,
      cityName: input.cityName?.trim() || null,
      workplaceType: input.workplaceType ?? null,
      offersVisaSponsorship: input.offersVisaSponsorship ?? false,
      offersRelocationAssistance: input.offersRelocationAssistance ?? false,
      salaryMinimum: pay?.minimum ?? null,
      salaryMaximum: pay?.maximum ?? null,
      salaryCurrency: pay?.currency ?? null,
      salaryPeriod: pay?.period ?? null,
      salaryNegotiable: pay?.negotiable ?? false,
      vacancyCount: input.vacancyCount ?? 1,
      requiresResume: false,
      baseRevision: job.revision,
    }
  );
  return response.data.data;
}

/** `POST /jobs/{jobId}/publish` — visible, and open to applications now. */
export async function publishJobPosting(jobId: string): Promise<JobPostingResponse> {
  const response = await apiClient.post<Envelope<JobPostingResponse>>(
    `/jobs/${encodeURIComponent(jobId)}/publish`,
    { openImmediately: true }
  );
  return response.data.data;
}

/**
 * The whole sequence: draft, pay, publish.
 *
 * **Reports only what the server confirmed.** A failure before the draft exists
 * throws, and nothing was posted. A failure after it returns `draft` with the
 * job, because the posting exists and a member who is told "failed" posts it a
 * second time.
 */
export async function postJob(employerId: string, input: PostJobInput): Promise<PostJobOutcome> {
  let job = await createJobPosting({ ...input, employerId });

  try {
    // Only when there is something the create request could not carry.
    if (input.pay || (input.vacancyCount ?? 1) !== 1) {
      job = await setJobTerms(job, input);
    }
    const published = await publishJobPosting(job.jobId);
    return { kind: 'published', job: { ...job, ...published } };
  } catch (cause) {
    return { kind: 'draft', job, cause };
  }
}

// ── The form ─────────────────────────────────────────────────────────────────

/** What the Post a job screen holds, as typed. Every number is still a string. */
export interface JobPostingForm {
  categoryKey: string | null;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  title: string;
  description: string;
  payMinimum: string;
  payMaximum: string;
  payCurrency: string;
  payPeriod: SalaryPeriod;
  vacancies: string;
  countryCode: string;
  cityName: string;
  workplaceType: WorkplaceType;
  offersVisaSponsorship: boolean;
}

/** The server's own limits (`JobLimits`). */
export const JOB_TITLE_MIN = 3;
export const JOB_TITLE_MAX = 200;

/**
 * The currency a member most likely pays in, from the country they post in.
 * Only a default — the form offers the others.
 */
export function currencyForCountry(countryCode: string | null | undefined): string {
  const byCountry: Record<string, string> = {
    MU: 'MUR',
    GB: 'GBP',
    NG: 'NGN',
    GH: 'GHS',
    KE: 'KES',
    ZA: 'ZAR',
    US: 'USD',
  };
  return byCountry[(countryCode ?? '').trim().toUpperCase()] ?? 'USD';
}

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const amount = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : Number.NaN;
}

/**
 * Why a step cannot move on, in a sentence — or null when it can.
 *
 * `step` 0 is the role, 1 the details and pay, 2 where the work is. The review
 * step checks all three, because the server refuses the whole posting for any
 * one of them and a refusal after "Publish" is worse than one before it.
 */
export function jobPostingFormProblem(form: JobPostingForm, step: 0 | 1 | 2 | 'all'): string | null {
  const checks: Record<0 | 1 | 2, () => string | null> = {
    0: () => (form.categoryKey ? null : 'Choose a category.'),
    1: () => {
      const title = form.title.trim().replace(/\s+/g, ' ');
      if (title.length < JOB_TITLE_MIN) return 'Give the job a title of at least three characters.';
      if (title.length > JOB_TITLE_MAX) return 'Keep the title under 200 characters.';
      if (form.description.trim().length === 0) return 'Describe the job.';

      const minimum = parseAmount(form.payMinimum);
      const maximum = parseAmount(form.payMaximum);
      if (Number.isNaN(minimum) || Number.isNaN(maximum)) return 'Pay must be a number.';
      if (minimum === null && maximum !== null) return 'Add the lowest pay as well as the highest.';
      if (minimum !== null && minimum <= 0) return 'Pay must be more than zero, or left blank.';
      if (minimum !== null && maximum !== null && maximum < minimum) {
        return 'The highest pay cannot be less than the lowest.';
      }

      const vacancies = parseAmount(form.vacancies);
      if (Number.isNaN(vacancies) || (vacancies !== null && (vacancies < 1 || !Number.isInteger(vacancies)))) {
        return 'Vacancies must be a whole number, one or more.';
      }
      return null;
    },
    2: () =>
      /^[A-Za-z]{2}$/.test(form.countryCode.trim())
        ? null
        : 'Use the two-letter country code, like MU or GB.',
  };

  if (step !== 'all') return checks[step]();
  return checks[0]() ?? checks[1]() ?? checks[2]();
}

/** The form, as the three calls want it. Assumes `jobPostingFormProblem(form, 'all')` is null. */
export function toPostJobInput(form: JobPostingForm): PostJobInput {
  const minimum = parseAmount(form.payMinimum);
  const maximum = parseAmount(form.payMaximum);
  const vacancies = parseAmount(form.vacancies);

  return {
    title: form.title.trim().replace(/\s+/g, ' '),
    description: form.description.trim(),
    categoryKey: form.categoryKey ?? '',
    jobType: form.jobType,
    experienceLevel: form.experienceLevel,
    countryCode: form.countryCode.trim().toUpperCase(),
    cityName: form.cityName.trim() || null,
    workplaceType: form.workplaceType,
    offersVisaSponsorship: form.offersVisaSponsorship,
    pay:
      minimum !== null && !Number.isNaN(minimum)
        ? {
            minimum,
            maximum: maximum !== null && !Number.isNaN(maximum) ? maximum : null,
            currency: form.payCurrency,
            period: form.payPeriod,
          }
        : null,
    vacancyCount: vacancies !== null && !Number.isNaN(vacancies) ? vacancies : 1,
  };
}

// ── Reading refusals ─────────────────────────────────────────────────────────

function problemCode(cause: unknown): string | null {
  const code = (cause as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

/** A sentence a member can act on, for a refused posting. */
export function jobPostingErrorMessage(cause: unknown): string {
  const status = (cause as { response?: { status?: number } })?.response?.status;
  if (status === 401) return 'Sign in to post a job.';
  if (status === 403) return 'Your account cannot post jobs for this employer.';

  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) return detail;

  return 'We could not reach the jobs service just now.';
}
