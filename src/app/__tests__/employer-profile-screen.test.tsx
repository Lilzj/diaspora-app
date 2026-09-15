/**
 * The employer profile, as each reader meets it — 15 Sep 2026.
 *
 * The page called `GET /employers/{id}`, a route no module serves, so it never
 * loaded for anyone; when it did render (from a development fixture) it showed a
 * star rating, followers and "Community Verified", none of which exist. These
 * tests render it against the server's `EmployerResponse`.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemeProvider } from '@/design-system';
import type { EmployerResponse, JobCardResponse } from '@/types/jobs-hiring';

const mockProfile = jest.fn();
const mockJobs = jest.fn();

jest.mock('@/hooks/employer-profile', () => ({
  useEmployerProfile: () => mockProfile(),
  useEmployerJobs: () => mockJobs(),
}));
jest.mock('@/hooks/usePullToRefresh', () => ({ useRefreshControl: () => undefined }));
jest.mock('@/store/saved', () => ({
  useSavedStore: () => ({ save: jest.fn(), unsave: jest.fn(), isSaved: () => false }),
}));

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

// eslint-disable-next-line import/first
import EmployerProfileScreen from '../employer/[id]';

const EMPLOYER = '01a05770-33f2-7637-af0e-2e1ccb4f5890';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** What production served an anonymous reader for Okonkwo Consulting Mauritius on 15 Sep 2026. */
function okonkwo(overrides: Partial<EmployerResponse> = {}): EmployerResponse {
  return {
    employerId: EMPLOYER,
    slug: 'okonkwo-consulting-mauritius',
    displayName: 'Okonkwo Consulting Mauritius',
    organizationType: 'Company',
    isIntermediary: false,
    companySize: 'Unspecified',
    countryCode: 'MU',
    status: 'Active',
    isVerified: false,
    hiringRegions: [],
    members: null,
    responsiveness: { averageResponseHours: null, ghostingRate: null, offerAcceptanceRate: null, decidedCount: 0 },
    openJobCount: 2,
    registeredAt: '2026-08-31T10:49:26.374887+00:00',
    revision: 0,
    viewerRole: null,
    ...overrides,
  };
}

function card(jobId: string, title: string): JobCardResponse {
  return {
    jobId,
    slug: jobId,
    title,
    summary: '',
    employerId: EMPLOYER,
    employerName: 'Okonkwo Consulting Mauritius',
    isEmployerVerified: false,
    isIntermediary: false,
    categoryKey: 'healthcare',
    jobType: 'FullTime',
    experienceLevel: 'Junior',
    countryCode: 'MU',
    locationLabel: 'Curepipe',
    workplaceType: 'OnSite',
    isRemote: false,
    offersVisaSponsorship: true,
    offersRelocationAssistance: false,
    salary: { isDisclosed: false, isNegotiable: false, isUnpaid: false },
    tags: [],
    skills: [],
    status: 'ReceivingApplications',
    isFeatured: false,
    isVerified: false,
    applicationCount: 0,
  };
}

function given(
  profile: Partial<{ employer: EmployerResponse | null; isLoading: boolean; isNotFound: boolean; loadError: string | null }>,
  jobs: Partial<{ jobs: JobCardResponse[]; isLoading: boolean; error: string | null; hasMore: boolean }> = {}
) {
  const refresh = jest.fn();
  const jobsRefresh = jest.fn();
  mockProfile.mockReturnValue({ employer: null, isLoading: false, isNotFound: false, loadError: null, refresh, ...profile });
  mockJobs.mockReturnValue({
    jobs: [],
    isLoading: false,
    error: null,
    hasMore: false,
    isFetchingMore: false,
    loadMore: jest.fn(),
    refresh: jobsRefresh,
    ...jobs,
  });
  return { refresh, jobsRefresh };
}

function renderPage() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <EmployerProfileScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: EMPLOYER });
});

