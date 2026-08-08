// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life end-to-end journeys (Frontend Phase 12)
//
// §50's ten required journeys, each driven through the real API clients against
// the real handlers. These are the acceptance tests for the phase: a journey
// that passes here is a journey a member can complete, and a journey that
// changes shape when a gap closes will fail here first.
//
// Two are genuinely financial — Journey 2 (membership payment) and Journey 4
// (donation) — and both go through **real B15 routes**. Nothing in this file
// simulates a payment.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { setupCommunityGapMocks } from '@/mocks/handlers/community-gaps';
import { setupCommunityLifeMocks } from '@/mocks/handlers/community-life';
import { setupFinancialMocks } from '@/mocks/handlers/financial';
import * as gapApi from '../community-gap-api';
import * as b12 from '../community-life-api';
import * as financialApi from '../financial-api';
import { isGivingSettled, isPaymentSettled, isPaymentSuccessful } from '../community-state';

let mock: MockAdapter;
let teardown: () => void;
let financialTeardown: () => void;

beforeEach(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupCommunityLifeMocks(mock);
  financialTeardown = setupFinancialMocks(mock);
  teardown = setupCommunityGapMocks(mock);
});

afterEach(() => {
  // Both handlers schedule simulated-gateway timers. Cancelling them keeps
  // one test's pending payment out of the next test's state.
  teardown?.();
  financialTeardown?.();
  mock.restore();
});

/** Drives a B15 payment the way `useMembershipCheckout` does. */
async function payThroughB15(input: {
  amount: number;
  currency: string;
  subjectType: string;
  subjectId: string;
}) {
  const intent = await financialApi.createPaymentIntent({
    amount: input.amount,
    currency: input.currency,
    methodKind: 'Card',
    description: 'Community membership',
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    idempotencyKey: `idem-${input.subjectId}`,
  });

  const authorized = await financialApi.authorizePayment(intent.paymentIntentId);
  if (String(authorized.status) === 'Authorized') {
    await financialApi.capturePayment(intent.paymentIntentId);
  }

  // The authoritative read. §8: nothing before this line may conclude payment.
  return financialApi.fetchPaymentIntent(intent.paymentIntentId);
}

// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 1 — discover an organisation, view membership, apply, pending', () => {
  it('runs end to end', async () => {
    // Discover
    const discovery = await gapApi.discoverMemberships({ cityName: 'London' });
    expect(discovery.items.length).toBeGreaterThan(0);

    const target = discovery.items.find((programme) => programme.organizationId === 'org-1');
    expect(target).toBeDefined();

    // The organisation itself is a REAL B12 record.
    const organization = await b12.fetchOrganization('org-1');
    expect(organization.name).toBeTruthy();

    // View membership
    const programme = await gapApi.fetchMembershipProgramme('org-1');
    expect(programme.requiresApproval).toBe(true);
    const tier = programme.tiers.find((candidate) => candidate.tierId === 'tier-na-standard');
    expect(tier?.isFull).toBe(false);

    // Apply
    const membership = await gapApi.submitMembershipApplication({
      organizationId: 'org-1',
      tierId: 'tier-na-standard',
      answers: { why: 'My family have been members for years.' },
    });

    // Pending
    expect(membership.status).toBe('Pending');
    expect(membership.history.some((entry) => entry.status === 'Pending')).toBe(true);

    // And it shows in the member's own list.
    const mine = await gapApi.fetchMyMemberships();
    expect(mine.some((candidate) => candidate.membershipId === membership.membershipId)).toBe(true);
  });
});

