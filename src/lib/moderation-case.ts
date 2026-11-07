// What a moderation decision about the member's own content means, in words (7 Nov 2026).
// Kept out of the route file: Expo Router treats a route file's exports as the route.

import type { MyModerationCase } from '@/lib/trust-api';

const CONTENT_WORDS: Record<string, string> = {
  job: 'job advert',
  provider: 'business listing',
  'marketplace-listing': 'listing',
  'housing-listing': 'home',
  guide: 'guide',
  'community-post': 'post',
  'community-comment': 'comment',
  event: 'event',
  organization: 'organisation',
  fundraiser: 'fundraiser',
  media: 'photo or file',
};

export function longDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** What happened, in one sentence. */
export function decisionHeadline(decision: MyModerationCase): string {
  const thing = CONTENT_WORDS[decision.contentType] ?? 'content';

  if (decision.removalPending) return `Your ${thing} is hidden while a removal is checked by a second member of staff.`;
  if (decision.hiddenAutomatically) return `Your ${thing} is hidden after several reports. Nobody at Diaspora has decided anything yet.`;

  switch (decision.outcome) {
    case 'HidePendingReview':
      return `Your ${thing} is hidden while Diaspora reviews it.`;
    case 'Remove':
      return `Your ${thing} was removed.`;
    case 'Restore':
      return `Your ${thing} is back.`;
    case 'NoAction':
      return `Diaspora looked at your ${thing} and took no action.`;
    default:
      return `Your ${thing} is being looked at by Diaspora.`;
  }
}

/** Whether an appeal is still open to the member. */
export function canAppeal(decision: MyModerationCase, now: Date = new Date()): boolean {
  if (decision.outcome === 'Remove') {
    return Boolean(decision.appealDeadline) && new Date(decision.appealDeadline as string).getTime() >= now.getTime();
  }

  return decision.outcome === 'HidePendingReview' && !decision.hiddenAutomatically && !decision.removalPending;
}
