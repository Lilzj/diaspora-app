// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator economy presentation logic (Frontend Phase 7)
//
// Everything in this file is **display only**. That is not a stylistic claim —
// it is the constraint the phase brief puts on the frontend in six separate
// places, and this module is where it is enforced rather than promised:
//
//   §7   creator status is consumed, never computed
//   §9   reputation is never calculated locally
//   §11  points are never awarded by the frontend
//   §17  balances are never derived from local state
//   §22  milestone completion is served, never inferred from progress
//   §37  entitlement is never decided by the client
//
// So every function here takes a value the backend already decided and answers
// a question about how to *draw* it: what colour, what words, what icon, what
// order, what accessible sentence. There is no function in this file that
// returns a `CreatorStatus`, a points total, an amount of money, or a boolean
// that gates access. Those come from the server or they do not exist.
//
// The one arithmetic operation here is `clampPercentage`, which exists because
// a served percentage outside 0–100 would break a progress bar's layout, and
// clamping it is a rendering decision rather than a business one.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalyticsPeriod,
  AnalyticsRange,
  CreatorChallengeState,
  CreatorEarningState,
  CreatorMetric,
  CreatorMilestone,
  CreatorMilestoneState,
  CreatorProgress,
  CreatorStatus,
  CreatorVerificationState,
  GrantApplicationState,
  SignupBonusState,
  SponsoredContentState,
} from '@/types/creator-economy';

// ═════════════════════════════════════════════════════════════════════════════
// STATUS PRESENTATION
// ═════════════════════════════════════════════════════════════════════════════

/** A semantic tone, resolved to a token by whichever component renders it. */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'brand';

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
  /** An icon name from Ionicons. Never the sole carrier of meaning (§38). */
  icon: string;
  /** A full sentence for a screen reader, where the label alone is too terse. */
  description: string;
}

/**
 * How to draw a creator status.
 *
 * Note the `default` arm. Every status map in this file has one, and it does
 * not throw: a deployment can be ahead of the app in the store, and a creator
 * whose status the app has never heard of must still see a sensible badge
 * rather than a crash or a blank. The unknown status is shown by name, split on
 * its camel case, which is nearly always the right words already.
 */
export function presentCreatorStatus(status: CreatorStatus): StatusPresentation {
  switch (status) {
    case 'NotACreator':
      return {
        label: 'Not a creator yet',
        tone: 'neutral',
        icon: 'person-outline',
        description: 'You have not started contributing yet. Publishing your first guide begins it.',
      };
    case 'Contributor':
      return {
        label: 'Contributor',
        tone: 'info',
        icon: 'create-outline',
        description: 'You have published content the community can use.',
      };
    case 'EmergingCreator':
      return {
        label: 'Emerging creator',
        tone: 'info',
        icon: 'trending-up-outline',
        description: 'Your work is reaching people and your audience is growing.',
      };
    case 'VerifiedCreator':
      return {
        label: 'Verified creator',
        tone: 'success',
        icon: 'checkmark-circle-outline',
        description: 'Diaspora has verified you as a creator.',
      };
    case 'EstablishedCreator':
      return {
        label: 'Established creator',
        tone: 'success',
        icon: 'ribbon-outline',
        description: 'You are one of the community’s consistent contributors.',
      };
    case 'TopCreator':
      return {
        label: 'Top creator',
        tone: 'brand',
        icon: 'trophy-outline',
        description: 'You are among the most helpful creators on Diaspora.',
      };
    case 'PendingVerification':
      return {
        label: 'Verification pending',
        tone: 'warning',
        icon: 'hourglass-outline',
        description: 'Your creator verification is being reviewed.',
      };
    case 'Restricted':
      return {
        label: 'Restricted',
        tone: 'warning',
        icon: 'alert-circle-outline',
        description: 'Some creator features are paused on your account.',
      };
    case 'Suspended':
      return {
        label: 'Suspended',
        tone: 'error',
        icon: 'close-circle-outline',
        description: 'Your creator account is suspended. Contact support to appeal.',
      };
    default:
      return {
        label: humanise(status),
        tone: 'neutral',
        icon: 'ellipse-outline',
        description: `Your creator status is ${humanise(status).toLowerCase()}.`,
      };
  }
}

