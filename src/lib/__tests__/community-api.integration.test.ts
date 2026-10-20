// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life adapter integration tests (Phase 12)
//
// ⚠ These exercise the DEVELOPMENT ADAPTER, not a certified backend. ⚠
//
// The real API client, against the real gap handlers, over the real axios
// adapter. Nothing is stubbed between `submitMembershipApplication()` and the
// JSON the handler returns, so these tests exercise the route strings, the
// `{ data }` envelope, and the RFC 9457 problem documents becoming
// `FinancialError`s.
//
// They matter for a reason beyond the simulation: **this is the contract the
// backend is being asked to implement.** A request shape asserted here is the
// request shape in the gap register, and a refusal asserted here is a refusal
// the real backend will have to produce. When a gap closes, this file becomes
// the acceptance test for it.
//
// The B12 half is asserted separately, against the *certified* community-life
// handlers, because those routes are real and must keep working unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { setupCommunityGapMocks } from '@/mocks/handlers/community-gaps';
import { setupCommunityLifeMocks } from '@/mocks/handlers/community-life';
import { setupFinancialMocks } from '@/mocks/handlers/financial';
import { FinancialError } from '../financial-errors';
import * as gapApi from '../community-gap-api';
import * as b12 from '../community-life-api';
import { MOCK_CAUSES } from '@/mocks/financial-data';

/** The platform's RSVP routes, answered the way the server does (20 Oct 2026). */
function stubRsvps(adapter: MockAdapter, statusFor: (eventId: string) => string = () => 'Going') {
  const held = new Map<string, Record<string, unknown>>();
  const record = (eventId: string, status: string) => ({
    rsvpId: `rsvp-${eventId}`,
    eventId,
    attendeeUserId: 'me',
    status,
    partySize: 1,
    declineReason: 'None',
    respondedAt: '2026-10-20T10:00:00Z',
    revision: 1,
    waitlistPosition: status === 'Waitlisted' ? 3 : null,
  });
  adapter.onPut(/\/events\/([^/]+)\/rsvp$/).reply((config) => {
    const eventId = String(config.url).match(/\/events\/([^/]+)\/rsvp$/)![1];
    const row = record(eventId, statusFor(eventId));
    held.set(eventId, row);
    return [200, { data: row }];
  });
  adapter.onDelete(/\/events\/([^/]+)\/rsvp$/).reply((config) => {
    const eventId = String(config.url).match(/\/events\/([^/]+)\/rsvp$/)![1];
    held.delete(eventId);
    return [200, { data: record(eventId, 'Cancelled') }];
  });
  adapter.onGet(/\/rsvps\/mine/).reply(() => [
    200,
    { data: { items: [...held.values()], events: [], nextCursor: null, hasMore: false } },
  ]);
}

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

// ═════════════════════════════════════════════════════════════════════════════
// B12 — the certified half. These routes are REAL.
// ═════════════════════════════════════════════════════════════════════════════

