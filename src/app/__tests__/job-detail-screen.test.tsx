/**
 * The job page, as each reader meets it — 15 Sep 2026.
 *
 * Found by applying to the walkthrough's test job: its page said "Employer
 * (Community Member)", pay " /mo" and location "Unknown", recognised no owner,
 * and offered no way to close a job. These tests render the page against the
 * server's `JobResponse` and check what a candidate, an applicant and the
 * employer's own team each see and can do.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemeProvider } from '@/design-system';
import type { JobResponse } from '@/types/jobs-hiring';

const mockUseJob = jest.fn();
const mockManage = {
  publish: jest.fn(),
  close: jest.fn(),
  archive: jest.fn(),
  fillPlace: jest.fn(),
  isWorking: false,
  errorMessage: () => 'This job is already closed.',
};
const mockShowAlert = jest.fn();
const mockApply = jest.fn();
const mockOpenConversation = jest.fn();
const mockExpressInterest = jest.fn();

jest.mock('@/hooks/job-detail', () => ({
  useJob: () => mockUseJob(),
  useSimilarJobs: () => [],
  useManageJob: () => mockManage,
  useExpressInterest: () => ({ express: mockExpressInterest, isSending: false }),
}));

jest.mock('@/hooks/jobs-hiring', () => ({
  useApplyToJob: () => ({ apply: mockApply, isApplying: false }),
}));

jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: mockShowAlert }),
}));

jest.mock('@/lib/job-postings-api', () => ({
  ...jest.requireActual('@/lib/job-postings-api'),
  fetchJobCategories: () => Promise.resolve([{ key: 'hospitality', name: 'Hospitality', order: 1, isActive: true }]),
}));

jest.mock('@/lib/conversation-hub', () => ({
  ConversationHub: { openOrCreateConversation: (...args: unknown[]) => mockOpenConversation(...args) },
}));

jest.mock('@/lib/analytics/content-events', () => ({ trackContentViewed: jest.fn() }));
jest.mock('@/store/saved', () => ({
  useSavedStore: () => ({ save: jest.fn(), unsave: jest.fn(), isSaved: () => false }),
}));
jest.mock('@/components/monetization', () => ({ PromoteEntry: () => null }));
jest.mock('@/components/ReportModal', () => ({ ReportModal: () => null }));
jest.mock('@/hooks/usePullToRefresh', () => ({ useRefreshControl: () => undefined }));
jest.mock('@/components/layout/bottom-inset', () => ({ useBottomInset: () => 0 }));

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

// eslint-disable-next-line import/first
import JobDetailScreen from '../job/[id]';

const JOB = '01a0a162-7d03-7a7f-a613-9fe144d60657';
const DAVID = '01a05770-33f2-7600-8000-0000000000da';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** The walkthrough's test job, as `GET /jobs/{id}` served it on 14 Sep 2026. */
function walkthroughJob(overrides: Partial<JobResponse> = {}): JobResponse {
  return {
    jobId: JOB,
    slug: 'walkthrough-test-job-please-ignore',
    title: 'Walkthrough test job - please ignore',
    summary: 'Test posting for the two account walkthrough.',
    description: 'Test posting for the two account walkthrough on 14 Sep 2026. Please do not apply',
    employer: {
      employerId: '01a0a15f-1c2e-7b44-9d10-6f0e2a4b8c11',
      ownerUserId: DAVID,
      slug: 'walkthrough-test-employer',
      displayName: 'Walkthrough Test Employer',
      organizationType: 'Individual',
      isIntermediary: false,
      companySize: 'Unspecified',
      countryCode: 'MU',
      isVerified: false,
    },
    categoryKey: 'hospitality',
    jobType: 'PartTime',
    experienceLevel: 'Entry',
    educationLevel: 'None',
    tags: [],
    skills: [],
    // Objects on the wire. The old page rendered these directly, which throws.
    responsibilities: [{ lineId: 'l1', text: 'Greet guests at the door', isEssential: false }],
    requirements: [{ lineId: 'l2', text: 'Weekend availability', isEssential: true }],
    benefits: [],
    location: { countryCode: 'MU', cityName: 'Rose Hill', displayName: 'Rose Hill' },
    workArrangement: { workplaceType: 'OnSite', isRemote: false, offersVisaSponsorship: false, offersRelocationAssistance: false },
    salary: { isDisclosed: true, minimum: 15000, maximum: null, currencyCode: 'MUR', period: 'Monthly', isNegotiable: false, isUnpaid: false },
    status: 'Open',
    visibility: 'Public',
    isFeatured: false,
    isVerified: false,
    vacancyCount: 1,
    remainingVacancies: 1,
    requiresResume: false,
    publishedAt: '2026-09-14T16:26:00.000Z',
    closingAt: null,
    closureReason: null,
    media: [],
    providers: [],
    guides: [],
    screeningQuestions: [],
    engagement: { viewCount: 3, applicationCount: 1, saveCount: 0 },
    revision: 3,
    hasApplied: false,
    isSaved: false,
    canApply: true,
    canManage: false,
    ...overrides,
  };
}

