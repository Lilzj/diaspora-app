// ─────────────────────────────────────────────────────────────────────────────
// Simple jobs (owner's request, 4 Nov 2026)
//
// "Two cleaners needed in Port Louis, 200 rupees a day, one day." Short one-off
// work did not fit the full posting: four steps, an employer to register first,
// and no start date or length. A simple job is one screen: what, how many
// people, where, the pay, when it starts and how long it lasts. The poster
// needs no employer set up beforehand (one is made in their own name on the
// first post), and a member answers with "I'm interested" rather than an
// application form. "More options" opens the full form with what was typed.
// ─────────────────────────────────────────────────────────────────────────────

import { formatPay } from '@/lib/job-detail-api';
import {
  postJob,
  resolvePostingEmployer,
  type JobPostingForm,
  type PostJobInput,
  type PostJobOutcome,
} from '@/lib/job-postings-api';
import { registerEmployer } from '@/lib/jobs-hiring-api';

export type SimplePayPer = 'Hourly' | 'Daily' | 'Project';
export type SimpleLengthUnit = 'Hours' | 'Days';

export const SIMPLE_PAY_PER: { value: SimplePayPer; label: string }[] = [
  { value: 'Hourly', label: 'Per hour' },
  { value: 'Daily', label: 'Per day' },
  { value: 'Project', label: 'For the job' },
];

export const SIMPLE_LENGTH_UNITS: { value: SimpleLengthUnit; label: string }[] = [
  { value: 'Hours', label: 'Hours' },
  { value: 'Days', label: 'Days' },
];

/** The longest a simple job may run, as the server holds it. */
export const SIMPLE_LENGTH_MAX: Record<SimpleLengthUnit, number> = { Hours: 24, Days: 365 };

export interface SimpleJobForm {
  title: string;
  categoryKey: string | null;
  people: string;
  cityName: string;
  latitude: number | null;
  longitude: number | null;
  payAmount: string;
  payPer: SimplePayPer;
  payCurrency: string;
  /** YYYY-MM-DD. */
  startsOn: string;
  lengthAmount: string;
  lengthUnit: SimpleLengthUnit;
  details: string;
  countryCode: string;
}

export function emptySimpleJobForm(countryCode: string, payCurrency: string, today: string): SimpleJobForm {
  return {
    title: '',
    categoryKey: null,
    people: '1',
    cityName: '',
    latitude: null,
    longitude: null,
    payAmount: '',
    payPer: 'Daily',
    payCurrency,
    startsOn: today,
    lengthAmount: '1',
    lengthUnit: 'Days',
    details: '',
    countryCode,
  };
}

/** Today as YYYY-MM-DD in the member's own calendar. */
export function localDateString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** What the form still needs, by name, for the "Still needed" line. */
export function simpleJobRequirements(form: SimpleJobForm): { label: string; ok: boolean }[] {
  return [
    { label: 'What the job is', ok: form.title.trim().length > 0 },
    { label: 'Kind of work', ok: Boolean(form.categoryKey) },
    { label: 'Where', ok: form.cityName.trim().length > 0 },
    { label: 'Pay', ok: form.payAmount.trim().length > 0 },
    { label: 'Start date', ok: form.startsOn.trim().length > 0 },
    { label: 'Country of residence', ok: form.countryCode.trim().length === 2 },
  ];
}

const wholeNumber = (value: string): number | null => {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
};