export function presentVerificationState(state: CreatorVerificationState): StatusPresentation {
  switch (state) {
    case 'NotEligible':
      return {
        label: 'Not eligible yet',
        tone: 'neutral',
        icon: 'lock-closed-outline',
        description: 'There are still requirements to meet before you can apply.',
      };
    case 'Eligible':
      return {
        label: 'Ready to apply',
        tone: 'info',
        icon: 'sparkles-outline',
        description: 'You meet the requirements. You can apply for creator verification.',
      };
    case 'Draft':
      return {
        label: 'Draft saved',
        tone: 'neutral',
        icon: 'document-outline',
        description: 'Your application is saved but not submitted.',
      };
    case 'Submitted':
      return {
        label: 'Submitted',
        tone: 'info',
        icon: 'paper-plane-outline',
        description: 'Your application has been received.',
      };
    case 'UnderReview':
      return {
        label: 'Under review',
        tone: 'warning',
        icon: 'hourglass-outline',
        description: 'A reviewer is looking at your application.',
      };
    case 'MoreInformationRequired':
      return {
        label: 'More information needed',
        tone: 'warning',
        icon: 'help-circle-outline',
        description: 'The reviewer needs something else from you before deciding.',
      };
    case 'Approved':
      return {
        label: 'Approved',
        tone: 'success',
        icon: 'checkmark-circle-outline',
        description: 'You are a verified creator.',
      };
    case 'Rejected':
      return {
        label: 'Not approved',
        tone: 'error',
        icon: 'close-circle-outline',
        description: 'Your application was not approved. The reason is shown below.',
      };
    case 'Expired':
      return {
        label: 'Expired',
        tone: 'warning',
        icon: 'time-outline',
        description: 'Your creator verification has lapsed and needs renewing.',
      };
    case 'Suspended':
      return {
        label: 'Suspended',
        tone: 'error',
        icon: 'ban-outline',
        description: 'Your creator verification is suspended.',
      };
    case 'AppealPending':
      return {
        label: 'Appeal pending',
        tone: 'warning',
        icon: 'refresh-outline',
        description: 'Your appeal is being considered.',
      };
    default:
      return {
        label: humanise(state),
        tone: 'neutral',
        icon: 'ellipse-outline',
        description: humanise(state),
      };
  }
}

export function presentMilestoneState(state: CreatorMilestoneState): StatusPresentation {
  switch (state) {
    case 'Locked':
      return { label: 'Locked', tone: 'neutral', icon: 'lock-closed-outline', description: 'Not started yet.' };
    case 'InProgress':
      return { label: 'In progress', tone: 'info', icon: 'ellipse-outline', description: 'You are working toward this.' };
    case 'AlmostComplete':
      return { label: 'Almost there', tone: 'warning', icon: 'flame-outline', description: 'You are close to completing this.' };
    case 'Completed':
      return { label: 'Ready to claim', tone: 'success', icon: 'gift-outline', description: 'Completed. Claim your reward.' };
    case 'Claimed':
      return { label: 'Claimed', tone: 'success', icon: 'checkmark-done-outline', description: 'Completed and claimed.' };
    case 'Expired':
      return { label: 'Expired', tone: 'neutral', icon: 'time-outline', description: 'This milestone is no longer available.' };
    default:
      return { label: humanise(state), tone: 'neutral', icon: 'ellipse-outline', description: humanise(state) };
  }
}

export function presentChallengeState(state: CreatorChallengeState): StatusPresentation {
  switch (state) {
    case 'Upcoming':
      return { label: 'Starting soon', tone: 'neutral', icon: 'calendar-outline', description: 'This challenge has not opened yet.' };
    case 'Open':
      return { label: 'Open', tone: 'info', icon: 'flag-outline', description: 'You can join this challenge.' };
    case 'Joined':
      return { label: 'Joined', tone: 'info', icon: 'checkmark-outline', description: 'You have joined. No tasks completed yet.' };
    case 'InProgress':
      return { label: 'In progress', tone: 'info', icon: 'walk-outline', description: 'You are part way through.' };
    case 'Completed':
      return { label: 'Completed', tone: 'success', icon: 'gift-outline', description: 'All tasks done. Claim your reward.' };
    case 'Claimed':
      return { label: 'Reward claimed', tone: 'success', icon: 'checkmark-done-outline', description: 'Completed and rewarded.' };
    case 'Failed':
      return { label: 'Not completed', tone: 'warning', icon: 'close-outline', description: 'The challenge ended before you finished.' };
    case 'Expired':
      return { label: 'Ended', tone: 'neutral', icon: 'time-outline', description: 'This challenge has ended.' };
    case 'Cancelled':
      return { label: 'Cancelled', tone: 'neutral', icon: 'ban-outline', description: 'Diaspora cancelled this challenge.' };
    default:
      return { label: humanise(state), tone: 'neutral', icon: 'ellipse-outline', description: humanise(state) };
  }
}