function givenJob(job: JobResponse | null, state: Partial<{ isLoading: boolean; isNotFound: boolean; loadError: string | null }> = {}) {
  const refresh = jest.fn();
  mockUseJob.mockReturnValue({ job, isLoading: false, isNotFound: false, loadError: null, refresh, ...state });
  return refresh;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <JobDetailScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/** The alert most recently shown, and a way to press one of its buttons. */
function lastAlert() {
  const options = mockShowAlert.mock.calls[mockShowAlert.mock.calls.length - 1][0] as {
    title: string;
    message: string;
    buttons?: { text: string; onPress?: () => unknown }[];
  };
  return {
    ...options,
    press: (text: string) => options.buttons?.find((button) => button.text === text)?.onPress?.(),
    buttonTexts: (options.buttons ?? []).map((button) => button.text),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: JOB });
});

describe('a candidate reading the walkthrough job', () => {
  it('shows who is hiring, where, and for what pay — as the server sent them', () => {
    givenJob(walkthroughJob());
    renderPage();

    expect(screen.getAllByText('Walkthrough Test Employer').length).toBeGreaterThan(0);
    expect(screen.getByText('MUR 15,000 a month')).toBeTruthy();
    expect(screen.getByText('Rose Hill, Mauritius · On site')).toBeTruthy();
    expect(screen.getByText('Taking applications')).toBeTruthy();
    expect(screen.getByText('Greet guests at the door')).toBeTruthy();
    expect(screen.getByText(/Weekend availability/)).toBeTruthy();

    expect(screen.queryByText(/Community Member/)).toBeNull();
    expect(screen.queryByText(/Unknown/)).toBeNull();
    expect(screen.queryByText(/\/mo\b/)).toBeNull();
    expect(screen.queryByText(/Accommodation|Meals Provided|Transport Provided/)).toBeNull();
  });

  it('applies through the confirmation, and says it was sent only once the server said so', async () => {
    givenJob(walkthroughJob());
    mockApply.mockResolvedValue({ applicationId: 'a1' });
    renderPage();

    fireEvent.press(screen.getByText('Apply now'));
    const confirm = lastAlert();
    expect(confirm.title).toBe('Apply for this job?');

    await confirm.press('Apply now');

    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(lastAlert().title).toBe('Application Sent');
    expect(lastAlert().message).toContain('Walkthrough Test Employer');
  });

  it('messages the member who owns the employer — never the employer’s id', () => {
    givenJob(walkthroughJob());
    renderPage();

    fireEvent.press(screen.getByText('Message the employer'));

    expect(mockOpenConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: DAVID,
        recipientName: 'Walkthrough Test Employer',
        entitySubtitle: 'Walkthrough Test Employer · Rose Hill, Mauritius',
      })
    );
  });

  it('opens the employer’s profile by the employer’s own id', () => {
    givenJob(walkthroughJob());
    renderPage();

    fireEvent.press(screen.getByLabelText("Walkthrough Test Employer. Opens the employer's profile."));
    expect(router.push).toHaveBeenCalledWith('/employer/01a0a15f-1c2e-7b44-9d10-6f0e2a4b8c11');

    fireEvent.press(screen.getByText('See their profile and open jobs ›'));
    expect(router.push).toHaveBeenLastCalledWith('/employer/01a0a15f-1c2e-7b44-9d10-6f0e2a4b8c11');
  });

  it('shows an application already made instead of a second Apply', () => {
    givenJob(walkthroughJob({ hasApplied: true }));
    renderPage();

    expect(screen.getByText('You have applied to this job')).toBeTruthy();
    expect(screen.queryByText('Apply now')).toBeNull();
  });

  it('says why a closed job cannot be applied to', () => {
    givenJob(walkthroughJob({ status: 'Expired', canApply: false, closureReason: 'We are no longer hiring for this role.' }));
    renderPage();

    expect(screen.getByText('Not taking applications')).toBeTruthy();
    expect(screen.getAllByText('We are no longer hiring for this role.').length).toBeGreaterThan(0);
    expect(screen.queryByText('Apply now')).toBeNull();
  });
});

