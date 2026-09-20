// ═════════════════════════════════════════════════════════════════════════════
//
//   ⚠  BACKEND GAP / DEVELOPMENT ONLY  ⚠
//
//   NOTHING IN THIS FILE MIRRORS A CERTIFIED BACKEND CONTRACT.
//
//   Every route registered here is invented. The certified platform has no
//   membership aggregate, no event series, no fundraising campaign lifecycle,
//   no volunteer opportunity, no poll, no organization role and no community
//   analytics projection. These handlers exist so the Phase 12 flows can be
//   built, reviewed and tested now — and so that closing each gap is a change
//   of import rather than a redesign.
//
//   Three safeguards, none of which is a comment:
//
//     * The prefix is `/community-gap/v0`, never `/community-life` (B12 owns
//       that) and never `/financial` (B15 owns that). A call that escaped to a
//       real deployment 404s at the gateway.
//     * `setupCommunityGapMocks` refuses to register in a release build.
//     * Every screen behind these routes renders `<CommunityGapNotice>`, which
//       names the missing contract on the screen itself.
//
//   ── Two things this simulation does that matter ──────────────────────────
//
//   **It reads real money rather than inventing it.** A campaign carrying a
//   `causeCode` has its `target`, `raised`, `percentage` and `supporterCount`
//   replaced from B15's real `DonationCause` and re-marked `backend` before it
//   leaves this file. §17 forbids inventing financial figures, and the only
//   honest way to satisfy that while the campaign wrapper is simulated is to
//   let the real numbers through and label them.
//
//   **It says no.** Role checks refuse with 403, duplicate votes with 409, full
//   opportunities with 409, closed polls with 409, illegal campaign transitions
//   with 409. A flow tested against forgiving mocks is a flow that breaks the
//   first time a real backend refuses, and §51 requires every one of those
//   states to be handled.
//
//   See `src/config/community-gaps.ts` and
//   `frontend-phase-12-advanced-community-life-backend-gap-register.md`.
//
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';
import { COMMUNITY_GAP_PREFIX, areCommunityGapsEnabled } from '@/config/community-gaps';
import { MOCK_CAUSES, money } from '../financial-data';
import { mockEvents } from '../community-life-data';
import {
  AREA_TO_NEIGHBORHOOD,
  MOCK_ANNOUNCEMENTS,
  MOCK_APPLICANTS,
  MOCK_ASSIGNMENTS,
  MOCK_CAMPAIGNS_SEED,
  MOCK_CAMPAIGN_MILESTONES,
  MOCK_CAMPAIGN_UPDATES,
  MOCK_CAPABILITIES,
  MOCK_FUND_USAGE,
  MOCK_MEMBERSHIPS,
  MOCK_MY_ORGANIZATIONS,
  MOCK_NEIGHBORHOODS,
  MOCK_OPEN_RESPONSES,
  MOCK_OPPORTUNITIES,
  MOCK_ORG_MEMBERS,
  MOCK_POLLS,
  MOCK_POLL_TALLIES,
  MOCK_PROGRAMMES,
  MOCK_RECOMMENDATIONS,
  MOCK_SERIES,
  MOCK_SUPPORTERS,
  MOCK_VOLUNTEER_APPLICATIONS,
  dateDaysAhead,
  isoDaysAhead,
} from '../community-gap-data';
import type {
  CommunityAnnouncement,
  CommunityMembership,
  CommunityPoll,
  EventOccurrence,
  EventRegistration,
  EventSeries,
  FundraisingCampaign,
  MembershipProgramme,
  OrganizationMember,
  PollResult,
  RecurrenceRule,
  VolunteerApplicant,
  VolunteerApplication,
  VolunteerAssignment,
  VolunteerOpportunity,
} from '@/types/community-advanced';

const ROOT = COMMUNITY_GAP_PREFIX;

/** `axios-mock-adapter` wants a fixed-arity tuple, not a loose array. */
type MockReply = [number, unknown];

function ok(data: unknown): MockReply {
  return [200, { data }];
}

function page<T>(items: T[], cursor?: string, take = 20): MockReply {
  const start = cursor ? Number(cursor) : 0;
  const slice = items.slice(start, start + take);
  const next = start + take;
  return ok({
    items: slice,
    nextCursor: next < items.length ? String(next) : null,
    hasMore: next < items.length,
    totalCount: items.length,
  });
}