/**
 * Where an earning row goes when it is tapped, or null when it goes nowhere.
 *
 * **The row used to open the ledger transaction, and that always failed.** An
 * earning carried the `transactionId` of the capture behind it, and the screen
 * pushed `/wallet/transactions/{id}`. A donation capture posts clearing to
 * platform revenue: the person who earned it owns neither leg and did not
 * initiate the payment, so the server answers 404 — deliberately, so an
 * identifier cannot be used to discover a transaction exists. Every row on the
 * revenue screen invited a tap that could only say "We could not find that
 * transaction."
 *
 * What the earner can open is the thing that produced the money. The server
 * names it as a subject, and this is the only place that maps one to a route.
 *
 * **A subject with no route answers null, and the caller must not make the row
 * pressable.** `donation` is the case that matters: a donation record belongs
 * to the donor, and the beneficiary opening their own earning is not the donor.
 * Returning a route we cannot serve would rebuild the same dead tap.
 */
export function earningDestination(earning: {
  subjectType?: string | null;
  subjectId?: string | null;
}): string | null {
  const id = earning.subjectId;

  if (!id) {
    return null;
  }

  switch (earning.subjectType) {
    case 'campaign':
      return `/community-life/campaign/${id}`;
    case 'event':
      return `/community-life/event/${id}`;
    case 'listing':
      return `/marketplace/${id}`;
    case 'housing':
      return `/housing/${id}`;
    case 'job':
      return `/job/${id}`;
    case 'guide':
      return `/guide/${id}`;

    // `donation` lands here on purpose, and so does anything added server-side
    // that this has not been taught yet. Both are rows that stay unpressable
    // rather than rows that fail when pressed.
    default:
      return null;
  }
}

/**
 * How to draw an earning state.
 *
 * §17 is the reason `Pending` is `warning` rather than `success`: pending
 * revenue must not read as money the member has. The tone, the icon and the
 * sentence all say "not yet", and the revenue screen keeps the figure in a
 * separate row from the available balance so the two can never be summed by
 * eye either.
 */
export function presentEarningState(state: CreatorEarningState): StatusPresentation {
  switch (state) {
    case 'Pending':
      return {
        label: 'Pending',
        tone: 'warning',
        icon: 'hourglass-outline',
        description: 'Earned but not yet cleared. You cannot withdraw this yet.',
      };
    case 'Available':
      return {
        label: 'Available',
        tone: 'success',
        icon: 'checkmark-circle-outline',
        description: 'Cleared and in your wallet.',
      };
    case 'Processing':
      return {
        label: 'Processing',
        tone: 'info',
        icon: 'sync-outline',
        description: 'On its way to your payout destination.',
      };
    case 'Paid':
      return { label: 'Paid out', tone: 'success', icon: 'arrow-up-circle-outline', description: 'Paid to you.' };
    case 'Failed':
      return { label: 'Failed', tone: 'error', icon: 'alert-circle-outline', description: 'This payment did not go through.' };
    case 'Reversed':
      return { label: 'Reversed', tone: 'error', icon: 'return-down-back-outline', description: 'This earning was reversed.' };
    case 'Refunded':
      return { label: 'Refunded', tone: 'neutral', icon: 'return-down-back-outline', description: 'The payer was refunded.' };
    case 'Cancelled':
      return { label: 'Cancelled', tone: 'neutral', icon: 'close-outline', description: 'This earning was cancelled.' };
    default:
      return { label: humanise(state), tone: 'neutral', icon: 'ellipse-outline', description: humanise(state) };
  }
}

