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
 */
export function workArrangementFacts(
  job: Pick<JobResponse, 'workArrangement' | 'experienceLevel' | 'educationLevel' | 'requiresResume'>
): JobFact[] {
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

  facts.push({ label: 'Visa sponsorship', value: work.offersVisaSponsorship ? 'Offered' : 'Not offered' });
  facts.push({ label: 'Relocation help', value: work.offersRelocationAssistance ? 'Offered' : 'Not offered' });
  facts.push({ label: 'Experience', value: EXPERIENCE_LABELS[job.experienceLevel] ?? job.experienceLevel });

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
    'status' | 'canApply' | 'canManage' | 'closingAt' | 'remainingVacancies' | 'closureReason'
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
        explanation: job.canManage
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
    'status' | 'canApply' | 'canManage' | 'hasApplied' | 'closingAt' | 'remainingVacancies' | 'closureReason'
  >,
  now: Date = new Date()
): ApplyState {
  if (job.canManage) return { kind: 'manage' };
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

/** The subtitle a conversation about the job carries. Never "· undefined". */
export function jobConversationSubtitle(job: Pick<JobResponse, 'employer' | 'location'>): string {
  return [job.employer.displayName?.trim(), jobPlaceLabel(job.location)].filter(Boolean).join(' · ');
}