describe('a candidate reading an employer', () => {
  it('shows who the employer is and what they are hiring for, from the server', () => {
    given(
      { employer: okonkwo() },
      { jobs: [card('j1', 'Care assistant, Curepipe'), card('j2', 'Front-of-house team member, Port Louis')] }
    );
    renderPage();

    expect(screen.getByRole('header', { name: 'Okonkwo Consulting Mauritius' })).toBeTruthy();
    expect(screen.getByText('Company · Mauritius')).toBeTruthy();
    expect(screen.getByText('Not verified by Diaspora')).toBeTruthy();
    expect(screen.getByText('On Diaspora since Aug 2026')).toBeTruthy();
    expect(screen.getByText('2 open jobs')).toBeTruthy();
    expect(screen.getByText('Care assistant, Curepipe')).toBeTruthy();
    expect(screen.getByText('Front-of-house team member, Port Louis')).toBeTruthy();
    expect(screen.getByText(/Not enough applications yet/)).toBeTruthy();

    // The fixture's inventions.
    expect(screen.queryByText(/Rating|Followers|Community Verified|Reputation/)).toBeNull();
    // What only the team may see.
    expect(screen.queryByText('Your employer')).toBeNull();
    expect(screen.queryByText('See applicants')).toBeNull();
  });

  it('names a verification the platform granted, in its own words', () => {
    given({ employer: okonkwo({ isVerified: true, verificationBadge: 'Verified business' }) });
    renderPage();

    expect(screen.getByText('✓ Verified employer')).toBeTruthy();
    expect(screen.getByText('Verified business')).toBeTruthy();
    expect(screen.queryByText('Not verified by Diaspora')).toBeNull();
  });

  it('prints a response record only once there is one', () => {
    given({
      employer: okonkwo({
        responsiveness: { averageResponseHours: 30, ghostingRate: 0.25, offerAcceptanceRate: null, decidedCount: 40 },
      }),
    });
    renderPage();

    expect(screen.getByText('Usually replies within a day.')).toBeTruthy();
    expect(screen.getByText('Leaves 25% of applications unanswered.')).toBeTruthy();
    expect(screen.getByText('Measured by Diaspora from 40 decided applications.')).toBeTruthy();
  });

  it('keeps the profile when only the jobs failed to load', () => {
    const { jobsRefresh } = given({ employer: okonkwo() }, { error: 'We could not reach the jobs service just now.' });
    renderPage();

    expect(screen.getByText('Okonkwo Consulting Mauritius')).toBeTruthy();
    expect(screen.getByText('We could not load this employer’s jobs.')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(jobsRefresh).toHaveBeenCalled();
  });
});

describe('the employer’s own team', () => {
  it('sees their role, what only they are shown, and the ways into hiring', () => {
    given({ employer: okonkwo({ viewerRole: 'Owner', legalName: 'Okonkwo Consulting Ltd', members: [] }) });
    renderPage();

    expect(screen.getByText('You are an owner of Okonkwo Consulting Mauritius.')).toBeTruthy();
    expect(screen.getByText(/Registered as Okonkwo Consulting Ltd/)).toBeTruthy();

    fireEvent.press(screen.getByText('See applicants'));
    expect(router.push).toHaveBeenCalledWith('/job/hiring');
    fireEvent.press(screen.getByText('Post a job'));
    expect(router.push).toHaveBeenCalledWith('/job/create');
  });
});

describe('when the profile cannot be shown', () => {
  it('says a failed read failed, with a way to try again', () => {
    const { refresh } = given({ loadError: 'We could not reach the jobs service just now.' });
    renderPage();

    expect(screen.getByText('We could not load this employer')).toBeTruthy();
    expect(screen.queryByText('This employer is not on Diaspora')).toBeNull();
    fireEvent.press(screen.getByText('Try again'));
    expect(refresh).toHaveBeenCalled();
  });

  it('says an employer is not on Diaspora only when the platform said so', () => {
    given({ isNotFound: true });
    renderPage();

    expect(screen.getByText('This employer is not on Diaspora')).toBeTruthy();
  });
});

describe('the page source', () => {
  const source = fs
    .readFileSync(path.join(process.cwd(), 'src', 'app', 'employer', '[id].tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  it('reads through the adapter, not a route nobody wrote', () => {
    expect(source).toContain('useEmployerProfile');
    expect(source).not.toMatch(/apiClient|['`]\/employers\//);
  });

  it('carries nothing from the fixture shape', () => {
    expect(source).not.toMatch(/providerId|reputationLevel|followerCount|rating|JobOpportunity/);
  });
});
