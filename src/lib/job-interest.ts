// ─────────────────────────────────────────────────────────────────────────────
// "I'm interested" on a simple job (owner's request, 4 Nov 2026)
//
// A member answers a simple job without a work profile or a form: one tap
// records their interest on the job (an application with no CV, so the poster
// sees who is interested and nobody is counted twice) and sends the poster a
// message in their Diaspora inbox, where the two arrange the work.
// ─────────────────────────────────────────────────────────────────────────────

import { ConversationHub } from '@/lib/conversation-hub';
import { jobConversationSubtitle, describeSchedule } from '@/lib/job-detail-api';
import { applyToJob } from '@/lib/jobs-hiring-api';
import type { JobResponse } from '@/types/jobs-hiring';

/** The message the poster receives. */
export function interestMessage(job: Pick<JobResponse, 'title' | 'startsOn' | 'lengthAmount' | 'lengthUnit'>): string {
  const when = describeSchedule(job);
  return `Hi, I'm interested in your job "${job.title}"${when ? ` (${when})` : ''}. Is a place still open?`;
}

function problemCode(cause: unknown): string | null {
  const code = (cause as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

/**
 * Records the interest, then messages the poster and opens the conversation.
 * Saying it a second time is not a failure: the interest is already on the
 * job, so the member is taken to the conversation to follow it up.
 */
export async function expressInterest(job: JobResponse): Promise<void> {
  if (!job.employer.ownerUserId) {
    throw new Error('This job does not say who posted it.');
  }

  try {
    await applyToJob(job.jobId);
  } catch (cause) {
    if (problemCode(cause) !== 'jobs.application.already-applied') throw cause;
  }

  await ConversationHub.openWithMessage(
    {
      recipientId: job.employer.ownerUserId,
      recipientName: job.employer.displayName,
      contextType: 'JobOpportunity',
      entityId: job.jobId,
      entityTitle: job.title,
      entitySubtitle: jobConversationSubtitle(job),
      entityStatus: job.status,
      deepLink: `/job/${job.jobId}`,
      campaignSource: 'job_interest',
    },
    interestMessage(job)
  );
}
