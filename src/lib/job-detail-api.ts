// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — one job, as its page reads and manages it
//
// **Found on the device, 14 Sep 2026.** A member applied to a job whose page
// said "Employer (Community Member)", pay " /mo" and location "Unknown", though
// the employer, the pay and the town were all on the wire. `app/job/[id].tsx`
// read `GET /jobs/{id}` as the pre-backend `JobOpportunity` fixture —
// `employer.name`, `salary.amount`, `location.areaName` — none of which the
// server sends. The same page:
//
//   * decided who owned a job by comparing `employer.providerId` with the
//     member's id — a field that does not exist — so no owner was recognised;
//   * printed `responsibilities` and `requirements` straight into `<Text>`, which
//     throws for any posting that has one, because each line is an object;
//   * showed three invented perks crossed out, a map built from coordinates the
//     wire does not carry, and Call and Email buttons for contact details no
//     posting has;
//   * showed "Opportunity Not Found" for a read that simply failed.
//
// And an owner could not close a job at all: `POST /jobs/{id}/close` and
// `POST /jobs/{id}/archive` had no caller.
//
// Everything the page decides lives here as plain functions, so each rule is
// tested without rendering a screen.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { countryByCode } from './calling-code';
import { readPage } from './platform-envelope';
import { coordinatesOf } from './place-coordinates';
import type {
  CloseJobRequest,
  CompanySize,
  EducationLevel,
  EmployerOrganizationType,
  ExperienceLevel,
  JobCardResponse,
  JobEmployerSummaryResponse,
  JobLocationResponse,
  JobResponse,
  JobSalaryResponse,
  JobType,
  JobVisibility,
  SalaryPeriod,
  WorkplaceType,
} from '@/types/jobs-hiring';

interface Envelope<T> {
  data: T;
}