/** What is wrong with a field that is filled in, or null. */
export function simpleJobFormProblem(form: SimpleJobForm, today: string): string | null {
  const title = form.title.trim();
  if (title.length < 3 || title.length > 200) {
    return 'Say what the job is in 3 to 200 characters, like "Two cleaners needed".';
  }

  const people = wholeNumber(form.people);
  if (people === null || people < 1 || people > 999) {
    return 'Say how many people you need, from 1 to 999.';
  }

  const pay = Number(form.payAmount.trim().replace(',', '.'));
  if (!Number.isFinite(pay) || pay <= 0) {
    return 'Put the pay as a number above zero.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startsOn) || form.startsOn < today) {
    return 'Pick a start date from today on.';
  }

  const length = wholeNumber(form.lengthAmount);
  const longest = SIMPLE_LENGTH_MAX[form.lengthUnit];
  if (length === null || length < 1 || length > longest) {
    return form.lengthUnit === 'Hours'
      ? 'A job counted in hours lasts 1 to 24 hours.'
      : 'A job counted in days lasts 1 to 365 days.';
  }

  return null;
}

/** "1 day", "4 hours". */
export function describeLength(amount: number, unit: SimpleLengthUnit): string {
  const word = unit === 'Hours' ? 'hour' : 'day';
  return `${amount} ${word}${amount === 1 ? '' : 's'}`;
}

/**
 * The posting's description: what the poster wrote, or, when they wrote
 * nothing, the job in a sentence, because the server keeps a description on
 * every job and a card shows its first line.
 */
export function simpleJobDescription(form: SimpleJobForm): string {
  const details = form.details.trim();
  if (details.length > 0) return details;

  const people = wholeNumber(form.people) ?? 1;
  const length = wholeNumber(form.lengthAmount) ?? 1;
  const pay = formatPay({
    minimum: Number(form.payAmount.trim().replace(',', '.')),
    currency: form.payCurrency,
    period: form.payPer,
  });

  return [
    `${people} ${people === 1 ? 'person' : 'people'} needed in ${form.cityName.trim()}.`,
    `${pay}.`,
    `${describeLength(length, form.lengthUnit)}, starting ${form.startsOn}.`,
  ].join(' ');
}

/** The posting the server is sent: a Temporary, entry-level, on-site Simple job. */
export function toSimplePostInput(form: SimpleJobForm): PostJobInput {
  return {
    title: form.title.trim(),
    description: simpleJobDescription(form),
    categoryKey: form.categoryKey ?? '',
    jobType: 'Temporary',
    experienceLevel: 'Entry',
    countryCode: form.countryCode,
    cityName: form.cityName.trim() || null,
    latitude: form.latitude,
    longitude: form.longitude,
    workplaceType: 'OnSite',
    pay: {
      minimum: Number(form.payAmount.trim().replace(',', '.')),
      currency: form.payCurrency,
      period: form.payPer,
    },
    vacancyCount: wholeNumber(form.people) ?? 1,
    postingMode: 'Simple',
    startsOn: form.startsOn,
    lengthAmount: wholeNumber(form.lengthAmount) ?? 1,
    lengthUnit: form.lengthUnit,
  };
}

/** What "More options" carries into the full form, so nothing typed is lost. */
export function simpleToFullForm(form: SimpleJobForm): Partial<JobPostingForm> {
  return {
    title: form.title,
    categoryKey: form.categoryKey,
    jobType: 'Temporary',
    experienceLevel: 'Entry',
    description: form.details,
    payMinimum: form.payAmount,
    payPeriod: form.payPer,
    vacancies: form.people,
    cityName: form.cityName,
    latitude: form.latitude,
    longitude: form.longitude,
    workplaceType: 'OnSite',
  };
}

/**
 * Posts a simple job. A poster with no employer gets one in their own name
 * (an Individual), because a job on Diaspora belongs to an employer and a
 * one-day cleaning job should not need a company set up first.
 */
export async function postSimpleJob(
  form: SimpleJobForm,
  poster: { displayName: string }
): Promise<PostJobOutcome> {
  const employer = await resolvePostingEmployer();

  const employerId =
    employer.kind === 'one'
      ? employer.employerId
      : (
          await registerEmployer({
            displayName: poster.displayName.trim(),
            organizationType: 'Individual',
            countryCode: form.countryCode,
          })
        ).employerId;

  return postJob(employerId, toSimplePostInput(form));
}