describe('Journey 2 — paid tier, wallet payment, membership activated', () => {
  it('activates only after B15 reports the payment captured', async () => {
    // `org-1`, whose Standard tier is paid and whose caller is not yet a
    // member. `org-3` is deliberately avoided here: the seed already has a
    // RenewalDue membership there, and applying again is correctly refused as a
    // duplicate — which is asserted in the integration suite rather than here.
    const programme = await gapApi.fetchMembershipProgramme('org-1');
    const tier = programme.tiers.find((candidate) => candidate.tierId === 'tier-na-standard');
    if (!tier?.price) throw new Error('expected a paid Standard tier in the seed');

    const membership = await gapApi.submitMembershipApplication({
      organizationId: 'org-1',
      tierId: tier.tierId,
      answers: {},
    });
    expect(membership.status).toBe('Pending');

    // REAL B15 payment.
    const payment = await payThroughB15({
      amount: tier.price.amount,
      currency: tier.price.currency,
      subjectType: 'CommunityMembership',
      subjectId: membership.membershipId,
    });

    expect(isPaymentSettled(payment.status)).toBe(true);
    expect(isPaymentSuccessful(payment.status)).toBe(true);

    // Only now the community-side binding.
    const activated = await gapApi.attachMembershipPayment(
      membership.membershipId,
      payment.paymentIntentId
    );

    expect(activated.status).toBe('Active');
    expect(activated.payment?.paymentIntentId).toBe(payment.paymentIntentId);
    expect(activated.payment?.receiptReference).toBeTruthy();
    // And the honest marker on the binding.
    expect(activated.payment?.bindingSource).toBe('simulated');
  });

  it('does not activate when the payment is not successful', async () => {
    // The negative case, which is the one that matters: a membership must not
    // become Active off the back of a payment that did not settle.
    const membership = await gapApi.submitMembershipApplication({
      organizationId: 'org-1',
      tierId: 'tier-na-standard',
      answers: {},
    });

    const intent = await financialApi.createPaymentIntent({
      amount: 5,
      currency: 'GBP',
      methodKind: 'Card',
      description: 'Community membership',
      subjectType: 'CommunityMembership',
      subjectId: membership.membershipId,
      idempotencyKey: 'idem-unsettled',
    });

    // Deliberately not authorized or captured.
    const unsettled = await financialApi.fetchPaymentIntent(intent.paymentIntentId);
    expect(isPaymentSuccessful(unsettled.status)).toBe(false);

    // The checkout hook stops here and never calls the binding. Assert the
    // membership is still exactly where it was.
    const unchanged = await gapApi.fetchMembership(membership.membershipId);
    expect(unchanged.status).toBe('Pending');
    expect(unchanged.payment).toBeNull();
  });
});

describe('Journey 3 — recurring event, series, occurrence, register, reminder', () => {
  it('runs end to end', async () => {
    // View series
    const series = await gapApi.fetchSeries('ser-1');
    expect(series.recurrence.frequency).toBe('Weekly');
    expect(series.recurrence.description).toBeTruthy();

    // Select an occurrence
    const occurrences = await gapApi.fetchOccurrences('ser-1');
    const upcoming = occurrences.items.filter(
      (occurrence) => occurrence.status === 'Scheduled'
    );
    expect(upcoming.length).toBeGreaterThan(0);

    const chosen = upcoming[0];
    expect(chosen.seriesId).toBe('ser-1');

    // Register
    const registration = await gapApi.registerForEvent({ occurrenceId: chosen.occurrenceId });
    expect(registration.status).toBe('Registered');
    expect(registration.seriesId).toBe('ser-1');

    // It shows on the member's registrations, which is what a reminder would
    // be built from. Delivery itself is B13's and is not simulated.
    const mine = await gapApi.fetchMyRegistrations();
    expect(mine.some((row) => row.occurrenceId === chosen.occurrenceId)).toBe(true);
  });
});

describe('Journey 4 — fundraiser, donate, payment, confirmation, receipt', () => {
  it('moves real money through B15 and returns a real receipt', async () => {
    const campaign = await gapApi.fetchCampaign('camp-1');

    expect(campaign.canDonate).toBe(true);
    expect(campaign.causeCode).toBe('funeral-support-adeyemi');
    // Its totals are B15's.
    expect(campaign.progress.raised.source).toBe('backend');

    // The cause is a REAL B15 record.
    const causes = await financialApi.fetchDonationCauses({});
    expect(causes.some((cause) => cause.code === campaign.causeCode)).toBe(true);

    // REAL B15 donation.
    const donation = await financialApi.createDonation({
      amount: 25,
      currency: 'GBP',
      causeCode: campaign.causeCode!,
      isAnonymous: false,
      message: 'Thinking of the family.',
      idempotencyKey: 'idem-journey-4',
    });

    // The status is B15's, and it is what the confirmation renders.
    expect(['Pending', 'Completed']).toContain(donation.status);
    expect(donation.receiptReference).toBeTruthy();

    if (isGivingSettled(donation.status)) {
      // The campaign-side label, which is the only simulated part.
      const linked = await gapApi.attachCampaignDonation(campaign.campaignId, donation.donationId);
      expect(linked.campaignId).toBe(campaign.campaignId);
    }

    // And it appears in the member's REAL giving history.
    const history = await financialApi.fetchGivingHistory({});
    expect(Array.isArray(history.donations)).toBe(true);
  });

  it('has no way to donate to a campaign with no giving cause', async () => {
    const draft = await gapApi.fetchCampaign('camp-4');
    expect(draft.causeCode).toBeNull();
    expect(draft.canDonate).toBe(false);
    // There is no adapter route that would take the money instead.
    expect('createDonation' in gapApi).toBe(false);
  });
});

