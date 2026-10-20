// ═════════════════════════════════════════════════════════════════════════════
// Diaspora Platform — Community Programme API client (Backend Phase B18)
// Remediation Wave C-04.
//
// ✅ EVERY ROUTE IN THIS FILE IS REAL. Each one was read out of
//    `Diaspora.Modules.CommunityProgramme` before it was written here, and the
//    file:line of each is quoted above the function that calls it.
//
// This is the backend arm that `community-gap-api.ts` was always the stand-in
// for. Phase 12 built thirteen screens' worth of membership programmes,
// volunteering, polls, fundraising transparency and organization dashboards
// against `/community-gap/v0`, on the register's declared paths, and B18 then
// shipped **those exact paths** under `/api/v1/communities` — deliberately, and
// its own metadata says so:
//
//   > `/communities` rather than `/community-programme` … every route the
//   > frontend's Phase 12 register proposes sits under `/api/v1/communities`,
//   > and the whole point of closing a gap is that the client's gap prefix
//   > changes to this one and nothing else moves.
//   — CommunityProgrammeModuleMetadata.cs:17-21
//
// ── `CommunityProgramme` is NOT `Community` ─────────────────────────────────
//
// Two modules, two prefixes, two domains, and the names are one letter apart:
//
//   `Diaspora.Modules.Community`          `/api/v1/community`   (singular)
//     The social graph. Posts, comments, reactions, feeds. Connected in Wave
//     D-2 and served by `community-social-api.ts`. Nothing here touches it.
//
//   `Diaspora.Modules.CommunityProgramme` `/api/v1/communities` (plural)
//     What a *body* offers the people who belong to it: membership programmes
//     and their fourteen states, volunteering, polls, announcements, campaign
//     transparency, organization capabilities and dashboards. This file.
//
// A third, `Diaspora.Modules.CommunityLife` (`/api/v1/community-life`), owns
// events and organizations and is served by `community-life-api.ts`. The event
// **series** routes in this file are B12's, called from here only because the
// series screens are Phase 12's; they are marked `B12` at each call site.
//
// ── The five things verified per route, because each has bitten a wave ──────
//
//   1. **Enum wire casing is PascalCase.** Every enum crosses the wire as a
//      `string` DTO property filled by `.ToString()` on the CLR enum —
//      `CommunityProgrammeMapper.cs:94,115,147,159,173,199,276,431` — and the
//      host's only naming policy is `PropertyNamingPolicy = CamelCase`
//      (`Program.cs:126`), which renames *properties* and never *values*. So
//      `"PaymentPending"`, `"Monthly"`, `"InviteOnly"`, `"SingleChoice"`. That
//      is the same casing the client's own unions already use, so no
//      translation table exists here — and its absence is the finding, not an
//      omission.
//
//   2. **Every list names its rows `items`.** `CommunityPageResponse<T>`
//      (`CommunityProgrammeResponses.cs:38-47`) is `{ items, nextCursor,
//      hasMore, totalCount }`, and B15's `GivingPageResponse<T>` and B12's
//      `EventSeriesPageResponse` agree *about the row property*. `readPage`
//      therefore reads all three natively.
//
//      **They do not agree about the count.** Corrected in Wave C-04, because
//      the original sentence here said they agreed and stopped there:
//      `GivingPageResponse<T>` (`B15_1GivingResponses.cs:22-29`) is
//      `{ items, nextCursor, hasMore }` with **no `totalCount` at all**, so
//      every campaign, update and supporter page reports `totalCount: null` —
//      which is the honest answer and must not be "fixed" by promoting
//      `items.length`. See `readGivingList`. The other exception on this
//      surface is fund usage, which is not a page at all — see
//      `fetchCampaignFundUsage`.
//
//   3. **Idempotency is a header, and the body is also accepted.**
//      `IdempotencyHeader.From(context)` reads `Idempotency-Key`
//      (`IdempotencyHeader.cs:19-26`) and hands it to the command beside the
//      request's own `idempotencyKey` field; `ProgrammeIdempotency.Normalise`
//      prefers the header. So this client sends **both**, which is what the
//      existing screens already produce and what the server already prefers.
//      This is *not* Automation's contract, which reads no headers at all.
//
//   4. **Nothing here is conditionally registered.** `CommunityProgrammeFeatures`
//      declares four gates and **no code path anywhere in the solution reads
//      one** — there is no `IFeatureService`, no `RequireFeature`, no handler
//      consulting them. The routes are mapped unconditionally by
//      `CommunityProgrammeEndpointContributor.MapEndpoints`. No route on this
//      surface answers 200 with `isAvailable: false`.
//
//   5. **Authorization is real and is never assumed here.** Every command and
//      query carries `[Authorize(Permission = …)]` and every organization-scoped
//      operation re-decides the caller's capability inside the handler. This
//      client sends no capability claim and infers no permission; it renders
//      what `GET /communities/organizations/{id}/capabilities` answers.
//
// ── Where the server is honest and this file must be too ────────────────────
//
// **Logos are media identifiers, not URLs.** B18 answers `logoMediaId` /
// `organizationLogoMediaId` (a B5 asset id) wherever the Phase 12 client model
// declares a `…Logo` URL string. There is no synchronous id→URL resolver on
// this client — `media-api.ts` exposes only `fetchMediaAsset`, a second round
// trip — so these adapters set the URL field to `null` rather than fabricating
// a path that would 404 in an `<Image>`. Screens already render a placeholder
// for a null logo. Resolving them properly is a media-layer change, not a
// contract change, and inventing a URL here would be the exact class of lie
// this remediation exists to remove.
//
// **Money.** B18 answers `{ amount, currency, exponent }`; the client's `Money`
// additionally carries `minorUnits`. That is arithmetic on figures the server
// gave — `amount × 10^exponent`, rounded — rather than a value invented here,
// and it is done in one place (`toMoney`) so it cannot drift.
// ═════════════════════════════════════════════════════════════════════════════

import { apiClient } from './apiClient';
import { toFinancialError } from './financial-errors';
import { readPage, unwrapEnvelope } from './platform-envelope';
import { partsInZone } from './event-wire';
import { coordinatesOf } from './place-coordinates';
import type { Money } from '@/types/financial';
import type { EventCategory, EventLocation, OrgCategory } from '@/types/community-life';
import type {
  AnnouncementScope,
  CreateEventSeriesRequest,
  BillingPeriod,
  CampaignCategory,
  CampaignFundUsage,
  CampaignMilestone,
  CampaignStatus,
  CampaignSupporter,
  CampaignUpdate,
  CommunityAnnouncement,
  CommunityPage,
  CommunityPoll,
  CommunitySearchResult,
  CreateCampaignRequest,
  DonationTimeSeries,
  FundUsageLine,
  FundraisingCampaign,
  FundraisingProgress,
  MembershipBenefit,
  MembershipDiscoveryParams,
  MembershipProgramme,
  MembershipRequirement,
  MembershipStatus,
  MembershipTier,
  MembershipVisibility,
  OrganizationCapabilities,
  OrganizationMember,
  OrganizationRole,
  PollAudience,
  PollOptionResult,
  PollResult,
  PollStatus,
  PollVotingType,
  RecurringDonation,
  RecurringDonationStatus,
  TimeSeriesPoint,
  VolunteerApplicant,
  VolunteerApplication,
  VolunteerApplicationStatus,
  VolunteerAssignment,
  VolunteerAssignmentStatus,
  VolunteerCertificate,
  VolunteerHoursSummary,
  VolunteerOpportunity,
  VolunteerOpportunityStatus,
  VolunteerShift,
  Weekday,
} from '@/types/community-advanced';
import type { CampaignDonation } from '@/types/community-advanced';
import { backed } from '@/types/community-advanced';
import type { CommunityMembership, MembershipHistoryEntry } from '@/types/community-advanced';

/**
 * B18's prefix, relative to `apiClient`'s `…/v1` base.
 *
 * Plural, and one character from B12's `/community-life` and the social
 * module's `/community`. Declared once so a call site cannot spell it the other
 * way round; `CommunityProgrammeModuleMetadata.cs:28` is the authority.
 */
const ROOT = '/communities';

/** B12's prefix. Used only by the event-series calls. `/community-life`. */
const COMMUNITY_LIFE_ROOT = '/community-life';

/**
 * B15's prefix. Used only by the two B15.1 giving-extension calls.
 *
 * **The campaign routes are not here and the giving routes are not at `ROOT`,
 * and the split is the backend's own.** B15 owns the campaign aggregate, its
 * twelve-state machine and every figure on it — but the register put the
 * campaign URLs under `/api/v1/communities`, and this platform allows exactly
 * one module per prefix. So B18 maps them and forwards to B15's commands
 * (`CampaignEndpoints.cs:20-26`), while the donation time series and the
 * recurring-donation routes, which no register placed under `/communities`,
 * stay at B15's own prefix (`GivingExtensionEndpoints.cs:14-21`).
 *
 * Ownership follows the aggregate; the prefix follows the register. Each call
 * site below says which module answers it.
 */
const FINANCIAL_ROOT = '/financial';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
//
// Namespaced `community-programme`, so a cache dump distinguishes a B18 read
// from the `community-gap` entries that still answer for what B18 does not
// serve, and from `community-life`'s B12 entries. The three coexist during the
// tail of this migration and must never share an entry.
// ─────────────────────────────────────────────────────────────────────────────

