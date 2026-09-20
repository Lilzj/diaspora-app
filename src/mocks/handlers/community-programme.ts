// ═════════════════════════════════════════════════════════════════════════════
// Diaspora Platform — Community Programme, development handlers for the REAL
// contract (Remediation Wave C-04)
//
// `Diaspora.Modules.CommunityProgramme` serves the membership programme,
// volunteering, polls, organization capabilities, dashboards, announcements,
// impact and federated search under `/api/v1/communities`. This file answers
// those routes in development, and **every shape here was read from
// `CommunityProgrammeResponses.cs`, `CommunityProgrammeRequests.cs` and the six
// endpoint files** — not from what `hooks/community-life.ts` expects.
//
// That distinction is the whole point. The remediation's recurring finding:
//
//   > A development handler written from the client's expectations proves the
//   > client is self-consistent. It proves nothing about the platform.
//
// `handlers/community-gaps.ts` is still registered, still under
// `/community-gap/v0`, and now answers only what B18 genuinely does not serve:
// the hub summary, recommendations, occurrence registration and attendance,
// the campaign wrapper's donation stitching, and neighbourhood bindings.
//
// ── The properties this file enforces rather than describes ─────────────────
//
//   1. **PascalCase enum values on the wire.** Every enum crosses as a string
//      filled by `.ToString()`, and the host renames properties to camelCase
//      and never values. `"PaymentPending"`, not `"paymentPending"`.
//
//   2. **`items`, not anything else.** `CommunityPageResponse<T>` is
//      `{ items, nextCursor, hasMore, totalCount }` and every B18 route here
//      answers exactly that, so a client reading `payload.items` reads rows.
//      **The campaign and giving pages are B15's `GivingPageResponse<T>`, which
//      has no `totalCount`** — they go through `givingPage`, and a handler that
//      sent a total there would let a client render a count no server provides.
//
//   3. **`Idempotency-Key` is a header, and the body field is also read.**
//      `IdempotencyHeader.From` prefers the header; `ProgrammeIdempotency`
//      falls back to the body. Both are honoured here, and a repeat of a key
//      already seen returns the **same** record rather than a second one.
//
//   4. **Absence is not zero.** A free tier has `price: null`, a poll
//      withholding its tally has `options: null` — never `[]`, which renders as
//      "nobody voted" — and a certificate has `downloadUrl: null` because no
//      issuing service exists.
//
//   5. **It refuses.** A decision without a capability is 403, an unapproved
//      applicant assigned to a shift is 409, a closed poll is 409. A flow
//      tested against forgiving mocks breaks the first time a real server says
//      no.
//
// **Money still does not move here.** Binding a membership payment takes a B15
// payment intent identifier and records the binding; it creates no intent,
// captures nothing and invents no amount.
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';
import {
  MOCK_ANNOUNCEMENTS,
  MOCK_APPLICANTS,
  MOCK_ASSIGNMENTS,
  MOCK_CAMPAIGNS_SEED,
  MOCK_CAMPAIGN_MILESTONES,
  MOCK_CAMPAIGN_UPDATES,
  MOCK_CAPABILITIES,
  MOCK_FUND_USAGE,
  MOCK_SUPPORTERS,
  MOCK_MEMBERSHIPS,
  MOCK_MY_ORGANIZATIONS,
  MOCK_OPEN_RESPONSES,
  MOCK_OPPORTUNITIES,
  MOCK_ORG_MEMBERS,
  MOCK_POLLS,
  MOCK_POLL_TALLIES,
  MOCK_PROGRAMMES,
  MOCK_VOLUNTEER_APPLICATIONS,
} from '../community-gap-data';
// B15's real causes. A campaign's figures come from the cause it collects
// through, never from the campaign's own fixture — the same rule the backend's
// `CampaignMapper` states, and the reason a refund cannot make two numbers
// disagree.
import { MOCK_CAUSES } from '../financial-data';
import type {
  CampaignMilestone,
  CampaignUpdate,
  CommunityAnnouncement,
  CommunityMembership,
  CommunityPoll,
  FundUsageLine,
  FundraisingCampaign,
  MembershipProgramme,
  MembershipTier,
  OrganizationMember,
  VolunteerApplicant,
  VolunteerApplication,
  VolunteerAssignment,
  RecurringDonation,
  VolunteerOpportunity,
} from '@/types/community-advanced';
import { backed } from '@/types/community-advanced';

/** B18's prefix, as `apiClient` addresses it. */
const ROOT = '/communities';

type MockReply = [number, unknown];

/** `PlatformResults.Ok` — `{ data, meta }`. `meta` is not read by this client. */
function ok(data: unknown): MockReply {
  return [200, { data }];
}

/** `PlatformResults.Created` — the same envelope with a 201. */
function created(data: unknown): MockReply {
  return [201, { data }];
}

/** `CommunityPageResponse<T>`. Rows are named `items`; nothing else will do. */
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

/** `PlatformProblem`. Same document a real refusal produces. */
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