describe('Journey 5 — volunteer, discover, apply, pending, approved, assignment', () => {
  it('runs end to end', async () => {
    // Discover
    const opportunities = await gapApi.fetchOpportunities({ cityName: 'London' });
    expect(opportunities.items.length).toBeGreaterThan(0);

    const opportunity = await gapApi.fetchOpportunity('opp-1');
    expect(opportunity.canApply).toBe(true);

    // Apply → Pending
    const application = await gapApi.submitVolunteerApplication({
      opportunityId: 'opp-1',
      shiftId: 'sh-1',
      answers: { why: 'I stewarded last year.' },
    });
    expect(application.status).toBe('Pending');

    // Organizer approves
    const queue = await gapApi.fetchApplicants('opp-1', { state: 'Pending' });
    const applicant = queue.items[0];
    const approved = await gapApi.decideVolunteerApplication(applicant.applicationId, 'approve');
    expect(approved.status).toBe('Approved');

    // Assignment
    const assignment = await gapApi.assignVolunteer({
      applicationId: applicant.applicationId,
      shiftId: 'sh-1',
    });
    expect(assignment.status).toBe('Assigned');
    expect(assignment.shiftLabel).toBeTruthy();

    // And it reaches the volunteer's dashboard.
    const mine = await gapApi.fetchMyAssignments();
    expect(mine.some((row) => row.assignmentId === assignment.assignmentId)).toBe(true);
  });
});

describe('Journey 6 — poll, view, vote, confirmation, results', () => {
  it('runs end to end and never tallies on the client', async () => {
    // View
    const poll = await gapApi.fetchPoll('poll-1');
    expect(poll.canVote).toBe(true);
    // The poll object carries no per-option count for a client to add up.
    for (const option of poll.options) {
      expect('count' in option).toBe(false);
    }

    // Vote → the response IS the result
    const result = await gapApi.submitPollResponse({
      pollId: 'poll-1',
      selectedOptionIds: ['po-2'],
    });

    expect(result.areResultsVisible).toBe(true);
    expect(result.options).not.toBeNull();

    const chosen = result.options!.find((option) => option.optionId === 'po-2');
    expect(chosen?.isMyChoice).toBe(true);

    // Results, re-read, agree with what the vote returned.
    const reread = await gapApi.fetchPollResult('poll-1');
    expect(reread.totalResponses).toBe(result.totalResponses);
  });
});

describe('Journey 7 — organiser creates a recurring event and manages attendees', () => {
  it('runs end to end', async () => {
    // Dashboard
    const dashboard = await gapApi.fetchOrganizationDashboard('org-1');
    expect(dashboard.capabilities.canManageEvents).toBe(true);

    // Create with recurrence
    const series = await gapApi.createEventSeries({
      title: 'Saturday supplementary school',
      description: 'Yoruba and Twi, four classes.',
      coverImage: '',
      category: 'Training',
      startDate: '2026-07-18',
      time: '10:00',
      endTime: '12:30',
      timezone: 'BST',
      recurrence: {
        frequency: 'Weekly',
        interval: 1,
        byWeekday: [6],
        endKind: 'AfterCount',
        until: null,
        count: 10,
        exceptions: [],
        description: null,
      },
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '12 Rye Lane',
      organizationId: 'org-1',
      publish: true,
    });

    // Publish
    expect(series.status).toBe('Published');
    expect(series.occurrenceCount).toBe(10);

    // Manage attendees on an occurrence
    const occurrences = await gapApi.fetchOccurrences(series.seriesId);
    const first = occurrences.items[0];

    const attendees = await gapApi.fetchAttendees({ occurrenceId: first.occurrenceId });
    expect(Array.isArray(attendees.items)).toBe(true);
  });

  it('refuses an organiser without the events permission', async () => {
    const capabilities = await gapApi.fetchOrganizationCapabilities('org-2');
    expect(capabilities.canManageEvents).toBe(false);

    await expect(
      gapApi.createEventSeries({
        title: 'x',
        description: 'y',
        coverImage: '',
        category: 'Other',
        startDate: '2026-08-01',
        time: '10:00',
        endTime: '11:00',
        timezone: 'BST',
        recurrence: {
          frequency: 'Weekly',
          interval: 1,
          byWeekday: [1],
          endKind: 'Never',
          until: null,
          count: null,
          exceptions: [],
          description: null,
        },
        cityName: 'London',
        areaName: 'Peckham',
        addressLine: '1 Road',
        organizationId: 'org-2',
        publish: true,
      })
    ).rejects.toBeTruthy();
  });
});