export const communityProgrammeKeys = {
  all: ['community-programme'] as const,

  programme: (organizationId: string) =>
    ['community-programme', 'membership', 'programme', organizationId] as const,
  tiers: (organizationId: string) =>
    ['community-programme', 'membership', 'tiers', organizationId] as const,
  membershipDiscovery: (fingerprint: string) =>
    ['community-programme', 'membership', 'discover', fingerprint] as const,
  myMemberships: () => ['community-programme', 'membership', 'me'] as const,
  membership: (id: string) => ['community-programme', 'membership', id] as const,
  organizationMembers: (organizationId: string, state?: string) =>
    ['community-programme', 'membership', 'org', organizationId, state ?? 'all'] as const,

  opportunities: (fingerprint: string) =>
    ['community-programme', 'volunteer', 'list', fingerprint] as const,
  opportunity: (id: string) => ['community-programme', 'volunteer', id] as const,
  shifts: (opportunityId: string) =>
    ['community-programme', 'volunteer', opportunityId, 'shifts'] as const,
  myApplications: () => ['community-programme', 'volunteer', 'applications', 'me'] as const,
  /**
   * One application.
   *
   * **There is no route that reads one.** B18 serves
   * `/volunteer/applications/me` and the organizer's `…/applications` queue, and
   * nothing in between — an applicant reads their own application out of their
   * own list. The key exists so a mutation's response can be written into the
   * cache under a stable identity; no query ever fetches it, and adding one
   * would need a route that does not exist.
   */
  application: (id: string) => ['community-programme', 'volunteer', 'applications', id] as const,
  applicants: (opportunityId: string, state?: string) =>
    ['community-programme', 'volunteer', opportunityId, 'applicants', state ?? 'all'] as const,
  myAssignments: () => ['community-programme', 'volunteer', 'assignments', 'me'] as const,
  volunteerHours: () => ['community-programme', 'volunteer', 'hours', 'me'] as const,
  certificates: () => ['community-programme', 'volunteer', 'certificates', 'me'] as const,

  polls: (fingerprint: string) => ['community-programme', 'polls', 'list', fingerprint] as const,
  poll: (id: string) => ['community-programme', 'polls', id] as const,
  pollResult: (id: string) => ['community-programme', 'polls', id, 'result'] as const,

  myOrganizations: () => ['community-programme', 'organizations', 'me'] as const,
  capabilities: (organizationId: string) =>
    ['community-programme', 'organizations', organizationId, 'capabilities'] as const,
  dashboard: (organizationId: string) =>
    ['community-programme', 'organizations', organizationId, 'dashboard'] as const,
  analytics: (organizationId: string, period: string) =>
    ['community-programme', 'organizations', organizationId, 'analytics', period] as const,
  memberAnalytics: (organizationId: string, period: string) =>
    ['community-programme', 'organizations', organizationId, 'analytics', 'members', period] as const,

  announcements: (scope: string, scopeId?: string) =>
    ['community-programme', 'announcements', scope, scopeId ?? 'all'] as const,
  neighborhoodActivity: (areaId: string) =>
    ['community-programme', 'neighborhoods', areaId, 'activity'] as const,
  impact: (scope: string, scopeId: string, period: string) =>
    ['community-programme', 'impact', scope, scopeId, period] as const,
  /**
   * The federated search this module owns — `GET /communities/search`.
   *
   * Namespaced here rather than under `community-gap`, which is where
   * `useCommunitySearch` used to key it. Remediation Wave I moved that query off
   * the development adapter and onto the real route, and two namespaces are two
   * cache entries, so a build that had a simulated answer cached cannot serve it
   * to the certified query.
   */
  search: (fingerprint: string) => ['community-programme', 'search', fingerprint] as const,

  // Event series. B12's aggregate, read through B12's routes — but keyed under
  // this namespace because the Phase 12 series screens are the only consumers
  // and a cache dump should show them together with the rest of that phase.
  seriesList: (fingerprint: string) => ['community-programme', 'series', 'list', fingerprint] as const,
  series: (id: string) => ['community-programme', 'series', id] as const,
  occurrences: (seriesId: string, from?: string, to?: string) =>
    ['community-programme', 'series', seriesId, 'occurrences', from ?? 'any', to ?? 'any'] as const,
  occurrence: (id: string) => ['community-programme', 'occurrences', id] as const,

  // ── Campaigns and giving. B15.1, mapped at B18's prefix. ──────────────────
  campaigns: (fingerprint: string) =>
    ['community-programme', 'campaigns', 'list', fingerprint] as const,
  campaign: (id: string) => ['community-programme', 'campaigns', id] as const,
  campaignUpdates: (id: string) =>
    ['community-programme', 'campaigns', id, 'updates'] as const,
  campaignMilestones: (id: string) =>
    ['community-programme', 'campaigns', id, 'milestones'] as const,
  campaignSupporters: (id: string) =>
    ['community-programme', 'campaigns', id, 'supporters'] as const,
  campaignFundUsage: (id: string) =>
    ['community-programme', 'campaigns', id, 'fund-usage'] as const,
  myCampaignDonations: (id: string) =>
    ['community-programme', 'campaigns', id, 'donations', 'me'] as const,
  myCampaigns: (organizationId?: string) =>
    ['community-programme', 'campaigns', 'me', organizationId ?? 'all'] as const,
  /**
   * A cause's giving over a window.
   *
   * Keyed on the **cause code**, not the campaign, because that is what the
   * route is keyed on — two campaigns cannot share a cause, but a cause exists
   * independently of one and the series is the cause's.
   */
  donationTimeSeries: (causeCode: string, from?: string, to?: string) =>
    ['community-programme', 'giving', 'timeseries', causeCode, from ?? 'any', to ?? 'any'] as const,
  myRecurringDonations: () =>
    ['community-programme', 'giving', 'recurring', 'me'] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Transport
//
// The platform envelope, `{ data, meta }`, produced by `PlatformResults.Ok` and
// `PlatformResults.Created` (`PlatformResults.cs:20-50`). Both success shapes
// are identical, so one reader covers reads and writes.
//
// Errors become `FinancialError` — the platform's one error type — classified
// `read` or `mutating`, so a transport failure on a membership application is
// an *indeterminate* outcome the UI can say so about rather than a flat
// failure it would be wrong to report as one.
// ─────────────────────────────────────────────────────────────────────────────

type QueryParams = Record<string, unknown> | object;

async function read<T>(path: string, params?: QueryParams): Promise<T> {
  try {
    const response = await apiClient.get<unknown>(path, { params });
    return unwrapEnvelope<T>(response.data) as T;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/** A cursor page, read through the platform normaliser rather than by hand. */
async function readList<T>(path: string, params?: QueryParams): Promise<CommunityPage<T>> {
  try {
    const response = await apiClient.get<unknown>(path, { params });
    const page = readPage<T>(response.data);
    return {
      items: page.items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      totalCount: page.totalCount,
    };
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * A write, with the `Idempotency-Key` header where the caller supplied a key.
 *
 * Both places, deliberately. `IdempotencyHeader.cs:8-12` states the server
 * accepts the header *and* the body field and prefers the header; the Phase 12
 * screens already put the key in the body via `lib/idempotency.ts`. Sending
 * both means a retried application returns the same membership regardless of
 * which the server consults, and neither side had to change.
 */
async function write<T>(
  method: 'post' | 'put' | 'delete',
  path: string,
  body?: unknown,
  options?: { params?: QueryParams; idempotencyKey?: string | null }
): Promise<T> {
  const config = {
    params: options?.params,
    headers: options?.idempotencyKey
      ? { 'Idempotency-Key': options.idempotencyKey }
      : undefined,
  };

  try {
    const response =
      method === 'delete'
        ? await apiClient.delete<unknown>(path, config)
        : method === 'put'
          ? await apiClient.put<unknown>(path, body, config)
          : await apiClient.post<unknown>(path, body, config);
    return unwrapEnvelope<T>(response.data) as T;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire shapes
//
// Declared rather than imported, because there is no shared schema between the
// two repositories. Each interface below is a transcription of the C# record
// named in its comment, and the field list is the record's field list — so a
// reviewer can diff the two by eye, and a field the server does not send is
// visibly absent here rather than silently `undefined` at a call site.
// ─────────────────────────────────────────────────────────────────────────────

/** `MoneyResponse` — CommunityProgrammeResponses.cs:27. */
interface MoneyWire {
  amount: number;
  currency: string;
  exponent: number;
}

/** `MembershipBenefitResponse` — :150. */
interface BenefitWire {
  id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  isActive: boolean;
}

/** `MembershipRequirementResponse` — :172. `isMet` is the server's evaluation. */
interface RequirementWire {
  id: string;
  label: string;
  description?: string | null;
  kind: string;
  isMet: boolean;
  actionRoute?: string | null;
}

/** `MembershipTierResponse` — :189. */
interface TierWire {
  tierId: string;
  organizationId: string;
  name: string;
  description: string;
  price?: MoneyWire | null;
  billingPeriod: string;
  benefits: BenefitWire[];
  requirements: RequirementWire[];
  capacity?: number | null;
  filledCount: number;
  isFull: boolean;
  isRecommended: boolean;
  sortOrder: number;
}

/** `MembershipProgrammeResponse` — :222. */
interface ProgrammeWire {
  organizationId: string;
  organizationName: string;
  organizationLogoMediaId?: string | null;
  category: string;
  isVerified: boolean;
  visibility: string;
  isOpen: boolean;
  requiresApproval: boolean;
  summary: string;
  tiers: TierWire[];
  memberCount: number;
  countryCode?: string | null;
  cityName?: string | null;
  myStatus: string;
  myMembershipId?: string | null;
}

/** `MembershipHistoryEntryResponse` — :259. */
interface HistoryWire {
  id: string;
  status: string;
  occurredAt: string;
  actor: string;
  reason?: string | null;
}

/** `ProgrammeMembershipResponse` — :280. */
interface MembershipWire {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationLogoMediaId?: string | null;
  tierId: string;
  tierName: string;
  status: string;
  price?: MoneyWire | null;
  billingPeriod: string;
  benefits: BenefitWire[];
  joinedAt?: string | null;
  expiresAt?: string | null;
  renewalDueAt?: string | null;
  isRenewable: boolean;
  grantsBenefits: boolean;
  paymentIntentId?: string | null;
  history: HistoryWire[];
  decisionReason?: string | null;
}

/** `OrganizationMemberResponse` — :329. Carries no display name; see `toMember`. */
interface OrganizationMemberWire {
  membershipId: string;
  userId: string;
  /** Resolved server-side once per page. Null means the platform could not say. */
  displayName?: string | null;
  tierId: string;
  tierName: string;
  status: string;
  role?: string | null;
  organizationMembershipId?: string | null;
  joinedAt?: string | null;
  expiresAt?: string | null;
  appliedAt: string;
}

/** `OrganizationCapabilitiesResponse` — :59. */
interface CapabilitiesWire {
  organizationId: string;
  role?: string | null;
  canManageMembers: boolean;
  canApproveMembers: boolean;
  canManageTiers: boolean;
  canManageEvents: boolean;
  canManageCampaigns: boolean;
  canManageVolunteers: boolean;
  canManagePolls: boolean;
  canPublishAnnouncements: boolean;
  canViewAnalytics: boolean;
  canViewFinancials: boolean;
}

/** `MyOrganizationResponse` — :88. */
interface MyOrganizationWire {
  organizationId: string;
  name: string;
  logoMediaId?: string | null;
  role: string;
  membershipId: string;
  isVerified: boolean;
  capabilities: CapabilitiesWire;
}

/** `DashboardCountsResponse` — :132. Six counts, and only six. */
interface DashboardCountsWire {
  pendingMemberApplications: number;
  activeMembers: number;
  openOpportunities: number;
  pendingVolunteerApplications: number;
  openPolls: number;
  recentAnnouncements: number;
}

/** `OrganizationDashboardResponse` — :115. */
interface DashboardWire {
  organizationId: string;
  organizationName: string;
  logoMediaId?: string | null;
  capabilities: CapabilitiesWire;
  counts: DashboardCountsWire;
  computedAt: string;
}

/** `VolunteerShiftResponse` — :357. */
interface ShiftWire {
  shiftId: string;
  opportunityId: string;
  label: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  filledCount: number;
  isFull: boolean;
}

/** `VolunteerOpportunityResponse` — :378. */
interface OpportunityWire {
  opportunityId: string;
  title: string;
  description: string;
  cause: string;
  status: string;
  organizationId: string;
  organizationName: string;
  organizationLogoMediaId?: string | null;
  isVerified: boolean;
  countryCode?: string | null;
  cityName?: string | null;
  areaName?: string | null;
  addressLine?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  shifts: ShiftWire[];
  requiredSkills: string[];
  minimumAge?: number | null;
  capacity?: number | null;
  filledCount: number;
  waitlistCount: number;
  isFull: boolean;
  applicationDeadline?: string | null;
  myApplicationStatus: string;
  myApplicationId?: string | null;
  canApply: boolean;
  cannotApplyReason?: string | null;
  canManage: boolean;
  createdAt: string;
}

/** `VolunteerAssignmentResponse` — :505. */
interface AssignmentWire {
  assignmentId: string;
  applicationId: string;
  opportunityId: string;
  opportunityTitle: string;
  organizationId: string;
  volunteerUserId: string;
  shiftId?: string | null;
  shiftLabel?: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  confirmedHours?: number | null;
  confirmedAt?: string | null;
}

/** `VolunteerApplicationResponse` — :444. */
interface ApplicationWire {
  applicationId: string;
  opportunityId: string;
  opportunityTitle: string;
  organizationId: string;
  organizationName: string;
  shiftId?: string | null;
  status: string;
  answers: Record<string, string>;
  submittedAt?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  waitlistPosition?: number | null;
  assignment?: AssignmentWire | null;
}

/** `VolunteerApplicantResponse` — :487. Carries no display name; see `toApplicant`. */
interface ApplicantWire {
  applicationId: string;
  userId: string;
  /** Resolved server-side once per page. Null means the platform could not say. */
  displayName?: string | null;
  status: string;
  answers: Record<string, string>;
  shiftId?: string | null;
  submittedAt: string;
  waitlistPosition?: number | null;
}

/** `VolunteerCertificateResponse` — :540. `downloadUrl` is null, honestly so. */
interface CertificateWire {
  certificateId: string;
  title: string;
  organizationId: string;
  organizationName: string;
  hours: number;
  issuedAt: string;
  downloadUrl?: string | null;
}

/** `VolunteerHoursResponse` — :566. */
interface HoursWire {
  confirmedHours: number;
  completedAssignments: number;
  organizationsSupported: number;
  certificates: CertificateWire[];
}

/** `PollOptionResponse` — :587. Deliberately carries no count. */
interface PollOptionWire {
  optionId: string;
  label: string;
  description?: string | null;
  sortOrder: number;
}

/** `PollResponseDetail` — :649. */
interface PollResponseWire {
  responseId: string;
  pollId: string;
  selectedOptionIds: string[];
  openResponse?: string | null;
  respondedAt: string;
}

/** `CommunityPollResponse` — :599. */
interface PollWire {
  pollId: string;
  question: string;
  description?: string | null;
  status: string;
  votingType: string;
  audience: string;
  options: PollOptionWire[];
  maxSelections?: number | null;
  isAnonymous: boolean;
  allowsChange: boolean;
  organizationId?: string | null;
  organizationName?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  totalResponses: number;
  hasVoted: boolean;
  myResponse?: PollResponseWire | null;
  canVote: boolean;
  cannotVoteReason?: string | null;
  canManage: boolean;
  createdAt: string;
}

/** `PollOptionResultResponse` — :663. */
interface PollOptionResultWire {
  optionId: string;
  label: string;
  count: number;
  percentage: number;
  isMyChoice?: boolean | null;
}

/**
 * `PollResultResponse` — :686.
 *
 * `options` is **null** while results are withheld and is never an empty array
 * in that case, because an empty array renders as "nobody voted". The adapter
 * preserves the distinction rather than defaulting it away.
 */
interface PollResultWire {
  pollId: string;
  status: string;
  options?: PollOptionResultWire[] | null;
  totalResponses: number;
  openResponses?: string[] | null;
  areResultsVisible: boolean;
  resultsHiddenReason?: string | null;
  computedAt: string;
}

/** `CommunityAnnouncementResponse` — :710. Media are B5 ids, never URLs. */
interface AnnouncementWire {
  announcementId: string;
  scope: string;
  scopeId?: string | null;
  scopeName: string;
  title: string;
  body: string;
  mediaIds: string[];
  publishedByUserId: string;
  organizationId?: string | null;
  isPinned: boolean;
  publishedAt: string;
  actionRoute?: string | null;
}

/** `TimeSeriesPointResponse` — :743. `date` is `YYYY-MM-DD`. */
interface TimeSeriesPointWire {
  date: string;
  value: number;
}

/** `OrganizationAnalyticsResponse` — :760. Three series, and only three. */
interface AnalyticsWire {
  organizationId: string;
  period: string;
  memberGrowth: TimeSeriesPointWire[];
  volunteerHours: TimeSeriesPointWire[];
  pollParticipation: TimeSeriesPointWire[];
  computedAt: string;
}

/** `MemberAnalyticsResponse` — :777. */
export interface MemberAnalytics {
  organizationId: string;
  period: string;
  totalMembers: number;
  activeMembers: number;
  pendingApplications: number;
  lapsedMembers: number;
  byStatus: Record<string, number>;
  joins: TimeSeriesPoint[];
  computedAt: string;
}

/** `ImpactMetricResponse` — :807. The definition travels with the number. */
export interface ImpactMetric {
  key: string;
  label: string;
  value: number;
  definition: string;
  source: string;
}

/** `CommunityImpactResponse` — :823. */
export interface ProgrammeImpact {
  scope: string;
  scopeId?: string | null;
  scopeName: string;
  period: string;
  metrics: ImpactMetric[];
  computedAt: string;
}

/** `CommunitySearchResultResponse` — :848. Ordered by the server's `relevance`. */
interface SearchResultWire {
  entityType: string;
  entityId: string;
  title: string;
  subtitle?: string | null;
  imageMediaId?: string | null;
  locationLabel?: string | null;
  badge?: string | null;
  actionRoute: string;
  relevance: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapters
//
// Wire → the Phase 12 domain model. Every narrowing below is a *validated* cast
// against the union it targets, never a bare `as`: an unrecognised enum value
// falls back to the union's safest member rather than entering the model as a
// string that no `switch` in the app handles. A server that added a state this
// client has never heard of should render the conservative thing, not crash.
// ─────────────────────────────────────────────────────────────────────────────

/** `amount × 10^exponent`, rounded. Derived from the server's own figures. */
function toMoney(wire: MoneyWire): Money {
  return {
    amount: wire.amount,
    currency: wire.currency,
    minorUnits: Math.round(wire.amount * 10 ** wire.exponent),
    exponent: wire.exponent,
  };
}

function toMoneyOrNull(wire?: MoneyWire | null): Money | null {
  return wire ? toMoney(wire) : null;
}

/**
 * Narrow a wire string to a known union member, or fall back.
 *
 * The fallback is always the *least* privileged / most conservative member of
 * its union — `NotAMember`, `Draft`, `Other` — so an unknown value can never
 * light up a screen that claims something is active, approved or paid.
 */
function oneOf<T extends string>(value: string | null | undefined, members: readonly T[], fallback: T): T {
  return members.includes(value as T) ? (value as T) : fallback;
}

const MEMBERSHIP_STATUSES = [
  'NotAMember', 'Eligible', 'Ineligible', 'Draft', 'Pending', 'Approved', 'Rejected',
  'PaymentPending', 'PaymentFailed', 'Active', 'RenewalDue', 'Expired', 'Suspended', 'Cancelled',
] as const satisfies readonly MembershipStatus[];

const BILLING_PERIODS = [
  'OneOff', 'Monthly', 'Quarterly', 'Yearly', 'Lifetime',
] as const satisfies readonly BillingPeriod[];

const VISIBILITIES = [
  'Public', 'Unlisted', 'Private', 'InviteOnly',
] as const satisfies readonly MembershipVisibility[];

const REQUIREMENT_KINDS = [
  'Verification', 'Residency', 'Age', 'Invitation', 'Referral', 'Document', 'Other',
] as const satisfies readonly MembershipRequirement['kind'][];

const ORG_CATEGORIES = [
  'Churches', 'Mosques', 'Associations', 'Embassies', 'Student Associations',
  'Professional Associations', 'Community Centres', 'NGOs', 'Doctors', 'Lawyers',
  'Accountants', 'Immigration Consultants', 'Cultural Organizations', 'Sports Clubs',
  'Business Associations', 'Volunteer Organizations', 'Restaurants', 'Other',
] as const satisfies readonly OrgCategory[];

const ORG_ROLES = [
  'Owner', 'Administrator', 'Organizer', 'Treasurer', 'Moderator', 'Member',
] as const satisfies readonly OrganizationRole[];

const HISTORY_ACTORS = ['Member', 'Organization', 'System'] as const;

const OPPORTUNITY_STATUSES = [
  'Draft', 'Published', 'Full', 'Closed', 'Completed', 'Cancelled',
] as const satisfies readonly VolunteerOpportunityStatus[];

const APPLICATION_STATUSES = [
  'NotApplied', 'Draft', 'Pending', 'Approved', 'Rejected', 'Waitlisted', 'Withdrawn',
  'Cancelled', 'Completed',
] as const satisfies readonly VolunteerApplicationStatus[];

const ASSIGNMENT_STATUSES = [
  'Assigned', 'Confirmed', 'CheckedIn', 'Completed', 'NoShow', 'Cancelled',
] as const satisfies readonly VolunteerAssignmentStatus[];

const POLL_STATUSES = [
  'Draft', 'Scheduled', 'Open', 'Closed', 'Cancelled', 'ResultsPublished',
] as const satisfies readonly PollStatus[];

const POLL_VOTING_TYPES = [
  'SingleChoice', 'MultipleChoice', 'OpenResponse',
] as const satisfies readonly PollVotingType[];

const POLL_AUDIENCES = [
  'Public', 'OrganizationMembers', 'Neighborhood', 'Country', 'Invited',
] as const satisfies readonly PollAudience[];

const ANNOUNCEMENT_SCOPES = [
  'Community', 'Organization', 'Neighborhood', 'Event', 'Campaign',
] as const satisfies readonly AnnouncementScope[];

function toBenefit(wire: BenefitWire): MembershipBenefit {
  return {
    id: wire.id,
    title: wire.title,
    description: wire.description ?? null,
    icon: wire.icon ?? null,
    isActive: wire.isActive,
  };
}

function toRequirement(wire: RequirementWire): MembershipRequirement {
  return {
    id: wire.id,
    label: wire.label,
    description: wire.description ?? null,
    kind: oneOf(wire.kind, REQUIREMENT_KINDS, 'Other'),
    isMet: wire.isMet,
    actionRoute: wire.actionRoute ?? null,
  };
}

function toTier(wire: TierWire): MembershipTier {
  return {
    tierId: wire.tierId,
    organizationId: wire.organizationId,
    name: wire.name,
    description: wire.description,
    price: toMoneyOrNull(wire.price),
    billingPeriod: oneOf(wire.billingPeriod, BILLING_PERIODS, 'OneOff'),
    benefits: wire.benefits.map(toBenefit),
    requirements: wire.requirements.map(toRequirement),
    capacity: wire.capacity ?? null,
    filledCount: wire.filledCount,
    isFull: wire.isFull,
    isRecommended: wire.isRecommended,
    sortOrder: wire.sortOrder,
  };
}

/**
 * The programme's location.
 *
 * B18 carries `countryCode` and `cityName` and nothing finer — no area, no
 * address, no coordinates — because a membership programme belongs to a body
 * rather than to a place. The client's `EventLocation` wants three strings, so
 * the two it does not have are empty rather than filled with a guess, and a
 * programme with no city at all gets `null` rather than an `EventLocation`
 * whose every field is blank.
 */
function toProgrammeLocation(wire: ProgrammeWire): EventLocation | null {
  if (!wire.cityName) return null;
  return { cityName: wire.cityName, areaName: '', addressLine: '' };
}

function toProgramme(wire: ProgrammeWire): MembershipProgramme {
  return {
    organizationId: wire.organizationId,
    organizationName: wire.organizationName,
    // A B5 media id, not a URL. See the file header.
    organizationLogo: null,
    category: oneOf(wire.category, ORG_CATEGORIES, 'Other'),
    isVerified: wire.isVerified,
    visibility: oneOf(wire.visibility, VISIBILITIES, 'Private'),
    isOpen: wire.isOpen,
    requiresApproval: wire.requiresApproval,
    summary: wire.summary,
    tiers: wire.tiers.map(toTier),
    memberCount: wire.memberCount,
    location: toProgrammeLocation(wire),
    countryCode: wire.countryCode ?? null,
    myStatus: oneOf(wire.myStatus, MEMBERSHIP_STATUSES, 'NotAMember'),
    myMembershipId: wire.myMembershipId ?? null,
  };
}

function toHistoryEntry(wire: HistoryWire): MembershipHistoryEntry {
  return {
    id: wire.id,
    status: oneOf(wire.status, MEMBERSHIP_STATUSES, 'NotAMember'),
    occurredAt: wire.occurredAt,
    actor: oneOf(wire.actor, HISTORY_ACTORS, 'System'),
    reason: wire.reason ?? null,
  };
}

/**
 * A membership, without a `payment`.
 *
 * B18 answers a bare `paymentIntentId` and nothing else about the money — by
 * design, because B15 owns every fact about it. The client's `MembershipPayment`
 * wants a `PaymentStatus`, an amount and a receipt, and the only honest way to
 * fill those is to read B15. So this adapter leaves `payment` null and the hook
 * layer stitches B15's intent onto it, which is exactly the split
 * COMMUNITY-LIFE-GAP-003 described and B18's `MembershipSettlement` now
 * enforces server-side: a membership activates only when B15 says the payment
 * settled.
 */
function toMembership(wire: MembershipWire): CommunityMembership {
  return {
    membershipId: wire.membershipId,
    organizationId: wire.organizationId,
    organizationName: wire.organizationName,
    organizationLogo: null,
    tierId: wire.tierId,
    tierName: wire.tierName,
    status: oneOf(wire.status, MEMBERSHIP_STATUSES, 'NotAMember'),
    price: toMoneyOrNull(wire.price),
    billingPeriod: oneOf(wire.billingPeriod, BILLING_PERIODS, 'OneOff'),
    benefits: wire.benefits.map(toBenefit),
    joinedAt: wire.joinedAt ?? null,
    expiresAt: wire.expiresAt ?? null,
    renewalDueAt: wire.renewalDueAt ?? null,
    isRenewable: wire.isRenewable,
    payment: null,
    history: wire.history.map(toHistoryEntry),
    decisionReason: wire.decisionReason ?? null,
  };
}

/**
 * A member of an organization's roll.
 *
 * **The roll carries no display name and no avatar, and that is §45 rather than
 * a name now** — `OrganizationMemberResponse` carries `displayName`, resolved on
 * the server through `IMemberProfileService`, the sanctioned batch source, once
 * per page. It is null when the platform cannot say, and the screen renders a
 * neutral label for that.
 *
 * It used to render the raw user identifier as the person's name, which put
 * "3f2a…" in the list, in accessibility labels and in confirmation alerts
 * ("Decline 3f2a…?"). An identifier is not a name, and asking an administrator
 * to decide about one is asking them to decide about nobody.
 */
/**
 * A member's name, or a neutral label.
 *
 * **Never the identifier.** Rendering `wire.userId` as a name is what this
 * replaced: it put a GUID in the list, in accessibility labels and in the
 * confirmation alert an administrator reads before declining somebody. A null
 * name is the platform saying it cannot tell us who this is, and the honest
 * rendering of that is a label that does not pretend to be a name.
 */
export const UNNAMED_MEMBER = 'A member';

export function nameOrNeutral(name: string | null | undefined): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed.length > 0 ? trimmed : UNNAMED_MEMBER;
}

function toMember(wire: OrganizationMemberWire): OrganizationMember {
  return {
    membershipId: wire.membershipId,
    userId: wire.userId,
    displayName: nameOrNeutral(wire.displayName),
    avatarUrl: null,
    tierName: wire.tierName,
    status: oneOf(wire.status, MEMBERSHIP_STATUSES, 'NotAMember'),
    role: oneOf(wire.role, ORG_ROLES, 'Member'),
    joinedAt: wire.joinedAt ?? null,
    expiresAt: wire.expiresAt ?? null,
    // The roll does not carry a verification flag. False is the conservative
    // reading: an unverified badge omitted is a missing decoration, an invented
    // one is a false claim about a person.
    isVerified: false,
  };
}

function toCapabilities(wire: CapabilitiesWire): OrganizationCapabilities {
  return {
    organizationId: wire.organizationId,
    role: wire.role ? oneOf(wire.role, ORG_ROLES, 'Member') : null,
    canManageMembers: wire.canManageMembers,
    canApproveMembers: wire.canApproveMembers,
    canManageTiers: wire.canManageTiers,
    canManageEvents: wire.canManageEvents,
    canManageCampaigns: wire.canManageCampaigns,
    canManageVolunteers: wire.canManageVolunteers,
    canManagePolls: wire.canManagePolls,
    canPublishAnnouncements: wire.canPublishAnnouncements,
    canViewAnalytics: wire.canViewAnalytics,
    canViewFinancials: wire.canViewFinancials,
  };
}

/** An occurrence-free, ISO-instant → `YYYY-MM-DD` split the shift model wants. */
function splitInstant(instant: string): { date: string; time: string } {
  const [date, rest] = instant.split('T');
  return { date: date ?? instant, time: (rest ?? '').slice(0, 5) };
}

function toShift(wire: ShiftWire): VolunteerShift {
  const start = splitInstant(wire.startsAt);
  const end = splitInstant(wire.endsAt);
  return {
    shiftId: wire.shiftId,
    opportunityId: wire.opportunityId,
    label: wire.label,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    capacity: wire.capacity,
    filledCount: wire.filledCount,
    isFull: wire.isFull,
  };
}

function toOpportunity(wire: OpportunityWire): VolunteerOpportunity {
  return {
    opportunityId: wire.opportunityId,
    title: wire.title,
    description: wire.description,
    coverImage: null,
    cause: wire.cause,
    status: oneOf(wire.status, OPPORTUNITY_STATUSES, 'Draft'),
    organizationId: wire.organizationId,
    organizationName: wire.organizationName,
    organizationLogo: null,
    isVerified: wire.isVerified,
    location: {
      cityName: wire.cityName ?? '',
      areaName: wire.areaName ?? '',
      addressLine: wire.addressLine ?? '',
    },
    startDate: wire.startsAt ?? null,
    endDate: wire.endsAt ?? null,
    shifts: wire.shifts.map(toShift),
    requiredSkills: wire.requiredSkills,
    // B18 models an opportunity's minimum age directly and has no requirement
    // list on it. An empty array is the truth: there are no requirement rows,
    // not "we did not look".
    requirements: [],
    minimumAge: wire.minimumAge ?? null,
    capacity: wire.capacity ?? null,
    filledCount: wire.filledCount,
    isFull: wire.isFull,
    applicationDeadline: wire.applicationDeadline ?? null,
    myApplicationStatus: oneOf(wire.myApplicationStatus, APPLICATION_STATUSES, 'NotApplied'),
    myApplicationId: wire.myApplicationId ?? null,
    canApply: wire.canApply,
    cannotApplyReason: wire.cannotApplyReason ?? null,
    canManage: wire.canManage,
    createdAt: wire.createdAt,
  };
}

function toAssignment(wire: AssignmentWire): VolunteerAssignment {
  const start = splitInstant(wire.startsAt);
  const end = splitInstant(wire.endsAt);
  return {
    assignmentId: wire.assignmentId,
    applicationId: wire.applicationId,
    opportunityId: wire.opportunityId,
    opportunityTitle: wire.opportunityTitle,
    shiftId: wire.shiftId ?? null,
    shiftLabel: wire.shiftLabel ?? null,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    // The assignment contract carries no place of its own; the opportunity it
    // belongs to does. Empty rather than repeated from a record this response
    // does not include.
    location: { cityName: '', areaName: '', addressLine: '' },
    status: oneOf(wire.status, ASSIGNMENT_STATUSES, 'Assigned'),
    checkedInAt: wire.checkedInAt ?? null,
    checkedOutAt: wire.checkedOutAt ?? null,
    confirmedHours: wire.confirmedHours ?? null,
  };
}

function toApplication(wire: ApplicationWire): VolunteerApplication {
  return {
    applicationId: wire.applicationId,
    opportunityId: wire.opportunityId,
    opportunityTitle: wire.opportunityTitle,
    organizationName: wire.organizationName,
    status: oneOf(wire.status, APPLICATION_STATUSES, 'Pending'),
    answers: wire.answers ?? {},
    submittedAt: wire.submittedAt ?? null,
    decidedAt: wire.decidedAt ?? null,
    decisionReason: wire.decisionReason ?? null,
    waitlistPosition: wire.waitlistPosition ?? null,
    assignment: wire.assignment ? toAssignment(wire.assignment) : null,
  };
}

/** As with the member roll: a resolved name, or the neutral label. Never the id. */
function toApplicant(wire: ApplicantWire): VolunteerApplicant {
  return {
    applicationId: wire.applicationId,
    userId: wire.userId,
    displayName: nameOrNeutral(wire.displayName),
    avatarUrl: null,
    status: oneOf(wire.status, APPLICATION_STATUSES, 'Pending'),
    skills: [],
    submittedAt: wire.submittedAt,
    answers: wire.answers ?? {},
    isVerified: false,
  };
}

function toCertificate(wire: CertificateWire): VolunteerCertificate {
  return {
    certificateId: wire.certificateId,
    title: wire.title,
    organizationName: wire.organizationName,
    hours: wire.hours,
    issuedAt: wire.issuedAt,
    // Null on the wire and null here. The server's own comment: the file is
    // what a later phase adds, and this stays null rather than pointing at
    // something that 404s.
    downloadUrl: wire.downloadUrl ?? null,
  };
}

function toPollOptionResult(wire: PollOptionResultWire): PollOptionResult {
  return {
    optionId: wire.optionId,
    label: wire.label,
    count: wire.count,
    percentage: wire.percentage,
    isMyChoice: wire.isMyChoice ?? undefined,
  };
}

function toPollResult(wire: PollResultWire): PollResult {
  return {
    pollId: wire.pollId,
    status: oneOf(wire.status, POLL_STATUSES, 'Draft'),
    // `?? null` and never `?? []`: a withheld tally must stay absent.
    options: wire.options ? wire.options.map(toPollOptionResult) : null,
    totalResponses: wire.totalResponses,
    openResponses: wire.openResponses ?? null,
    areResultsVisible: wire.areResultsVisible,
    resultsHiddenReason: wire.resultsHiddenReason ?? null,
    computedAt: wire.computedAt,
  };
}

function toPoll(wire: PollWire): CommunityPoll {
  return {
    pollId: wire.pollId,
    question: wire.question,
    description: wire.description ?? null,
    status: oneOf(wire.status, POLL_STATUSES, 'Draft'),
    votingType: oneOf(wire.votingType, POLL_VOTING_TYPES, 'SingleChoice'),
    audience: oneOf(wire.audience, POLL_AUDIENCES, 'Invited'),
    options: wire.options.map((option) => ({
      optionId: option.optionId,
      label: option.label,
      description: option.description ?? null,
      sortOrder: option.sortOrder,
    })),
    maxSelections: wire.maxSelections ?? null,
    isAnonymous: wire.isAnonymous,
    allowsChange: wire.allowsChange,
    organizationId: wire.organizationId ?? null,
    organizationName: wire.organizationName ?? null,
    // B18 does not disclose a poll's author on the read contract. The field is
    // the empty string rather than a guessed identifier.
    createdBy: '',
    opensAt: wire.opensAt ?? null,
    closesAt: wire.closesAt ?? null,
    totalResponses: wire.totalResponses,
    hasVoted: wire.hasVoted,
    myResponse: wire.myResponse
      ? {
          responseId: wire.myResponse.responseId,
          pollId: wire.myResponse.pollId,
          selectedOptionIds: wire.myResponse.selectedOptionIds,
          openResponse: wire.myResponse.openResponse ?? null,
          respondedAt: wire.myResponse.respondedAt,
        }
      : null,
    canVote: wire.canVote,
    cannotVoteReason: wire.cannotVoteReason ?? null,
    canManage: wire.canManage,
    createdAt: wire.createdAt,
  };
}

function toAnnouncement(wire: AnnouncementWire): CommunityAnnouncement {
  return {
    announcementId: wire.announcementId,
    scope: oneOf(wire.scope, ANNOUNCEMENT_SCOPES, 'Community'),
    scopeId: wire.scopeId ?? null,
    scopeName: wire.scopeName,
    title: wire.title,
    body: wire.body,
    // B5 asset identifiers, not URLs — so no URL is claimed. A screen wanting
    // the renditions asks Media for them.
    mediaUrls: [],
    authorName: wire.publishedByUserId,
    authorAvatarUrl: null,
    isPinned: wire.isPinned,
    publishedAt: wire.publishedAt,
    actionRoute: wire.actionRoute ?? null,
  };
}

function toSearchResult(wire: SearchResultWire): CommunitySearchResult {
  return {
    entityType: oneOf(
      wire.entityType,
      ['event', 'series', 'organization', 'membership', 'campaign', 'opportunity', 'poll', 'announcement'] as const,
      'organization'
    ),
    entityId: wire.entityId,
    title: wire.title,
    subtitle: wire.subtitle ?? null,
    imageUrl: null,
    locationLabel: wire.locationLabel ?? null,
    badge: wire.badge ?? null,
    actionRoute: wire.actionRoute,
    // §40's merge is labelled, not hidden. Every row from this route came from
    // a certified contract, so it says so — and a screen mixing this list with
    // a simulated one can still tell the two apart per row.
    source: 'backend',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP — COMMUNITY-LIFE-GAP-001, -002, -003
// ═════════════════════════════════════════════════════════════════════════════

/** `GET /communities/{organizationId}/membership` — MembershipEndpoints.cs:171. */
export async function fetchMembershipProgramme(
  organizationId: string
): Promise<MembershipProgramme> {
  const wire = await read<ProgrammeWire>(
    `${ROOT}/${encodeURIComponent(organizationId)}/membership`
  );
  return toProgramme(wire);
}

/**
 * `GET /communities/{organizationId}/membership/tiers` — MembershipEndpoints.cs:184.
 *
 * A bare `IReadOnlyList<MembershipTierResponse>` rather than a page
 * (`MembershipProgrammeQueries.cs:168`), so it is read as an array and not
 * through `readPage`. Each tier's `requirements[].isMet` is the *caller's*
 * evaluation, made server-side on this read.
 */
export async function fetchMembershipTiers(organizationId: string): Promise<MembershipTier[]> {
  const wire = await read<TierWire[]>(
    `${ROOT}/${encodeURIComponent(organizationId)}/membership/tiers`
  );
  return (wire ?? []).map(toTier);
}

/**
 * `GET /communities/memberships/discover` — MembershipEndpoints.cs:33.
 *
 * Visibility is enforced by **omission**: a `Private` or `InviteOnly`
 * programme is absent from this page for a caller who may not see it, rather
 * than present with a flag. So there is no client-side filter here, and there
 * must not be one.
 */
export function discoverMemberships(
  params: MembershipDiscoveryParams = {}
): Promise<CommunityPage<MembershipProgramme>> {
  return readList<ProgrammeWire>(`${ROOT}/memberships/discover`, {
    query: params.query,
    category: params.category === 'All' ? undefined : params.category,
    countryCode: params.countryCode,
    cityName: params.cityName,
    neighborhoodAreaId: params.neighborhood,
    priceBand: params.priceBand === 'any' ? undefined : params.priceBand,
    eligibleOnly: params.eligibleOnly,
    cursor: params.cursor,
    take: params.take,
  }).then((page) => ({ ...page, items: page.items.map(toProgramme) }));
}

/** `GET /communities/memberships/me` — MembershipEndpoints.cs:67. A bare list. */
export async function fetchMyMemberships(): Promise<CommunityMembership[]> {
  const wire = await read<MembershipWire[]>(`${ROOT}/memberships/me`);
  return (wire ?? []).map(toMembership);
}

/** `GET /communities/memberships/{membershipId}` — MembershipEndpoints.cs:77. */
export async function fetchMembership(membershipId: string): Promise<CommunityMembership> {
  const wire = await read<MembershipWire>(
    `${ROOT}/memberships/${encodeURIComponent(membershipId)}`
  );
  return toMembership(wire);
}

/**
 * `POST /communities/{organizationId}/memberships/applications` — MembershipEndpoints.cs:215.
 *
 * Idempotent on the key, which travels in the header *and* the body. Where the
 * application opens — `Pending`, `Approved` or straight to `Active` — is the
 * programme's policy and never this client's inference.
 */
export async function submitMembershipApplication(request: {
  organizationId: string;
  tierId: string;
  answers: Record<string, string>;
  idempotencyKey?: string;
}): Promise<CommunityMembership> {
  const wire = await write<MembershipWire>(
    'post',
    `${ROOT}/${encodeURIComponent(request.organizationId)}/memberships/applications`,
    {
      tierId: request.tierId,
      answers: request.answers,
      idempotencyKey: request.idempotencyKey,
    },
    { idempotencyKey: request.idempotencyKey }
  );
  return toMembership(wire);
}

/** `POST /communities/memberships/{membershipId}/cancel` — MembershipEndpoints.cs:90. */
export async function cancelMembership(
  membershipId: string,
  reason?: string
): Promise<CommunityMembership> {
  const wire = await write<MembershipWire>(
    'post',
    `${ROOT}/memberships/${encodeURIComponent(membershipId)}/cancel`,
    { reason }
  );
  return toMembership(wire);
}

/** `POST /communities/memberships/{membershipId}/renew` — MembershipEndpoints.cs:108. */
export async function renewMembership(
  membershipId: string,
  idempotencyKey?: string
): Promise<CommunityMembership> {
  const wire = await write<MembershipWire>(
    'post',
    `${ROOT}/memberships/${encodeURIComponent(membershipId)}/renew`,
    { idempotencyKey },
    { idempotencyKey }
  );
  return toMembership(wire);
}

/**
 * `POST /communities/memberships/{membershipId}/payments` — MembershipEndpoints.cs:130.
 *
 * COMMUNITY-LIFE-GAP-003, and the thing it was a gap *for*. The client passes a
 * **real B15 payment intent identifier** and the server reads B15's own record
 * of whether it settled; a request naming an intent that has not settled is
 * refused. Nothing about the amount, the currency or the outcome is taken from
 * this request — see `MembershipSettlement.cs` and
 * `BindMembershipPaymentRequest` (:351).
 *
 * This is not a second money path. No money moves through this call.
 */
export async function attachMembershipPayment(
  membershipId: string,
  paymentIntentId: string
): Promise<CommunityMembership> {
  const wire = await write<MembershipWire>(
    'post',
    `${ROOT}/memberships/${encodeURIComponent(membershipId)}/payments`,
    { paymentIntentId }
  );
  return toMembership(wire);
}

/** `GET /communities/{organizationId}/memberships` — MembershipEndpoints.cs:236. Role-gated. */
export function fetchOrganizationMembers(
  organizationId: string,
  params: { state?: string; cursor?: string; take?: number } = {}
): Promise<CommunityPage<OrganizationMember>> {
  return readList<OrganizationMemberWire>(
    `${ROOT}/${encodeURIComponent(organizationId)}/memberships`,
    params
  ).then((page) => ({ ...page, items: page.items.map(toMember) }));
}

export type MembershipDecision =
  | 'approve'
  | 'reject'
  | 'waitlist'
  | 'suspend'
  | 'reinstate'
  | 'remove';

/**
 * `POST /communities/memberships/{membershipId}/decision` — MembershipEndpoints.cs:150.
 *
 * Role-gated, and it **refuses with 403 rather than filtering**. The screen's
 * hidden button is a convenience; this refusal is the control. The response is
 * the roll's view of the member, not the member's own read.
 */
export async function decideMembership(
  membershipId: string,
  decision: MembershipDecision,
  reason?: string
): Promise<OrganizationMember> {
  const wire = await write<OrganizationMemberWire>(
    'post',
    `${ROOT}/memberships/${encodeURIComponent(membershipId)}/decision`,
    { decision, reason }
  );
  return toMember(wire);
}

// ═════════════════════════════════════════════════════════════════════════════
// VOLUNTEERING — COMMUNITY-LIFE-GAP-009, -010, -011
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

/** `GET /communities/volunteer/opportunities` — VolunteerEndpoints.cs:33. */
export function fetchOpportunities(
  params: OpportunityQueryParams = {}
): Promise<CommunityPage<VolunteerOpportunity>> {
  return readList<OpportunityWire>(`${ROOT}/volunteer/opportunities`, params).then((page) => ({
    ...page,
    items: page.items.map(toOpportunity),
  }));
}

/** `GET /communities/volunteer/opportunities/{opportunityId}` — VolunteerEndpoints.cs:86. */
export async function fetchOpportunity(opportunityId: string): Promise<VolunteerOpportunity> {
  const wire = await read<OpportunityWire>(
    `${ROOT}/volunteer/opportunities/${encodeURIComponent(opportunityId)}`
  );
  return toOpportunity(wire);
}

/**
 * `POST /communities/volunteer/opportunities` — VolunteerEndpoints.cs:69.
 *
 * `SaveVolunteerOpportunityRequest` (:182) takes shift start and end as full
 * instants, so the client's `date` + `startTime` pair is joined here rather
 * than at every call site.
 */
export async function createOpportunity(request: {
  title: string;
  description: string;
  cause: string;
  organizationId: string;
  cityName: string;
  areaName: string;
  addressLine: string;
  countryCode?: string;
  startDate?: string;
  endDate?: string;
  requiredSkills: string[];
  minimumAge?: number;
  capacity?: number;
  applicationDeadline?: string;
  shifts: { label: string; date: string; startTime: string; endTime: string; capacity: number }[];
  publish: boolean;
  idempotencyKey?: string;
}): Promise<VolunteerOpportunity> {
  const wire = await write<OpportunityWire>(
    'post',
    `${ROOT}/volunteer/opportunities`,
    toOpportunityBody(request),
    { idempotencyKey: request.idempotencyKey }
  );
  return toOpportunity(wire);
}

/** `PUT /communities/volunteer/opportunities/{opportunityId}` — VolunteerEndpoints.cs:99. */
export async function updateOpportunity(
  opportunityId: string,
  request: Parameters<typeof createOpportunity>[0]
): Promise<VolunteerOpportunity> {
  const wire = await write<OpportunityWire>(
    'put',
    `${ROOT}/volunteer/opportunities/${encodeURIComponent(opportunityId)}`,
    toOpportunityBody(request)
  );
  return toOpportunity(wire);
}

function toOpportunityBody(request: Parameters<typeof createOpportunity>[0]) {
  return {
    organizationId: request.organizationId,
    title: request.title,
    description: request.description,
    cause: request.cause,
    countryCode: request.countryCode,
    cityName: request.cityName,
    areaName: request.areaName,
    addressLine: request.addressLine,
    startsAt: request.startDate,
    endsAt: request.endDate,
    applicationDeadline: request.applicationDeadline,
    minimumAge: request.minimumAge,
    capacity: request.capacity,
    requiredSkills: request.requiredSkills,
    shifts: request.shifts.map((shift) => ({
      label: shift.label,
      startsAt: `${shift.date}T${shift.startTime}:00`,
      endsAt: `${shift.date}T${shift.endTime}:00`,
      capacity: shift.capacity,
    })),
    publish: request.publish,
    idempotencyKey: request.idempotencyKey,
  };
}

export type OpportunityAction = 'publish' | 'close' | 'complete' | 'cancel';

/** `POST /communities/volunteer/opportunities/{id}/{action}` — VolunteerEndpoints.cs:117. */
export async function actOnOpportunity(
  opportunityId: string,
  action: OpportunityAction
): Promise<VolunteerOpportunity> {
  const wire = await write<OpportunityWire>(
    'post',
    `${ROOT}/volunteer/opportunities/${encodeURIComponent(opportunityId)}/${action}`
  );
  return toOpportunity(wire);
}

/** `GET /communities/volunteer/shifts?opportunityId=…` — VolunteerEndpoints.cs:135. */
export async function fetchShifts(opportunityId: string): Promise<VolunteerShift[]> {
  const wire = await read<ShiftWire[]>(`${ROOT}/volunteer/shifts`, { opportunityId });
  return (wire ?? []).map(toShift);
}

/**
 * `POST /communities/volunteer/opportunities/{id}/applications` — VolunteerEndpoints.cs:161.
 *
 * A full opportunity **waitlists** rather than refusing, which is the server's
 * decision and the reason `Waitlisted` is a pending state rather than a
 * terminal one.
 */
export async function submitVolunteerApplication(request: {
  opportunityId: string;
  shiftId?: string;
  answers: Record<string, string>;
  idempotencyKey?: string;
}): Promise<VolunteerApplication> {
  const wire = await write<ApplicationWire>(
    'post',
    `${ROOT}/volunteer/opportunities/${encodeURIComponent(request.opportunityId)}/applications`,
    {
      shiftId: request.shiftId,
      answers: request.answers,
      idempotencyKey: request.idempotencyKey,
    },
    { idempotencyKey: request.idempotencyKey }
  );
  return toApplication(wire);
}

/** `GET /communities/volunteer/applications/me` — VolunteerEndpoints.cs:151. A bare list. */
export async function fetchMyVolunteerApplications(): Promise<VolunteerApplication[]> {
  const wire = await read<ApplicationWire[]>(`${ROOT}/volunteer/applications/me`);
  return (wire ?? []).map(toApplication);
}

/** `GET /communities/volunteer/opportunities/{id}/applications` — VolunteerEndpoints.cs:180. */
export function fetchApplicants(
  opportunityId: string,
  params: { state?: string; cursor?: string; take?: number } = {}
): Promise<CommunityPage<VolunteerApplicant>> {
  return readList<ApplicantWire>(
    `${ROOT}/volunteer/opportunities/${encodeURIComponent(opportunityId)}/applications`,
    params
  ).then((page) => ({ ...page, items: page.items.map(toApplicant) }));
}

/** `POST /communities/volunteer/applications/{id}/withdraw` — VolunteerEndpoints.cs:202. */
export async function withdrawVolunteerApplication(
  applicationId: string
): Promise<VolunteerApplication> {
  const wire = await write<ApplicationWire>(
    'post',
    `${ROOT}/volunteer/applications/${encodeURIComponent(applicationId)}/withdraw`
  );
  return toApplication(wire);
}

export type VolunteerDecision = 'approve' | 'reject' | 'waitlist';

/** `POST /communities/volunteer/applications/{id}/decision` — VolunteerEndpoints.cs:215. */
export async function decideVolunteerApplication(
  applicationId: string,
  decision: VolunteerDecision,
  reason?: string
): Promise<VolunteerApplicant> {
  const wire = await write<ApplicantWire>(
    'post',
    `${ROOT}/volunteer/applications/${encodeURIComponent(applicationId)}/decision`,
    { decision, reason }
  );
  return toApplicant(wire);
}

/**
 * `POST /communities/volunteer/assignments` — VolunteerEndpoints.cs:246.
 *
 * 409 for an unapproved applicant. The client does not pre-check that; the
 * refusal is the control.
 */
export async function assignVolunteer(request: {
  applicationId: string;
  shiftId?: string;
}): Promise<VolunteerAssignment> {
  const wire = await write<AssignmentWire>('post', `${ROOT}/volunteer/assignments`, request);
  return toAssignment(wire);
}

/** `GET /communities/volunteer/assignments/me` — VolunteerEndpoints.cs:236. A bare list. */
export async function fetchMyAssignments(): Promise<VolunteerAssignment[]> {
  const wire = await read<AssignmentWire[]>(`${ROOT}/volunteer/assignments/me`);
  return (wire ?? []).map(toAssignment);
}

/**
 * `POST /communities/volunteer/assignments/{id}/{direction}` — VolunteerEndpoints.cs:278.
 *
 * Mapped *after* `/hours`, so `check-in` and `check-out` do not swallow it.
 * A check records the moment and proves nothing on its own — the hours are
 * still the organizer's to confirm.
 */
export async function checkVolunteer(
  assignmentId: string,
  direction: 'check-in' | 'check-out'
): Promise<VolunteerAssignment> {
  const wire = await write<AssignmentWire>(
    'post',
    `${ROOT}/volunteer/assignments/${encodeURIComponent(assignmentId)}/${direction}`
  );
  return toAssignment(wire);
}

/**
 * `POST /communities/volunteer/assignments/{id}/hours` — VolunteerEndpoints.cs:259.
 *
 * The organizer confirms; the certificate follows from the confirmation. §34:
 * a self-reported hour is not an hour, and there is no route that would accept
 * one.
 */
export async function confirmVolunteerHours(
  assignmentId: string,
  hours: number
): Promise<VolunteerAssignment> {
  const wire = await write<AssignmentWire>(
    'post',
    `${ROOT}/volunteer/assignments/${encodeURIComponent(assignmentId)}/hours`,
    { hours }
  );
  return toAssignment(wire);
}

/**
 * `GET /communities/volunteer/hours/me` — VolunteerEndpoints.cs:296.
 *
 * Marked `backed` throughout, because every figure on it now is. `skills` is
 * empty rather than derived: B18 does not carry a volunteer skill profile, and
 * assembling one from the applications would be the client inventing a summary.
 */
export async function fetchVolunteerHours(): Promise<VolunteerHoursSummary> {
  const wire = await read<HoursWire>(`${ROOT}/volunteer/hours/me`);
  return {
    confirmedHours: backed(wire.confirmedHours),
    completedOpportunities: backed(wire.completedAssignments),
    organizationsSupported: backed(wire.organizationsSupported),
    skills: [],
    certificates: (wire.certificates ?? []).map(toCertificate),
  };
}

/** `GET /communities/volunteer/certificates/me` — VolunteerEndpoints.cs:306. A bare list. */
export async function fetchMyCertificates(): Promise<VolunteerCertificate[]> {
  const wire = await read<CertificateWire[]>(`${ROOT}/volunteer/certificates/me`);
  return (wire ?? []).map(toCertificate);
}

// ═════════════════════════════════════════════════════════════════════════════
// POLLS — COMMUNITY-LIFE-GAP-012
// ═════════════════════════════════════════════════════════════════════════════

export interface PollQueryParams {
  organizationId?: string;
  audience?: string;
  state?: string;
  query?: string;
  cursor?: string;
  take?: number;
}

/** `GET /communities/polls` — PollAndAnnouncementEndpoints.cs:22. Audience applied in the query. */
export function fetchPolls(params: PollQueryParams = {}): Promise<CommunityPage<CommunityPoll>> {
  return readList<PollWire>(`${ROOT}/polls`, params).then((page) => ({
    ...page,
    items: page.items.map(toPoll),
  }));
}

/** `GET /communities/polls/{pollId}` — PollAndAnnouncementEndpoints.cs:65. 403 outside the audience. */
export async function fetchPoll(pollId: string): Promise<CommunityPoll> {
  const wire = await read<PollWire>(`${ROOT}/polls/${encodeURIComponent(pollId)}`);
  return toPoll(wire);
}

/**
 * `GET /communities/polls/{pollId}/results` — PollAndAnnouncementEndpoints.cs:76.
 *
 * The tally is computed in the database. Nothing on this client adds up a vote,
 * and `CommunityPollResponse.options` deliberately carries no count so nothing
 * could.
 */
export async function fetchPollResult(pollId: string): Promise<PollResult> {
  const wire = await read<PollResultWire>(`${ROOT}/polls/${encodeURIComponent(pollId)}/results`);
  return toPollResult(wire);
}

/**
 * `POST /communities/polls/{pollId}/responses` — PollAndAnnouncementEndpoints.cs:88.
 *
 * Answers with the **result**, not the vote — so a screen showing a tally after
 * voting is showing the server's, never one it patched locally.
 */
export async function submitPollResponse(request: {
  pollId: string;
  selectedOptionIds: string[];
  openResponse?: string;
  idempotencyKey?: string;
}): Promise<PollResult> {
  const wire = await write<PollResultWire>(
    'post',
    `${ROOT}/polls/${encodeURIComponent(request.pollId)}/responses`,
    {
      selectedOptionIds: request.selectedOptionIds,
      openResponse: request.openResponse,
      idempotencyKey: request.idempotencyKey,
    },
    { idempotencyKey: request.idempotencyKey }
  );
  return toPollResult(wire);
}

/** `POST /communities/polls` — PollAndAnnouncementEndpoints.cs:48. Role-gated on an org poll. */
export async function createPoll(request: {
  question: string;
  description?: string;
  votingType: PollVotingType;
  options: { label: string; description?: string }[];
  maxSelections?: number;
  audience: PollAudience;
  organizationId?: string;
  isAnonymous: boolean;
  allowsChange: boolean;
  opensAt?: string;
  closesAt?: string;
  publish: boolean;
  idempotencyKey?: string;
}): Promise<CommunityPoll> {
  const wire = await write<PollWire>('post', `${ROOT}/polls`, request, {
    idempotencyKey: request.idempotencyKey,
  });
  return toPoll(wire);
}

export type PollAction = 'publish' | 'close' | 'cancel' | 'publish-results';

/** `POST /communities/polls/{pollId}/{action}` — PollAndAnnouncementEndpoints.cs:108. */
export async function actOnPoll(pollId: string, action: PollAction): Promise<CommunityPoll> {
  const wire = await write<PollWire>(
    'post',
    `${ROOT}/polls/${encodeURIComponent(pollId)}/${action}`
  );
  return toPoll(wire);
}

// ═════════════════════════════════════════════════════════════════════════════
// ORGANIZATIONS — COMMUNITY-LIFE-GAP-013
// ═════════════════════════════════════════════════════════════════════════════

export interface MyProgrammeOrganization {
  organizationId: string;
  name: string;
  role: OrganizationRole;
  /** B12's membership row — what the role-change route names. */
  membershipId: string;
  isVerified: boolean;
  capabilities: OrganizationCapabilities;
}

/** `GET /communities/organizations/me` — OrganizationEndpoints.cs:282. A bare list. */
export async function fetchMyOrganizations(): Promise<MyProgrammeOrganization[]> {
  const wire = await read<MyOrganizationWire[]>(`${ROOT}/organizations/me`);
  return (wire ?? []).map((row) => ({
    organizationId: row.organizationId,
    name: row.name,
    role: oneOf(row.role, ORG_ROLES, 'Member'),
    membershipId: row.membershipId,
    isVerified: row.isVerified,
    capabilities: toCapabilities(row.capabilities),
  }));
}

/**
 * `GET /communities/organizations/{organizationId}/capabilities` — OrganizationEndpoints.cs:292.
 *
 * **Served as data, and fetched rather than computed.** §19: the frontend makes
 * no authoritative authorization decision, and every gated route re-decides
 * this independently on each request.
 */
export async function fetchOrganizationCapabilities(
  organizationId: string
): Promise<OrganizationCapabilities> {
  const wire = await read<CapabilitiesWire>(
    `${ROOT}/organizations/${encodeURIComponent(organizationId)}/capabilities`
  );
  return toCapabilities(wire);
}

export interface ProgrammeDashboard {
  organizationId: string;
  organizationName: string;
  capabilities: OrganizationCapabilities;
  counts: DashboardCountsWire;
  computedAt: string;
}

/** `GET /communities/organizations/{organizationId}/dashboard` — OrganizationEndpoints.cs:305. */
export async function fetchOrganizationDashboard(
  organizationId: string
): Promise<ProgrammeDashboard> {
  const wire = await read<DashboardWire>(
    `${ROOT}/organizations/${encodeURIComponent(organizationId)}/dashboard`
  );
  return {
    organizationId: wire.organizationId,
    organizationName: wire.organizationName,
    capabilities: toCapabilities(wire.capabilities),
    counts: wire.counts,
    computedAt: wire.computedAt,
  };
}

/**
 * `POST /communities/organizations/{organizationId}/members/{userId}/role`
 * — OrganizationEndpoints.cs:318.
 *
 * The route is B18's because it owns the prefix; the write is B12's, dispatched
 * as B12's own command. Answers the caller's capability set for the
 * organization, so a screen re-renders from the server's answer rather than
 * from what it just asked for.
 */
export async function assignOrganizationRole(
  organizationId: string,
  userId: string,
  role: OrganizationRole
): Promise<OrganizationCapabilities> {
  const wire = await write<CapabilitiesWire>(
    'post',
    `${ROOT}/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}/role`,
    { role }
  );
  return toCapabilities(wire);
}

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS, IMPACT, ANNOUNCEMENTS, SEARCH — GAP-014, -016, -017, -021
// ═════════════════════════════════════════════════════════════════════════════

export interface ProgrammeAnalytics {
  organizationId: string;
  period: string;
  memberGrowth: TimeSeriesPoint[];
  volunteerHours: TimeSeriesPoint[];
  pollParticipation: TimeSeriesPoint[];
  computedAt: string;
}

/**
 * `GET /communities/organizations/{organizationId}/analytics` — PollAndAnnouncementEndpoints.cs:183.
 *
 * **Three series, and only three.** The client's `OrganizationAnalytics` also
 * declares `eventAttendance` and `donationTotals`; B18 serves neither, and the
 * hook that assembles the screen keeps those two on their own arm rather than
 * this one filling them with zeroes. A zero series renders as "nobody came",
 * which is a different and false statement.
 */
export async function fetchOrganizationAnalytics(
  organizationId: string,
  period: string
): Promise<ProgrammeAnalytics> {
  const wire = await read<AnalyticsWire>(
    `${ROOT}/organizations/${encodeURIComponent(organizationId)}/analytics`,
    { period }
  );
  return {
    organizationId: wire.organizationId,
    period: wire.period,
    memberGrowth: wire.memberGrowth ?? [],
    volunteerHours: wire.volunteerHours ?? [],
    pollParticipation: wire.pollParticipation ?? [],
    computedAt: wire.computedAt,
  };
}

/** `GET /communities/organizations/{organizationId}/analytics/members` — :201. */
export function fetchMemberAnalytics(
  organizationId: string,
  period: string
): Promise<MemberAnalytics> {
  return read<MemberAnalytics>(
    `${ROOT}/organizations/${encodeURIComponent(organizationId)}/analytics/members`,
    { period }
  );
}

/**
 * `GET /communities/impact` — PollAndAnnouncementEndpoints.cs:219.
 *
 * Every metric carries its own `definition` and `source`. The client renders
 * both beside the figure — "an undefined metric is worse than an absent one" —
 * rather than reducing the list to a fixed set of named fields, which would
 * throw away the definition the server took care to send.
 */
export function fetchCommunityImpact(params: {
  scope?: string;
  scopeId?: string;
  period?: string;
}): Promise<ProgrammeImpact> {
  return read<ProgrammeImpact>(`${ROOT}/impact`, params);
}

/**
 * `GET /communities/announcements` — PollAndAnnouncementEndpoints.cs:131.
 *
 * The audience rule is applied *in the query*, so this page is already what the
 * caller may see and there is no client-side filter.
 *
 * **This is not the release-notes changelog.** That surface reads a different
 * route entirely and is deliberately not rewired onto this one.
 */
export function fetchAnnouncements(params: {
  scope?: string;
  scopeId?: string;
  countryCode?: string;
  query?: string;
  cursor?: string;
  take?: number;
} = {}): Promise<CommunityPage<CommunityAnnouncement>> {
  return readList<AnnouncementWire>(`${ROOT}/announcements`, params).then((page) => ({
    ...page,
    items: page.items.map(toAnnouncement),
  }));
}

/** `POST /communities/announcements` — PollAndAnnouncementEndpoints.cs:157. Role-gated. */
export async function publishAnnouncement(request: {
  scope: AnnouncementScope;
  scopeId?: string;
  title: string;
  body: string;
  mediaIds?: string[];
  countryCode?: string;
  isPinned?: boolean;
  idempotencyKey?: string;
}): Promise<CommunityAnnouncement> {
  const wire = await write<AnnouncementWire>('post', `${ROOT}/announcements`, request, {
    idempotencyKey: request.idempotencyKey,
  });
  return toAnnouncement(wire);
}

/**
 * `GET /communities/search` — PollAndAnnouncementEndpoints.cs:239.
 *
 * `q` and `types` are bound under those names (`[FromQuery(Name = "q")]`), not
 * `query` and `type`. One ordered list, ordered by the server's `relevance`;
 * the client re-orders nothing and concatenates nothing.
 */
export function searchCommunityProgramme(params: {
  query?: string;
  types?: string[];
  countryCode?: string;
  cityName?: string;
  organizationId?: string;
  cause?: string;
  priceBand?: string;
  take?: number;
}): Promise<CommunityPage<CommunitySearchResult>> {
  return readList<SearchResultWire>(`${ROOT}/search`, {
    q: params.query,
    types: params.types,
    countryCode: params.countryCode,
    cityName: params.cityName,
    organizationId: params.organizationId,
    cause: params.cause,
    priceBand: params.priceBand,
    take: params.take,
  }).then((page) => ({ ...page, items: page.items.map(toSearchResult) }));
}

// ═════════════════════════════════════════════════════════════════════════════
// EVENT SERIES — COMMUNITY-LIFE-GAP-004
//
// **B12's routes, under `/community-life`.** They are called from this file
// because the series screens are Phase 12's and their repository arm lives
// beside the rest of that phase's — but the module, the aggregate and every
// decision behind them is Community Life's, and the prefix says so.
// ═════════════════════════════════════════════════════════════════════════════

/** `RecurrenceRuleResponse` — CommunityLife/…/RecurrenceRuleResponse.cs. */
interface RecurrenceWire {
  frequency: string;
  interval: number;
  byWeekday: number[];
  byMonthDay: number[];
  endKind: string;
  until?: string | null;
  count?: number | null;
  exceptions: string[];
  description: string;
}

/** `LocationResponse`. Carries no address line and no coordinates. */
interface CommunityLifeLocationWire {
  countryCode: string;
  regionName?: string | null;
  cityName?: string | null;
  neighborhoodName?: string | null;
  neighborhoodAreaId?: string | null;
  displayName: string;
}

/** `EventVenueResponse`. */
interface VenueWire {
  name?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  landmark?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  onlineUrl?: string | null;
}

/** `EventCapacityResponse`. */
interface CapacityWire {
  maximum?: number | null;
  goingCount: number;
  interestedCount: number;
  waitlistCount: number;
  checkedInCount?: number | null;
  remainingPlaces?: number | null;
  isFull: boolean;
}

/** `EventOccurrenceResponse`. `occurrenceId` is also the event identifier. */
interface OccurrenceWire {
  occurrenceId: string;
  seriesId: string;
  sequence: number;
  title: string;
  slug: string;
  startsAt: string;
  endsAt: string;
  timeZoneId: string;
  localDate: string;
  status: string;
  eventStatus: string;
  originalStartsAt?: string | null;
  cancellationReason?: string | null;
  location: CommunityLifeLocationWire;
  venueName?: string | null;
  capacity: CapacityWire;
  viewerRsvpStatus?: string | null;
  isNext: boolean;
  revision: number;
}

/** `EventSeriesResponse`. */
interface SeriesWire {
  seriesId: string;
  title: string;
  slug: string;
  summary: string;
  description?: string | null;
  categoryKey: string;
  categoryName?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizerUserId: string;
  hostName?: string | null;
  isOrganizerVerified: boolean;
  recurrence: RecurrenceWire;
  startDate: string;
  startTime: string;
  durationMinutes: number;
  timeZoneId: string;
  attendanceMode: string;
  location: CommunityLifeLocationWire;
  venue: VenueWire;
  capacity?: number | null;
  status: string;
  visibility: string;
  nextOccurrence?: OccurrenceWire | null;
  occurrenceCount: number;
  completedCount: number;
  cancelledOccurrenceCount: number;
  materialisedThrough?: string | null;
  cancellationReason?: string | null;
  revision: number;
  publishedAt?: string | null;
  createdAt: string;
}

/**
 * The client's `EventCategory` union → B12's event-category catalogue key.
 *
 * **The two vocabularies do not correspond, and this table is the record of
 * that.** The client declares twenty-eight display categories ("Naming
 * Ceremony", "Football Match", "Independence Celebration"); B12's
 * `DefaultEventCategoryContributor` seeds sixteen lower-kebab keys
 * ("naming-ceremony", "sports", "cultural-celebration"). Neither is derivable
 * from the other by casing: several client categories collapse onto one key,
 * and several keys have no client category at all.
 *
 * So the mapping is written out rather than computed, from both sides' source,
 * with `'other'` as the fallback — which is a real catalogue key and not a
 * sentinel. A guessed slug would be rejected by the server at create time,
 * which is the failure mode this table exists to prevent.
 *
 * Note this divergence is **not confined to series**: `community-life-api.ts`'s
 * `createEvent` sends the display name as `category` on single events too. That
 * is a pre-existing divergence on B12's event contract and is out of this
 * wave's scope; it is recorded here so the next reader finds it.
 */
const EVENT_CATEGORY_KEYS: Record<string, string> = {
  Wedding: 'wedding',
  'Naming Ceremony': 'naming-ceremony',
  Birthday: 'cultural-celebration',
  Graduation: 'student-event',
  'Football Match': 'sports',
  Basketball: 'sports',
  Concert: 'cultural-celebration',
  'Comedy Show': 'cultural-celebration',
  Networking: 'networking',
  'Career Fair': 'career-fair',
  'Job Fair': 'career-fair',
  'Business Seminar': 'workshop',
  Conference: 'workshop',
  Training: 'workshop',
  Workshop: 'workshop',
  'Church Program': 'worship-service',
  'Mosque Event': 'worship-service',
  'Bible Study': 'worship-service',
  'Prayer Meeting': 'worship-service',
  'Youth Program': 'community-meeting',
  'Cultural Festival': 'cultural-celebration',
  'Independence Celebration': 'cultural-celebration',
  'Food Festival': 'market',
  Picnic: 'community-meeting',
  'Volunteer Activity': 'volunteering',
  'Charity Event': 'fundraiser',
  'Embassy Event': 'community-meeting',
  'Student Orientation': 'student-event',
  Other: 'other',
};

/** The catalogue key a client category means. `'other'` when there is none. */
export function toEventCategoryKey(category: string): string {
  return EVENT_CATEGORY_KEYS[category] ?? 'other';
}

/**
 * The reverse: a catalogue key back to a client display category.
 *
 * Lossy, and it has to be — `sports` came from either `Football Match` or
 * `Basketball` and the key does not remember which. The first client category
 * that maps to the key wins, deterministically, and anything unrecognised
 * becomes `Other` rather than being cast through the union.
 */
function toEventCategory(categoryKey: string): EventCategory {
  for (const [category, key] of Object.entries(EVENT_CATEGORY_KEYS)) {
    if (key === categoryKey) return category as EventCategory;
  }
  return 'Other';
}

const SERIES_STATUSES = ['Draft', 'Published', 'Paused', 'Completed', 'Cancelled'] as const;
const OCCURRENCE_STATUSES = ['Scheduled', 'Rescheduled', 'Cancelled', 'Completed'] as const;
const RECURRENCE_FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Yearly', 'Custom'] as const;
const RECURRENCE_END_KINDS = ['Never', 'OnDate', 'AfterCount'] as const;
const REGISTRATION_STATUSES = [
  'NotRegistered', 'Registered', 'Waitlisted', 'CheckedIn', 'Attended', 'NoShow', 'Cancelled',
] as const;

function toEventLocation(
  location: CommunityLifeLocationWire,
  venue?: VenueWire | null
): EventLocation {
  return {
    cityName: location.cityName ?? '',
    areaName: location.neighborhoodName ?? location.regionName ?? '',
    addressLine: venue?.addressLine1 ?? location.displayName,
    landmark: venue?.landmark ?? undefined,
    latitude: venue?.latitude ?? undefined,
    longitude: venue?.longitude ?? undefined,
  };
}

function toOccurrence(wire: OccurrenceWire) {
  // **In the occurrence's own zone, not UTC and not the reader's.**
  //
  // `splitInstant` slices the ISO string, so it returns the *UTC* wall clock.
  // A clinic set for 18:00 in Port Louis is stored as 14:00Z and was shown as
  // "Sep 17, 2026 at 14:00" — four hours out, on the very screen the timezone
  // control exists to get right. Worse, `date` came from the server's own
  // `localDate` while `time` came from the UTC slice, so near midnight the two
  // halves of one row disagreed with each other.
  //
  // The zone is on the wire and was already being carried through unused.
  const zone = wire.timeZoneId ?? 'UTC';
  const start = partsInZone(wire.startsAt, zone) ?? splitInstant(wire.startsAt);
  const end = partsInZone(wire.endsAt, zone) ?? splitInstant(wire.endsAt);
  return {
    occurrenceId: wire.occurrenceId,
    seriesId: wire.seriesId,
    title: wire.title,
    date: wire.localDate,
    time: start.time,
    endTime: end.time,
    timezone: wire.timeZoneId,
    location: toEventLocation(wire.location),
    status: oneOf(wire.status, OCCURRENCE_STATUSES, 'Scheduled'),
    // "Moved from …" — the same zone question, and a date this time, so a 23:00
    // occurrence read in UTC would name the wrong day outright.
    originalDate: wire.originalStartsAt
      ? (partsInZone(wire.originalStartsAt, zone) ?? splitInstant(wire.originalStartsAt)).date
      : null,
    cancellationReason: wire.cancellationReason ?? null,
    capacity: wire.capacity.maximum ?? null,
    registeredCount: wire.capacity.goingCount,
    isFull: wire.capacity.isFull,
    myRegistration: oneOf(wire.viewerRsvpStatus, REGISTRATION_STATUSES, 'NotRegistered'),
    isNext: wire.isNext,
  };
}

function toSeries(wire: SeriesWire) {
  return {
    seriesId: wire.seriesId,
    title: wire.title,
    description: wire.description ?? wire.summary,
    // B12 attaches media as B5 assets rather than inlining a URL on the series.
    coverImage: '',
    // B12's catalogue key, translated back through the table above. The
    // catalogue's own `categoryName` is *not* used: it is B12's label
    // ("Funeral or memorial") and is not a member of the client's union, so
    // rendering it would put a value into the model that no `switch` handles.
    category: toEventCategory(wire.categoryKey),
    status: oneOf(wire.status, SERIES_STATUSES, 'Draft'),
    recurrence: {
      frequency: oneOf(wire.recurrence.frequency, RECURRENCE_FREQUENCIES, 'Custom'),
      interval: wire.recurrence.interval,
      // ISO-8601 weekday numbering on both sides, 1 = Monday. Filtered rather
      // than cast, so a value outside 1–7 is dropped instead of entering the
      // model as a `Weekday` that no renderer can place.
      byWeekday: (wire.recurrence.byWeekday ?? []).filter(
        (day): day is Weekday => day >= 1 && day <= 7
      ),
      byMonthDay: wire.recurrence.byMonthDay ?? null,
      endKind: oneOf(wire.recurrence.endKind, RECURRENCE_END_KINDS, 'Never'),
      until: wire.recurrence.until ?? null,
      count: wire.recurrence.count ?? null,
      exceptions: wire.recurrence.exceptions ?? [],
      // The server's own sentence, shown in preference to one composed here.
      description: wire.recurrence.description,
    },
    location: toEventLocation(wire.location, wire.venue),
    timezone: wire.timeZoneId,
    price: null,
    organizerId: wire.organizationId ?? wire.organizerUserId,
    organizerName: wire.organizationName ?? wire.hostName ?? '',
    organizerType: wire.organizationId ? ('Organization' as const) : ('User' as const),
    organizerIsVerified: wire.isOrganizerVerified,
    organizationId: wire.organizationId ?? null,
    nextOccurrence: wire.nextOccurrence ? toOccurrence(wire.nextOccurrence) : null,
    occurrenceCount: wire.occurrenceCount,
    completedCount: wire.completedCount,
    // B12 does not report the caller's attendance across a series. Zero would
    // be a claim; this is the honest floor until a contract carries it.
    myAttendedCount: 0,
    isSaved: false,
    createdAt: wire.createdAt,
  };
}

export interface SeriesQueryParams {
  query?: string;
  categoryKey?: string;
  organizationId?: string;
  countryCode?: string;
  cityName?: string;
  /**
   * `Draft`, `Published`, `Paused`, `Cancelled`, `Completed`.
   *
   * The list screen has always sent this and it was never declared here.
   * TypeScript let it through because the screen passes a `useMemo` variable
   * rather than an object literal, and excess property checking does not fire
   * on a variable — so the one place that would have caught the omission was
   * structurally unable to.
   */
  status?: string;
  /**
   * Whether to answer with the caller's own series rather than the public ones.
   *
   * **Without this a member cannot see their own drafts at all.** The handler
   * sets `IncludeNonPublic = MineOnly`, and resolves "mine" from the token
   * rather than the query string, so an unauthenticated or unflagged call gets
   * published series only. The list screen offered Drafts and Paused filters
   * over a listing that could never contain either.
   */
  mine?: boolean;
  cursor?: string;
  limit?: number;
}

/** `GET /community-life/events/series` — B12 EventSeriesEndpoints.cs:40. Anonymous. */
export function fetchSeriesList(params: SeriesQueryParams = {}) {
  return readList<SeriesWire>(`${COMMUNITY_LIFE_ROOT}/events/series`, params).then((page) => ({
    ...page,
    items: page.items.map(toSeries),
  }));
}

/** `GET /community-life/events/series/{idOrSlug}` — B12 EventSeriesEndpoints.cs:52. */
export async function fetchSeries(seriesId: string) {
  const wire = await read<SeriesWire>(
    `${COMMUNITY_LIFE_ROOT}/events/series/${encodeURIComponent(seriesId)}`
  );
  return toSeries(wire);
}

/** `GET /community-life/events/series/{seriesId}/occurrences` — B12 :68. */
export function fetchOccurrences(
  seriesId: string,
  params: { from?: string; to?: string; includePast?: boolean; cursor?: string; limit?: number } = {}
) {
  return readList<OccurrenceWire>(
    `${COMMUNITY_LIFE_ROOT}/events/series/${encodeURIComponent(seriesId)}/occurrences`,
    params
  ).then((page) => ({ ...page, items: page.items.map(toOccurrence) }));
}

/** `GET /community-life/events/occurrences/{occurrenceId}` — B12 :165. */
export async function fetchOccurrence(occurrenceId: string) {
  const wire = await read<OccurrenceWire>(
    `${COMMUNITY_LIFE_ROOT}/events/occurrences/${encodeURIComponent(occurrenceId)}`
  );
  return toOccurrence(wire);
}

/**
 * `POST /community-life/events/series` — B12 EventSeriesEndpoints.cs:98.
 *
 * B12 takes a start **date** and a start **time** and a duration in minutes —
 * minutes rather than an end time so an event may cross midnight without its
 * end appearing to precede its start. The client's editor holds an end time, so
 * the conversion happens here, once.
 */
function coordinatesPair(place: {
  latitude?: number | null;
  longitude?: number | null;
}): { latitude?: number; longitude?: number } {
  const pin = coordinatesOf(place);
  return pin.latitude === null || pin.longitude === null
    ? {}
    : { latitude: pin.latitude, longitude: pin.longitude };
}

export async function createEventSeries(request: CreateEventSeriesRequest) {
  const wire = await write<SeriesWire>(
    'post',
    `${COMMUNITY_LIFE_ROOT}/events/series`,
    {
      title: request.title,
      // B12 requires a short `summary` and takes `description` separately. The
      // Phase 12 editor collects one body, so the summary is its opening — a
      // truncation, not an invention.
      summary: request.description.slice(0, 280),
      description: request.description,
      categoryKey: toEventCategoryKey(request.category),
      organizationId: request.organizationId,
      startDate: request.startDate,
      startTime: request.time,
      // Minutes rather than an end time, which is B12's choice and a good one:
      // an event may cross midnight without its end appearing to precede its
      // start.
      durationMinutes: minutesBetween(request.time, request.endTime),
      timeZoneId: request.timezone,
      recurrence: toRecurrenceBody(request.recurrence),
      // B12 requires a country and the editor collects a city. Sent empty
      // rather than inferred from the city name — a wrong country code is worse
      // than a validation failure the member can see and fix.
      countryCode: request.countryCode ?? '',
      cityName: request.cityName,
      neighborhoodName: request.neighborhood ?? request.areaName,
      addressLine1: request.addressLine,
      landmark: request.landmark,
      // `CreateEventSeriesRequest` takes the address and the pin in `venue`
      // (`EventVenueRequest`); the series is filed by the pin (14 Oct 2026).
      venue: {
        addressLine1: request.addressLine || undefined,
        landmark: request.landmark || undefined,
        ...coordinatesPair(request),
      },
      capacity: request.capacity,
      publish: request.publish,
    },
    { idempotencyKey: request.idempotencyKey }
  );
  return toSeries(wire);
}

/**
 * The recurrence rule, in B12's request vocabulary.
 *
 * The two models are the same RFC 5545 shape by design, so this is a rename
 * rather than a translation — but `byMonthDay` and `exceptions` are non-null
 * arrays on the request where the client model allows null, and sending `null`
 * where B12 binds a list is a 400 rather than an omission.
 */
function toRecurrenceBody(rule: CreateEventSeriesRequest['recurrence']) {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    byWeekday: rule.byWeekday,
    byMonthDay: rule.byMonthDay ?? [],
    endKind: rule.endKind,
    until: rule.until,
    count: rule.count,
    exceptions: rule.exceptions ?? [],
  };
}

/** Wall-clock difference in minutes, wrapping past midnight rather than going negative. */
function minutesBetween(start: string, end: string): number {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    return (hours ?? 0) * 60 + (minutes ?? 0);
  };
  const delta = toMinutes(end) - toMinutes(start);
  return delta > 0 ? delta : delta + 24 * 60;
}

/**
 * `PUT /community-life/events/series/{seriesId}` — B12 EventSeriesEndpoints.cs:110.
 *
 * `scope` is required and is the server's to resolve: `ThisOccurrence`,
 * `ThisAndFuture` or `EntireSeries`. A recurrence change is **rejected** under
 * `ThisOccurrence`, because changing the pattern is not something one date can
 * do — the client sends the scope and does not resolve it.
 */
export async function updateEventSeries(
  seriesId: string,
  request: { scope: string; occurrenceId?: string; [field: string]: unknown }
) {
  const wire = await write<SeriesWire>(
    'put',
    `${COMMUNITY_LIFE_ROOT}/events/series/${encodeURIComponent(seriesId)}`,
    request
  );
  return toSeries(wire);
}

/**
 * `DELETE /community-life/events/series/{seriesId}` — B12 EventSeriesEndpoints.cs:139.
 *
 * **DELETE, and it cancels rather than deletes**, with `reason` and `pauseOnly`
 * in the query string rather than a body. A pattern people are coming to must
 * not vanish, because the people coming to it have to be told.
 */
export async function cancelEventSeries(
  seriesId: string,
  reason?: string,
  pauseOnly = false
) {
  const wire = await write<SeriesWire>(
    'delete',
    `${COMMUNITY_LIFE_ROOT}/events/series/${encodeURIComponent(seriesId)}`,
    undefined,
    { params: { reason, pauseOnly } }
  );
  return toSeries(wire);
}

/**
 * `PUT /community-life/events/occurrences/{occurrenceId}` — B12 :179.
 *
 * Moves or calls off one date, producing an exception on the rule. There is
 * deliberately no way back to `Scheduled`: cancelling releases every place.
 */
export async function updateOccurrence(
  occurrenceId: string,
  request: { status?: string; startsAt?: string; reason?: string }
) {
  const wire = await write<OccurrenceWire>(
    'put',
    `${COMMUNITY_LIFE_ROOT}/events/occurrences/${encodeURIComponent(occurrenceId)}`,
    request
  );
  return toOccurrence(wire);
}

// ═════════════════════════════════════════════════════════════════════════════
// CAMPAIGNS AND GIVING — B15.1 Giving Extension
// COMMUNITY-LIFE-GAP-006, -007 and -008. Remediation Wave C-04.
//
// Every route below was read out of the backend before it was written here:
//   `Diaspora.Modules.CommunityProgramme/Api/CampaignEndpoints.cs`       (B18 URL)
//   `Diaspora.Modules.Financial/Api/GivingExtensionEndpoints.cs`         (B15 URL)
//   `Diaspora.Modules.Financial/Contracts/V1/{Requests,Responses}/B15_1Giving*.cs`
//   `Diaspora.Modules.Financial/Application/Campaigns/*.cs`
//
// ── Four things that differ from the rest of this file, each verified ────────
//
//   1. **Money on this surface carries its own minor units and symbol.**
//      B15's `MoneyResponse` (MoneyResponse.cs:25-41) is
//      `{ amount, currency, minorUnits, exponent, symbol? }` — five fields —
//      where B18's is three. So `toGivingMoney` **copies** and does not
//      compute: there is no `amount × 10^exponent` here, because the server
//      already sent the exact stored value. Using this file's `toMoney` would
//      have re-derived a figure the server had given, which is the smaller
//      version of exactly the mistake §17 is about.
//
//   2. **The page envelope has no `totalCount`.** `GivingPageResponse<T>`
//      (B15_1GivingResponses.cs:22-29) is `{ items, nextCursor, hasMore }` and
//      nothing else. The file header's claim that B15's page "agrees" with
//      `CommunityPageResponse<T>` is true for the row property and **false for
//      the count** — see the note on `readGivingList`. Nothing here reports a
//      total, because nothing on this surface serves one.
//
//   3. **Idempotency here is a body field only.** `ProgrammeIdempotency` and
//      `IdempotencyHeader` belong to B18; these routes forward straight to B15
//      commands and B15 reads `request.IdempotencyKey` and no header at all
//      (`CampaignCommandHandlers.cs:70-88`, `CampaignTransparencyHandlers.cs:63`).
//      The header is still sent — it is free, it is what every other write on
//      this client does, and a gateway or a future handler may consult it — but
//      **the body field is the one that works**, and it is never omitted.
//
//   4. **The client's own category spelling is the contract.** Three of the
//      eleven categories carry a space (`Community Project`, `Legal Support`,
//      `Disaster Relief`), a C# enum member cannot, and the backend translates
//      in both directions rather than asking this client to change
//      (`CampaignMapper.CategoryName` / `.Normalize`). So the category is sent
//      and read verbatim, and there is no table here.
//
// ── Where the server is honest and this file must be too ────────────────────
//
// **Cover images, gallery images and update media are B5 media references.**
// `coverImage`, `gallery[]` and `mediaReferences[]` are identifiers, not URLs,
// and this client has no synchronous resolver. The renderable URL fields are
// left empty and the identifiers are carried beside them, exactly as `toSeries`
// does for a series cover.
//
// **A named supporter arrives with no name.** `CampaignSupporterResponse`
// answers `displayName: null` beside a real `userId` for a non-anonymous gift,
// because B15 stores no donor name and this platform has no id→name seam — the
// same shape, and the same stated reason, as the social module's comment
// `authorName`. `Community member` is substituted here, which is the placeholder
// `CommentThread.tsx:326` already uses for that exact case. It is a role, not an
// invented name, and it is applied in one place so it cannot drift.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `MoneyResponse` — B15 MoneyResponse.cs:25. **Five fields, not three.**
 *
 * Declared separately from `MoneyWire` above rather than widened into it,
 * because a widened optional `minorUnits` would let a B18 payload compile
 * through `toGivingMoney` and silently lose the exact stored value.
 */
interface GivingMoneyWire {
  amount: number;
  currency: string;
  minorUnits: number;
  exponent: number;
  symbol?: string | null;
}

/** `CampaignProgressResponse` — B15_1GivingResponses.cs:72. */
interface CampaignProgressWire {
  target?: GivingMoneyWire | null;
  raised: GivingMoneyWire;
  /** Null where there is no target. Never a zero standing in for one. */
  percentage?: number | null;
  supporterCount: number;
  deadline?: string | null;
  daysRemaining?: number | null;
}

/** `CampaignResponse` — B15_1GivingResponses.cs:98. */
interface CampaignWire {
  campaignId: string;
  title: string;
  summary: string;
  story: string;
  /** A media reference, never a URL. */
  coverImage?: string | null;
  /** Media references, never URLs. */
  gallery: string[];
  category: string;
  status: string;
  progress: CampaignProgressWire;
  causeCode?: string | null;
  beneficiaryType: string;
  beneficiaryId?: string | null;
  beneficiaryName: string;
  urgency: string;
  acceptedKinds: string[];
  organizerId: string;
  organizerName: string;
  organizationId?: string | null;
  isVerified: boolean;
  countryCode?: string | null;
  locationLabel?: string | null;
  createdAt: string;
  publishedAt?: string | null;
  closedAt?: string | null;
  reviewNote?: string | null;
  canManage: boolean;
  canDonate: boolean;
  availableTransitions: string[];
}

/** `CampaignUpdateResponse` — B15_1GivingResponses.cs:185. */
interface CampaignUpdateWire {
  updateId: string;
  campaignId: string;
  title: string;
  body: string;
  mediaReferences: string[];
  publishedAt: string;
  authorName: string;
  isWithdrawn: boolean;
}

/** `CampaignMilestoneResponse` — B15_1GivingResponses.cs:213. */
interface CampaignMilestoneWire {
  milestoneId: string;
  label: string;
  target: GivingMoneyWire;
  /** The server's own stamp, taken from the cause's total. Never a comparison. */
  isReached: boolean;
  reachedAt?: string | null;
}

/** `CampaignSupporterResponse` — B15_1GivingResponses.cs:235. */
interface CampaignSupporterWire {
  /** Absent for an anonymous supporter. B15 never stored one. */
  userId?: string | null;
  /** `"Anonymous"` for an anonymous supporter, and **null for a named one**. */
  displayName?: string | null;
  isAnonymous: boolean;
  amount?: GivingMoneyWire | null;
  message?: string | null;
  givenAt: string;
}

/** `FundUsageLineResponse` — B15_1GivingResponses.cs:266. */
interface FundUsageLineWire {
  id: string;
  label: string;
  allocated: GivingMoneyWire;
  /** Null where nothing has been spent. Never a zero standing in for it. */
  spent?: GivingMoneyWire | null;
  note?: string | null;
  isPlatformVerified: boolean;
}

/**
 * `CampaignFundUsageResponse` — B15_1GivingResponses.cs:299.
 *
 * **Not a page**, though it names its rows `lines`: there is no cursor and no
 * `hasMore`, so it is read as an object and never through `readGivingList`. It
 * is therefore correctly absent from the row-property ledger in
 * `backend-row-property-drift.test.ts`, and must not be added to it.
 */
interface CampaignFundUsageWire {
  campaignId: string;
  causeCode?: string | null;
  raised: GivingMoneyWire;
  allocated: GivingMoneyWire;
  disbursed: GivingMoneyWire;
  disbursedVerified: GivingMoneyWire;
  remaining: GivingMoneyWire;
  lines: FundUsageLineWire[];
  isOverReported: boolean;
}

/** `DonationTimeSeriesPointResponse` — B15_1GivingResponses.cs:333. */
interface TimeSeriesPointWire {
  periodStart: string;
  amount: GivingMoneyWire;
  donationCount: number;
}

/** `DonationTimeSeriesResponse` — B15_1GivingResponses.cs:350. */
interface DonationTimeSeriesWire {
  causeCode: string;
  currency: string;
  from: string;
  to: string;
  timeZone: string;
  granularity: string;
  points: TimeSeriesPointWire[];
  total: GivingMoneyWire;
  refunded: GivingMoneyWire;
  donationCount: number;
  refundedCount: number;
  failedCount: number;
  supporterCount: number;
}

/** `RecurringDonationResponse` — B15_1GivingResponses.cs:384. */
interface RecurringDonationWire {
  recurringDonationId: string;
  causeCode: string;
  causeTitle?: string | null;
  amount: GivingMoneyWire;
  intervalMonths: number;
  status: string;
  nextChargeAt?: string | null;
  lastChargeAt?: string | null;
  lastAttemptAt?: string | null;
  lastFailureReason?: string | null;
  consecutiveFailures: number;
  chargeCount: number;
  createdAt: string;
  cancelledAt?: string | null;
}

// ── Adapters ────────────────────────────────────────────────────────────────

const CAMPAIGN_STATUSES = [
  'Draft', 'PendingReview', 'Rejected', 'Published', 'Active', 'Paused',
  'GoalReached', 'DeadlineReached', 'Completed', 'Refunding', 'Cancelled', 'Closed',
] as const satisfies readonly CampaignStatus[];

const CAMPAIGN_CATEGORIES = [
  'Medical', 'Education', 'Emergency', 'Funeral', 'Community Project', 'Religious',
  'Sports', 'Legal Support', 'Repatriation', 'Disaster Relief', 'Other',
] as const satisfies readonly CampaignCategory[];

const RECURRING_DONATION_STATUSES = [
  'Active', 'Retrying', 'Suspended', 'Cancelled', 'Completed',
] as const satisfies readonly RecurringDonationStatus[];

/**
 * B15's money, copied. **No arithmetic.**
 *
 * `minorUnits` is the exact stored value and the server sent it, so deriving it
 * from `amount` and `exponent` here would replace a fact with a rounding. The
 * symbol is the currency catalogue's and is null where it has none — which the
 * renderers already treat as "no symbol" rather than as a missing string.
 */
function toGivingMoney(wire: GivingMoneyWire): Money {
  return {
    amount: wire.amount,
    currency: wire.currency,
    minorUnits: wire.minorUnits,
    exponent: wire.exponent,
    symbol: wire.symbol ?? null,
  };
}

function toGivingMoneyOrNull(wire?: GivingMoneyWire | null): Money | null {
  return wire ? toGivingMoney(wire) : null;
}

/**
 * The money side of a campaign, every field marked `backend`.
 *
 * `Sourced` is a *field-level* provenance marker, and on this arm every field
 * of it is a real B15 figure — so every one is `backed`, and the simulated
 * constructor is not reachable from here. The type stays `Sourced` rather than
 * being flattened because the gap arm still answers for campaigns in a
 * development build, the two must remain interchangeable behind the hook, and a
 * screen that stopped being able to ask "is this real?" would answer "yes" to
 * both.
 */
function toCampaignProgress(wire: CampaignProgressWire): FundraisingProgress {
  return {
    target: backed(toGivingMoneyOrNull(wire.target)),
    raised: backed(toGivingMoney(wire.raised)),
    // Null passes straight through. The server sends null for an untargeted
    // campaign and a `?? 0` here would put a 0% bar over a campaign that may
    // have raised thousands.
    percentage: backed(wire.percentage ?? null),
    supporterCount: backed(wire.supporterCount),
    deadline: wire.deadline ?? null,
    daysRemaining: wire.daysRemaining ?? null,
  };
}

function toCampaign(wire: CampaignWire): FundraisingCampaign {
  return {
    campaignId: wire.campaignId,
    title: wire.title,
    summary: wire.summary,
    story: wire.story,
    // A media reference is not a URL. See the section header.
    coverImage: '',
    gallery: [],
    coverImageReference: wire.coverImage ?? null,
    galleryReferences: wire.gallery ?? [],
    category: oneOf(wire.category, CAMPAIGN_CATEGORIES, 'Other'),
    // `Draft` is the conservative fallback: an unknown status must never light
    // up a screen that says a campaign is collecting money.
    status: oneOf(wire.status, CAMPAIGN_STATUSES, 'Draft'),
    progress: toCampaignProgress(wire.progress),
    causeCode: wire.causeCode ?? null,
    // Open unions on the financial side — passed through rather than narrowed,
    // because `BeneficiaryType` and `ContributionKind` accept any string the
    // catalogue grows and there is no safe fallback to pick.
    beneficiaryType: wire.beneficiaryType,
    beneficiaryId: wire.beneficiaryId ?? null,
    beneficiaryName: wire.beneficiaryName,
    urgency: wire.urgency,
    acceptedKinds: wire.acceptedKinds ?? [],
    organizerId: wire.organizerId,
    organizerName: wire.organizerName,
    organizationId: wire.organizationId ?? null,
    isVerified: wire.isVerified,
    countryCode: wire.countryCode ?? null,
    locationLabel: wire.locationLabel ?? null,
    createdAt: wire.createdAt,
    publishedAt: wire.publishedAt ?? null,
    closedAt: wire.closedAt ?? null,
    reviewNote: wire.reviewNote ?? null,
    canManage: wire.canManage,
    // Both halves of the rule — a collecting state *and* a linked cause —
    // decided by the server. This is the field the donate control branches on,
    // and the client never reassembles it from `status` and `causeCode`.
    canDonate: wire.canDonate,
    // Dropped rather than narrowed to `Draft`: a transition this client does not
    // recognise must not become a button that says "move to draft".
    availableTransitions: (wire.availableTransitions ?? []).filter(
      (value): value is CampaignStatus =>
        (CAMPAIGN_STATUSES as readonly string[]).includes(value)
    ),
  };
}

function toCampaignUpdate(wire: CampaignUpdateWire): CampaignUpdate {
  return {
    updateId: wire.updateId,
    campaignId: wire.campaignId,
    title: wire.title,
    body: wire.body,
    // Identifiers, not URLs. Empty here and preserved below.
    mediaUrls: [],
    mediaReferences: wire.mediaReferences ?? [],
    publishedAt: wire.publishedAt,
    authorName: wire.authorName,
    isWithdrawn: wire.isWithdrawn,
  };
}

function toCampaignMilestone(wire: CampaignMilestoneWire): CampaignMilestone {
  return {
    milestoneId: wire.milestoneId,
    label: wire.label,
    target: toGivingMoney(wire.target),
    // The server's stamp. The client is given the answer, never the two numbers
    // to divide — so there is no comparison here to disagree with it.
    isReached: wire.isReached,
    reachedAt: wire.reachedAt ?? null,
  };
}

function toCampaignSupporter(wire: CampaignSupporterWire): CampaignSupporter {
  return {
    userId: wire.userId ?? null,
    // `"Anonymous"` arrives for an anonymous gift and null for a named one; the
    // platform has no name to send for the latter. See the section header for
    // why this placeholder and not a fabricated name.
    displayName: wire.displayName ?? 'Community member',
    isAnonymous: wire.isAnonymous,
    amount: toGivingMoneyOrNull(wire.amount),
    message: wire.message ?? null,
    givenAt: wire.givenAt,
  };
}

function toFundUsageLine(wire: FundUsageLineWire): FundUsageLine {
  return {
    id: wire.id,
    label: wire.label,
    allocated: toGivingMoney(wire.allocated),
    spent: toGivingMoneyOrNull(wire.spent),
    note: wire.note ?? null,
    isPlatformVerified: wire.isPlatformVerified,
  };
}

function toCampaignFundUsage(wire: CampaignFundUsageWire): CampaignFundUsage {
  return {
    campaignId: wire.campaignId,
    causeCode: wire.causeCode ?? null,
    raised: toGivingMoney(wire.raised),
    allocated: toGivingMoney(wire.allocated),
    disbursed: toGivingMoney(wire.disbursed),
    disbursedVerified: toGivingMoney(wire.disbursedVerified),
    remaining: toGivingMoney(wire.remaining),
    lines: (wire.lines ?? []).map(toFundUsageLine),
    isOverReported: wire.isOverReported,
  };
}

function toDonationTimeSeries(wire: DonationTimeSeriesWire): DonationTimeSeries {
  return {
    causeCode: wire.causeCode,
    currency: wire.currency,
    from: wire.from,
    to: wire.to,
    timeZone: wire.timeZone,
    granularity: wire.granularity,
    points: (wire.points ?? []).map((point) => ({
      periodStart: point.periodStart,
      amount: toGivingMoney(point.amount),
      donationCount: point.donationCount,
    })),
    total: toGivingMoney(wire.total),
    // Never netted off the total. Two figures, kept apart, as the server sends
    // them — a chart that subtracted one from the other would be publishing a
    // third number nobody can reconcile.
    refunded: toGivingMoney(wire.refunded),
    donationCount: wire.donationCount,
    refundedCount: wire.refundedCount,
    failedCount: wire.failedCount,
    supporterCount: wire.supporterCount,
  };
}

function toRecurringDonation(wire: RecurringDonationWire): RecurringDonation {
  return {
    recurringDonationId: wire.recurringDonationId,
    causeCode: wire.causeCode,
    causeTitle: wire.causeTitle ?? null,
    amount: toGivingMoney(wire.amount),
    intervalMonths: wire.intervalMonths,
    // `Suspended` is the conservative fallback rather than `Active`: an unknown
    // state must not tell somebody their giving is running when it may not be.
    status: oneOf(wire.status, RECURRING_DONATION_STATUSES, 'Suspended'),
    nextChargeAt: wire.nextChargeAt ?? null,
    lastChargeAt: wire.lastChargeAt ?? null,
    lastAttemptAt: wire.lastAttemptAt ?? null,
    lastFailureReason: wire.lastFailureReason ?? null,
    consecutiveFailures: wire.consecutiveFailures,
    chargeCount: wire.chargeCount,
    createdAt: wire.createdAt,
    cancelledAt: wire.cancelledAt ?? null,
  };
}

/**
 * A `GivingPageResponse<T>`, read through the platform normaliser.
 *
 * Separate from `readList` for one reason, and it is a contract difference
 * rather than a stylistic one: **`GivingPageResponse<T>` has no `totalCount`**
 * (B15_1GivingResponses.cs:22-29), so `readPage` finds none and this returns
 * `totalCount: null`. That is the honest answer — the route declines to count —
 * and it is stated here so that a later reader does not "fix" the null by
 * promoting `items.length`, which would report the page size as the population.
 */
async function readGivingList<T>(
  path: string,
  params?: QueryParams
): Promise<CommunityPage<T>> {
  try {
    const response = await apiClient.get<unknown>(path, { params });
    const page = readPage<T>(response.data);
    return {
      items: page.items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      totalCount: page.totalCount,
    };
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

// ── Campaigns — COMMUNITY-LIFE-GAP-006 ──────────────────────────────────────

export interface ProgrammeCampaignQueryParams {
  state?: string;
  category?: string;
  countryCode?: string;
  organizationId?: string;
  /** Restricts to the caller's own campaigns, drafts included. */
  mine?: boolean;
  cursor?: string;
  take?: number;
}

/**
 * `GET /communities/campaigns` — CampaignEndpoints.cs:80.
 *
 * **There is no free-text `query` parameter and this client does not send
 * one.** `SearchCampaignsQuery` binds `state`, `category`, `country`,
 * `organizationId`, `mine`, `cursor` and `take` — nothing else — so a `query`
 * would have been accepted by the router and dropped by the binder, and the
 * screen would have shown an unfiltered list as though it had searched.
 *
 * The country parameter is spelled `country` on the wire and `countryCode` on
 * the client's own params object; the rename happens here rather than at each
 * call site.
 *
 * A draft is visible only to the person who wrote it — enforced server-side, so
 * there is no client-side filter here and there must not be one.
 */
export function fetchCampaigns(
  params: ProgrammeCampaignQueryParams = {}
): Promise<CommunityPage<FundraisingCampaign>> {
  return readGivingList<CampaignWire>(`${ROOT}/campaigns`, {
    state: params.state,
    category: params.category,
    country: params.countryCode,
    organizationId: params.organizationId,
    mine: params.mine,
    cursor: params.cursor,
    take: params.take,
  }).then((page) => ({ ...page, items: page.items.map(toCampaign) }));
}

/**
 * `GET /communities/campaigns/{campaignId}` — CampaignEndpoints.cs:109.
 *
 * `progress`, `canDonate` and `availableTransitions` are all computed by the
 * server on this read. Nothing on this response is arithmetic the device did.
 */
export async function fetchCampaign(campaignId: string): Promise<FundraisingCampaign> {
  const wire = await read<CampaignWire>(
    `${ROOT}/campaigns/${encodeURIComponent(campaignId)}`
  );
  return toCampaign(wire);
}

/**
 * The caller's own campaigns, drafts included.
 *
 * Reads the search route with `mine=true` (`SearchCampaignsQuery.MineOnly`,
 * CampaignEndpoints.cs:85), first page. The gap arm called `/campaigns/me`
 * before any deployment served it; the backend has served it since 20 Oct
 * 2026 (d07a707) as the same search read to the end, so either is real now
 * and this keeps the paged one. The array return is
 * kept because that is what the organizer list has always consumed; a caller
 * that needs the rest of the pages should use `fetchCampaigns({ mine: true })`
 * directly rather than have this quietly concatenate them.
 */
export async function fetchMyCampaigns(
  organizationId?: string
): Promise<FundraisingCampaign[]> {
  const page = await fetchCampaigns({ mine: true, organizationId });
  return page.items;
}

/**
 * `POST /communities/campaigns` — CampaignEndpoints.cs:66. Creates a **draft**.
 *
 * Nothing financial exists after this call: a draft has no cause, so there is
 * nowhere to collect and no donate control anywhere on the platform. The cause
 * arrives at publication.
 *
 * `acceptedTerms` is refused server-side when false — terms acceptance is not a
 * form-level check — so it is sent as the caller gave it and never defaulted.
 *
 * The idempotency key goes in the **body**, which is the field this handler
 * reads (`CampaignCommandHandlers.cs:70`); the header is sent alongside for
 * consistency with every other write here and is not what makes the retry safe.
 */
export async function createCampaign(
  request: CreateCampaignRequest
): Promise<FundraisingCampaign> {
  const wire = await write<CampaignWire>(
    'post',
    `${ROOT}/campaigns`,
    {
      title: request.title,
      summary: request.summary,
      story: request.story,
      // A media reference where the caller has one. The create contract calls
      // this `coverImage` and documents it as a reference, never a URL.
      coverImage: request.coverImage || undefined,
      gallery: request.gallery,
      category: request.category,
      targetAmount: request.targetAmount,
      currency: request.currency,
      deadline: request.deadline,
      beneficiaryType: request.beneficiaryType,
      beneficiaryId: request.beneficiaryId,
      beneficiaryName: request.beneficiaryName,
      organizationId: request.organizationId,
      countryCode: request.countryCode,
      acceptedKinds: request.acceptedKinds,
      acceptedTerms: request.acceptedTerms,
      idempotencyKey: request.idempotencyKey,
    },
    { idempotencyKey: request.idempotencyKey }
  );
  return toCampaign(wire);
}

/**
 * The fields `PUT /communities/campaigns/{id}` actually binds.
 *
 * **Seven of the create contract's fields are not on the update contract**, and
 * this is why the update body is assembled by hand rather than spread from a
 * `Partial<CreateCampaignRequest>`. `UpdateCampaignRequest`
 * (B15_1GivingRequests.cs:78-101) carries `title`, `summary`, `story`,
 * `coverImage`, `gallery`, `category`, `targetAmount`, `deadline`, `urgency`,
 * `locationLabel` and `acceptedKinds`. It does **not** carry `currency`,
 * `beneficiaryType`, `beneficiaryId`, `beneficiaryName`, `organizationId`,
 * `countryCode` or `acceptedTerms` — a request naming any of them is answered
 * 200 with the field silently dropped, which is the same failure shape as
 * `PUT /creators/me` losing `displayName`.
 *
 * `urgency` is the mirror image: settable here and **not** on create, where the
 * server decides it.
 */
export interface UpdateCampaignFields {
  title?: string;
  summary?: string;
  story?: string;
  /** A B5 media reference, never a URL. */
  coverImage?: string;
  gallery?: string[];
  category?: CampaignCategory;
  targetAmount?: number | null;
  deadline?: string | null;
  urgency?: string;
  locationLabel?: string;
  acceptedKinds?: string[];
}

/**
 * `PUT /communities/campaigns/{campaignId}` — CampaignEndpoints.cs:121.
 *
 * A campaign's own text. **Nothing financial moves through it** — the raised
 * total, the supporter count and the status are all read-only here, and the
 * request contract has no field for any of them.
 */
export async function updateCampaign(
  campaignId: string,
  request: UpdateCampaignFields
): Promise<FundraisingCampaign> {
  const wire = await write<CampaignWire>(
    'put',
    `${ROOT}/campaigns/${encodeURIComponent(campaignId)}`,
    request
  );
  return toCampaign(wire);
}

/** The six lifecycle verbs, each its own route. CampaignEndpoints.cs:144. */
export type ProgrammeCampaignAction =
  | 'submit'
  | 'publish'
  | 'pause'
  | 'resume'
  | 'close'
  | 'cancel';

/**
 * `POST /communities/campaigns/{campaignId}/{action}` — CampaignEndpoints.cs:144.
 *
 * **The destination comes from the route and never from the body**, so a client
 * cannot ask for a state the route it called does not mean. The aggregate
 * decides whether the move is legal and answers **409** when it is not; the
 * client's own transition table draws the buttons and is explicitly not the
 * authority. Where the two disagree it is the client that has gone stale, and
 * the 409 is the correct outcome rather than a bug to work around.
 *
 * `reason` is carried on a rejection and a cancellation and ignored elsewhere.
 */
export async function actOnCampaign(
  campaignId: string,
  action: ProgrammeCampaignAction,
  reason?: string
): Promise<FundraisingCampaign> {
  const wire = await write<CampaignWire>(
    'post',
    `${ROOT}/campaigns/${encodeURIComponent(campaignId)}/${action}`,
    { reason }
  );
  return toCampaign(wire);
}

// ── Transparency — COMMUNITY-LIFE-GAP-007 ───────────────────────────────────

/**
 * `GET /communities/campaigns/{campaignId}/updates` — CampaignEndpoints.cs:169.
 *
 * Cursor-paged, newest first. **A withdrawn update is absent for everybody
 * except the person who wrote it** — the server omits it rather than flagging
 * it, so `isWithdrawn` on a row a supporter received is always false and there
 * is no client-side filter here.
 */
export function fetchCampaignUpdates(
  campaignId: string,
  params: { cursor?: string; take?: number } = {}
): Promise<CommunityPage<CampaignUpdate>> {
  return readGivingList<CampaignUpdateWire>(
    `${ROOT}/campaigns/${encodeURIComponent(campaignId)}/updates`,
    params
  ).then((page) => ({ ...page, items: page.items.map(toCampaignUpdate) }));
}

/**
 * `POST /communities/campaigns/{campaignId}/updates` — CampaignEndpoints.cs:189.
 *
 * Role-gated and idempotent on the body's key. **Media travels as B5 references
 * and not as URLs**, which is why this takes `mediaReferences` — a screen that
 * has only rendered URLs has nothing to send, and sending them would store a
 * URL in a field the rest of the platform resolves as an asset id.
 */
export async function publishCampaignUpdate(
  campaignId: string,
  request: {
    title: string;
    body: string;
    mediaReferences?: string[];
    idempotencyKey?: string;
  }
): Promise<CampaignUpdate> {
  const wire = await write<CampaignUpdateWire>(
    'post',
    `${ROOT}/campaigns/${encodeURIComponent(campaignId)}/updates`,
    {
      title: request.title,
      body: request.body,
      mediaReferences: request.mediaReferences,
      idempotencyKey: request.idempotencyKey,
    },
    { idempotencyKey: request.idempotencyKey }
  );
  return toCampaignUpdate(wire);
}

/**
 * `GET /communities/campaigns/{campaignId}/milestones` — CampaignEndpoints.cs:207.
 *
 * A bare `IReadOnlyList<CampaignMilestoneResponse>` rather than a page
 * (`CampaignContracts.cs:237`), so it is read as an array.
 */
export async function fetchCampaignMilestones(
  campaignId: string
): Promise<CampaignMilestone[]> {
  const wire = await read<CampaignMilestoneWire[]>(
    `${ROOT}/campaigns/${encodeURIComponent(campaignId)}/milestones`
  );
  return (wire ?? []).map(toCampaignMilestone);
}

/**
 * `PUT /communities/campaigns/{campaignId}/milestones` — CampaignEndpoints.cs:222.
 *
 * **Declares the whole set; it does not append to it.** The handler replaces the
 * milestones and re-evaluates them in one write, so a caller sending one row
 * removes the rest — supply the existing `milestoneId` on a row to keep it, and
 * to keep its reached-ness.
 *
 * There is deliberately no `isReached` on the input. Whether a milestone is
 * reached is the server's own stamp against the cause's authoritative total,
 * never the caller's claim, and a milestone declared below a total the cause has
 * already passed is reached the moment it is declared.
 */
export async function setCampaignMilestones(
  campaignId: string,
  milestones: { milestoneId?: string; label: string; targetAmount: number }[]
): Promise<CampaignMilestone[]> {
  const wire = await write<CampaignMilestoneWire[]>(
    'put',
    `${ROOT}/campaigns/${encodeURIComponent(campaignId)}/milestones`,
    { milestones }
  );
  return (wire ?? []).map(toCampaignMilestone);
}

/**
 * `GET /communities/campaigns/{campaignId}/supporters` — CampaignEndpoints.cs:240.
 *
 * **Anonymity is applied at the source and there is nothing here to hide.** B15
 * stores no donor identifier on an anonymous donation, so an anonymous supporter
 * arrives with no `userId`, no message and no correlation handle of any kind —
 * two anonymous gifts from one person are indistinguishable from two people. A
 * client-side filter would be the wrong shape entirely: it would mean the
 * identity had already been sent to the device.
 *
 * An unpublished campaign has no cause, so this answers an **empty page** rather
 * than an error — "nobody has supported this yet" is true and renderable.
 */
export function fetchCampaignSupporters(
  campaignId: string,
  params: { cursor?: string; take?: number } = {}
): Promise<CommunityPage<CampaignSupporter>> {
  return readGivingList<CampaignSupporterWire>(
    `${ROOT}/campaigns/${encodeURIComponent(campaignId)}/supporters`,
    params
  ).then((page) => ({ ...page, items: page.items.map(toCampaignSupporter) }));
}

/**
 * `GET /communities/campaigns/{campaignId}/fund-usage` — CampaignEndpoints.cs:262.
 *
 * **An envelope of five differently-sourced totals, not a list of lines.** The
 * register declared this route as the lines alone; the contract returns them
 * inside `raised` / `allocated` / `disbursed` / `disbursedVerified` /
 * `remaining` plus an `isOverReported` flag. A client that read only `lines`
 * would have discarded `disbursedVerified`, which is the single figure that
 * separates what the organizer says they spent from what the platform can prove.
 */
export async function fetchCampaignFundUsage(
  campaignId: string
): Promise<CampaignFundUsage> {
  const wire = await read<CampaignFundUsageWire>(
    `${ROOT}/campaigns/${encodeURIComponent(campaignId)}/fund-usage`
  );
  return toCampaignFundUsage(wire);
}

/**
 * `GET /communities/campaigns/{campaignId}/donations/me` — CampaignEndpoints.cs
 * (backend a7b97c7, 20 Oct 2026).
 *
 * The caller's own donations to one campaign through its cause, newest first.
 * Each wraps B15's `Donation` unchanged — the receipt renders from that — with
 * the campaign's id and title around it. Anonymous gifts are absent because
 * they store no donor, so this list is "gifts given under your name", never a
 * total of everything the member gave. 404 for a campaign the caller can
 * neither see nor gave to.
 */
export async function fetchMyCampaignDonations(campaignId: string): Promise<CampaignDonation[]> {
  const wire = await read<CampaignDonation[]>(
    `${ROOT}/campaigns/${encodeURIComponent(campaignId)}/donations/me`
  );
  return (wire ?? []).map((row) => ({
    donation: row.donation,
    campaignId: row.campaignId ?? campaignId,
    campaignTitle: row.campaignTitle ?? null,
    status: row.status ?? row.donation.status,
    payment: row.payment ?? row.donation.payment ?? null,
  }));
}

/**
 * `PUT /communities/campaigns/{campaignId}/fund-usage` — CampaignEndpoints.cs:277.
 *
 * Replaces the allocation lines. A `withdrawalId` is **verified against the
 * caller's own settled withdrawals before it is stored** — a reference the caller
 * does not own is refused rather than recorded as verification — which is why
 * `isPlatformVerified` on the response is a fact and not an echo.
 */
export async function setCampaignFundUsage(
  campaignId: string,
  lines: {
    id?: string;
    label: string;
    allocated: number;
    spent?: number | null;
    note?: string | null;
    withdrawalId?: string;
  }[]
): Promise<CampaignFundUsage> {
  const wire = await write<CampaignFundUsageWire>(
    'put',
    `${ROOT}/campaigns/${encodeURIComponent(campaignId)}/fund-usage`,
    { lines }
  );
  return toCampaignFundUsage(wire);
}

/**
 * `GET /financial/donations/causes/{causeCode}/timeseries` — B15
 * GivingExtensionEndpoints.cs:29.
 *
 * **B15's own prefix, not B18's.** No register placed this under
 * `/communities`, so it stays where the module that owns it mounts.
 *
 * The window is bucketed by **whole UTC days**, which the response states rather
 * than leaves to be assumed: a platform spanning eleven time zones has no single
 * local midnight, and picking the caller's would make two people disagree about
 * which day a donation happened on. A window wider than the deployment's maximum
 * is **clamped rather than refused**, and the response says which window it
 * actually covers — so a chart must label its axis from `from`/`to` on the
 * response and never from what it asked for.
 */
export async function fetchDonationTimeSeries(
  causeCode: string,
  params: { from?: string; to?: string } = {}
): Promise<DonationTimeSeries> {
  const wire = await read<DonationTimeSeriesWire>(
    `${FINANCIAL_ROOT}/donations/causes/${encodeURIComponent(causeCode)}/timeseries`,
    params
  );
  return toDonationTimeSeries(wire);
}

// ── Recurring donations — COMMUNITY-LIFE-GAP-008 ────────────────────────────

/**
 * `GET /financial/donations/recurring/me` — GivingExtensionEndpoints.cs:51.
 *
 * A bare `IReadOnlyList<RecurringDonationResponse>` (`RecurringDonationHandlers.cs:22`),
 * **not** a page — so it is read as an array and not through `readGivingList`.
 *
 * Every state comes back, cancelled ones included: a donor who stopped a monthly
 * gift is entitled to see that it stopped, and a list that hid it would look as
 * though the cancellation had lost the record.
 */
export async function fetchMyRecurringDonations(): Promise<RecurringDonation[]> {
  const wire = await read<RecurringDonationWire[]>(
    `${FINANCIAL_ROOT}/donations/recurring/me`
  );
  return (wire ?? []).map(toRecurringDonation);
}

/**
 * `POST /financial/donations/recurring/{id}/cancel` — GivingExtensionEndpoints.cs:61.
 *
 * **Owner only, and idempotent.** A cancel tapped twice is one instruction, and
 * the second is answered with the cancelled schedule rather than a 409 — telling
 * somebody their cancellation failed when it had already worked is the worse
 * error by a distance.
 *
 * A schedule that is absent and one that belongs to somebody else are answered
 * **identically**, so a caller cannot enumerate which identifiers exist. A screen
 * must therefore render a 404 here as "we could not find that standing donation"
 * and never as "that belongs to another account".
 *
 * The response is the schedule as it now stands, which is what the caller should
 * render — never an assumption that the tap worked.
 */
export async function cancelRecurringDonation(
  recurringDonationId: string
): Promise<RecurringDonation> {
  const wire = await write<RecurringDonationWire>(
    'post',
    `${FINANCIAL_ROOT}/donations/recurring/${encodeURIComponent(recurringDonationId)}/cancel`
  );
  return toRecurringDonation(wire);
}