describe('the employer’s team reading their own job', () => {
  it('recognises the owner from the server’s canManage, and offers management instead of Apply', () => {
    givenJob(walkthroughJob({ canManage: true }));
    renderPage();

    expect(screen.getByText('Your job')).toBeTruthy();
    expect(screen.getByText('See applicants')).toBeTruthy();
    // The posting's own view and save counters are never incremented, so the
    // page links to the measured figures instead of printing zeros.
    expect(screen.queryByText('Views')).toBeNull();
    expect(screen.queryByText('Saves')).toBeNull();
    fireEvent.press(screen.getByText('How this job is doing ›'));
    expect(router.push).toHaveBeenCalledWith(`/analytics/content/job/${JOB}`);
    expect(screen.getByText('Close to applications')).toBeTruthy();
    expect(screen.getByText('Remove from Diaspora')).toBeTruthy();
    expect(screen.queryByText('Apply now')).toBeNull();
    expect(screen.queryByText('Message the employer')).toBeNull();
  });

  it('closes the job with the outcome the owner picks, and confirms it only after the server did', async () => {
    givenJob(walkthroughJob({ canManage: true }));
    mockManage.close.mockResolvedValue(undefined);
    renderPage();

    fireEvent.press(screen.getByText('Close to applications'));
    const choice = lastAlert();
    expect(choice.buttonTexts).toEqual(['Keep it open', 'Someone was hired', 'No longer hiring']);

    choice.press('No longer hiring');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockManage.close).toHaveBeenCalledWith('withdrawn');
    expect(lastAlert().title).toBe('Job closed');
  });

  it('reports a refused close as nothing changed', async () => {
    givenJob(walkthroughJob({ canManage: true }));
    mockManage.close.mockRejectedValue({ response: { status: 409 } });
    renderPage();

    fireEvent.press(screen.getByText('Close to applications'));
    lastAlert().press('Someone was hired');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockManage.close).toHaveBeenCalledWith('filled');
    expect(lastAlert().title).toBe('Nothing was changed');
  });

  it('removes a job only after a destructive confirmation', async () => {
    givenJob(walkthroughJob({ canManage: true }));
    mockManage.archive.mockResolvedValue(undefined);
    renderPage();

    fireEvent.press(screen.getByText('Remove from Diaspora'));
    expect(mockManage.archive).not.toHaveBeenCalled();

    lastAlert().press('Remove');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockManage.archive).toHaveBeenCalledTimes(1);
    expect(lastAlert().title).toBe('Job removed');
  });

  it('offers only removal on a job that is already closed', () => {
    givenJob(walkthroughJob({ canManage: true, status: 'Expired', canApply: false }));
    renderPage();

    expect(screen.queryByText('Close to applications')).toBeNull();
    expect(screen.getByText('Remove from Diaspora')).toBeTruthy();
  });
});

