/**
 * Community Life state machines — Frontend Phase 12
 *
 * §53 asks for explicit state models. These tests assert the three properties a
 * screen actually relies on:
 *
 *   1. Every state in every union has a descriptor. A missing one would render
 *      as a fallback badge saying the wrong thing, and nothing in TypeScript
 *      catches a `Record` whose value is reachable but wrong.
 *   2. Terminal and pending are mutually exclusive and correctly assigned —
 *      this drives polling and, for anything financial, whether an idempotency
 *      key may be released.
 *   3. The transition tables have no path that would let a screen draw a button
 *      the server must refuse.
 */

import {
  campaignAcceptsDonations,
  canApplyForMembership,
  canApplyToVolunteer,
  canCancelMembership,
  canCancelRegistration,
  canPayForMembership,
  canRegister,
  canRenewMembership,
  canTransitionCampaign,
  canTransitionMembership,
  canTransitionPoll,
  canTransitionSeries,
  canTransitionVolunteerApplication,
  canWithdrawVolunteerApplication,
  describeCampaign,
  describeGiving,
  describeMembership,
  describeOccurrence,
  describePoll,
  describeRegistration,
  describeSeries,
  describeVolunteerApplication,
  describeVolunteerAssignment,
  isGivingSettled,
  isPaymentSettled,
  isPaymentSuccessful,
  membershipGrantsBenefits,
  pollAcceptsVotes,
} from '../community-state';
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
import { GIVING_STATUSES, PAYMENT_STATUSES } from '@/types/financial';

const MEMBERSHIP_STATES: MembershipStatus[] = [
  'NotAMember', 'Eligible', 'Ineligible', 'Draft', 'Pending', 'Approved', 'Rejected',
  'PaymentPending', 'PaymentFailed', 'Active', 'RenewalDue', 'Expired', 'Suspended', 'Cancelled',
];

const CAMPAIGN_STATES: CampaignStatus[] = [
  'Draft', 'PendingReview', 'Rejected', 'Published', 'Active', 'Paused', 'GoalReached',
  'DeadlineReached', 'Completed', 'Refunding', 'Cancelled', 'Closed',
];

const SERIES_STATES: EventSeriesStatus[] = ['Draft', 'Published', 'Paused', 'Completed', 'Cancelled'];
const OCCURRENCE_STATES: OccurrenceStatus[] = ['Scheduled', 'Rescheduled', 'Cancelled', 'Completed'];
const REGISTRATION_STATES: RegistrationStatus[] = [
  'NotRegistered', 'Registered', 'Waitlisted', 'CheckedIn', 'Attended', 'NoShow', 'Cancelled',
];
const APPLICATION_STATES: VolunteerApplicationStatus[] = [
  'NotApplied', 'Draft', 'Pending', 'Approved', 'Rejected', 'Waitlisted', 'Withdrawn',
  'Cancelled', 'Completed',
];
const ASSIGNMENT_STATES: VolunteerAssignmentStatus[] = [
  'Assigned', 'Confirmed', 'CheckedIn', 'Completed', 'NoShow', 'Cancelled',
];
const POLL_STATES: PollStatus[] = ['Draft', 'Scheduled', 'Open', 'Closed', 'Cancelled', 'ResultsPublished'];