function problem(status: number, errorCode: string, detail: string): MockReply {
  return [
    status,
    {
      type: `https://docs.diaspora.app/errors/${errorCode}`,
      title: 'Request refused',
      status,
      detail,
      // `code`, as PlatformProblem writes it. These mocks sent `errorCode`,
      // which matched the client's old lookup and nothing the platform ever sent —
      // so mocked runs agreed with the defect instead of exposing it.
      code: errorCode,
    },
  ];
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function body<T>(config: { data?: unknown }): T {
  try {
    return config.data ? (JSON.parse(String(config.data)) as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function params(config: { params?: Record<string, unknown> }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.params ?? {})) {
    if (value !== undefined && value !== null) out[key] = String(value);
  }
  return out;
}

/** The nth segment from the end of a path. `segment(url, 0)` is the last. */
function segment(url: string | undefined, fromEnd: number): string {
  const parts = (url ?? '').split('?')[0].split('/').filter(Boolean);
  return parts[parts.length - 1 - fromEnd] ?? '';
}

/** The signed-in development user. Matches the auth mock. */
const ME = 'user-123';

/**
 * Registers the simulated routes — and only in a development build.
 *
 * The guard is here as well as in `community-gap-api.ts` because defence at one
 * layer is a decision somebody can accidentally undo. A release bundle registers
 * nothing, so even a screen that ignored `areCommunityGapsEnabled()` would get a
 * 404 rather than a convincing fake membership approval.
 */
export function setupCommunityGapMocks(mock: MockAdapter): () => void {
  if (!areCommunityGapsEnabled()) {
    return () => undefined;
  }

  // eslint-disable-next-line no-console
  console.warn(
    '[MOCK][BACKEND GAP] Registering SIMULATED community routes under ' +
      `${ROOT}. Memberships, event series, campaign lifecycles, volunteer ` +
      'opportunities, polls, organization roles and community analytics do not ' +
      'exist in the certified backend.'
  );

  // ── Session state ──────────────────────────────────────────────────────────

  let programmes: MembershipProgramme[] = MOCK_PROGRAMMES.map((p) => ({ ...p }));
  let memberships: CommunityMembership[] = MOCK_MEMBERSHIPS.map((m) => ({ ...m }));
  const orgMembers: Record<string, OrganizationMember[]> = Object.fromEntries(
    Object.entries(MOCK_ORG_MEMBERS).map(([id, list]) => [id, list.map((m) => ({ ...m }))])
  );
  let series: EventSeries[] = MOCK_SERIES.map((s) => ({ ...s }));
  let campaigns: FundraisingCampaign[] = MOCK_CAMPAIGNS_SEED.map((c) => ({ ...c }));
  let opportunities: VolunteerOpportunity[] = MOCK_OPPORTUNITIES.map((o) => ({ ...o }));
  let applications: VolunteerApplication[] = MOCK_VOLUNTEER_APPLICATIONS.map((a) => ({ ...a }));
  const applicants: Record<string, VolunteerApplicant[]> = Object.fromEntries(
    Object.entries(MOCK_APPLICANTS).map(([id, list]) => [id, list.map((a) => ({ ...a }))])
  );
  let assignments: VolunteerAssignment[] = MOCK_ASSIGNMENTS.map((a) => ({ ...a }));
  let polls: CommunityPoll[] = MOCK_POLLS.map((p) => ({ ...p }));
  const tallies: Record<string, Record<string, number>> = JSON.parse(
    JSON.stringify(MOCK_POLL_TALLIES)
  );
  const openResponses: Record<string, string[]> = JSON.parse(JSON.stringify(MOCK_OPEN_RESPONSES));
  let registrations: EventRegistration[] = [];
  let announcements: CommunityAnnouncement[] = MOCK_ANNOUNCEMENTS.map((a) => ({ ...a }));
  const dismissedRecommendations = new Set<string>();

  /**
   * Occurrences, expanded once at registration and then mutated.
   *
   * Expanded **here**, on the server side of the boundary, exactly as the
   * proposed contract requires — §10 forbids the client evaluating a recurrence
   * rule, and identifiers minted on a device could not be referred to by a
   * registration or a reminder.
   */
  const occurrences: Record<string, EventOccurrence[]> = {};

  function expand(s: EventSeries): EventOccurrence[] {
    const rule = s.recurrence;
    const out: EventOccurrence[] = [];
    const limit = rule.endKind === 'AfterCount' ? (rule.count ?? 12) : 16;
    const stepDays = stepFor(rule);

    let dayOffset = -stepDays * Math.min(s.completedCount, 6);
    let made = 0;

    while (made < limit) {
      const date = dateDaysAhead(dayOffset);
      if (rule.endKind === 'OnDate' && rule.until && date > rule.until) break;

      const isException = rule.exceptions.includes(date);
      const isPast = date < dateDaysAhead(0);

      out.push({
        occurrenceId: `${s.seriesId}-occ-${made}`,
        seriesId: s.seriesId,
        title: s.title,
        date,
        time: '18:30',
        endTime: '20:00',
        timezone: s.timezone,
        location: s.location,
        status: isException ? 'Cancelled' : isPast ? 'Completed' : 'Scheduled',
        originalDate: null,
        cancellationReason: isException ? 'The hall is unavailable that week.' : null,
        capacity: s.seriesId === 'ser-3' ? 12 : null,
        registeredCount: s.seriesId === 'ser-3' ? 12 : 6,
        isFull: s.seriesId === 'ser-3',
        myRegistration: 'NotRegistered',
        isNext: false,
      });

      dayOffset += stepDays;
      made += 1;
    }

    const nextIndex = out.findIndex((o) => o.status === 'Scheduled');
    if (nextIndex >= 0) out[nextIndex].isNext = true;

    return out;
  }

  function stepFor(rule: RecurrenceRule): number {
    switch (rule.frequency) {
      case 'Daily':
        return rule.interval;
      case 'Weekly':
        return 7 * rule.interval;
      case 'Monthly':
        return 30 * rule.interval;
      case 'Yearly':
        return 365 * rule.interval;
      default:
        return 30 * rule.interval;
    }
  }

  for (const s of series) {
    occurrences[s.seriesId] = expand(s);
    s.nextOccurrence = occurrences[s.seriesId].find((o) => o.isNext) ?? null;
  }

  // ── The one place real money enters ────────────────────────────────────────

  /**
   * Substitutes B15's real cause figures into a campaign's progress block.
   *
   * This is the whole reason a Phase 12 campaign page can show a number at all.
   * Where `causeCode` resolves to a real `DonationCause`, the four progress
   * fields are replaced with B15's and re-marked `backend`; where it does not,
   * they stay as the seed placeholders and stay marked `simulated`. §17.
   *
   * `percentage` is computed here — on the server side of the boundary — from
   * B15's own `raised` and `target`, never on the device. The client receives a
   * number and renders it.
   */
  function withRealProgress(campaign: FundraisingCampaign): FundraisingCampaign {
    if (!campaign.causeCode) return campaign;

    const cause = MOCK_CAUSES.find((c) => c.code === campaign.causeCode);
    if (!cause) return campaign;

    const raised = cause.raised ?? money(0, 'GBP');
    const target = cause.target ?? null;
    const percentage =
      target && target.minorUnits > 0
        ? Math.min(100, Math.round((raised.minorUnits / target.minorUnits) * 100))
        : 0;

    return {
      ...campaign,
      progress: {
        ...campaign.progress,
        target: { value: target, source: 'backend' },
        raised: { value: raised, source: 'backend' },
        percentage: { value: percentage, source: 'backend' },
        supporterCount: { value: cause.supporterCount, source: 'backend' },
      },
    };
  }

  // ── Authorization, refused server-side ─────────────────────────────────────

  /**
   * The caller's capability set for an organization.
   *
   * Every role-gated route below consults this and returns a 403 rather than
   * relying on the client having hidden a button. §19: the hidden button is a
   * convenience; this is the control.
   */
  function capabilitiesFor(organizationId: string) {
    return (
      MOCK_CAPABILITIES[organizationId] ?? {
        organizationId,
        role: null,
        canManageMembers: false,
        canApproveMembers: false,
        canManageTiers: false,
        canManageEvents: false,
        canManageCampaigns: false,
        canManageVolunteers: false,
        canManagePolls: false,
        canPublishAnnouncements: false,
        canViewAnalytics: false,
        canViewFinancials: false,
      }
    );
  }

  const forbidden = (what: string) =>
    problem(403, 'community.forbidden', `You do not have permission to ${what} for this organisation.`);

  // ═══════════════════════════════════════════════════════════════════════════
  // HUB
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/hub/summary$`)).reply((config) => {
    const q = params(config);
    const city = (q.cityName ?? 'London').toLowerCase();

    const cityEvents = mockEvents.filter((e) => e.location.cityName.toLowerCase() === city);
    const upcoming = cityEvents.slice(0, 6);
    const nearby = [...cityEvents]
      .sort((a, b) => (a.location.distanceKm ?? 999) - (b.location.distanceKm ?? 999))
      .slice(0, 6);

    const activeCampaigns = campaigns
      .filter((c) => c.status === 'Active' || c.status === 'Published' || c.status === 'GoalReached')
      .map(withRealProgress)
      .slice(0, 4);

    const openOpportunities = opportunities.filter((o) => o.status === 'Published').slice(0, 4);
    const openPolls = polls.filter((p) => p.status === 'Open').slice(0, 4);

    return ok({
      upcomingEvents: upcoming,
      nearbyEvents: nearby,
      myMemberships: memberships,
      myOrganizations: MOCK_MY_ORGANIZATIONS,
      activeCampaigns,
      openOpportunities,
      openPolls,
      announcements: announcements.slice(0, 4),
      neighborhoodActivity: {
        neighborhoodId: 'nbh-peckham',
        neighborhoodName: 'Peckham',
        source: 'simulated',
        upcomingEventCount: cityEvents.length,
        activeCampaignCount: activeCampaigns.length,
        openOpportunityCount: openOpportunities.length,
        openPollCount: openPolls.length,
        newMemberCount: 14,
      },
      recommendations: MOCK_RECOMMENDATIONS.filter(
        (r) => !dismissedRecommendations.has(r.recommendationId)
      ).slice(0, 5),
      counts: {
        upcomingEvents: cityEvents.length,
        myMemberships: memberships.length,
        activeCampaigns: campaigns.filter((c) => c.status === 'Active').length,
        openOpportunities: opportunities.filter((o) => o.status === 'Published').length,
        openPolls: polls.filter((p) => p.status === 'Open').length,
        unreadAnnouncements: announcements.length,
      },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMBERSHIP
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/communities/memberships/discover$`)).reply((config) => {
    const q = params(config);
    let list = [...programmes];

    // §7: a private programme is never returned to somebody who is not in it.
    list = list.filter(
      (p) =>
        p.visibility === 'Public' ||
        p.visibility === 'Unlisted' ||
        memberships.some((m) => m.organizationId === p.organizationId)
    );

    if (q.query) {
      const needle = q.query.toLowerCase();
      list = list.filter(
        (p) =>
          p.organizationName.toLowerCase().includes(needle) ||
          p.summary.toLowerCase().includes(needle)
      );
    }
    if (q.category && q.category !== 'All') list = list.filter((p) => p.category === q.category);
    if (q.countryCode) list = list.filter((p) => p.countryCode === q.countryCode);
    if (q.cityName) {
      list = list.filter(
        (p) => p.location?.cityName.toLowerCase() === q.cityName.toLowerCase()
      );
    }
    if (q.priceBand === 'free') {
      list = list.filter((p) => p.tiers.some((t) => !t.price));
    }
    if (q.priceBand === 'paid') {
      list = list.filter((p) => p.tiers.some((t) => Boolean(t.price)));
    }
    if (q.eligibleOnly === 'true') {
      list = list.filter((p) => p.tiers.some((t) => t.requirements.every((r) => r.isMet)));
    }

    return page(list, q.cursor, Number(q.take ?? 20));
  });

  mock.onGet(new RegExp(`${ROOT}/communities/memberships/me$`)).reply(() => ok(memberships));

  mock.onGet(new RegExp(`${ROOT}/communities/[^/]+/membership$`)).reply((config) => {
    const organizationId = segment(config.url, 1);
    const programme = programmes.find((p) => p.organizationId === organizationId);
    if (!programme) {
      return problem(404, 'community.programme.notFound', 'This community has no membership programme.');
    }
    if (programme.visibility === 'Private' && !memberships.some((m) => m.organizationId === organizationId)) {
      return problem(403, 'community.programme.private', 'This is a private community.');
    }
    return ok(programme);
  });

  // The organization's member list. Role-gated.
  mock.onGet(new RegExp(`${ROOT}/communities/[^/]+/memberships$`)).reply((config) => {
    const organizationId = segment(config.url, 1);
    const caps = capabilitiesFor(organizationId);
    if (!caps.canManageMembers) return forbidden('view members');

    const q = params(config);
    let list = orgMembers[organizationId] ?? [];
    if (q.state) list = list.filter((m) => m.status === q.state);
    if (q.query) {
      const needle = q.query.toLowerCase();
      list = list.filter((m) => m.displayName.toLowerCase().includes(needle));
    }
    return page(list, q.cursor, Number(q.take ?? 20));
  });

  mock.onGet(new RegExp(`${ROOT}/communities/memberships/[^/]+$`)).reply((config) => {
    const membershipId = segment(config.url, 0);
    const membership = memberships.find((m) => m.membershipId === membershipId);
    return membership
      ? ok(membership)
      : problem(404, 'community.membership.notFound', 'Membership not found.');
  });

  mock.onPost(new RegExp(`${ROOT}/communities/[^/]+/memberships/applications$`)).reply((config) => {
    const organizationId = segment(config.url, 2);
    const request = body<{ tierId: string; answers: Record<string, string> }>(config);
    const programme = programmes.find((p) => p.organizationId === organizationId);

    if (!programme) {
      return problem(404, 'community.programme.notFound', 'This community has no membership programme.');
    }
    if (!programme.isOpen) {
      return problem(409, 'community.programme.closed', 'This community has closed applications for now.');
    }

    const tier = programme.tiers.find((t) => t.tierId === request.tierId);
    if (!tier) return problem(404, 'community.tier.notFound', 'That membership tier does not exist.');
    if (tier.isFull) {
      return problem(409, 'community.tier.full', `The ${tier.name} tier is full.`);
    }
    if (tier.requirements.some((r) => !r.isMet)) {
      return problem(
        409,
        'community.tier.ineligible',
        'You do not meet every requirement for this tier yet.'
      );
    }

    const existing = memberships.find(
      (m) => m.organizationId === organizationId && m.status !== 'Cancelled' && m.status !== 'Rejected'
    );
    if (existing) {
      // §51's "duplicate submission". The idempotency key means a *retry*
      // returns the same membership rather than a conflict; a genuinely new
      // application to a community you are already in is refused.
      return problem(409, 'community.membership.duplicate', 'You already have a membership here.');
    }

    // Free tier with no approval step activates immediately; anything else
    // waits. Two different flows, both reachable in the seed data.
    const needsPayment = Boolean(tier.price);
    const status: CommunityMembership['status'] = programme.requiresApproval
      ? 'Pending'
      : needsPayment
        ? 'Approved'
        : 'Active';

    const membership: CommunityMembership = {
      membershipId: newId('mem'),
      organizationId,
      organizationName: programme.organizationName,
      organizationLogo: programme.organizationLogo,
      tierId: tier.tierId,
      tierName: tier.name,
      status,
      price: tier.price,
      billingPeriod: tier.billingPeriod,
      benefits: tier.benefits,
      joinedAt: status === 'Active' ? nowIso() : null,
      expiresAt: null,
      renewalDueAt: null,
      isRenewable: tier.billingPeriod !== 'Lifetime',
      payment: null,
      history: [{ id: newId('h'), status, occurredAt: nowIso(), actor: 'Member' }],
    };

    memberships = [membership, ...memberships];
    programmes = programmes.map((p) =>
      p.organizationId === organizationId
        ? { ...p, myStatus: status, myMembershipId: membership.membershipId }
        : p
    );

    return [201, { data: membership }];
  });

  mock.onPost(new RegExp(`${ROOT}/communities/memberships/[^/]+/cancel$`)).reply((config) => {
    const membershipId = segment(config.url, 1);
    const index = memberships.findIndex((m) => m.membershipId === membershipId);
    if (index === -1) return problem(404, 'community.membership.notFound', 'Membership not found.');

    const updated: CommunityMembership = {
      ...memberships[index],
      status: 'Cancelled',
      history: [
        ...memberships[index].history,
        { id: newId('h'), status: 'Cancelled', occurredAt: nowIso(), actor: 'Member' },
      ],
    };
    memberships[index] = updated;
    programmes = programmes.map((p) =>
      p.organizationId === updated.organizationId
        ? { ...p, myStatus: 'NotAMember', myMembershipId: null }
        : p
    );
    return ok(updated);
  });

  mock.onPost(new RegExp(`${ROOT}/communities/memberships/[^/]+/renew$`)).reply((config) => {
    const membershipId = segment(config.url, 1);
    const index = memberships.findIndex((m) => m.membershipId === membershipId);
    if (index === -1) return problem(404, 'community.membership.notFound', 'Membership not found.');

    const current = memberships[index];
    if (!current.isRenewable) {
      return problem(409, 'community.membership.notRenewable', 'This membership does not need renewing.');
    }

    // A paid renewal waits for money; a free one just extends.
    const updated: CommunityMembership = {
      ...current,
      status: current.price ? 'PaymentPending' : 'Active',
      expiresAt: current.price ? current.expiresAt : isoDaysAhead(365),
      history: [
        ...current.history,
        {
          id: newId('h'),
          status: current.price ? 'PaymentPending' : 'Active',
          occurredAt: nowIso(),
          actor: 'Member',
        },
      ],
    };
    memberships[index] = updated;
    return ok(updated);
  });

  /**
   * Binds a settled B15 payment to a membership. COMMUNITY-LIFE-GAP-003.
   *
   * The refusal on a missing `paymentIntentId` is not defensive
   * over-engineering — it is the shape of the real contract. Activation
   * follows a *settled payment*, and a route that activated on request alone
   * would be a route that lets a client grant itself a paid membership.
   */
  mock.onPost(new RegExp(`${ROOT}/communities/memberships/[^/]+/payments$`)).reply((config) => {
    const membershipId = segment(config.url, 1);
    const request = body<{ paymentIntentId?: string }>(config);

    if (!request.paymentIntentId) {
      return problem(
        400,
        'community.membership.paymentRequired',
        'A settled payment identifier is required to activate a paid membership.'
      );
    }

    const index = memberships.findIndex((m) => m.membershipId === membershipId);
    if (index === -1) return problem(404, 'community.membership.notFound', 'Membership not found.');

    const current = memberships[index];
    const updated: CommunityMembership = {
      ...current,
      status: 'Active',
      joinedAt: current.joinedAt ?? nowIso(),
      expiresAt: current.billingPeriod === 'Lifetime' ? null : isoDaysAhead(365),
      renewalDueAt: current.billingPeriod === 'Lifetime' ? null : isoDaysAhead(335),
      payment: {
        paymentIntentId: request.paymentIntentId,
        paymentStatus: 'Captured',
        amount: current.price ?? money(0, 'GBP'),
        receiptReference: `RCP-${request.paymentIntentId.slice(-8).toUpperCase()}`,
        attemptedAt: nowIso(),
        completedAt: nowIso(),
        // The honest field: B15 took the money, and *this* binding is simulated.
        bindingSource: 'simulated',
      },
      history: [
        ...current.history,
        { id: newId('h'), status: 'Active', occurredAt: nowIso(), actor: 'System' },
      ],
    };
    memberships[index] = updated;
    programmes = programmes.map((p) =>
      p.organizationId === updated.organizationId ? { ...p, myStatus: 'Active' } : p
    );
    return ok(updated);
  });

  mock.onPost(new RegExp(`${ROOT}/communities/memberships/[^/]+/decision$`)).reply((config) => {
    const membershipId = segment(config.url, 1);
    const request = body<{ decision: string; reason?: string }>(config);

    for (const [organizationId, list] of Object.entries(orgMembers)) {
      const index = list.findIndex((m) => m.membershipId === membershipId);
      if (index === -1) continue;

      const caps = capabilitiesFor(organizationId);
      if (!caps.canApproveMembers) return forbidden('decide membership applications');

      const statusByDecision: Record<string, OrganizationMember['status']> = {
        approve: 'Active',
        reject: 'Rejected',
        waitlist: 'Pending',
        suspend: 'Suspended',
        reinstate: 'Active',
        remove: 'Cancelled',
      };
      const next = statusByDecision[request.decision];
      if (!next) {
        return problem(400, 'community.decision.invalid', `Unknown decision "${request.decision}".`);
      }

      const updated: OrganizationMember = {
        ...list[index],
        status: next,
        joinedAt: next === 'Active' ? (list[index].joinedAt ?? nowIso()) : list[index].joinedAt,
      };
      list[index] = updated;
      return ok(updated);
    }

    return problem(404, 'community.membership.notFound', 'Membership not found.');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT SERIES & OCCURRENCES
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/community-life/events/series$`)).reply((config) => {
    const q = params(config);
    let list = [...series];
    if (q.organizationId) list = list.filter((s) => s.organizationId === q.organizationId);
    if (q.category) list = list.filter((s) => s.category === q.category);
    if (q.status) list = list.filter((s) => s.status === q.status);
    if (q.cityName) {
      list = list.filter((s) => s.location.cityName.toLowerCase() === q.cityName.toLowerCase());
    }
    // A draft is only visible to somebody who can manage the organization.
    list = list.filter(
      (s) => s.status !== 'Draft' || (s.organizationId ? capabilitiesFor(s.organizationId).canManageEvents : true)
    );
    return page(list, q.cursor, Number(q.take ?? 20));
  });

  mock
    .onGet(new RegExp(`${ROOT}/community-life/events/series/[^/]+/occurrences$`))
    .reply((config) => {
      const seriesId = segment(config.url, 1);
      const q = params(config);
      let list = occurrences[seriesId] ?? [];
      if (q.from) list = list.filter((o) => o.date >= q.from);
      if (q.to) list = list.filter((o) => o.date <= q.to);
      return page(list, q.cursor, Number(q.take ?? 20));
    });

  mock.onGet(new RegExp(`${ROOT}/community-life/events/series/[^/]+$`)).reply((config) => {
    const seriesId = segment(config.url, 0);
    const found = series.find((s) => s.seriesId === seriesId);
    return found ? ok(found) : problem(404, 'community.series.notFound', 'Series not found.');
  });

  mock.onGet(new RegExp(`${ROOT}/community-life/events/occurrences/[^/]+$`)).reply((config) => {
    const occurrenceId = segment(config.url, 0);
    for (const list of Object.values(occurrences)) {
      const found = list.find((o) => o.occurrenceId === occurrenceId);
      if (found) return ok(found);
    }
    return problem(404, 'community.occurrence.notFound', 'Occurrence not found.');
  });

  mock.onPost(new RegExp(`${ROOT}/community-life/events/series$`)).reply((config) => {
    const request = body<Record<string, unknown>>(config);
    const organizationId = request.organizationId as string | undefined;

    if (organizationId && !capabilitiesFor(organizationId).canManageEvents) {
      return forbidden('create events');
    }

    const created: EventSeries = {
      seriesId: newId('ser'),
      title: String(request.title ?? 'Untitled series'),
      description: String(request.description ?? ''),
      coverImage: String(request.coverImage ?? 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600'),
      category: (request.category as EventSeries['category']) ?? 'Other',
      status: request.publish ? 'Published' : 'Draft',
      recurrence: request.recurrence as RecurrenceRule,
      location: {
        cityName: String(request.cityName ?? 'London'),
        areaName: String(request.areaName ?? ''),
        addressLine: String(request.addressLine ?? ''),
        landmark: request.landmark ? String(request.landmark) : undefined,
      },
      timezone: String(request.timezone ?? 'BST'),
      price: request.priceAmount
        ? money(Math.round(Number(request.priceAmount) * 100), String(request.priceCurrency ?? 'GBP'))
        : null,
      organizerId: organizationId ?? ME,
      organizerName: organizationId
        ? (programmes.find((p) => p.organizationId === organizationId)?.organizationName ?? 'Organisation')
        : 'You',
      organizerType: organizationId ? 'Organization' : 'User',
      organizerIsVerified: Boolean(organizationId),
      organizationId: organizationId ?? null,
      nextOccurrence: null,
      occurrenceCount: 0,
      completedCount: 0,
      myAttendedCount: 0,
      isSaved: false,
      createdAt: nowIso(),
    };

    occurrences[created.seriesId] = expand(created);
    created.occurrenceCount = occurrences[created.seriesId].length;
    created.nextOccurrence = occurrences[created.seriesId].find((o) => o.isNext) ?? null;
    series = [created, ...series];

    return [201, { data: created }];
  });

  mock.onPut(new RegExp(`${ROOT}/community-life/events/series/[^/]+$`)).reply((config) => {
    const seriesId = segment(config.url, 0);
    const request = body<Record<string, unknown>>(config);
    const index = series.findIndex((s) => s.seriesId === seriesId);
    if (index === -1) return problem(404, 'community.series.notFound', 'Series not found.');

    const current = series[index];
    if (current.organizationId && !capabilitiesFor(current.organizationId).canManageEvents) {
      return forbidden('edit events');
    }

    // §11: the scope is the caller's, and it changes what the edit touches.
    const scope = String(request.scope ?? 'EntireSeries');
    const updated: EventSeries = {
      ...current,
      title: request.title ? String(request.title) : current.title,
      description: request.description ? String(request.description) : current.description,
      status: request.publish === true ? 'Published' : current.status,
      recurrence: (request.recurrence as RecurrenceRule) ?? current.recurrence,
    };

    if (scope === 'EntireSeries' && request.recurrence) {
      occurrences[seriesId] = expand(updated);
      updated.occurrenceCount = occurrences[seriesId].length;
      updated.nextOccurrence = occurrences[seriesId].find((o) => o.isNext) ?? null;
    }

    series[index] = updated;
    return ok(updated);
  });

  mock.onDelete(new RegExp(`${ROOT}/community-life/events/series/[^/]+$`)).reply((config) => {
    const seriesId = segment(config.url, 0);
    const index = series.findIndex((s) => s.seriesId === seriesId);
    if (index === -1) return problem(404, 'community.series.notFound', 'Series not found.');

    const current = series[index];
    if (current.organizationId && !capabilitiesFor(current.organizationId).canManageEvents) {
      return forbidden('cancel events');
    }

    const updated: EventSeries = { ...current, status: 'Cancelled' };
    series[index] = updated;
    occurrences[seriesId] = (occurrences[seriesId] ?? []).map((o) =>
      o.status === 'Scheduled'
        ? { ...o, status: 'Cancelled', cancellationReason: 'The series was cancelled.' }
        : o
    );
    return ok(updated);
  });

  mock.onPut(new RegExp(`${ROOT}/community-life/events/occurrences/[^/]+$`)).reply((config) => {
    const occurrenceId = segment(config.url, 0);
    const request = body<{ status?: string; date?: string; time?: string; endTime?: string; reason?: string }>(
      config
    );

    for (const [seriesId, list] of Object.entries(occurrences)) {
      const index = list.findIndex((o) => o.occurrenceId === occurrenceId);
      if (index === -1) continue;

      const owner = series.find((s) => s.seriesId === seriesId);
      if (owner?.organizationId && !capabilitiesFor(owner.organizationId).canManageEvents) {
        return forbidden('change occurrences');
      }

      const current = list[index];
      const isMove = Boolean(request.date) && request.date !== current.date;

      const updated: EventOccurrence = {
        ...current,
        status:
          request.status === 'Cancelled'
            ? 'Cancelled'
            : isMove
              ? 'Rescheduled'
              : (request.status as EventOccurrence['status']) ?? current.status,
        date: request.date ?? current.date,
        time: request.time ?? current.time,
        endTime: request.endTime ?? current.endTime,
        originalDate: isMove ? current.originalDate ?? current.date : current.originalDate,
        cancellationReason: request.status === 'Cancelled' ? (request.reason ?? null) : null,
      };

      list[index] = updated;

      // A cancellation becomes an exception on the rule, which is what the
      // proposed contract says and what keeps the editor honest.
      if (updated.status === 'Cancelled' && owner) {
        const withException: EventSeries = {
          ...owner,
          recurrence: {
            ...owner.recurrence,
            exceptions: Array.from(new Set([...owner.recurrence.exceptions, updated.date])),
          },
        };
        series = series.map((s) => (s.seriesId === seriesId ? withException : s));
      }

      return ok(updated);
    }

    return problem(404, 'community.occurrence.notFound', 'Occurrence not found.');
  });

  // ── Registration ───────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/community-life/registrations/me$`)).reply(() => ok(registrations));

  mock.onGet(new RegExp(`${ROOT}/community-life/registrations/attendees$`)).reply((config) => {
    const q = params(config);
    const rows = registrations
      .filter((r) => (q.occurrenceId ? r.occurrenceId === q.occurrenceId : r.eventId === q.eventId))
      .map((r) => ({
        userId: ME,
        displayName: 'You',
        avatarUrl: null,
        status: r.status,
        registeredAt: r.registeredAt,
        checkedInAt: null,
        guestCount: r.guestCount,
      }));

    // Plus a few seeded attendees, so an organizer's list is not empty.
    const seeded = [
      { userId: 'user-601', displayName: 'Ngozi Eze', avatarUrl: null, status: 'Registered' as const, registeredAt: isoDaysAhead(-4), checkedInAt: null, guestCount: 1 },
      { userId: 'user-602', displayName: 'Kwame Asante', avatarUrl: null, status: 'CheckedIn' as const, registeredAt: isoDaysAhead(-6), checkedInAt: isoDaysAhead(-1), guestCount: 0 },
      { userId: 'user-603', displayName: 'Blessing Adeyemi', avatarUrl: null, status: 'Waitlisted' as const, registeredAt: isoDaysAhead(-2), checkedInAt: null, guestCount: 0 },
    ];

    return page([...rows, ...seeded], q.cursor, Number(q.take ?? 20));
  });

  mock.onPost(new RegExp(`${ROOT}/community-life/registrations$`)).reply((config) => {
    const request = body<{ eventId?: string; occurrenceId?: string; guestCount?: number }>(config);

    const existing = registrations.find(
      (r) =>
        r.status !== 'Cancelled' &&
        (request.occurrenceId ? r.occurrenceId === request.occurrenceId : r.eventId === request.eventId)
    );
    if (existing) {
      return problem(409, 'community.registration.duplicate', 'You are already registered for this.');
    }

    // Capacity is the server's. §51's "Event full" becomes a waitlist here
    // rather than a refusal, which is the kinder of the two correct answers.
    let status: EventRegistration['status'] = 'Registered';
    let waitlistPosition: number | null = null;

    if (request.occurrenceId) {
      for (const list of Object.values(occurrences)) {
        const occurrence = list.find((o) => o.occurrenceId === request.occurrenceId);
        if (!occurrence) continue;
        if (occurrence.status === 'Cancelled') {
          return problem(409, 'community.occurrence.cancelled', 'This occurrence has been cancelled.');
        }
        if (occurrence.isFull) {
          status = 'Waitlisted';
          waitlistPosition = 1;
        }
        const index = list.indexOf(occurrence);
        list[index] = {
          ...occurrence,
          registeredCount: occurrence.registeredCount + (status === 'Registered' ? 1 : 0),
          myRegistration: status,
        };
      }
    }

    const registration: EventRegistration = {
      registrationId: newId('reg'),
      eventId: request.eventId ?? null,
      occurrenceId: request.occurrenceId ?? null,
      seriesId: request.occurrenceId
        ? (Object.entries(occurrences).find(([, list]) =>
            list.some((o) => o.occurrenceId === request.occurrenceId)
          )?.[0] ?? null)
        : null,
      status,
      registeredAt: nowIso(),
      waitlistPosition,
      paymentIntentId: null,
      guestCount: request.guestCount ?? 0,
    };

    registrations = [registration, ...registrations];
    return [201, { data: registration }];
  });

  mock.onDelete(new RegExp(`${ROOT}/community-life/registrations/[^/]+$`)).reply((config) => {
    const registrationId = segment(config.url, 0);
    const index = registrations.findIndex((r) => r.registrationId === registrationId);
    if (index === -1) return problem(404, 'community.registration.notFound', 'Registration not found.');

    const cancelled: EventRegistration = { ...registrations[index], status: 'Cancelled' };
    registrations[index] = cancelled;

    if (cancelled.occurrenceId) {
      for (const list of Object.values(occurrences)) {
        const occIndex = list.findIndex((o) => o.occurrenceId === cancelled.occurrenceId);
        if (occIndex === -1) continue;
        list[occIndex] = {
          ...list[occIndex],
          registeredCount: Math.max(0, list[occIndex].registeredCount - 1),
          myRegistration: 'NotRegistered',
          isFull: false,
        };
      }
    }

    return ok(cancelled);
  });

  mock.onPost(new RegExp(`${ROOT}/community-life/registrations/[^/]+/check-in$`)).reply((config) => {
    const registrationId = segment(config.url, 1);
    return ok({
      userId: registrationId,
      displayName: 'Attendee',
      avatarUrl: null,
      status: 'CheckedIn',
      registeredAt: isoDaysAhead(-2),
      checkedInAt: nowIso(),
      guestCount: 0,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FUNDRAISING
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/communities/campaigns/me$`)).reply(() => {
    const mine = campaigns.filter((c) => c.canManage).map(withRealProgress);
    return ok(mine);
  });

  mock.onGet(new RegExp(`${ROOT}/communities/campaigns$`)).reply((config) => {
    const q = params(config);
    let list = campaigns.filter(
      // A draft or a rejected campaign is only visible to its manager.
      (c) => !['Draft', 'PendingReview', 'Rejected'].includes(c.status) || c.canManage
    );

    if (q.query) {
      const needle = q.query.toLowerCase();
      list = list.filter(
        (c) => c.title.toLowerCase().includes(needle) || c.summary.toLowerCase().includes(needle)
      );
    }
    if (q.state) list = list.filter((c) => c.status === q.state);
    if (q.category) list = list.filter((c) => c.category === q.category);
    if (q.countryCode) list = list.filter((c) => c.countryCode === q.countryCode);
    if (q.organizationId) list = list.filter((c) => c.organizationId === q.organizationId);

    return page(list.map(withRealProgress), q.cursor, Number(q.take ?? 20));
  });

  mock.onGet(new RegExp(`${ROOT}/communities/campaigns/[^/]+/updates$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    return ok(MOCK_CAMPAIGN_UPDATES[campaignId] ?? []);
  });

  mock.onGet(new RegExp(`${ROOT}/communities/campaigns/[^/]+/milestones$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    return ok(MOCK_CAMPAIGN_MILESTONES[campaignId] ?? []);
  });

  mock.onGet(new RegExp(`${ROOT}/communities/campaigns/[^/]+/supporters$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    const q = params(config);
    return page(MOCK_SUPPORTERS[campaignId] ?? [], q.cursor, Number(q.take ?? 20));
  });

  mock.onGet(new RegExp(`${ROOT}/communities/campaigns/[^/]+/fund-usage$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    return ok(MOCK_FUND_USAGE[campaignId] ?? []);
  });

  mock.onGet(new RegExp(`${ROOT}/communities/campaigns/[^/]+/donations/me$`)).reply(() => ok([]));

  mock.onGet(new RegExp(`${ROOT}/communities/campaigns/[^/]+$`)).reply((config) => {
    const campaignId = segment(config.url, 0);
    const found = campaigns.find((c) => c.campaignId === campaignId);
    return found
      ? ok(withRealProgress(found))
      : problem(404, 'community.campaign.notFound', 'Campaign not found.');
  });

  mock.onPost(new RegExp(`${ROOT}/communities/campaigns$`)).reply((config) => {
    const request = body<Record<string, unknown>>(config);
    const organizationId = request.organizationId as string | undefined;

    if (organizationId && !capabilitiesFor(organizationId).canManageCampaigns) {
      return forbidden('create campaigns');
    }
    if (request.acceptedTerms !== true) {
      return problem(400, 'community.campaign.terms', 'The fundraising terms must be accepted.');
    }

    const created: FundraisingCampaign = {
      campaignId: newId('camp'),
      title: String(request.title ?? 'Untitled campaign'),
      summary: String(request.summary ?? ''),
      story: String(request.story ?? ''),
      coverImage: String(request.coverImage ?? 'https://images.unsplash.com/photo-1544027993-37dbfe43562a?w=600'),
      gallery: (request.gallery as string[]) ?? [],
      category: (request.category as FundraisingCampaign['category']) ?? 'Other',
      status: 'Draft',
      progress: {
        target: {
          value: money(Math.round(Number(request.targetAmount ?? 0) * 100), String(request.currency ?? 'GBP')),
          source: 'simulated',
          gapKey: 'fundraisingCampaign',
        },
        raised: { value: money(0, String(request.currency ?? 'GBP')), source: 'simulated', gapKey: 'fundraisingCampaign' },
        percentage: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
        supporterCount: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
        deadline: (request.deadline as string) ?? null,
        daysRemaining: null,
      },
      // A new campaign has no B15 cause, so it genuinely cannot collect. The
      // proposed contract creates one on publish; the simulation mirrors that.
      causeCode: null,
      beneficiaryType: (request.beneficiaryType as FundraisingCampaign['beneficiaryType']) ?? 'Community',
      beneficiaryId: (request.beneficiaryId as string) ?? null,
      beneficiaryName: String(request.beneficiaryName ?? 'The community'),
      urgency: 'Moderate',
      acceptedKinds: (request.acceptedKinds as FundraisingCampaign['acceptedKinds']) ?? ['Monetary'],
      organizerId: organizationId ?? ME,
      organizerName: organizationId
        ? (programmes.find((p) => p.organizationId === organizationId)?.organizationName ?? 'Organisation')
        : 'You',
      organizationId: organizationId ?? null,
      isVerified: false,
      countryCode: (request.countryCode as string) ?? 'GB',
      locationLabel: null,
      createdAt: nowIso(),
      publishedAt: null,
      closedAt: null,
      reviewNote: null,
      canManage: true,
      canDonate: false,
    };

    campaigns = [created, ...campaigns];
    return [201, { data: created }];
  });

  mock.onPut(new RegExp(`${ROOT}/communities/campaigns/[^/]+$`)).reply((config) => {
    const campaignId = segment(config.url, 0);
    const request = body<Record<string, unknown>>(config);
    const index = campaigns.findIndex((c) => c.campaignId === campaignId);
    if (index === -1) return problem(404, 'community.campaign.notFound', 'Campaign not found.');
    if (!campaigns[index].canManage) return forbidden('edit this campaign');

    const updated: FundraisingCampaign = {
      ...campaigns[index],
      title: request.title ? String(request.title) : campaigns[index].title,
      summary: request.summary ? String(request.summary) : campaigns[index].summary,
      story: request.story ? String(request.story) : campaigns[index].story,
    };
    campaigns[index] = updated;
    return ok(withRealProgress(updated));
  });

  /**
   * The campaign lifecycle.
   *
   * The legal-transition table is duplicated here on purpose. The client has one
   * in `community-state.ts` for deciding which buttons to draw; this one is the
   * authority, and a client that had gone stale gets a 409 rather than a
   * silently accepted illegal move.
   */
  const CAMPAIGN_TRANSITIONS: Record<string, { from: FundraisingCampaign['status'][]; to: FundraisingCampaign['status'] }> = {
    submit: { from: ['Draft', 'Rejected'], to: 'PendingReview' },
    publish: { from: ['PendingReview'], to: 'Active' },
    pause: { from: ['Active', 'Published', 'GoalReached'], to: 'Paused' },
    resume: { from: ['Paused'], to: 'Active' },
    close: { from: ['Active', 'Paused', 'GoalReached', 'DeadlineReached', 'Published'], to: 'Closed' },
    cancel: { from: ['Draft', 'PendingReview', 'Rejected', 'Active', 'Paused', 'Published'], to: 'Cancelled' },
  };

  mock
    .onPost(new RegExp(`${ROOT}/communities/campaigns/[^/]+/(submit|publish|pause|resume|close|cancel)$`))
    .reply((config) => {
      const action = segment(config.url, 0);
      const campaignId = segment(config.url, 1);
      const index = campaigns.findIndex((c) => c.campaignId === campaignId);
      if (index === -1) return problem(404, 'community.campaign.notFound', 'Campaign not found.');

      const current = campaigns[index];
      if (!current.canManage) return forbidden('manage this campaign');

      const rule = CAMPAIGN_TRANSITIONS[action];
      if (!rule || !rule.from.includes(current.status)) {
        return problem(
          409,
          'community.campaign.illegalTransition',
          `A campaign that is ${current.status} cannot be ${action}ed.`
        );
      }

      const updated: FundraisingCampaign = {
        ...current,
        status: rule.to,
        publishedAt: rule.to === 'Active' ? (current.publishedAt ?? nowIso()) : current.publishedAt,
        closedAt: rule.to === 'Closed' || rule.to === 'Cancelled' ? nowIso() : current.closedAt,
        // Publishing is what creates the B15 cause in the proposed contract, so
        // it is what makes a campaign able to collect. Before that, it cannot.
        causeCode: rule.to === 'Active' ? (current.causeCode ?? 'community-general-fund') : current.causeCode,
        canDonate: rule.to === 'Active',
      };
      campaigns[index] = updated;
      return ok(withRealProgress(updated));
    });

  mock.onPost(new RegExp(`${ROOT}/communities/campaigns/[^/]+/updates$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    const request = body<{ title: string; body: string; mediaUrls?: string[] }>(config);
    const campaign = campaigns.find((c) => c.campaignId === campaignId);
    if (!campaign) return problem(404, 'community.campaign.notFound', 'Campaign not found.');
    if (!campaign.canManage) return forbidden('publish updates for this campaign');

    const update = {
      updateId: newId('cu'),
      campaignId,
      title: request.title,
      body: request.body,
      mediaUrls: request.mediaUrls ?? [],
      publishedAt: nowIso(),
      authorName: campaign.organizerName,
    };
    MOCK_CAMPAIGN_UPDATES[campaignId] = [update, ...(MOCK_CAMPAIGN_UPDATES[campaignId] ?? [])];
    return [201, { data: update }];
  });

  mock.onPost(new RegExp(`${ROOT}/communities/campaigns/[^/]+/donations$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    const request = body<{ donationId: string }>(config);
    const campaign = campaigns.find((c) => c.campaignId === campaignId);
    if (!campaign) return problem(404, 'community.campaign.notFound', 'Campaign not found.');

    return [
      201,
      {
        data: {
          donation: { donationId: request.donationId },
          campaignId,
          campaignTitle: campaign.title,
          status: 'Completed',
          payment: null,
        },
      },
    ];
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VOLUNTEERING
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/communities/volunteer/opportunities$`)).reply((config) => {
    const q = params(config);
    let list = opportunities.filter((o) => o.status !== 'Draft' || o.canManage);

    if (q.query) {
      const needle = q.query.toLowerCase();
      list = list.filter(
        (o) => o.title.toLowerCase().includes(needle) || o.description.toLowerCase().includes(needle)
      );
    }
    if (q.cause) list = list.filter((o) => o.cause === q.cause);
    if (q.organizationId) list = list.filter((o) => o.organizationId === q.organizationId);
    if (q.cityName) {
      list = list.filter((o) => o.location.cityName.toLowerCase() === q.cityName.toLowerCase());
    }
    if (q.skill) {
      list = list.filter((o) =>
        o.requiredSkills.some((s) => s.toLowerCase().includes(q.skill.toLowerCase()))
      );
    }
    if (q.state) list = list.filter((o) => o.status === q.state);
    if (q.from) list = list.filter((o) => !o.startDate || o.startDate >= q.from);
    if (q.to) list = list.filter((o) => !o.startDate || o.startDate <= q.to);

    return page(list, q.cursor, Number(q.take ?? 20));
  });

  mock.onGet(new RegExp(`${ROOT}/communities/volunteer/applications/me$`)).reply(() => ok(applications));

  mock.onGet(new RegExp(`${ROOT}/communities/volunteer/assignments/me$`)).reply(() => ok(assignments));

  mock.onGet(new RegExp(`${ROOT}/communities/volunteer/hours/me$`)).reply(() => {
    const completed = assignments.filter((a) => a.status === 'Completed');
    const confirmedHours = completed.reduce((sum, a) => sum + (a.confirmedHours ?? 0), 0);

    return ok({
      // Simulated, and marked. §34: a self-reported hour is not an hour, and an
      // unverifiable total is not a metric.
      confirmedHours: { value: confirmedHours, source: 'simulated', gapKey: 'volunteerHours' },
      completedOpportunities: { value: completed.length, source: 'simulated', gapKey: 'volunteerHours' },
      organizationsSupported: {
        value: new Set(completed.map((a) => a.opportunityId)).size,
        source: 'simulated',
        gapKey: 'volunteerHours',
      },
      skills: ['Yoruba', 'Food preparation'],
      certificates: [
        {
          certificateId: 'cert-1',
          title: 'Wednesday Lunch Club — 12 months of service',
          organizationName: 'Redeemed Christian Church — Peckham Parish',
          hours: 48,
          issuedAt: isoDaysAhead(-30),
          downloadUrl: null,
        },
      ],
    });
  });

  mock
    .onGet(new RegExp(`${ROOT}/communities/volunteer/opportunities/[^/]+/applications$`))
    .reply((config) => {
      const opportunityId = segment(config.url, 1);
      const opportunity = opportunities.find((o) => o.opportunityId === opportunityId);
      if (!opportunity) return problem(404, 'community.opportunity.notFound', 'Opportunity not found.');
      if (!opportunity.canManage) return forbidden('review applicants');

      const q = params(config);
      let list = applicants[opportunityId] ?? [];
      if (q.state) list = list.filter((a) => a.status === q.state);
      return page(list, q.cursor, Number(q.take ?? 20));
    });

  mock.onGet(new RegExp(`${ROOT}/communities/volunteer/opportunities/[^/]+$`)).reply((config) => {
    const opportunityId = segment(config.url, 0);
    const found = opportunities.find((o) => o.opportunityId === opportunityId);
    return found ? ok(found) : problem(404, 'community.opportunity.notFound', 'Opportunity not found.');
  });

  mock.onPost(new RegExp(`${ROOT}/communities/volunteer/opportunities$`)).reply((config) => {
    const request = body<Record<string, unknown>>(config);
    const organizationId = String(request.organizationId ?? '');
    if (!capabilitiesFor(organizationId).canManageVolunteers) {
      return forbidden('create volunteer opportunities');
    }

    const opportunityId = newId('opp');
    const shifts = ((request.shifts as Record<string, unknown>[]) ?? []).map((s, i) => ({
      shiftId: `${opportunityId}-sh-${i}`,
      opportunityId,
      label: String(s.label ?? `Shift ${i + 1}`),
      date: String(s.date ?? dateDaysAhead(7)),
      startTime: String(s.startTime ?? '09:00'),
      endTime: String(s.endTime ?? '13:00'),
      capacity: Number(s.capacity ?? 4),
      filledCount: 0,
      isFull: false,
    }));

    const created: VolunteerOpportunity = {
      opportunityId,
      title: String(request.title ?? 'Untitled opportunity'),
      description: String(request.description ?? ''),
      coverImage: null,
      cause: String(request.cause ?? 'Community'),
      status: request.publish ? 'Published' : 'Draft',
      organizationId,
      organizationName:
        programmes.find((p) => p.organizationId === organizationId)?.organizationName ?? 'Organisation',
      organizationLogo: programmes.find((p) => p.organizationId === organizationId)?.organizationLogo ?? null,
      isVerified: true,
      location: {
        cityName: String(request.cityName ?? 'London'),
        areaName: String(request.areaName ?? ''),
        addressLine: String(request.addressLine ?? ''),
      },
      startDate: (request.startDate as string) ?? null,
      endDate: (request.endDate as string) ?? null,
      shifts,
      requiredSkills: (request.requiredSkills as string[]) ?? [],
      requirements: [],
      minimumAge: (request.minimumAge as number) ?? null,
      capacity: (request.capacity as number) ?? shifts.reduce((sum, s) => sum + s.capacity, 0),
      filledCount: 0,
      isFull: false,
      applicationDeadline: (request.applicationDeadline as string) ?? null,
      myApplicationStatus: 'NotApplied',
      myApplicationId: null,
      canApply: false,
      cannotApplyReason: 'You are the organiser of this opportunity.',
      canManage: true,
      createdAt: nowIso(),
    };

    opportunities = [created, ...opportunities];
    applicants[opportunityId] = [];
    return [201, { data: created }];
  });

  mock
    .onPost(new RegExp(`${ROOT}/communities/volunteer/opportunities/[^/]+/(publish|close|cancel)$`))
    .reply((config) => {
      const action = segment(config.url, 0);
      const opportunityId = segment(config.url, 1);
      const index = opportunities.findIndex((o) => o.opportunityId === opportunityId);
      if (index === -1) return problem(404, 'community.opportunity.notFound', 'Opportunity not found.');
      if (!opportunities[index].canManage) return forbidden('manage this opportunity');

      const nextStatus: Record<string, VolunteerOpportunity['status']> = {
        publish: 'Published',
        close: 'Closed',
        cancel: 'Cancelled',
      };
      const updated = { ...opportunities[index], status: nextStatus[action] };
      opportunities[index] = updated;
      return ok(updated);
    });

  mock
    .onPost(new RegExp(`${ROOT}/communities/volunteer/opportunities/[^/]+/applications$`))
    .reply((config) => {
      // `…/opportunities/{id}/applications` — the identifier is one segment
      // back from the end, not two. The membership route's shape is
      // `…/{id}/memberships/applications`, which is why the two differ.
      const opportunityId = segment(config.url, 1);
      const request = body<{ shiftId?: string; answers?: Record<string, string> }>(config);
      const index = opportunities.findIndex((o) => o.opportunityId === opportunityId);
      if (index === -1) return problem(404, 'community.opportunity.notFound', 'Opportunity not found.');

      const opportunity = opportunities[index];

      if (opportunity.status !== 'Published') {
        return problem(409, 'community.opportunity.closed', 'This opportunity is not accepting applications.');
      }
      if (applications.some((a) => a.opportunityId === opportunityId && a.status === 'Pending')) {
        return problem(409, 'community.application.duplicate', 'You have already applied for this.');
      }
      if (opportunity.requirements.some((r) => !r.isMet)) {
        return problem(
          409,
          'community.opportunity.ineligible',
          'You do not meet every requirement for this opportunity yet.'
        );
      }

      // A full opportunity waitlists rather than refusing. §19's `Waitlisted`.
      const status: VolunteerApplication['status'] = opportunity.isFull ? 'Waitlisted' : 'Pending';

      const application: VolunteerApplication = {
        applicationId: newId('vapp'),
        opportunityId,
        opportunityTitle: opportunity.title,
        organizationName: opportunity.organizationName,
        status,
        answers: request.answers ?? {},
        submittedAt: nowIso(),
        decidedAt: null,
        decisionReason: status === 'Waitlisted' ? 'Every shift is currently full.' : null,
        waitlistPosition: status === 'Waitlisted' ? 2 : null,
        assignment: null,
      };

      applications = [application, ...applications];
      opportunities[index] = {
        ...opportunity,
        myApplicationStatus: status,
        myApplicationId: application.applicationId,
        canApply: false,
        cannotApplyReason:
          status === 'Waitlisted'
            ? 'You are on the waiting list for this opportunity.'
            : 'You have already applied. The organiser is reviewing your application.',
      };

      return [201, { data: application }];
    });

  mock
    .onPost(new RegExp(`${ROOT}/communities/volunteer/applications/[^/]+/withdraw$`))
    .reply((config) => {
      const applicationId = segment(config.url, 1);
      const index = applications.findIndex((a) => a.applicationId === applicationId);
      if (index === -1) return problem(404, 'community.application.notFound', 'Application not found.');

      const updated: VolunteerApplication = { ...applications[index], status: 'Withdrawn' };
      applications[index] = updated;

      const oppIndex = opportunities.findIndex((o) => o.opportunityId === updated.opportunityId);
      if (oppIndex !== -1) {
        opportunities[oppIndex] = {
          ...opportunities[oppIndex],
          myApplicationStatus: 'Withdrawn',
          myApplicationId: null,
          canApply: !opportunities[oppIndex].isFull,
          cannotApplyReason: null,
        };
      }

      return ok(updated);
    });

  mock
    .onPost(new RegExp(`${ROOT}/communities/volunteer/applications/[^/]+/decision$`))
    .reply((config) => {
      const applicationId = segment(config.url, 1);
      const request = body<{ decision: string; reason?: string }>(config);

      for (const [opportunityId, list] of Object.entries(applicants)) {
        const index = list.findIndex((a) => a.applicationId === applicationId);
        if (index === -1) continue;

        const opportunity = opportunities.find((o) => o.opportunityId === opportunityId);
        if (!opportunity?.canManage) return forbidden('decide volunteer applications');

        const nextStatus: Record<string, VolunteerApplicant['status']> = {
          approve: 'Approved',
          reject: 'Rejected',
          waitlist: 'Waitlisted',
        };
        const next = nextStatus[request.decision];
        if (!next) {
          return problem(400, 'community.decision.invalid', `Unknown decision "${request.decision}".`);
        }

        const updated: VolunteerApplicant = { ...list[index], status: next };
        list[index] = updated;

        // Keep the applicant's own view in step, so a decision made in the
        // organizer queue shows up on the volunteer dashboard.
        applications = applications.map((a) =>
          a.applicationId === applicationId
            ? { ...a, status: next, decidedAt: nowIso(), decisionReason: request.reason ?? null }
            : a
        );

        return ok(updated);
      }

      return problem(404, 'community.application.notFound', 'Application not found.');
    });

  mock.onPost(new RegExp(`${ROOT}/communities/volunteer/assignments$`)).reply((config) => {
    const request = body<{ applicationId: string; shiftId?: string }>(config);

    let found: { opportunityId: string; applicant: VolunteerApplicant } | null = null;
    for (const [opportunityId, list] of Object.entries(applicants)) {
      const applicant = list.find((a) => a.applicationId === request.applicationId);
      if (applicant) {
        found = { opportunityId, applicant };
        break;
      }
    }
    if (!found) return problem(404, 'community.application.notFound', 'Application not found.');

    const opportunity = opportunities.find((o) => o.opportunityId === found.opportunityId);
    if (!opportunity?.canManage) return forbidden('assign volunteers');
    if (found.applicant.status !== 'Approved') {
      return problem(
        409,
        'community.assignment.notApproved',
        'Only an approved volunteer can be assigned to a shift.'
      );
    }

    const shift = opportunity.shifts.find((s) => s.shiftId === request.shiftId) ?? opportunity.shifts[0];
    if (shift?.isFull) {
      return problem(409, 'community.shift.full', `The "${shift.label}" shift is full.`);
    }

    const assignment: VolunteerAssignment = {
      assignmentId: newId('vasg'),
      applicationId: request.applicationId,
      opportunityId: found.opportunityId,
      opportunityTitle: opportunity.title,
      shiftId: shift?.shiftId ?? null,
      shiftLabel: shift?.label ?? null,
      date: shift?.date ?? dateDaysAhead(7),
      startTime: shift?.startTime ?? '09:00',
      endTime: shift?.endTime ?? '13:00',
      location: opportunity.location,
      status: 'Assigned',
      checkedInAt: null,
      checkedOutAt: null,
      confirmedHours: null,
    };

    assignments = [assignment, ...assignments];
    return [201, { data: assignment }];
  });

  mock
    .onPost(new RegExp(`${ROOT}/communities/volunteer/assignments/[^/]+/(check-in|check-out)$`))
    .reply((config) => {
      const direction = segment(config.url, 0);
      const assignmentId = segment(config.url, 1);
      const index = assignments.findIndex((a) => a.assignmentId === assignmentId);
      if (index === -1) return problem(404, 'community.assignment.notFound', 'Assignment not found.');

      const updated: VolunteerAssignment = {
        ...assignments[index],
        status: direction === 'check-in' ? 'CheckedIn' : assignments[index].status,
        checkedInAt: direction === 'check-in' ? nowIso() : assignments[index].checkedInAt,
        checkedOutAt: direction === 'check-out' ? nowIso() : assignments[index].checkedOutAt,
      };
      assignments[index] = updated;
      return ok(updated);
    });

  mock
    .onPost(new RegExp(`${ROOT}/communities/volunteer/assignments/[^/]+/hours$`))
    .reply((config) => {
      const assignmentId = segment(config.url, 1);
      const request = body<{ hours: number }>(config);
      const index = assignments.findIndex((a) => a.assignmentId === assignmentId);
      if (index === -1) return problem(404, 'community.assignment.notFound', 'Assignment not found.');

      const opportunity = opportunities.find(
        (o) => o.opportunityId === assignments[index].opportunityId
      );
      if (!opportunity?.canManage) return forbidden('confirm volunteer hours');

      const updated: VolunteerAssignment = {
        ...assignments[index],
        status: 'Completed',
        confirmedHours: request.hours,
      };
      assignments[index] = updated;
      return ok(updated);
    });

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Builds a result from the server-held tally.
   *
   * Every number a poll screen renders is produced here. §24: authoritative
   * results are not computed from incomplete client data, and the client is
   * never given the raw votes it would need to try.
   */
  function resultFor(poll: CommunityPoll): PollResult {
    const tally = tallies[poll.pollId] ?? {};
    const total = Object.values(tally).reduce((sum, n) => sum + n, 0);

    // A poll that hides results until close is a real product rule, and the
    // response withholds the options entirely rather than sending them with a
    // flag the client is trusted to honour.
    const visible = poll.status !== 'Open' || poll.allowsChange || poll.hasVoted;

    return {
      pollId: poll.pollId,
      status: poll.status,
      options: visible
        ? poll.options.map((option) => ({
            optionId: option.optionId,
            label: option.label,
            count: tally[option.optionId] ?? 0,
            percentage: total > 0 ? Math.round(((tally[option.optionId] ?? 0) / total) * 100) : 0,
            isMyChoice: poll.isAnonymous
              ? undefined
              : (poll.myResponse?.selectedOptionIds.includes(option.optionId) ?? false),
          }))
        : null,
      totalResponses: poll.totalResponses,
      openResponses:
        poll.votingType === 'OpenResponse' && visible ? (openResponses[poll.pollId] ?? []) : null,
      areResultsVisible: visible,
      resultsHiddenReason: visible ? null : 'Results are published when this poll closes.',
      computedAt: nowIso(),
    };
  }

  mock.onGet(new RegExp(`${ROOT}/communities/polls$`)).reply((config) => {
    const q = params(config);
    let list = polls.filter((p) => p.status !== 'Draft' || p.canManage);
    if (q.audience) list = list.filter((p) => p.audience === q.audience);
    if (q.organizationId) list = list.filter((p) => p.organizationId === q.organizationId);
    if (q.state) list = list.filter((p) => p.status === q.state);
    return page(list, q.cursor, Number(q.take ?? 20));
  });

  mock.onGet(new RegExp(`${ROOT}/communities/polls/[^/]+/results$`)).reply((config) => {
    const pollId = segment(config.url, 1);
    const poll = polls.find((p) => p.pollId === pollId);
    return poll ? ok(resultFor(poll)) : problem(404, 'community.poll.notFound', 'Poll not found.');
  });

  mock.onGet(new RegExp(`${ROOT}/communities/polls/[^/]+$`)).reply((config) => {
    const pollId = segment(config.url, 0);
    const poll = polls.find((p) => p.pollId === pollId);
    if (!poll) return problem(404, 'community.poll.notFound', 'Poll not found.');

    // §22: an organization-members poll is withheld from non-members. Enforced
    // here rather than filtered on the client, which is where it has to be.
    if (
      poll.audience === 'OrganizationMembers' &&
      poll.organizationId &&
      !memberships.some(
        (m) =>
          m.organizationId === poll.organizationId &&
          (m.status === 'Active' || m.status === 'RenewalDue')
      ) &&
      !poll.canManage
    ) {
      return problem(
        403,
        'community.poll.audience',
        'This poll is open to members of the organisation only.'
      );
    }

    return ok(poll);
  });

  mock.onPost(new RegExp(`${ROOT}/communities/polls/[^/]+/responses$`)).reply((config) => {
    const pollId = segment(config.url, 1);
    const request = body<{ selectedOptionIds?: string[]; openResponse?: string }>(config);
    const index = polls.findIndex((p) => p.pollId === pollId);
    if (index === -1) return problem(404, 'community.poll.notFound', 'Poll not found.');

    const poll = polls[index];

    if (poll.status !== 'Open') {
      return problem(409, 'community.poll.closed', 'This poll is closed.');
    }
    if (poll.hasVoted && !poll.allowsChange) {
      return problem(409, 'community.poll.alreadyVoted', 'You have already voted in this poll.');
    }
    if (poll.votingType === 'OpenResponse') {
      if (!request.openResponse?.trim()) {
        return problem(400, 'community.poll.emptyResponse', 'Please write an answer before sending.');
      }
    } else {
      const selected = request.selectedOptionIds ?? [];
      if (selected.length === 0) {
        return problem(400, 'community.poll.noSelection', 'Choose an option before voting.');
      }
      if (poll.votingType === 'SingleChoice' && selected.length > 1) {
        return problem(400, 'community.poll.tooManySelections', 'This poll takes one answer.');
      }
      if (poll.maxSelections && selected.length > poll.maxSelections) {
        return problem(
          400,
          'community.poll.tooManySelections',
          `Choose up to ${poll.maxSelections} options.`
        );
      }
      if (selected.some((id) => !poll.options.some((o) => o.optionId === id))) {
        return problem(400, 'community.poll.unknownOption', 'One of those options is not on this poll.');
      }
    }

    // Withdraw the previous vote before counting the new one, so a changed
    // answer does not double-count. The server does the arithmetic.
    const previous = poll.myResponse?.selectedOptionIds ?? [];
    const tally = (tallies[pollId] ??= {});
    for (const optionId of previous) tally[optionId] = Math.max(0, (tally[optionId] ?? 0) - 1);
    for (const optionId of request.selectedOptionIds ?? []) {
      tally[optionId] = (tally[optionId] ?? 0) + 1;
    }
    if (poll.votingType === 'OpenResponse' && request.openResponse) {
      openResponses[pollId] = [request.openResponse, ...(openResponses[pollId] ?? [])];
    }

    const updated: CommunityPoll = {
      ...poll,
      hasVoted: true,
      totalResponses: poll.hasVoted ? poll.totalResponses : poll.totalResponses + 1,
      myResponse: {
        responseId: newId('pr'),
        pollId,
        selectedOptionIds: request.selectedOptionIds ?? [],
        openResponse: request.openResponse ?? null,
        respondedAt: nowIso(),
      },
      canVote: poll.allowsChange,
      cannotVoteReason: poll.allowsChange
        ? null
        : 'You have already voted, and this poll does not allow changing your answer.',
    };
    polls[index] = updated;

    // The response *is* the result, so the confirmation screen renders what the
    // server counted rather than what the device sent.
    return ok(resultFor(updated));
  });

  mock.onPost(new RegExp(`${ROOT}/communities/polls$`)).reply((config) => {
    const request = body<Record<string, unknown>>(config);
    const organizationId = request.organizationId as string | undefined;

    if (organizationId && !capabilitiesFor(organizationId).canManagePolls) {
      return forbidden('create polls');
    }

    const options = ((request.options as { label: string; description?: string }[]) ?? []).map(
      (option, i) => ({
        optionId: newId('po'),
        label: option.label,
        description: option.description ?? null,
        sortOrder: i + 1,
      })
    );

    const votingType = (request.votingType as CommunityPoll['votingType']) ?? 'SingleChoice';
    if (votingType !== 'OpenResponse' && options.length < 2) {
      return problem(400, 'community.poll.tooFewOptions', 'A poll needs at least two options.');
    }

    const created: CommunityPoll = {
      pollId: newId('poll'),
      question: String(request.question ?? ''),
      description: (request.description as string) ?? null,
      status: request.publish ? 'Open' : 'Draft',
      votingType,
      audience: (request.audience as CommunityPoll['audience']) ?? 'Public',
      options,
      maxSelections: (request.maxSelections as number) ?? null,
      isAnonymous: Boolean(request.isAnonymous),
      allowsChange: Boolean(request.allowsChange),
      organizationId: organizationId ?? null,
      organizationName: organizationId
        ? (programmes.find((p) => p.organizationId === organizationId)?.organizationName ?? null)
        : null,
      createdBy: organizationId ?? ME,
      opensAt: (request.opensAt as string) ?? nowIso(),
      closesAt: (request.closesAt as string) ?? null,
      totalResponses: 0,
      hasVoted: false,
      myResponse: null,
      canVote: false,
      cannotVoteReason: 'You created this poll.',
      canManage: true,
      createdAt: nowIso(),
    };

    polls = [created, ...polls];
    tallies[created.pollId] = Object.fromEntries(options.map((o) => [o.optionId, 0]));
    return [201, { data: created }];
  });

  mock
    .onPost(new RegExp(`${ROOT}/communities/polls/[^/]+/(publish|close|cancel|publish-results)$`))
    .reply((config) => {
      const action = segment(config.url, 0);
      const pollId = segment(config.url, 1);
      const index = polls.findIndex((p) => p.pollId === pollId);
      if (index === -1) return problem(404, 'community.poll.notFound', 'Poll not found.');
      if (!polls[index].canManage) return forbidden('manage this poll');

      const nextStatus: Record<string, CommunityPoll['status']> = {
        publish: 'Open',
        close: 'Closed',
        cancel: 'Cancelled',
        'publish-results': 'ResultsPublished',
      };
      const next = nextStatus[action];
      const current = polls[index];

      if (action === 'close' && current.status !== 'Open') {
        return problem(409, 'community.poll.illegalTransition', 'Only an open poll can be closed.');
      }

      const updated: CommunityPoll = {
        ...current,
        status: next,
        canVote: next === 'Open' ? current.canVote : false,
        cannotVoteReason: next === 'Open' ? current.cannotVoteReason : 'Voting has closed.',
      };
      polls[index] = updated;
      return ok(updated);
    });

  // ═══════════════════════════════════════════════════════════════════════════
  // ORGANIZATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/communities/organizations/me$`)).reply(() => ok(MOCK_MY_ORGANIZATIONS));

  mock.onGet(new RegExp(`${ROOT}/communities/organizations/[^/]+/capabilities$`)).reply((config) => {
    const organizationId = segment(config.url, 1);
    return ok(capabilitiesFor(organizationId));
  });

  mock.onGet(new RegExp(`${ROOT}/communities/organizations/[^/]+/dashboard$`)).reply((config) => {
    const organizationId = segment(config.url, 1);
    const caps = capabilitiesFor(organizationId);
    const members = orgMembers[organizationId] ?? [];
    const orgCampaigns = campaigns.filter((c) => c.organizationId === organizationId);
    const orgOpportunities = opportunities.filter((o) => o.organizationId === organizationId);
    const orgPolls = polls.filter((p) => p.organizationId === organizationId);
    const orgSeries = series.filter((s) => s.organizationId === organizationId);
    const programme = programmes.find((p) => p.organizationId === organizationId);

    const raised = orgCampaigns
      .map(withRealProgress)
      .reduce((sum, c) => sum + c.progress.raised.value.minorUnits, 0);

    return ok({
      organizationId,
      organizationName: programme?.organizationName ?? 'Organisation',
      organizationLogo: programme?.organizationLogo ?? null,
      capabilities: caps,
      metrics: [
        {
          key: 'members',
          label: 'Active members',
          value: {
            value: members.filter((m) => m.status === 'Active').length,
            source: 'simulated',
            gapKey: 'organizationAnalytics',
          },
          deltaPercent: 4,
          icon: 'people-outline',
        },
        {
          key: 'raised',
          label: 'Raised across campaigns',
          value: { value: orgCampaigns.length, source: 'simulated', gapKey: 'organizationAnalytics' },
          // The only real figure on this dashboard: summed from B15's causes.
          money: { value: money(raised, 'GBP'), source: 'backend' },
          deltaPercent: null,
          icon: 'heart-outline',
        },
        {
          key: 'events',
          label: 'Upcoming events',
          value: {
            value: orgSeries.filter((s) => s.status === 'Published').length,
            source: 'simulated',
            gapKey: 'organizationAnalytics',
          },
          deltaPercent: null,
          icon: 'calendar-outline',
        },
        {
          key: 'volunteers',
          label: 'Open opportunities',
          value: {
            value: orgOpportunities.filter((o) => o.status === 'Published').length,
            source: 'simulated',
            gapKey: 'organizationAnalytics',
          },
          deltaPercent: null,
          icon: 'hand-left-outline',
        },
      ],
      counts: {
        pendingMemberApplications: members.filter((m) => m.status === 'Pending').length,
        activeMembers: members.filter((m) => m.status === 'Active').length,
        upcomingEvents: orgSeries.filter((s) => s.status === 'Published').length,
        activeSeries: orgSeries.filter((s) => s.status === 'Published').length,
        activeCampaigns: orgCampaigns.filter((c) => c.status === 'Active').length,
        draftCampaigns: orgCampaigns.filter((c) => c.status === 'Draft').length,
        openOpportunities: orgOpportunities.filter((o) => o.status === 'Published').length,
        pendingVolunteerApplications: Object.values(applicants)
          .flat()
          .filter((a) => a.status === 'Pending').length,
        openPolls: orgPolls.filter((p) => p.status === 'Open').length,
        unreadAnnouncements: announcements.filter((a) => a.scopeId === organizationId).length,
      },
      analyticsSource: 'simulated',
    });
  });

  mock.onGet(new RegExp(`${ROOT}/communities/organizations/[^/]+/analytics$`)).reply((config) => {
    const organizationId = segment(config.url, 1);
    const caps = capabilitiesFor(organizationId);
    if (!caps.canViewAnalytics) return forbidden('view analytics');

    const q = params(config);
    const period = q.period ?? '30d';
    const points = period === '7d' ? 7 : period === '90d' ? 12 : period === '12m' ? 12 : 30;

    // Deterministic, so a screenshot taken twice looks the same. A random walk
    // in a mock is a mock that makes a chart look broken on every reload.
    const seriesFor = (base: number, step: number) =>
      Array.from({ length: points }, (_, i) => ({
        date: dateDaysAhead(-(points - i)),
        value: base + i * step + ((i * 7) % 5),
      }));

    return ok({
      organizationId,
      period,
      source: 'simulated',
      memberGrowth: seriesFor(400, 2),
      eventAttendance: seriesFor(30, 1),
      donationTotals: seriesFor(1200, 40),
      volunteerHours: seriesFor(12, 1),
      pollParticipation: seriesFor(40, 3),
      computedAt: nowIso(),
    });
  });

  mock
    .onPost(new RegExp(`${ROOT}/communities/organizations/[^/]+/members/[^/]+/role$`))
    .reply((config) => {
      const organizationId = segment(config.url, 3);
      const userId = segment(config.url, 1);
      const request = body<{ role: string }>(config);

      const caps = capabilitiesFor(organizationId);
      if (!caps.canManageMembers) return forbidden('assign roles');

      const list = orgMembers[organizationId] ?? [];
      const index = list.findIndex((m) => m.userId === userId);
      if (index === -1) return problem(404, 'community.member.notFound', 'Member not found.');

      const updated: OrganizationMember = {
        ...list[index],
        role: request.role as OrganizationMember['role'],
      };
      list[index] = updated;
      return ok(updated);
    });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEIGHBOURHOOD, ANNOUNCEMENTS, IMPACT
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/neighborhoods/[^/]+/events$`)).reply((config) => {
    const neighborhoodId = segment(config.url, 1);
    const q = params(config);

    // The binding is the simulated part: a real B12 event is matched to a named
    // neighbourhood by its area name, which is exactly the string-matching the
    // gap register says is not a contract.
    const bound = mockEvents
      .filter((event) => AREA_TO_NEIGHBORHOOD[event.location.areaName.toLowerCase()] === neighborhoodId)
      .map((event) => ({
        event,
        neighborhoodId,
        neighborhoodName: MOCK_NEIGHBORHOODS[neighborhoodId]?.name ?? null,
        distanceKm: event.location.distanceKm ?? null,
        // Real: B12 computed it.
        distanceSource: 'backend' as const,
      }));

    return page(bound, q.cursor, Number(q.take ?? 20));
  });

  mock.onGet(new RegExp(`${ROOT}/neighborhoods/[^/]+/activity$`)).reply((config) => {
    const neighborhoodId = segment(config.url, 1);
    const bound = mockEvents.filter(
      (event) => AREA_TO_NEIGHBORHOOD[event.location.areaName.toLowerCase()] === neighborhoodId
    );

    return ok({
      neighborhoodId,
      neighborhoodName: MOCK_NEIGHBORHOODS[neighborhoodId]?.name ?? 'Your neighbourhood',
      source: 'simulated',
      upcomingEventCount: bound.length,
      activeCampaignCount: campaigns.filter((c) => c.status === 'Active').length,
      openOpportunityCount: opportunities.filter((o) => o.status === 'Published').length,
      openPollCount: polls.filter((p) => p.status === 'Open').length,
      newMemberCount: 14,
    });
  });

  mock.onGet(new RegExp(`${ROOT}/communities/announcements$`)).reply((config) => {
    const q = params(config);
    let list = [...announcements];
    if (q.scope) list = list.filter((a) => a.scope === q.scope);
    if (q.scopeId) list = list.filter((a) => a.scopeId === q.scopeId);
    list.sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
    return page(list, q.cursor, Number(q.take ?? 20));
  });

  mock.onPost(new RegExp(`${ROOT}/communities/announcements$`)).reply((config) => {
    const request = body<Record<string, unknown>>(config);
    const scopeId = request.scopeId as string | undefined;

    if (request.scope === 'Organization' && scopeId && !capabilitiesFor(scopeId).canPublishAnnouncements) {
      return forbidden('publish announcements');
    }

    const created: CommunityAnnouncement = {
      announcementId: newId('ann'),
      scope: (request.scope as CommunityAnnouncement['scope']) ?? 'Community',
      scopeId: scopeId ?? null,
      scopeName: scopeId
        ? (programmes.find((p) => p.organizationId === scopeId)?.organizationName ?? 'Community')
        : 'Community',
      title: String(request.title ?? ''),
      body: String(request.body ?? ''),
      mediaUrls: (request.mediaUrls as string[]) ?? [],
      authorName: 'You',
      isPinned: Boolean(request.isPinned),
      publishedAt: nowIso(),
      actionRoute: scopeId ? `/community-life/org/${scopeId}` : '/community-life',
    };

    announcements = [created, ...announcements];
    return [201, { data: created }];
  });

  mock.onGet(new RegExp(`${ROOT}/communities/impact$`)).reply((config) => {
    const q = params(config);
    const sim = (value: number) => ({ value, source: 'simulated' as const, gapKey: 'communityImpact' });

    return ok({
      scope: q.scope ?? 'member',
      scopeId: q.scopeId ?? null,
      scopeName: q.scope === 'organization' ? 'Your organisation' : 'You',
      period: q.period ?? '12m',
      membersHelped: sim(46),
      volunteerHours: sim(18),
      // Simulated here too: the member's *real* giving comes from
      // `GET /financial/giving/me`, which the impact screen reads separately
      // and marks as real. Nothing on this object is a real figure.
      fundsRaised: { value: money(0, 'GBP'), source: 'simulated', gapKey: 'communityImpact' },
      donationsMade: sim(0),
      eventsHosted: sim(3),
      eventsAttended: sim(11),
      pollsParticipated: sim(2),
      initiativesSupported: sim(5),
      computedAt: nowIso(),
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS & SEARCH
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/recommendations/community$`)).reply((config) => {
    const q = params(config);
    const take = Number(q.take ?? 10);
    const list = MOCK_RECOMMENDATIONS.filter(
      (r) => !dismissedRecommendations.has(r.recommendationId)
    );

    // The surface narrows what is returned; the *order* is the server's, and
    // the client does no ranking. §35.
    const bySurface: Record<string, string[]> = {
      hub: ['membership', 'opportunity', 'campaign', 'series', 'poll'],
      memberships: ['membership'],
      volunteer: ['opportunity'],
      campaigns: ['campaign'],
      events: ['series', 'event'],
      polls: ['poll'],
    };
    const wanted = bySurface[q.surface ?? 'hub'] ?? null;

    return ok(
      (wanted ? list.filter((r) => wanted.includes(r.entityType)) : list).slice(0, take)
    );
  });

  mock.onPost(new RegExp(`${ROOT}/recommendations/[^/]+/dismiss$`)).reply((config) => {
    dismissedRecommendations.add(segment(config.url, 1));
    return ok(undefined);
  });

  /**
   * The five types with no backend.
   *
   * Events and organizations are deliberately absent — they are searched
   * through B12's real routes and merged by the repository, which is what §40
   * asks for until a federated route exists.
   */
  mock.onGet(new RegExp(`${ROOT}/communities/search$`)).reply((config) => {
    const q = params(config);
    const needle = (q.query ?? '').toLowerCase();
    if (!needle) return page([], q.cursor);

    const rows: unknown[] = [];

    for (const s of series) {
      if (s.status === 'Draft') continue;
      if (!s.title.toLowerCase().includes(needle)) continue;
      rows.push({
        entityType: 'series',
        entityId: s.seriesId,
        title: s.title,
        subtitle: s.recurrence.description ?? 'Recurring event',
        imageUrl: s.coverImage,
        locationLabel: s.location.cityName,
        distanceKm: null,
        badge: s.category,
        actionRoute: `/community-life/series/${s.seriesId}`,
        source: 'simulated',
      });
    }

    for (const p of programmes) {
      if (p.visibility === 'Private') continue;
      if (!p.organizationName.toLowerCase().includes(needle)) continue;
      rows.push({
        entityType: 'membership',
        entityId: p.organizationId,
        title: p.organizationName,
        subtitle: `${p.tiers.length} membership ${p.tiers.length === 1 ? 'tier' : 'tiers'}`,
        imageUrl: p.organizationLogo,
        locationLabel: p.location?.cityName ?? null,
        distanceKm: null,
        badge: p.category,
        actionRoute: `/community-life/membership/${p.organizationId}`,
        source: 'simulated',
      });
    }

    for (const c of campaigns) {
      if (['Draft', 'PendingReview', 'Rejected'].includes(c.status)) continue;
      if (!c.title.toLowerCase().includes(needle) && !c.summary.toLowerCase().includes(needle)) continue;
      rows.push({
        entityType: 'campaign',
        entityId: c.campaignId,
        title: c.title,
        subtitle: c.summary,
        imageUrl: c.coverImage,
        locationLabel: c.locationLabel,
        distanceKm: null,
        badge: c.category,
        actionRoute: `/community-life/campaign/${c.campaignId}`,
        source: 'simulated',
      });
    }

    for (const o of opportunities) {
      if (o.status === 'Draft') continue;
      if (!o.title.toLowerCase().includes(needle) && !o.cause.toLowerCase().includes(needle)) continue;
      rows.push({
        entityType: 'opportunity',
        entityId: o.opportunityId,
        title: o.title,
        subtitle: `${o.cause} · ${o.organizationName}`,
        imageUrl: o.coverImage,
        locationLabel: o.location.cityName,
        distanceKm: null,
        badge: o.isFull ? 'Full' : null,
        actionRoute: `/community-life/volunteer/${o.opportunityId}`,
        source: 'simulated',
      });
    }

    for (const p of polls) {
      if (p.status === 'Draft') continue;
      if (!p.question.toLowerCase().includes(needle)) continue;
      rows.push({
        entityType: 'poll',
        entityId: p.pollId,
        title: p.question,
        subtitle: p.organizationName ?? 'Community poll',
        imageUrl: null,
        locationLabel: null,
        distanceKm: null,
        badge: p.status,
        actionRoute: `/community-life/poll/${p.pollId}`,
        source: 'simulated',
      });
    }

    const types = (q['types[]'] ?? q.types ?? '').split(',').filter(Boolean);
    const filtered = types.length
      ? rows.filter((row) => types.includes((row as { entityType: string }).entityType))
      : rows;

    return page(filtered, q.cursor, Number(q.take ?? 20));
  });

  return () => undefined;
}