describe('a read that did not arrive', () => {
  it('is a failure with a way to try again — not a job that has gone', () => {
    const refresh = givenJob(null, { loadError: 'We could not reach the jobs service just now.' });
    renderPage();

    expect(screen.getByText('We could not load this job')).toBeTruthy();
    expect(screen.queryByText('This job is not available')).toBeNull();

    fireEvent.press(screen.getByText('Try again'));
    expect(refresh).toHaveBeenCalled();
  });

  it('says a job is not available only when the platform said so', () => {
    givenJob(null, { isNotFound: true });
    renderPage();

    expect(screen.getByText('This job is not available')).toBeTruthy();
  });
});

// Simple jobs (owner's request, 4 Nov 2026): one-off work answered with
// "I'm interested", which messages the poster; the poster counts places off.
describe('a simple job', () => {
  const simpleJob = (overrides: Partial<JobResponse> = {}) =>
    walkthroughJob({
      title: 'Two cleaners needed',
      postingMode: 'Simple',
      startsOn: '2026-11-12',
      lengthAmount: 1,
      lengthUnit: 'Days',
      vacancyCount: 2,
      remainingVacancies: 2,
      ...overrides,
    });

  beforeEach(() => {
    mockExpressInterest.mockReset();
    mockManage.fillPlace.mockReset();
    mockShowAlert.mockReset();
  });

  it(`says when the work is and how many places are left, and offers "I'm interested", not Apply`, () => {
    givenJob(simpleJob());
    renderPage();

    expect(screen.getByText('12 Nov · 1 day')).toBeTruthy();
    expect(screen.getAllByText('2 of 2 places left').length).toBeGreaterThan(0);
    expect(screen.getByText("I'm interested")).toBeTruthy();
    expect(screen.queryByText('Apply now')).toBeNull();
  });

  it('sends the interest when tapped', () => {
    mockExpressInterest.mockResolvedValue(undefined);
    givenJob(simpleJob());
    renderPage();

    fireEvent.press(screen.getByText("I'm interested"));

    expect(mockExpressInterest).toHaveBeenCalledTimes(1);
  });

  it('after saying it, takes the member back to the conversation', () => {
    givenJob(simpleJob({ hasApplied: true }));
    renderPage();

    expect(screen.getByText('You said you are interested')).toBeTruthy();
    fireEvent.press(screen.getByText('Open messages'));
    expect(mockOpenConversation).toHaveBeenCalledWith(
      expect.objectContaining({ contextType: 'JobOpportunity', entityId: JOB })
    );
  });

  it('lets the poster count a place off, and says when it is the last', async () => {
    mockManage.fillPlace.mockResolvedValue(undefined);
    givenJob(simpleJob({ canManage: true, canApply: false, remainingVacancies: 1 }));
    renderPage();

    fireEvent.press(screen.getByText('1 place filled'));

    const confirm = lastAlert();
    expect(confirm.message).toContain('last place');
    await confirm.press('1 place filled');
    expect(mockManage.fillPlace).toHaveBeenCalledTimes(1);
  });

  it('keeps Apply for a full posting', () => {
    givenJob(walkthroughJob());
    renderPage();

    expect(screen.getByText('Apply now')).toBeTruthy();
    expect(screen.queryByText("I'm interested")).toBeNull();
  });
});

describe('the page source', () => {
  const source = fs
    .readFileSync(path.join(process.cwd(), 'src', 'app', 'job', '[id].tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('reads nothing from the fixture-era shape', () => {
    expect(source).not.toMatch(
      /providerId|benefitsFlags|areaName|reputationLevel|Community Member|contactPhone|contactEmail|MapPreviewCard/
    );
    // `'JobOpportunity'` survives only as the conversation context's name.
    expect(source).not.toMatch(/@\/types\/job'/);
  });

  it('decides ownership by the server’s answer, and reads through the adapter', () => {
    expect(source).toContain('job.canManage');
    expect(source).not.toMatch(/apiClient/);
    expect(source).not.toMatch(/userId\s*===|===\s*user\?\.userId/);
  });
});
