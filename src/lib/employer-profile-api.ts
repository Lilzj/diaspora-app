// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — an employer's public profile
//
// **Broken for every member until 15 Sep 2026.** `app/employer/[id].tsx` called
// `GET /employers/{id}`, which no module serves, and read a fixture shape — a
// star rating, a reputation level, followers, "Community Verified" — that no
// employer on the platform has. Only a development fixture ever answered it.
//
// The real route had existed for weeks: `GET /jobs/employers/{idOrSlug}`,
// anonymous, added when gaps G-1 and G-2 closed, because a job advert is public
// and so is the company behind it. The client kept recording it as absent
// ("NG-04") from a reading of the backend taken before it was added.
//
// Two things the server has already decided, and this file does not re-decide:
//
//   * **What an outsider sees.** `EmployerMapper` withholds the legal name, the
//     registration number and the team from anyone not on it. `viewerRole` is
//     set only for a member of the team — the only "is this mine" there is.
//   * **Which of its jobs are shown.** `POST /jobs/search` with `employerId`
//     returns open jobs only by default. The browse GET has no employer
//     parameter, so this is the one way to list them.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { countryLabel } from './job-detail-api';
import { readPage } from './platform-envelope';
import type {
  EmployerMemberRole,
  EmployerResponse,
  HiringRegionResponse,
  JobCardResponse,
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

/** Whether the platform said there is no such employer. A timeout is not that. */
export function isEmployerNotFoundError(cause: unknown): boolean {
  const code = problemCode(cause);
  return code === 'jobs.employer.not-found' || (httpStatus(cause) === 404 && code === null);
}

/**
 * `GET /jobs/employers/{idOrSlug}` — by identifier, or by the slug a shared link
 * carries.
 *
 * **Null only when the employer is not there.** Any other failure throws, so a
 * dropped connection is never shown as an employer that does not exist — which,
 * about a named organisation, is a claim the platform would be making on its
 * own authority.
 */
export async function fetchEmployerProfile(idOrSlug: string): Promise<EmployerResponse | null> {
  try {
    const response = await apiClient.get<Envelope<EmployerResponse>>(
      `/jobs/employers/${encodeURIComponent(idOrSlug)}`
    );
    return response.data.data;
  } catch (cause) {
    if (isEmployerNotFoundError(cause)) return null;
    throw cause;
  }
}

export interface EmployerJobsPage {
  items: JobCardResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * The employer's open jobs, a page at a time — `POST /jobs/search`.
 *
 * `openOnly` is the server's own default and is sent anyway, so the list means
 * the same thing if that default ever changes.
 */
export async function fetchEmployerJobs(
  employerId: string,
  cursor: string | null = null,
  limit = 20
): Promise<EmployerJobsPage> {
  const response = await apiClient.post('/jobs/search', {
    employerId,
    openOnly: true,
    sort: 'Newest',
    cursor,
    limit,
  });
  const page = readPage<JobCardResponse>(response.data);
  return { items: page.items, nextCursor: page.nextCursor ?? null, hasMore: Boolean(page.hasMore) };
}

// ── Words ────────────────────────────────────────────────────────────────────

/**
 * Why a profile needs a warning, or null for an employer in good standing.
 *
 * `Domain/Enums/EmployerStatus.cs`: suspended is moderation and reversible;
 * closed is the owner's own decision and archives the postings.
 */
export function employerStatusNotice(employer: Pick<EmployerResponse, 'status'>): string | null {
  switch (employer.status) {
    case 'Suspended':
      return 'This employer is suspended and cannot post or recruit at the moment.';
    case 'Closed':
      return 'This employer has closed its profile. Its jobs are no longer shown.';
    default:
      return null;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "On Diaspora since Aug 2026". Empty for an unreadable date. */
export function onDiasporaSince(registeredAt: string | null | undefined): string {
  if (!registeredAt) return '';
  const date = new Date(registeredAt);
  if (Number.isNaN(date.getTime())) return '';
  return `On Diaspora since ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "United Kingdom — sponsors visas", in the order the employer gave them. */
export function hiringRegionLines(regions: readonly HiringRegionResponse[] | null | undefined): string[] {
  return (regions ?? [])
    .filter((region) => Boolean(region.countryCode?.trim()))
    .map((region) => `${countryLabel(region.countryCode)}${region.sponsorsVisas ? ' — sponsors visas' : ''}`);
}

/** "1 open job", "3 open jobs", "No open jobs right now". */
export function openJobsLabel(count: number): string {
  if (count <= 0) return 'No open jobs right now';
  return count === 1 ? '1 open job' : `${count} open jobs`;
}

const ROLE_WORDS: Record<EmployerMemberRole, string> = {
  Owner: 'an owner',
  Administrator: 'an administrator',
  Recruiter: 'a recruiter',
  Viewer: 'a viewer',
};

/** "You are an owner of Okonkwo Consulting Mauritius." — or null for an outsider. */
export function teamRoleSentence(
  employer: Pick<EmployerResponse, 'viewerRole' | 'displayName'>
): string | null {
  const role = employer.viewerRole;
  if (!role) return null;
  return `You are ${ROLE_WORDS[role] ?? 'a member'} of ${employer.displayName}.`;
}

export interface EmployerContactLink {
  kind: 'website' | 'careers' | 'email' | 'phone';
  label: string;
  url: string;
}

/**
 * The ways to reach the employer that it published, as openable links.
 *
 * Only well-formed ones: a web address must be http(s), an email must look like
 * one, and a phone number must have digits. A malformed value is left out
 * rather than handed to the phone to fail on.
 */
export function employerContactLinks(
  employer: Pick<EmployerResponse, 'websiteUrl' | 'careersUrl' | 'contactEmail' | 'contactPhone'>
): EmployerContactLink[] {
  const links: EmployerContactLink[] = [];

  const web = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed && /^https?:\/\/[^\s]+$/i.test(trimmed) ? trimmed : null;
  };

  const website = web(employer.websiteUrl);
  if (website) links.push({ kind: 'website', label: 'Website', url: website });

  const careers = web(employer.careersUrl);
  if (careers && careers !== website) links.push({ kind: 'careers', label: 'Careers page', url: careers });

  const email = employer.contactEmail?.trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    links.push({ kind: 'email', label: 'Email', url: `mailto:${email}` });
  }

  const phoneDigits = (employer.contactPhone ?? '').replace(/[^\d+]/g, '');
  if (/\d{5,}/.test(phoneDigits)) {
    links.push({ kind: 'phone', label: 'Call', url: `tel:${phoneDigits}` });
  }

  return links;
}
