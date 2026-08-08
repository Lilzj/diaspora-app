// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Multi-Community development data (Frontend Phase 13, §65)
//
// ⚠ DEVELOPMENT DATA ONLY. NOT PRODUCTION DATA. ⚠
//
// §65: use realistic development communities, and keep them clearly separated
// from production data. Three things enforce that separation:
//
//   * **Every id carries the `dev-` prefix.** `lib/community/persistence.ts`
//     discards a persisted `dev-` id when the build cannot reach the adapter, so
//     a device that ran a preview build and then took a production update never
//     opens pointing at a community that does not exist — and never sends a
//     fabricated id to a real route.
//
//   * **This module is only imported by the handler.** No screen, component or
//     repository imports it. §64 forbids mock arrays inside screens, and the one
//     import edge is what makes that checkable.
//
//   * **The handler is not registered in a release build.** See
//     `config/multi-community-gaps.ts`.
//
// ── Why these communities, and why the awkward ones are here ─────────────────
//
// The brief names Nigerian, Ghanaian and Indian as development scenarios. Those
// three alone would let a `NationalDiaspora`-shaped assumption survive the phase
// undetected, so the set deliberately includes the cases that break it:
//
//   `dev-community-west-african`   a `RegionalDiaspora` with **no country of
//                                  origin at all**. It cannot be projected onto
//                                  a country parameter, which is how the
//                                  `unexpressed` path in `projectScope()` gets
//                                  exercised in normal development rather than
//                                  only in a unit test.
//   `dev-community-yoruba`         `EthnoLinguistic`, sharing Nigeria as its
//                                  origin with `dev-community-nigerian`. Two
//                                  communities, one country — the many-to-one
//                                  mapping §2 requires the architecture to
//                                  survive.
//   `dev-community-nigerian-mcr`   a `CityChapter`: Nigerian origin, UK
//                                  presence. Origin and residence are different
//                                  fields and this is the record that proves it.
//   `dev-community-caribbean`      a second country-less regional community, so
//                                  "the one without a flag" is not a special
//                                  case.
//   `dev-community-tamil`          `EthnoLinguistic` sharing India.
//   `dev-community-pending`        `Pending` status — readable, not joinable.
//   `dev-community-suspended`      `Suspended`, with a reason, so §74's blocked
//                                  state is reachable by navigation.
//   `dev-community-archived`       `Archived`.
//   `dev-community-private`        `Private` visibility, so the privacy path is
//                                  exercised.
//
// ── Provenance is not decoration ─────────────────────────────────────────────
//
// Member counts here are `simulated`, always, because there is no membership
// record on the platform to count (GAP-007). The counts that *are* derivable from
// certified routes — events, organizations, and the cross-domain nearby
// aggregates — are marked `backend` by the handler when it has them. A screen
// therefore shows a real event count beside an estimated member count, each
// marked, which is the honest rendering and the one §29 requires.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Community,
  CommunityCapabilities,
  CommunityInitiative,
  CommunityMembership,
  CommunityNotice,
  CommunityReport,
  CommunityRoleHolder,
  CommunityRule,
} from '@/types/community-directory';
import { DEV_COMMUNITY_ID_PREFIX } from '@/lib/community/persistence';

/** The prefix, re-exported so this file and the guard cannot drift. */
export const DEV_PREFIX = DEV_COMMUNITY_ID_PREFIX;

