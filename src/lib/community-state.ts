// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life state machines (Frontend Phase 12)
//
// §53: "Where lifecycle complexity exists, model states explicitly. Do not rely
// on ambiguous booleans such as isActive, isComplete, isApproved."
//
// Eight machines live here — membership, event series, occurrence, donation,
// campaign, volunteer application, volunteer assignment and poll — and every one
// answers the same three questions for a screen:
//
//   **What does this state mean?** `describe*` returns a label, a tone and a
//   sentence. The tone drives colour *and* an icon, never colour alone (§46:
//   no colour-only state communication).
//
//   **Is it finished?** `isTerminal*` decides whether the UI keeps polling,
//   whether a retry button appears, and — for anything financial — whether the
//   idempotency key may be released. Releasing a key on a non-terminal state is
//   how a resumed payment becomes a second payment, so this is not cosmetic.
//
//   **May it go there?** `canTransition*` is the *display* rule: it decides
//   which buttons to draw. It is never the authorization. Every transition is
//   re-decided by the server on the request that follows, and a client that
//   disagreed would simply be shown a 409.
//
// One rule runs through all of it and is worth stating once: **a state is
// something the backend told us.** Nothing in this file computes a status from
// a date, a total or a count. `RenewalDue` arrives from the server; it is not
// derived by comparing `expiresAt` to the clock, because the clock on a phone
// is whatever its owner set it to.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CampaignStatus,
  EventSeriesStatus,
  MembershipStatus,
  OccurrenceStatus,
  PollStatus,
  RegistrationStatus,
  VolunteerApplicationStatus,
  VolunteerAssignmentStatus,
} from '@/types/community-advanced';
import type { GivingStatus, PaymentStatus } from '@/types/financial';

// ─────────────────────────────────────────────────────────────────────────────
// Presentation vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a state should read.
 *
 * Mapped to a token colour *and* an icon by `<CommunityStatusBadge>`. The icon
 * is not decoration: §46 forbids communicating state through colour alone, and
 * a member with a colour-vision difference reads the icon and the label.
 */
export type StateTone = 'neutral' | 'progress' | 'positive' | 'caution' | 'negative';

