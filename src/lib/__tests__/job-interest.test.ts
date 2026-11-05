/**
 * "I'm interested" on a simple job (owner's request, 4 Nov 2026): it records
 * the interest on the job and messages the poster, with no CV or profile.
 */
import { expressInterest, interestMessage } from '@/lib/job-interest';
import type { JobResponse } from '@/types/jobs-hiring';

const mockApply = jest.fn();
const mockOpenWithMessage = jest.fn();

jest.mock('@/lib/jobs-hiring-api', () => ({
  ...jest.requireActual('@/lib/jobs-hiring-api'),
  applyToJob: (...args: unknown[]) => mockApply(...args),
}));
jest.mock('@/lib/conversation-hub', () => ({
  ConversationHub: { openWithMessage: (...args: unknown[]) => mockOpenWithMessage(...args) },
}));

const job = {
  jobId: 'job-1',
  title: 'Two cleaners needed',
  status: 'Open',
  startsOn: '2026-11-12',
  lengthAmount: 1,
  lengthUnit: 'Days',
  employer: { ownerUserId: 'poster-1', displayName: 'Ama Mensah' },
  location: { countryCode: 'MU', cityName: 'Port Louis', displayName: 'Port Louis' },
} as unknown as JobResponse;

const refusal = (code: string) => Object.assign(new Error(code), { response: { status: 409, data: { code } } });

beforeEach(() => {
  mockApply.mockReset().mockResolvedValue({ applicationId: 'a1' });
  mockOpenWithMessage.mockReset().mockResolvedValue(undefined);
});

it('says which job, and when', () => {
  expect(interestMessage(job)).toBe(
    'Hi, I\'m interested in your job "Two cleaners needed" (12 Nov · 1 day). Is a place still open?'
  );
});

it('records the interest, then messages the poster about this job', async () => {
  await expressInterest(job);

  expect(mockApply).toHaveBeenCalledWith('job-1');
  expect(mockOpenWithMessage).toHaveBeenCalledWith(
    expect.objectContaining({ recipientId: 'poster-1', contextType: 'JobOpportunity', entityId: 'job-1' }),
    interestMessage(job)
  );
});

it('saying it twice still opens the conversation', async () => {
  mockApply.mockRejectedValue(refusal('jobs.application.already-applied'));

  await expressInterest(job);

  expect(mockOpenWithMessage).toHaveBeenCalledTimes(1);
});

it('sends no message when the job refused the interest', async () => {
  mockApply.mockRejectedValue(refusal('jobs.posting.no-vacancies'));

  await expect(expressInterest(job)).rejects.toThrow('jobs.posting.no-vacancies');
  expect(mockOpenWithMessage).not.toHaveBeenCalled();
});