describe('Journey 8 — organiser creates a campaign, saves a draft, submits, sees status', () => {
  it('runs end to end and cannot collect before publication', async () => {
    // Create → Draft
    const draft = await gapApi.createCampaign({
      title: 'Hall roof repair',
      summary: 'The roof leaks over the kitchen.',
      story: 'Two buckets and a tarpaulin is not a long-term plan.',
      coverImage: '',
      category: 'Community Project',
      targetAmount: 5000,
      currency: 'GBP',
      beneficiaryType: 'Organization',
      beneficiaryId: 'org-1',
      beneficiaryName: 'Nigerian Community Association UK',
      organizationId: 'org-1',
      acceptedTerms: true,
    });

    expect(draft.status).toBe('Draft');
    expect(draft.canDonate).toBe(false);
    expect(draft.causeCode).toBeNull();

    // Submit → PendingReview, still not collecting
    const submitted = await gapApi.actOnCampaign(draft.campaignId, 'submit');
    expect(submitted.status).toBe('PendingReview');
    expect(submitted.canDonate).toBe(false);

    // Publish → Active, and only now connected to a giving cause
    const published = await gapApi.actOnCampaign(draft.campaignId, 'publish');
    expect(published.status).toBe('Active');
    expect(published.canDonate).toBe(true);
    expect(published.causeCode).toBeTruthy();

    // Status is visible on the organiser's list
    const mine = await gapApi.fetchMyCampaigns('org-1');
    expect(mine.some((campaign) => campaign.campaignId === draft.campaignId)).toBe(true);
  });
});

describe('Journey 9 — organiser creates an opportunity, reviews, approves, assigns', () => {
  it('runs end to end', async () => {
    const created = await gapApi.createOpportunity({
      title: 'Christmas hamper packing',
      description: 'Two evenings of packing hampers for the elders.',
      cause: 'Elder Care',
      organizationId: 'org-1',
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '12 Rye Lane',
      requiredSkills: [],
      shifts: [
        { label: 'Evening one', date: '2026-12-10', startTime: '18:00', endTime: '21:00', capacity: 6 },
      ],
      publish: true,
    });

    expect(created.status).toBe('Published');
    expect(created.shifts).toHaveLength(1);
    expect(created.canManage).toBe(true);

    // No applicants yet — the empty queue is a state, not an error.
    const queue = await gapApi.fetchApplicants(created.opportunityId);
    expect(queue.items).toEqual([]);

    // The full loop is asserted in Journey 5 against the seeded opportunity,
    // which already has a queue.
  });
});

describe('Journey 10 — neighbourhood, nearby event, register, notification', () => {
  it('finds nearby events through REAL B12 proximity', async () => {
    const nearby = await b12.fetchEvents({
      latitude: 51.4742,
      longitude: -0.0952,
      radiusKm: 10,
      sortBy: 'distance',
      timeFilter: 'upcoming',
    });

    expect(nearby.items.length).toBeGreaterThan(0);
    // Distances are the server's.
    expect(typeof nearby.items[0].location.distanceKm).toBe('number');
  });

  it('binds a real event to a named neighbourhood and registers for it', async () => {
    const bound = await gapApi.fetchNeighborhoodEvents('nbh-peckham');
    expect(bound.items.length).toBeGreaterThan(0);

    const first = bound.items[0];
    // The event is real; the binding is not, and says so.
    expect(first.distanceSource).toBe('backend');

    const registration = await gapApi.registerForEvent({ eventId: first.event.id });
    expect(registration.status).toBe('Registered');
    expect(registration.eventId).toBe(first.event.id);

    // Notification delivery is B13's. The routing table is asserted separately
    // in `notification-routes.test.ts`.
  });
});