export function presentGrantApplicationState(state: GrantApplicationState): StatusPresentation {
  switch (state) {
    case 'Draft':
      return { label: 'Draft', tone: 'neutral', icon: 'document-outline', description: 'Saved but not submitted.' };
    case 'Submitted':
      return { label: 'Submitted', tone: 'info', icon: 'paper-plane-outline', description: 'Your application has been received.' };
    case 'UnderReview':
      return { label: 'Under review', tone: 'warning', icon: 'hourglass-outline', description: 'The panel is considering it.' };
    case 'MoreInformationRequested':
      return { label: 'More information needed', tone: 'warning', icon: 'help-circle-outline', description: 'The panel needs something else from you.' };
    case 'Approved':
      return { label: 'Approved', tone: 'success', icon: 'checkmark-circle-outline', description: 'Your grant was approved.' };
    case 'Rejected':
      return { label: 'Not approved', tone: 'error', icon: 'close-circle-outline', description: 'Your application was not approved.' };
    case 'Withdrawn':
      return { label: 'Withdrawn', tone: 'neutral', icon: 'arrow-undo-outline', description: 'You withdrew this application.' };
    case 'Active':
      return { label: 'Active', tone: 'success', icon: 'play-circle-outline', description: 'Your grant is running.' };
    case 'Completed':
      return { label: 'Completed', tone: 'success', icon: 'checkmark-done-outline', description: 'Your grant is finished.' };
    default:
      return { label: humanise(state), tone: 'neutral', icon: 'ellipse-outline', description: humanise(state) };
  }
}

export function presentSponsoredState(state: SponsoredContentState): StatusPresentation {
  switch (state) {
    case 'Draft':
      return { label: 'Draft', tone: 'neutral', icon: 'document-outline', description: 'Not submitted yet.' };
    case 'PendingPayment':
      return { label: 'Awaiting payment', tone: 'warning', icon: 'card-outline', description: 'Payment has not completed.' };
    case 'PendingApproval':
      return { label: 'Awaiting approval', tone: 'warning', icon: 'hourglass-outline', description: 'Diaspora is reviewing it.' };
    case 'Approved':
      return { label: 'Approved', tone: 'success', icon: 'checkmark-circle-outline', description: 'Approved and waiting to start.' };
    case 'Scheduled':
      return { label: 'Scheduled', tone: 'info', icon: 'calendar-outline', description: 'It starts on the date shown.' };
    case 'Active':
      return { label: 'Running', tone: 'success', icon: 'megaphone-outline', description: 'Live and being shown.' };
    case 'Paused':
      return { label: 'Paused', tone: 'warning', icon: 'pause-circle-outline', description: 'Delivery is paused.' };
    case 'Expired':
      return { label: 'Ended', tone: 'neutral', icon: 'time-outline', description: 'This promotion has ended.' };
    case 'Rejected':
      return { label: 'Not approved', tone: 'error', icon: 'close-circle-outline', description: 'This promotion was not approved.' };
    case 'Cancelled':
      return { label: 'Cancelled', tone: 'neutral', icon: 'ban-outline', description: 'You cancelled this promotion.' };
    case 'Completed':
      return { label: 'Completed', tone: 'success', icon: 'checkmark-done-outline', description: 'This promotion ran to completion.' };
    default:
      return { label: humanise(state), tone: 'neutral', icon: 'ellipse-outline', description: humanise(state) };
  }
}

