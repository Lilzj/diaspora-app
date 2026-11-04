// ─────────────────────────────────────────────────────────────────────────────
// The administrators' grant form
//
// Grants members saw were two the backend seeded at every startup, in pounds,
// and members took them for the platform's own (UAT, 3 Nov 2026, item 7). An
// administrator now posts them (`/grants/admin`, `creator:programme:manage`).
// This file is the form's arithmetic: whole amounts become minor units, codes
// are upper-cased, and a deadline date means the end of that day where the
// administrator is. Nothing here decides who may post; the server does.
// ─────────────────────────────────────────────────────────────────────────────

/** The statuses a grant may ask for, lowest first. */
export const GRANT_STATUS_THRESHOLDS = [
  { value: 'NotACreator', label: 'Any member' },
  { value: 'Contributor', label: 'Contributor' },
  { value: 'EmergingCreator', label: 'Emerging creator' },
  { value: 'VerifiedCreator', label: 'Verified creator' },
  { value: 'EstablishedCreator', label: 'Established creator' },
  { value: 'TopCreator', label: 'Top creator' },
] as const;

export type GrantStatusThreshold = (typeof GRANT_STATUS_THRESHOLDS)[number]['value'];

/** Every grant amount is in hundredths: the server keeps an exponent of 2. */
const EXPONENT = 2;

export interface GrantForm {
  title: string;
  summary: string;
  description: string;
  category: string;
  /** The most the grant awards, as typed: "500,000". */
  amount: string;
  /** Empty for a fixed amount; otherwise the least an applicant may ask for. */
  minimumAmount: string;
  currency: string;
  /** "NG, GH". Empty means everywhere. */
  countries: string;
  /** `YYYY-MM-DD`, or empty for "open now". */
  opens: string;
  /** `YYYY-MM-DD`, or empty for no deadline. */
  deadline: string;
  minimumStatus: GrantStatusThreshold;
  requiresVerifiedCreator: boolean;
}

/** `SaveGrantRequest`. */
export interface SaveGrantRequest {
  title: string;
  summary: string;
  description: string;
  category: string;
  fundingMinorUnits: number;
  fundingMinimumMinorUnits: number | null;
  currency: string;
  countryCodes: string[];
  opensAt: string | null;
  deadlineAt: string | null;
  minimumStatus: GrantStatusThreshold;
  requiresVerifiedCreator: boolean;
  publish: boolean;
}

/** The fields of an `AdminGrantResponse` the form is opened from. */
export interface GrantFormSource {
  title: string;
  summary: string;
  description: string;
  category: string;
  fundingAmount: { minorUnits: number; currency: string; exponent: number };
  fundingMinimum: { minorUnits: number } | null;
  countryCodes: string[];
  opensAt: string | null;
  deadlineAt: string | null;
  minimumStatus: string;
  requiresVerifiedCreator: boolean;
}

export function emptyGrantForm(): GrantForm {
  return {
    title: '',
    summary: '',
    description: '',
    category: '',
    amount: '',
    minimumAmount: '',
    currency: '',
    countries: '',
    opens: '',
    deadline: '',
    minimumStatus: 'Contributor',
    requiresVerifiedCreator: false,
  };
}

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 10 ** EXPONENT);
}

function parseCountries(text: string): string[] | null {
  const codes = text
    .split(/[,\s]+/)
    .map((code) => code.trim())
    .filter(Boolean);
  if (codes.some((code) => !/^[A-Za-z]{2}$/.test(code))) return null;
  return [...new Set(codes.map((code) => code.toUpperCase()))];
}

/** `YYYY-MM-DD` as a local date, at the start or the end of that day. */
function parseDay(text: string, endOfDay: boolean): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = endOfDay
    ? new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59)
    : new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0);
  return Number.isNaN(date.getTime()) || date.getDate() !== Number(day) ? null : date;
}

function toDay(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** What stops the form being sent, in the words the screen shows. Empty when it can go. */
export function grantFormProblems(form: GrantForm): string[] {
  const problems: string[] = [];
  if (!form.title.trim()) problems.push('Give the grant a title.');
  if (!form.summary.trim()) problems.push('Say in a line what the grant is for.');
  if (!form.description.trim()) problems.push('Describe who it is for and what it funds.');
  if (!form.category.trim()) problems.push('Give it a category, such as community or creators.');

  const amount = parseAmount(form.amount);
  if (amount === null || amount <= 0) problems.push('Say how much the grant awards.');

  if (form.minimumAmount.trim()) {
    const minimum = parseAmount(form.minimumAmount);
    if (minimum === null || minimum <= 0 || (amount !== null && minimum >= amount)) {
      problems.push('The minimum must be below the most the grant awards.');
    }
  }

  if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) {
    problems.push('The currency is a three-letter code, such as NGN or GBP.');
  }
  if (parseCountries(form.countries) === null) {
    problems.push('Countries are two-letter codes, such as NG, GH.');
  }

  const opens = form.opens.trim() ? parseDay(form.opens, false) : undefined;
  const deadline = form.deadline.trim() ? parseDay(form.deadline, true) : undefined;
  if (opens === null) problems.push('Write the opening as a date, such as 2026-11-30.');
  if (deadline === null) problems.push('Write the deadline as a date, such as 2026-12-31.');
  if (opens && deadline && deadline <= opens) problems.push('The deadline is after the opening.');

  return problems;
}

/** The request for a form `grantFormProblems` passed. */
export function toSaveGrantRequest(form: GrantForm, options: { publish: boolean }): SaveGrantRequest {
  return {
    title: form.title.trim(),
    summary: form.summary.trim(),
    description: form.description.trim(),
    category: form.category.trim().toLowerCase(),
    fundingMinorUnits: parseAmount(form.amount) ?? 0,
    fundingMinimumMinorUnits: form.minimumAmount.trim() ? parseAmount(form.minimumAmount) : null,
    currency: form.currency.trim().toUpperCase(),
    countryCodes: parseCountries(form.countries) ?? [],
    opensAt: form.opens.trim() ? (parseDay(form.opens, false)?.toISOString() ?? null) : null,
    deadlineAt: form.deadline.trim() ? (parseDay(form.deadline, true)?.toISOString() ?? null) : null,
    minimumStatus: form.minimumStatus,
    requiresVerifiedCreator: form.requiresVerifiedCreator,
    publish: options.publish,
  };
}

/** The form for an existing grant. */
export function grantFormFrom(grant: GrantFormSource): GrantForm {
  const whole = (minor: number) => {
    const value = minor / 10 ** EXPONENT;
    return Number.isInteger(value) ? String(value) : value.toFixed(EXPONENT);
  };
  const status = GRANT_STATUS_THRESHOLDS.find((entry) => entry.value === grant.minimumStatus);

  return {
    title: grant.title,
    summary: grant.summary,
    description: grant.description,
    category: grant.category,
    amount: whole(grant.fundingAmount.minorUnits),
    minimumAmount: grant.fundingMinimum ? whole(grant.fundingMinimum.minorUnits) : '',
    currency: grant.fundingAmount.currency,
    countries: grant.countryCodes.join(', '),
    opens: toDay(grant.opensAt),
    deadline: toDay(grant.deadlineAt),
    minimumStatus: status?.value ?? 'Contributor',
    requiresVerifiedCreator: grant.requiresVerifiedCreator,
  };
}