function body<T>(config: { data?: unknown }): T {
  try {
    return config.data ? (JSON.parse(String(config.data)) as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function query(config: { params?: Record<string, unknown> }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.params ?? {})) {
    if (value !== undefined && value !== null && value !== '') out[key] = String(value);
  }
  return out;
}

/** The nth segment from the end of a path. `segment(url, 0)` is the last. */
function segment(url: string | undefined, fromEnd: number): string {
  const parts = (url ?? '').split('?')[0].split('/').filter(Boolean);
  return parts[parts.length - 1 - fromEnd] ?? '';
}

/**
 * The idempotency key a request carried, header first.
 *
 * `IdempotencyHeader.From(context)` reads the header and
 * `ProgrammeIdempotency.Normalise(operation, header, bodyField)` prefers it, so
 * that is the order here. A handler that read only the body would let a
 * header-only client create duplicates in development and nowhere else.
 */
function idempotencyKey(config: {
  headers?: Record<string, unknown>;
  data?: unknown;
}): string | null {
  const header = config.headers?.['Idempotency-Key'];
  if (typeof header === 'string' && header !== '') return header;
  const fromBody = body<{ idempotencyKey?: string }>(config).idempotencyKey;
  return typeof fromBody === 'string' && fromBody !== '' ? fromBody : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The signed-in development user. Matches the auth mock. */
const ME = 'user-123';

/**
 * §16's transition table, as the aggregate holds it.
 *
 * Declared here rather than derived from the six route names, because the route
 * says where a caller wants to go and this says whether the campaign may. The
 * two are different questions and the second is the server's — an illegal move
 * is a **409**, not a button the client should have known not to draw.
 */
const CAMPAIGN_TRANSITIONS: Record<string, string[]> = {
  Draft: ['PendingReview', 'Cancelled'],
  PendingReview: ['Published', 'Rejected', 'Cancelled'],
  Rejected: ['PendingReview', 'Cancelled'],
  Published: ['Active', 'Paused', 'Closed', 'Cancelled'],
  Active: ['Paused', 'GoalReached', 'DeadlineReached', 'Closed', 'Cancelled'],
  Paused: ['Active', 'Closed', 'Cancelled'],
  GoalReached: ['Completed', 'Closed'],
  DeadlineReached: ['Completed', 'Closed', 'Refunding'],
  Refunding: ['Closed'],
  Completed: [],
  Cancelled: [],
  Closed: [],
};

/** Which state each lifecycle verb means. `CampaignEndpoints.Lifecycle`. */
const LIFECYCLE_TARGET: Record<string, string> = {
  submit: 'PendingReview',
  publish: 'Published',
  pause: 'Paused',
  resume: 'Active',
  close: 'Closed',
  cancel: 'Cancelled',
};

const RECURRING_DONATION_SEED: RecurringDonation[] = [
  {
    recurringDonationId: 'rd-0001',
    causeCode: 'student-bursary-fund',
    causeTitle: 'University Student Bursary Fund',
    amount: { amount: 10, currency: 'GBP', minorUnits: 1000, exponent: 2, symbol: '£' },
    intervalMonths: 1,
    status: 'Active',
    nextChargeAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
    lastChargeAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    lastAttemptAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    lastFailureReason: null,
    consecutiveFailures: 0,
    chargeCount: 7,
    createdAt: new Date(Date.now() - 220 * 24 * 60 * 60 * 1000).toISOString(),
    cancelledAt: null,
  },
  {
    recurringDonationId: 'rd-0002',
    causeCode: 'winter-clothing-drive',
    causeTitle: 'Refugee Winter Clothing Drive',
    amount: { amount: 25, currency: 'GBP', minorUnits: 2500, exponent: 2, symbol: '£' },
    intervalMonths: 3,
    status: 'Retrying',
    nextChargeAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    lastChargeAt: new Date(Date.now() - 92 * 24 * 60 * 60 * 1000).toISOString(),
    lastAttemptAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    lastFailureReason: 'The card was declined.',
    consecutiveFailures: 1,
    chargeCount: 3,
    createdAt: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString(),
    cancelledAt: null,
  },
  {
    recurringDonationId: 'rd-0003',
    causeCode: 'funeral-support-adeyemi',
    causeTitle: 'Repatriation fund for the Adeyemi family',
    amount: { amount: 5, currency: 'GBP', minorUnits: 500, exponent: 2, symbol: '£' },
    intervalMonths: 1,
    status: 'Cancelled',
    nextChargeAt: null,
    lastChargeAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    lastAttemptAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    lastFailureReason: null,
    consecutiveFailures: 0,
    chargeCount: 2,
    createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    cancelledAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

/** B15's prefix. Only the two giving-extension routes are served under it. */
const FINANCIAL_ROOT = '/financial';

/** `CampaignMilestoneResponse`. The money carries its own minor units. */
function milestoneWire(milestone: CampaignMilestone) {
  return {
    milestoneId: milestone.milestoneId,
    label: milestone.label,
    target: {
      amount: milestone.target.amount,
      currency: milestone.target.currency,
      minorUnits: milestone.target.minorUnits,
      exponent: milestone.target.exponent,
      symbol: milestone.target.currency === 'GBP' ? '£' : null,
    },
    isReached: milestone.isReached,
    reachedAt: milestone.reachedAt ?? null,
  };
}

/**
 * `CampaignFundUsageResponse` — the envelope, not the lines.
 *
 * Four totals with four different authorities. `raised` is the cause's own,
 * `allocated` is what the organiser declared, `disbursed` is what the lines
 * report and `disbursedVerified` is the part a settled payout backs — which is
 * zero in this fixture, because no payout in it is settled and claiming
 * otherwise would fabricate the one assurance this response exists to carry.
 */
function fundUsageWire(campaign: FundraisingCampaign, lines: FundUsageLine[]) {
  const currency = campaign.progress.target.value?.currency ?? 'GBP';
  const exponent = campaign.progress.target.value?.exponent ?? 2;
  const symbol = currency === 'GBP' ? '£' : null;

  const asMoney = (minorUnits: number) => ({
    amount: minorUnits / 10 ** exponent,
    currency,
    minorUnits,
    exponent,
    symbol,
  });

  const cause = campaign.causeCode
    ? MOCK_CAUSES.find((row) => row.code === campaign.causeCode)
    : undefined;
  const raisedMinor = cause?.raised?.minorUnits ?? 0;
  const allocatedMinor = lines.reduce((sum, line) => sum + line.allocated.minorUnits, 0);
  const disbursedMinor = lines.reduce((sum, line) => sum + (line.spent?.minorUnits ?? 0), 0);
  const verifiedMinor = lines.reduce(
    (sum, line) => sum + (line.isPlatformVerified ? line.spent?.minorUnits ?? 0 : 0),
    0
  );

  return {
    campaignId: campaign.campaignId,
    causeCode: campaign.causeCode ?? null,
    raised: asMoney(raisedMinor),
    allocated: asMoney(allocatedMinor),
    disbursed: asMoney(disbursedMinor),
    disbursedVerified: asMoney(verifiedMinor),
    // Never negative. An over-report is clamped and flagged rather than shown
    // as a negative remainder, which reads as a debt nobody owes.
    remaining: asMoney(Math.max(0, raisedMinor - disbursedMinor)),
    lines: lines.map((line) => ({
      id: line.id,
      label: line.label,
      allocated: {
        amount: line.allocated.amount,
        currency: line.allocated.currency,
        minorUnits: line.allocated.minorUnits,
        exponent: line.allocated.exponent,
        symbol,
      },
      spent: line.spent
        ? {
            amount: line.spent.amount,
            currency: line.spent.currency,
            minorUnits: line.spent.minorUnits,
            exponent: line.spent.exponent,
            symbol,
          }
        : null,
      note: line.note ?? null,
      isPlatformVerified: line.isPlatformVerified ?? false,
    })),
    isOverReported: disbursedMinor > raisedMinor,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture → wire
//
// The fixtures in `community-gap-data.ts` are in the *client's* model, because
// that is what the gap adapter served. B18 answers a different shape, so every
// converter below turns a fixture back into the record the server would send —
// media identifiers rather than URLs, instants rather than date/time pairs,
// `exponent` rather than `minorUnits`. That is the direction that matters: a
// handler that skipped this step would be testing the client against itself.
// ─────────────────────────────────────────────────────────────────────────────

interface MoneyLike {
  amount: number;
  currency: string;
  exponent: number;
}

function money(value: { amount: number; currency: string; exponent: number } | null | undefined) {
  return value ? { amount: value.amount, currency: value.currency, exponent: value.exponent } : null;
}

function tierWire(tier: MembershipTier) {
  return {
    tierId: tier.tierId,
    organizationId: tier.organizationId,
    name: tier.name,
    description: tier.description,
    // Null for a free tier. Never a zero — the absence is the meaning.
    price: money(tier.price) as MoneyLike | null,
    billingPeriod: tier.billingPeriod,
    benefits: tier.benefits,
    requirements: tier.requirements.map((requirement) => ({
      id: requirement.id,
      label: requirement.label,
      description: requirement.description ?? null,
      kind: requirement.kind,
      // The server's evaluation, made on every read.
      isMet: requirement.isMet,
      actionRoute: requirement.actionRoute ?? null,
    })),
    capacity: tier.capacity ?? null,
    filledCount: tier.filledCount,
    isFull: tier.isFull,
    isRecommended: tier.isRecommended,
    sortOrder: tier.sortOrder,
  };
}

function programmeWire(programme: MembershipProgramme) {
  return {
    organizationId: programme.organizationId,
    organizationName: programme.organizationName,
    // A B5 asset identifier, never a URL — which is why the client shows a
    // placeholder rather than the fixture's image.
    organizationLogoMediaId: null,
    category: programme.category,
    isVerified: programme.isVerified,
    visibility: programme.visibility,
    isOpen: programme.isOpen,
    requiresApproval: programme.requiresApproval,
    summary: programme.summary,
    tiers: programme.tiers.map(tierWire),
    memberCount: programme.memberCount,
    countryCode: programme.countryCode ?? null,
    cityName: programme.location?.cityName ?? null,
    myStatus: programme.myStatus,
    myMembershipId: programme.myMembershipId ?? null,
  };
}

function membershipWire(membership: CommunityMembership) {
  return {
    membershipId: membership.membershipId,
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    organizationLogoMediaId: null,
    tierId: membership.tierId,
    tierName: membership.tierName,
    status: membership.status,
    price: money(membership.price) as MoneyLike | null,
    billingPeriod: membership.billingPeriod,
    benefits: membership.benefits,
    joinedAt: membership.joinedAt ?? null,
    expiresAt: membership.expiresAt ?? null,
    renewalDueAt: membership.renewalDueAt ?? null,
    isRenewable: membership.isRenewable,
    grantsBenefits: membership.status === 'Active' || membership.status === 'RenewalDue',
    // An identifier and nothing else. Every fact about the money is B15's.
    paymentIntentId: membership.payment?.paymentIntentId ?? null,
    history: membership.history,
    decisionReason: membership.decisionReason ?? null,
  };
}

/**
 * The roll's view of a member.
 *
 * **No display name, no avatar, no verification flag** — §45, and the reason
 * `OrganizationMemberResponse` is a narrower contract than the member's own
 * read. Dropping them here is what makes the client's placeholder rendering
 * testable in development instead of surprising in production.
 */
function memberWire(member: OrganizationMember) {
  return {
    membershipId: member.membershipId,
    userId: member.userId,
    tierId: member.membershipId,
    tierName: member.tierName,
    status: member.status,
    role: member.role,
    organizationMembershipId: null,
    joinedAt: member.joinedAt ?? null,
    expiresAt: member.expiresAt ?? null,
    appliedAt: member.joinedAt ?? nowIso(),
  };
}

/** A local date and wall-clock time back into the instant B18 sends. */
function instant(date: string, time: string): string {
  return `${date}T${time.length === 5 ? `${time}:00` : time}.000Z`;
}

function opportunityWire(opportunity: VolunteerOpportunity) {
  return {
    opportunityId: opportunity.opportunityId,
    title: opportunity.title,
    description: opportunity.description,
    cause: opportunity.cause,
    status: opportunity.status,
    organizationId: opportunity.organizationId ?? '',
    organizationName: opportunity.organizationName,
    organizationLogoMediaId: null,
    isVerified: opportunity.isVerified,
    countryCode: null,
    cityName: opportunity.location.cityName,
    areaName: opportunity.location.areaName,
    addressLine: opportunity.location.addressLine,
    startsAt: opportunity.startDate ?? null,
    endsAt: opportunity.endDate ?? null,
    shifts: opportunity.shifts.map((shift) => ({
      shiftId: shift.shiftId,
      opportunityId: shift.opportunityId,
      label: shift.label,
      startsAt: instant(shift.date, shift.startTime),
      endsAt: instant(shift.date, shift.endTime),
      capacity: shift.capacity,
      filledCount: shift.filledCount,
      isFull: shift.isFull,
    })),
    requiredSkills: opportunity.requiredSkills,
    minimumAge: opportunity.minimumAge ?? null,
    capacity: opportunity.capacity ?? null,
    filledCount: opportunity.filledCount,
    waitlistCount: 0,
    isFull: opportunity.isFull,
    applicationDeadline: opportunity.applicationDeadline ?? null,
    myApplicationStatus: opportunity.myApplicationStatus,
    myApplicationId: opportunity.myApplicationId ?? null,
    canApply: opportunity.canApply,
    cannotApplyReason: opportunity.cannotApplyReason ?? null,
    canManage: opportunity.canManage,
    createdAt: opportunity.createdAt,
  };
}

function assignmentWire(assignment: VolunteerAssignment) {
  return {
    assignmentId: assignment.assignmentId,
    applicationId: assignment.applicationId,
    opportunityId: assignment.opportunityId,
    opportunityTitle: assignment.opportunityTitle,
    organizationId: '',
    volunteerUserId: ME,
    shiftId: assignment.shiftId ?? null,
    shiftLabel: assignment.shiftLabel ?? null,
    startsAt: instant(assignment.date, assignment.startTime),
    endsAt: instant(assignment.date, assignment.endTime),
    status: assignment.status,
    checkedInAt: assignment.checkedInAt ?? null,
    checkedOutAt: assignment.checkedOutAt ?? null,
    // Null until an organizer confirms. Never self-reported.
    confirmedHours: assignment.confirmedHours ?? null,
    confirmedAt: assignment.confirmedHours != null ? nowIso() : null,
  };
}

function applicationWire(application: VolunteerApplication) {
  return {
    applicationId: application.applicationId,
    opportunityId: application.opportunityId,
    opportunityTitle: application.opportunityTitle,
    organizationId: '',
    organizationName: application.organizationName,
    shiftId: null,
    status: application.status,
    answers: application.answers,
    submittedAt: application.submittedAt ?? null,
    decidedAt: application.decidedAt ?? null,
    decisionReason: application.decisionReason ?? null,
    waitlistPosition: application.waitlistPosition ?? null,
    assignment: application.assignment ? assignmentWire(application.assignment) : null,
  };
}

/** As with the member roll: the organizer's queue carries no contact details. */
function applicantWire(applicant: VolunteerApplicant) {
  return {
    applicationId: applicant.applicationId,
    userId: applicant.userId,
    status: applicant.status,
    answers: applicant.answers,
    shiftId: null,
    submittedAt: applicant.submittedAt,
    waitlistPosition: null,
  };
}

function pollWire(poll: CommunityPoll) {
  return {
    pollId: poll.pollId,
    question: poll.question,
    description: poll.description ?? null,
    status: poll.status,
    votingType: poll.votingType,
    audience: poll.audience,
    // No count on an option. A component holding a poll must have nothing to
    // add up, which is what makes server-computed results structural.
    options: poll.options.map((option) => ({
      optionId: option.optionId,
      label: option.label,
      description: option.description ?? null,
      sortOrder: option.sortOrder,
    })),
    maxSelections: poll.maxSelections ?? null,
    isAnonymous: poll.isAnonymous,
    allowsChange: poll.allowsChange,
    organizationId: poll.organizationId ?? null,
    organizationName: poll.organizationName ?? null,
    opensAt: poll.opensAt ?? null,
    closesAt: poll.closesAt ?? null,
    totalResponses: poll.totalResponses,
    hasVoted: poll.hasVoted,
    // Structurally absent on an anonymous poll.
    myResponse: poll.isAnonymous ? null : poll.myResponse ?? null,
    canVote: poll.canVote,
    cannotVoteReason: poll.cannotVoteReason ?? null,
    canManage: poll.canManage,
    createdAt: poll.createdAt,
  };
}

/**
 * The tally, computed here as the database computes it there.
 *
 * `options` is **null** while the result is withheld — a closed-results poll
 * that has not published — and never `[]`. An empty array renders as "nobody
 * voted", which is a different and false statement, and the client's adapter
 * preserves the distinction only if this side makes it.
 */
function pollResultWire(poll: CommunityPoll) {
  const visible = poll.status === 'ResultsPublished' || poll.status === 'Closed';
  const tally = MOCK_POLL_TALLIES[poll.pollId] ?? {};
  const total = Object.values(tally).reduce((sum, count) => sum + count, 0);

  return {
    pollId: poll.pollId,
    status: poll.status,
    options: visible
      ? poll.options.map((option) => ({
          optionId: option.optionId,
          label: option.label,
          count: tally[option.optionId] ?? 0,
          percentage:
            total === 0 ? 0 : Math.round(((tally[option.optionId] ?? 0) / total) * 1000) / 10,
          isMyChoice: poll.isAnonymous
            ? null
            : (poll.myResponse?.selectedOptionIds ?? []).includes(option.optionId),
        }))
      : null,
    totalResponses: total,
    openResponses: visible ? MOCK_OPEN_RESPONSES[poll.pollId] ?? null : null,
    areResultsVisible: visible,
    resultsHiddenReason: visible ? null : 'Results are published when the poll closes.',
    computedAt: nowIso(),
  };
}

function announcementWire(announcement: CommunityAnnouncement) {
  return {
    announcementId: announcement.announcementId,
    scope: announcement.scope,
    scopeId: announcement.scopeId ?? null,
    scopeName: announcement.scopeName,
    title: announcement.title,
    body: announcement.body,
    // B5 identifiers, never URLs.
    mediaIds: [],
    publishedByUserId: ME,
    organizationId: announcement.scope === 'Organization' ? announcement.scopeId ?? null : null,
    isPinned: announcement.isPinned,
    publishedAt: announcement.publishedAt,
    actionRoute: announcement.actionRoute ?? null,
  };
}

function capabilitiesWire(organizationId: string) {
  const granted = MOCK_CAPABILITIES[organizationId];
  return {
    organizationId,
    role: granted?.role ?? null,
    canManageMembers: granted?.canManageMembers ?? false,
    canApproveMembers: granted?.canApproveMembers ?? false,
    canManageTiers: granted?.canManageTiers ?? false,
    canManageEvents: granted?.canManageEvents ?? false,
    canManageCampaigns: granted?.canManageCampaigns ?? false,
    canManageVolunteers: granted?.canManageVolunteers ?? false,
    canManagePolls: granted?.canManagePolls ?? false,
    canPublishAnnouncements: granted?.canPublishAnnouncements ?? false,
    canViewAnalytics: granted?.canViewAnalytics ?? false,
    canViewFinancials: granted?.canViewFinancials ?? false,
  };
}

/** A daily series over the period, so a chart has something with a shape. */
function timeSeries(days: number, base: number) {
  const points: { date: string; value: number }[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10);
    points.push({ date: day, value: base + (days - index) });
  }
  return points;
}

function daysFor(period: string | undefined): number {
  if (period === '7d') return 7;
  if (period === '90d') return 90;
  if (period === '12m') return 52;
  return 30;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers B18's routes.
 *
 * **No `areCommunityGapsEnabled()` guard, and that is the difference.** These
 * are certified routes; a release build talks to the real server rather than to
 * nothing, so there is no simulated record to keep out of a production binary.
 * The guard belongs on `handlers/community-gaps.ts`, and stays there.
 */
export function setupCommunityProgrammeMocks(mock: MockAdapter): () => void {
  // ── Session state ──────────────────────────────────────────────────────────

  let programmes: MembershipProgramme[] = MOCK_PROGRAMMES.map((entry) => ({ ...entry }));
  let memberships: CommunityMembership[] = MOCK_MEMBERSHIPS.map((entry) => ({ ...entry }));
  const orgMembers: Record<string, OrganizationMember[]> = Object.fromEntries(
    Object.entries(MOCK_ORG_MEMBERS).map(([id, list]) => [id, list.map((row) => ({ ...row }))])
  );
  let opportunities: VolunteerOpportunity[] = MOCK_OPPORTUNITIES.map((entry) => ({ ...entry }));
  let applications: VolunteerApplication[] = MOCK_VOLUNTEER_APPLICATIONS.map((entry) => ({
    ...entry,
  }));
  const applicants: Record<string, VolunteerApplicant[]> = Object.fromEntries(
    Object.entries(MOCK_APPLICANTS).map(([id, list]) => [id, list.map((row) => ({ ...row }))])
  );
  let assignments: VolunteerAssignment[] = MOCK_ASSIGNMENTS.map((entry) => ({ ...entry }));
  let polls: CommunityPoll[] = MOCK_POLLS.map((entry) => ({ ...entry }));
  let announcements: CommunityAnnouncement[] = MOCK_ANNOUNCEMENTS.map((entry) => ({ ...entry }));
  let campaigns: FundraisingCampaign[] = MOCK_CAMPAIGNS_SEED.map((entry) => ({ ...entry }));
  const campaignUpdates: Record<string, CampaignUpdate[]> = Object.fromEntries(
    Object.entries(MOCK_CAMPAIGN_UPDATES).map(([id, list]) => [id, list.map((row) => ({ ...row }))])
  );
  const campaignMilestones: Record<string, CampaignMilestone[]> = Object.fromEntries(
    Object.entries(MOCK_CAMPAIGN_MILESTONES).map(([id, list]) => [
      id,
      list.map((row) => ({ ...row })),
    ])
  );
  const fundUsage: Record<string, FundUsageLine[]> = Object.fromEntries(
    Object.entries(MOCK_FUND_USAGE).map(([id, list]) => [id, list.map((row) => ({ ...row }))])
  );
  /**
   * Standing donations. COMMUNITY-LIFE-GAP-008.
   *
   * Three, on purpose: one running, one that a card declined and will be retried,
   * and one the donor stopped. The three render materially differently, and a
   * fixture with only the happy one would let a screen ship that had never drawn
   * a failure or a cancellation.
   *
   * `nextChargeAt` is null on the cancelled one. **Never a date nothing intends
   * to keep** — which is the exact promise this gap could not make before B15.1
   * shipped a sweep behind it.
   */
  let recurringDonations: RecurringDonation[] = RECURRING_DONATION_SEED.map((entry) => ({
    ...entry,
  }));

  /**
   * Keys already committed, and what they produced.
   *
   * A retried submission returns the **same** record rather than creating a
   * second one — which is the guarantee `ProgrammeIdempotency` gives with a
   * uniquely indexed key column, and the reason a flaky connection cannot
   * enrol somebody twice.
   */
  const committed = new Map<string, unknown>();

  function idempotent(config: { headers?: Record<string, unknown>; data?: unknown }, produce: () => MockReply): MockReply {
    const key = idempotencyKey(config);
    if (key === null) return produce();
    const seen = committed.get(key);
    if (seen !== undefined) return ok(seen);
    const reply = produce();
    if (reply[0] < 300) committed.set(key, (reply[1] as { data: unknown }).data);
    return reply;
  }

  // ══ MEMBERSHIP ═════════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/memberships/discover$`)).reply((config) => {
    const filters = query(config);
    let rows = programmes;

    // Visibility is enforced by **omission**, exactly as the server enforces it:
    // a private programme is absent rather than present with a flag, because a
    // flag means the private group already reached the device.
    rows = rows.filter((row) => row.visibility === 'Public');

    if (filters.query) {
      const needle = filters.query.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.organizationName.toLowerCase().includes(needle) ||
          row.summary.toLowerCase().includes(needle)
      );
    }
    if (filters.category) rows = rows.filter((row) => row.category === filters.category);
    if (filters.countryCode) rows = rows.filter((row) => row.countryCode === filters.countryCode);
    if (filters.priceBand === 'free') {
      rows = rows.filter((row) => row.tiers.some((tier) => !tier.price));
    }
    if (filters.priceBand === 'paid') {
      rows = rows.filter((row) => row.tiers.some((tier) => Boolean(tier.price)));
    }
    if (filters.eligibleOnly === 'true') {
      rows = rows.filter((row) =>
        row.tiers.some((tier) => tier.requirements.every((requirement) => requirement.isMet))
      );
    }

    return page(rows.map(programmeWire), filters.cursor, Number(filters.take) || 20);
  });

  mock.onGet(new RegExp(`${ROOT}/memberships/me$`)).reply(() => ok(memberships.map(membershipWire)));

  mock.onGet(new RegExp(`${ROOT}/memberships/[^/]+$`)).reply((config) => {
    const id = segment(config.url, 0);
    const found = memberships.find((row) => row.membershipId === id);
    return found ? ok(membershipWire(found)) : problem(404, 'membership.not_found', 'No such membership.');
  });

  mock.onGet(new RegExp(`${ROOT}/[^/]+/membership/tiers$`)).reply((config) => {
    const organizationId = segment(config.url, 2);
    const found = programmes.find((row) => row.organizationId === organizationId);
    return found ? ok(found.tiers.map(tierWire)) : ok([]);
  });

  mock.onGet(new RegExp(`${ROOT}/[^/]+/membership$`)).reply((config) => {
    const organizationId = segment(config.url, 1);
    const found = programmes.find((row) => row.organizationId === organizationId);
    return found
      ? ok(programmeWire(found))
      : problem(404, 'programme.not_found', 'This organisation has no membership programme.');
  });

  mock.onGet(new RegExp(`${ROOT}/[^/]+/memberships$`)).reply((config) => {
    const organizationId = segment(config.url, 1);
    const capabilities = MOCK_CAPABILITIES[organizationId];

    // The roll refuses rather than filtering. A hidden button is a
    // convenience; this is the control.
    if (!capabilities?.canManageMembers) {
      return problem(403, 'organization.role_required', 'You cannot manage this organisation.');
    }

    const filters = query(config);
    let rows = orgMembers[organizationId] ?? [];
    if (filters.state) rows = rows.filter((row) => row.status === filters.state);
    return page(rows.map(memberWire), filters.cursor, Number(filters.take) || 20);
  });

  mock.onPost(new RegExp(`${ROOT}/[^/]+/memberships/applications$`)).reply((config) =>
    idempotent(config, () => {
      const organizationId = segment(config.url, 2);
      const request = body<{ tierId?: string; answers?: Record<string, string> }>(config);
      const programme = programmes.find((row) => row.organizationId === organizationId);
      const tier = programme?.tiers.find((row) => row.tierId === request.tierId);

      if (!programme || !tier) {
        return problem(404, 'tier.not_found', 'No such membership tier.');
      }
      if (!programme.isOpen) {
        return problem(409, 'programme.closed', 'This programme is not accepting applications.');
      }
      if (tier.requirements.some((requirement) => !requirement.isMet)) {
        return problem(403, 'membership.ineligible', 'You do not meet this tier’s requirements yet.');
      }

      // Where the application *opens* is the programme's policy, never the
      // client's inference: reviewed programmes open Pending; unreviewed ones
      // open Approved, and a free tier goes straight on to Active. A paid tier
      // stops at Approved and waits for B15.
      const status = programme.requiresApproval
        ? 'Pending'
        : tier.price
          ? 'Approved'
          : 'Active';

      const membership: CommunityMembership = {
        membershipId: newId('mem'),
        organizationId,
        organizationName: programme.organizationName,
        organizationLogo: null,
        tierId: tier.tierId,
        tierName: tier.name,
        status,
        price: tier.price ?? null,
        billingPeriod: tier.billingPeriod,
        benefits: tier.benefits,
        joinedAt: status === 'Active' ? nowIso() : null,
        expiresAt: null,
        renewalDueAt: null,
        isRenewable: false,
        payment: null,
        history: [
          { id: newId('hist'), status, occurredAt: nowIso(), actor: 'Member', reason: null },
        ],
        decisionReason: null,
      };

      memberships = [membership, ...memberships];
      programmes = programmes.map((row) =>
        row.organizationId === organizationId
          ? { ...row, myStatus: status, myMembershipId: membership.membershipId }
          : row
      );

      return created(membershipWire(membership));
    })
  );

  mock.onPost(new RegExp(`${ROOT}/memberships/[^/]+/cancel$`)).reply((config) => {
    const id = segment(config.url, 1);
    const request = body<{ reason?: string }>(config);
    const found = memberships.find((row) => row.membershipId === id);
    if (!found) return problem(404, 'membership.not_found', 'No such membership.');
    if (found.status === 'Cancelled') {
      return problem(409, 'membership.already_cancelled', 'This membership is already cancelled.');
    }

    const updated: CommunityMembership = {
      ...found,
      status: 'Cancelled',
      decisionReason: request.reason ?? null,
      history: [
        ...found.history,
        {
          id: newId('hist'),
          status: 'Cancelled',
          occurredAt: nowIso(),
          actor: 'Member',
          reason: request.reason ?? null,
        },
      ],
    };
    memberships = memberships.map((row) => (row.membershipId === id ? updated : row));
    return ok(membershipWire(updated));
  });

  mock.onPost(new RegExp(`${ROOT}/memberships/[^/]+/renew$`)).reply((config) =>
    idempotent(config, () => {
      const id = segment(config.url, 1);
      const found = memberships.find((row) => row.membershipId === id);
      if (!found) return problem(404, 'membership.not_found', 'No such membership.');
      if (!found.isRenewable) {
        return problem(409, 'membership.not_renewable', 'This membership cannot be renewed.');
      }

      // A paid renewal waits for B15; a free one takes effect. Neither
      // conclusion is the client's.
      const status = found.price ? 'PaymentPending' : 'Active';
      const updated: CommunityMembership = {
        ...found,
        status,
        history: [
          ...found.history,
          { id: newId('hist'), status, occurredAt: nowIso(), actor: 'Member', reason: null },
        ],
      };
      memberships = memberships.map((row) => (row.membershipId === id ? updated : row));
      return ok(membershipWire(updated));
    })
  );

  mock.onPost(new RegExp(`${ROOT}/memberships/[^/]+/payments$`)).reply((config) => {
    const id = segment(config.url, 1);
    const request = body<{ paymentIntentId?: string }>(config);
    const found = memberships.find((row) => row.membershipId === id);
    if (!found) return problem(404, 'membership.not_found', 'No such membership.');

    // `MembershipSettlement` refuses anything that has not actually settled.
    // The identifier alone is not evidence, and a request without one is not a
    // payment.
    if (!request.paymentIntentId) {
      return problem(400, 'payment.intent_required', 'A settled payment intent is required.');
    }

    const updated: CommunityMembership = {
      ...found,
      status: 'Active',
      joinedAt: found.joinedAt ?? nowIso(),
      payment: {
        paymentIntentId: request.paymentIntentId,
        paymentStatus: 'Captured',
        amount: found.price ?? { amount: 0, currency: 'GBP', minorUnits: 0, exponent: 2 },
        attemptedAt: nowIso(),
        completedAt: nowIso(),
        bindingSource: 'backend',
      },
      history: [
        ...found.history,
        { id: newId('hist'), status: 'Active', occurredAt: nowIso(), actor: 'System', reason: null },
      ],
    };
    memberships = memberships.map((row) => (row.membershipId === id ? updated : row));
    return ok(membershipWire(updated));
  });

  mock.onPost(new RegExp(`${ROOT}/memberships/[^/]+/decision$`)).reply((config) => {
    const id = segment(config.url, 1);
    const request = body<{ decision?: string; reason?: string }>(config);

    for (const [organizationId, rows] of Object.entries(orgMembers)) {
      const found = rows.find((row) => row.membershipId === id);
      if (!found) continue;

      if (!MOCK_CAPABILITIES[organizationId]?.canApproveMembers) {
        return problem(403, 'organization.role_required', 'You cannot decide memberships here.');
      }

      const next =
        request.decision === 'approve'
          ? 'Approved'
          : request.decision === 'reject'
            ? 'Rejected'
            : request.decision === 'suspend'
              ? 'Suspended'
              : request.decision === 'reinstate'
                ? 'Active'
                : request.decision === 'remove'
                  ? 'Cancelled'
                  : 'Pending';

      const updated: OrganizationMember = { ...found, status: next as OrganizationMember['status'] };
      orgMembers[organizationId] = rows.map((row) => (row.membershipId === id ? updated : row));
      return ok(memberWire(updated));
    }

    return problem(404, 'membership.not_found', 'No such membership.');
  });

  // ══ VOLUNTEERING ═══════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/volunteer/opportunities$`)).reply((config) => {
    const filters = query(config);
    let rows = opportunities;

    // Drafts are absent for anybody who cannot manage them — absent, not
    // flagged, for the same reason a private programme is.
    rows = rows.filter((row) => row.status !== 'Draft' || row.canManage);

    if (filters.query) {
      const needle = filters.query.toLowerCase();
      rows = rows.filter((row) => row.title.toLowerCase().includes(needle));
    }
    if (filters.cause) rows = rows.filter((row) => row.cause === filters.cause);
    if (filters.organizationId) {
      rows = rows.filter((row) => row.organizationId === filters.organizationId);
    }
    if (filters.cityName) rows = rows.filter((row) => row.location.cityName === filters.cityName);
    if (filters.state) rows = rows.filter((row) => row.status === filters.state);

    return page(rows.map(opportunityWire), filters.cursor, Number(filters.take) || 20);
  });

  mock.onGet(new RegExp(`${ROOT}/volunteer/shifts$`)).reply((config) => {
    const filters = query(config);
    const found = opportunities.find((row) => row.opportunityId === filters.opportunityId);
    return ok(found ? opportunityWire(found).shifts : []);
  });

  mock.onGet(new RegExp(`${ROOT}/volunteer/applications/me$`)).reply(() =>
    ok(applications.map(applicationWire))
  );

  mock.onGet(new RegExp(`${ROOT}/volunteer/assignments/me$`)).reply(() =>
    ok(assignments.map(assignmentWire))
  );

  mock.onGet(new RegExp(`${ROOT}/volunteer/hours/me$`)).reply(() => {
    const confirmed = assignments
      .filter((row) => row.confirmedHours != null)
      .reduce((sum, row) => sum + (row.confirmedHours ?? 0), 0);

    return ok({
      // Organizer-confirmed only. A self-reported hour is not an hour.
      confirmedHours: confirmed,
      completedAssignments: assignments.filter((row) => row.status === 'Completed').length,
      organizationsSupported: new Set(assignments.map((row) => row.opportunityId)).size,
      certificates: assignments
        .filter((row) => row.confirmedHours != null)
        .map((row) => ({
          certificateId: `cert-${row.assignmentId}`,
          title: row.opportunityTitle,
          organizationId: '',
          organizationName: row.opportunityTitle,
          hours: row.confirmedHours ?? 0,
          issuedAt: nowIso(),
          // Absent, and honestly so: no issuing service exists.
          downloadUrl: null,
        })),
    });
  });

  mock.onGet(new RegExp(`${ROOT}/volunteer/certificates/me$`)).reply(() =>
    ok(
      assignments
        .filter((row) => row.confirmedHours != null)
        .map((row) => ({
          certificateId: `cert-${row.assignmentId}`,
          title: row.opportunityTitle,
          organizationId: '',
          organizationName: row.opportunityTitle,
          hours: row.confirmedHours ?? 0,
          issuedAt: nowIso(),
          downloadUrl: null,
        }))
    )
  );

  mock.onGet(new RegExp(`${ROOT}/volunteer/opportunities/[^/]+/applications$`)).reply((config) => {
    const opportunityId = segment(config.url, 1);
    const found = opportunities.find((row) => row.opportunityId === opportunityId);
    if (!found?.canManage) {
      return problem(403, 'opportunity.role_required', 'You cannot manage this opportunity.');
    }
    const filters = query(config);
    let rows = applicants[opportunityId] ?? [];
    if (filters.state) rows = rows.filter((row) => row.status === filters.state);
    return page(rows.map(applicantWire), filters.cursor, Number(filters.take) || 20);
  });

  mock.onGet(new RegExp(`${ROOT}/volunteer/opportunities/[^/]+$`)).reply((config) => {
    const id = segment(config.url, 0);
    const found = opportunities.find((row) => row.opportunityId === id);
    return found
      ? ok(opportunityWire(found))
      : problem(404, 'opportunity.not_found', 'No such opportunity.');
  });

  mock.onPost(new RegExp(`${ROOT}/volunteer/opportunities/[^/]+/applications$`)).reply((config) =>
    idempotent(config, () => {
      const opportunityId = segment(config.url, 1);
      const found = opportunities.find((row) => row.opportunityId === opportunityId);
      if (!found) return problem(404, 'opportunity.not_found', 'No such opportunity.');
      if (!found.canApply) {
        return problem(
          409,
          'opportunity.cannot_apply',
          found.cannotApplyReason ?? 'You cannot apply to this opportunity.'
        );
      }

      const request = body<{ answers?: Record<string, string> }>(config);
      // A full opportunity **waitlists** rather than refusing — the kinder of
      // the two correct answers, and the server's.
      const application: VolunteerApplication = {
        applicationId: newId('app'),
        opportunityId,
        opportunityTitle: found.title,
        organizationName: found.organizationName,
        status: found.isFull ? 'Waitlisted' : 'Pending',
        answers: request.answers ?? {},
        submittedAt: nowIso(),
        decidedAt: null,
        decisionReason: null,
        waitlistPosition: found.isFull ? 1 : null,
        assignment: null,
      };
      applications = [application, ...applications];
      opportunities = opportunities.map((row) =>
        row.opportunityId === opportunityId
          ? {
              ...row,
              myApplicationStatus: application.status,
              myApplicationId: application.applicationId,
              canApply: false,
              cannotApplyReason: 'You have already applied.',
            }
          : row
      );
      return created(applicationWire(application));
    })
  );

  mock.onPost(new RegExp(`${ROOT}/volunteer/opportunities$`)).reply((config) =>
    idempotent(config, () => {
      const request = body<{
        organizationId?: string;
        title?: string;
        description?: string;
        cause?: string;
        cityName?: string;
        areaName?: string;
        addressLine?: string;
        publish?: boolean;
      }>(config);

      if (!MOCK_CAPABILITIES[request.organizationId ?? '']?.canManageVolunteers) {
        return problem(403, 'organization.role_required', 'You cannot run volunteering here.');
      }

      const opportunity: VolunteerOpportunity = {
        opportunityId: newId('opp'),
        title: request.title ?? '',
        description: request.description ?? '',
        coverImage: null,
        cause: request.cause ?? 'Other',
        status: request.publish ? 'Published' : 'Draft',
        organizationId: request.organizationId ?? null,
        organizationName: '',
        organizationLogo: null,
        isVerified: false,
        location: {
          cityName: request.cityName ?? '',
          areaName: request.areaName ?? '',
          addressLine: request.addressLine ?? '',
        },
        startDate: null,
        endDate: null,
        shifts: [],
        requiredSkills: [],
        requirements: [],
        minimumAge: null,
        capacity: null,
        filledCount: 0,
        isFull: false,
        applicationDeadline: null,
        myApplicationStatus: 'NotApplied',
        myApplicationId: null,
        canApply: false,
        cannotApplyReason: 'You organise this opportunity.',
        canManage: true,
        createdAt: nowIso(),
      };
      opportunities = [opportunity, ...opportunities];
      return created(opportunityWire(opportunity));
    })
  );

  mock.onPut(new RegExp(`${ROOT}/volunteer/opportunities/[^/]+$`)).reply((config) => {
    const id = segment(config.url, 0);
    const found = opportunities.find((row) => row.opportunityId === id);
    if (!found) return problem(404, 'opportunity.not_found', 'No such opportunity.');
    if (!found.canManage) {
      return problem(403, 'opportunity.role_required', 'You cannot manage this opportunity.');
    }
    const request = body<{ title?: string; description?: string; cause?: string }>(config);
    const updated: VolunteerOpportunity = {
      ...found,
      title: request.title ?? found.title,
      description: request.description ?? found.description,
      cause: request.cause ?? found.cause,
    };
    opportunities = opportunities.map((row) => (row.opportunityId === id ? updated : row));
    return ok(opportunityWire(updated));
  });

  mock
    .onPost(new RegExp(`${ROOT}/volunteer/opportunities/[^/]+/(publish|close|complete|cancel)$`))
    .reply((config) => {
      const action = segment(config.url, 0);
      const id = segment(config.url, 1);
      const found = opportunities.find((row) => row.opportunityId === id);
      if (!found) return problem(404, 'opportunity.not_found', 'No such opportunity.');
      if (!found.canManage) {
        return problem(403, 'opportunity.role_required', 'You cannot manage this opportunity.');
      }

      const next =
        action === 'publish'
          ? 'Published'
          : action === 'close'
            ? 'Closed'
            : action === 'complete'
              ? 'Completed'
              : 'Cancelled';

      // Terminal states are terminal. The state machine refuses; it does not
      // quietly re-enter.
      if (found.status === 'Completed' || found.status === 'Cancelled') {
        return problem(409, 'opportunity.terminal', 'This opportunity is already finished.');
      }

      const updated: VolunteerOpportunity = {
        ...found,
        status: next as VolunteerOpportunity['status'],
      };
      opportunities = opportunities.map((row) => (row.opportunityId === id ? updated : row));
      return ok(opportunityWire(updated));
    });

  mock.onPost(new RegExp(`${ROOT}/volunteer/applications/[^/]+/withdraw$`)).reply((config) => {
    const id = segment(config.url, 1);
    const found = applications.find((row) => row.applicationId === id);
    if (!found) return problem(404, 'application.not_found', 'No such application.');
    const updated: VolunteerApplication = { ...found, status: 'Withdrawn', decidedAt: nowIso() };
    applications = applications.map((row) => (row.applicationId === id ? updated : row));
    return ok(applicationWire(updated));
  });

  mock.onPost(new RegExp(`${ROOT}/volunteer/applications/[^/]+/decision$`)).reply((config) => {
    const id = segment(config.url, 1);
    const request = body<{ decision?: string; reason?: string }>(config);

    for (const [opportunityId, rows] of Object.entries(applicants)) {
      const found = rows.find((row) => row.applicationId === id);
      if (!found) continue;

      const opportunity = opportunities.find((row) => row.opportunityId === opportunityId);
      if (!opportunity?.canManage) {
        return problem(403, 'opportunity.role_required', 'You cannot decide applications here.');
      }

      const next =
        request.decision === 'approve'
          ? 'Approved'
          : request.decision === 'reject'
            ? 'Rejected'
            : 'Waitlisted';
      const updated: VolunteerApplicant = {
        ...found,
        status: next as VolunteerApplicant['status'],
      };
      applicants[opportunityId] = rows.map((row) => (row.applicationId === id ? updated : row));
      return ok(applicantWire(updated));
    }

    return problem(404, 'application.not_found', 'No such application.');
  });

  mock.onPost(new RegExp(`${ROOT}/volunteer/assignments$`)).reply((config) => {
    const request = body<{ applicationId?: string; shiftId?: string }>(config);

    const applicant = Object.values(applicants)
      .flat()
      .find((row) => row.applicationId === request.applicationId);

    // 409 for an unapproved volunteer. The refusal is the control; the client
    // does not pre-check it.
    if (!applicant || applicant.status !== 'Approved') {
      return problem(409, 'application.not_approved', 'This volunteer has not been approved.');
    }

    const assignment: VolunteerAssignment = {
      assignmentId: newId('asg'),
      applicationId: request.applicationId ?? '',
      opportunityId: '',
      opportunityTitle: '',
      shiftId: request.shiftId ?? null,
      shiftLabel: null,
      date: nowIso().slice(0, 10),
      startTime: '09:00',
      endTime: '12:00',
      location: { cityName: '', areaName: '', addressLine: '' },
      status: 'Assigned',
      checkedInAt: null,
      checkedOutAt: null,
      confirmedHours: null,
    };
    assignments = [assignment, ...assignments];
    return created(assignmentWire(assignment));
  });

  mock.onPost(new RegExp(`${ROOT}/volunteer/assignments/[^/]+/hours$`)).reply((config) => {
    const id = segment(config.url, 1);
    const request = body<{ hours?: number }>(config);
    const found = assignments.find((row) => row.assignmentId === id);
    if (!found) return problem(404, 'assignment.not_found', 'No such assignment.');

    const updated: VolunteerAssignment = {
      ...found,
      status: 'Completed',
      confirmedHours: request.hours ?? 0,
    };
    assignments = assignments.map((row) => (row.assignmentId === id ? updated : row));
    return ok(assignmentWire(updated));
  });

  mock
    .onPost(new RegExp(`${ROOT}/volunteer/assignments/[^/]+/(check-in|check-out)$`))
    .reply((config) => {
      const direction = segment(config.url, 0);
      const id = segment(config.url, 1);
      const found = assignments.find((row) => row.assignmentId === id);
      if (!found) return problem(404, 'assignment.not_found', 'No such assignment.');

      // A check records the moment and proves nothing on its own — the hours
      // are still the organizer's to confirm.
      const updated: VolunteerAssignment =
        direction === 'check-in'
          ? { ...found, status: 'CheckedIn', checkedInAt: nowIso() }
          : { ...found, checkedOutAt: nowIso() };
      assignments = assignments.map((row) => (row.assignmentId === id ? updated : row));
      return ok(assignmentWire(updated));
    });

  // ══ POLLS ══════════════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/polls$`)).reply((config) => {
    const filters = query(config);
    let rows = polls;
    if (filters.organizationId) {
      rows = rows.filter((row) => row.organizationId === filters.organizationId);
    }
    if (filters.audience) rows = rows.filter((row) => row.audience === filters.audience);
    if (filters.state) rows = rows.filter((row) => row.status === filters.state);
    if (filters.query) {
      const needle = filters.query.toLowerCase();
      rows = rows.filter((row) => row.question.toLowerCase().includes(needle));
    }
    return page(rows.map(pollWire), filters.cursor, Number(filters.take) || 20);
  });

  mock.onGet(new RegExp(`${ROOT}/polls/[^/]+/results$`)).reply((config) => {
    const id = segment(config.url, 1);
    const found = polls.find((row) => row.pollId === id);
    return found ? ok(pollResultWire(found)) : problem(404, 'poll.not_found', 'No such poll.');
  });

  mock.onGet(new RegExp(`${ROOT}/polls/[^/]+$`)).reply((config) => {
    const id = segment(config.url, 0);
    const found = polls.find((row) => row.pollId === id);
    return found ? ok(pollWire(found)) : problem(404, 'poll.not_found', 'No such poll.');
  });

  mock.onPost(new RegExp(`${ROOT}/polls/[^/]+/responses$`)).reply((config) =>
    idempotent(config, () => {
      const id = segment(config.url, 1);
      const request = body<{ selectedOptionIds?: string[]; openResponse?: string }>(config);
      const found = polls.find((row) => row.pollId === id);
      if (!found) return problem(404, 'poll.not_found', 'No such poll.');

      if (!found.canVote) {
        return problem(409, 'poll.cannot_vote', found.cannotVoteReason ?? 'You cannot vote here.');
      }
      if (found.hasVoted && !found.allowsChange) {
        return problem(409, 'poll.already_voted', 'You have already answered this poll.');
      }
      if (
        found.votingType === 'MultipleChoice' &&
        found.maxSelections != null &&
        (request.selectedOptionIds?.length ?? 0) > found.maxSelections
      ) {
        return problem(400, 'poll.too_many_selections', 'You chose more options than allowed.');
      }

      const updated: CommunityPoll = {
        ...found,
        hasVoted: true,
        canVote: found.allowsChange,
        cannotVoteReason: found.allowsChange ? null : 'You have already answered.',
        totalResponses: found.hasVoted ? found.totalResponses : found.totalResponses + 1,
        myResponse: found.isAnonymous
          ? null
          : {
              responseId: newId('resp'),
              pollId: id,
              selectedOptionIds: request.selectedOptionIds ?? [],
              openResponse: request.openResponse ?? null,
              respondedAt: nowIso(),
            },
      };
      polls = polls.map((row) => (row.pollId === id ? updated : row));

      // Answers with the **result**, not the vote — so the confirmation screen
      // renders what the server counted rather than what the device sent.
      return ok(pollResultWire(updated));
    })
  );

  mock.onPost(new RegExp(`${ROOT}/polls/[^/]+/(publish|close|cancel|publish-results)$`)).reply(
    (config) => {
      const action = segment(config.url, 0);
      const id = segment(config.url, 1);
      const found = polls.find((row) => row.pollId === id);
      if (!found) return problem(404, 'poll.not_found', 'No such poll.');
      if (!found.canManage) {
        return problem(403, 'poll.role_required', 'You cannot manage this poll.');
      }

      const next =
        action === 'publish'
          ? 'Open'
          : action === 'close'
            ? 'Closed'
            : action === 'cancel'
              ? 'Cancelled'
              : 'ResultsPublished';

      const updated: CommunityPoll = { ...found, status: next as CommunityPoll['status'] };
      polls = polls.map((row) => (row.pollId === id ? updated : row));
      return ok(pollWire(updated));
    }
  );

  mock.onPost(new RegExp(`${ROOT}/polls$`)).reply((config) =>
    idempotent(config, () => {
      const request = body<{
        question?: string;
        description?: string;
        votingType?: string;
        audience?: string;
        options?: { label: string; description?: string }[];
        organizationId?: string;
        isAnonymous?: boolean;
        allowsChange?: boolean;
        publish?: boolean;
      }>(config);

      if (
        request.organizationId &&
        !MOCK_CAPABILITIES[request.organizationId]?.canManagePolls
      ) {
        return problem(403, 'poll.role_required', 'You cannot run polls for this organisation.');
      }

      const poll: CommunityPoll = {
        pollId: newId('poll'),
        question: request.question ?? '',
        description: request.description ?? null,
        status: request.publish ? 'Open' : 'Draft',
        votingType: (request.votingType ?? 'SingleChoice') as CommunityPoll['votingType'],
        audience: (request.audience ?? 'Public') as CommunityPoll['audience'],
        options: (request.options ?? []).map((option, index) => ({
          optionId: newId('opt'),
          label: option.label,
          description: option.description ?? null,
          sortOrder: index,
        })),
        maxSelections: null,
        isAnonymous: request.isAnonymous ?? false,
        allowsChange: request.allowsChange ?? false,
        organizationId: request.organizationId ?? null,
        organizationName: null,
        createdBy: ME,
        opensAt: null,
        closesAt: null,
        totalResponses: 0,
        hasVoted: false,
        myResponse: null,
        canVote: Boolean(request.publish),
        cannotVoteReason: request.publish ? null : 'This poll is not open yet.',
        canManage: true,
        createdAt: nowIso(),
      };
      polls = [poll, ...polls];
      return created(pollWire(poll));
    })
  );

  // ══ ORGANIZATIONS ══════════════════════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/organizations/me$`)).reply(() =>
    ok(
      MOCK_MY_ORGANIZATIONS.map((row) => ({
        organizationId: row.organizationId,
        name: row.name,
        logoMediaId: null,
        role: row.role,
        membershipId: row.organizationId,
        isVerified: true,
        capabilities: capabilitiesWire(row.organizationId),
      }))
    )
  );

  mock.onGet(new RegExp(`${ROOT}/organizations/[^/]+/capabilities$`)).reply((config) =>
    ok(capabilitiesWire(segment(config.url, 1)))
  );

  mock.onGet(new RegExp(`${ROOT}/organizations/[^/]+/dashboard$`)).reply((config) => {
    const organizationId = segment(config.url, 1);
    const capabilities = capabilitiesWire(organizationId);
    if (capabilities.role === null) {
      return problem(403, 'organization.role_required', 'You hold no role in this organisation.');
    }

    const roll = orgMembers[organizationId] ?? [];
    return ok({
      organizationId,
      organizationName:
        MOCK_MY_ORGANIZATIONS.find((row) => row.organizationId === organizationId)?.name ?? '',
      logoMediaId: null,
      capabilities,
      // Six counts, and six only. Nothing about events, series or campaigns —
      // those aggregates belong to other modules and this route does not reach
      // across for them.
      counts: {
        pendingMemberApplications: roll.filter((row) => row.status === 'Pending').length,
        activeMembers: roll.filter((row) => row.status === 'Active').length,
        openOpportunities: opportunities.filter(
          (row) => row.organizationId === organizationId && row.status === 'Published'
        ).length,
        pendingVolunteerApplications: Object.values(applicants)
          .flat()
          .filter((row) => row.status === 'Pending').length,
        openPolls: polls.filter(
          (row) => row.organizationId === organizationId && row.status === 'Open'
        ).length,
        recentAnnouncements: announcements.filter((row) => row.scopeId === organizationId).length,
      },
      // Every figure above is read live, so this is the moment it was asked
      // for rather than a rollup timestamp.
      computedAt: nowIso(),
    });
  });

  mock
    .onGet(new RegExp(`${ROOT}/organizations/[^/]+/analytics/members$`))
    .reply((config) => {
      const organizationId = segment(config.url, 2);
      if (!capabilitiesWire(organizationId).canViewAnalytics) {
        return problem(403, 'organization.role_required', 'You cannot view analytics here.');
      }
      const roll = orgMembers[organizationId] ?? [];
      const byStatus: Record<string, number> = {};
      for (const row of roll) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

      return ok({
        organizationId,
        period: query(config).period ?? '30d',
        totalMembers: roll.length,
        activeMembers: roll.filter((row) => row.status === 'Active').length,
        pendingApplications: roll.filter((row) => row.status === 'Pending').length,
        lapsedMembers: roll.filter((row) => row.status === 'Expired').length,
        byStatus,
        joins: timeSeries(daysFor(query(config).period), 0),
        computedAt: nowIso(),
      });
    });

  mock.onGet(new RegExp(`${ROOT}/organizations/[^/]+/analytics$`)).reply((config) => {
    const organizationId = segment(config.url, 1);
    if (!capabilitiesWire(organizationId).canViewAnalytics) {
      return problem(403, 'organization.role_required', 'You cannot view analytics here.');
    }
    const period = query(config).period ?? '30d';
    const days = daysFor(period);

    // Three series, and three only. Attendance is B12's and giving is B15's,
    // and this route computes neither — so it sends neither.
    return ok({
      organizationId,
      period,
      memberGrowth: timeSeries(days, 40),
      volunteerHours: timeSeries(days, 5),
      pollParticipation: timeSeries(days, 12),
      computedAt: nowIso(),
    });
  });

  mock.onPost(new RegExp(`${ROOT}/organizations/[^/]+/members/[^/]+/role$`)).reply((config) => {
    const organizationId = segment(config.url, 3);
    if (!MOCK_CAPABILITIES[organizationId]?.canManageMembers) {
      return problem(403, 'organization.role_required', 'You cannot assign roles here.');
    }
    return ok(capabilitiesWire(organizationId));
  });

  // ══ ANNOUNCEMENTS, IMPACT, SEARCH ══════════════════════════════════════════

  mock.onGet(new RegExp(`${ROOT}/announcements$`)).reply((config) => {
    const filters = query(config);
    let rows = announcements;
    if (filters.scope) rows = rows.filter((row) => row.scope === filters.scope);
    if (filters.scopeId) rows = rows.filter((row) => row.scopeId === filters.scopeId);
    if (filters.query) {
      const needle = filters.query.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.title.toLowerCase().includes(needle) || row.body.toLowerCase().includes(needle)
      );
    }
    return page(rows.map(announcementWire), filters.cursor, Number(filters.take) || 20);
  });

  mock.onPost(new RegExp(`${ROOT}/announcements$`)).reply((config) =>
    idempotent(config, () => {
      const request = body<{
        scope?: string;
        scopeId?: string;
        title?: string;
        body?: string;
        isPinned?: boolean;
      }>(config);

      if (
        request.scope === 'Organization' &&
        !MOCK_CAPABILITIES[request.scopeId ?? '']?.canPublishAnnouncements
      ) {
        return problem(403, 'announcement.role_required', 'You cannot publish here.');
      }

      const announcement: CommunityAnnouncement = {
        announcementId: newId('ann'),
        scope: (request.scope ?? 'Community') as CommunityAnnouncement['scope'],
        scopeId: request.scopeId ?? null,
        scopeName: '',
        title: request.title ?? '',
        body: request.body ?? '',
        mediaUrls: [],
        authorName: ME,
        authorAvatarUrl: null,
        isPinned: request.isPinned ?? false,
        publishedAt: nowIso(),
        actionRoute: null,
      };
      announcements = [announcement, ...announcements];
      return created(announcementWire(announcement));
    })
  );

  mock.onGet(new RegExp(`${ROOT}/impact$`)).reply((config) => {
    const filters = query(config);
    const confirmed = assignments
      .filter((row) => row.confirmedHours != null)
      .reduce((sum, row) => sum + (row.confirmedHours ?? 0), 0);

    // Every metric carries its own definition and the module it came from —
    // "an undefined metric is worse than an absent one".
    return ok({
      scope: filters.scope ?? 'member',
      scopeId: filters.scopeId ?? null,
      scopeName: 'You',
      period: filters.period ?? '30d',
      metrics: [
        {
          key: 'volunteerHours',
          label: 'Volunteer hours',
          value: confirmed,
          definition: 'Hours an organiser confirmed after the work was done.',
          source: 'CommunityProgramme',
        },
        {
          key: 'memberships',
          label: 'Memberships held',
          value: memberships.filter((row) => row.status === 'Active').length,
          definition: 'Memberships currently active, across every organisation.',
          source: 'CommunityProgramme',
        },
        {
          key: 'pollsParticipated',
          label: 'Polls answered',
          value: polls.filter((row) => row.hasVoted).length,
          definition: 'Polls you have answered, whether or not results are public.',
          source: 'CommunityProgramme',
        },
      ],
      computedAt: nowIso(),
    });
  });

  mock.onGet(new RegExp(`${ROOT}/search$`)).reply((config) => {
    const filters = query(config);
    const needle = (filters.q ?? '').toLowerCase();

    // One ordered list. `relevance` is what ordered it, and the client
    // re-orders nothing.
    const rows = [
      ...programmes
        .filter((row) => !needle || row.organizationName.toLowerCase().includes(needle))
        .map((row, index) => ({
          entityType: 'membership',
          entityId: row.organizationId,
          title: row.organizationName,
          subtitle: row.summary,
          imageMediaId: null,
          locationLabel: row.location?.cityName ?? null,
          badge: row.isVerified ? 'Verified' : null,
          actionRoute: `/community-life/membership/${row.organizationId}`,
          relevance: 1 - index * 0.01,
        })),
      ...opportunities
        .filter((row) => !needle || row.title.toLowerCase().includes(needle))
        .map((row, index) => ({
          entityType: 'opportunity',
          entityId: row.opportunityId,
          title: row.title,
          subtitle: row.cause,
          imageMediaId: null,
          locationLabel: row.location.cityName,
          badge: null,
          actionRoute: `/community-life/volunteer/${row.opportunityId}`,
          relevance: 0.8 - index * 0.01,
        })),
      ...polls
        .filter((row) => !needle || row.question.toLowerCase().includes(needle))
        .map((row, index) => ({
          entityType: 'poll',
          entityId: row.pollId,
          title: row.question,
          subtitle: null,
          imageMediaId: null,
          locationLabel: null,
          badge: null,
          actionRoute: `/community-life/poll/${row.pollId}`,
          relevance: 0.6 - index * 0.01,
        })),
    ].sort((left, right) => right.relevance - left.relevance);

    return page(rows, undefined, Number(filters.take) || 20);
  });

  // ── Campaigns and giving — B15.1, at B18's prefix ─────────────────────────
  //
  // The campaign routes are mapped by B18 under `/api/v1/communities` and
  // dispatch B15's commands; the time series and the recurring donations stay
  // at `/api/v1/financial`, which is why two prefixes appear below. Every shape
  // is `B15_1GivingResponses.cs`, not the client's model — in particular:
  //
  //   * money carries `minorUnits` **and** `symbol` here, where B18's carries
  //     neither, so these use `givingMoney` and not `money`;
  //   * the page envelope is `GivingPageResponse<T>` — `{ items, nextCursor,
  //     hasMore }` with **no `totalCount`** — so `givingPage`, not `page`. A
  //     handler that sent a total would have let the client render a count no
  //     server will ever provide;
  //   * `percentage` is **null** where there is no target, never zero;
  //   * a supporter is anonymised at the source, and a *named* one arrives with
  //     `displayName: null` because B15 stores no donor name.

  /** `MoneyResponse` — five fields. The exact stored value, not a derivation. */
  function givingMoney(value: MoneyLike | null | undefined) {
    return value
      ? {
          amount: value.amount,
          currency: value.currency,
          minorUnits: Math.round(value.amount * 10 ** value.exponent),
          exponent: value.exponent,
          symbol: value.currency === 'GBP' ? '£' : null,
        }
      : null;
  }

  /** `GivingPageResponse<T>`. **No `totalCount`** — the contract has none. */
  function givingPage<T>(items: T[], cursor?: string, take = 20): MockReply {
    const start = cursor ? Number(cursor) : 0;
    const slice = items.slice(start, start + take);
    const next = start + take;
    return ok({
      items: slice,
      nextCursor: next < items.length ? String(next) : null,
      hasMore: next < items.length,
    });
  }

  /**
   * A campaign, as the server would compose it.
   *
   * **Every figure comes from the linked cause, never from the fixture's own
   * progress block.** A campaign that kept its own copy of "raised" would be a
   * second number for the same money, and the two would disagree the first time
   * a donation was refunded — which is exactly what `CampaignMapper` says, and
   * is why the fixture's placeholders are ignored here rather than echoed.
   */
  function campaignWire(campaign: FundraisingCampaign) {
    const cause = campaign.causeCode
      ? MOCK_CAUSES.find((row) => row.code === campaign.causeCode)
      : undefined;
    const target = campaign.progress.target.value;
    const raisedMinor = cause?.raised?.minorUnits ?? 0;
    const targetMinor = target?.minorUnits ?? null;

    return {
      campaignId: campaign.campaignId,
      title: campaign.title,
      summary: campaign.summary,
      story: campaign.story,
      // A B5 reference, never a URL — the fixture's URL is the client model's.
      coverImage: `media/campaigns/${campaign.campaignId}`,
      gallery: [],
      category: campaign.category,
      status: campaign.status,
      progress: {
        target: givingMoney(target),
        raised: givingMoney(
          target
            ? { amount: raisedMinor / 10 ** target.exponent, currency: target.currency, exponent: target.exponent }
            : { amount: 0, currency: 'GBP', exponent: 2 }
        ),
        // Null, not zero, where there is no target. Floored, so 99.6% does not
        // render as complete.
        percentage:
          targetMinor && targetMinor > 0
            ? Math.min(100, Math.floor((raisedMinor * 100) / targetMinor))
            : null,
        supporterCount: cause?.supporterCount ?? 0,
        deadline: campaign.progress.deadline ?? null,
        daysRemaining: campaign.progress.daysRemaining ?? null,
      },
      causeCode: campaign.causeCode ?? null,
      beneficiaryType: campaign.beneficiaryType,
      beneficiaryId: campaign.beneficiaryId ?? null,
      beneficiaryName: campaign.beneficiaryName,
      urgency: campaign.urgency,
      acceptedKinds: campaign.acceptedKinds,
      organizerId: campaign.organizerId,
      organizerName: campaign.organizerName,
      organizationId: campaign.organizationId ?? null,
      isVerified: cause?.isVerified ?? false,
      countryCode: campaign.countryCode ?? null,
      locationLabel: campaign.locationLabel ?? null,
      createdAt: campaign.createdAt,
      publishedAt: campaign.publishedAt ?? null,
      closedAt: campaign.closedAt ?? null,
      reviewNote: campaign.reviewNote ?? null,
      canManage: campaign.canManage,
      // Both halves of the rule, decided here rather than by the client: a
      // collecting state **and** a linked cause.
      canDonate:
        Boolean(campaign.causeCode) &&
        ['Published', 'Active', 'GoalReached'].includes(campaign.status),
      availableTransitions: campaign.canManage ? (CAMPAIGN_TRANSITIONS[campaign.status] ?? []) : [],
    };
  }

  mock.onGet(new RegExp(`${ROOT}/campaigns$`)).reply((config) => {
    const filters = query(config);
    const mineOnly = filters.mine === 'true';

    const list = campaigns.filter((row) => {
      // A draft or a rejected campaign is visible only to the person who wrote
      // it. Enforced here, so the client has no filter to forget.
      const isPrivate = row.status === 'Draft' || row.status === 'Rejected';
      if (isPrivate && !row.canManage) return false;
      if (mineOnly && !row.canManage) return false;
      if (filters.state && row.status !== filters.state) return false;
      if (filters.category && row.category !== filters.category) return false;
      if (filters.country && row.countryCode !== filters.country) return false;
      if (filters.organizationId && row.organizationId !== filters.organizationId) return false;
      return true;
    });

    return givingPage(list.map(campaignWire), filters.cursor, Number(filters.take) || 20);
  });

  mock.onGet(new RegExp(`${ROOT}/campaigns/[^/]+/updates$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    const filters = query(config);
    const rows = (campaignUpdates[campaignId] ?? []).map((update) => ({
      updateId: update.updateId,
      campaignId: update.campaignId,
      title: update.title,
      body: update.body,
      // Identifiers, not URLs.
      mediaReferences: update.mediaUrls.map((_, index) => `media/updates/${update.updateId}-${index}`),
      publishedAt: update.publishedAt,
      authorName: update.authorName,
      // A withdrawn update never reaches a supporter at all, so nothing here is
      // withdrawn — the filtering happens before the page is built, server-side.
      isWithdrawn: false,
    }));
    return givingPage(rows, filters.cursor, Number(filters.take) || 20);
  });

  mock.onPost(new RegExp(`${ROOT}/campaigns/[^/]+/updates$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    const campaign = campaigns.find((row) => row.campaignId === campaignId);
    if (!campaign) {
      return problem(404, 'campaign_not_found', 'No campaign with that identifier.');
    }
    if (!campaign.canManage) {
      return problem(403, 'campaign_forbidden', 'Only an organiser may publish an update.');
    }

    const key = idempotencyKey(config);
    if (key && committed.has(`update:${key}`)) {
      return ok(committed.get(`update:${key}`));
    }

    const draft = body<{ title?: string; body?: string; mediaReferences?: string[] }>(config);
    if (!draft.title || !draft.body) {
      return problem(400, 'validation_failed', 'An update needs a title and a body.');
    }

    const wire = {
      updateId: newId('cu'),
      campaignId,
      title: draft.title,
      body: draft.body,
      mediaReferences: draft.mediaReferences ?? [],
      publishedAt: nowIso(),
      authorName: campaign.organizerName,
      isWithdrawn: false,
    };

    campaignUpdates[campaignId] = [
      {
        updateId: wire.updateId,
        campaignId,
        title: wire.title,
        body: wire.body,
        mediaUrls: [],
        mediaReferences: wire.mediaReferences,
        publishedAt: wire.publishedAt,
        authorName: wire.authorName,
        isWithdrawn: false,
      },
      ...(campaignUpdates[campaignId] ?? []),
    ];

    if (key) committed.set(`update:${key}`, wire);
    return created(wire);
  });

  mock.onGet(new RegExp(`${ROOT}/campaigns/[^/]+/milestones$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    // A bare list, not a page. `CampaignContracts.cs:237`.
    return ok((campaignMilestones[campaignId] ?? []).map(milestoneWire));
  });

  mock.onPut(new RegExp(`${ROOT}/campaigns/[^/]+/milestones$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    const campaign = campaigns.find((row) => row.campaignId === campaignId);
    if (!campaign) {
      return problem(404, 'campaign_not_found', 'No campaign with that identifier.');
    }
    if (!campaign.canManage) {
      return problem(403, 'campaign_forbidden', 'Only an organiser may declare milestones.');
    }

    const draft = body<{
      milestones?: { milestoneId?: string; label?: string; targetAmount?: number }[];
    }>(config);
    const rows = draft.milestones ?? [];
    if (rows.length > 20) {
      return problem(400, 'validation_failed', 'Twenty milestones is already more than anybody will read.');
    }

    const cause = campaign.causeCode
      ? MOCK_CAUSES.find((row) => row.code === campaign.causeCode)
      : undefined;
    const raisedMinor = cause?.raised?.minorUnits ?? 0;
    const currency = campaign.progress.target.value?.currency ?? 'GBP';
    const exponent = campaign.progress.target.value?.exponent ?? 2;

    // Replaces the set and re-evaluates it. `isReached` is decided here from the
    // cause's own total and is never read off the request — a milestone declared
    // below a total already passed is reached the moment it is declared.
    campaignMilestones[campaignId] = rows.map((row) => {
      const targetMinor = Math.round((row.targetAmount ?? 0) * 10 ** exponent);
      const isReached = targetMinor > 0 && raisedMinor >= targetMinor;
      return {
        milestoneId: row.milestoneId ?? newId('ms'),
        label: row.label ?? '',
        target: {
          amount: row.targetAmount ?? 0,
          currency,
          minorUnits: targetMinor,
          exponent,
        },
        isReached,
        reachedAt: isReached ? nowIso() : null,
      };
    });

    return ok(campaignMilestones[campaignId].map(milestoneWire));
  });

  mock.onGet(new RegExp(`${ROOT}/campaigns/[^/]+/supporters$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    const campaign = campaigns.find((row) => row.campaignId === campaignId);
    if (!campaign) {
      return problem(404, 'campaign_not_found', 'No campaign with that identifier.');
    }
    // No cause yet means nobody has given. An empty page, not an error.
    if (!campaign.causeCode) return givingPage([], undefined, 20);

    const filters = query(config);
    const rows = (MOCK_SUPPORTERS[campaignId] ?? []).map((supporter) => ({
      userId: supporter.isAnonymous ? null : supporter.userId ?? null,
      // `"Anonymous"` for an anonymous gift; **null for a named one**, because
      // B15 stores no donor name and this platform has no id→name seam.
      displayName: supporter.isAnonymous ? 'Anonymous' : null,
      isAnonymous: supporter.isAnonymous,
      amount: givingMoney(supporter.amount ?? null),
      // Dropped for an anonymous gift: free text is one of the commonest ways
      // an identity travels.
      message: supporter.isAnonymous ? null : supporter.message ?? null,
      givenAt: supporter.givenAt,
    }));

    return givingPage(rows, filters.cursor, Number(filters.take) || 20);
  });

  mock.onGet(new RegExp(`${ROOT}/campaigns/[^/]+/fund-usage$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    const campaign = campaigns.find((row) => row.campaignId === campaignId);
    if (!campaign) {
      return problem(404, 'campaign_not_found', 'No campaign with that identifier.');
    }
    return ok(fundUsageWire(campaign, fundUsage[campaignId] ?? []));
  });

  mock.onPut(new RegExp(`${ROOT}/campaigns/[^/]+/fund-usage$`)).reply((config) => {
    const campaignId = segment(config.url, 1);
    const campaign = campaigns.find((row) => row.campaignId === campaignId);
    if (!campaign) {
      return problem(404, 'campaign_not_found', 'No campaign with that identifier.');
    }
    if (!campaign.canManage) {
      return problem(403, 'campaign_forbidden', 'Only an organiser may declare fund usage.');
    }

    const draft = body<{
      lines?: {
        id?: string;
        label?: string;
        allocated?: number;
        spent?: number | null;
        note?: string | null;
        withdrawalId?: string;
      }[];
    }>(config);
    const rows = draft.lines ?? [];
    if (rows.length > 50) {
      return problem(400, 'validation_failed', 'Fifty allocation lines is a spreadsheet, not a summary.');
    }

    const currency = campaign.progress.target.value?.currency ?? 'GBP';
    const exponent = campaign.progress.target.value?.exponent ?? 2;
    const toMoney = (amount: number) => ({
      amount,
      currency,
      minorUnits: Math.round(amount * 10 ** exponent),
      exponent,
    });

    fundUsage[campaignId] = rows.map((row) => ({
      id: row.id ?? newId('fu'),
      label: row.label ?? '',
      allocated: toMoney(row.allocated ?? 0),
      spent: row.spent === null || row.spent === undefined ? null : toMoney(row.spent),
      note: row.note ?? null,
      // Verification is the platform's, not the caller's: only a withdrawal the
      // caller actually owns backs a spend, and there are none in this fixture.
      // A handler that echoed `withdrawalId` back as proof would be inventing
      // exactly the assurance this field exists to withhold.
      isPlatformVerified: false,
    }));

    return ok(fundUsageWire(campaign, fundUsage[campaignId]));
  });

  mock
    .onPost(new RegExp(`${ROOT}/campaigns/[^/]+/(submit|publish|pause|resume|close|cancel)$`))
    .reply((config) => {
      const action = segment(config.url, 0);
      const campaignId = segment(config.url, 1);
      const campaign = campaigns.find((row) => row.campaignId === campaignId);

      if (!campaign) {
        return problem(404, 'campaign_not_found', 'No campaign with that identifier.');
      }
      if (!campaign.canManage) {
        return problem(403, 'campaign_forbidden', 'Only an organiser may move a campaign.');
      }

      const target = LIFECYCLE_TARGET[action];
      // The destination comes from the route. Whether it is legal comes from the
      // transition table, and an illegal move is a **409** — the client's own
      // table draws the buttons and is not the authority.
      if (!target || !(CAMPAIGN_TRANSITIONS[campaign.status] ?? []).includes(target)) {
        return problem(
          409,
          'campaign_transition_invalid',
          `A ${campaign.status} campaign cannot be ${action}ed.`
        );
      }

      campaign.status = target as FundraisingCampaign['status'];
      if (target === 'Published') {
        campaign.publishedAt = nowIso();
        // The cause is created by the backend at publication and not one moment
        // earlier. Before it, there is nowhere certified to collect.
        campaign.causeCode = campaign.causeCode ?? `campaign-${campaignId}`;
      }
      if (target === 'Closed' || target === 'Cancelled') campaign.closedAt = nowIso();

      return ok(campaignWire(campaign));
    });

  mock.onGet(new RegExp(`${ROOT}/campaigns/[^/]+$`)).reply((config) => {
    const campaignId = segment(config.url, 0);
    const campaign = campaigns.find((row) => row.campaignId === campaignId);
    if (!campaign) {
      return problem(404, 'campaign_not_found', 'No campaign with that identifier.');
    }
    if ((campaign.status === 'Draft' || campaign.status === 'Rejected') && !campaign.canManage) {
      // Absent and not-yours are answered identically, so a caller cannot
      // enumerate which drafts exist.
      return problem(404, 'campaign_not_found', 'No campaign with that identifier.');
    }
    return ok(campaignWire(campaign));
  });

  mock.onPost(new RegExp(`${ROOT}/campaigns$`)).reply((config) => {
    const key = idempotencyKey(config);
    if (key && committed.has(`campaign:${key}`)) {
      return ok(committed.get(`campaign:${key}`));
    }

    const draft = body<{
      title?: string;
      summary?: string;
      story?: string;
      category?: string;
      currency?: string;
      targetAmount?: number;
      deadline?: string | null;
      beneficiaryType?: string;
      beneficiaryId?: string;
      beneficiaryName?: string;
      organizationId?: string;
      countryCode?: string;
      acceptedKinds?: string[];
      acceptedTerms?: boolean;
    }>(config);

    if (!draft.title || !draft.summary || !draft.story || !draft.category || !draft.currency) {
      return problem(400, 'validation_failed', 'A campaign needs a title, a summary, a story, a category and a currency.');
    }
    // Refused here and not only in the form. Terms acceptance is not a
    // form-level check.
    if (draft.acceptedTerms !== true) {
      return problem(400, 'campaign_terms_required', 'The fundraising terms must be accepted.');
    }
    if (draft.targetAmount !== undefined && draft.targetAmount !== null && draft.targetAmount <= 0) {
      return problem(400, 'validation_failed', 'A target of nothing is not a target.');
    }

    const exponent = 2;
    const created_: FundraisingCampaign = {
      campaignId: newId('camp'),
      title: draft.title,
      summary: draft.summary,
      story: draft.story,
      coverImage: '',
      gallery: [],
      category: draft.category as FundraisingCampaign['category'],
      // A draft. No cause, so nowhere to collect and no donate control.
      status: 'Draft',
      progress: {
        target: backed(
          draft.targetAmount
            ? {
                amount: draft.targetAmount,
                currency: draft.currency,
                minorUnits: Math.round(draft.targetAmount * 10 ** exponent),
                exponent,
              }
            : null
        ),
        raised: backed({ amount: 0, currency: draft.currency, minorUnits: 0, exponent }),
        percentage: backed(draft.targetAmount ? 0 : null),
        supporterCount: backed(0),
        deadline: draft.deadline ?? null,
        daysRemaining: null,
      },
      causeCode: null,
      beneficiaryType: draft.beneficiaryType ?? 'Member',
      beneficiaryId: draft.beneficiaryId ?? null,
      beneficiaryName: draft.beneficiaryName ?? '',
      urgency: 'Moderate',
      acceptedKinds: draft.acceptedKinds ?? ['Monetary'],
      organizerId: ME,
      organizerName: 'You',
      organizationId: draft.organizationId ?? null,
      isVerified: false,
      countryCode: draft.countryCode ?? null,
      locationLabel: null,
      createdAt: nowIso(),
      publishedAt: null,
      closedAt: null,
      reviewNote: null,
      canManage: true,
      canDonate: false,
    };

    campaigns = [created_, ...campaigns];
    const wire = campaignWire(created_);
    if (key) committed.set(`campaign:${key}`, wire);
    return created(wire);
  });

  mock.onPut(new RegExp(`${ROOT}/campaigns/[^/]+$`)).reply((config) => {
    const campaignId = segment(config.url, 0);
    const campaign = campaigns.find((row) => row.campaignId === campaignId);
    if (!campaign) {
      return problem(404, 'campaign_not_found', 'No campaign with that identifier.');
    }
    if (!campaign.canManage) {
      return problem(403, 'campaign_forbidden', 'Only an organiser may edit a campaign.');
    }

    // Exactly the eleven fields `UpdateCampaignRequest` binds. Anything else in
    // the body is ignored here because it is ignored there — which is the whole
    // reason this handler destructures rather than spreading.
    const draft = body<{
      title?: string;
      summary?: string;
      story?: string;
      category?: string;
      targetAmount?: number | null;
      deadline?: string | null;
      urgency?: string;
      locationLabel?: string;
    }>(config);

    if (draft.title !== undefined) campaign.title = draft.title;
    if (draft.summary !== undefined) campaign.summary = draft.summary;
    if (draft.story !== undefined) campaign.story = draft.story;
    if (draft.category !== undefined) {
      campaign.category = draft.category as FundraisingCampaign['category'];
    }
    if (draft.deadline !== undefined) campaign.progress.deadline = draft.deadline;
    if (draft.urgency !== undefined) campaign.urgency = draft.urgency;
    if (draft.locationLabel !== undefined) campaign.locationLabel = draft.locationLabel;
    if (draft.targetAmount !== undefined) {
      const currency = campaign.progress.target.value?.currency ?? 'GBP';
      campaign.progress.target = backed(
        draft.targetAmount
          ? {
              amount: draft.targetAmount,
              currency,
              minorUnits: Math.round(draft.targetAmount * 100),
              exponent: 2,
            }
          : null
      );
    }

    return ok(campaignWire(campaign));
  });

  // ── B15's own prefix. The two giving-extension routes. ────────────────────

  mock
    .onGet(new RegExp(`${FINANCIAL_ROOT}/donations/causes/[^/]+/timeseries$`))
    .reply((config) => {
      const causeCode = segment(config.url, 1);
      const cause = MOCK_CAUSES.find((row) => row.code === causeCode);
      if (!cause) return problem(404, 'cause_not_found', 'No cause with that code.');

      const filters = query(config);
      const to = filters.to ? new Date(filters.to) : new Date();
      const from = filters.from
        ? new Date(filters.from)
        : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);

      const currency = cause.raised?.currency ?? 'GBP';
      const exponent = cause.raised?.exponent ?? 2;
      const points: unknown[] = [];

      // **Every day in the window, including the empty ones.** A series that
      // omitted them would let a chart draw a line from Monday to Friday and
      // call the middle of it Wednesday's giving.
      for (
        let day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
        day <= to;
        day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
      ) {
        const index = points.length;
        const givenMinor = index % 4 === 0 ? 0 : (index % 7) * 500;
        points.push({
          periodStart: day.toISOString(),
          amount: {
            amount: givenMinor / 10 ** exponent,
            currency,
            minorUnits: givenMinor,
            exponent,
            symbol: currency === 'GBP' ? '£' : null,
          },
          donationCount: givenMinor === 0 ? 0 : 1,
        });
      }

      const totalMinor = cause.raised?.minorUnits ?? 0;

      return ok({
        causeCode: cause.code,
        currency,
        from: from.toISOString(),
        to: to.toISOString(),
        // Stated rather than assumed. Eleven time zones have no shared midnight.
        timeZone: 'UTC',
        granularity: 'Day',
        points,
        total: {
          amount: totalMinor / 10 ** exponent,
          currency,
          minorUnits: totalMinor,
          exponent,
          symbol: currency === 'GBP' ? '£' : null,
        },
        // Never netted off the total.
        refunded: {
          amount: 0,
          currency,
          minorUnits: 0,
          exponent,
          symbol: currency === 'GBP' ? '£' : null,
        },
        donationCount: cause.supporterCount ?? 0,
        refundedCount: 0,
        failedCount: 0,
        supporterCount: cause.supporterCount ?? 0,
      });
    });

  mock.onGet(new RegExp(`${FINANCIAL_ROOT}/donations/recurring/me$`)).reply(() =>
    // A bare list, not a page — and every state, cancelled ones included.
    ok(recurringDonations.map((row) => ({ ...row })))
  );

  mock
    .onPost(new RegExp(`${FINANCIAL_ROOT}/donations/recurring/[^/]+/cancel$`))
    .reply((config) => {
      const id = segment(config.url, 1);
      const schedule = recurringDonations.find((row) => row.recurringDonationId === id);

      // Absent and somebody else's answer identically, so a caller cannot
      // enumerate which schedule identifiers exist.
      if (!schedule) {
        return problem(
          404,
          'recurring_donation_not_found',
          'No recurring donation of yours with that identifier.'
        );
      }

      // Idempotent. A cancel tapped twice is one instruction, and answering the
      // second with a 409 would tell somebody their cancellation had failed when
      // it had already worked.
      if (schedule.status !== 'Cancelled') {
        schedule.status = 'Cancelled';
        schedule.cancelledAt = nowIso();
        // No date nothing intends to keep.
        schedule.nextChargeAt = null;
      }

      return ok({ ...schedule });
    });

  return () => {
    programmes = MOCK_PROGRAMMES.map((entry) => ({ ...entry }));
    memberships = MOCK_MEMBERSHIPS.map((entry) => ({ ...entry }));
    opportunities = MOCK_OPPORTUNITIES.map((entry) => ({ ...entry }));
    applications = MOCK_VOLUNTEER_APPLICATIONS.map((entry) => ({ ...entry }));
    assignments = MOCK_ASSIGNMENTS.map((entry) => ({ ...entry }));
    polls = MOCK_POLLS.map((entry) => ({ ...entry }));
    announcements = MOCK_ANNOUNCEMENTS.map((entry) => ({ ...entry }));
    campaigns = MOCK_CAMPAIGNS_SEED.map((entry) => ({ ...entry }));
    recurringDonations = RECURRING_DONATION_SEED.map((entry) => ({ ...entry }));
    committed.clear();
  };
}