export function presentSignupBonusState(state: SignupBonusState): StatusPresentation {
  switch (state) {
    case 'NotEligible':
      return { label: 'Not eligible', tone: 'neutral', icon: 'information-circle-outline', description: 'This bonus is not available on your account.' };
    case 'Eligible':
      return { label: 'Available', tone: 'success', icon: 'gift-outline', description: 'Your welcome bonus is waiting.' };
    case 'Pending':
      return { label: 'Almost there', tone: 'warning', icon: 'hourglass-outline', description: 'A few things left before it is awarded.' };
    case 'Awarded':
      return { label: 'Awarded', tone: 'success', icon: 'checkmark-circle-outline', description: 'Your bonus points are in your balance.' };
    case 'AlreadyClaimed':
      return { label: 'Already claimed', tone: 'neutral', icon: 'checkmark-done-outline', description: 'You have already had this bonus.' };
    case 'Expired':
      return { label: 'Expired', tone: 'neutral', icon: 'time-outline', description: 'This bonus is no longer available.' };
    case 'Blocked':
      return {
        label: 'On hold',
        tone: 'warning',
        icon: 'shield-outline',
        // Deliberately vague: a fraud refusal must not tell somebody which
        // check they tripped, because that is a map for getting round it.
        description: 'We need to check something before awarding this. Support can help.',
      };
    default:
      return { label: humanise(state), tone: 'neutral', icon: 'ellipse-outline', description: humanise(state) };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PROGRESS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A served percentage, made safe for layout.
 *
 * Not a computation of progress — the backend sends `percentage` precisely so
 * the client does not divide `current` by `target` and disagree with a weighted
 * or capped rule. All this does is stop a bad value from breaking a bar.
 */
export function clampPercentage(percentage: number | null | undefined): number {
  if (typeof percentage !== 'number' || Number.isNaN(percentage)) return 0;
  return Math.max(0, Math.min(100, percentage));
}

/**
 * The accessible sentence for a progress bar.
 *
 * §38 requires accessible progress indicators. A `progressbar` role with no
 * text announces "45 percent" and nothing else; this says what the 45 percent
 * is *of*, which is the part that matters.
 */
export function describeProgress(progress: CreatorProgress, subject: string): string {
  const unit = progress.unit ? ` ${progress.unit}` : '';
  return `${subject}: ${progress.current}${unit} of ${progress.target}${unit}. ${clampPercentage(progress.percentage)} percent complete.`;
}

/**
 * The order milestones are shown in.
 *
 * Claimable first — a completed, unclaimed milestone is the only one with an
 * action attached, and burying it under thirty locked ones is how a reward goes
 * unclaimed. Within a group, the platform's own `sortOrder` is respected.
 */
export function orderMilestones(milestones: CreatorMilestone[]): CreatorMilestone[] {
  const groupRank: Record<string, number> = {
    Completed: 0,
    AlmostComplete: 1,
    InProgress: 2,
    Claimed: 3,
    Locked: 4,
    Expired: 5,
  };

  return milestones
    .slice()
    .sort(
      (left, right) =>
        (groupRank[String(left.state)] ?? 9) - (groupRank[String(right.state)] ?? 9) ||
        left.sortOrder - right.sortOrder
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS PERIODS
// ═════════════════════════════════════════════════════════════════════════════

export const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  year: 'This year',
  custom: 'Custom',
};

/**
 * A stable cache key for a period selection.
 *
 * A custom range with the same bounds must hit the same cache entry however it
 * was arrived at, and a named period must not collide with a custom range that
 * happens to cover the same days — because the server may bucket them
 * differently and the response would carry a different `range` back.
 */
export function fingerprintRange(range: AnalyticsRange): string {
  if (range.period !== 'custom') return range.period;
  return `custom:${range.from ?? ''}:${range.to ?? ''}`;
}

/** Whether a custom range is complete enough to send. Ordering is the server's call. */
export function isRangeQueryable(range: AnalyticsRange): boolean {
  if (range.period !== 'custom') return true;
  return Boolean(range.from && range.to && range.from <= range.to);
}

/**
 * The human sentence for a metric change.
 *
 * `higherIsBetter` matters: a 30% rise in "reports received" is not good news,
 * and a component that coloured every increase green would be telling a creator
 * their worst week was their best one.
 */
export function describeMetricChange(metric: CreatorMetric): {
  text: string;
  tone: StatusTone;
} | null {
  if (typeof metric.changePercentage !== 'number') return null;

  const magnitude = Math.abs(metric.changePercentage);
  if (magnitude < 0.5) {
    return { text: 'No change', tone: 'neutral' };
  }

  const rose = metric.changePercentage > 0;
  const better = metric.higherIsBetter === false ? !rose : rose;

  return {
    text: `${rose ? '+' : '−'}${magnitude.toFixed(magnitude < 10 ? 1 : 0)}%`,
    tone: better ? 'success' : 'warning',
  };
}

/** A count rendered for reading rather than for counting. 12400 → "12.4K". */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(absolute >= 10_000 ? 0 : 1)}K`;
  return value.toLocaleString();
}

/**
 * Points, always with their unit.
 *
 * A bare number next to a currency figure is exactly how somebody comes to
 * believe they have £1,240 rather than 1,240 points. The unit is not optional.
 */
export function formatPoints(points: number): string {
  const rounded = Math.round(points);
  return `${rounded.toLocaleString()} ${Math.abs(rounded) === 1 ? 'point' : 'points'}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `MoreInformationRequired` → "More information required".
 *
 * The fallback for every status the app has not heard of. Splits camel case,
 * collapses separators, and capitalises once — which turns a server enum member
 * into passable English far more often than it does not, and never crashes.
 */
export function humanise(value: string): string {
  if (!value) return '';
  const spaced = value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
