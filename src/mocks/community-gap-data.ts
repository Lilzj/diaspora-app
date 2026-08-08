// ═════════════════════════════════════════════════════════════════════════════
//
//   ⚠  BACKEND GAP / DEVELOPMENT ONLY  ⚠
//
//   Seed data for capabilities the certified backend does not have.
//
//   Nothing in this file mirrors a real record. There is no membership
//   programme, no event series, no fundraising campaign lifecycle, no volunteer
//   opportunity, no poll and no organization dashboard anywhere on the certified
//   platform — see `src/config/community-gaps.ts`.
//
//   Two rules the seed data holds to, because they are what make the flows
//   worth testing:
//
//     **Awkward cases are represented.** A full tier, a rejected campaign, a
//     waitlisted volunteer, a cancelled occurrence, a poll that hides its
//     results until close, an organization where the caller is only a Member.
//     A dataset where everything succeeds produces screens that only handle
//     success.
//
//     **Money is never invented here.** Every `Money` on a campaign's progress
//     is marked `simulated` unless the campaign carries a `causeCode`, in which
//     case the handler substitutes B15's real `DonationCause` figures at read
//     time. The seed values below are placeholders that the handler replaces —
//     they exist so a campaign without a cause still renders, and they are
//     always marked.
//
//   Organization identifiers (`org-1`, `org-2`, `org-3`) deliberately match the
//   real B12 organizations in `community-life-data.ts`, so a membership
//   programme hangs off an organization that genuinely exists and the org
//   profile screen can link the two.
//
// ═════════════════════════════════════════════════════════════════════════════

import type {
  CampaignMilestone,
  CampaignSupporter,
  CampaignUpdate,
  CommunityAnnouncement,
  CommunityMembership,
  CommunityPoll,
  CommunityRecommendation,
  EventSeries,
  FundUsageLine,
  FundraisingCampaign,
  MembershipProgramme,
  MembershipTier,
  OrganizationCapabilities,
  OrganizationMember,
  PollResponse,
  RecurrenceRule,
  VolunteerApplicant,
  VolunteerApplication,
  VolunteerAssignment,
  VolunteerOpportunity,
} from '@/types/community-advanced';
import { money } from './financial-data';

/** The session's "today". Matches the B12 seed data's reference date. */
export const TODAY = '2026-07-13';