describe('B12 events and organizations (certified)', () => {
  it('lists events with the parameters the endpoint actually binds', async () => {
    // Remediation Wave J — `timeFilter: 'upcoming'` is gone. There is no
    // `timeFilter` on `EventSearchParameters`; "upcoming" was already the
    // server's behaviour, because `IncludePast` defaults to false and the
    // repository excludes anything that has ended
    // (`CommunityEventRepository.cs:582-586`).
    const page = await b12.fetchEvents({ cityName: 'London' });

    expect(Array.isArray(page.items)).toBe(true);
    expect(page.totalCount).toBe(page.items.length);
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('sends the query string the route binds, not the one the client used to spell', async () => {
    // The regression this whole wave exists to prevent. Asserting on the *sent*
    // parameters rather than on a 200, because an unbound parameter is discarded
    // by the model binder and the route answers 200 either way — which is
    // exactly how eight filters stayed broken through four previous waves.
    const sent = b12.toEventBrowseQuery({
      query: 'drumming',
      cityName: 'London',
      category: 'Cultural Festival',
      free: true,
      sortBy: 'popular',
      startsAfter: '2026-07-13T00:00:00.000Z',
    });

    expect(sent).toMatchObject({
      q: 'drumming',
      city: 'London',
      free: true,
      // PascalCase: `sort` is parsed with `Enum.TryParse<EventSortOrder>`, so
      // 'popular' would have failed to parse and fallen back to `Soonest`.
      sort: 'MostPopular',
      startsAfter: '2026-07-13T00:00:00.000Z',
    });
    expect(typeof sent.category).toBe('string');

    // And the names the route does not bind are absent, not renamed onto
    // something that would also be discarded.
    for (const dropped of ['query', 'cityName', 'sortBy', 'filterType', 'timeFilter', 'latitude', 'longitude', 'radiusKm']) {
      expect(sent).not.toHaveProperty(dropped);
    }
  });

  it('sends the organization directory the names it binds', async () => {
    const sent = b12.toOrganizationBrowseQuery({
      query: 'union',
      cityName: 'London',
      category: 'Churches',
      verified: true,
      sortBy: 'name',
    });

    expect(sent).toMatchObject({ q: 'union', city: 'London', verified: true, sort: 'Name' });
    // `type`, never `category` — the route has no `category` property at all.
    expect(typeof sent.type).toBe('string');
    for (const dropped of ['query', 'cityName', 'category', 'sortBy', 'latitude', 'longitude', 'radiusKm']) {
      expect(sent).not.toHaveProperty(dropped);
    }
  });

  it('carries no distance on a browse, because the route resolves no centre', async () => {
    // This test used to be "computes distance server-side when given a point",
    // and it passed only because the development handler computed one from a
    // `latitude`/`longitude`/`radiusKm` triple the route does not bind. Against
    // the real server every event in a browse has no `distanceKm`, and the
    // handler now says the same thing.
    const page = await b12.fetchEvents({ cityName: 'London' });

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((event) => event.location.distanceKm === undefined)).toBe(true);
  });

  it('lists organizations and reports a total', async () => {
    const page = await b12.fetchOrganizations({ cityName: 'London' });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.totalCount).toBe(page.items.length);
  });

  it('turns a missing event into a FinancialError rather than an AxiosError', async () => {
    await expect(b12.fetchEvent('no-such-event')).rejects.toBeInstanceOf(FinancialError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Membership — GAP-001/002/003
// ═════════════════════════════════════════════════════════════════════════════

describe('membership discovery and programmes', () => {
  it('returns programmes with tiers, benefits and requirements', async () => {
    const page = await gapApi.discoverMemberships({});

    expect(page.items.length).toBeGreaterThan(0);
    const programme = page.items[0];
    expect(programme.tiers.length).toBeGreaterThan(0);
    expect(programme.tiers[0].benefits.length).toBeGreaterThan(0);
  });

  it('filters to free programmes', async () => {
    const page = await gapApi.discoverMemberships({ priceBand: 'free' });
    for (const programme of page.items) {
      expect(programme.tiers.some((tier) => !tier.price)).toBe(true);
    }
  });

  it('filters to programmes the caller is eligible for', async () => {
    const page = await gapApi.discoverMemberships({ eligibleOnly: true });
    for (const programme of page.items) {
      expect(programme.tiers.some((tier) => tier.requirements.every((r) => r.isMet))).toBe(true);
    }
  });

  it('reports a full tier as full rather than leaving the client to compare counts', async () => {
    const programme = await gapApi.fetchMembershipProgramme('org-1');
    const patron = programme.tiers.find((tier) => tier.name === 'Patron');

    expect(patron).toBeDefined();
    expect(patron?.isFull).toBe(true);
    expect(patron?.filledCount).toBe(patron?.capacity);
  });

  it('404s on an organization with no programme', async () => {
    await expect(gapApi.fetchMembershipProgramme('org-nonexistent')).rejects.toBeInstanceOf(
      FinancialError
    );
  });
});

describe('membership application', () => {
  it('lands in Pending where the organization reviews applications', async () => {
    const membership = await gapApi.submitMembershipApplication({
      organizationId: 'org-1',
      tierId: 'tier-na-standard',
      answers: { why: 'My family are members.' },
      idempotencyKey: 'idem-1',
    });

    expect(membership.status).toBe('Pending');
    expect(membership.membershipId).toBeTruthy();
    expect(membership.history.length).toBeGreaterThan(0);
  });

  it('refuses a tier that is full', async () => {
    await expect(
      gapApi.submitMembershipApplication({
        organizationId: 'org-1',
        tierId: 'tier-na-patron',
        answers: {},
      })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses a tier whose requirements are unmet — §19, server-side', async () => {
    // The student tier's enrolment proof is deliberately unmet in the seed.
    await expect(
      gapApi.submitMembershipApplication({
        organizationId: 'org-1',
        tierId: 'tier-na-student',
        answers: {},
      })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses a second application to a community the caller is already in', async () => {
    // §51's duplicate submission. `org-2` is Active in the seed.
    await expect(
      gapApi.submitMembershipApplication({
        organizationId: 'org-2',
        tierId: 'tier-rccg-member',
        answers: {},
      })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('cancels a membership and records it in the history', async () => {
    const created = await gapApi.submitMembershipApplication({
      organizationId: 'org-1',
      tierId: 'tier-na-standard',
      answers: {},
    });

    const cancelled = await gapApi.cancelMembership(created.membershipId, 'Changed my mind');

    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.history[cancelled.history.length - 1].status).toBe('Cancelled');
  });
});

describe('membership payment binding — GAP-003', () => {
  it('refuses activation without a settled payment identifier', async () => {
    // The load-bearing refusal: a route that activated on request alone would
    // let a client grant itself a paid membership.
    const created = await gapApi.submitMembershipApplication({
      organizationId: 'org-1',
      tierId: 'tier-na-standard',
      answers: {},
    });

    await expect(
      gapApi.attachMembershipPayment(created.membershipId, '')
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('activates and marks the binding as simulated when given one', async () => {
    const created = await gapApi.submitMembershipApplication({
      organizationId: 'org-1',
      tierId: 'tier-na-standard',
      answers: {},
    });

    const activated = await gapApi.attachMembershipPayment(created.membershipId, 'pi_test_123');

    expect(activated.status).toBe('Active');
    expect(activated.payment?.paymentIntentId).toBe('pi_test_123');
    expect(activated.payment?.receiptReference).toBeTruthy();
    // The honest field: B15 took the money and this binding is not real.
    expect(activated.payment?.bindingSource).toBe('simulated');
  });
});

describe('organization membership administration', () => {
  it('lists members for an organization the caller administers', async () => {
    const page = await gapApi.fetchOrganizationMembers('org-1', { state: 'Pending' });
    expect(page.items.length).toBeGreaterThan(0);
    for (const member of page.items) {
      expect(member.status).toBe('Pending');
    }
  });

  it('refuses the member list for an organization the caller does not administer', async () => {
    // §19: the refusal is the control, not the hidden button. `org-2` is a
    // plain Member in the seed.
    await expect(gapApi.fetchOrganizationMembers('org-2')).rejects.toBeInstanceOf(FinancialError);
  });

  it('approves a pending member', async () => {
    const page = await gapApi.fetchOrganizationMembers('org-1', { state: 'Pending' });
    const target = page.items[0];

    const decided = await gapApi.decideMembership(target.membershipId, 'approve');
    expect(decided.status).toBe('Active');
  });

  it('refuses an unknown decision', async () => {
    const page = await gapApi.fetchOrganizationMembers('org-1', { state: 'Active' });
    await expect(
      gapApi.decideMembership(page.items[0].membershipId, 'obliterate' as never)
    ).rejects.toBeInstanceOf(FinancialError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Recurring events — GAP-004/005
// ═════════════════════════════════════════════════════════════════════════════

describe('event series and occurrences', () => {
  it('expands a series into occurrences server-side', async () => {
    const page = await gapApi.fetchOccurrences('ser-1');

    expect(page.items.length).toBeGreaterThan(0);
    for (const occurrence of page.items) {
      // Identifiers the server minted, which a registration can refer to.
      expect(occurrence.occurrenceId).toContain('ser-1');
      expect(occurrence.seriesId).toBe('ser-1');
    }
  });

  it('marks exactly one upcoming occurrence as next', async () => {
    const page = await gapApi.fetchOccurrences('ser-1');
    expect(page.items.filter((occurrence) => occurrence.isNext).length).toBeLessThanOrEqual(1);
  });

  it('turns a recurrence exception into a cancelled occurrence', async () => {
    const series = await gapApi.fetchSeries('ser-1');
    expect(series.recurrence.exceptions.length).toBeGreaterThan(0);

    const page = await gapApi.fetchOccurrences('ser-1');
    const excepted = page.items.filter((occurrence) =>
      series.recurrence.exceptions.includes(occurrence.date)
    );
    for (const occurrence of excepted) {
      expect(occurrence.status).toBe('Cancelled');
    }
  });

  it('creates a series from a recurrence rule and expands it', async () => {
    const created = await gapApi.createEventSeries({
      title: 'Thursday choir practice',
      description: 'Every Thursday in the hall.',
      coverImage: '',
      category: 'Church Program',
      startDate: '2026-07-16',
      time: '19:00',
      endTime: '21:00',
      timezone: 'BST',
      recurrence: {
        frequency: 'Weekly',
        interval: 1,
        byWeekday: [4],
        endKind: 'AfterCount',
        until: null,
        count: 8,
        exceptions: [],
        description: null,
      },
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '88 Queens Road',
      publish: true,
    });

    expect(created.status).toBe('Published');
    expect(created.occurrenceCount).toBe(8);
    expect(created.nextOccurrence).toBeTruthy();
  });

  it('cancelling one occurrence adds an exception and leaves the series alone', async () => {
    const before = await gapApi.fetchOccurrences('ser-2');
    const target = before.items.find((occurrence) => occurrence.status === 'Scheduled');
    expect(target).toBeDefined();

    const cancelled = await gapApi.updateOccurrence(target!.occurrenceId, {
      status: 'Cancelled',
      reason: 'The hall is double-booked.',
    });

    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.cancellationReason).toBe('The hall is double-booked.');

    const series = await gapApi.fetchSeries('ser-2');
    expect(series.status).not.toBe('Cancelled');
    expect(series.recurrence.exceptions).toContain(target!.date);
  });

  it('rescheduling an occurrence keeps its original date', async () => {
    const before = await gapApi.fetchOccurrences('ser-2');
    const target = before.items.find((occurrence) => occurrence.status === 'Scheduled');

    const moved = await gapApi.updateOccurrence(target!.occurrenceId, { date: '2026-12-25' });

    expect(moved.status).toBe('Rescheduled');
    expect(moved.date).toBe('2026-12-25');
    expect(moved.originalDate).toBe(target!.date);
  });

  it('cancelling a series cancels its scheduled occurrences', async () => {
    await gapApi.cancelEventSeries('ser-3', 'No pitch available');

    const page = await gapApi.fetchOccurrences('ser-3');
    const stillScheduled = page.items.filter((occurrence) => occurrence.status === 'Scheduled');
    expect(stillScheduled).toEqual([]);
  });
});

describe('event registration — the platform RSVP since 20 Oct 2026', () => {
  beforeEach(() => {
    // Only the RSVP routes: registration no longer touches the simulation.
    mock.reset();
    stubRsvps(mock, (eventId) => (eventId === 'full-event' ? 'Waitlisted' : 'Going'));
  });

  it('registers by RSVPing Going, and the registration is the event', async () => {
    const registration = await gapApi.registerForEvent({ occurrenceId: 'occ-1' });
    expect(registration.status).toBe('Registered');
    expect(registration.registrationId).toBe('occ-1');
    expect(registration.occurrenceId).toBe('occ-1');
  });

  it('reports the waitlist the server decided', async () => {
    const registration = await gapApi.registerForEvent({ eventId: 'full-event' });
    expect(registration.status).toBe('Waitlisted');
    expect(registration.waitlistPosition).toBe(3);
  });

  it('cancels by withdrawing the RSVP and lists only what is held', async () => {
    const registration = await gapApi.registerForEvent({ occurrenceId: 'occ-2' });
    expect((await gapApi.fetchMyRegistrations()).map((row) => row.occurrenceId)).toEqual(['occ-2']);

    const cancelled = await gapApi.cancelRegistration(registration.registrationId);
    expect(cancelled.status).toBe('Cancelled');
    expect(await gapApi.fetchMyRegistrations()).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Fundraising — GAP-006/007, and the real-money boundary
// ═════════════════════════════════════════════════════════════════════════════

describe('fundraising campaigns', () => {
  it('substitutes B15 figures on a campaign backed by a real cause — §17', async () => {
    const campaign = await gapApi.fetchCampaign('camp-1');
    const cause = MOCK_CAUSES.find((candidate) => candidate.code === 'funeral-support-adeyemi');

    expect(cause).toBeDefined();
    // The four figures are B15's, and are marked as such.
    expect(campaign.progress.raised.source).toBe('backend');
    expect(campaign.progress.target.source).toBe('backend');
    expect(campaign.progress.percentage.source).toBe('backend');
    expect(campaign.progress.supporterCount.source).toBe('backend');

    expect(campaign.progress.raised.value.minorUnits).toBe(cause!.raised?.minorUnits);
    expect(campaign.progress.supporterCount.value).toBe(cause!.supporterCount);
  });

  it('computes the percentage on the server, never on the client', async () => {
    const campaign = await gapApi.fetchCampaign('camp-1');
    const raised = campaign.progress.raised.value.minorUnits;
    const target = campaign.progress.target.value?.minorUnits ?? 0;

    expect(campaign.progress.percentage.value).toBe(Math.round((raised / target) * 100));
    expect(campaign.progress.percentage.value).toBeLessThanOrEqual(100);
  });

  it('marks a campaign with no cause as simulated throughout', async () => {
    const campaign = await gapApi.fetchCampaign('camp-4');

    expect(campaign.causeCode).toBeNull();
    expect(campaign.progress.raised.source).toBe('simulated');
    expect(campaign.progress.raised.value.minorUnits).toBe(0);
    // And it cannot take money.
    expect(campaign.canDonate).toBe(false);
  });

  it('creates a campaign as a draft that cannot collect', async () => {
    const created = await gapApi.createCampaign({
      title: 'New roof for the hall',
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

    expect(created.status).toBe('Draft');
    expect(created.causeCode).toBeNull();
    expect(created.canDonate).toBe(false);
  });

  it('refuses a campaign without accepted terms — §15', async () => {
    await expect(
      gapApi.createCampaign({
        title: 'x',
        summary: 'y',
        story: 'z',
        coverImage: '',
        category: 'Other',
        targetAmount: 100,
        currency: 'GBP',
        beneficiaryType: 'Community',
        beneficiaryName: 'Us',
        organizationId: 'org-1',
        acceptedTerms: false,
      })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses campaign creation for an organization the caller cannot manage', async () => {
    await expect(
      gapApi.createCampaign({
        title: 'x',
        summary: 'y',
        story: 'z',
        coverImage: '',
        category: 'Other',
        targetAmount: 100,
        currency: 'GBP',
        beneficiaryType: 'Community',
        beneficiaryName: 'Us',
        organizationId: 'org-2',
        acceptedTerms: true,
      })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses an illegal lifecycle transition with a conflict', async () => {
    // A draft cannot be published without review.
    await expect(gapApi.actOnCampaign('camp-4', 'publish')).rejects.toBeInstanceOf(FinancialError);
    // Nor resumed, having never been paused.
    await expect(gapApi.actOnCampaign('camp-4', 'resume')).rejects.toBeInstanceOf(FinancialError);
  });

  it('walks a draft through review to collecting', async () => {
    const submitted = await gapApi.actOnCampaign('camp-4', 'submit');
    expect(submitted.status).toBe('PendingReview');
    expect(submitted.canDonate).toBe(false);

    const published = await gapApi.actOnCampaign('camp-4', 'publish');
    expect(published.status).toBe('Active');
    // Publishing is what connects it to a giving cause. Only then can it take money.
    expect(published.causeCode).toBeTruthy();
    expect(published.canDonate).toBe(true);
  });

  it('hides drafts and rejected campaigns from the public list', async () => {
    const page = await gapApi.fetchCampaigns({});
    for (const campaign of page.items) {
      if (['Draft', 'PendingReview', 'Rejected'].includes(campaign.status)) {
        expect(campaign.canManage).toBe(true);
      }
    }
  });

  it('carries a rejection reason a member can act on', async () => {
    const rejected = await gapApi.fetchCampaign('camp-5');
    expect(rejected.status).toBe('Rejected');
    expect(rejected.reviewNote).toBeTruthy();
  });
});

describe('campaign transparency — §17', () => {
  it('returns anonymous supporters with no identifier at all', async () => {
    const page = await gapApi.fetchCampaignSupporters('camp-1');
    const anonymous = page.items.filter((supporter) => supporter.isAnonymous);

    expect(anonymous.length).toBeGreaterThan(0);
    for (const supporter of anonymous) {
      // B15 stores no donor id on an anonymous donation, so there is nothing
      // for a client-side filter to have to hide.
      expect(supporter.userId).toBeNull();
    }
  });

  it('returns milestones aligned with the real target', async () => {
    const campaign = await gapApi.fetchCampaign('camp-1');
    const milestones = await gapApi.fetchCampaignMilestones('camp-1');

    expect(milestones.length).toBeGreaterThan(0);
    const largest = Math.max(...milestones.map((milestone) => milestone.target.minorUnits));
    expect(largest).toBe(campaign.progress.target.value?.minorUnits);
  });

  it('refuses an update from somebody who does not manage the campaign', async () => {
    await expect(
      gapApi.publishCampaignUpdate('camp-3', { title: 'x', body: 'y' })
    ).rejects.toBeInstanceOf(FinancialError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Volunteering — GAP-009/010/011
// ═════════════════════════════════════════════════════════════════════════════

describe('volunteer opportunities and applications', () => {
  it('reports a full opportunity as full with a reason', async () => {
    const opportunity = await gapApi.fetchOpportunity('opp-3');
    expect(opportunity.isFull).toBe(true);
    expect(opportunity.canApply).toBe(false);
    expect(opportunity.cannotApplyReason).toBeTruthy();
  });

  it('refuses a duplicate application', async () => {
    // `opp-2` already has a Pending application in the seed.
    await expect(
      gapApi.submitVolunteerApplication({ opportunityId: 'opp-2', answers: {} })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('applies and lands in Pending', async () => {
    const application = await gapApi.submitVolunteerApplication({
      opportunityId: 'opp-1',
      shiftId: 'sh-1',
      answers: { why: 'I stewarded last year.' },
    });

    expect(application.status).toBe('Pending');
    expect(application.submittedAt).toBeTruthy();
  });

  it('withdraws and reopens the ability to apply', async () => {
    const application = await gapApi.submitVolunteerApplication({
      opportunityId: 'opp-1',
      answers: {},
    });
    const withdrawn = await gapApi.withdrawVolunteerApplication(application.applicationId);

    expect(withdrawn.status).toBe('Withdrawn');

    const opportunity = await gapApi.fetchOpportunity('opp-1');
    expect(opportunity.myApplicationStatus).toBe('Withdrawn');
    expect(opportunity.canApply).toBe(true);
  });

  it('refuses the applicant queue for an opportunity the caller does not manage', async () => {
    await expect(gapApi.fetchApplicants('opp-3')).rejects.toBeInstanceOf(FinancialError);
  });

  it('approves an applicant and lets them be assigned', async () => {
    const queue = await gapApi.fetchApplicants('opp-1', { state: 'Pending' });
    const applicant = queue.items[0];

    const approved = await gapApi.decideVolunteerApplication(applicant.applicationId, 'approve');
    expect(approved.status).toBe('Approved');

    const assignment = await gapApi.assignVolunteer({
      applicationId: applicant.applicationId,
      shiftId: 'sh-1',
    });
    expect(assignment.status).toBe('Assigned');
    expect(assignment.shiftId).toBe('sh-1');
  });

  it('refuses assignment of somebody who has not been approved', async () => {
    const queue = await gapApi.fetchApplicants('opp-1', { state: 'Waitlisted' });
    if (queue.items.length === 0) return;

    await expect(
      gapApi.assignVolunteer({ applicationId: queue.items[0].applicationId })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('reports only organizer-confirmed hours — §34', async () => {
    const summary = await gapApi.fetchVolunteerHours();

    expect(summary.confirmedHours.source).toBe('simulated');
    // The seed has exactly one completed assignment with two confirmed hours.
    expect(summary.confirmedHours.value).toBe(2);
  });

  it('refuses opportunity creation without the volunteer permission', async () => {
    await expect(
      gapApi.createOpportunity({
        title: 'x',
        description: 'y',
        cause: 'Other',
        organizationId: 'org-2',
        cityName: 'London',
        areaName: 'Peckham',
        addressLine: '1 Road',
        requiredSkills: [],
        shifts: [],
        publish: true,
      })
    ).rejects.toBeInstanceOf(FinancialError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Polls — GAP-012, and §24's no-client-tally rule
// ═════════════════════════════════════════════════════════════════════════════

describe('polls and voting', () => {
  it('returns a result whose percentages are the server’s arithmetic', async () => {
    const result = await gapApi.fetchPollResult('poll-1');

    expect(result.areResultsVisible).toBe(true);
    expect(result.options).not.toBeNull();

    const total = result.options!.reduce((sum, option) => sum + option.count, 0);
    for (const option of result.options!) {
      expect(option.percentage).toBe(Math.round((option.count / total) * 100));
    }
  });

  it('withholds the options entirely on a poll that hides results', async () => {
    // `poll-2` disallows changes; the seed marks it as already voted, so it is
    // visible. A poll that hides results returns `options: null` rather than an
    // empty array a client would render as "nobody voted".
    const poll = await gapApi.fetchPoll('poll-3');
    expect(poll.allowsChange).toBe(false);
    expect(poll.hasVoted).toBe(false);

    const result = await gapApi.fetchPollResult('poll-3');
    expect(result.areResultsVisible).toBe(false);
    expect(result.options).toBeNull();
    expect(result.resultsHiddenReason).toBeTruthy();
  });

  it('counts a vote and returns the updated result', async () => {
    const before = await gapApi.fetchPollResult('poll-1');
    const beforeCount = before.options!.find((option) => option.optionId === 'po-2')!.count;

    const after = await gapApi.submitPollResponse({
      pollId: 'poll-1',
      selectedOptionIds: ['po-2'],
    });

    const afterCount = after.options!.find((option) => option.optionId === 'po-2')!.count;
    expect(afterCount).toBe(beforeCount + 1);
    expect(after.totalResponses).toBe(before.totalResponses + 1);
  });

  it('does not double-count when a member changes their vote', async () => {
    await gapApi.submitPollResponse({ pollId: 'poll-1', selectedOptionIds: ['po-1'] });
    const first = await gapApi.fetchPollResult('poll-1');
    const totalAfterFirst = first.totalResponses;

    await gapApi.submitPollResponse({ pollId: 'poll-1', selectedOptionIds: ['po-3'] });
    const second = await gapApi.fetchPollResult('poll-1');

    // One person, one vote — the previous choice is withdrawn before the new
    // one is counted.
    expect(second.totalResponses).toBe(totalAfterFirst);
  });

  it('refuses a second vote on a poll that disallows changes — §51', async () => {
    await expect(
      gapApi.submitPollResponse({ pollId: 'poll-2', selectedOptionIds: ['po-4'] })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses a vote on a closed poll', async () => {
    await expect(
      gapApi.submitPollResponse({ pollId: 'poll-4', selectedOptionIds: ['po-8'] })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses more selections than a multiple-choice poll allows', async () => {
    await expect(
      gapApi.submitPollResponse({
        pollId: 'poll-1',
        selectedOptionIds: ['po-1', 'po-2'],
      })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses an option that is not on the poll', async () => {
    await expect(
      gapApi.submitPollResponse({ pollId: 'poll-1', selectedOptionIds: ['po-nonsense'] })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses an empty vote', async () => {
    await expect(
      gapApi.submitPollResponse({ pollId: 'poll-1', selectedOptionIds: [] })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses an empty written answer', async () => {
    await expect(
      gapApi.submitPollResponse({ pollId: 'poll-3', selectedOptionIds: [], openResponse: '   ' })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses a poll with fewer than two options', async () => {
    await expect(
      gapApi.createPoll({
        question: 'Yes?',
        votingType: 'SingleChoice',
        options: [{ label: 'Yes' }],
        audience: 'Public',
        organizationId: 'org-1',
        isAnonymous: false,
        allowsChange: true,
        publish: true,
      })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('refuses poll creation without the poll permission', async () => {
    await expect(
      gapApi.createPoll({
        question: 'Should we?',
        votingType: 'SingleChoice',
        options: [{ label: 'Yes' }, { label: 'No' }],
        audience: 'Public',
        organizationId: 'org-2',
        isAnonymous: false,
        allowsChange: true,
        publish: true,
      })
    ).rejects.toBeInstanceOf(FinancialError);
  });

  it('creates a poll and opens it', async () => {
    const created = await gapApi.createPoll({
      question: 'Where should the summer picnic be?',
      votingType: 'SingleChoice',
      options: [{ label: 'Burgess Park' }, { label: 'Peckham Rye' }],
      audience: 'OrganizationMembers',
      organizationId: 'org-1',
      isAnonymous: false,
      allowsChange: true,
      publish: true,
    });

    expect(created.status).toBe('Open');
    expect(created.options.length).toBe(2);
    expect(created.totalResponses).toBe(0);
  });

  it('refuses to close a poll that is not open', async () => {
    await expect(gapApi.actOnPoll('poll-4', 'close')).rejects.toBeInstanceOf(FinancialError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Organizations, impact, search
// ═════════════════════════════════════════════════════════════════════════════

describe('organization dashboard and capabilities', () => {
  it('reports the caller’s capability set rather than deriving it', async () => {
    const owner = await gapApi.fetchOrganizationCapabilities('org-1');
    expect(owner.role).toBe('Owner');
    expect(owner.canApproveMembers).toBe(true);

    const member = await gapApi.fetchOrganizationCapabilities('org-2');
    expect(member.role).toBe('Member');
    expect(member.canApproveMembers).toBe(false);

    const organizer = await gapApi.fetchOrganizationCapabilities('org-3');
    expect(organizer.role).toBe('Organizer');
    // Partial: can run events and volunteers, cannot touch members or money.
    expect(organizer.canManageEvents).toBe(true);
    expect(organizer.canManageMembers).toBe(false);
    expect(organizer.canViewFinancials).toBe(false);
  });

  it('returns nothing for an organization the caller has no role in', async () => {
    const none = await gapApi.fetchOrganizationCapabilities('org-unknown');
    expect(none.role).toBeNull();
    expect(none.canManageMembers).toBe(false);
  });

  it('returns counts on the dashboard so a section can be skipped — §47', async () => {
    const dashboard = await gapApi.fetchOrganizationDashboard('org-1');

    expect(dashboard.counts).toBeDefined();
    expect(typeof dashboard.counts.pendingMemberApplications).toBe('number');
    expect(dashboard.metrics.length).toBeGreaterThan(0);
    expect(dashboard.analyticsSource).toBe('simulated');
  });

  it('sums real B15 figures into the one real dashboard metric', async () => {
    const dashboard = await gapApi.fetchOrganizationDashboard('org-1');
    const raised = dashboard.metrics.find((metric) => metric.key === 'raised');

    expect(raised?.money?.source).toBe('backend');
    expect(raised?.money?.value.minorUnits).toBeGreaterThan(0);
  });

  it('refuses analytics without the reporting permission', async () => {
    await expect(gapApi.fetchOrganizationAnalytics('org-2', '30d')).rejects.toBeInstanceOf(
      FinancialError
    );
  });
});

describe('impact and search', () => {
  it('marks every impact figure as simulated — §34', async () => {
    const impact = await gapApi.fetchCommunityImpact({ scope: 'member', period: '12m' });

    for (const figure of [
      impact.membersHelped,
      impact.volunteerHours,
      impact.eventsHosted,
      impact.eventsAttended,
      impact.pollsParticipated,
      impact.initiativesSupported,
      impact.fundsRaised,
    ]) {
      expect(figure.source).toBe('simulated');
    }
  });

  it('searches only the five types with no backend', async () => {
    const page = await gapApi.searchCommunity({ query: 'a' });

    for (const row of page.items) {
      expect(row.source).toBe('simulated');
      // Events and organizations come from B12 and are merged by the
      // repository, not by this route.
      expect(['event', 'organization']).not.toContain(row.entityType);
    }
  });

  it('returns nothing for an empty query rather than everything', async () => {
    const page = await gapApi.searchCommunity({ query: '' });
    expect(page.items).toEqual([]);
  });

  it('narrows recommendations by surface without re-ranking them', async () => {
    const hub = await gapApi.fetchCommunityRecommendations('hub');
    const volunteer = await gapApi.fetchCommunityRecommendations('volunteer');

    expect(hub.length).toBeGreaterThan(0);
    for (const recommendation of volunteer) {
      expect(recommendation.entityType).toBe('opportunity');
      expect(recommendation.reason.length).toBeGreaterThan(0);
    }
  });

  it('dismisses a recommendation across the session', async () => {
    const before = await gapApi.fetchCommunityRecommendations('hub');
    const target = before[0];

    await gapApi.dismissCommunityRecommendation(target.recommendationId);

    const after = await gapApi.fetchCommunityRecommendations('hub');
    expect(after.find((r) => r.recommendationId === target.recommendationId)).toBeUndefined();
  });
});

describe('neighbourhood binding — GAP-015', () => {
  it('marks the distance as real because B12 computed it', async () => {
    const page = await gapApi.fetchNeighborhoodEvents('nbh-peckham');

    expect(page.items.length).toBeGreaterThan(0);
    for (const row of page.items) {
      // The binding is simulated; the event and its distance are B12's.
      expect(row.distanceSource).toBe('backend');
      expect(row.neighborhoodId).toBe('nbh-peckham');
      expect(row.event.id).toBeTruthy();
    }
  });
});

// The hub summary (§47) is no longer an adapter route: `/hub/summary` was never
// served, and the hub composes its summary from the real reads. Its rails and
// counts are tested in `community-life-hub.test.ts`.

// ═════════════════════════════════════════════════════════════════════════════
// B12 writes — the certified routes Phase 12 extends rather than replaces
// ═════════════════════════════════════════════════════════════════════════════

describe('B12 event and organization writes (certified)', () => {
  it('creates a one-time event through the real route', async () => {
    // §58.2: a neighbourhood event, a one-off community event and a
    // hand-created event are all *this* route. Phase 12 adds a series
    // generator above it; it does not add a second event.
    const created = await b12.createEvent({
      title: 'Independence Day picnic',
      description: 'Bring a dish and a chair.',
      category: 'Picnic',
      date: '2026-10-03',
      time: '12:00',
      endTime: '18:00',
      cityName: 'London',
      areaName: 'Camberwell',
      addressLine: 'Burgess Park',
    });

    expect(created.id).toBeTruthy();
    expect(created.title).toBe('Independence Day picnic');
    expect(created.rsvpStatus).toBeNull();

    // And it is immediately readable through the same certified route.
    const fetched = await b12.fetchEvent(created.id);
    expect(fetched.title).toBe('Independence Day picnic');
  });

  it('saves a draft through the same route', async () => {
    const draft = await b12.createEvent({
      title: 'Draft event',
      description: 'Not finished.',
      category: 'Other',
      date: '2026-11-01',
      time: '10:00',
      endTime: '12:00',
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: 'TBD',
      status: 'Draft',
    });

    expect(draft.id).toBeTruthy();
  });

  it('updates an event', async () => {
    const created = await b12.createEvent({
      title: 'Original title',
      description: 'x',
      category: 'Other',
      date: '2026-11-02',
      time: '10:00',
      endTime: '12:00',
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '1 Road',
    });

    const updated = await b12.updateEvent(created.id, { title: 'Corrected title' });
    expect(updated.title).toBe('Corrected title');
  });

  it('sets an RSVP — the real B12 intent signal, distinct from registration', async () => {
    const created = await b12.createEvent({
      title: 'RSVP test',
      description: 'x',
      category: 'Other',
      date: '2026-11-03',
      time: '10:00',
      endTime: '12:00',
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '1 Road',
    });

    // Remediation Wave A′. This used to assert against `rsvpStatus` on an
    // `Event`, because the client believed RSVP was a field on the event and
    // sent it to the organizer's edit route. The RSVP routes return an
    // `RsvpRecord`, and its `status` is the server's stored answer — which is
    // not always the one that was asked for.
    const going = await b12.setEventRsvp(created.id, 'Going');
    expect(going.status).toBe('Going');
    expect(going.eventId).toBe(created.id);

    // Withdrawal is its own route rather than a null status, mirroring the
    // separation Jobs makes between a candidate withdrawing and an employer
    // deciding: leaving is the attendee's own action.
    const withdrawn = await b12.withdrawEventRsvp(created.id);
    expect(withdrawn.status).toBe('Cancelled');
  });

  it('deletes an event', async () => {
    const created = await b12.createEvent({
      title: 'Temporary',
      description: 'x',
      category: 'Other',
      date: '2026-11-04',
      time: '10:00',
      endTime: '12:00',
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '1 Road',
    });

    const result = await b12.deleteEvent(created.id);
    expect(result.success).toBe(true);
  });

  it('creates an organization through the real route', async () => {
    const created = await b12.createOrganization({
      name: 'Camberwell Ghanaian Union',
      category: 'Associations',
      description: 'A new union for Ghanaians in Camberwell.',
      cityName: 'London',
      areaName: 'Camberwell',
      addressLine: '5 Denmark Hill',
      // Was `hasMembershipPlans: true`, a field the create route has never
      // accepted. `membershipPolicy` is the question it does ask.
      membershipPolicy: 'RequestToJoin',
    });

    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Camberwell Ghanaian Union');
    // A brand new organization is unverified, which is the honest default.
    expect(created.isVerified).toBe(false);
    expect(created.followersCount).toBe(0);
  });

  it('returns the merged calendar of events and public holidays', async () => {
    // Remediation Wave J. This used to pass `'London'`. `GET /community-life/calendar`
    // binds `from`, `to`, `countryCode` and `neighborhoodAreaId` and has no city
    // parameter under any spelling, so the argument was discarded and this test
    // was asserting on the unfiltered feed while reading as though it had asked
    // for one city's.
    const calendar = await b12.fetchCalendar();

    expect(calendar.length).toBeGreaterThan(0);
    expect(calendar.some((entry) => entry.type === 'Event')).toBe(true);
    expect(calendar.some((entry) => entry.type === 'Holiday')).toBe(true);
  });

  it('narrows the calendar by the country the route actually binds', async () => {
    // `countryCode` is a real filter. The event fixtures carry no country, so a
    // country-scoped calendar is holidays only — which is the correct answer for
    // rows with nothing to match on, not a bug in the filter.
    const gb = await b12.fetchCalendar({ countryCode: 'GB' });

    expect(gb.length).toBeGreaterThan(0);
    expect(gb.every((entry) => entry.type === 'Holiday')).toBe(true);
  });

  it('turns a 404 on a missing organization into a FinancialError', async () => {
    await expect(b12.fetchOrganization('org-does-not-exist')).rejects.toBeInstanceOf(
      FinancialError
    );
  });

  it('classifies a write failure as mutating, not as a definite failure', async () => {
    // The property that stops a timed-out publish being retried into a
    // duplicate. `updateEvent` on a missing id is the closest reachable case.
    await expect(b12.updateEvent('no-such-event', { title: 'x' })).rejects.toBeInstanceOf(
      FinancialError
    );
  });
});
