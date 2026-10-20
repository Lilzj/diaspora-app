// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — API client for UNSUPPORTED Community Life capabilities
//
// ⚠ EVERY ROUTE IN THIS FILE IS SIMULATED. NONE EXISTS IN THE CERTIFIED
//   BACKEND. See `src/config/community-gaps.ts`. ⚠
//
// This is the **development arm** of §42's repository split. The backend arms
// are:
//
//   `community-life-api.ts`   real B12 events, organizations and calendar
//   `financial-api.ts`        real B15 wallets, payments, causes, donations,
//                             contributions and giving history
//   `notifications-api.ts`    real B13 notifications
//
// `hooks/community-life.ts` is the stable domain interface above all four, and
// the UI does not know — and must not be able to tell — which arm answered.
//
// Deliberately separate from every real API module, and deliberately behind
// `/community-gap/v0` rather than `/community-life` or `/financial`. Three
// consequences, all wanted:
//
//   * A reviewer reading a screen's imports can tell at a glance whether it
//     talks to a real backend.
//   * If one of these calls ever escapes a development build it 404s at the
//     gateway. It cannot collide with, shadow, or be mistaken for a certified
//     route, and — this is the one that matters most in this phase — **it
//     cannot move real money.**
//   * The eventual migration is mechanical: when a backend phase implements
//     memberships, the repository swaps this import for a real one and the
//     request shapes already match.
//
// Every function refuses to run when community gap features are disabled, so
// the guarantee does not depend on a screen remembering to check.
//
// ── What is NOT in this file, and why ────────────────────────────────────────
//
// No donation is created here. No payment intent is created here. No wallet is
// read here. Every one of those goes to `financial-api.ts` and lands on a real
// B15 route, because §38 says there is no second payment system and §45 says
// the backend is authoritative for financial state. The closest this file comes
// to money is `attachMembershipPayment`, which takes a **real** B15
// `paymentIntentId` that has already settled and records the community-side
// binding B15 has no concept of — that binding, and only that binding, is
// COMMUNITY-LIFE-GAP-003.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { fetchMyRsvps, setEventRsvp, withdrawEventRsvp } from './community-life-api';
import type { RsvpRecord } from '@/types/community-life';
import { FinancialError, toFinancialError } from './financial-errors';
import {
  COMMUNITY_GAPS,
  COMMUNITY_GAP_PREFIX,
  areCommunityGapsEnabled,
} from '@/config/community-gaps';
import type { PlatformEnvelope } from '@/types/financial';
import type {
  AnalyticsPeriod,
  CampaignDonation,
  CampaignMilestone,
  CampaignSupporter,
  CampaignUpdate,
  CommunityAnnouncement,
  CommunityImpact,
  CommunityMembership,
  CommunityPage,
  CommunityPoll,
  CommunityRecommendation,
  CommunitySearchParams,
  CommunitySearchResult,
  CreateCampaignRequest,
  CreateEventSeriesRequest,
  CreatePollRequest,
  CreateVolunteerOpportunityRequest,
  EventAttendee,
  EventOccurrence,
  EventRegistration,
  EventSeries,
  FundUsageLine,
  FundraisingCampaign,
  MembershipDiscoveryParams,
  MembershipProgramme,
  NeighborhoodActivity,
  NeighborhoodEvent,
  OrganizationAnalytics,
  OrganizationCapabilities,
  OrganizationDashboard,
  OrganizationMember,
  PollResult,
  SeriesEditScope,
  SubmitMembershipApplicationRequest,
  SubmitPollResponseRequest,
  SubmitVolunteerApplicationRequest,
  VolunteerApplicant,
  VolunteerApplication,
  VolunteerAssignment,
  VolunteerHoursSummary,
  VolunteerOpportunity,
} from '@/types/community-advanced';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
//
// Namespaced under `community-gap` so a cache dump is unambiguous about which
// entries came from a simulation. Never collides with `communityLifeKeys`,
// `financialKeys`, `monetizationGapKeys` or `creatorGapKeys`.
// ─────────────────────────────────────────────────────────────────────────────

