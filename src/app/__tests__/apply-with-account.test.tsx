/**
 * Applying with an account, and the work profile behind it — 14 Sep 2026.
 *
 * The product owner watched a member tap Apply and be told to "create your
 * profile first", and asked which profile: a signed-in member already has one.
 * The one the app wanted was the Jobs candidate profile, whose headline the
 * apply route required. Now the server creates that profile with a first
 * application, and the employer sees the applicant by their account.
 *
 * What the screens must do about it:
 *
 *   1. **The work profile reads what is stored and saves it back whole.** It
 *      started blank and its whole-document save wiped the stored profile,
 *      including a salary expectation it never showed.
 *   2. **The headline is optional.** Saving with none is a save, not an error.
 *   3. **A failed read is not "no profile".** It must not offer a create.
 *   4. **The employer's row names the applicant**, not their headline.
 *   5. **The apply flow promises only what an application carries**, and no
 *      longer sends anyone to make a profile first.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import type { CandidateProfileResponse } from '@/types/jobs-hiring';

const mockProfileHook = jest.fn();
const mockShowAlert = jest.fn();

jest.mock('@/hooks/jobs-hiring', () => ({
  ...jest.requireActual('@/hooks/jobs-hiring'),
  useCandidateProfile: () => mockProfileHook(),
}));

jest.mock('@/providers/notification-provider', () => ({
  ...jest.requireActual('@/providers/notification-provider'),
  useNotification: () => ({ showAlert: mockShowAlert }),
}));

jest.mock('@/components/layout/bottom-inset', () => ({ useBottomInset: () => 0 }));

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

// eslint-disable-next-line import/first
import CandidateProfileScreen, { wholeDocument } from '../job/candidate-profile';
// eslint-disable-next-line import/first
import { applicantLabel } from '../job/hiring';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** The profile David's first application made on 14 Sep 2026, with a salary expectation on it. */
function storedProfile(overrides: Partial<CandidateProfileResponse> = {}): CandidateProfileResponse {
  return {
    candidateId: '01a05771-0000-7000-8000-000000000001',
    userId: '01a05771-0000-7000-8000-0000000000aa',
    headline: null,
    summary: null,
    countryCode: 'MU',
    cityName: 'Rose Hill',
    experienceLevel: 'Mid',
    highestEducation: 'None',
    remotePreference: 'Flexible',
    noticePeriodDays: 30,
    isOpenToWork: true,
    visibility: 'Private',
    salaryExpectation: { minimum: 25000, currencyCode: 'MUR', period: 'Monthly', isFlexible: true },
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    languages: [],
    workAuthorizations: [],
    preferredLocations: [],
    portfolio: [],
    completenessPercent: 0,
    revision: 3,
    ...overrides,
  } as CandidateProfileResponse;
}

function givenProfileHook(overrides: Record<string, unknown> = {}) {
  const hook = {
    profile: null,
    isLoading: false,
    loadError: null,
    refresh: jest.fn(),
    create: jest.fn().mockResolvedValue(storedProfile()),
    update: jest.fn().mockResolvedValue(storedProfile()),
    setVisibility: jest.fn().mockResolvedValue(undefined),
    isSaving: false,
    error: null,
    ...overrides,
  };
  mockProfileHook.mockReturnValue(hook);
  return hook;
}

function renderWorkProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <CandidateProfileScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/** A source file with comments stripped, so a guard reads code rather than prose. */
function code(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

beforeEach(() => {
  mockProfileHook.mockReset();
  mockShowAlert.mockReset();
});

describe('the work profile', () => {
  it('starts from the stored profile rather than from blank boxes', () => {
    givenProfileHook({ profile: storedProfile({ headline: 'Care assistant, 3 years' }) });
    renderWorkProfile();

    expect(screen.getByDisplayValue('Care assistant, 3 years')).toBeTruthy();
    expect(screen.getByDisplayValue('Rose Hill')).toBeTruthy();
    expect(screen.getByDisplayValue('30')).toBeTruthy();
  });

  it('saves a profile with no headline, sending everything else back as stored', async () => {
    const hook = givenProfileHook({ profile: storedProfile() });
    renderWorkProfile();

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(hook.update).toHaveBeenCalledTimes(1));
    const request = hook.update.mock.calls[0][0];

    expect(request.headline).toBeNull();
    expect(request.cityName).toBe('Rose Hill');
    // Not on the form, and a whole-document save clears what it is not sent.
    expect(request.expectedSalaryMinimum).toBe(25000);
    expect(request.expectedSalaryCurrency).toBe('MUR');
    expect(request.baseRevision).toBe(3);
    expect(mockShowAlert).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('creates one for a member who has none, and asks for nothing first', async () => {
    const hook = givenProfileHook({ profile: null });
    renderWorkProfile();

    expect(screen.getByText(/You can apply for jobs without filling this in/)).toBeTruthy();

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(hook.create).toHaveBeenCalledTimes(1));
    expect(hook.create.mock.calls[0][0]).toEqual({
      headline: null,
      summary: null,
      countryCode: null,
      cityName: null,
    });
  });

  it('does not offer to create a profile when the read failed', () => {
    givenProfileHook({ profile: null, loadError: 'We could not reach the jobs service just now.' });
    renderWorkProfile();

    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('marks the visibility that is stored', () => {
    givenProfileHook({ profile: storedProfile({ visibility: 'Members' }) });
    renderWorkProfile();

    expect(screen.getByText(/Members\s+✓/)).toBeTruthy();
    expect(screen.queryByText(/Private\s+✓/)).toBeNull();
  });
});

describe('wholeDocument', () => {
  it('keeps the salary expectation and open-to-work flag the form never shows', () => {
    const request = wholeDocument(storedProfile({ isOpenToWork: false }), {
      headline: '  ',
      summary: '',
      countryCode: 'mu',
      cityName: ' Curepipe ',
      experienceLevel: 'Senior',
      remotePreference: 'RemoteOnly',
      noticePeriodDays: '',
    });

    expect(request).toMatchObject({
      headline: null,
      countryCode: 'MU',
      cityName: 'Curepipe',
      experienceLevel: 'Senior',
      noticePeriodDays: null,
      expectedSalaryMinimum: 25000,
      expectedSalaryPeriod: 'Monthly',
      expectedSalaryFlexible: true,
      isOpenToWork: false,
    });
  });
});

describe('the employer’s applicant row', () => {
  it('names the applicant from their account', () => {
    expect(applicantLabel({ applicantName: 'David Mensah' })).toBe('David Mensah');
  });

  it('falls back to "Applicant" only when the account cannot be named — never to a headline', () => {
    expect(applicantLabel({ applicantName: null })).toBe('Applicant');
    expect(applicantLabel({ applicantName: '   ' })).toBe('Applicant');
  });
});

describe('the apply flow', () => {
  const detail = code('src', 'app', 'job', '[id].tsx');

  it('no longer sends a member away to make a profile before applying', () => {
    expect(detail).not.toContain('Create your profile first');
    expect(detail).not.toContain('isNotCandidateError');
  });

  it('promises only what an application carries', () => {
    expect(detail).not.toMatch(/residency and community profile details/);
    expect(detail).toMatch(/The employer will see your name, whether your Diaspora account is verified/);
  });

  it('leaves a way back to the work profile on the Profile tab', () => {
    expect(code('src', 'app', '(tabs)', 'profile.tsx')).toContain(
      "router.push('/job/candidate-profile')"
    );
  });
});