export interface StateDescriptor {
  /** Two or three words, sentence case. What the badge says. */
  label: string;
  tone: StateTone;
  /** An Ionicons name. Carries the same meaning as the tone, without colour. */
  icon: string;
  /** One sentence a member can act on. Shown under the badge on detail screens. */
  detail: string;
  /** True while the platform is still working and the UI should keep looking. */
  isPending: boolean;
  /** True when nothing further will happen without a new action. */
  isTerminal: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP — §6
// ═════════════════════════════════════════════════════════════════════════════

const MEMBERSHIP_STATES: Record<MembershipStatus, StateDescriptor> = {
  NotAMember: {
    label: 'Not a member',
    tone: 'neutral',
    icon: 'person-outline',
    detail: 'You have not joined this community yet.',
    isPending: false,
    isTerminal: true,
  },
  Eligible: {
    label: 'Eligible',
    tone: 'positive',
    icon: 'checkmark-circle-outline',
    detail: 'You meet the requirements and can apply now.',
    isPending: false,
    isTerminal: false,
  },
  Ineligible: {
    label: 'Not eligible',
    tone: 'caution',
    icon: 'alert-circle-outline',
    detail: 'Some requirements are outstanding. They are listed below.',
    isPending: false,
    isTerminal: false,
  },
  Draft: {
    label: 'Draft',
    tone: 'neutral',
    icon: 'create-outline',
    detail: 'Your application is saved and has not been sent yet.',
    isPending: false,
    isTerminal: false,
  },
  Pending: {
    label: 'Pending review',
    tone: 'progress',
    icon: 'hourglass-outline',
    detail: 'The organisation is reviewing your application.',
    isPending: true,
    isTerminal: false,
  },
  Approved: {
    label: 'Approved',
    tone: 'positive',
    icon: 'checkmark-done-outline',
    detail: 'You have been approved. Complete any payment to activate.',
    isPending: false,
    isTerminal: false,
  },
  Rejected: {
    label: 'Not accepted',
    tone: 'negative',
    icon: 'close-circle-outline',
    detail: 'The organisation did not accept this application.',
    isPending: false,
    isTerminal: true,
  },
  PaymentPending: {
    label: 'Confirming payment',
    tone: 'progress',
    icon: 'sync-outline',
    detail: 'We are confirming your payment with the provider.',
    isPending: true,
    isTerminal: false,
  },
  PaymentFailed: {
    label: 'Payment failed',
    tone: 'negative',
    icon: 'card-outline',
    detail: 'The payment did not go through. You can try again.',
    isPending: false,
    isTerminal: false,
  },
  Active: {
    label: 'Active',
    tone: 'positive',
    icon: 'shield-checkmark-outline',
    detail: 'Your membership is active.',
    isPending: false,
    isTerminal: false,
  },
  RenewalDue: {
    label: 'Renewal due',
    tone: 'caution',
    icon: 'refresh-outline',
    detail: 'Your membership needs renewing to stay active.',
    isPending: false,
    isTerminal: false,
  },
  Expired: {
    label: 'Expired',
    tone: 'neutral',
    icon: 'time-outline',
    detail: 'This membership has ended. You can rejoin.',
    isPending: false,
    isTerminal: true,
  },
  Suspended: {
    label: 'Suspended',
    tone: 'negative',
    icon: 'pause-circle-outline',
    detail: 'The organisation has suspended this membership.',
    isPending: false,
    isTerminal: false,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'close-outline',
    detail: 'This membership was cancelled.',
    isPending: false,
    isTerminal: true,
  },
};

export function describeMembership(status: MembershipStatus): StateDescriptor {
  return MEMBERSHIP_STATES[status] ?? MEMBERSHIP_STATES.NotAMember;
}

/**
 * Legal transitions, for deciding which buttons to draw.
 *
 * Read it as: from this state, the platform may move to one of these. The
 * *member* can only trigger a subset — `canApply`, `canPay` and friends below
 * express that — and the organization triggers the rest.
 */
const MEMBERSHIP_TRANSITIONS: Record<MembershipStatus, MembershipStatus[]> = {
  NotAMember: ['Eligible', 'Ineligible'],
  Eligible: ['Draft', 'Pending', 'PaymentPending'],
  Ineligible: ['Eligible'],
  Draft: ['Pending', 'Cancelled'],
  Pending: ['Approved', 'Rejected', 'Cancelled'],
  Approved: ['PaymentPending', 'Active', 'Cancelled'],
  Rejected: [],
  PaymentPending: ['Active', 'PaymentFailed'],
  PaymentFailed: ['PaymentPending', 'Cancelled'],
  Active: ['RenewalDue', 'Suspended', 'Cancelled', 'Expired'],
  RenewalDue: ['PaymentPending', 'Active', 'Expired', 'Cancelled'],
  Expired: ['Pending', 'PaymentPending'],
  Suspended: ['Active', 'Cancelled'],
  Cancelled: [],
};

export function canTransitionMembership(from: MembershipStatus, to: MembershipStatus): boolean {
  return (MEMBERSHIP_TRANSITIONS[from] ?? []).includes(to);
}

/** Whether the member's own "Apply" control should be drawn. */
export function canApplyForMembership(status: MembershipStatus): boolean {
  return status === 'NotAMember' || status === 'Eligible' || status === 'Draft' || status === 'Expired';
}

/** Whether a "Pay" or "Retry payment" control should be drawn. */
export function canPayForMembership(status: MembershipStatus): boolean {
  return status === 'Approved' || status === 'PaymentFailed' || status === 'RenewalDue';
}

/** Whether a "Renew" control should be drawn. */
export function canRenewMembership(status: MembershipStatus): boolean {
  return status === 'RenewalDue' || status === 'Expired';
}

/** Whether a "Cancel membership" control should be drawn. */
export function canCancelMembership(status: MembershipStatus): boolean {
  return (
    status === 'Draft' ||
    status === 'Pending' ||
    status === 'Approved' ||
    status === 'Active' ||
    status === 'RenewalDue' ||
    status === 'PaymentFailed'
  );
}

/**
 * Whether the membership grants its benefits right now.
 *
 * The one place this question is answered, so twenty screens do not each
 * decide it. `RenewalDue` is deliberately included: a member in a grace period
 * still has their benefits, and taking them away early would be a product
 * decision the client is not entitled to make.
 */
export function membershipGrantsBenefits(status: MembershipStatus): boolean {
  return status === 'Active' || status === 'RenewalDue';
}

// ═════════════════════════════════════════════════════════════════════════════
// EVENT SERIES & OCCURRENCES — §9, §11
// ═════════════════════════════════════════════════════════════════════════════

const SERIES_STATES: Record<EventSeriesStatus, StateDescriptor> = {
  Draft: {
    label: 'Draft',
    tone: 'neutral',
    icon: 'create-outline',
    detail: 'Only you can see this series.',
    isPending: false,
    isTerminal: false,
  },
  Published: {
    label: 'Published',
    tone: 'positive',
    icon: 'megaphone-outline',
    detail: 'This series is live and accepting registrations.',
    isPending: false,
    isTerminal: false,
  },
  Paused: {
    label: 'Paused',
    tone: 'caution',
    icon: 'pause-outline',
    detail: 'Upcoming occurrences are hidden while this is paused.',
    isPending: false,
    isTerminal: false,
  },
  Completed: {
    label: 'Completed',
    tone: 'neutral',
    icon: 'checkmark-done-outline',
    detail: 'Every occurrence in this series has happened.',
    isPending: false,
    isTerminal: true,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'negative',
    icon: 'close-circle-outline',
    detail: 'This series was cancelled.',
    isPending: false,
    isTerminal: true,
  },
};

export function describeSeries(status: EventSeriesStatus): StateDescriptor {
  return SERIES_STATES[status] ?? SERIES_STATES.Draft;
}

const SERIES_TRANSITIONS: Record<EventSeriesStatus, EventSeriesStatus[]> = {
  Draft: ['Published', 'Cancelled'],
  Published: ['Paused', 'Completed', 'Cancelled'],
  Paused: ['Published', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

export function canTransitionSeries(from: EventSeriesStatus, to: EventSeriesStatus): boolean {
  return (SERIES_TRANSITIONS[from] ?? []).includes(to);
}

const OCCURRENCE_STATES: Record<OccurrenceStatus, StateDescriptor> = {
  Scheduled: {
    label: 'Scheduled',
    tone: 'positive',
    icon: 'calendar-outline',
    detail: 'This occurrence is going ahead as planned.',
    isPending: false,
    isTerminal: false,
  },
  Rescheduled: {
    label: 'Rescheduled',
    tone: 'caution',
    icon: 'swap-horizontal-outline',
    detail: 'This occurrence has moved from its original date.',
    isPending: false,
    isTerminal: false,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'negative',
    icon: 'close-circle-outline',
    detail: 'This occurrence will not take place.',
    isPending: false,
    isTerminal: true,
  },
  Completed: {
    label: 'Completed',
    tone: 'neutral',
    icon: 'checkmark-circle-outline',
    detail: 'This occurrence has already happened.',
    isPending: false,
    isTerminal: true,
  },
};

export function describeOccurrence(status: OccurrenceStatus): StateDescriptor {
  return OCCURRENCE_STATES[status] ?? OCCURRENCE_STATES.Scheduled;
}

const REGISTRATION_STATES: Record<RegistrationStatus, StateDescriptor> = {
  NotRegistered: {
    label: 'Not registered',
    tone: 'neutral',
    icon: 'add-circle-outline',
    detail: 'You have not registered for this yet.',
    isPending: false,
    isTerminal: false,
  },
  Registered: {
    label: 'Registered',
    tone: 'positive',
    icon: 'checkmark-circle-outline',
    detail: 'Your place is confirmed.',
    isPending: false,
    isTerminal: false,
  },
  Waitlisted: {
    label: 'On the waiting list',
    tone: 'caution',
    icon: 'list-outline',
    detail: 'You will be told if a place opens up.',
    isPending: true,
    isTerminal: false,
  },
  CheckedIn: {
    label: 'Checked in',
    tone: 'positive',
    icon: 'enter-outline',
    detail: 'You were checked in at the door.',
    isPending: false,
    isTerminal: false,
  },
  Attended: {
    label: 'Attended',
    tone: 'positive',
    icon: 'ribbon-outline',
    detail: 'Your attendance was recorded.',
    isPending: false,
    isTerminal: true,
  },
  NoShow: {
    label: 'Did not attend',
    tone: 'neutral',
    icon: 'remove-circle-outline',
    detail: 'You registered but were not checked in.',
    isPending: false,
    isTerminal: true,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'close-outline',
    detail: 'You cancelled your registration.',
    isPending: false,
    isTerminal: true,
  },
};

export function describeRegistration(status: RegistrationStatus): StateDescriptor {
  return REGISTRATION_STATES[status] ?? REGISTRATION_STATES.NotRegistered;
}

/** Whether a "Register" control should be drawn. */
export function canRegister(status: RegistrationStatus): boolean {
  return status === 'NotRegistered' || status === 'Cancelled';
}

/** Whether a "Cancel registration" control should be drawn. */
export function canCancelRegistration(status: RegistrationStatus): boolean {
  return status === 'Registered' || status === 'Waitlisted';
}

// ═════════════════════════════════════════════════════════════════════════════
// GIVING — §13
// ═════════════════════════════════════════════════════════════════════════════

/**
 * B15's `GivingStatus`, described.
 *
 * Note what is absent: there is no `describeDonation` that takes a boolean. §13
 * says a donation must not be marked successful from frontend state, and the
 * only input this function accepts is the status B15 returned.
 */
const GIVING_STATES: Record<string, StateDescriptor> = {
  Pending: {
    label: 'Processing',
    tone: 'progress',
    icon: 'sync-outline',
    detail: 'We are confirming this with the payment provider.',
    isPending: true,
    isTerminal: false,
  },
  Completed: {
    label: 'Completed',
    tone: 'positive',
    icon: 'checkmark-circle-outline',
    detail: 'Thank you. Your receipt is below.',
    isPending: false,
    isTerminal: true,
  },
  Failed: {
    label: 'Failed',
    tone: 'negative',
    icon: 'close-circle-outline',
    detail: 'This did not go through and you have not been charged.',
    isPending: false,
    isTerminal: true,
  },
  Refunded: {
    label: 'Refunded',
    tone: 'neutral',
    icon: 'return-down-back-outline',
    detail: 'This was refunded.',
    isPending: false,
    isTerminal: true,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'close-outline',
    detail: 'This was cancelled before it completed.',
    isPending: false,
    isTerminal: true,
  },
};

export function describeGiving(status: GivingStatus): StateDescriptor {
  return (
    GIVING_STATES[status as string] ?? {
      label: String(status),
      tone: 'neutral',
      icon: 'help-circle-outline',
      detail: 'We are checking the status of this.',
      isPending: true,
      isTerminal: false,
    }
  );
}

/**
 * Whether the idempotency key for a giving operation may be released.
 *
 * Deliberately its own function rather than a read of `isTerminal`, because the
 * consequence of getting it wrong is a duplicate charge: releasing while the
 * donation is still `Pending` turns the member's next tap into a second
 * donation rather than a resumption of the first.
 */
export function isGivingSettled(status: GivingStatus): boolean {
  return describeGiving(status).isTerminal;
}

/**
 * The same question for a B15 payment intent.
 *
 * `Authorized` is deliberately **not** settled. The money is reserved and not
 * taken, capture can still fail, and releasing the idempotency key at that
 * point would turn the member's next tap into a second payment rather than a
 * resumption of the first. `Draft` and `Pending` are not settled for the same
 * reason.
 *
 * Compared against B15's `PAYMENT_STATUSES` — Draft, Pending, Authorized,
 * Captured, Settled, Failed, Cancelled, Refunded, Expired — rather than against
 * a guessed vocabulary, so a status the backend adds later lands on "not
 * settled", which is the safe direction.
 */
export function isPaymentSettled(status: PaymentStatus): boolean {
  const settled = ['Captured', 'Settled', 'Failed', 'Cancelled', 'Expired', 'Refunded'];
  return settled.includes(String(status));
}

/** Whether a payment reached a terminal state that means the member paid. */
export function isPaymentSuccessful(status: PaymentStatus): boolean {
  return status === 'Captured' || status === 'Settled';
}

// ═════════════════════════════════════════════════════════════════════════════
// FUNDRAISING CAMPAIGNS — §16
// ═════════════════════════════════════════════════════════════════════════════

const CAMPAIGN_STATES: Record<CampaignStatus, StateDescriptor> = {
  Draft: {
    label: 'Draft',
    tone: 'neutral',
    icon: 'create-outline',
    detail: 'Only you can see this campaign.',
    isPending: false,
    isTerminal: false,
  },
  PendingReview: {
    label: 'In review',
    tone: 'progress',
    icon: 'hourglass-outline',
    detail: 'Diaspora is reviewing this campaign before it goes live.',
    isPending: true,
    isTerminal: false,
  },
  Rejected: {
    label: 'Not approved',
    tone: 'negative',
    icon: 'close-circle-outline',
    detail: 'This campaign was not approved. The reason is below.',
    isPending: false,
    isTerminal: false,
  },
  Published: {
    label: 'Published',
    tone: 'positive',
    icon: 'megaphone-outline',
    detail: 'This campaign is live.',
    isPending: false,
    isTerminal: false,
  },
  Active: {
    label: 'Accepting donations',
    tone: 'positive',
    icon: 'heart-outline',
    detail: 'This campaign is accepting donations.',
    isPending: false,
    isTerminal: false,
  },
  Paused: {
    label: 'Paused',
    tone: 'caution',
    icon: 'pause-outline',
    detail: 'Donations are paused for now.',
    isPending: false,
    isTerminal: false,
  },
  GoalReached: {
    label: 'Goal reached',
    tone: 'positive',
    icon: 'trophy-outline',
    detail: 'This campaign has reached its goal.',
    isPending: false,
    isTerminal: false,
  },
  DeadlineReached: {
    label: 'Deadline passed',
    tone: 'caution',
    icon: 'time-outline',
    detail: 'The deadline for this campaign has passed.',
    isPending: false,
    isTerminal: false,
  },
  Completed: {
    label: 'Completed',
    tone: 'positive',
    icon: 'checkmark-done-outline',
    detail: 'This campaign finished and funds were released.',
    isPending: false,
    isTerminal: true,
  },
  Refunding: {
    label: 'Refunding',
    tone: 'progress',
    icon: 'return-down-back-outline',
    detail: 'Donations to this campaign are being refunded.',
    isPending: true,
    isTerminal: false,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'negative',
    icon: 'close-circle-outline',
    detail: 'This campaign was cancelled.',
    isPending: false,
    isTerminal: true,
  },
  Closed: {
    label: 'Closed',
    tone: 'neutral',
    icon: 'lock-closed-outline',
    detail: 'This campaign is closed and no longer accepting donations.',
    isPending: false,
    isTerminal: true,
  },
  // Staff took it down through moderation (7 Nov 2026). Not a draft: shown as
  // one, the organiser was offered "Submit", which the server refuses.
  Suspended: {
    label: 'Suspended by Diaspora',
    tone: 'negative',
    icon: 'shield-outline',
    detail:
      'Diaspora staff suspended this campaign. It is hidden and is not taking donations. The reason is below.',
    isPending: false,
    isTerminal: false,
  },
};

export function describeCampaign(status: CampaignStatus): StateDescriptor {
  return CAMPAIGN_STATES[status] ?? CAMPAIGN_STATES.Draft;
}

/**
 * Whether a campaign's state is the organiser's business and nobody else's.
 *
 * **A supporter was being shown "PUBLISHED".** It is a lifecycle fact about
 * getting a campaign live — drafted, submitted, reviewed, published — and it
 * means nothing to somebody deciding whether to give. Worse, `Rejected` and
 * `PendingReview` are a stranger's business least of all, and both were on the
 * same card component.
 *
 * The states below this line are deliberately **not** organiser-only: paused,
 * goal reached, deadline reached, completed, refunding, cancelled and closed all
 * answer a question a supporter is actually asking — why can I not give, or what
 * happened to what I gave. `Active` is the ordinary case and says nothing either
 * way, so it is left visible rather than special-cased into silence.
 */
export function isOrganiserOnlyCampaignState(status: CampaignStatus): boolean {
  return (
    status === 'Draft' ||
    status === 'PendingReview' ||
    status === 'Rejected' ||
    status === 'Published' ||
    status === 'Suspended'
  );
}

const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  Draft: ['PendingReview', 'Cancelled'],
  PendingReview: ['Published', 'Rejected', 'Cancelled'],
  Rejected: ['Draft', 'PendingReview', 'Cancelled'],
  Published: ['Active', 'Paused', 'Cancelled', 'Closed'],
  Active: ['Paused', 'GoalReached', 'DeadlineReached', 'Closed', 'Refunding', 'Cancelled'],
  Paused: ['Active', 'Closed', 'Cancelled'],
  GoalReached: ['Active', 'Completed', 'Closed'],
  DeadlineReached: ['Completed', 'Closed', 'Refunding'],
  Completed: [],
  Refunding: ['Closed'],
  Cancelled: [],
  Closed: [],
  // Only staff lift a suspension; it comes back paused for the organiser.
  Suspended: [],
};

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return (CAMPAIGN_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Whether a donate control should be drawn.
 *
 * Advisory only. The server decides for real, and `FundraisingCampaign.canDonate`
 * — which comes from the server — is what the screen actually branches on. This
 * exists so a list can grey out a card without a round trip per card.
 */
export function campaignAcceptsDonations(status: CampaignStatus): boolean {
  return status === 'Published' || status === 'Active' || status === 'GoalReached';
}

// ═════════════════════════════════════════════════════════════════════════════
// VOLUNTEERING — §19, §21
// ═════════════════════════════════════════════════════════════════════════════

const VOLUNTEER_APPLICATION_STATES: Record<VolunteerApplicationStatus, StateDescriptor> = {
  NotApplied: {
    label: 'Not applied',
    tone: 'neutral',
    icon: 'add-circle-outline',
    detail: 'You have not applied for this yet.',
    isPending: false,
    isTerminal: false,
  },
  Draft: {
    label: 'Draft',
    tone: 'neutral',
    icon: 'create-outline',
    detail: 'Your application is saved and has not been sent.',
    isPending: false,
    isTerminal: false,
  },
  Pending: {
    label: 'Pending',
    tone: 'progress',
    icon: 'hourglass-outline',
    detail: 'The organiser is reviewing your application.',
    isPending: true,
    isTerminal: false,
  },
  Approved: {
    label: 'Approved',
    tone: 'positive',
    icon: 'checkmark-done-outline',
    detail: 'You have been accepted. Your assignment is below.',
    isPending: false,
    isTerminal: false,
  },
  Rejected: {
    label: 'Not accepted',
    tone: 'negative',
    icon: 'close-circle-outline',
    detail: 'The organiser did not accept this application.',
    isPending: false,
    isTerminal: true,
  },
  Waitlisted: {
    label: 'Waitlisted',
    tone: 'caution',
    icon: 'list-outline',
    detail: 'You are on the waiting list for this opportunity.',
    isPending: true,
    isTerminal: false,
  },
  Withdrawn: {
    label: 'Withdrawn',
    tone: 'neutral',
    icon: 'return-up-back-outline',
    detail: 'You withdrew this application.',
    isPending: false,
    isTerminal: true,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'close-outline',
    detail: 'This application was cancelled.',
    isPending: false,
    isTerminal: true,
  },
  Completed: {
    label: 'Completed',
    tone: 'positive',
    icon: 'ribbon-outline',
    detail: 'You completed this opportunity. Thank you.',
    isPending: false,
    isTerminal: true,
  },
};

export function describeVolunteerApplication(status: VolunteerApplicationStatus): StateDescriptor {
  return VOLUNTEER_APPLICATION_STATES[status] ?? VOLUNTEER_APPLICATION_STATES.NotApplied;
}

const VOLUNTEER_APPLICATION_TRANSITIONS: Record<VolunteerApplicationStatus, VolunteerApplicationStatus[]> = {
  NotApplied: ['Draft', 'Pending'],
  Draft: ['Pending', 'Cancelled'],
  Pending: ['Approved', 'Rejected', 'Waitlisted', 'Withdrawn'],
  Approved: ['Completed', 'Cancelled'],
  Rejected: [],
  Waitlisted: ['Approved', 'Rejected', 'Withdrawn'],
  Withdrawn: [],
  Cancelled: [],
  Completed: [],
};

export function canTransitionVolunteerApplication(
  from: VolunteerApplicationStatus,
  to: VolunteerApplicationStatus
): boolean {
  return (VOLUNTEER_APPLICATION_TRANSITIONS[from] ?? []).includes(to);
}

/** Whether an "Apply" control should be drawn. Server decides for real. */
export function canApplyToVolunteer(status: VolunteerApplicationStatus): boolean {
  return status === 'NotApplied' || status === 'Draft' || status === 'Withdrawn';
}

/** Whether a "Withdraw" control should be drawn. */
export function canWithdrawVolunteerApplication(status: VolunteerApplicationStatus): boolean {
  return status === 'Pending' || status === 'Waitlisted';
}

const VOLUNTEER_ASSIGNMENT_STATES: Record<VolunteerAssignmentStatus, StateDescriptor> = {
  Assigned: {
    label: 'Assigned',
    tone: 'progress',
    icon: 'clipboard-outline',
    detail: 'You have been assigned. Please confirm you can make it.',
    isPending: false,
    isTerminal: false,
  },
  Confirmed: {
    label: 'Confirmed',
    tone: 'positive',
    icon: 'checkmark-circle-outline',
    detail: 'You confirmed this shift.',
    isPending: false,
    isTerminal: false,
  },
  CheckedIn: {
    label: 'Checked in',
    tone: 'positive',
    icon: 'enter-outline',
    detail: 'You were checked in for this shift.',
    isPending: false,
    isTerminal: false,
  },
  Completed: {
    label: 'Completed',
    tone: 'positive',
    icon: 'ribbon-outline',
    detail: 'This shift is complete and your hours were confirmed.',
    isPending: false,
    isTerminal: true,
  },
  NoShow: {
    label: 'Did not attend',
    tone: 'caution',
    icon: 'remove-circle-outline',
    detail: 'You were not checked in for this shift.',
    isPending: false,
    isTerminal: true,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'close-outline',
    detail: 'This assignment was cancelled.',
    isPending: false,
    isTerminal: true,
  },
};

export function describeVolunteerAssignment(status: VolunteerAssignmentStatus): StateDescriptor {
  return VOLUNTEER_ASSIGNMENT_STATES[status] ?? VOLUNTEER_ASSIGNMENT_STATES.Assigned;
}

// ═════════════════════════════════════════════════════════════════════════════
// POLLS — §22, §24
// ═════════════════════════════════════════════════════════════════════════════

const POLL_STATES: Record<PollStatus, StateDescriptor> = {
  Draft: {
    label: 'Draft',
    tone: 'neutral',
    icon: 'create-outline',
    detail: 'Only you can see this poll.',
    isPending: false,
    isTerminal: false,
  },
  Scheduled: {
    label: 'Opens soon',
    tone: 'progress',
    icon: 'time-outline',
    detail: 'This poll has not opened yet.',
    isPending: false,
    isTerminal: false,
  },
  Open: {
    label: 'Open',
    tone: 'positive',
    icon: 'radio-button-on-outline',
    detail: 'This poll is open for voting.',
    isPending: false,
    isTerminal: false,
  },
  Closed: {
    label: 'Closed',
    tone: 'neutral',
    icon: 'lock-closed-outline',
    detail: 'Voting has closed.',
    isPending: false,
    isTerminal: true,
  },
  Cancelled: {
    label: 'Cancelled',
    tone: 'negative',
    icon: 'close-circle-outline',
    detail: 'This poll was cancelled.',
    isPending: false,
    isTerminal: true,
  },
  ResultsPublished: {
    label: 'Results published',
    tone: 'positive',
    icon: 'bar-chart-outline',
    detail: 'The results of this poll are published below.',
    isPending: false,
    isTerminal: true,
  },
};

export function describePoll(status: PollStatus): StateDescriptor {
  return POLL_STATES[status] ?? POLL_STATES.Draft;
}

const POLL_TRANSITIONS: Record<PollStatus, PollStatus[]> = {
  Draft: ['Scheduled', 'Open', 'Cancelled'],
  Scheduled: ['Open', 'Cancelled'],
  Open: ['Closed', 'Cancelled'],
  Closed: ['ResultsPublished'],
  Cancelled: [],
  ResultsPublished: [],
};

export function canTransitionPoll(from: PollStatus, to: PollStatus): boolean {
  return (POLL_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Whether the poll is in a state where a vote could be accepted.
 *
 * Advisory. `CommunityPoll.canVote` from the server is what the screen branches
 * on, because eligibility depends on audience membership the device cannot
 * evaluate.
 */
export function pollAcceptsVotes(status: PollStatus): boolean {
  return status === 'Open';
}