function problemCode(cause: unknown): string | null {
  const code = (cause as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

function httpStatus(cause: unknown): number | null {
  const value = (cause as { response?: { status?: number } })?.response?.status;
  return typeof value === 'number' ? value : null;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Whether the platform said there is no such job for this viewer.
 *
 * `jobs.posting.not-found` is also the answer for a draft or hidden posting the
 * viewer may not see — deliberately, so an identifier cannot be probed. A bare
 * 404 (an identifier that is not a GUID never reaches the handler) means the
 * same. Nothing else does: a timeout is not a missing job.
 */
export function isJobNotFoundError(cause: unknown): boolean {
  const code = problemCode(cause);
  return code === 'jobs.posting.not-found' || (httpStatus(cause) === 404 && code === null);
}

/**
 * `GET /jobs/{jobId}`.
 *
 * **Null only when the job is not there for this viewer.** Every other failure
 * throws, so a dropped connection is shown as a failure with a way to try again
 * — never as a job that has gone.
 */
export async function fetchJob(jobId: string): Promise<JobResponse | null> {
  try {
    const response = await apiClient.get<Envelope<JobResponse>>(`/jobs/${encodeURIComponent(jobId)}`);
    return response.data.data;
  } catch (cause) {
    if (isJobNotFoundError(cause)) return null;
    throw cause;
  }
}

/**
 * Other jobs in the same category and country, without this one.
 *
 * `GET /jobs` binds `category` and `country` (`Api/JobBrowseParameters.cs`).
 * The page used to send `latitude` and `longitude`, which bind to nothing, and a
 * `category` read from a field the wire does not have — so the section was
 * either empty or unrelated.
 */
export async function fetchSimilarJobs(
  job: Pick<JobResponse, 'jobId' | 'categoryKey' | 'location'>,
  limit = 2
): Promise<JobCardResponse[]> {
  const response = await apiClient.get('/jobs', {
    params: { category: job.categoryKey, country: job.location.countryCode, limit: limit + 1 },
  });
  return readPage<JobCardResponse>(response.data)
    .items.filter((row) => row.jobId !== job.jobId)
    .slice(0, limit);
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** `POST /jobs/{jobId}/close`. Answers the posting as it now stands. */
export async function closeJob(jobId: string, request: CloseJobRequest): Promise<JobResponse> {
  const response = await apiClient.post<Envelope<JobResponse>>(
    `/jobs/${encodeURIComponent(jobId)}/close`,
    request
  );
  return response.data.data;
}

/** `POST /jobs/{jobId}/archive`. Takes the job off every public surface. Answers `data: null`. */
export async function archiveJob(jobId: string): Promise<void> {
  await apiClient.post(`/jobs/${encodeURIComponent(jobId)}/archive`);
}

/**
 * `POST /jobs/{jobId}/places/fill` (5 Nov 2026). The poster counts one place
 * off; the last one fills the job. Answers the posting as it now stands.
 */
export async function fillJobPlace(jobId: string): Promise<JobResponse> {
  const response = await apiClient.post<Envelope<JobResponse>>(
    `/jobs/${encodeURIComponent(jobId)}/places/fill`
  );
  return response.data.data;
}

// ── Editing ──────────────────────────────────────────────────────────────────
//
// **Added 14 Oct 2026.** An employer could close or remove a job but not
// correct a typo in it. `PUT /jobs/{jobId}` had no caller.
//
// The route is a REPLACE (`Contracts/V1/Requests/UpdateJobRequest.cs`): every
// field it carries is rebuilt from the request, so a field the editor does not
// show still has to be sent back exactly as read — an omitted `cityName` blanks
// the town, an omitted `requiresResume` turns the CV requirement off, an omitted
// `educationLevel` becomes "None". `toUpdateJobRequest` starts from the loaded
// job for that reason and lays only the editor's fields over it.

/** `Contracts/V1/Requests/UpdateJobRequest.cs`, every field. */
export interface UpdateJobRequest {
  title: string;
  description: string;
  summary: string | null;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  educationLevel: EducationLevel | null;
  countryCode: string;
  regionName: string | null;
  cityName: string | null;
  areaId: string | null;
  /** Both or neither. Omitted (null) leaves the stored pin alone. */
  latitude: number | null;
  longitude: number | null;
  workplaceType: WorkplaceType;
  offersVisaSponsorship: boolean;
  offersRelocationAssistance: boolean;
  onSiteDaysPerWeek: number | null;
  remotePolicy: string | null;
  salaryMinimum: number | null;
  salaryMaximum: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  salaryNegotiable: boolean;
  visibility: JobVisibility | null;
  vacancyCount: number;
  requiresResume: boolean;
  /** The revision the editor loaded, so a save over someone else's is refused, not lost. */
  baseRevision: number | null;
}

/** What the edit screen lets an employer change. Numbers stay text while typed. */
export interface JobEditForm {
  title: string;
  description: string;
  summary: string;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  workplaceType: WorkplaceType;
  remotePolicy: string;
  offersVisaSponsorship: boolean;
  offersRelocationAssistance: boolean;
  salaryMinimum: string;
  salaryMaximum: string;
  salaryPeriod: SalaryPeriod;
  salaryNegotiable: boolean;
  vacancyCount: string;
}

/** `Domain/Policies/JobLimits.cs`. */
export const JOB_EDIT_LIMITS = {
  minTitle: 3,
  maxTitle: 200,
  maxDescription: 30_000,
  maxSummary: 500,
  maxRemotePolicy: 1_000,
  maxVacancies: 9_999,
} as const;

function amountText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** The form as the loaded job stands. */
export function jobEditFormFrom(job: JobResponse): JobEditForm {
  return {
    title: job.title ?? '',
    description: job.description ?? '',
    summary: job.summary ?? '',
    jobType: job.jobType,
    experienceLevel: job.experienceLevel,
    workplaceType: job.workArrangement.workplaceType,
    remotePolicy: job.workArrangement.remotePolicy ?? '',
    offersVisaSponsorship: job.workArrangement.offersVisaSponsorship,
    offersRelocationAssistance: job.workArrangement.offersRelocationAssistance,
    salaryMinimum: job.salary.isDisclosed ? amountText(job.salary.minimum) : '',
    salaryMaximum: job.salary.isDisclosed ? amountText(job.salary.maximum) : '',
    salaryPeriod: job.salary.period ?? 'Monthly',
    salaryNegotiable: job.salary.isNegotiable,
    vacancyCount: String(job.vacancyCount),
  };
}

function parseEditAmount(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Seats already taken. The server refuses a count below it. */
function filledSeats(job: Pick<JobResponse, 'vacancyCount' | 'remainingVacancies'>): number {
  return Math.max(0, job.vacancyCount - job.remainingVacancies);
}

/** The required fields still empty, by the name the form shows. */
export function jobEditMissing(form: JobEditForm): string[] {
  const missing: string[] = [];
  if (!form.title.trim()) missing.push('Job title');
  if (!form.description.trim()) missing.push('Description');
  if (!form.vacancyCount.trim()) missing.push('How many people you are hiring');
  return missing;
}

/** What is wrong with a filled-in field, in a sentence — or null. */
export function jobEditProblem(
  form: JobEditForm,
  job: Pick<JobResponse, 'vacancyCount' | 'remainingVacancies'>
): string | null {
  const title = form.title.trim();
  if (title.length < JOB_EDIT_LIMITS.minTitle) return `The job title needs at least ${JOB_EDIT_LIMITS.minTitle} characters.`;
  if (title.length > JOB_EDIT_LIMITS.maxTitle) return `The job title can be at most ${JOB_EDIT_LIMITS.maxTitle} characters.`;
  if (form.description.trim().length > JOB_EDIT_LIMITS.maxDescription) return 'The description is too long.';
  if (form.summary.trim().length > JOB_EDIT_LIMITS.maxSummary)
    return `The summary can be at most ${JOB_EDIT_LIMITS.maxSummary} characters.`;
  if (form.remotePolicy.trim().length > JOB_EDIT_LIMITS.maxRemotePolicy) return 'The remote policy is too long.';

  const minimum = parseEditAmount(form.salaryMinimum);
  const maximum = parseEditAmount(form.salaryMaximum);
  if (Number.isNaN(minimum) || Number.isNaN(maximum)) return 'Pay must be a number.';
  if ((minimum ?? 0) < 0 || (maximum ?? 0) < 0) return 'Pay cannot be negative.';
  if (minimum !== null && maximum !== null && minimum > maximum) return 'The lower pay figure is above the higher one.';
  // `JobPosting.UpdateDetails` refuses it; saying so here is kinder than a 400.
  if (form.jobType === 'Volunteer' && ((minimum ?? 0) > 0 || (maximum ?? 0) > 0))
    return 'A volunteer role cannot state pay. Clear the pay or choose another type of work.';

  const vacancies = Number(form.vacancyCount.trim());
  if (!Number.isInteger(vacancies) || vacancies < 1 || vacancies > JOB_EDIT_LIMITS.maxVacancies)
    return `The number of people must be a whole number from 1 to ${JOB_EDIT_LIMITS.maxVacancies}.`;
  const filled = filledSeats(job);
  if (vacancies < filled) return `You have already filled ${filled}, so the number cannot be lower than that.`;

  return null;
}

/**
 * The PUT body: the loaded job, with the editor's fields laid over it.
 *
 * **The currency is the job's own**, never chosen — pay has been in the
 * member's currency since 13 Oct 2026, and an edit must not silently convert a
 * posting's figures into another unit. Only a job that stated no pay before
 * takes `fallbackCurrency` (the member's residence currency), as create does.
 */
export function toUpdateJobRequest(
  job: JobResponse,
  form: JobEditForm,
  fallbackCurrency: string
): UpdateJobRequest {
  const minimum = parseEditAmount(form.salaryMinimum);
  const maximum = parseEditAmount(form.salaryMaximum);
  const statesPay = minimum !== null || maximum !== null;
  const summary = form.summary.trim();
  const remotePolicy = form.remotePolicy.trim();

  return {
    title: form.title.trim(),
    description: form.description.trim(),
    // Sent as shown. The wire cannot say whether a summary was written or
    // derived from the first sentence, so nulling it on a description change
    // could erase one the employer wrote. Emptied, the server derives afresh.
    summary: summary.length > 0 ? summary : null,
    jobType: form.jobType,
    experienceLevel: form.experienceLevel,
    // Not on the form — sent back exactly as read.
    educationLevel: job.educationLevel ?? null,
    countryCode: job.location.countryCode,
    regionName: job.location.regionName ?? null,
    cityName: job.location.cityName ?? null,
    areaId: job.location.areaId ?? null,
    // The place is not on the form: the pin goes back exactly as read.
    ...coordinatesOf(job.location),
    workplaceType: form.workplaceType,
    offersVisaSponsorship: form.offersVisaSponsorship,
    offersRelocationAssistance: form.offersRelocationAssistance,
    onSiteDaysPerWeek: job.workArrangement.onSiteDaysPerWeek ?? null,
    remotePolicy: remotePolicy.length > 0 ? remotePolicy : null,
    salaryMinimum: statesPay ? minimum : null,
    salaryMaximum: statesPay ? maximum : null,
    salaryCurrency: statesPay ? job.salary.currencyCode ?? fallbackCurrency : null,
    salaryPeriod: statesPay ? form.salaryPeriod : null,
    salaryNegotiable: form.salaryNegotiable,
    visibility: job.visibility ?? null,
    vacancyCount: Number(form.vacancyCount.trim()),
    requiresResume: job.requiresResume,
    baseRevision: typeof job.revision === 'number' ? job.revision : null,
  };
}

/** `PUT /jobs/{jobId}`. Answers the posting as it now stands. */
export async function updateJob(jobId: string, body: UpdateJobRequest): Promise<JobResponse> {
  const response = await apiClient.put<Envelope<JobResponse>>(`/jobs/${encodeURIComponent(jobId)}`, body);
  return response.data.data;
}

/**
 * A refused edit, in the server's own words when it gave any — its `detail`
 * names the field it would not take — else the management sentences.
 */
export function jobEditErrorMessage(cause: unknown): string {
  if (problemCode(cause) === 'jobs.revision-conflict')
    return 'This job was changed somewhere else after you opened it. Go back, open it again and redo your change.';
  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) return detail;
  return jobManagementErrorMessage(cause);
}

/** A sentence a member can act on, for a refused change to their job. */
export function jobManagementErrorMessage(cause: unknown): string {
  switch (problemCode(cause)) {
    case 'jobs.posting.filled':
      return 'This job is already marked as filled.';
    case 'jobs.posting.expired':
      return 'This job is already closed.';
    case 'jobs.posting.archived-immutable':
      return 'This job has already been removed.';
    case 'jobs.posting.not-open':
    case 'jobs.posting.not-published':
      return 'This job cannot be changed that way in its current state.';
    case 'jobs.not-employer':
    case 'jobs.not-recruiter':
    case 'jobs.posting.not-owned':
      return 'Your account does not manage this job.';
    default:
      break;
  }

  if (httpStatus(cause) === 401) return 'Sign in to manage this job.';
  if (httpStatus(cause) === 403) return 'Your account does not manage this job.';

  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) return detail;

  return 'We could not reach the jobs service just now.';
}

// ── Words ────────────────────────────────────────────────────────────────────

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  FullTime: 'Full time',
  PartTime: 'Part time',
  Contract: 'Contract',
  Temporary: 'Temporary',
  Internship: 'Internship',
  Apprenticeship: 'Apprenticeship',
  Freelance: 'Freelance',
  Volunteer: 'Volunteer',
  Seasonal: 'Seasonal',
  Other: 'Other',
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  Entry: 'Entry level',
  Junior: 'Junior',
  Mid: 'Mid level',
  Senior: 'Senior',
  Lead: 'Lead',
  Principal: 'Principal',
  Director: 'Director',
  Executive: 'Executive',
};

export const WORKPLACE_LABELS: Record<WorkplaceType, string> = {
  OnSite: 'On site',
  Hybrid: 'Hybrid',
  Remote: 'Remote',
};

/** The phrase after an amount: "MUR 15,000 a month". */
export const PAY_PERIOD_PHRASES: Record<SalaryPeriod, string> = {
  Hourly: 'an hour',
  Daily: 'a day',
  Weekly: 'a week',
  Monthly: 'a month',
  Yearly: 'a year',
  Project: 'for the project',
};

const ORGANIZATION_LABELS: Record<EmployerOrganizationType, string> = {
  Company: 'Company',
  Startup: 'Start-up',
  RecruitmentAgency: 'Recruitment agency',
  StaffingFirm: 'Staffing firm',
  NonProfit: 'Non-profit',
  Government: 'Government',
  Educational: 'Education',
  Healthcare: 'Healthcare',
  Individual: 'Individual employer',
  Other: 'Organisation',
};

/** `Domain/Enums/CompanySize.cs`. `Unspecified` says nothing, so it prints nothing. */
const COMPANY_SIZE_LABELS: Record<CompanySize, string | null> = {
  Unspecified: null,
  Micro: '1–10 people',
  Small: '11–50 people',
  Medium: '51–250 people',
  Large: '251–1,000 people',
  VeryLarge: '1,001–5,000 people',
  Enterprise: 'More than 5,000 people',
};

/**
 * "15,000" and "1,250.50", grouped by hand.
 *
 * Not `toLocaleString`: Hermes ships a trimmed ICU on some Android builds, and
 * an amount must group the same way on every phone. The review card printed
 * "MUR 15000" for exactly this reason.
 */
export function groupDigits(value: number): string {
  if (!Number.isFinite(value)) return '';
  const [whole, fraction] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = fraction === '00' ? '' : `.${fraction}`;
  return `${value < 0 ? '-' : ''}${grouped}${cents}`;
}

/** One pay statement in words. The Post a job review card and the job page both use it. */
export function formatPay(pay: {
  minimum: number;
  maximum?: number | null;
  currency?: string | null;
  period?: SalaryPeriod | null;
  negotiable?: boolean;
}): string {
  const band =
    pay.maximum != null && pay.maximum !== pay.minimum
      ? `${groupDigits(pay.minimum)}–${groupDigits(pay.maximum)}`
      : groupDigits(pay.minimum);
  const phrase = pay.period ? PAY_PERIOD_PHRASES[pay.period] ?? '' : '';
  const text = [pay.currency?.trim(), band, phrase].filter(Boolean).join(' ');
  return pay.negotiable ? `${text}, negotiable` : text;
}

/**
 * What a posting pays, as a candidate reads it.
 *
 * "Pay not stated" is a real answer — most postings give none — and it is never
 * rendered as a zero or as a bare period.
 */
export function describeSalary(salary: JobSalaryResponse | null | undefined): string {
  if (!salary) return 'Pay not stated';
  if (salary.isUnpaid) return 'Unpaid';
  if (!salary.isDisclosed || salary.minimum == null) {
    return salary.isNegotiable ? 'Pay negotiable' : 'Pay not stated';
  }
  return formatPay({
    minimum: salary.minimum,
    maximum: salary.maximum,
    currency: salary.currencyCode,
    period: salary.period,
    negotiable: salary.isNegotiable,
  });
}

/** The country's name, or its code when the reference list does not have it. */
export function countryLabel(countryCode: string | null | undefined): string {
  const code = (countryCode ?? '').trim().toUpperCase();
  return countryByCode(code)?.name ?? code;
}

/** "Rose Hill, Mauritius". Never "Unknown", never "undefined". */
export function jobPlaceLabel(location: JobLocationResponse | null | undefined): string {
  if (!location) return '';
  const town = location.cityName?.trim() || location.regionName?.trim() || '';
  const country = countryLabel(location.countryCode);
  return [town, country].filter(Boolean).join(', ');
}

/** The catalogue's name for a category, or the key made readable. */
export function categoryLabel(
  categoryKey: string | null | undefined,
  categories: readonly { key: string; name: string }[] = []
): string {
  const key = (categoryKey ?? '').trim();
  if (!key) return '';
  const named = categories.find((category) => category.key === key)?.name;
  if (named) return named;
  const words = key.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `Domain/Enums/EducationLevel.cs`. `None` asks for nothing, so it prints nothing. */
const EDUCATION_LABELS: Record<EducationLevel, string | null> = {
  None: null,
  SecondarySchool: 'Secondary school',
  Vocational: 'A vocational qualification',
  Associate: 'An associate degree',
  Bachelor: 'A bachelor’s degree',
  Master: 'A master’s degree',
  Doctorate: 'A doctorate',
  Professional: 'A professional qualification',
};

export interface JobFact {
  label: string;
  value: string;
}

/**
 * How the work is arranged — the questions a candidate applying across a border
 * asks first. Every line is the employer's own statement, and a sponsorship the
 * posting does not offer is said, not left out.
 *
 * **Except on a simple job (6 Nov 2026).** Its form asks none of these, and the
 * app files it as entry level without asking, so "Visa sponsorship: Not offered"
 * and "Experience: Entry level" would be words the poster never said. A simple
 * job shows a sponsorship only when one was added later through Edit.
 */
export function workArrangementFacts(
  job: Pick<JobResponse, 'workArrangement' | 'experienceLevel' | 'educationLevel' | 'requiresResume' | 'postingMode'>
): JobFact[] {
  const isSimple = job.postingMode === 'Simple';
  const work = job.workArrangement;
  const facts: JobFact[] = [];

  const where = WORKPLACE_LABELS[work.workplaceType] ?? work.workplaceType;
  const days = work.onSiteDaysPerWeek;
  facts.push({
    label: 'Where',
    value:
      work.workplaceType === 'Hybrid' && typeof days === 'number' && days > 0
        ? `Hybrid, ${days === 1 ? 'one day' : `${days} days`} a week on site`
        : where,
  });

  const policy = work.remotePolicy?.trim();
  if (policy) facts.push({ label: 'Remote policy', value: policy });

  if (!isSimple || work.offersVisaSponsorship) {
    facts.push({ label: 'Visa sponsorship', value: work.offersVisaSponsorship ? 'Offered' : 'Not offered' });
  }
  if (!isSimple || work.offersRelocationAssistance) {
    facts.push({ label: 'Relocation help', value: work.offersRelocationAssistance ? 'Offered' : 'Not offered' });
  }
  if (!isSimple) {
    facts.push({ label: 'Experience', value: EXPERIENCE_LABELS[job.experienceLevel] ?? job.experienceLevel });
  }

  const education = EDUCATION_LABELS[job.educationLevel];
  if (education) facts.push({ label: 'Education', value: education });

  if (job.requiresResume) facts.push({ label: 'CV', value: 'Required to apply' });

  return facts;
}

/** "1 opening", "3 openings", "1 of 3 openings left". */
export function openingsLabel(job: Pick<JobResponse, 'vacancyCount' | 'remainingVacancies'>): string {
  const total = Math.max(1, job.vacancyCount);
  const left = Math.max(0, Math.min(job.remainingVacancies, total));
  if (left === total) return total === 1 ? '1 opening' : `${total} openings`;
  return `${left} of ${total} openings left`;
}

/** "14 Sep 2026", on the phone's own calendar day. Empty for a missing or unreadable date. */
export function formatJobDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * The last day a job takes interest, as that day's local midnight. Null for a
 * missing or unreadable closing time.
 *
 * A job that closes at exactly midnight is open all of the day before: a
 * simple job working on 7 Nov closes at 00:00 on the 8th. Printing that
 * instant's own date said "Closes 8 Nov" on a one-day job on the 7th (6 Nov
 * 2026, on production). Any other closing time falls on a day the job is open
 * for part of, so that day is the last one.
 */
export function lastOpenDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const closing = new Date(value);
  if (Number.isNaN(closing.getTime())) return null;
  const atMidnight =
    closing.getHours() === 0 &&
    closing.getMinutes() === 0 &&
    closing.getSeconds() === 0 &&
    closing.getMilliseconds() === 0;
  return new Date(closing.getFullYear(), closing.getMonth(), closing.getDate() - (atMidnight ? 1 : 0));
}

/** "Closes 7 Nov 2026" while it is open, "Closed 7 Nov 2026" after. Empty without a closing time. */
export function closingLabel(value: string | null | undefined, now: Date = new Date()): string {
  const last = lastOpenDay(value);
  if (!last || !value) return '';
  const word = new Date(value).getTime() > now.getTime() ? 'Closes' : 'Closed';
  return `${word} ${last.getDate()} ${MONTHS[last.getMonth()]} ${last.getFullYear()}`;
}

/** "No applications yet", "1 person has applied", "12 people have applied". */
export function applicantCountLabel(count: number): string {
  if (count <= 0) return 'No applications yet';
  return count === 1 ? '1 person has applied' : `${groupDigits(count)} people have applied`;
}

// ── Where a job stands ───────────────────────────────────────────────────────

export type JobStandingTone = 'open' | 'paused' | 'closed' | 'private';

export interface JobStanding {
  /** The pill. */
  label: string;
  tone: JobStandingTone;
  /** A sentence under the pill, or null when the pill says it all. */
  explanation: string | null;
}

/**
 * Where a job stands, for whoever is reading it.
 *
 * `canApply` is the server's whole answer to "can I apply now" — the status, the
 * closing date and the vacancies together — so an open status that cannot take
 * applications is explained rather than contradicted.
 */
export function jobStanding(
  job: Pick<
    JobResponse,
    'status' | 'canApply' | 'canManage' | 'isOnEmployerTeam' | 'closingAt' | 'remainingVacancies' | 'closureReason'
  >,
  now: Date = new Date()
): JobStanding {
  const reason = job.closureReason?.trim() || null;

  switch (job.status) {
    case 'Draft':
      return {
        label: 'Draft',
        tone: 'private',
        explanation: 'Only your team can see this job. Publish it to open it to applications.',
      };
    case 'Archived':
      return {
        label: 'Removed',
        tone: 'private',
        explanation: isOnEmployerTeam(job)
          ? 'This job has been removed from Diaspora. Only your team can open this page.'
          : 'This job has been removed from Diaspora.',
      };
    case 'Filled':
      return { label: 'Position filled', tone: 'closed', explanation: reason ?? 'Someone has been hired for this job.' };
    case 'Expired':
      return {
        label: 'Closed',
        tone: 'closed',
        explanation: reason ?? 'This job is no longer taking applications.',
      };
    case 'OfferMade':
      return {
        label: 'Offer made',
        tone: 'paused',
        explanation: 'The employer has made an offer and is not taking new applications.',
      };
    case 'Published':
      return {
        label: 'Not open yet',
        tone: 'paused',
        explanation: 'The employer has published this job but is not taking applications yet.',
      };
    default:
      break;
  }

  // Open, ReceivingApplications, Interviewing.
  if (job.canApply) return { label: 'Taking applications', tone: 'open', explanation: null };

  const closing = job.closingAt ? new Date(job.closingAt) : null;
  if (closing && !Number.isNaN(closing.getTime()) && closing.getTime() <= now.getTime()) {
    return { label: 'Closed', tone: 'closed', explanation: 'The closing date for this job has passed.' };
  }
  if (job.remainingVacancies <= 0) {
    return { label: 'Closed', tone: 'closed', explanation: 'Every opening for this job has been filled.' };
  }
  return {
    label: 'Not taking applications',
    tone: 'paused',
    explanation: 'The employer is not taking applications for this job at the moment.',
  };
}

/**
 * Whether the job is the reader's own: they are on the employer's team.
 *
 * Not `canManage`, which the server also sets for staff on every job. Reading it
 * as ownership told an Admin "You manage this job for Zoe" and hid "I'm
 * interested" on a stranger's job, while the card offered it (6 Nov 2026). A
 * server from before then sends only `canManage`, which is the old reading.
 */
export function isOnEmployerTeam(job: Pick<JobResponse, 'canManage' | 'isOnEmployerTeam'>): boolean {
  return typeof job.isOnEmployerTeam === 'boolean' ? job.isOnEmployerTeam : job.canManage;
}

/**
 * Whether the reader is Diaspora staff looking at somebody else's job.
 *
 * Since 7 Nov 2026 the server says so in `canModerate`, and `canManage` is the
 * team's alone. A server from before then sends no `canModerate`, and its
 * `canManage` was true for staff on every job, so staff there are "may manage,
 * not on the team".
 */
export function isStaffViewer(
  job: Pick<JobResponse, 'canManage' | 'isOnEmployerTeam' | 'canModerate'>
): boolean {
  if (isOnEmployerTeam(job)) return false;
  return typeof job.canModerate === 'boolean' ? job.canModerate : job.canManage;
}

/** What the bottom of the page offers the reader. */
export type ApplyState =
  /** The reader works for the employer. They manage the job; they cannot apply to it. */
  | { kind: 'manage' }
  /** Applied already — including an application since withdrawn, which cannot be re-sent. */
  | { kind: 'applied' }
  | { kind: 'open' }
  | { kind: 'closed'; reason: string };

export function applyStateOf(
  job: Pick<
    JobResponse,
    | 'status'
    | 'canApply'
    | 'canManage'
    | 'isOnEmployerTeam'
    | 'hasApplied'
    | 'closingAt'
    | 'remainingVacancies'
    | 'closureReason'
  >,
  now: Date = new Date()
): ApplyState {
  // Staff who are not on the team apply like anyone else; the server lets them.
  if (isOnEmployerTeam(job)) return { kind: 'manage' };
  if (job.hasApplied === true) return { kind: 'applied' };
  if (job.canApply) return { kind: 'open' };
  return {
    kind: 'closed',
    reason: jobStanding(job, now).explanation ?? 'This job is not taking applications.',
  };
}

export type CloseOutcome = NonNullable<CloseJobRequest['outcome']>;

export interface OwnerActions {
  canPublish: boolean;
  /** The close outcomes this status can move to — empty when it cannot close. */
  closeOutcomes: CloseOutcome[];
  canArchive: boolean;
}

/**
 * What the owner may do from here — `Domain/Policies/JobStatusTransitions.cs`,
 * read for the three moves the page offers.
 *
 * A job is marked filled only from a status that was taking applications or had
 * an offer out; a published-but-not-open one can only be withdrawn. Filled,
 * closed and removed jobs offer nothing but removal. Reopening is a real server
 * move with no screen yet, so it is not offered rather than half-offered.
 */
export function ownerActionsFor(job: Pick<JobResponse, 'status' | 'canManage'>): OwnerActions {
  if (!job.canManage) return { canPublish: false, closeOutcomes: [], canArchive: false };

  switch (job.status) {
    case 'Draft':
      return { canPublish: true, closeOutcomes: [], canArchive: true };
    case 'Published':
      return { canPublish: false, closeOutcomes: ['withdrawn'], canArchive: true };
    case 'Open':
    case 'ReceivingApplications':
    case 'Interviewing':
    case 'OfferMade':
      return { canPublish: false, closeOutcomes: ['filled', 'withdrawn'], canArchive: true };
    case 'Filled':
    case 'Expired':
      return { canPublish: false, closeOutcomes: [], canArchive: true };
    default:
      return { canPublish: false, closeOutcomes: [], canArchive: false };
  }
}

// ── The employer ─────────────────────────────────────────────────────────────

/** "Individual employer · Mauritius", "Recruitment agency · 11–50 people · United Kingdom". */
export function employerKindLabel(
  employer: Pick<JobEmployerSummaryResponse, 'organizationType' | 'companySize' | 'countryCode'>
): string {
  return [
    ORGANIZATION_LABELS[employer.organizationType] ?? '',
    COMPANY_SIZE_LABELS[employer.companySize] ?? '',
    countryLabel(employer.countryCode),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * How the employer answers applicants, in sentences — or nothing.
 *
 * Every figure is null until the platform has enough applications to say
 * anything, and a null is not a zero: an employer with no record is not an
 * employer who answers everyone instantly.
 */
export function employerResponsiveness(
  employer: Pick<JobEmployerSummaryResponse, 'averageResponseHours' | 'ghostingRate'>
): string[] {
  const lines: string[] = [];

  const hours = employer.averageResponseHours;
  if (typeof hours === 'number' && Number.isFinite(hours) && hours >= 0) {
    if (hours < 24) {
      const rounded = Math.max(1, Math.round(hours));
      lines.push(`Usually replies within ${rounded === 1 ? 'an hour' : `${rounded} hours`}.`);
    } else {
      const days = Math.round(hours / 24);
      lines.push(`Usually replies within ${days === 1 ? 'a day' : `${days} days`}.`);
    }
  }

  const unanswered = employer.ghostingRate;
  if (typeof unanswered === 'number' && Number.isFinite(unanswered) && unanswered >= 0) {
    lines.push(`Leaves ${Math.round(unanswered * 100)}% of applications unanswered.`);
  }

  return lines;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * When a simple job's work is: "12 Nov · 1 day", "5 Dec · 4 hours". Null for a
 * job with no schedule. Read from the date's own digits, so a time zone cannot
 * move the day.
 */
export function describeSchedule(
  job: Pick<JobResponse, 'startsOn' | 'lengthAmount' | 'lengthUnit'>
): string | null {
  const day = formatWorkDay(job.startsOn);
  if (!day || !job.lengthAmount || !job.lengthUnit) return null;

  const word = job.lengthUnit === 'Hours' ? 'hour' : 'day';
  const length = `${job.lengthAmount} ${word}${job.lengthAmount === 1 ? '' : 's'}`;
  return `${day} · ${length}`;
}

/**
 * A YYYY-MM-DD work day as "6 Nov". Null for anything else. Read from the
 * date's own digits, so a time zone cannot move the day.
 */
export function formatWorkDay(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;

  const month = SHORT_MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month}` : null;
}

/** "2 of 3 places left", "1 place", "All places filled"; null when the server sent no counts. */
export function placesLeftLabel(job: { vacancyCount?: number; remainingVacancies?: number }): string | null {
  if (typeof job.vacancyCount !== 'number' || typeof job.remainingVacancies !== 'number') return null;
  if (job.remainingVacancies <= 0) return 'All places filled';
  if (job.vacancyCount === 1) return '1 place';
  return `${job.remainingVacancies} of ${job.vacancyCount} places left`;
}

/** The subtitle a conversation about the job carries. Never "· undefined". */
export function jobConversationSubtitle(job: Pick<JobResponse, 'employer' | 'location'>): string {
  return [job.employer.displayName?.trim(), jobPlaceLabel(job.location)].filter(Boolean).join(' · ');
}