export function isoDaysAhead(days: number): string {
  const base = new Date(`${TODAY}T09:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}

export function dateDaysAhead(days: number): string {
  return isoDaysAhead(days).slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERSHIP
// ─────────────────────────────────────────────────────────────────────────────

const NIGERIAN_ASSOCIATION_TIERS: MembershipTier[] = [
  {
    tierId: 'tier-na-standard',
    organizationId: 'org-1',
    name: 'Standard Member',
    description: 'Full voting rights and access to every community event.',
    price: money(2500, 'GBP'),
    billingPeriod: 'Yearly',
    benefits: [
      { id: 'b1', title: 'Vote in association elections', icon: 'checkmark-circle-outline', isActive: true },
      { id: 'b2', title: 'Members-only WhatsApp group', icon: 'chatbubbles-outline', isActive: true },
      { id: 'b3', title: 'Discounted event tickets', description: 'Up to 40% off ticketed events.', icon: 'pricetag-outline', isActive: true },
      { id: 'b4', title: 'Welfare fund access', description: 'Emergency support for members in need.', icon: 'shield-outline', isActive: true },
    ],
    requirements: [
      { id: 'r1', label: 'Verified Diaspora account', kind: 'Verification', isMet: true, actionRoute: '/verification/country' },
      { id: 'r2', label: 'Resident in the United Kingdom', kind: 'Residency', isMet: true },
    ],
    capacity: null,
    filledCount: 412,
    isFull: false,
    isRecommended: true,
    sortOrder: 1,
  },
  {
    tierId: 'tier-na-student',
    organizationId: 'org-1',
    name: 'Student Member',
    description: 'Reduced rate for members in full-time education.',
    price: money(1000, 'GBP'),
    billingPeriod: 'Yearly',
    benefits: [
      { id: 'b5', title: 'Members-only WhatsApp group', icon: 'chatbubbles-outline', isActive: true },
      { id: 'b6', title: 'Discounted event tickets', icon: 'pricetag-outline', isActive: true },
      { id: 'b7', title: 'Mentoring scheme', description: 'Paired with a professional member.', icon: 'people-outline', isActive: true },
    ],
    requirements: [
      { id: 'r3', label: 'Verified Diaspora account', kind: 'Verification', isMet: true, actionRoute: '/verification/country' },
      // Deliberately unmet, so the eligibility UI has a real case to render.
      { id: 'r4', label: 'Proof of student enrolment', kind: 'Document', isMet: false, actionRoute: '/verification/country' },
    ],
    capacity: 150,
    filledCount: 138,
    isFull: false,
    isRecommended: false,
    sortOrder: 2,
  },
  {
    tierId: 'tier-na-patron',
    organizationId: 'org-1',
    name: 'Patron',
    description: 'Supports the association’s welfare and scholarship work.',
    price: money(15000, 'GBP'),
    billingPeriod: 'Yearly',
    benefits: [
      { id: 'b8', title: 'Everything in Standard', icon: 'checkmark-done-outline', isActive: true },
      { id: 'b9', title: 'Named on the patrons’ board', icon: 'ribbon-outline', isActive: true },
      { id: 'b10', title: 'Invitation to the annual dinner', icon: 'restaurant-outline', isActive: true },
      { id: 'b11', title: 'Scholarship nomination rights', description: 'Nominate one student per year.', icon: 'school-outline', isActive: false },
    ],
    requirements: [
      { id: 'r5', label: 'Verified Diaspora account', kind: 'Verification', isMet: true },
    ],
    // Full on purpose — §51 requires the UI to handle a tier nobody can join.
    capacity: 20,
    filledCount: 20,
    isFull: true,
    isRecommended: false,
    sortOrder: 3,
  },
];

export const MOCK_PROGRAMMES: MembershipProgramme[] = [
  {
    organizationId: 'org-1',
    organizationName: 'Nigerian Community Association UK',
    organizationLogo: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=120',
    category: 'Associations',
    isVerified: true,
    visibility: 'Public',
    isOpen: true,
    requiresApproval: true,
    summary:
      'The oldest Nigerian association in South London. Membership funds the welfare pot, the scholarship scheme and the annual Independence celebration.',
    tiers: NIGERIAN_ASSOCIATION_TIERS,
    memberCount: 570,
    location: {
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '12 Rye Lane',
      latitude: 51.4712,
      longitude: -0.0693,
    },
    countryCode: 'GB',
    myStatus: 'Eligible',
    myMembershipId: null,
  },
  {
    organizationId: 'org-2',
    organizationName: 'Redeemed Christian Church — Peckham Parish',
    organizationLogo: 'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=120',
    category: 'Churches',
    isVerified: true,
    visibility: 'Public',
    isOpen: true,
    // No approval step — joining is immediate, which is a different flow.
    requiresApproval: false,
    summary: 'Join the parish register to receive service updates and take part in the home fellowship groups.',
    tiers: [
      {
        tierId: 'tier-rccg-member',
        organizationId: 'org-2',
        name: 'Parish Member',
        description: 'Free membership of the parish register.',
        price: null,
        billingPeriod: 'Lifetime',
        benefits: [
          { id: 'b12', title: 'Service and programme updates', icon: 'notifications-outline', isActive: true },
          { id: 'b13', title: 'Home fellowship group', icon: 'home-outline', isActive: true },
          { id: 'b14', title: 'Pastoral care requests', icon: 'heart-outline', isActive: true },
        ],
        requirements: [],
        capacity: null,
        filledCount: 1840,
        isFull: false,
        isRecommended: true,
        sortOrder: 1,
      },
    ],
    memberCount: 1840,
    location: {
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '88 Queens Road',
      latitude: 51.4735,
      longitude: -0.0561,
    },
    countryCode: 'GB',
    myStatus: 'Active',
    myMembershipId: 'mem-2',
  },
  {
    organizationId: 'org-3',
    organizationName: 'Ghanaian Professionals Network',
    organizationLogo: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=120',
    category: 'Professional Associations',
    isVerified: true,
    visibility: 'Public',
    isOpen: true,
    requiresApproval: true,
    summary: 'A network for Ghanaian professionals in the UK. Quarterly mixers, a mentoring scheme and a jobs board.',
    tiers: [
      {
        tierId: 'tier-gpn-professional',
        organizationId: 'org-3',
        name: 'Professional',
        description: 'Full network membership, billed monthly.',
        price: money(500, 'GBP'),
        billingPeriod: 'Monthly',
        benefits: [
          { id: 'b15', title: 'Quarterly mixers', icon: 'wine-outline', isActive: true },
          { id: 'b16', title: 'Members’ jobs board', icon: 'briefcase-outline', isActive: true },
          { id: 'b17', title: 'Mentoring scheme', icon: 'people-outline', isActive: true },
        ],
        requirements: [
          { id: 'r6', label: 'Verified Diaspora account', kind: 'Verification', isMet: true },
        ],
        capacity: null,
        filledCount: 96,
        isFull: false,
        isRecommended: true,
        sortOrder: 1,
      },
    ],
    memberCount: 96,
    location: {
      cityName: 'London',
      areaName: 'Croydon',
      addressLine: '4 Park Street',
      latitude: 51.3762,
      longitude: -0.0982,
    },
    countryCode: 'GB',
    // A membership that has lapsed, so the renewal flow has a real subject.
    myStatus: 'RenewalDue',
    myMembershipId: 'mem-3',
  },
];

export const MOCK_MEMBERSHIPS: CommunityMembership[] = [
  {
    membershipId: 'mem-2',
    organizationId: 'org-2',
    organizationName: 'Redeemed Christian Church — Peckham Parish',
    organizationLogo: 'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=120',
    tierId: 'tier-rccg-member',
    tierName: 'Parish Member',
    status: 'Active',
    price: null,
    billingPeriod: 'Lifetime',
    benefits: MOCK_PROGRAMMES[1].tiers[0].benefits,
    joinedAt: isoDaysAhead(-420),
    expiresAt: null,
    renewalDueAt: null,
    isRenewable: false,
    payment: null,
    history: [
      { id: 'h1', status: 'Pending', occurredAt: isoDaysAhead(-421), actor: 'Member' },
      { id: 'h2', status: 'Active', occurredAt: isoDaysAhead(-420), actor: 'Organization' },
    ],
  },
  {
    membershipId: 'mem-3',
    organizationId: 'org-3',
    organizationName: 'Ghanaian Professionals Network',
    organizationLogo: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=120',
    tierId: 'tier-gpn-professional',
    tierName: 'Professional',
    status: 'RenewalDue',
    price: money(500, 'GBP'),
    billingPeriod: 'Monthly',
    benefits: MOCK_PROGRAMMES[2].tiers[0].benefits,
    joinedAt: isoDaysAhead(-300),
    expiresAt: isoDaysAhead(4),
    renewalDueAt: isoDaysAhead(-2),
    isRenewable: true,
    payment: null,
    history: [
      { id: 'h3', status: 'Pending', occurredAt: isoDaysAhead(-302), actor: 'Member' },
      { id: 'h4', status: 'Approved', occurredAt: isoDaysAhead(-301), actor: 'Organization' },
      { id: 'h5', status: 'Active', occurredAt: isoDaysAhead(-300), actor: 'System' },
      { id: 'h6', status: 'RenewalDue', occurredAt: isoDaysAhead(-2), actor: 'System' },
    ],
  },
];

export const MOCK_ORG_MEMBERS: Record<string, OrganizationMember[]> = {
  'org-1': [
    {
      membershipId: 'mem-a1',
      userId: 'user-201',
      displayName: 'Adaeze Okonkwo',
      tierName: 'Standard Member',
      status: 'Pending',
      role: 'Member',
      joinedAt: null,
      expiresAt: null,
      isVerified: true,
    },
    {
      membershipId: 'mem-a2',
      userId: 'user-202',
      displayName: 'Tunde Bakare',
      tierName: 'Student Member',
      status: 'Pending',
      role: 'Member',
      joinedAt: null,
      expiresAt: null,
      isVerified: false,
    },
    {
      membershipId: 'mem-a3',
      userId: 'user-203',
      displayName: 'Ngozi Eze',
      tierName: 'Standard Member',
      status: 'Active',
      role: 'Organizer',
      joinedAt: isoDaysAhead(-200),
      expiresAt: isoDaysAhead(165),
      isVerified: true,
    },
    {
      membershipId: 'mem-a4',
      userId: 'user-204',
      displayName: 'Chidi Nwosu',
      tierName: 'Patron',
      status: 'Active',
      role: 'Treasurer',
      joinedAt: isoDaysAhead(-500),
      expiresAt: isoDaysAhead(-135),
      isVerified: true,
    },
    {
      membershipId: 'mem-a5',
      userId: 'user-205',
      displayName: 'Blessing Adeyemi',
      tierName: 'Standard Member',
      status: 'Suspended',
      role: 'Member',
      joinedAt: isoDaysAhead(-90),
      expiresAt: isoDaysAhead(275),
      isVerified: true,
    },
  ],
};

/**
 * What the signed-in development user may do, per organization.
 *
 * Three different answers on purpose: an Owner, a Member with no management
 * rights at all, and an Organizer with a partial set. A dashboard tested only
 * against an Owner is a dashboard that has never rendered its refusals.
 */
export const MOCK_CAPABILITIES: Record<string, OrganizationCapabilities> = {
  'org-1': {
    organizationId: 'org-1',
    role: 'Owner',
    canManageMembers: true,
    canApproveMembers: true,
    canManageTiers: true,
    canManageEvents: true,
    canManageCampaigns: true,
    canManageVolunteers: true,
    canManagePolls: true,
    canPublishAnnouncements: true,
    canViewAnalytics: true,
    canViewFinancials: true,
  },
  'org-2': {
    organizationId: 'org-2',
    role: 'Member',
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
  },
  'org-3': {
    organizationId: 'org-3',
    role: 'Organizer',
    canManageMembers: false,
    canApproveMembers: false,
    canManageTiers: false,
    canManageEvents: true,
    canManageCampaigns: false,
    canManageVolunteers: true,
    canManagePolls: true,
    canPublishAnnouncements: true,
    canViewAnalytics: true,
    canViewFinancials: false,
  },
};

export const MOCK_MY_ORGANIZATIONS = [
  { organizationId: 'org-1', name: 'Nigerian Community Association UK', logo: MOCK_PROGRAMMES[0].organizationLogo, role: 'Owner' },
  { organizationId: 'org-3', name: 'Ghanaian Professionals Network', logo: MOCK_PROGRAMMES[2].organizationLogo, role: 'Organizer' },
];

// ─────────────────────────────────────────────────────────────────────────────
// EVENT SERIES
// ─────────────────────────────────────────────────────────────────────────────

const WEEKLY_TUESDAY: RecurrenceRule = {
  frequency: 'Weekly',
  interval: 1,
  byWeekday: [2],
  endKind: 'Never',
  until: null,
  count: null,
  // A date the weekly rule genuinely generates, so the expansion produces a
  // cancelled occurrence rather than an exception nothing lines up with. A
  // seed whose exception falls between two occurrences would look like a
  // working exception list while testing nothing.
  exceptions: [dateDaysAhead(14)],
  description: 'Every Tuesday',
};

const MONTHLY_FIRST_SUNDAY: RecurrenceRule = {
  frequency: 'Monthly',
  interval: 1,
  byWeekday: [7],
  byMonthDay: [1, 2, 3, 4, 5, 6, 7],
  endKind: 'AfterCount',
  until: null,
  count: 12,
  exceptions: [],
  description: 'The first Sunday of every month, 12 times',
};

const FORTNIGHTLY_SATURDAY: RecurrenceRule = {
  frequency: 'Weekly',
  interval: 2,
  byWeekday: [6],
  endKind: 'OnDate',
  until: dateDaysAhead(120),
  count: null,
  exceptions: [],
  description: 'Every other Saturday until ' + dateDaysAhead(120),
};

export const MOCK_SERIES: EventSeries[] = [
  {
    seriesId: 'ser-1',
    title: 'Tuesday Evening Bible Study',
    description:
      'A weekly study group open to everyone in the parish. We are working through the book of Acts. Tea and biscuits from 18:30.',
    coverImage: 'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=600',
    category: 'Bible Study',
    status: 'Published',
    recurrence: WEEKLY_TUESDAY,
    location: {
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '88 Queens Road',
      landmark: 'Opposite the bus garage',
      latitude: 51.4735,
      longitude: -0.0561,
    },
    timezone: 'BST',
    price: null,
    organizerId: 'org-2',
    organizerName: 'Redeemed Christian Church — Peckham Parish',
    organizerType: 'Organization',
    organizerIsVerified: true,
    organizationId: 'org-2',
    nextOccurrence: null,
    occurrenceCount: 24,
    completedCount: 12,
    myAttendedCount: 4,
    isSaved: true,
    createdAt: isoDaysAhead(-180),
  },
  {
    seriesId: 'ser-2',
    title: 'Diaspora Business Breakfast',
    description:
      'Monthly networking breakfast for Nigerian and Ghanaian business owners in South London. Bring cards.',
    coverImage: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=600',
    category: 'Networking',
    status: 'Published',
    recurrence: MONTHLY_FIRST_SUNDAY,
    location: {
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '12 Rye Lane',
      latitude: 51.4712,
      longitude: -0.0693,
    },
    timezone: 'BST',
    price: money(1200, 'GBP'),
    organizerId: 'org-1',
    organizerName: 'Nigerian Community Association UK',
    organizerType: 'Organization',
    organizerIsVerified: true,
    organizationId: 'org-1',
    nextOccurrence: null,
    occurrenceCount: 12,
    completedCount: 3,
    myAttendedCount: 1,
    isSaved: false,
    createdAt: isoDaysAhead(-100),
  },
  {
    seriesId: 'ser-3',
    title: 'Saturday Football — Burgess Park',
    description: 'Fortnightly five-a-side. All abilities. Bibs provided, bring your own boots.',
    coverImage: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=600',
    category: 'Football Match',
    status: 'Published',
    recurrence: FORTNIGHTLY_SATURDAY,
    location: {
      cityName: 'London',
      areaName: 'Camberwell',
      addressLine: 'Burgess Park Astro',
      latitude: 51.4809,
      longitude: -0.0865,
    },
    timezone: 'BST',
    price: money(500, 'GBP'),
    organizerId: 'user-123',
    organizerName: 'Joshua',
    organizerType: 'User',
    organizerIsVerified: false,
    organizationId: null,
    nextOccurrence: null,
    occurrenceCount: 9,
    completedCount: 2,
    myAttendedCount: 2,
    isSaved: true,
    createdAt: isoDaysAhead(-40),
  },
  {
    seriesId: 'ser-4',
    title: 'Ghanaian Professionals Mixer',
    description: 'Quarterly evening mixer. Members only — join the network to register.',
    coverImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600',
    category: 'Networking',
    // A draft, so the organizer's "not published yet" state is reachable.
    status: 'Draft',
    recurrence: {
      frequency: 'Custom',
      interval: 3,
      byWeekday: [4],
      endKind: 'Never',
      until: null,
      count: null,
      exceptions: [],
      description: 'Every three months, on a Thursday',
    },
    location: {
      cityName: 'London',
      areaName: 'Croydon',
      addressLine: '4 Park Street',
      latitude: 51.3762,
      longitude: -0.0982,
    },
    timezone: 'BST',
    price: null,
    organizerId: 'org-3',
    organizerName: 'Ghanaian Professionals Network',
    organizerType: 'Organization',
    organizerIsVerified: true,
    organizationId: 'org-3',
    nextOccurrence: null,
    occurrenceCount: 0,
    completedCount: 0,
    myAttendedCount: 0,
    isSaved: false,
    createdAt: isoDaysAhead(-5),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// FUNDRAISING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Campaigns.
 *
 * `causeCode` is the load-bearing field. Where it is set, the handler replaces
 * the progress figures with B15's real `DonationCause` values and marks them
 * `backend`; the donate button is drawn. Where it is null — `camp-4`, a draft —
 * no donation can be taken at all, which is the honest behaviour rather than a
 * simulated collection.
 */
export const MOCK_CAMPAIGNS_SEED: FundraisingCampaign[] = [
  {
    campaignId: 'camp-1',
    title: 'Repatriation fund for the Adeyemi family',
    summary: 'Bringing Mr Adeyemi home to Lagos after 31 years in London.',
    story:
      'Samuel Adeyemi came to London in 1994 and spent his working life driving buses on the 36 route. He passed away on the 2nd of June. His family in Lagos have asked to bring him home, and the cost of repatriation — paperwork, transport and the funeral itself — is beyond what they can meet alone.\n\nEvery pound raised goes directly to the funeral directors handling the repatriation. The association is administering the fund and will publish the receipts.',
    coverImage: 'https://images.unsplash.com/photo-1544027993-37dbfe43562a?w=600',
    gallery: [],
    category: 'Repatriation',
    status: 'Active',
    progress: {
      // Placeholders. The handler replaces all four from B15's real
      // `DonationCause` for `funeral-support-adeyemi` and re-marks them
      // `backend`, so what renders on screen is B15's figure, not this one.
      target: { value: money(400000, 'GBP'), source: 'simulated', gapKey: 'fundraisingCampaign' },
      raised: { value: money(0, 'GBP'), source: 'simulated', gapKey: 'fundraisingCampaign' },
      percentage: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
      supporterCount: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
      deadline: isoDaysAhead(21),
      daysRemaining: 21,
    },
    causeCode: 'funeral-support-adeyemi',
    beneficiaryType: 'Member',
    beneficiaryId: 'user-301',
    beneficiaryName: 'The Adeyemi family',
    urgency: 'Urgent',
    acceptedKinds: ['Monetary'],
    organizerId: 'org-1',
    organizerName: 'Nigerian Community Association UK',
    organizationId: 'org-1',
    isVerified: true,
    countryCode: 'GB',
    locationLabel: 'Peckham, London',
    createdAt: isoDaysAhead(-14),
    publishedAt: isoDaysAhead(-13),
    closedAt: null,
    reviewNote: null,
    canManage: true,
    canDonate: true,
  },
  {
    campaignId: 'camp-2',
    title: 'University Student Bursary Fund',
    summary: 'Bursaries for members’ children starting university this autumn.',
    story:
      'Eleven young people from the association start university in September. The bursary covers the first term’s books and travel — the two costs that catch families out after the tuition loan is spent.\n\nThe fund is administered by the association’s trustees and every award is minuted at the AGM.',
    coverImage: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600',
    gallery: [],
    category: 'Education',
    status: 'Active',
    progress: {
      // Replaced at read time from B15's `student-bursary-fund` cause.
      target: { value: money(1000000, 'GBP'), source: 'simulated', gapKey: 'fundraisingCampaign' },
      raised: { value: money(0, 'GBP'), source: 'simulated', gapKey: 'fundraisingCampaign' },
      percentage: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
      supporterCount: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
      deadline: isoDaysAhead(45),
      daysRemaining: 45,
    },
    causeCode: 'student-bursary-fund',
    beneficiaryType: 'Organization',
    beneficiaryId: 'org-1',
    beneficiaryName: 'Nigerian Community Association UK',
    urgency: 'Moderate',
    acceptedKinds: ['Monetary', 'Goods'],
    organizerId: 'org-1',
    organizerName: 'Nigerian Community Association UK',
    organizationId: 'org-1',
    isVerified: true,
    countryCode: 'GB',
    locationLabel: 'Peckham, London',
    createdAt: isoDaysAhead(-60),
    publishedAt: isoDaysAhead(-58),
    closedAt: null,
    reviewNote: null,
    canManage: true,
    canDonate: true,
  },
  {
    campaignId: 'camp-3',
    title: 'Free Immigration Legal Clinic',
    summary: 'Running costs for the monthly drop-in immigration advice clinic.',
    story:
      'The clinic has seen 340 people since it opened. The advisers give their time; what costs money is the room, the interpreter and the case-management software.\n\nDonations are paused this month while the trustees agree next year’s budget. The clinic is still running.',
    coverImage: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600',
    gallery: [],
    category: 'Legal Support',
    // Paused, so the "donations are paused" state is reachable — with real
    // totals still showing, which is the case worth testing.
    status: 'Paused',
    progress: {
      // Replaced at read time from B15's `legal-clinic-support` cause.
      target: { value: money(300000, 'GBP'), source: 'simulated', gapKey: 'fundraisingCampaign' },
      raised: { value: money(0, 'GBP'), source: 'simulated', gapKey: 'fundraisingCampaign' },
      percentage: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
      supporterCount: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
      deadline: null,
      daysRemaining: null,
    },
    causeCode: 'legal-clinic-support',
    beneficiaryType: 'Organization',
    beneficiaryId: 'org-3',
    beneficiaryName: 'Ghanaian Professionals Network',
    urgency: 'Ongoing',
    acceptedKinds: ['Monetary', 'ProfessionalSkills', 'VolunteerService'],
    organizerId: 'org-3',
    organizerName: 'Ghanaian Professionals Network',
    organizationId: 'org-3',
    isVerified: true,
    countryCode: 'GB',
    locationLabel: 'Peckham, London',
    createdAt: isoDaysAhead(-120),
    publishedAt: isoDaysAhead(-118),
    closedAt: null,
    reviewNote: null,
    canManage: false,
    canDonate: false,
  },
  {
    campaignId: 'camp-4',
    title: 'Independence Day marquee hire',
    summary: 'Draft — not yet submitted for review.',
    story: 'Marquee, tables and a generator for the Independence Day celebration in Burgess Park.',
    coverImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600',
    gallery: [],
    category: 'Community Project',
    status: 'Draft',
    progress: {
      target: { value: money(300000, 'GBP'), source: 'simulated', gapKey: 'fundraisingCampaign' },
      raised: { value: money(0, 'GBP'), source: 'simulated', gapKey: 'fundraisingCampaign' },
      percentage: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
      supporterCount: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
      deadline: isoDaysAhead(70),
      daysRemaining: 70,
    },
    // No cause: a draft has nowhere certified to collect, so it cannot take money.
    causeCode: null,
    beneficiaryType: 'Organization',
    beneficiaryId: 'org-1',
    beneficiaryName: 'Nigerian Community Association UK',
    urgency: 'Moderate',
    acceptedKinds: ['Monetary'],
    organizerId: 'org-1',
    organizerName: 'Nigerian Community Association UK',
    organizationId: 'org-1',
    isVerified: true,
    countryCode: 'GB',
    locationLabel: 'Peckham, London',
    createdAt: isoDaysAhead(-3),
    publishedAt: null,
    closedAt: null,
    reviewNote: null,
    canManage: true,
    canDonate: false,
  },
  {
    campaignId: 'camp-5',
    title: 'Legal fund — Windrush appeals',
    summary: 'Rejected during review. The reason is on the campaign.',
    story: 'Solicitor costs for three members appealing Home Office decisions.',
    coverImage: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600',
    gallery: [],
    category: 'Legal Support',
    status: 'Rejected',
    progress: {
      target: { value: money(500000, 'GBP'), source: 'simulated', gapKey: 'fundraisingCampaign' },
      raised: { value: money(0, 'GBP'), source: 'simulated', gapKey: 'fundraisingCampaign' },
      percentage: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
      supporterCount: { value: 0, source: 'simulated', gapKey: 'fundraisingCampaign' },
      deadline: null,
      daysRemaining: null,
    },
    causeCode: null,
    beneficiaryType: 'Community',
    beneficiaryId: null,
    beneficiaryName: 'Windrush appellants',
    urgency: 'High',
    acceptedKinds: ['Monetary'],
    organizerId: 'org-1',
    organizerName: 'Nigerian Community Association UK',
    organizationId: 'org-1',
    isVerified: false,
    countryCode: 'GB',
    locationLabel: 'London',
    createdAt: isoDaysAhead(-30),
    publishedAt: null,
    closedAt: null,
    reviewNote:
      'We need written confirmation from the instructed solicitors before a legal-costs campaign can be published. Please attach it and resubmit.',
    canManage: true,
    canDonate: false,
  },
];

export const MOCK_CAMPAIGN_UPDATES: Record<string, CampaignUpdate[]> = {
  'camp-1': [
    {
      updateId: 'cu-1',
      campaignId: 'camp-1',
      title: 'Paperwork lodged with the High Commission',
      body: 'The repatriation paperwork went in on Thursday. The funeral directors expect clearance within ten days. Thank you to everyone who has given so far.',
      mediaUrls: [],
      publishedAt: isoDaysAhead(-4),
      authorName: 'Nigerian Community Association UK',
    },
    {
      updateId: 'cu-2',
      campaignId: 'camp-1',
      title: 'Halfway',
      body: 'We passed the halfway mark this morning. The family have asked us to pass on their thanks.',
      mediaUrls: [],
      publishedAt: isoDaysAhead(-8),
      authorName: 'Nigerian Community Association UK',
    },
  ],
  'camp-2': [
    {
      updateId: 'cu-3',
      campaignId: 'camp-2',
      title: 'First four bursaries awarded',
      body: 'The trustees met on Sunday and awarded the first four bursaries. Books are being ordered directly so the money does not pass through the students’ accounts.',
      mediaUrls: [],
      publishedAt: isoDaysAhead(-6),
      authorName: 'Nigerian Community Association UK',
    },
  ],
};

/**
 * Milestones.
 *
 * The `target` figures below line up with the **real** B15 cause totals the
 * handler substitutes — £4,000 for the Adeyemi repatriation, £10,000 for the
 * bursary fund — so a milestone bar and a progress bar on the same screen agree
 * with each other. A seed that disagreed with B15 would look like a bug in the
 * one place a member is most likely to be checking arithmetic.
 */
export const MOCK_CAMPAIGN_MILESTONES: Record<string, CampaignMilestone[]> = {
  'camp-1': [
    { milestoneId: 'cm-1', label: 'Funeral directors’ deposit', target: money(100000, 'GBP'), isReached: true, reachedAt: isoDaysAhead(-10) },
    { milestoneId: 'cm-2', label: 'Transport and documentation', target: money(200000, 'GBP'), isReached: true, reachedAt: isoDaysAhead(-3) },
    { milestoneId: 'cm-3', label: 'Full repatriation cost', target: money(400000, 'GBP'), isReached: false, reachedAt: null },
  ],
  'camp-2': [
    { milestoneId: 'cm-4', label: 'First four bursaries', target: money(250000, 'GBP'), isReached: true, reachedAt: isoDaysAhead(-20) },
    { milestoneId: 'cm-5', label: 'Half the cohort', target: money(500000, 'GBP'), isReached: false, reachedAt: null },
    { milestoneId: 'cm-6', label: 'All eleven students', target: money(1000000, 'GBP'), isReached: false, reachedAt: null },
  ],
};

export const MOCK_FUND_USAGE: Record<string, FundUsageLine[]> = {
  'camp-1': [
    { id: 'fu-1', label: 'Funeral directors', allocated: money(250000, 'GBP'), spent: money(100000, 'GBP'), note: 'Deposit paid 3 July' },
    { id: 'fu-2', label: 'Air freight and documentation', allocated: money(100000, 'GBP'), spent: null, note: 'Due on clearance' },
    { id: 'fu-3', label: 'Family travel', allocated: money(50000, 'GBP'), spent: null, note: null },
  ],
  'camp-2': [
    { id: 'fu-4', label: 'Textbooks and course materials', allocated: money(600000, 'GBP'), spent: money(180000, 'GBP'), note: 'Four students so far' },
    { id: 'fu-5', label: 'Term travel passes', allocated: money(400000, 'GBP'), spent: null, note: 'Bought in September' },
  ],
};

/**
 * Supporters.
 *
 * Two anonymous entries with `userId: null` and no amount — that is what an
 * anonymous donation looks like coming out of B15, which stores no donor
 * identifier at all. The UI must render it without a placeholder that implies
 * a hidden identity it could reveal.
 */
export const MOCK_SUPPORTERS: Record<string, CampaignSupporter[]> = {
  'camp-1': [
    { userId: 'user-401', displayName: 'Ngozi E.', isAnonymous: false, amount: money(10000, 'GBP'), message: 'Rest well, Uncle Sam.', givenAt: isoDaysAhead(-2) },
    { userId: null, displayName: 'Anonymous', isAnonymous: true, amount: null, message: null, givenAt: isoDaysAhead(-3) },
    { userId: 'user-402', displayName: 'Kwame A.', isAnonymous: false, amount: money(5000, 'GBP'), message: null, givenAt: isoDaysAhead(-4) },
    { userId: null, displayName: 'Anonymous', isAnonymous: true, amount: null, message: 'From a fellow 36 driver.', givenAt: isoDaysAhead(-5) },
    { userId: 'user-403', displayName: 'Folake B.', isAnonymous: false, amount: money(2500, 'GBP'), message: null, givenAt: isoDaysAhead(-6) },
  ],
  'camp-2': [
    { userId: 'user-404', displayName: 'Yaw M.', isAnonymous: false, amount: money(20000, 'GBP'), message: 'For the students.', givenAt: isoDaysAhead(-7) },
    { userId: 'user-405', displayName: 'Amara O.', isAnonymous: false, amount: money(1500, 'GBP'), message: null, givenAt: isoDaysAhead(-9) },
  ],
  'camp-3': [
    { userId: null, displayName: 'Anonymous', isAnonymous: true, amount: null, message: null, givenAt: isoDaysAhead(-15) },
    { userId: 'user-406', displayName: 'Efua D.', isAnonymous: false, amount: money(7500, 'GBP'), message: 'The clinic sorted my sister’s status.', givenAt: isoDaysAhead(-18) },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// VOLUNTEERING
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_OPPORTUNITIES: VolunteerOpportunity[] = [
  {
    opportunityId: 'opp-1',
    title: 'Stewards for the Independence Day celebration',
    description:
      'We need eight stewards for the Independence Day celebration in Burgess Park. Duties are directing people to the gates, keeping the food queue moving and helping the elders find seats. Full briefing at 09:00 on the day.',
    coverImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600',
    cause: 'Community Events',
    status: 'Published',
    organizationId: 'org-1',
    organizationName: 'Nigerian Community Association UK',
    organizationLogo: MOCK_PROGRAMMES[0].organizationLogo,
    isVerified: true,
    location: {
      cityName: 'London',
      areaName: 'Camberwell',
      addressLine: 'Burgess Park, Albany Road',
      latitude: 51.4809,
      longitude: -0.0865,
    },
    startDate: dateDaysAhead(18),
    endDate: dateDaysAhead(18),
    shifts: [
      { shiftId: 'sh-1', opportunityId: 'opp-1', label: 'Morning — gates', date: dateDaysAhead(18), startTime: '09:00', endTime: '13:00', capacity: 4, filledCount: 2, isFull: false },
      { shiftId: 'sh-2', opportunityId: 'opp-1', label: 'Afternoon — food queue', date: dateDaysAhead(18), startTime: '13:00', endTime: '17:00', capacity: 4, filledCount: 4, isFull: true },
    ],
    requiredSkills: ['Crowd management'],
    requirements: [
      { id: 'vr1', label: 'Over 18', kind: 'Age', isMet: true },
      { id: 'vr2', label: 'Verified Diaspora account', kind: 'Verification', isMet: true },
    ],
    minimumAge: 18,
    capacity: 8,
    filledCount: 6,
    isFull: false,
    applicationDeadline: dateDaysAhead(14),
    myApplicationStatus: 'NotApplied',
    myApplicationId: null,
    canApply: true,
    cannotApplyReason: null,
    canManage: true,
    createdAt: isoDaysAhead(-20),
  },
  {
    opportunityId: 'opp-2',
    title: 'Saturday school classroom assistant',
    description:
      'Support a teacher in the Yoruba or Twi class on Saturday mornings during term time. No teaching experience needed — you will be paired with an experienced volunteer for the first three weeks.',
    coverImage: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600',
    cause: 'Education',
    status: 'Published',
    organizationId: 'org-1',
    organizationName: 'Nigerian Community Association UK',
    organizationLogo: MOCK_PROGRAMMES[0].organizationLogo,
    isVerified: true,
    location: {
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '12 Rye Lane',
      latitude: 51.4712,
      longitude: -0.0693,
    },
    startDate: dateDaysAhead(11),
    endDate: null,
    shifts: [
      { shiftId: 'sh-3', opportunityId: 'opp-2', label: 'Saturday morning', date: dateDaysAhead(11), startTime: '10:00', endTime: '12:30', capacity: 6, filledCount: 3, isFull: false },
    ],
    requiredSkills: ['Yoruba', 'Twi', 'Working with children'],
    requirements: [
      { id: 'vr3', label: 'Over 18', kind: 'Age', isMet: true },
      { id: 'vr4', label: 'DBS check', kind: 'Document', isMet: false, actionRoute: '/verification/country' },
    ],
    minimumAge: 18,
    capacity: 6,
    filledCount: 3,
    isFull: false,
    applicationDeadline: null,
    // Pending, so the volunteer dashboard has something in flight to show.
    myApplicationStatus: 'Pending',
    myApplicationId: 'vapp-1',
    canApply: false,
    cannotApplyReason: 'You have already applied. The organiser is reviewing your application.',
    canManage: true,
    createdAt: isoDaysAhead(-35),
  },
  {
    opportunityId: 'opp-3',
    title: 'Wednesday lunch club — kitchen help',
    description: 'Help prepare and serve the Wednesday lunch for our elders. Food hygiene training provided.',
    coverImage: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600',
    cause: 'Elder Care',
    status: 'Published',
    organizationId: 'org-2',
    organizationName: 'Redeemed Christian Church — Peckham Parish',
    organizationLogo: MOCK_PROGRAMMES[1].organizationLogo,
    isVerified: true,
    location: {
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '88 Queens Road',
      latitude: 51.4735,
      longitude: -0.0561,
    },
    startDate: dateDaysAhead(2),
    endDate: null,
    shifts: [
      { shiftId: 'sh-4', opportunityId: 'opp-3', label: 'Prep — 10:00', date: dateDaysAhead(2), startTime: '10:00', endTime: '12:00', capacity: 3, filledCount: 3, isFull: true },
      { shiftId: 'sh-5', opportunityId: 'opp-3', label: 'Service — 12:00', date: dateDaysAhead(2), startTime: '12:00', endTime: '14:30', capacity: 4, filledCount: 4, isFull: true },
    ],
    requiredSkills: ['Food preparation'],
    requirements: [{ id: 'vr5', label: 'Over 16', kind: 'Age', isMet: true }],
    minimumAge: 16,
    capacity: 7,
    filledCount: 7,
    // Full, so §51's "Volunteer opportunity full" is reachable.
    isFull: true,
    applicationDeadline: null,
    myApplicationStatus: 'NotApplied',
    myApplicationId: null,
    canApply: false,
    cannotApplyReason: 'Every shift for this opportunity is full. Check back — places sometimes open up.',
    canManage: false,
    createdAt: isoDaysAhead(-50),
  },
  {
    opportunityId: 'opp-4',
    title: 'Pro bono immigration advice clinic',
    description:
      'Qualified immigration advisers to run a monthly drop-in clinic. OISC Level 2 or solicitor with immigration practice required.',
    coverImage: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600',
    cause: 'Legal Support',
    status: 'Published',
    organizationId: 'org-3',
    organizationName: 'Ghanaian Professionals Network',
    organizationLogo: MOCK_PROGRAMMES[2].organizationLogo,
    isVerified: true,
    location: {
      cityName: 'London',
      areaName: 'Croydon',
      addressLine: '4 Park Street',
      latitude: 51.3762,
      longitude: -0.0982,
    },
    startDate: dateDaysAhead(25),
    endDate: null,
    shifts: [
      { shiftId: 'sh-6', opportunityId: 'opp-4', label: 'Monthly clinic', date: dateDaysAhead(25), startTime: '18:00', endTime: '20:00', capacity: 3, filledCount: 1, isFull: false },
    ],
    requiredSkills: ['Immigration law', 'OISC Level 2'],
    requirements: [
      { id: 'vr6', label: 'Professional accreditation', kind: 'Document', isMet: false },
      { id: 'vr7', label: 'Verified Diaspora account', kind: 'Verification', isMet: true },
    ],
    minimumAge: 21,
    capacity: 3,
    filledCount: 1,
    isFull: false,
    applicationDeadline: dateDaysAhead(20),
    myApplicationStatus: 'NotApplied',
    myApplicationId: null,
    canApply: false,
    cannotApplyReason: 'This opportunity needs professional accreditation we have not been able to confirm on your account.',
    canManage: true,
    createdAt: isoDaysAhead(-15),
  },
];

export const MOCK_VOLUNTEER_APPLICATIONS: VolunteerApplication[] = [
  {
    applicationId: 'vapp-1',
    opportunityId: 'opp-2',
    opportunityTitle: 'Saturday school classroom assistant',
    organizationName: 'Nigerian Community Association UK',
    status: 'Pending',
    answers: {
      why: 'I grew up speaking Yoruba at home and would like to help the children keep it.',
      availability: 'Every Saturday during term time.',
    },
    submittedAt: isoDaysAhead(-6),
    decidedAt: null,
    decisionReason: null,
    waitlistPosition: null,
    assignment: null,
  },
  {
    applicationId: 'vapp-2',
    opportunityId: 'opp-1',
    opportunityTitle: 'Stewards for the Independence Day celebration',
    organizationName: 'Nigerian Community Association UK',
    status: 'Approved',
    answers: { why: 'Happy to help on the gates.' },
    submittedAt: isoDaysAhead(-12),
    decidedAt: isoDaysAhead(-10),
    decisionReason: null,
    waitlistPosition: null,
    assignment: {
      assignmentId: 'vasg-1',
      applicationId: 'vapp-2',
      opportunityId: 'opp-1',
      opportunityTitle: 'Stewards for the Independence Day celebration',
      shiftId: 'sh-1',
      shiftLabel: 'Morning — gates',
      date: dateDaysAhead(18),
      startTime: '09:00',
      endTime: '13:00',
      location: {
        cityName: 'London',
        areaName: 'Camberwell',
        addressLine: 'Burgess Park, Albany Road',
      },
      status: 'Confirmed',
      checkedInAt: null,
      checkedOutAt: null,
      confirmedHours: null,
    },
  },
  {
    applicationId: 'vapp-3',
    opportunityId: 'opp-3',
    opportunityTitle: 'Wednesday lunch club — kitchen help',
    organizationName: 'Redeemed Christian Church — Peckham Parish',
    status: 'Waitlisted',
    answers: {},
    submittedAt: isoDaysAhead(-25),
    decidedAt: isoDaysAhead(-24),
    decisionReason: 'Both shifts are full. You are third on the list.',
    waitlistPosition: 3,
    assignment: null,
  },
];

export const MOCK_ASSIGNMENTS: VolunteerAssignment[] = [
  MOCK_VOLUNTEER_APPLICATIONS[1].assignment as VolunteerAssignment,
  {
    assignmentId: 'vasg-2',
    applicationId: 'vapp-0',
    opportunityId: 'opp-3',
    opportunityTitle: 'Wednesday lunch club — kitchen help',
    shiftId: 'sh-4',
    shiftLabel: 'Prep — 10:00',
    date: dateDaysAhead(-7),
    startTime: '10:00',
    endTime: '12:00',
    location: { cityName: 'London', areaName: 'Peckham', addressLine: '88 Queens Road' },
    status: 'Completed',
    checkedInAt: isoDaysAhead(-7),
    checkedOutAt: isoDaysAhead(-7),
    confirmedHours: 2,
  },
];

export const MOCK_APPLICANTS: Record<string, VolunteerApplicant[]> = {
  'opp-1': [
    { applicationId: 'vapp-10', userId: 'user-501', displayName: 'Sade Coker', status: 'Pending', skills: ['Crowd management', 'First aid'], submittedAt: isoDaysAhead(-3), answers: { why: 'I stewarded last year.' }, isVerified: true },
    { applicationId: 'vapp-11', userId: 'user-502', displayName: 'Kofi Mensah', status: 'Pending', skills: [], submittedAt: isoDaysAhead(-2), answers: { why: 'First time, keen to help.' }, isVerified: false },
    { applicationId: 'vapp-12', userId: 'user-503', displayName: 'Ify Nwachukwu', status: 'Approved', skills: ['Crowd management'], submittedAt: isoDaysAhead(-8), answers: {}, isVerified: true },
    { applicationId: 'vapp-13', userId: 'user-504', displayName: 'Ama Boateng', status: 'Waitlisted', skills: [], submittedAt: isoDaysAhead(-9), answers: {}, isVerified: true },
  ],
  'opp-2': [
    { applicationId: 'vapp-1', userId: 'user-123', displayName: 'Joshua', status: 'Pending', skills: ['Yoruba'], submittedAt: isoDaysAhead(-6), answers: { why: 'I grew up speaking Yoruba at home.' }, isVerified: true },
    { applicationId: 'vapp-14', userId: 'user-505', displayName: 'Grace Owusu', status: 'Approved', skills: ['Twi', 'Working with children'], submittedAt: isoDaysAhead(-20), answers: {}, isVerified: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// POLLS
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_POLLS: CommunityPoll[] = [
  {
    pollId: 'poll-1',
    question: 'Which date works best for the Independence Day celebration?',
    description: 'The park is available on three Saturdays. We will go with whichever gets the most votes.',
    status: 'Open',
    votingType: 'SingleChoice',
    audience: 'OrganizationMembers',
    options: [
      { optionId: 'po-1', label: 'Saturday 26 September', description: 'Clashes with the Ghana Union picnic.', sortOrder: 1 },
      { optionId: 'po-2', label: 'Saturday 3 October', description: null, sortOrder: 2 },
      { optionId: 'po-3', label: 'Saturday 10 October', description: 'Later, but the marquee is cheaper.', sortOrder: 3 },
    ],
    maxSelections: null,
    isAnonymous: false,
    allowsChange: true,
    organizationId: 'org-1',
    organizationName: 'Nigerian Community Association UK',
    createdBy: 'org-1',
    opensAt: isoDaysAhead(-5),
    closesAt: isoDaysAhead(6),
    totalResponses: 87,
    hasVoted: false,
    myResponse: null,
    canVote: true,
    cannotVoteReason: null,
    canManage: true,
    createdAt: isoDaysAhead(-6),
  },
  {
    pollId: 'poll-2',
    question: 'What should the welfare fund prioritise this year?',
    description: 'Pick up to two.',
    status: 'Open',
    votingType: 'MultipleChoice',
    audience: 'OrganizationMembers',
    options: [
      { optionId: 'po-4', label: 'Funeral and repatriation support', sortOrder: 1, description: null },
      { optionId: 'po-5', label: 'Student scholarships', sortOrder: 2, description: null },
      { optionId: 'po-6', label: 'Emergency housing help', sortOrder: 3, description: null },
      { optionId: 'po-7', label: 'Legal advice clinic', sortOrder: 4, description: null },
    ],
    maxSelections: 2,
    isAnonymous: true,
    allowsChange: false,
    organizationId: 'org-1',
    organizationName: 'Nigerian Community Association UK',
    createdBy: 'org-1',
    opensAt: isoDaysAhead(-12),
    closesAt: isoDaysAhead(3),
    totalResponses: 143,
    // Already voted, so §51's "already voted" state is reachable.
    hasVoted: true,
    myResponse: {
      responseId: 'pr-1',
      pollId: 'poll-2',
      selectedOptionIds: ['po-4', 'po-6'],
      openResponse: null,
      respondedAt: isoDaysAhead(-9),
    },
    canVote: false,
    cannotVoteReason: 'You have already voted, and this poll does not allow changing your answer.',
    canManage: true,
    createdAt: isoDaysAhead(-13),
  },
  {
    pollId: 'poll-3',
    question: 'What would make the Wednesday lunch club better?',
    description: 'Tell us in your own words.',
    status: 'Open',
    votingType: 'OpenResponse',
    audience: 'Public',
    options: [],
    maxSelections: null,
    isAnonymous: true,
    allowsChange: false,
    organizationId: 'org-2',
    organizationName: 'Redeemed Christian Church — Peckham Parish',
    createdBy: 'org-2',
    opensAt: isoDaysAhead(-2),
    closesAt: isoDaysAhead(14),
    totalResponses: 19,
    hasVoted: false,
    myResponse: null,
    canVote: true,
    cannotVoteReason: null,
    canManage: false,
    createdAt: isoDaysAhead(-2),
  },
  {
    pollId: 'poll-4',
    question: 'Should the network move the mixer to a weekday evening?',
    description: null,
    status: 'Closed',
    votingType: 'SingleChoice',
    audience: 'OrganizationMembers',
    options: [
      { optionId: 'po-8', label: 'Yes — weekday evening', sortOrder: 1, description: null },
      { optionId: 'po-9', label: 'No — keep it on Saturday', sortOrder: 2, description: null },
    ],
    maxSelections: null,
    isAnonymous: false,
    allowsChange: false,
    organizationId: 'org-3',
    organizationName: 'Ghanaian Professionals Network',
    createdBy: 'org-3',
    opensAt: isoDaysAhead(-40),
    closesAt: isoDaysAhead(-10),
    totalResponses: 64,
    hasVoted: true,
    myResponse: {
      responseId: 'pr-2',
      pollId: 'poll-4',
      selectedOptionIds: ['po-8'],
      openResponse: null,
      respondedAt: isoDaysAhead(-30),
    },
    canVote: false,
    cannotVoteReason: 'Voting closed on ' + dateDaysAhead(-10) + '.',
    canManage: true,
    createdAt: isoDaysAhead(-41),
  },
];

/**
 * The vote tallies the simulation keeps.
 *
 * Held here rather than on the poll object because §24 is emphatic: results are
 * computed by the server and returned, never derived by the client from a poll
 * it is holding. Keeping the counts out of `CommunityPoll` makes that
 * structurally true — a component with a poll in hand has nothing to add up.
 */
export const MOCK_POLL_TALLIES: Record<string, Record<string, number>> = {
  'poll-1': { 'po-1': 12, 'po-2': 51, 'po-3': 24 },
  'poll-2': { 'po-4': 96, 'po-5': 61, 'po-6': 74, 'po-7': 38 },
  'poll-3': {},
  'poll-4': { 'po-8': 41, 'po-9': 23 },
};

export const MOCK_OPEN_RESPONSES: Record<string, string[]> = {
  'poll-3': [
    'Start half an hour later so people can get back from the school run.',
    'More jollof, less pasta.',
    'A lift home for those of us on Bellenden Road would make all the difference.',
  ],
};

export const MOCK_POLL_RESPONSES: PollResponse[] = [
  MOCK_POLLS[1].myResponse as PollResponse,
  MOCK_POLLS[3].myResponse as PollResponse,
];

// ─────────────────────────────────────────────────────────────────────────────
// ANNOUNCEMENTS, NEIGHBOURHOOD, RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_ANNOUNCEMENTS: CommunityAnnouncement[] = [
  {
    announcementId: 'ann-1',
    scope: 'Organization',
    scopeId: 'org-1',
    scopeName: 'Nigerian Community Association UK',
    title: 'Annual general meeting — 2 August',
    body: 'The AGM will be held at Rye Lane on Saturday 2 August at 14:00. The accounts and the welfare fund report will be circulated a week beforehand. Standard and Patron members may vote.',
    mediaUrls: [],
    authorName: 'Nigerian Community Association UK',
    isPinned: true,
    publishedAt: isoDaysAhead(-1),
    actionRoute: '/community-life/org/org-1',
  },
  {
    announcementId: 'ann-2',
    scope: 'Campaign',
    scopeId: 'camp-1',
    scopeName: 'Repatriation fund for the Adeyemi family',
    title: 'Paperwork lodged with the High Commission',
    body: 'The repatriation paperwork went in on Thursday. Clearance is expected within ten days.',
    mediaUrls: [],
    authorName: 'Nigerian Community Association UK',
    isPinned: false,
    publishedAt: isoDaysAhead(-4),
    actionRoute: '/community-life/campaign/camp-1',
  },
  {
    announcementId: 'ann-3',
    scope: 'Neighborhood',
    scopeId: 'nbh-peckham',
    scopeName: 'Peckham',
    title: 'Rye Lane road closure, Saturday',
    body: 'Rye Lane will be closed between the station and Peckham Square from 08:00 to 18:00 on Saturday for the street market. The 36 and 171 are on diversion.',
    mediaUrls: [],
    authorName: 'Peckham neighbourhood',
    isPinned: false,
    publishedAt: isoDaysAhead(-2),
    actionRoute: '/neighborhood/nbh-peckham',
  },
  {
    announcementId: 'ann-4',
    scope: 'Event',
    scopeId: 'ser-1',
    scopeName: 'Tuesday Evening Bible Study',
    title: 'No study on 28 July',
    body: 'There will be no Bible study on 28 July — the hall is booked for the youth programme. We resume on 4 August.',
    mediaUrls: [],
    authorName: 'Redeemed Christian Church — Peckham Parish',
    isPinned: false,
    publishedAt: isoDaysAhead(-3),
    actionRoute: '/community-life/series/ser-1',
  },
];

export const MOCK_RECOMMENDATIONS: CommunityRecommendation[] = [
  {
    recommendationId: 'crec-1',
    entityType: 'membership',
    entityId: 'org-1',
    title: 'Nigerian Community Association UK',
    subtitle: 'Membership from £25 a year',
    imageUrl: MOCK_PROGRAMMES[0].organizationLogo,
    reason: 'You have saved four events hosted by this association',
    score: 0.92,
    actionRoute: '/community-life/membership/org-1',
  },
  {
    recommendationId: 'crec-2',
    entityType: 'opportunity',
    entityId: 'opp-2',
    title: 'Saturday school classroom assistant',
    subtitle: 'Peckham · Saturdays',
    imageUrl: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=300',
    reason: 'You listed Yoruba on your profile',
    score: 0.84,
    actionRoute: '/community-life/volunteer/opp-2',
  },
  {
    recommendationId: 'crec-3',
    entityType: 'campaign',
    entityId: 'camp-2',
    title: 'University Student Bursary Fund',
    subtitle: 'Education · Peckham',
    imageUrl: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=300',
    reason: 'Members near you have supported this',
    score: 0.71,
    actionRoute: '/community-life/campaign/camp-2',
  },
  {
    recommendationId: 'crec-4',
    entityType: 'series',
    entityId: 'ser-3',
    title: 'Saturday Football — Burgess Park',
    subtitle: 'Fortnightly · 1.4 km away',
    imageUrl: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=300',
    reason: 'Close to you, and you have attended twice',
    score: 0.68,
    actionRoute: '/community-life/series/ser-3',
  },
  {
    recommendationId: 'crec-5',
    entityType: 'poll',
    entityId: 'poll-1',
    title: 'Which date works best for the Independence Day celebration?',
    subtitle: 'Closes in 6 days',
    imageUrl: null,
    reason: 'Open to members of an association you follow',
    score: 0.6,
    actionRoute: '/community-life/poll/poll-1',
  },
];

export const MOCK_NEIGHBORHOODS: Record<string, { id: string; name: string }> = {
  'nbh-peckham': { id: 'nbh-peckham', name: 'Peckham' },
  'nbh-camberwell': { id: 'nbh-camberwell', name: 'Camberwell' },
  'nbh-croydon': { id: 'nbh-croydon', name: 'Croydon' },
};

/** Which named neighbourhood a B12 `areaName` maps to. The simulated binding. */
export const AREA_TO_NEIGHBORHOOD: Record<string, string> = {
  peckham: 'nbh-peckham',
  camberwell: 'nbh-camberwell',
  croydon: 'nbh-croydon',
};
