/**
 * The job card reads the card a job list sends (RMD-009, 24 Nov 2026).
 *
 * `JobCard` read every row through `any`: the wire's names first, then a
 * pre-backend fixture's (`employer`, `location`, `benefitsFlags`, `urgency`,
 * `expiresAt`, `salary.currency`). It is typed as `JobCardResponse` now, and
 * these render it from that record, typed as it, the way `GET /jobs`, an
 * employer's jobs and similar jobs all send it.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { JobCard } from '../JobCard';
import { describeSalary } from '@/lib/api/job-detail-api';
import type { JobCardResponse } from '@/types/jobs-hiring';

jest.mock('@/store/saved', () => ({
  useSavedStore: () => ({ save: jest.fn(), unsave: jest.fn(), isSaved: () => false }),
}));

const JOB_ID = '0198f0aa-1111-4444-8888-777766665555';

function card(overrides: Partial<JobCardResponse> = {}): JobCardResponse {
  return {
    jobId: JOB_ID,
    slug: 'line-cook-curepipe',
    title: 'Line cook',
    summary: 'Evening shifts in a busy kitchen.',
    employerId: '0198f0aa-2222-4444-8888-777766665555',
    employerName: 'Chez Mensah',
    employerLogoMediaId: null,
    isEmployerVerified: false,
    isIntermediary: false,
    categoryKey: 'hospitality',
    jobType: 'FullTime',
    experienceLevel: 'Junior',
    countryCode: 'MU',
    locationLabel: 'Curepipe',
    latitude: null,
    longitude: null,
    workplaceType: 'OnSite',
    isRemote: false,
    offersVisaSponsorship: false,
    offersRelocationAssistance: false,
    salary: {
      isDisclosed: true,
      minimum: 15000,
      maximum: 20000,
      currencyCode: 'MUR',
      period: 'Monthly',
      isNegotiable: false,
      isUnpaid: false,
    },
    tags: [],
    skills: [],
    status: 'Published',
    isFeatured: false,
    isVerified: false,
    publishedAt: '2026-11-20T09:00:00Z',
    closingAt: null,
    applicationCount: 0,
    hasApplied: false,
    isSaved: false,
    canManage: false,
    recommendationReason: null,
    ...overrides,
  };
}

function renderCard(job: JobCardResponse, variant: 'list' | 'featured' = 'list') {
  // No theme provider: neither the card nor its trust badge reads the theme,
  // and the provider's async preference load only adds act() warnings.
  return render(<JobCard job={job} variant={variant} />);
}

beforeEach(() => jest.mocked(router.push).mockClear());

describe('a job card, from the card the route sends', () => {
  it.each(['list', 'featured'] as const)('names the employer and the place (%s)', (variant) => {
    renderCard(card(), variant);

    expect(screen.getByText(/Chez Mensah/)).toBeTruthy();
    expect(screen.getByText(/Curepipe/)).toBeTruthy();
  });

  it.each(['list', 'featured'] as const)('says the pay as the job page says it (%s)', (variant) => {
    const job = card();
    renderCard(job, variant);

    const pay = describeSalary(job.salary);
    expect(pay).toMatch(/15,000/);
    expect(screen.getByText(pay)).toBeTruthy();
  });

  it('says an undisclosed salary was not given, rather than showing a figure', () => {
    const job = card({
      salary: { isDisclosed: false, minimum: null, maximum: null, currencyCode: null, period: null, isNegotiable: false, isUnpaid: false },
    });
    renderCard(job);

    expect(screen.getByText(describeSalary(job.salary))).toBeTruthy();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it('words the job type as the job page does', () => {
    renderCard(card());

    expect(screen.getByText('Full time')).toBeTruthy();
  });

  it('counts down to the closing date the card sends', () => {
    renderCard(card({ closingAt: '2020-01-01T00:00:00Z' }));

    expect(screen.getByText('Expired')).toBeTruthy();
  });

  it('shows no countdown for a posting with no closing date', () => {
    renderCard(card({ closingAt: null }));

    expect(screen.queryByText(/Expire/)).toBeNull();
  });

  it('offers the poster their posting, and tells a member they applied', () => {
    const { unmount } = renderCard(card({ canManage: true }));
    expect(screen.getByText('Manage')).toBeTruthy();
    unmount();

    renderCard(card({ hasApplied: true }));
    expect(screen.getByText('Applied')).toBeTruthy();
  });

  it('asks for interest in a simple job', () => {
    renderCard(card({ postingMode: 'Simple', vacancyCount: 3, remainingVacancies: 2 }));

    expect(screen.getByText("I'm interested")).toBeTruthy();
    expect(screen.getByText(/2 of 3 places left/)).toBeTruthy();
  });

  it('opens the posting it stands for', () => {
    renderCard(card());

    fireEvent.press(screen.getByText('Line cook'));

    expect(router.push).toHaveBeenCalledWith(`/job/${JOB_ID}`);
  });
});