describe('every state has a real descriptor', () => {
  const cases: [string, string[], (state: never) => { label: string; icon: string; detail: string }][] = [
    ['membership', MEMBERSHIP_STATES, describeMembership as never],
    ['campaign', CAMPAIGN_STATES, describeCampaign as never],
    ['series', SERIES_STATES, describeSeries as never],
    ['occurrence', OCCURRENCE_STATES, describeOccurrence as never],
    ['registration', REGISTRATION_STATES, describeRegistration as never],
    ['volunteer application', APPLICATION_STATES, describeVolunteerApplication as never],
    ['volunteer assignment', ASSIGNMENT_STATES, describeVolunteerAssignment as never],
    ['poll', POLL_STATES, describePoll as never],
  ];

  it.each(cases)('%s states all describe themselves', (_name, states, describe_) => {
    for (const state of states) {
      const descriptor = describe_(state as never);
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(descriptor.icon.length).toBeGreaterThan(0);
      expect(descriptor.detail.length).toBeGreaterThan(0);
      // §46: an icon, so state is never communicated by colour alone.
      expect(descriptor.icon).not.toBe('');
    }
  });

  it('gives distinct labels to distinct membership states', () => {
    const labels = MEMBERSHIP_STATES.map((state) => describeMembership(state).label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('never marks a state both pending and terminal', () => {
    for (const state of [...MEMBERSHIP_STATES, ...CAMPAIGN_STATES, ...APPLICATION_STATES]) {
      const descriptor =
        MEMBERSHIP_STATES.includes(state as MembershipStatus)
          ? describeMembership(state as MembershipStatus)
          : CAMPAIGN_STATES.includes(state as CampaignStatus)
            ? describeCampaign(state as CampaignStatus)
            : describeVolunteerApplication(state as VolunteerApplicationStatus);

      expect(descriptor.isPending && descriptor.isTerminal).toBe(false);
    }
  });
});

describe('membership transitions', () => {
  it('lets nothing out of a terminal state', () => {
    expect(canTransitionMembership('Rejected', 'Active')).toBe(false);
    expect(canTransitionMembership('Cancelled', 'Active')).toBe(false);
  });

  it('routes a paid application through payment before active', () => {
    expect(canTransitionMembership('Approved', 'PaymentPending')).toBe(true);
    expect(canTransitionMembership('PaymentPending', 'Active')).toBe(true);
    expect(canTransitionMembership('PaymentPending', 'PaymentFailed')).toBe(true);
  });

  it('lets a failed payment be retried but not silently succeed', () => {
    expect(canTransitionMembership('PaymentFailed', 'PaymentPending')).toBe(true);
    expect(canTransitionMembership('PaymentFailed', 'Active')).toBe(false);
  });

  it('lets an expired membership be rejoined', () => {
    expect(canTransitionMembership('Expired', 'Pending')).toBe(true);
  });

  it('never lets a membership jump straight from not-a-member to active', () => {
    expect(canTransitionMembership('NotAMember', 'Active')).toBe(false);
  });
});

describe('membership display rules', () => {
  it('offers apply only where applying makes sense', () => {
    const canApply = MEMBERSHIP_STATES.filter(canApplyForMembership);
    expect(canApply).toEqual(['NotAMember', 'Eligible', 'Draft', 'Expired']);
  });

  it('offers pay on approved, failed and renewal-due', () => {
    const canPay = MEMBERSHIP_STATES.filter(canPayForMembership);
    expect(canPay).toEqual(['Approved', 'PaymentFailed', 'RenewalDue']);
  });

  it('offers renew only where a renewal is meaningful', () => {
    expect(MEMBERSHIP_STATES.filter(canRenewMembership)).toEqual(['RenewalDue', 'Expired']);
  });

  it('never offers cancel on a state that is already over', () => {
    expect(canCancelMembership('Cancelled')).toBe(false);
    expect(canCancelMembership('Rejected')).toBe(false);
    expect(canCancelMembership('Expired')).toBe(false);
  });

  it('keeps benefits during the renewal grace period', () => {
    // Deliberate: somebody one day past their renewal date has not lost their
    // benefits, and taking them away early is a product decision the client is
    // not entitled to make.
    expect(membershipGrantsBenefits('RenewalDue')).toBe(true);
    expect(membershipGrantsBenefits('Active')).toBe(true);
    expect(membershipGrantsBenefits('Suspended')).toBe(false);
    expect(membershipGrantsBenefits('Expired')).toBe(false);
    expect(membershipGrantsBenefits('PaymentPending')).toBe(false);
  });
});

describe('campaign transitions', () => {
  it('requires review before a campaign can go live', () => {
    expect(canTransitionCampaign('Draft', 'Active')).toBe(false);
    expect(canTransitionCampaign('Draft', 'PendingReview')).toBe(true);
    expect(canTransitionCampaign('PendingReview', 'Published')).toBe(true);
  });

  it('lets a rejected campaign be fixed and resubmitted', () => {
    expect(canTransitionCampaign('Rejected', 'PendingReview')).toBe(true);
    expect(canTransitionCampaign('Rejected', 'Draft')).toBe(true);
  });

  it('closes terminal states', () => {
    expect(canTransitionCampaign('Completed', 'Active')).toBe(false);
    expect(canTransitionCampaign('Cancelled', 'Active')).toBe(false);
    expect(canTransitionCampaign('Closed', 'Active')).toBe(false);
  });

  it('accepts donations only in the states that should collect', () => {
    const collecting = CAMPAIGN_STATES.filter(campaignAcceptsDonations);
    expect(collecting).toEqual(['Published', 'Active', 'GoalReached']);
    // Explicitly not: a paused, closed, draft or rejected campaign.
    expect(campaignAcceptsDonations('Paused')).toBe(false);
    expect(campaignAcceptsDonations('Draft')).toBe(false);
    expect(campaignAcceptsDonations('Refunding')).toBe(false);
  });
});

describe('series and occurrence transitions', () => {
  it('does not resurrect a cancelled series', () => {
    expect(canTransitionSeries('Cancelled', 'Published')).toBe(false);
    expect(canTransitionSeries('Completed', 'Published')).toBe(false);
  });

  it('lets a published series be paused and resumed', () => {
    expect(canTransitionSeries('Published', 'Paused')).toBe(true);
    expect(canTransitionSeries('Paused', 'Published')).toBe(true);
  });

  it('marks a cancelled occurrence terminal', () => {
    expect(describeOccurrence('Cancelled').isTerminal).toBe(true);
    expect(describeOccurrence('Scheduled').isTerminal).toBe(false);
  });
});

describe('registration display rules', () => {
  it('offers register only where there is no live place', () => {
    expect(REGISTRATION_STATES.filter(canRegister)).toEqual(['NotRegistered', 'Cancelled']);
  });

  it('offers cancellation on a held place and on a waitlist place', () => {
    expect(REGISTRATION_STATES.filter(canCancelRegistration)).toEqual(['Registered', 'Waitlisted']);
  });

  it('treats a waitlist place as pending', () => {
    expect(describeRegistration('Waitlisted').isPending).toBe(true);
  });
});

describe('volunteer transitions', () => {
  it('does not let a rejected application become approved', () => {
    expect(canTransitionVolunteerApplication('Rejected', 'Approved')).toBe(false);
    expect(canTransitionVolunteerApplication('Withdrawn', 'Approved')).toBe(false);
  });

  it('lets a waitlisted applicant be promoted', () => {
    expect(canTransitionVolunteerApplication('Waitlisted', 'Approved')).toBe(true);
  });

  it('offers apply only where no application is live', () => {
    expect(APPLICATION_STATES.filter(canApplyToVolunteer)).toEqual([
      'NotApplied',
      'Draft',
      'Withdrawn',
    ]);
  });

  it('offers withdraw only while a decision is outstanding', () => {
    expect(APPLICATION_STATES.filter(canWithdrawVolunteerApplication)).toEqual([
      'Pending',
      'Waitlisted',
    ]);
  });
});

describe('poll transitions', () => {
  it('accepts votes only while open', () => {
    expect(POLL_STATES.filter(pollAcceptsVotes)).toEqual(['Open']);
  });

  it('does not reopen a closed poll', () => {
    expect(canTransitionPoll('Closed', 'Open')).toBe(false);
    expect(canTransitionPoll('Cancelled', 'Open')).toBe(false);
  });

  it('publishes results only after closing', () => {
    expect(canTransitionPoll('Closed', 'ResultsPublished')).toBe(true);
    expect(canTransitionPoll('Open', 'ResultsPublished')).toBe(false);
  });
});

describe('financial settlement — the idempotency-release rule', () => {
  it('describes every B15 giving status', () => {
    for (const status of GIVING_STATUSES) {
      const descriptor = describeGiving(status);
      expect(descriptor.label.length).toBeGreaterThan(0);
    }
  });

  it('treats a pending donation as unsettled, so a retry resumes', () => {
    // The whole reason this matters: releasing on `Pending` turns the member's
    // next tap into a second donation.
    expect(isGivingSettled('Pending')).toBe(false);
    expect(isGivingSettled('Completed')).toBe(true);
    expect(isGivingSettled('Failed')).toBe(true);
    expect(isGivingSettled('Refunded')).toBe(true);
    expect(isGivingSettled('Cancelled')).toBe(true);
  });

  it('treats an authorized-but-uncaptured payment as unsettled', () => {
    // Money reserved is not money taken, and capture can still fail.
    expect(isPaymentSettled('Authorized')).toBe(false);
    expect(isPaymentSettled('Pending')).toBe(false);
    expect(isPaymentSettled('Draft')).toBe(false);
  });

  it('treats captured and settled as settled', () => {
    expect(isPaymentSettled('Captured')).toBe(true);
    expect(isPaymentSettled('Settled')).toBe(true);
    expect(isPaymentSettled('Failed')).toBe(true);
    expect(isPaymentSettled('Cancelled')).toBe(true);
    expect(isPaymentSettled('Expired')).toBe(true);
    expect(isPaymentSettled('Refunded')).toBe(true);
  });

  it('lands an unknown future payment status on "not settled"', () => {
    // The safe direction: a status B15 adds later must not release a key.
    expect(isPaymentSettled('SomethingNew' as never)).toBe(false);
  });

  it('calls only captured and settled a success', () => {
    const successes = PAYMENT_STATUSES.filter(isPaymentSuccessful);
    expect(successes).toEqual(['Captured', 'Settled']);
    // §8: an authorized payment has not paid for anything yet.
    expect(isPaymentSuccessful('Authorized')).toBe(false);
    expect(isPaymentSuccessful('Refunded')).toBe(false);
  });
});