export const communityGapKeys = {
  all: ['community-gap'] as const,

  hub: (countryCode?: string, cityName?: string) =>
    ['community-gap', 'hub', countryCode ?? 'any', cityName ?? 'any'] as const,

  // Membership
  programme: (organizationId: string) => ['community-gap', 'membership', 'programme', organizationId] as const,
  membershipDiscovery: (fingerprint: string) =>
    ['community-gap', 'membership', 'discover', fingerprint] as const,
  myMemberships: () => ['community-gap', 'membership', 'me'] as const,
  membership: (id: string) => ['community-gap', 'membership', id] as const,
  organizationMembers: (organizationId: string, state?: string) =>
    ['community-gap', 'membership', 'org', organizationId, state ?? 'all'] as const,

  // Series and occurrences
  seriesList: (fingerprint: string) => ['community-gap', 'series', 'list', fingerprint] as const,
  series: (id: string) => ['community-gap', 'series', id] as const,
  occurrences: (seriesId: string, from?: string, to?: string) =>
    ['community-gap', 'series', seriesId, 'occurrences', from ?? 'any', to ?? 'any'] as const,
  occurrence: (id: string) => ['community-gap', 'occurrences', id] as const,
  myRegistrations: () => ['community-gap', 'registrations', 'me'] as const,
  attendees: (occurrenceId: string) => ['community-gap', 'occurrences', occurrenceId, 'attendees'] as const,

  // Fundraising
  campaigns: (fingerprint: string) => ['community-gap', 'campaigns', 'list', fingerprint] as const,
  campaign: (id: string) => ['community-gap', 'campaigns', id] as const,
  campaignUpdates: (id: string) => ['community-gap', 'campaigns', id, 'updates'] as const,
  campaignMilestones: (id: string) => ['community-gap', 'campaigns', id, 'milestones'] as const,
  campaignSupporters: (id: string) => ['community-gap', 'campaigns', id, 'supporters'] as const,
  campaignFundUsage: (id: string) => ['community-gap', 'campaigns', id, 'fund-usage'] as const,
  myCampaigns: (organizationId?: string) =>
    ['community-gap', 'campaigns', 'me', organizationId ?? 'all'] as const,
  campaignDonations: (id: string) => ['community-gap', 'campaigns', id, 'donations'] as const,

  // Volunteering
  opportunities: (fingerprint: string) => ['community-gap', 'volunteer', 'list', fingerprint] as const,
  opportunity: (id: string) => ['community-gap', 'volunteer', id] as const,
  myApplications: () => ['community-gap', 'volunteer', 'applications', 'me'] as const,
  application: (id: string) => ['community-gap', 'volunteer', 'applications', id] as const,
  applicants: (opportunityId: string, state?: string) =>
    ['community-gap', 'volunteer', opportunityId, 'applicants', state ?? 'all'] as const,
  myAssignments: () => ['community-gap', 'volunteer', 'assignments', 'me'] as const,
  volunteerHours: () => ['community-gap', 'volunteer', 'hours', 'me'] as const,

  // Polls
  polls: (fingerprint: string) => ['community-gap', 'polls', 'list', fingerprint] as const,
  poll: (id: string) => ['community-gap', 'polls', id] as const,
  pollResult: (id: string) => ['community-gap', 'polls', id, 'result'] as const,

  // Organizations
  myOrganizations: () => ['community-gap', 'organizations', 'me'] as const,
  capabilities: (organizationId: string) =>
    ['community-gap', 'organizations', organizationId, 'capabilities'] as const,
  dashboard: (organizationId: string) =>
    ['community-gap', 'organizations', organizationId, 'dashboard'] as const,
  orgAnalytics: (organizationId: string, period: string) =>
    ['community-gap', 'organizations', organizationId, 'analytics', period] as const,

  // Neighbourhood, announcements, impact
  neighborhoodEvents: (neighborhoodId: string) =>
    ['community-gap', 'neighborhood', neighborhoodId, 'events'] as const,
  neighborhoodActivity: (neighborhoodId: string) =>
    ['community-gap', 'neighborhood', neighborhoodId, 'activity'] as const,
  announcements: (scope: string, scopeId?: string) =>
    ['community-gap', 'announcements', scope, scopeId ?? 'all'] as const,
  impact: (scope: string, scopeId: string, period: string) =>
    ['community-gap', 'impact', scope, scopeId, period] as const,

  // Cross-cutting
  recommendations: (surface: string) => ['community-gap', 'recommendations', surface] as const,
  search: (fingerprint: string) => ['community-gap', 'search', fingerprint] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Transport
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The refusal a gap route produces in a build where gap features are off.
 *
 * A `FinancialError` rather than a thrown string, so the same components render
 * it as they render every other platform failure — a member on a production
 * build sees a coherent "not available yet" rather than a crash. Reusing the
 * financial error type across domains is deliberate: there is one error surface
 * in this app, and a second one would drift.
 */
function unavailable(gapKey: string): FinancialError {
  const gap = COMMUNITY_GAPS[gapKey];
  return new FinancialError({
    kind: 'unavailable',
    code: `frontend.community-gap.${gapKey}`,
    message: `${gap?.title ?? 'This'} is not available on Diaspora yet.`,
    hint: 'The platform does not support it yet. We will let you know when it arrives.',
    isRetryable: false,
    isTerminal: true,
    isIndeterminate: false,
  });
}

function assertEnabled(gapKey: string): void {
  if (!areCommunityGapsEnabled()) throw unavailable(gapKey);
}

async function read<T>(
  gapKey: string,
  path: string,
  params?: Record<string, unknown> | object
): Promise<T> {
  assertEnabled(gapKey);
  try {
    const response = await apiClient.get<PlatformEnvelope<T>>(
      `${COMMUNITY_GAP_PREFIX}${path}`,
      { params }
    );
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Every write is classified `mutating`, exactly as the real financial client
 * does, so a transport failure on a simulated membership application becomes an
 * *indeterminate* outcome rather than a failed one.
 *
 * The simulation reproduces the real failure semantics on purpose: a flow
 * tested against forgiving mocks is a flow that breaks the first time a real
 * gateway is slow, and "did my application send?" is precisely the question a
 * member must never be left guessing at.
 */
async function write<T>(
  gapKey: string,
  method: 'post' | 'put' | 'delete',
  path: string,
  body?: unknown,
  params?: Record<string, unknown> | object
): Promise<T> {
  assertEnabled(gapKey);
  try {
    const url = `${COMMUNITY_GAP_PREFIX}${path}`;
    const response =
      method === 'delete'
        ? await apiClient.delete<PlatformEnvelope<T>>(url, { params })
        : method === 'put'
          ? await apiClient.put<PlatformEnvelope<T>>(url, body, { params })
          : await apiClient.post<PlatformEnvelope<T>>(url, body, { params });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HUB — §5
// ═════════════════════════════════════════════════════════════════════════════

// `fetchCommunityLifeSummary` (`/hub/summary`) was removed on 20 Oct 2026. The
// aggregate was never served; the hub is composed from the real reads by
// `useCommunityLifeSummary` and `lib/community-life-hub.ts`.

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP — COMMUNITY-LIFE-GAP-001/002/003
// ═════════════════════════════════════════════════════════════════════════════

export function fetchMembershipProgramme(organizationId: string): Promise<MembershipProgramme> {
  return read<MembershipProgramme>(
    'membershipCatalogue',
    `/communities/${organizationId}/membership`
  );
}

export function discoverMemberships(
  params: MembershipDiscoveryParams
): Promise<CommunityPage<MembershipProgramme>> {
  return read<CommunityPage<MembershipProgramme>>(
    'membershipCatalogue',
    '/communities/memberships/discover',
    params
  );
}

export function fetchMyMemberships(): Promise<CommunityMembership[]> {
  return read<CommunityMembership[]>('membershipLifecycle', '/communities/memberships/me');
}

export function fetchMembership(membershipId: string): Promise<CommunityMembership> {
  return read<CommunityMembership>('membershipLifecycle', `/communities/memberships/${membershipId}`);
}

/**
 * Submits an application.
 *
 * The idempotency key is sent even though the simulation could not double-book
 * anything harmful, because §52 requires the *shape* to be right now: the day
 * this route becomes real, a retried submission must not create a second
 * application, and the client half of that contract is already in place.
 */
export function submitMembershipApplication(
  request: SubmitMembershipApplicationRequest
): Promise<CommunityMembership> {
  return write<CommunityMembership>(
    'membershipLifecycle',
    'post',
    `/communities/${request.organizationId}/memberships/applications`,
    request
  );
}

export function cancelMembership(membershipId: string, reason?: string): Promise<CommunityMembership> {
  return write<CommunityMembership>(
    'membershipLifecycle',
    'post',
    `/communities/memberships/${membershipId}/cancel`,
    { reason }
  );
}

export function renewMembership(
  membershipId: string,
  idempotencyKey?: string
): Promise<CommunityMembership> {
  return write<CommunityMembership>(
    'membershipLifecycle',
    'post',
    `/communities/memberships/${membershipId}/renew`,
    { idempotencyKey }
  );
}

/**
 * Records that a settled B15 payment paid for this membership.
 *
 * **This is COMMUNITY-LIFE-GAP-003 and nothing else.** The money already moved,
 * through real B15 routes, before this is called. What is simulated is the
 * community-side record that says which membership the money was for — the
 * binding B15 cannot express because no `subjectType` for a community
 * membership exists.
 *
 * The caller must have read the payment's authoritative status from
 * `fetchPaymentIntent` first. §8: do not trust client-side payment success. The
 * repository enforces that ordering; this function only records the outcome.
 */
export function attachMembershipPayment(
  membershipId: string,
  paymentIntentId: string
): Promise<CommunityMembership> {
  return write<CommunityMembership>(
    'membershipPayment',
    'post',
    `/communities/memberships/${membershipId}/payments`,
    { paymentIntentId }
  );
}

// ── Organization-side membership administration ──────────────────────────────

export function fetchOrganizationMembers(
  organizationId: string,
  params: { state?: string; query?: string; cursor?: string; take?: number } = {}
): Promise<CommunityPage<OrganizationMember>> {
  return read<CommunityPage<OrganizationMember>>(
    'membershipLifecycle',
    `/communities/${organizationId}/memberships`,
    params
  );
}

export type MembershipDecision = 'approve' | 'reject' | 'waitlist' | 'suspend' | 'reinstate' | 'remove';

/**
 * An organization's decision about a member.
 *
 * Role-gated in the simulation exactly as it would be for real — the handler
 * refuses with a 403 when the caller's capability set does not permit it. §19:
 * the client hiding the button is a convenience; this refusal is the control.
 */
export function decideMembership(
  membershipId: string,
  decision: MembershipDecision,
  reason?: string
): Promise<OrganizationMember> {
  return write<OrganizationMember>(
    'membershipLifecycle',
    'post',
    `/communities/memberships/${membershipId}/decision`,
    { decision, reason }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// RECURRING EVENTS — COMMUNITY-LIFE-GAP-004/005
// ═════════════════════════════════════════════════════════════════════════════

export interface SeriesQueryParams {
  organizationId?: string;
  cityName?: string;
  category?: string;
  status?: string;
  cursor?: string;
  take?: number;
}

export function fetchSeriesList(params: SeriesQueryParams = {}): Promise<CommunityPage<EventSeries>> {
  return read<CommunityPage<EventSeries>>('eventSeries', '/community-life/events/series', params);
}

export function fetchSeries(seriesId: string): Promise<EventSeries> {
  return read<EventSeries>('eventSeries', `/community-life/events/series/${seriesId}`);
}

/**
 * The occurrences of a series in a window.
 *
 * Expanded **server-side** in the simulation, exactly as the proposed contract
 * requires. §10 forbids hard-coding recurrence semantics into the UI, and
 * expanding a rule on the device would additionally mean occurrence identifiers
 * that exist on one phone — which registrations and reminders could not refer
 * to.
 */
export function fetchOccurrences(
  seriesId: string,
  params: { from?: string; to?: string; cursor?: string; take?: number } = {}
): Promise<CommunityPage<EventOccurrence>> {
  return read<CommunityPage<EventOccurrence>>(
    'eventSeries',
    `/community-life/events/series/${seriesId}/occurrences`,
    params
  );
}

export function fetchOccurrence(occurrenceId: string): Promise<EventOccurrence> {
  return read<EventOccurrence>('eventSeries', `/community-life/events/occurrences/${occurrenceId}`);
}

export function createEventSeries(request: CreateEventSeriesRequest): Promise<EventSeries> {
  return write<EventSeries>('eventSeries', 'post', '/community-life/events/series', request);
}

/**
 * Edits a series.
 *
 * `scope` is mandatory and is sent to the server rather than resolved on the
 * client, because "change the time of the Tuesday meetup" means three different
 * things and only the person editing knows which. §11.
 */
export function updateEventSeries(
  seriesId: string,
  request: Partial<CreateEventSeriesRequest> & { scope: SeriesEditScope; occurrenceId?: string }
): Promise<EventSeries> {
  return write<EventSeries>('eventSeries', 'put', `/community-life/events/series/${seriesId}`, request);
}

export function cancelEventSeries(seriesId: string, reason?: string): Promise<EventSeries> {
  return write<EventSeries>('eventSeries', 'delete', `/community-life/events/series/${seriesId}`, undefined, {
    reason,
  });
}

/** Cancels or moves a single occurrence, producing an exception on the rule. */
export function updateOccurrence(
  occurrenceId: string,
  request: { status?: 'Cancelled' | 'Scheduled'; date?: string; time?: string; endTime?: string; reason?: string }
): Promise<EventOccurrence> {
  return write<EventOccurrence>(
    'eventSeries',
    'put',
    `/community-life/events/occurrences/${occurrenceId}`,
    request
  );
}

// ── Registration and attendance ──────────────────────────────────────────────

export interface RegisterRequest {
  /** One of the two. An occurrence registration names the occurrence. */
  eventId?: string;
  occurrenceId?: string;
  guestCount?: number;
  idempotencyKey?: string;
}

/**
 * Registers for an event or an occurrence.
 *
 * May legitimately answer `Waitlisted` rather than `Registered`, and may refuse
 * with a 409 when the caller already holds a place. Both are states §51
 * requires the UI to render, and both are the server's to decide — the client
 * never compares `registeredCount` to `capacity` to reach them.
 */
// ── Registrations are RSVPs (20 Oct 2026) ───────────────────────────────────
//
// These three called `/community-life/registrations*`, which only the
// simulation answered: in a release build "Register for this date" was drawn,
// enabled, and threw. The platform's registration is the event RSVP, and an
// occurrence id *is* an event id there, so they now use those routes. The
// registration id is the event id: one RSVP per member per event.

function toRegistration(rsvp: RsvpRecord, occurrenceId?: string | null): EventRegistration {
  const status: EventRegistration['status'] =
    rsvp.status === 'Waitlisted'
      ? 'Waitlisted'
      : rsvp.status === 'CheckedIn'
        ? 'CheckedIn'
        : rsvp.status === 'Attended'
          ? 'Attended'
          : rsvp.status === 'Cancelled'
            ? 'Cancelled'
            : rsvp.status === 'NoShow'
              ? 'NoShow'
              : 'Registered';
  return {
    registrationId: rsvp.eventId,
    eventId: rsvp.eventId,
    occurrenceId: occurrenceId ?? rsvp.eventId,
    status,
    registeredAt: rsvp.respondedAt,
    waitlistPosition: rsvp.waitlistPosition ?? null,
    guestCount: Math.max(0, (rsvp.partySize ?? 1) - 1),
  };
}

export async function registerForEvent(request: RegisterRequest): Promise<EventRegistration> {
  const eventId = request.occurrenceId ?? request.eventId;
  if (!eventId) throw new FinancialError({ code: 'community.event.missing', message: 'No event to register for.' } as never);
  const rsvp = await setEventRsvp(eventId, 'Going');
  return toRegistration(rsvp, request.occurrenceId);
}

export async function cancelRegistration(registrationId: string): Promise<EventRegistration> {
  const rsvp = await withdrawEventRsvp(registrationId);
  return toRegistration(rsvp);
}

export async function fetchMyRegistrations(): Promise<EventRegistration[]> {
  const page = await fetchMyRsvps();
  return page.items.map((rsvp) => toRegistration(rsvp));
}

export function fetchAttendees(
  params: { occurrenceId?: string; eventId?: string; cursor?: string; take?: number }
): Promise<CommunityPage<EventAttendee>> {
  return read<CommunityPage<EventAttendee>>(
    'eventRegistration',
    '/community-life/registrations/attendees',
    params
  );
}

export function checkInAttendee(
  registrationId: string
): Promise<EventAttendee> {
  return write<EventAttendee>(
    'eventRegistration',
    'post',
    `/community-life/registrations/${registrationId}/check-in`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FUNDRAISING — COMMUNITY-LIFE-GAP-006/007
// ═════════════════════════════════════════════════════════════════════════════

export interface CampaignQueryParams {
  query?: string;
  state?: string;
  category?: string;
  countryCode?: string;
  organizationId?: string;
  cursor?: string;
  take?: number;
}

export function fetchCampaigns(
  params: CampaignQueryParams = {}
): Promise<CommunityPage<FundraisingCampaign>> {
  return read<CommunityPage<FundraisingCampaign>>('fundraisingCampaign', '/communities/campaigns', params);
}

/**
 * One campaign.
 *
 * The `progress` block on the response carries `Sourced` values: where the
 * campaign has a `causeCode`, the simulation reads B15's real
 * `DonationCause.raised`, `.target` and `.supporterCount` and marks them
 * `backend`. §17 forbids inventing financial figures, and this is how a real
 * number and a simulated one stay distinguishable inside one object.
 */
export function fetchCampaign(campaignId: string): Promise<FundraisingCampaign> {
  return read<FundraisingCampaign>('fundraisingCampaign', `/communities/campaigns/${campaignId}`);
}

export function fetchMyCampaigns(organizationId?: string): Promise<FundraisingCampaign[]> {
  return read<FundraisingCampaign[]>('fundraisingCampaign', '/communities/campaigns/me', {
    organizationId,
  });
}

export function createCampaign(request: CreateCampaignRequest): Promise<FundraisingCampaign> {
  return write<FundraisingCampaign>('fundraisingCampaign', 'post', '/communities/campaigns', request);
}

export function updateCampaign(
  campaignId: string,
  request: Partial<CreateCampaignRequest>
): Promise<FundraisingCampaign> {
  return write<FundraisingCampaign>(
    'fundraisingCampaign',
    'put',
    `/communities/campaigns/${campaignId}`,
    request
  );
}

export type CampaignAction = 'submit' | 'publish' | 'pause' | 'resume' | 'close' | 'cancel';

/**
 * Moves a campaign through its lifecycle.
 *
 * The server decides whether the transition is legal and refuses with a 409 if
 * not. `canTransitionCampaign` in `community-state.ts` decides which buttons to
 * *draw* and is explicitly not the authority — a client and a server that
 * disagreed here would be a client that had gone stale, and the 409 is the
 * correct outcome.
 */
export function actOnCampaign(
  campaignId: string,
  action: CampaignAction,
  reason?: string
): Promise<FundraisingCampaign> {
  return write<FundraisingCampaign>(
    'fundraisingCampaign',
    'post',
    `/communities/campaigns/${campaignId}/${action}`,
    { reason }
  );
}

export function fetchCampaignUpdates(campaignId: string): Promise<CampaignUpdate[]> {
  return read<CampaignUpdate[]>('campaignTransparency', `/communities/campaigns/${campaignId}/updates`);
}

export function publishCampaignUpdate(
  campaignId: string,
  request: { title: string; body: string; mediaUrls?: string[] }
): Promise<CampaignUpdate> {
  return write<CampaignUpdate>(
    'campaignTransparency',
    'post',
    `/communities/campaigns/${campaignId}/updates`,
    request
  );
}

export function fetchCampaignMilestones(campaignId: string): Promise<CampaignMilestone[]> {
  return read<CampaignMilestone[]>(
    'campaignTransparency',
    `/communities/campaigns/${campaignId}/milestones`
  );
}

/**
 * The supporter list.
 *
 * Anonymity is applied by the source, never by this client: B15 stores no donor
 * identifier at all on an anonymous donation, so an anonymous supporter arrives
 * with `userId: null` and a placeholder name. A client-side filter would be the
 * wrong shape — it would mean the identity had already been sent to the device.
 */
export function fetchCampaignSupporters(
  campaignId: string,
  params: { cursor?: string; take?: number } = {}
): Promise<CommunityPage<CampaignSupporter>> {
  return read<CommunityPage<CampaignSupporter>>(
    'campaignTransparency',
    `/communities/campaigns/${campaignId}/supporters`,
    params
  );
}

export function fetchCampaignFundUsage(campaignId: string): Promise<FundUsageLine[]> {
  return read<FundUsageLine[]>(
    'campaignTransparency',
    `/communities/campaigns/${campaignId}/fund-usage`
  );
}

// The caller's donations to a campaign are served for real since 20 Oct 2026
// (`GET /communities/campaigns/{id}/donations/me`) and read by
// `fetchMyCampaignDonations` in `community-programme-api.ts`.

/**
 * Records that a real B15 donation belongs to a campaign.
 *
 * Same shape and same reasoning as `attachMembershipPayment`: the money moved
 * through `POST /financial/donations` against the campaign's real `causeCode`
 * before this is called, and what is simulated is only the campaign-side
 * record. When a campaign has no `causeCode` the donation control is not drawn
 * at all — this phase never collects money outside B15.
 */
export function attachCampaignDonation(
  campaignId: string,
  donationId: string
): Promise<CampaignDonation> {
  return write<CampaignDonation>(
    'fundraisingCampaign',
    'post',
    `/communities/campaigns/${campaignId}/donations`,
    { donationId }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// VOLUNTEERING — COMMUNITY-LIFE-GAP-009/010/011
// ═════════════════════════════════════════════════════════════════════════════

export interface OpportunityQueryParams {
  query?: string;
  cause?: string;
  organizationId?: string;
  countryCode?: string;
  cityName?: string;
  skill?: string;
  from?: string;
  to?: string;
  state?: string;
  cursor?: string;
  take?: number;
}

export function fetchOpportunities(
  params: OpportunityQueryParams = {}
): Promise<CommunityPage<VolunteerOpportunity>> {
  return read<CommunityPage<VolunteerOpportunity>>(
    'volunteerOpportunity',
    '/communities/volunteer/opportunities',
    params
  );
}

export function fetchOpportunity(opportunityId: string): Promise<VolunteerOpportunity> {
  return read<VolunteerOpportunity>(
    'volunteerOpportunity',
    `/communities/volunteer/opportunities/${opportunityId}`
  );
}

export function createOpportunity(
  request: CreateVolunteerOpportunityRequest
): Promise<VolunteerOpportunity> {
  return write<VolunteerOpportunity>(
    'volunteerOpportunity',
    'post',
    '/communities/volunteer/opportunities',
    request
  );
}

export function updateOpportunity(
  opportunityId: string,
  request: Partial<CreateVolunteerOpportunityRequest>
): Promise<VolunteerOpportunity> {
  return write<VolunteerOpportunity>(
    'volunteerOpportunity',
    'put',
    `/communities/volunteer/opportunities/${opportunityId}`,
    request
  );
}

export function actOnOpportunity(
  opportunityId: string,
  action: 'publish' | 'close' | 'cancel'
): Promise<VolunteerOpportunity> {
  return write<VolunteerOpportunity>(
    'volunteerOpportunity',
    'post',
    `/communities/volunteer/opportunities/${opportunityId}/${action}`
  );
}

export function submitVolunteerApplication(
  request: SubmitVolunteerApplicationRequest
): Promise<VolunteerApplication> {
  return write<VolunteerApplication>(
    'volunteerApplication',
    'post',
    `/communities/volunteer/opportunities/${request.opportunityId}/applications`,
    request
  );
}

export function fetchMyVolunteerApplications(): Promise<VolunteerApplication[]> {
  return read<VolunteerApplication[]>(
    'volunteerApplication',
    '/communities/volunteer/applications/me'
  );
}

export function withdrawVolunteerApplication(applicationId: string): Promise<VolunteerApplication> {
  return write<VolunteerApplication>(
    'volunteerApplication',
    'post',
    `/communities/volunteer/applications/${applicationId}/withdraw`
  );
}

export function fetchApplicants(
  opportunityId: string,
  params: { state?: string; cursor?: string; take?: number } = {}
): Promise<CommunityPage<VolunteerApplicant>> {
  return read<CommunityPage<VolunteerApplicant>>(
    'volunteerApplication',
    `/communities/volunteer/opportunities/${opportunityId}/applications`,
    params
  );
}

export type VolunteerDecision = 'approve' | 'reject' | 'waitlist';

export function decideVolunteerApplication(
  applicationId: string,
  decision: VolunteerDecision,
  reason?: string
): Promise<VolunteerApplicant> {
  return write<VolunteerApplicant>(
    'volunteerApplication',
    'post',
    `/communities/volunteer/applications/${applicationId}/decision`,
    { decision, reason }
  );
}

export function assignVolunteer(request: {
  applicationId: string;
  shiftId?: string;
}): Promise<VolunteerAssignment> {
  return write<VolunteerAssignment>(
    'volunteerApplication',
    'post',
    '/communities/volunteer/assignments',
    request
  );
}

export function fetchMyAssignments(): Promise<VolunteerAssignment[]> {
  return read<VolunteerAssignment[]>('volunteerApplication', '/communities/volunteer/assignments/me');
}

export function checkInVolunteer(
  assignmentId: string,
  direction: 'check-in' | 'check-out'
): Promise<VolunteerAssignment> {
  return write<VolunteerAssignment>(
    'volunteerHours',
    'post',
    `/communities/volunteer/assignments/${assignmentId}/${direction}`
  );
}

/**
 * Confirms hours for an assignment.
 *
 * Organizer-only. A self-reported hour and a confirmed hour are different
 * facts, and only the confirmed one appears on a volunteer's record — §34
 * forbids inventing an impact metric, and an unverifiable hour is exactly that.
 */
export function confirmVolunteerHours(
  assignmentId: string,
  hours: number
): Promise<VolunteerAssignment> {
  return write<VolunteerAssignment>(
    'volunteerHours',
    'post',
    `/communities/volunteer/assignments/${assignmentId}/hours`,
    { hours }
  );
}

export function fetchVolunteerHours(): Promise<VolunteerHoursSummary> {
  return read<VolunteerHoursSummary>('volunteerHours', '/communities/volunteer/hours/me');
}

// ═════════════════════════════════════════════════════════════════════════════
// POLLS — COMMUNITY-LIFE-GAP-012
// ═════════════════════════════════════════════════════════════════════════════

export interface PollQueryParams {
  audience?: string;
  organizationId?: string;
  state?: string;
  cursor?: string;
  take?: number;
}

export function fetchPolls(params: PollQueryParams = {}): Promise<CommunityPage<CommunityPoll>> {
  return read<CommunityPage<CommunityPoll>>('polls', '/communities/polls', params);
}

export function fetchPoll(pollId: string): Promise<CommunityPoll> {
  return read<CommunityPoll>('polls', `/communities/polls/${pollId}`);
}

/**
 * Casts a vote.
 *
 * Refused with a 409 when the caller has already voted and the poll disallows
 * changes — §51's "already voted" — and with a 403 when the caller is outside
 * the poll's audience. Both are the server's decisions in the simulation just
 * as they would be for real, because one-member-one-vote is unenforceable on a
 * device.
 *
 * The response carries the *result*, so the UI shows what the server counted
 * rather than what the device sent. §24.
 */
export function submitPollResponse(request: SubmitPollResponseRequest): Promise<PollResult> {
  return write<PollResult>(
    'polls',
    'post',
    `/communities/polls/${request.pollId}/responses`,
    request
  );
}

export function fetchPollResult(pollId: string): Promise<PollResult> {
  return read<PollResult>('polls', `/communities/polls/${pollId}/results`);
}

export function createPoll(request: CreatePollRequest): Promise<CommunityPoll> {
  return write<CommunityPoll>('polls', 'post', '/communities/polls', request);
}

export function actOnPoll(
  pollId: string,
  action: 'publish' | 'close' | 'cancel' | 'publish-results'
): Promise<CommunityPoll> {
  return write<CommunityPoll>('polls', 'post', `/communities/polls/${pollId}/${action}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ORGANIZATIONS — COMMUNITY-LIFE-GAP-013/014
// ═════════════════════════════════════════════════════════════════════════════

export function fetchMyOrganizations(): Promise<
  { organizationId: string; name: string; logo?: string | null; role: string }[]
> {
  return read<{ organizationId: string; name: string; logo?: string | null; role: string }[]>(
    'organizationRoles',
    '/communities/organizations/me'
  );
}

/**
 * What the caller may do in this organization.
 *
 * **Fetched, never computed.** §19. The screen renders the answer; it does not
 * derive one from a role name, and every gated route in this file refuses
 * independently so a tampered client gains nothing.
 */
export function fetchOrganizationCapabilities(
  organizationId: string
): Promise<OrganizationCapabilities> {
  return read<OrganizationCapabilities>(
    'organizationRoles',
    `/communities/organizations/${organizationId}/capabilities`
  );
}

export function assignOrganizationRole(
  organizationId: string,
  userId: string,
  role: string
): Promise<OrganizationMember> {
  return write<OrganizationMember>(
    'organizationRoles',
    'post',
    `/communities/organizations/${organizationId}/members/${userId}/role`,
    { role }
  );
}

/**
 * The dashboard's first paint. §47: one call, summaries and counts only.
 *
 * The counts are what let the dashboard decide *not* to render a section rather
 * than fetching it to discover it is empty — which is the difference between
 * one request and nine on an organization that only runs events.
 */
export function fetchOrganizationDashboard(organizationId: string): Promise<OrganizationDashboard> {
  return read<OrganizationDashboard>(
    'organizationRoles',
    `/communities/organizations/${organizationId}/dashboard`
  );
}

export function fetchOrganizationAnalytics(
  organizationId: string,
  period: AnalyticsPeriod
): Promise<OrganizationAnalytics> {
  return read<OrganizationAnalytics>(
    'organizationAnalytics',
    `/communities/organizations/${organizationId}/analytics`,
    { period }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// NEIGHBOURHOOD, ANNOUNCEMENTS, IMPACT — GAP-015/016/017
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Events bound to a named neighbourhood.
 *
 * The events inside are **real B12 events**; the binding is the simulated part,
 * and `NeighborhoodEvent.distanceSource` marks the distance as real because
 * B12's proximity query computed it. Nearby-by-coordinates discovery does not
 * come through here at all — it goes to `community-life-api.ts` and is real
 * end to end.
 */
export function fetchNeighborhoodEvents(
  neighborhoodId: string,
  params: { from?: string; to?: string; cursor?: string; take?: number } = {}
): Promise<CommunityPage<NeighborhoodEvent>> {
  return read<CommunityPage<NeighborhoodEvent>>(
    'neighborhoodEvents',
    `/neighborhoods/${neighborhoodId}/events`,
    params
  );
}

export function fetchNeighborhoodActivity(neighborhoodId: string): Promise<NeighborhoodActivity> {
  return read<NeighborhoodActivity>(
    'neighborhoodEvents',
    `/neighborhoods/${neighborhoodId}/activity`
  );
}

export function fetchAnnouncements(
  params: { scope?: string; scopeId?: string; cursor?: string; take?: number } = {}
): Promise<CommunityPage<CommunityAnnouncement>> {
  return read<CommunityPage<CommunityAnnouncement>>(
    'announcements',
    '/communities/announcements',
    params
  );
}

export function publishAnnouncement(request: {
  scope: string;
  scopeId?: string;
  title: string;
  body: string;
  mediaUrls?: string[];
  isPinned?: boolean;
}): Promise<CommunityAnnouncement> {
  return write<CommunityAnnouncement>('announcements', 'post', '/communities/announcements', request);
}

export function fetchCommunityImpact(params: {
  scope: 'member' | 'organization' | 'neighborhood' | 'country';
  scopeId?: string;
  period: AnalyticsPeriod;
}): Promise<CommunityImpact> {
  return read<CommunityImpact>('communityImpact', '/communities/impact', params);
}

// ═════════════════════════════════════════════════════════════════════════════
// RECOMMENDATIONS & SEARCH — GAP-018/021
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The community recommendation surface.
 *
 * §35 forbids a second recommendation engine, so the client sends a surface
 * name and renders the ordered list it is given. There is no scoring, no
 * re-ranking and no filtering of this list anywhere in Phase 12.
 */
export function fetchCommunityRecommendations(
  surface: string,
  take?: number
): Promise<CommunityRecommendation[]> {
  return read<CommunityRecommendation[]>('communityRecommendations', '/recommendations/community', {
    surface,
    take,
  });
}

/** Dismissal is a round trip, so it holds across devices. */
export function dismissCommunityRecommendation(recommendationId: string): Promise<void> {
  return write<void>(
    'communityRecommendations',
    'post',
    `/recommendations/${recommendationId}/dismiss`
  );
}

/**
 * The federated search over the five types that have no backend.
 *
 * Events and organizations are **not** searched here — they go to
 * `community-life-api.ts` and are real. The repository merges the two result
 * sets and labels each row with its source, which is what §40 asks for until a
 * single federated route exists.
 */
export function searchCommunity(
  params: CommunitySearchParams
): Promise<CommunityPage<CommunitySearchResult>> {
  return read<CommunityPage<CommunitySearchResult>>('communitySearch', '/communities/search', params);
}