function devId(slug: string): string {
  return `${DEV_PREFIX}community-${slug}`;
}

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function isoDaysAhead(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Every member count in this file is an estimate. This says so, once. */
function estimatedMembers(count: number) {
  return { value: count, source: 'simulated' as const, gapKey: 'communityStatistics' };
}

// ═════════════════════════════════════════════════════════════════════════════
// THE COMMUNITIES
// ═════════════════════════════════════════════════════════════════════════════

export const MOCK_COMMUNITIES: Community[] = [
  {
    id: devId('nigerian'),
    slug: 'nigerian',
    name: 'Nigerian',
    type: 'NationalDiaspora',
    origin: { countryCode: 'NG', countryName: 'Nigeria', flag: '🇳🇬', regionName: 'West Africa' },
    identity: { iconName: 'people-outline', accentColor: '#0F8F4F', logoUrl: null },
    tagline: 'Nigerians building lives abroad',
    description:
      'A community for Nigerians living outside Nigeria — sharing guides, opportunities, housing leads and the practical knowledge that makes a new country workable.',
    status: 'Active',
    visibility: 'Public',
    primaryLanguage: 'en',
    supportedLanguages: ['en', 'yo', 'ig', 'ha'],
    memberCount: estimatedMembers(48_200),
    presenceCountryCodes: ['GB', 'US', 'CA', 'MU', 'ZA', 'AE'],
    createdAt: isoDaysAgo(900),
    updatedAt: isoDaysAgo(2),
  },
  {
    id: devId('ghanaian'),
    slug: 'ghanaian',
    name: 'Ghanaian',
    type: 'NationalDiaspora',
    origin: { countryCode: 'GH', countryName: 'Ghana', flag: '🇬🇭', regionName: 'West Africa' },
    identity: { iconName: 'people-outline', accentColor: '#C8A02C', logoUrl: null },
    tagline: 'Ghanaians at home in the world',
    description:
      'Ghanaians abroad, and the guides, events and businesses that connect them. Strong presence in London, Toronto and Hamburg.',
    status: 'Active',
    visibility: 'Public',
    primaryLanguage: 'en',
    supportedLanguages: ['en', 'tw'],
    memberCount: estimatedMembers(19_400),
    presenceCountryCodes: ['GB', 'US', 'CA', 'DE', 'NL'],
    createdAt: isoDaysAgo(870),
    updatedAt: isoDaysAgo(5),
  },
  {
    id: devId('indian'),
    slug: 'indian',
    name: 'Indian',
    type: 'NationalDiaspora',
    origin: { countryCode: 'IN', countryName: 'India', flag: '🇮🇳', regionName: 'South Asia' },
    identity: { iconName: 'people-outline', accentColor: '#D4761E', logoUrl: null },
    tagline: 'The Indian diaspora, wherever it lands',
    description:
      'One of the largest diaspora communities on the platform, spanning student arrivals, skilled migration and long-settled families.',
    status: 'Active',
    visibility: 'Public',
    primaryLanguage: 'en',
    supportedLanguages: ['en', 'hi', 'ta', 'te', 'ml', 'gu'],
    memberCount: estimatedMembers(126_000),
    presenceCountryCodes: ['GB', 'US', 'CA', 'AE', 'AU', 'MU', 'SG'],
    createdAt: isoDaysAgo(880),
    updatedAt: isoDaysAgo(1),
  },

  // The country-less case. `origin.countryCode` is deliberately null.
  {
    id: devId('west-african'),
    slug: 'west-african',
    name: 'West African',
    type: 'RegionalDiaspora',
    origin: { countryCode: null, countryName: null, flag: null, regionName: 'West Africa' },
    identity: { iconName: 'globe-outline', accentColor: '#1F7A6B', logoUrl: null },
    tagline: 'Across the region, not one country',
    description:
      'A regional community spanning Nigeria, Ghana, Senegal, Sierra Leone, Côte d’Ivoire and their neighbours — for the many things that are shared across the region rather than specific to one country.',
    status: 'Active',
    visibility: 'Public',
    primaryLanguage: 'en',
    supportedLanguages: ['en', 'fr'],
    memberCount: estimatedMembers(31_700),
    presenceCountryCodes: ['GB', 'FR', 'US', 'CA'],
    createdAt: isoDaysAgo(600),
    updatedAt: isoDaysAgo(9),
  },
  {
    id: devId('caribbean'),
    slug: 'caribbean',
    name: 'Caribbean',
    type: 'RegionalDiaspora',
    origin: { countryCode: null, countryName: null, flag: null, regionName: 'Caribbean' },
    identity: { iconName: 'globe-outline', accentColor: '#2477B3', logoUrl: null },
    tagline: 'Islands, plural',
    description:
      'A regional community for the Caribbean diaspora — Jamaica, Trinidad and Tobago, Barbados, Guyana and beyond.',
    status: 'Active',
    visibility: 'Public',
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
    memberCount: estimatedMembers(22_800),
    presenceCountryCodes: ['GB', 'US', 'CA'],
    createdAt: isoDaysAgo(540),
    updatedAt: isoDaysAgo(14),
  },

  // Two communities sharing one country of origin. The many-to-one case.
  {
    id: devId('yoruba'),
    slug: 'yoruba',
    name: 'Yorùbá',
    type: 'EthnoLinguistic',
    origin: { countryCode: 'NG', countryName: 'Nigeria', flag: '🇳🇬', regionName: 'West Africa' },
    identity: { iconName: 'language-outline', accentColor: '#7A4FB5', logoUrl: null },
    tagline: 'Èdè àti àṣà',
    description:
      'A language and culture community that crosses national borders — Nigeria, Benin and Togo — and is not the same thing as any one of them.',
    status: 'Active',
    visibility: 'Public',
    primaryLanguage: 'yo',
    supportedLanguages: ['yo', 'en'],
    memberCount: estimatedMembers(8_900),
    presenceCountryCodes: ['GB', 'US', 'BR'],
    createdAt: isoDaysAgo(420),
    updatedAt: isoDaysAgo(21),
  },
  {
    id: devId('tamil'),
    slug: 'tamil',
    name: 'Tamil',
    type: 'EthnoLinguistic',
    origin: { countryCode: 'IN', countryName: 'India', flag: '🇮🇳', regionName: 'South Asia' },
    identity: { iconName: 'language-outline', accentColor: '#B5364F', logoUrl: null },
    tagline: 'தமிழ் சமூகம்',
    description:
      'A language community spanning India, Sri Lanka, Malaysia, Singapore and Mauritius — one of the oldest diasporas on the platform.',
    status: 'Active',
    visibility: 'Public',
    primaryLanguage: 'ta',
    supportedLanguages: ['ta', 'en'],
    memberCount: estimatedMembers(27_300),
    presenceCountryCodes: ['GB', 'CA', 'MY', 'SG', 'MU', 'AU'],
    createdAt: isoDaysAgo(700),
    updatedAt: isoDaysAgo(4),
  },

  // Origin and residence as separate fields, in one record.
  {
    id: devId('nigerian-mcr'),
    slug: 'nigerian-manchester',
    name: 'Nigerians in Manchester',
    type: 'CityChapter',
    origin: { countryCode: 'NG', countryName: 'Nigeria', flag: '🇳🇬', regionName: 'West Africa' },
    identity: { iconName: 'location-outline', accentColor: '#0F8F4F', logoUrl: null },
    tagline: 'Greater Manchester chapter',
    description:
      'A place-bound chapter: Nigerian origin, Manchester life. Local meet-ups, landlord leads, and who to call when the boiler goes.',
    status: 'Active',
    visibility: 'Public',
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
    memberCount: estimatedMembers(1_240),
    presenceCountryCodes: ['GB'],
    createdAt: isoDaysAgo(300),
    updatedAt: isoDaysAgo(3),
  },

  // Lifecycle cases, so §74 and §75 are reachable by navigation rather than only
  // by unit test.
  {
    id: devId('filipino'),
    slug: 'filipino',
    name: 'Filipino',
    type: 'NationalDiaspora',
    origin: { countryCode: 'PH', countryName: 'Philippines', flag: '🇵🇭', regionName: 'South-East Asia' },
    identity: { iconName: 'people-outline', accentColor: '#1F5FA8', logoUrl: null },
    tagline: 'Kababayan abroad',
    description: 'Filipinos overseas — care work, seafaring, healthcare and family remittances.',
    status: 'Pending',
    statusReason:
      'This community is being set up. You can look around, but joining opens once its moderators are confirmed.',
    visibility: 'Public',
    primaryLanguage: 'en',
    supportedLanguages: ['en', 'tl'],
    memberCount: null,
    presenceCountryCodes: ['AE', 'SA', 'GB', 'US', 'CA'],
    createdAt: isoDaysAgo(12),
    updatedAt: isoDaysAgo(1),
  },
  {
    id: devId('suspended'),
    slug: 'suspended-example',
    name: 'Riverside Arrivals',
    type: 'InterestCommunity',
    origin: { countryCode: null, countryName: null, flag: null, regionName: null },
    identity: { iconName: 'pause-circle-outline', accentColor: null, logoUrl: null },
    tagline: 'Temporarily paused',
    description: 'An interest community for recent arrivals in riverside boroughs.',
    status: 'Suspended',
    statusReason:
      'This community is paused while reports about several posts are reviewed. Existing members keep their membership; new posts are closed until the review finishes.',
    visibility: 'Public',
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
    memberCount: estimatedMembers(410),
    presenceCountryCodes: ['GB'],
    createdAt: isoDaysAgo(200),
    updatedAt: isoDaysAgo(6),
  },
  {
    id: devId('archived'),
    slug: 'archived-example',
    name: 'Old Kent Road Newcomers',
    type: 'InterestCommunity',
    origin: { countryCode: null, countryName: null, flag: null, regionName: null },
    identity: { iconName: 'archive-outline', accentColor: null, logoUrl: null },
    tagline: 'Closed, kept for its guides',
    description:
      'This community closed when its organisers merged it into the Nigerians in Manchester chapter. Its guides are still readable.',
    status: 'Archived',
    statusReason:
      'Closed in favour of a larger chapter. Nothing new is posted here, and its guides stay available.',
    visibility: 'Public',
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
    memberCount: estimatedMembers(85),
    presenceCountryCodes: ['GB'],
    createdAt: isoDaysAgo(1200),
    updatedAt: isoDaysAgo(180),
  },
  {
    id: devId('private'),
    slug: 'private-example',
    name: 'Peckham Elders Circle',
    type: 'FaithCommunity',
    origin: { countryCode: 'NG', countryName: 'Nigeria', flag: '🇳🇬', regionName: 'West Africa' },
    identity: { iconName: 'lock-closed-outline', accentColor: null, logoUrl: null },
    tagline: 'Members only',
    description:
      'A private community. Its content and its member list are not visible outside it, and its size is not published.',
    status: 'Active',
    visibility: 'Private',
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
    // Deliberately null: §29 permits a community to refuse to report a size, and
    // a private community is the obvious case. `null` is not zero.
    memberCount: null,
    presenceCountryCodes: ['GB'],
    createdAt: isoDaysAgo(500),
    updatedAt: isoDaysAgo(30),
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// THE PERFORMANCE SET — §77
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §77 asks the app to be verified at 1, 10, 100 and 1,000+ communities.
 *
 * Generated rather than written out, from the real country list, so the names are
 * plausible and the set is genuinely large. Every entry is `Unlisted` so the
 * synthetic bulk does not swamp the curated set on the default directory view —
 * a developer opening the switcher should see the twelve communities above, and a
 * performance test should be able to ask for all 1,200.
 *
 * `PERFORMANCE_SET_SIZE` is read by the handler's `?perf=` parameter and by the
 * performance test, so the two cannot disagree about how big "large" is.
 */
export const PERFORMANCE_SET_SIZE = 1_200;

let performanceSet: Community[] | null = null;

/**
 * The large set, built once and memoized.
 *
 * Lazily built because generating 1,200 objects at module load would cost every
 * cold start — including the ones in a build where the adapter is unreachable and
 * nothing will ever ask for them.
 */
export function getPerformanceCommunitySet(size = PERFORMANCE_SET_SIZE): Community[] {
  if (performanceSet && performanceSet.length >= size) return performanceSet.slice(0, size);

  const built: Community[] = [];

  // A deterministic pseudo-random sequence: the same set every run, so a
  // performance measurement is comparable between runs and a failure is
  // reproducible. `Math.random()` here would make both impossible.
  let seed = 20_260_808;
  const next = () => {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const regions = ['West Africa', 'East Africa', 'South Asia', 'Caribbean', 'South-East Asia'];

  for (let index = 0; index < size; index += 1) {
    const region = regions[index % regions.length];

    built.push({
      id: devId(`perf-${index}`),
      slug: `perf-community-${index}`,
      name: `Development Community ${index + 1}`,
      type:
        index % 5 === 0
          ? 'RegionalDiaspora'
          : index % 3 === 0
            ? 'EthnoLinguistic'
            : 'NationalDiaspora',
      origin:
        index % 5 === 0
          ? { countryCode: null, countryName: null, flag: null, regionName: region }
          : {
              countryCode: PERF_COUNTRY_CODES[index % PERF_COUNTRY_CODES.length],
              countryName: `Country ${index % PERF_COUNTRY_CODES.length}`,
              flag: null,
              regionName: region,
            },
      identity: { iconName: 'people-outline', accentColor: null, logoUrl: null },
      tagline: null,
      description: null,
      status: 'Active',
      // Unlisted so the synthetic bulk does not swamp the curated directory.
      visibility: 'Unlisted',
      primaryLanguage: 'en',
      supportedLanguages: ['en'],
      memberCount: estimatedMembers(Math.floor(next() * 40_000)),
      presenceCountryCodes: ['GB'],
      createdAt: isoDaysAgo(index % 900),
      updatedAt: isoDaysAgo(index % 30),
    });
  }

  performanceSet = built;
  return built;
}

/** A spread of real ISO codes, so the projection has something plausible to hit. */
const PERF_COUNTRY_CODES = [
  'NG', 'GH', 'IN', 'PK', 'BD', 'KE', 'ZA', 'PH', 'JM', 'TT',
  'LK', 'NP', 'ET', 'SN', 'CM', 'ZW', 'UG', 'TZ', 'GM', 'SL',
];

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The development member's relationships.
 *
 * Deliberately the awkward set the brief describes in §2: residence Mauritius,
 * primary Nigerian, interested Ghanaian and Indian — plus a moderator role in one
 * community and an ambassador role in another, so both governance experiences are
 * reachable without editing data.
 *
 * `Revoked` and `PendingApproval` are both present, because §71 requires them to
 * be tested and §74 requires them to render distinctly from `None`.
 */
export const MOCK_MEMBERSHIPS: CommunityMembership[] = [
  {
    communityId: devId('nigerian'),
    state: 'VerifiedMember',
    isPrimary: true,
    roles: ['Member', 'Moderator'],
    capabilities: {
      communityId: devId('nigerian'),
      roles: ['Member', 'Moderator'],
      canViewMembers: true,
      canViewPrivateStatistics: true,
      canPostToCommunity: true,
      canModerateContent: true,
      canReviewReports: true,
      canPublishNotice: true,
      canManageRules: false,
      canManageRoles: false,
      canViewModerationQueue: true,
      canViewAmbassadorDirectory: true,
      canManageInitiatives: false,
    },
    visibility: 'CommunityOnly',
    joinedAt: isoDaysAgo(420),
    verifiedAt: isoDaysAgo(400),
    requiresApproval: false,
  },
  {
    communityId: devId('ghanaian'),
    state: 'Interested',
    isPrimary: false,
    roles: [],
    capabilities: {
      communityId: devId('ghanaian'),
      roles: [],
      canViewMembers: false,
      canViewPrivateStatistics: false,
      canPostToCommunity: false,
      canModerateContent: false,
      canReviewReports: false,
      canPublishNotice: false,
      canManageRules: false,
      canManageRoles: false,
      canViewModerationQueue: false,
      canViewAmbassadorDirectory: true,
      canManageInitiatives: false,
    },
    visibility: 'Private',
    joinedAt: null,
    verifiedAt: null,
    requiresApproval: false,
  },
  {
    communityId: devId('indian'),
    state: 'Interested',
    isPrimary: false,
    roles: [],
    capabilities: {
      communityId: devId('indian'),
      roles: [],
      canViewMembers: false,
      canViewPrivateStatistics: false,
      canPostToCommunity: false,
      canModerateContent: false,
      canReviewReports: false,
      canPublishNotice: false,
      canManageRules: false,
      canManageRoles: false,
      canViewModerationQueue: false,
      canViewAmbassadorDirectory: true,
      canManageInitiatives: false,
    },
    visibility: 'Private',
    joinedAt: null,
    verifiedAt: null,
    requiresApproval: false,
  },
  {
    communityId: devId('west-african'),
    state: 'Following',
    isPrimary: false,
    roles: [],
    capabilities: {
      communityId: devId('west-african'),
      roles: [],
      canViewMembers: false,
      canViewPrivateStatistics: false,
      canPostToCommunity: false,
      canModerateContent: false,
      canReviewReports: false,
      canPublishNotice: false,
      canManageRules: false,
      canManageRoles: false,
      canViewModerationQueue: false,
      canViewAmbassadorDirectory: true,
      canManageInitiatives: false,
    },
    visibility: 'Private',
    joinedAt: null,
    verifiedAt: null,
    requiresApproval: false,
  },
  {
    communityId: devId('nigerian-mcr'),
    state: 'Member',
    isPrimary: false,
    roles: ['Member', 'Ambassador'],
    capabilities: {
      communityId: devId('nigerian-mcr'),
      roles: ['Member', 'Ambassador'],
      canViewMembers: true,
      canViewPrivateStatistics: false,
      canPostToCommunity: true,
      canModerateContent: false,
      canReviewReports: false,
      canPublishNotice: true,
      canManageRules: false,
      canManageRoles: false,
      canViewModerationQueue: false,
      canViewAmbassadorDirectory: true,
      canManageInitiatives: true,
    },
    visibility: 'CommunityOnly',
    joinedAt: isoDaysAgo(120),
    verifiedAt: null,
    requiresApproval: false,
  },
  {
    communityId: devId('tamil'),
    state: 'PendingApproval',
    isPrimary: false,
    roles: [],
    capabilities: {
      communityId: devId('tamil'),
      roles: [],
      canViewMembers: false,
      canViewPrivateStatistics: false,
      canPostToCommunity: false,
      canModerateContent: false,
      canReviewReports: false,
      canPublishNotice: false,
      canManageRules: false,
      canManageRoles: false,
      canViewModerationQueue: false,
      canViewAmbassadorDirectory: false,
      canManageInitiatives: false,
    },
    visibility: 'Private',
    joinedAt: null,
    verifiedAt: null,
    requiresApproval: true,
  },
  {
    communityId: devId('suspended'),
    state: 'Revoked',
    isPrimary: false,
    roles: [],
    capabilities: {
      communityId: devId('suspended'),
      roles: [],
      canViewMembers: false,
      canViewPrivateStatistics: false,
      canPostToCommunity: false,
      canModerateContent: false,
      canReviewReports: false,
      canPublishNotice: false,
      canManageRules: false,
      canManageRoles: false,
      canViewModerationQueue: false,
      canViewAmbassadorDirectory: false,
      canManageInitiatives: false,
    },
    visibility: 'Private',
    joinedAt: isoDaysAgo(300),
    verifiedAt: null,
    stateReason:
      'A moderator ended this membership after repeated reports about listings posted in the community.',
    requiresApproval: false,
  },
];

/** Every capability off, for a community the member has no relationship with. */
export function noCapabilities(communityId: string): CommunityCapabilities {
  return {
    communityId,
    roles: [],
    canViewMembers: false,
    canViewPrivateStatistics: false,
    canPostToCommunity: false,
    canModerateContent: false,
    canReviewReports: false,
    canPublishNotice: false,
    canManageRules: false,
    canManageRoles: false,
    canViewModerationQueue: false,
    canViewAmbassadorDirectory: false,
    canManageInitiatives: false,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// GOVERNANCE
// ═════════════════════════════════════════════════════════════════════════════

export const MOCK_RULES: Record<string, CommunityRule[]> = {
  [devId('nigerian')]: [
    {
      id: 'rule-ng-1',
      position: 1,
      title: 'No agency fees for housing leads',
      body: 'Housing shared here must be shared without a finder’s fee. Charging for a lead is the single most common way newcomers are exploited, and it is not done in this community.',
      consequence: 'A first post is removed and explained. A second ends posting rights.',
      updatedAt: isoDaysAgo(60),
    },
    {
      id: 'rule-ng-2',
      position: 2,
      title: 'Immigration advice must say what it is',
      body: 'Share your own experience freely. If you are giving advice as a regulated adviser, say so and give your registration. If you are not, say that too.',
      consequence: 'Posts presenting personal experience as professional advice are removed.',
      updatedAt: isoDaysAgo(60),
    },
    {
      id: 'rule-ng-3',
      position: 3,
      title: 'One language is not a requirement',
      body: 'Post in English, Yorùbá, Igbo, Hausa or Pidgin. Nobody is asked to switch.',
      consequence: null,
      updatedAt: isoDaysAgo(200),
    },
  ],
  [devId('ghanaian')]: [
    {
      id: 'rule-gh-1',
      position: 1,
      title: 'Verify before you vouch',
      body: 'Recommending a tradesperson or a shipping agent is a real endorsement. Only vouch for people you have actually used.',
      consequence: 'Repeated unfounded endorsements end posting rights.',
      updatedAt: isoDaysAgo(90),
    },
  ],
};

export const MOCK_NOTICES: Record<string, CommunityNotice[]> = {
  [devId('nigerian')]: [
    {
      id: 'notice-ng-1',
      communityId: devId('nigerian'),
      title: 'Rent deposit scam circulating in south London',
      body: 'Several members have reported the same listing appearing on three sites with different contact numbers, asking for a deposit before a viewing. Do not transfer a deposit before you have seen the property and met whoever holds the keys.',
      publishedAt: isoDaysAgo(2),
      publishedByRole: 'Moderator',
      publishedByName: 'Adaeze O.',
      expiresAt: isoDaysAhead(21),
      isPinned: true,
    },
    {
      id: 'notice-ng-2',
      communityId: devId('nigerian'),
      title: 'Two new moderators',
      body: 'Two members have taken on moderation for the housing and jobs sections. You will see their badges on their posts.',
      publishedAt: isoDaysAgo(18),
      publishedByRole: 'Administrator',
      publishedByName: null,
      expiresAt: null,
      isPinned: false,
    },
  ],
  [devId('nigerian-mcr')]: [
    {
      id: 'notice-mcr-1',
      communityId: devId('nigerian-mcr'),
      title: 'Winter clothing swap — Longsight, Saturday',
      body: 'Bring what no longer fits, take what does. Focus on coats and children’s sizes. Nothing is sold.',
      publishedAt: isoDaysAgo(1),
      publishedByRole: 'Ambassador',
      publishedByName: 'Chidi A.',
      expiresAt: isoDaysAhead(6),
      isPinned: true,
    },
  ],
};

/**
 * Role holders.
 *
 * `areaLabel` is capped at city precision — never a neighbourhood and never a
 * coordinate. GAP-018's privacy note is the reason: a role directory publishes a
 * person's community affiliation by construction, and pairing that with a
 * street-level location would be a great deal more than the directory needs.
 */
export const MOCK_ROLE_HOLDERS: Record<string, CommunityRoleHolder[]> = {
  [devId('nigerian')]: [
    {
      userId: 'dev-user-ada',
      displayName: 'Adaeze O.',
      avatarUrl: null,
      role: 'Moderator',
      since: isoDaysAgo(320),
      bio: 'Moderates housing and marketplace. Ten years in south London, four of them renting badly.',
      languages: ['en', 'ig'],
      areaLabel: 'London',
    },
    {
      userId: 'dev-user-tunde',
      displayName: 'Tunde B.',
      avatarUrl: null,
      role: 'Moderator',
      since: isoDaysAgo(140),
      bio: 'Jobs and qualifications. Happy to read a CV.',
      languages: ['en', 'yo'],
      areaLabel: 'Birmingham',
    },
    {
      userId: 'dev-user-ngozi',
      displayName: 'Ngozi E.',
      avatarUrl: null,
      role: 'Ambassador',
      since: isoDaysAgo(210),
      bio: 'Runs the monthly newcomers’ evening. Ask me about schools.',
      languages: ['en', 'ig'],
      areaLabel: 'Manchester',
    },
    {
      userId: 'dev-user-emeka',
      displayName: 'Emeka N.',
      avatarUrl: null,
      role: 'Administrator',
      since: isoDaysAgo(880),
      bio: null,
      languages: ['en'],
      areaLabel: 'London',
    },
  ],
  [devId('nigerian-mcr')]: [
    {
      userId: 'dev-user-chidi',
      displayName: 'Chidi A.',
      avatarUrl: null,
      role: 'Ambassador',
      since: isoDaysAgo(95),
      bio: 'Organises the clothing swaps and the Longsight meet-ups.',
      languages: ['en', 'ig'],
      areaLabel: 'Manchester',
    },
  ],
  [devId('ghanaian')]: [
    {
      userId: 'dev-user-akosua',
      displayName: 'Akosua M.',
      avatarUrl: null,
      role: 'Moderator',
      since: isoDaysAgo(260),
      bio: 'Shipping, remittances and the paperwork nobody explains.',
      languages: ['en', 'tw'],
      areaLabel: 'London',
    },
  ],
};

export const MOCK_INITIATIVES: Record<string, CommunityInitiative[]> = {
  [devId('nigerian')]: [
    {
      id: 'init-ng-1',
      communityId: devId('nigerian'),
      title: 'First 90 Days guide series',
      description:
        'Twelve guides covering the first three months in a new country: NIN, bank account, GP registration, school places, tenancy rights and what to do when a payslip is wrong.',
      status: 'Active',
      startsAt: isoDaysAgo(70),
      endsAt: isoDaysAhead(110),
      leads: MOCK_ROLE_HOLDERS[devId('nigerian')].filter((h) => h.role === 'Ambassador'),
      progress: { value: 62, source: 'simulated', gapKey: 'communityInitiatives' },
    },
    {
      id: 'init-ng-2',
      communityId: devId('nigerian'),
      title: 'Verified tradespeople list',
      description:
        'A vetted list of plumbers, electricians and removals firms members have actually used, with the vouching member named.',
      status: 'Planned',
      startsAt: isoDaysAhead(20),
      endsAt: null,
      leads: [],
      progress: null,
    },
  ],
  [devId('nigerian-mcr')]: [
    {
      id: 'init-mcr-1',
      communityId: devId('nigerian-mcr'),
      title: 'Winter clothing swaps',
      description: 'Monthly swaps through the winter, rotating between Longsight, Moss Side and Cheetham Hill.',
      status: 'Active',
      startsAt: isoDaysAgo(30),
      endsAt: isoDaysAhead(90),
      leads: MOCK_ROLE_HOLDERS[devId('nigerian-mcr')],
      progress: { value: 40, source: 'simulated', gapKey: 'communityInitiatives' },
    },
  ],
};

/**
 * The moderation queue.
 *
 * Note what is absent from every entry: any reporter identity. `CommunityReport`
 * has no field for one, so this data could not carry it even if somebody wanted
 * it to. GAP-017's privacy note explains why that is a property of the type
 * rather than of the fixture.
 */
export const MOCK_REPORTS: Record<string, CommunityReport[]> = {
  [devId('nigerian')]: [
    {
      id: 'report-ng-1',
      communityId: devId('nigerian'),
      status: 'Open',
      reason: 'Scam',
      contentType: 'housing',
      contentId: 'housing-dev-42',
      contentExcerpt:
        'Room available immediately, £150/week all bills. Deposit by transfer today to hold the room, viewing arranged after.',
      reporterCount: 4,
      createdAt: isoDaysAgo(1),
      note: 'Same wording as a listing removed last month, different number.',
    },
    {
      id: 'report-ng-2',
      communityId: devId('nigerian'),
      status: 'Open',
      reason: 'Misinformation',
      contentType: 'update',
      contentId: 'update-dev-18',
      contentExcerpt:
        'You have 5 days to register or your visa is cancelled automatically — share widely.',
      reporterCount: 2,
      createdAt: isoDaysAgo(2),
      note: null,
    },
    {
      id: 'report-ng-3',
      communityId: devId('nigerian'),
      status: 'UnderReview',
      reason: 'Harassment',
      contentType: 'comment',
      contentId: 'comment-dev-77',
      contentExcerpt: null,
      reporterCount: 1,
      createdAt: isoDaysAgo(4),
      updatedAt: isoDaysAgo(1),
      note: null,
    },
    {
      id: 'report-ng-4',
      communityId: devId('nigerian'),
      status: 'Actioned',
      reason: 'Spam',
      contentType: 'marketplace',
      contentId: 'market-dev-91',
      contentExcerpt: 'DM for wholesale prices on phone accessories, bulk only.',
      reporterCount: 6,
      createdAt: isoDaysAgo(9),
      updatedAt: isoDaysAgo(8),
      note: null,
    },
    {
      id: 'report-ng-5',
      communityId: devId('nigerian'),
      status: 'Escalated',
      reason: 'HateSpeech',
      contentType: 'comment',
      contentId: 'comment-dev-104',
      contentExcerpt: null,
      reporterCount: 3,
      createdAt: isoDaysAgo(11),
      updatedAt: isoDaysAgo(10),
      note: 'Sent to platform moderation.',
    },
  ],
};

/** The curated set, by id, for the handler's lookups. */
export const MOCK_COMMUNITY_BY_ID = new Map(MOCK_COMMUNITIES.map((c) => [c.id, c]));
export const MOCK_COMMUNITY_BY_SLUG = new Map(MOCK_COMMUNITIES.map((c) => [c.slug, c]));
