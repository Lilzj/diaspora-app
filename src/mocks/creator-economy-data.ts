// ═════════════════════════════════════════════════════════════════════════════
//
//   ⚠  BACKEND GAP / DEVELOPMENT ONLY  ⚠
//
//   NOTHING IN THIS FILE MIRRORS A CERTIFIED BACKEND CONTRACT.
//
//   Fixtures for the sixteen creator capabilities registered in
//   `src/config/creator-gaps.ts`. Every creator status, milestone, challenge,
//   grant, course, earning, referral and ranking here is invented.
//
//   Written the way the real data would arrive rather than the way it is
//   easiest to fake:
//
//     * Progress percentages are supplied, not derivable. Several deliberately
//       are not `current / target` — a weighted milestone and a capped
//       challenge both exist here — so a screen that quietly divided instead of
//       reading `percentage` renders visibly wrong figures in development.
//     * Requirements carry a server-decided `isMet`, including one that is met
//       while its `current` is below its `target`, because a real eligibility
//       rule has exceptions and a client must not re-derive it.
//     * Quiz options carry no answer key. The grader lives in the handler.
//     * Money is `Money` with `minorUnits`; points are bare numbers. They are
//       never interchangeable, here or anywhere.
//     * The unhappy states are populated, not just the happy ones: a rejected
//       verification with a reason, a grant asking for more information, a
//       reversed earning, a referral that signed up and did not qualify, a
//       fraud-blocked signup bonus. A flow only tested against success is a
//       flow that has never been tested.
//
//   See `frontend-phase-7-creator-economy-backend-gap-register.md`.
//
// ═════════════════════════════════════════════════════════════════════════════

import { money } from './financial-data';
import type {
  CommunityGrant,
  CreatorAcademySection,
  CreatorBadge,
  CreatorChallenge,
  CreatorContentPerformance,
  CreatorCourse,
  CreatorEarning,
  CreatorLesson,
  CreatorMetric,
  CreatorMilestone,
  CreatorPointRule,
  CreatorProfile,
  CreatorRecommendation,
  CreatorReferral,
  CreatorReferralProgramme,
  CreatorReward,
  CreatorRevenueSummary,
  CreatorVerification,
  GrantApplication,
  GrantApplicationForm,
  PublicCreator,
  SignupBonus,
  SponsoredContentItem,
} from '@/types/creator-economy';

// ── Time helpers ─────────────────────────────────────────────────────────────
//
// Relative to `now` so a fixture never rots into a screen full of 2024 dates.

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function isoDaysAhead(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

// ═════════════════════════════════════════════════════════════════════════════
// PROFILE · REPUTATION · VERIFICATION
// ═════════════════════════════════════════════════════════════════════════════

export const MOCK_CREATOR_BADGES: CreatorBadge[] = [
  {
    badgeId: 'badge-first-guide',
    key: 'first_guide',
    label: 'First guide',
    description: 'Published your first community guide.',
    icon: '📝',
    tier: 'bronze',
    isEarned: true,
    earnedAt: isoDaysAgo(210),
  },
  {
    badgeId: 'badge-helpful-10',
    key: 'helpful_10',
    label: 'Genuinely helpful',
    description: 'Ten people marked your advice helpful.',
    icon: '💡',
    tier: 'bronze',
    isEarned: true,
    earnedAt: isoDaysAgo(160),
  },
  {
    badgeId: 'badge-verified-creator',
    key: 'verified_creator',
    label: 'Verified creator',
    description: 'Diaspora has verified you as a creator.',
    icon: '✅',
    tier: 'silver',
    isEarned: true,
    earnedAt: isoDaysAgo(84),
  },
  {
    badgeId: 'badge-newcomer-guide',
    key: 'newcomer_guide',
    label: 'Newcomer’s guide',
    description: 'Helped fifty people in their first month in a new country.',
    icon: '🧭',
    tier: 'silver',
    isEarned: true,
    earnedAt: isoDaysAgo(40),
  },
  {
    badgeId: 'badge-community-pillar',
    key: 'community_pillar',
    label: 'Community pillar',
    description: 'Sustained contribution across a whole year.',
    icon: '🏛️',
    tier: 'gold',
    isEarned: false,
    // Note: 61% with 7 of 12 months. Not 58.3%. The programme weights the most
    // recent quarter, which is exactly why the client must not divide.
    progress: { current: 7, target: 12, percentage: 61, unit: 'months' },
  },
  {
    badgeId: 'badge-top-creator',
    key: 'top_creator',
    label: 'Top creator',
    description: 'Among the most helpful creators on Diaspora.',
    icon: '🏆',
    tier: 'platinum',
    isEarned: false,
    progress: { current: 1248, target: 5000, percentage: 25, unit: 'reach' },
  },
];

export const MOCK_CREATOR_PROFILE: CreatorProfile = {
  creatorId: 'creator-amara',
  userId: 'user-1',
  displayName: 'Amara Kone',
  handle: 'amarak',
  avatarUrl: null,
  coverImageUrl: null,
  bio: 'Moved to London from Abidjan in 2019. I write about the parts nobody warns you about — the National Insurance number, the deposit, the first winter.',
  status: 'VerifiedCreator',
  statusChangedAt: isoDaysAgo(84),
  nextStatus: {
    status: 'EstablishedCreator',
    label: 'Established creator',
    requirements: [
      {
        key: 'guides_published',
        label: 'Publish 15 guides',
        description: 'Guides that stay useful — evergreen rather than time-limited.',
        isMet: false,
        current: 11,
        target: 15,
        actionRoute: '/guide/create',
        actionLabel: 'Write a guide',
      },
      {
        key: 'helpful_votes',
        label: 'Receive 250 helpful votes',
        isMet: false,
        current: 189,
        target: 250,
      },
      {
        key: 'sustained_activity',
        label: 'Contribute in six consecutive months',
        // Met at 5 of 6: the programme counts a month with an event as a month.
        // Served as met, so the client cannot decide otherwise.
        isMet: true,
        current: 5,
        target: 6,
      },
      {
        key: 'no_violations',
        label: 'No community guideline violations',
        isMet: true,
      },
    ],
  },
  countryCode: 'GB',
  communityIds: ['community-west-african-london', 'community-ivorian-uk'],
  languages: ['English', 'French', 'Dioula'],
  categories: ['settling-in', 'money-and-banking', 'housing'],
  expertise: ['Right to Rent', 'NHS registration', 'Bank account setup', 'Council tax'],
  isDiscoverable: true,
  isVerifiedCreator: true,
  audience: {
    followers: 342,
    following: 88,
    reach: 12_480,
    totalContentPublished: 23,
    totalHelpfulVotes: 189,
  },
  completeness: {
    percentage: 82,
    missing: [
      {
        key: 'cover_image',
        label: 'Add a cover image',
        description: 'Profiles with a cover image get noticeably more follows.',
        isMet: false,
        actionRoute: '/creator/profile',
        actionLabel: 'Add one',
      },
      {
        key: 'languages_confirmed',
        label: 'Confirm the languages you can help in',
        isMet: false,
        actionRoute: '/creator/profile',
        actionLabel: 'Confirm',
      },
    ],
  },
  joinedAt: isoDaysAgo(410),
  updatedAt: isoHoursAgo(6),
};

export const MOCK_CREATOR_VERIFICATION: CreatorVerification = {
  applicationId: 'creator-verification-1',
  state: 'Approved',
  requirements: [
    {
      key: 'identity_verified',
      label: 'Verify your identity',
      description: 'Diaspora needs to know who you are before verifying you as a creator.',
      isMet: true,
      // Routes into the real Trust flow. Never simulated. §8.
      actionRoute: '/verification/identity',
      actionLabel: 'Verify identity',
    },
    {
      key: 'country_verified',
      label: 'Verify your country of residence',
      isMet: true,
      actionRoute: '/verification/country',
      actionLabel: 'Verify country',
    },
    {
      key: 'guides_published',
      label: 'Publish at least 5 guides',
      isMet: true,
      current: 11,
      target: 5,
    },
    {
      key: 'guidelines_acknowledged',
      label: 'Read and accept the creator guidelines',
      isMet: true,
      actionRoute: '/profile/community-guidelines',
      actionLabel: 'Read them',
    },
  ],
  evidence: [
    {
      evidenceId: 'evidence-1',
      kind: 'PortfolioLink',
      label: 'Community guide portfolio',
      status: 'Accepted',
      uploadedAt: isoDaysAgo(92),
    },
  ],
  submittedAt: isoDaysAgo(92),
  reviewStartedAt: isoDaysAgo(90),
  decidedAt: isoDaysAgo(84),
  expiresAt: isoDaysAhead(281),
  decisionReason: null,
  informationRequested: null,
  canResubmit: false,
  canAppeal: false,
};

/**
 * A second application in an unhappy state.
 *
 * Reachable in development by resetting the verification through the handler.
 * Its purpose is that the rejection, resubmission and appeal branches are
 * exercised at least once by somebody looking at the screen.
 */
export const MOCK_CREATOR_VERIFICATION_REJECTED: CreatorVerification = {
  applicationId: 'creator-verification-2',
  state: 'MoreInformationRequired',
  requirements: MOCK_CREATOR_VERIFICATION.requirements.map((requirement) =>
    requirement.key === 'guidelines_acknowledged' ? { ...requirement, isMet: false } : requirement
  ),
  evidence: [
    {
      evidenceId: 'evidence-2',
      kind: 'PortfolioLink',
      label: 'Community guide portfolio',
      status: 'Rejected',
      rejectionReason: 'The link was not reachable when we checked it.',
      uploadedAt: isoDaysAgo(9),
    },
  ],
  submittedAt: isoDaysAgo(9),
  reviewStartedAt: isoDaysAgo(7),
  decidedAt: null,
  decisionReason: null,
  informationRequested: [
    'A working link to at least three guides you have written.',
    'Confirm which country you are writing about most often.',
  ],
  canResubmit: true,
  canAppeal: false,
  respondByAt: isoDaysAhead(5),
};

// ═════════════════════════════════════════════════════════════════════════════
// MILESTONES
// ═════════════════════════════════════════════════════════════════════════════

export const MOCK_MILESTONES: CreatorMilestone[] = [
  {
    milestoneId: 'milestone-first-guide',
    key: 'first_guide',
    title: 'Your first guide',
    description: 'Publish a guide that helps somebody arriving where you did.',
    icon: '📝',
    category: 'Getting started',
    state: 'Claimed',
    progress: { current: 1, target: 1, percentage: 100, unit: 'guides' },
    reward: { kind: 'points', points: 100, label: '100 points' },
    completedAt: isoDaysAgo(210),
    claimedAt: isoDaysAgo(210),
    sortOrder: 10,
  },
  {
    milestoneId: 'milestone-ten-guides',
    key: 'ten_guides',
    title: 'Ten guides',
    description: 'Ten published guides makes you a reference point for newcomers.',
    icon: '📚',
    category: 'Getting started',
    state: 'Completed',
    progress: { current: 11, target: 10, percentage: 100, unit: 'guides' },
    reward: { kind: 'points', points: 500, label: '500 points' },
    completedAt: isoDaysAgo(12),
    claimedAt: null,
    sortOrder: 20,
  },
  {
    milestoneId: 'milestone-first-hundred-views',
    key: 'first_100_views',
    title: 'First 100 readers',
    description: 'A hundred people have read something you wrote.',
    icon: '👀',
    category: 'Reach',
    state: 'Claimed',
    progress: { current: 12_480, target: 100, percentage: 100, unit: 'views' },
    reward: { kind: 'points', points: 150, label: '150 points' },
    completedAt: isoDaysAgo(180),
    claimedAt: isoDaysAgo(179),
    sortOrder: 30,
  },
  {
    milestoneId: 'milestone-hundred-saves',
    key: 'first_100_saves',
    title: 'First 100 saves',
    description: 'A save means somebody is coming back to it.',
    icon: '🔖',
    category: 'Reach',
    state: 'AlmostComplete',
    progress: { current: 87, target: 100, percentage: 87, unit: 'saves' },
    reward: { kind: 'points', points: 250, label: '250 points' },
    sortOrder: 40,
  },
  {
    milestoneId: 'milestone-first-event',
    key: 'first_event',
    title: 'Host your first event',
    description: 'Bring people together in person or online.',
    icon: '🎪',
    category: 'Community',
    state: 'InProgress',
    progress: { current: 0, target: 1, percentage: 0, unit: 'events' },
    reward: { kind: 'points', points: 300, label: '300 points' },
    sortOrder: 50,
  },
  {
    milestoneId: 'milestone-first-referral',
    key: 'first_referral',
    title: 'Your first referral',
    description: 'Someone you invited joined and stayed.',
    icon: '🤝',
    category: 'Community',
    state: 'Completed',
    progress: { current: 2, target: 1, percentage: 100, unit: 'referrals' },
    reward: { kind: 'points', points: 200, label: '200 points' },
    completedAt: isoDaysAgo(30),
    sortOrder: 60,
  },
  {
    milestoneId: 'milestone-verified-creator',
    key: 'verified_creator',
    title: 'Verified creator',
    description: 'Diaspora has verified you as a creator.',
    icon: '✅',
    category: 'Standing',
    state: 'Claimed',
    progress: { current: 1, target: 1, percentage: 100 },
    reward: { kind: 'badge', badgeKey: 'verified_creator', label: 'Verified creator badge' },
    completedAt: isoDaysAgo(84),
    claimedAt: isoDaysAgo(84),
    sortOrder: 70,
  },
  {
    milestoneId: 'milestone-community-helper',
    key: 'community_helper',
    title: 'Community helper',
    description: 'Answer fifty questions from people who have just arrived.',
    icon: '🧑‍🤝‍🧑',
    category: 'Community',
    state: 'InProgress',
    // 34 of 50 is 68%. Served as 62% because the programme only counts answers
    // that were marked useful, and the difference is the point.
    progress: { current: 34, target: 50, percentage: 62, unit: 'answers' },
    reward: { kind: 'points', points: 400, label: '400 points' },
    sortOrder: 80,
  },
  {
    milestoneId: 'milestone-top-contributor',
    key: 'top_contributor',
    title: 'Top contributor',
    description: 'Reach the top 50 contributors in your country.',
    icon: '🏆',
    category: 'Standing',
    state: 'Locked',
    progress: { current: 0, target: 1, percentage: 0 },
    reward: { kind: 'entitlement', entitlementKey: 'analytics.advanced', label: 'Advanced analytics for a year' },
    sortOrder: 90,
  },
  {
    milestoneId: 'milestone-winter-2024',
    key: 'winter_campaign',
    title: 'Winter arrivals campaign',
    description: 'Publish three winter-specific guides before the season ends.',
    icon: '❄️',
    category: 'Seasonal',
    state: 'Expired',
    progress: { current: 1, target: 3, percentage: 33, unit: 'guides' },
    reward: { kind: 'points', points: 350, label: '350 points' },
    expiresAt: isoDaysAgo(45),
    sortOrder: 100,
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// CHALLENGES
// ═════════════════════════════════════════════════════════════════════════════

export const MOCK_CHALLENGES: CreatorChallenge[] = [
  {
    challengeId: 'challenge-helpful-guides',
    title: 'Three genuinely helpful guides',
    description:
      'Publish three guides this month that answer a question newcomers actually ask. Quality is judged by helpful votes, not length.',
    icon: '✍️',
    category: 'Writing',
    state: 'InProgress',
    isEligible: true,
    tasks: [
      {
        taskId: 'task-guide-1',
        label: 'Publish your first guide of the month',
        isComplete: true,
        actionRoute: '/guide/create',
        actionLabel: 'Write a guide',
      },
      {
        taskId: 'task-guide-2',
        label: 'Publish a second guide',
        isComplete: true,
        actionRoute: '/guide/create',
        actionLabel: 'Write a guide',
      },
      {
        taskId: 'task-guide-3',
        label: 'Publish a third guide',
        isComplete: false,
        actionRoute: '/guide/create',
        actionLabel: 'Write a guide',
      },
      {
        taskId: 'task-guide-helpful',
        label: 'Receive 10 helpful votes across them',
        isComplete: false,
        progress: { current: 6, target: 10, percentage: 60, unit: 'votes' },
      },
    ],
    progress: { current: 2, target: 4, percentage: 55, unit: 'tasks' },
    reward: { kind: 'points', points: 750, label: '750 points' },
    rules: [
      'Guides must be published during the challenge window.',
      'A guide removed for a guidelines breach does not count.',
      'Helpful votes from accounts you referred are excluded.',
    ],
    startsAt: isoDaysAgo(12),
    endsAt: isoDaysAhead(18),
    joinedAt: isoDaysAgo(11),
    participantCount: 214,
    hasLeaderboard: true,
  },
  {
    challengeId: 'challenge-help-newcomers',
    title: 'Help five newcomers',
    description: 'Answer questions from five people in their first month in a new country.',
    icon: '🧭',
    category: 'Community',
    state: 'Open',
    isEligible: true,
    tasks: [
      { taskId: 'task-answer-1', label: 'Answer five newcomer questions', isComplete: false, progress: { current: 0, target: 5, percentage: 0, unit: 'answers' } },
      { taskId: 'task-answer-marked', label: 'Have three answers marked useful', isComplete: false, progress: { current: 0, target: 3, percentage: 0, unit: 'answers' } },
    ],
    progress: { current: 0, target: 2, percentage: 0, unit: 'tasks' },
    reward: { kind: 'points', points: 500, label: '500 points' },
    rules: [
      'A newcomer is somebody in their first 30 days in a country.',
      'Answers must be marked useful by the person who asked.',
    ],
    startsAt: isoDaysAgo(3),
    endsAt: isoDaysAhead(27),
    participantCount: 89,
    hasLeaderboard: false,
  },
  {
    challengeId: 'challenge-host-event',
    title: 'Host a community event',
    description: 'Organise and run one event — a meetup, a Q&A, a language exchange.',
    icon: '🎪',
    category: 'Events',
    state: 'Open',
    isEligible: false,
    ineligibleReason: 'Hosting events needs a verified organisation. You can create one from the dashboard.',
    tasks: [
      { taskId: 'task-create-event', label: 'Create an event', isComplete: false, actionRoute: '/community-life/event/create', actionLabel: 'Create event' },
      { taskId: 'task-event-attendees', label: 'Have five people attend', isComplete: false, progress: { current: 0, target: 5, percentage: 0, unit: 'attendees' } },
    ],
    progress: { current: 0, target: 2, percentage: 0, unit: 'tasks' },
    reward: { kind: 'points', points: 1000, label: '1,000 points' },
    rules: ['The event must take place within the challenge window.'],
    startsAt: isoDaysAgo(6),
    endsAt: isoDaysAhead(24),
    participantCount: 41,
    hasLeaderboard: false,
  },
  {
    challengeId: 'challenge-refer-three',
    title: 'Invite three people',
    description: 'Three people you invite join and complete their first week.',
    icon: '🤝',
    category: 'Growth',
    state: 'Completed',
    isEligible: true,
    tasks: [
      { taskId: 'task-refer-1', label: 'First qualified referral', isComplete: true },
      { taskId: 'task-refer-2', label: 'Second qualified referral', isComplete: true },
      { taskId: 'task-refer-3', label: 'Third qualified referral', isComplete: true },
    ],
    progress: { current: 3, target: 3, percentage: 100, unit: 'referrals' },
    reward: { kind: 'points', points: 600, label: '600 points' },
    rules: ['A referral qualifies once the invited member completes their first week.'],
    startsAt: isoDaysAgo(60),
    endsAt: isoDaysAhead(2),
    joinedAt: isoDaysAgo(58),
    completedAt: isoDaysAgo(4),
    participantCount: 156,
    hasLeaderboard: true,
  },
  {
    challengeId: 'challenge-spring-updates',
    title: 'Spring community updates',
    description: 'Post five timely updates about what is changing where you live.',
    icon: '🌱',
    category: 'Writing',
    state: 'Upcoming',
    isEligible: true,
    tasks: [
      { taskId: 'task-updates', label: 'Post five community updates', isComplete: false, progress: { current: 0, target: 5, percentage: 0, unit: 'updates' } },
    ],
    progress: { current: 0, target: 1, percentage: 0, unit: 'tasks' },
    reward: { kind: 'points', points: 450, label: '450 points' },
    rules: ['Updates must be about your verified country of residence.'],
    startsAt: isoDaysAhead(9),
    endsAt: isoDaysAhead(39),
    participantCount: 0,
    hasLeaderboard: true,
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// GRANTS
// ═════════════════════════════════════════════════════════════════════════════

export const MOCK_GRANTS: CommunityGrant[] = [
  {
    grantId: 'grant-newcomer-handbook',
    title: 'Newcomer handbook grant',
    summary: 'Funding to produce a comprehensive arrival handbook for one city.',
    description:
      'We fund creators to write the guide they wish had existed when they arrived. A handbook covers housing, banking, healthcare, transport and the administrative steps in one place, for one city, in at least two languages.',
    category: 'Content',
    state: 'Open',
    fundingAmount: money(150_000),
    fundingMinimum: money(50_000),
    fundingMaximum: money(150_000),
    requirements: [
      { key: 'verified_creator', label: 'Be a verified creator', isMet: true },
      { key: 'guides_5', label: 'Have published at least 5 guides', isMet: true, current: 11, target: 5 },
      { key: 'country_verified', label: 'Verified residence in the city you are writing about', isMet: true },
      { key: 'no_open_grant', label: 'No other active grant', isMet: true },
    ],
    deliverables: [
      'A handbook of at least 8 sections, published as guides on Diaspora.',
      'Available in English and at least one other language.',
      'A short progress report at the halfway point.',
    ],
    isEligible: true,
    opensAt: isoDaysAgo(20),
    deadlineAt: isoDaysAhead(23),
    applicantCount: 34,
    applicationId: null,
    applicationState: null,
    countryCodes: ['GB', 'FR', 'DE', 'NL'],
  },
  {
    grantId: 'grant-community-event',
    title: 'Community event fund',
    summary: 'Costs covered for a diaspora community event.',
    description:
      'Venue hire, refreshments and materials for an event that brings a diaspora community together. We prioritise events aimed at people who have arrived in the last year.',
    category: 'Events',
    state: 'ClosingSoon',
    fundingAmount: money(40_000),
    fundingMinimum: money(10_000),
    fundingMaximum: money(40_000),
    requirements: [
      { key: 'verified_creator', label: 'Be a verified creator', isMet: true },
      {
        key: 'organisation',
        label: 'Be part of a verified organisation',
        isMet: false,
        actionRoute: '/community-life/org/create',
        actionLabel: 'Create one',
      },
      { key: 'event_plan', label: 'Have a dated event plan', isMet: false },
    ],
    deliverables: [
      'One event with at least 20 attendees.',
      'A short written report with photographs.',
      'Receipts for anything the grant paid for.',
    ],
    isEligible: false,
    ineligibleReason: 'This grant needs a verified organisation. You can create one from the dashboard.',
    opensAt: isoDaysAgo(40),
    deadlineAt: isoDaysAhead(4),
    applicantCount: 61,
    applicationId: null,
    applicationState: null,
    countryCodes: ['GB'],
  },
  {
    grantId: 'grant-translation',
    title: 'Translation fund',
    summary: 'Translate existing high-value guides into an under-served language.',
    description:
      'Some of the most-read guides on Diaspora exist only in English. This fund pays creators to translate them properly — not machine translation with a human glance, but a translation that works for somebody reading it under stress.',
    category: 'Accessibility',
    state: 'Open',
    fundingAmount: money(60_000),
    requirements: [
      { key: 'language', label: 'Fluent in the target language', isMet: true },
      { key: 'verified_creator', label: 'Be a verified creator', isMet: true },
    ],
    deliverables: ['At least 10 guides translated and published.', 'A glossary of the terms you chose and why.'],
    isEligible: true,
    opensAt: isoDaysAgo(8),
    deadlineAt: isoDaysAhead(52),
    applicantCount: 12,
    applicationId: 'grant-application-1',
    applicationState: 'UnderReview',
    countryCodes: ['GB', 'FR', 'IE', 'CA'],
  },
  {
    grantId: 'grant-safety-campaign',
    title: 'Community safety campaign',
    summary: 'Run an awareness campaign on a scam or safety issue affecting your community.',
    description:
      'Rental scams, fake job offers and immigration advice fraud all target people who have recently arrived. This fund supports creators running a campaign that reaches the people being targeted.',
    category: 'Safety',
    state: 'Upcoming',
    fundingAmount: money(80_000),
    requirements: [
      { key: 'verified_creator', label: 'Be a verified creator', isMet: true },
      { key: 'reach', label: 'Reach at least 1,000 people a month', isMet: true, current: 12_480, target: 1_000 },
    ],
    deliverables: ['A campaign plan.', 'At least 5 pieces of content.', 'A reach report at the end.'],
    isEligible: true,
    opensAt: isoDaysAhead(14),
    deadlineAt: isoDaysAhead(60),
    applicantCount: 0,
    applicationId: null,
    applicationState: null,
    countryCodes: ['GB', 'FR', 'DE', 'NL', 'IE'],
  },
];

export const MOCK_GRANT_FORMS: Record<string, GrantApplicationForm> = {
  'grant-newcomer-handbook': {
    grantId: 'grant-newcomer-handbook',
    fields: [
      { key: 'city', label: 'Which city will the handbook cover?', kind: 'text', isRequired: true, maxLength: 80 },
      {
        key: 'languages',
        label: 'Which languages will you publish in?',
        helpText: 'English plus at least one other.',
        kind: 'text',
        isRequired: true,
        maxLength: 120,
      },
      {
        key: 'outline',
        label: 'Outline the sections you plan to write',
        helpText: 'Eight or more. A sentence each is enough.',
        kind: 'longText',
        isRequired: true,
        maxLength: 2000,
      },
      {
        key: 'why_you',
        label: 'Why are you the right person to write this?',
        kind: 'longText',
        isRequired: true,
        maxLength: 1200,
      },
      {
        key: 'timeline',
        label: 'How long will it take?',
        kind: 'select',
        isRequired: true,
        options: [
          { value: '1-3', label: '1 to 3 months' },
          { value: '3-6', label: '3 to 6 months' },
          { value: '6-12', label: '6 to 12 months' },
        ],
      },
    ],
    declarations: [
      { key: 'own-work', text: 'The work will be my own, and any translation will be disclosed.' },
      { key: 'publish-licence', text: 'I will publish the handbook on Diaspora under the community licence.' },
      { key: 'instalments', text: 'I understand the grant is paid in instalments against the deliverables.' },
    ],
    allowsAttachments: true,
    allowsAmountRequest: true,
  },
  'grant-translation': {
    grantId: 'grant-translation',
    fields: [
      { key: 'target_language', label: 'Which language will you translate into?', kind: 'text', isRequired: true, maxLength: 60 },
      { key: 'fluency', label: 'How did you learn it?', kind: 'longText', isRequired: true, maxLength: 800 },
      { key: 'guides', label: 'Which guides would you start with?', kind: 'longText', isRequired: true, maxLength: 1200 },
    ],
    declarations: [
      { key: 'no-machine-translation', text: 'I will not use machine translation without substantial revision.' },
      { key: 'flag-uncertain', text: 'I will flag anything I could not translate faithfully.' },
    ],
    allowsAttachments: false,
    allowsAmountRequest: false,
  },
};

/** A default form, so a grant without a bespoke one still opens. */
export const MOCK_DEFAULT_GRANT_FORM: Omit<GrantApplicationForm, 'grantId'> = {
  fields: [
    { key: 'proposal', label: 'What do you want to do?', kind: 'longText', isRequired: true, maxLength: 2000 },
    { key: 'impact', label: 'Who will it help, and how?', kind: 'longText', isRequired: true, maxLength: 1200 },
    { key: 'timeline', label: 'When will it be finished?', kind: 'text', isRequired: true, maxLength: 120 },
  ],
  declarations: [{ key: 'accurate', text: 'The information in this application is accurate.' }],
  allowsAttachments: true,
  allowsAmountRequest: true,
};

export const MOCK_GRANT_APPLICATIONS: GrantApplication[] = [
  {
    applicationId: 'grant-application-1',
    grantId: 'grant-translation',
    grantTitle: 'Translation fund',
    state: 'UnderReview',
    answers: {
      target_language: 'French',
      fluency: 'French is my first language. I grew up in Abidjan and studied in Paris.',
      guides: 'The NHS registration guide, the Right to Rent guide and the bank account guide first — those are the three people ask about most.',
    },
    attachmentIds: [],
    submittedAt: isoDaysAgo(6),
    decidedAt: null,
    decisionReason: null,
    informationRequested: null,
    reports: [],
    canWithdraw: true,
    canResubmit: false,
  },
  {
    applicationId: 'grant-application-2',
    grantId: 'grant-community-event',
    grantTitle: 'Community event fund',
    state: 'MoreInformationRequested',
    answers: {
      proposal: 'A winter welcome evening for people who arrived in the last three months.',
      impact: 'Around 40 recent arrivals in south London.',
      timeline: 'Early next month.',
    },
    attachmentIds: [],
    submittedAt: isoDaysAgo(21),
    decidedAt: null,
    decisionReason: null,
    informationRequested: [
      'A confirmed venue, or two options you are choosing between.',
      'A breakdown of what the £400 would be spent on.',
    ],
    respondByAt: isoDaysAhead(6),
    reports: [],
    canWithdraw: true,
    canResubmit: true,
  },
  {
    applicationId: 'grant-application-3',
    grantId: 'grant-newcomer-handbook',
    grantTitle: 'Newcomer handbook grant',
    state: 'Completed',
    answers: {
      city: 'London',
      languages: 'English and French',
      outline: 'Arriving · Documents · Housing · Banking · Healthcare · Transport · Work · Winter',
      why_you: 'I arrived in 2019 and wrote down everything I got wrong.',
      timeline: '3-6',
    },
    requestedAmount: money(120_000),
    attachmentIds: [],
    submittedAt: isoDaysAgo(300),
    decidedAt: isoDaysAgo(280),
    decisionReason: 'Approved. Strong outline and a clear second language.',
    awardedAmount: money(120_000),
    reports: [
      { reportId: 'report-1', title: 'Halfway progress report', dueAt: isoDaysAgo(180), state: 'Accepted', submittedAt: isoDaysAgo(182) },
      { reportId: 'report-2', title: 'Final report', dueAt: isoDaysAgo(90), state: 'Accepted', submittedAt: isoDaysAgo(94) },
    ],
    canWithdraw: false,
    canResubmit: false,
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// ACADEMY
// ═════════════════════════════════════════════════════════════════════════════

export const MOCK_ACADEMY_SECTIONS: CreatorAcademySection[] = [
  {
    key: 'start-here',
    title: 'Start here',
    description: 'What a creator on Diaspora does, and how to do your first week well.',
    icon: '🚀',
    courseIds: ['course-start-here', 'course-first-guide'],
    sortOrder: 10,
  },
  {
    key: 'better-guides',
    title: 'Creating better guides',
    description: 'The craft: structure, accuracy, keeping a guide alive after you publish it.',
    icon: '✍️',
    courseIds: ['course-guide-craft', 'course-keeping-current'],
    sortOrder: 20,
  },
  {
    key: 'audience',
    title: 'Growing your audience',
    description: 'How people find your work, and what makes them come back.',
    icon: '📈',
    courseIds: ['course-audience', 'course-analytics'],
    sortOrder: 30,
  },
  {
    key: 'trust-safety',
    title: 'Trust, safety and conduct',
    description: 'Community guidelines, safeguarding, and handling difficult situations.',
    icon: '🛡️',
    courseIds: ['course-safety', 'course-conduct'],
    sortOrder: 40,
  },
  {
    key: 'monetization',
    title: 'Monetization',
    description: 'Sponsored content, rewards and what the platform pays for.',
    icon: '💷',
    courseIds: ['course-monetization', 'course-sponsored'],
    sortOrder: 50,
  },
  {
    key: 'leadership',
    title: 'Community leadership',
    description: 'Running an organisation, hosting events, mentoring newer creators.',
    icon: '🏛️',
    courseIds: ['course-leadership'],
    sortOrder: 60,
  },
];

export const MOCK_COURSES: CreatorCourse[] = [
  {
    courseId: 'course-start-here',
    slug: 'start-here',
    title: 'What creators do on Diaspora',
    summary: 'The short version: you write down what you learned the hard way, so the next person does not have to.',
    sectionKey: 'start-here',
    level: 'beginner',
    estimatedMinutes: 12,
    icon: '🚀',
    tags: ['orientation'],
    lessonCount: 3,
    awardsCertificate: false,
    prerequisiteCourseIds: [],
    progress: {
      courseId: 'course-start-here',
      state: 'Completed',
      lessonsCompleted: 3,
      lessonCount: 3,
      percentage: 100,
      startedAt: isoDaysAgo(200),
      completedAt: isoDaysAgo(199),
    },
    isSaved: false,
    sortOrder: 10,
  },
  {
    courseId: 'course-first-guide',
    slug: 'your-first-guide',
    title: 'Writing your first guide',
    summary: 'Pick a subject, structure it, and publish it. One sitting.',
    sectionKey: 'start-here',
    level: 'beginner',
    estimatedMinutes: 20,
    icon: '📝',
    tags: ['writing', 'guides'],
    lessonCount: 4,
    awardsCertificate: false,
    prerequisiteCourseIds: [],
    progress: {
      courseId: 'course-first-guide',
      state: 'Completed',
      lessonsCompleted: 4,
      lessonCount: 4,
      percentage: 100,
      startedAt: isoDaysAgo(198),
      completedAt: isoDaysAgo(197),
    },
    isSaved: false,
    sortOrder: 20,
  },
  {
    courseId: 'course-guide-craft',
    slug: 'guide-craft',
    title: 'The craft of a good guide',
    summary: 'Why the best guides start with the thing that goes wrong, not with the introduction.',
    sectionKey: 'better-guides',
    level: 'intermediate',
    estimatedMinutes: 35,
    icon: '✍️',
    tags: ['writing', 'craft'],
    lessonCount: 5,
    awardsCertificate: true,
    awardsBadgeKey: 'guide_craft',
    prerequisiteCourseIds: ['course-first-guide'],
    progress: {
      courseId: 'course-guide-craft',
      state: 'InProgress',
      lessonsCompleted: 2,
      lessonCount: 5,
      percentage: 40,
      nextLessonId: 'lesson-craft-3',
      startedAt: isoDaysAgo(14),
    },
    isSaved: true,
    sortOrder: 30,
  },
  {
    courseId: 'course-keeping-current',
    slug: 'keeping-guides-current',
    title: 'Keeping a guide alive',
    summary: 'A guide about visa rules is wrong within a year. Here is how to keep yours right.',
    sectionKey: 'better-guides',
    level: 'intermediate',
    estimatedMinutes: 18,
    icon: '🔄',
    tags: ['maintenance', 'accuracy'],
    lessonCount: 3,
    awardsCertificate: false,
    prerequisiteCourseIds: [],
    progress: null,
    isSaved: false,
    sortOrder: 40,
  },
  {
    courseId: 'course-audience',
    slug: 'growing-your-audience',
    title: 'Growing your audience',
    summary: 'How discovery actually works on Diaspora, and what you can influence.',
    sectionKey: 'audience',
    level: 'intermediate',
    estimatedMinutes: 25,
    icon: '📈',
    tags: ['growth', 'discovery'],
    lessonCount: 4,
    awardsCertificate: false,
    prerequisiteCourseIds: [],
    progress: null,
    isSaved: true,
    sortOrder: 50,
  },
  {
    courseId: 'course-analytics',
    slug: 'reading-your-analytics',
    title: 'Reading your analytics',
    summary: 'Which numbers mean something, which are noise, and what to do about either.',
    sectionKey: 'audience',
    level: 'intermediate',
    estimatedMinutes: 22,
    icon: '📊',
    tags: ['analytics'],
    lessonCount: 3,
    awardsCertificate: false,
    prerequisiteCourseIds: [],
    progress: null,
    isSaved: false,
    sortOrder: 60,
  },
  {
    courseId: 'course-safety',
    slug: 'community-safety',
    title: 'Community safety',
    summary: 'Spotting scams aimed at newcomers, and what to do when somebody is at risk.',
    sectionKey: 'trust-safety',
    level: 'beginner',
    estimatedMinutes: 30,
    icon: '🛡️',
    tags: ['safety', 'safeguarding'],
    lessonCount: 4,
    awardsCertificate: true,
    awardsBadgeKey: 'safety_trained',
    prerequisiteCourseIds: [],
    progress: {
      courseId: 'course-safety',
      state: 'InProgress',
      lessonsCompleted: 1,
      lessonCount: 4,
      percentage: 25,
      nextLessonId: 'lesson-safety-2',
      startedAt: isoDaysAgo(5),
    },
    isSaved: false,
    sortOrder: 70,
  },
  {
    courseId: 'course-conduct',
    slug: 'professional-conduct',
    title: 'Professional conduct',
    summary: 'The community guidelines, in practice rather than in the abstract.',
    sectionKey: 'trust-safety',
    level: 'beginner',
    estimatedMinutes: 15,
    icon: '⚖️',
    tags: ['guidelines', 'conduct'],
    lessonCount: 3,
    awardsCertificate: false,
    prerequisiteCourseIds: [],
    progress: null,
    isSaved: false,
    sortOrder: 80,
  },
  {
    courseId: 'course-monetization',
    slug: 'monetization-basics',
    title: 'How creators earn on Diaspora',
    summary: 'Points, rewards, sponsorship and grants — what each one is and is not.',
    sectionKey: 'monetization',
    level: 'intermediate',
    estimatedMinutes: 28,
    icon: '💷',
    tags: ['money', 'rewards'],
    lessonCount: 4,
    awardsCertificate: false,
    prerequisiteCourseIds: [],
    progress: null,
    isSaved: false,
    sortOrder: 90,
  },
  {
    courseId: 'course-sponsored',
    slug: 'sponsored-content',
    title: 'Sponsored content, done honestly',
    summary: 'Disclosure, editorial independence, and what Diaspora will and will not approve.',
    sectionKey: 'monetization',
    level: 'advanced',
    estimatedMinutes: 32,
    icon: '📣',
    tags: ['sponsorship', 'disclosure'],
    lessonCount: 4,
    awardsCertificate: true,
    prerequisiteCourseIds: ['course-monetization'],
    progress: null,
    isSaved: false,
    sortOrder: 100,
  },
  {
    courseId: 'course-leadership',
    slug: 'community-leadership',
    title: 'Community leadership',
    summary: 'Running an organisation, hosting events, and bringing new creators through.',
    sectionKey: 'leadership',
    level: 'advanced',
    estimatedMinutes: 40,
    icon: '🏛️',
    tags: ['leadership', 'organisations'],
    lessonCount: 5,
    awardsCertificate: true,
    prerequisiteCourseIds: ['course-guide-craft'],
    progress: null,
    isSaved: false,
    sortOrder: 110,
  },
];

/**
 * Lessons.
 *
 * Only a few courses have their lessons written out in full — enough that the
 * viewer, the checklist block, the action block and the quiz are all exercised.
 * Every other course gets generated lessons from `synthesiseLessons` in the
 * handler, which keeps this file readable without leaving a course that opens
 * onto nothing.
 */
export const MOCK_LESSONS: CreatorLesson[] = [
  {
    lessonId: 'lesson-craft-1',
    courseId: 'course-guide-craft',
    title: 'Start with what goes wrong',
    kind: 'reading',
    estimatedMinutes: 7,
    sortOrder: 10,
    isComplete: true,
    completedAt: isoDaysAgo(14),
    blocks: [
      { kind: 'heading', text: 'The first paragraph is the whole guide' },
      {
        kind: 'paragraph',
        text: 'Somebody reading a guide about registering with a GP is not curious. They are ill, or their child is, and they have already tried and been turned away. They are reading on a phone, standing up, possibly in a second language.',
      },
      {
        kind: 'paragraph',
        text: 'So the first paragraph should say what goes wrong and what to do about it. Not "the NHS is the United Kingdom’s public health service". They know. Tell them the surgery cannot legally refuse them for having no proof of address, and give them the sentence to say.',
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'A test that works',
        text: 'Read your first paragraph and ask: if somebody stopped reading here, would they be better off? If not, rewrite it.',
      },
      { kind: 'heading', text: 'Then the steps, in order' },
      {
        kind: 'list',
        ordered: true,
        items: [
          'What you need before you start — and what you can do without.',
          'The steps, numbered, in the order they actually happen.',
          'What it costs, and what it should not cost.',
          'What to do when it goes wrong, which it will.',
        ],
      },
      {
        kind: 'quote',
        text: 'The guide I needed did not exist, so I wrote down everything I got wrong.',
        attribution: 'Most Diaspora creators, eventually',
      },
    ],
  },
  {
    lessonId: 'lesson-craft-2',
    courseId: 'course-guide-craft',
    title: 'Accuracy and how to keep it',
    kind: 'checklist',
    estimatedMinutes: 6,
    sortOrder: 20,
    isComplete: true,
    completedAt: isoDaysAgo(13),
    blocks: [
      {
        kind: 'paragraph',
        text: 'A guide that was right when you wrote it and is wrong now does more harm than no guide at all, because it is trusted. Work through this before you publish.',
      },
      {
        kind: 'checklist',
        items: [
          'Every fee, threshold and deadline has a date next to it.',
          'Anything that comes from a government page links to that page.',
          'You have said what you do not know, rather than guessing.',
          'You have not given immigration or legal advice you are not qualified to give.',
          'Someone who has just done this has read it.',
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'The one that catches people',
        text: 'Never state an immigration outcome as certain. Describe the process, link to the official source, and say that the decision is not yours to predict.',
      },
    ],
  },
  {
    lessonId: 'lesson-craft-3',
    courseId: 'course-guide-craft',
    title: 'Structure that survives a phone screen',
    kind: 'reading',
    estimatedMinutes: 8,
    sortOrder: 30,
    isComplete: false,
    blocks: [
      { kind: 'heading', text: 'Short sections, honest headings' },
      {
        kind: 'paragraph',
        text: 'A heading is a promise about what is underneath it. "Documents" is not a heading; "What to bring, and what to do if you do not have it" is. Somebody scanning on a phone reads the headings and nothing else until one matches their problem.',
      },
      {
        kind: 'list',
        ordered: false,
        items: [
          'One idea per section.',
          'Headings that answer a question rather than name a topic.',
          'The commonest case first, the edge case second.',
          'A summary at the top if the guide is longer than a screen.',
        ],
      },
      {
        kind: 'action',
        label: 'Open your drafts',
        route: '/profile/creator-dashboard',
        description: 'Try this on a draft you have already started.',
      },
    ],
  },
  {
    lessonId: 'lesson-craft-4',
    courseId: 'course-guide-craft',
    title: 'What to do when you get it wrong',
    kind: 'reading',
    estimatedMinutes: 6,
    sortOrder: 40,
    isComplete: false,
    blocks: [
      {
        kind: 'paragraph',
        text: 'You will publish something inaccurate. Everybody does. What matters is what happens next: correct it visibly, say what changed, and thank whoever told you.',
      },
      {
        kind: 'callout',
        tone: 'success',
        title: 'Corrections build trust',
        text: 'A guide with a visible correction history reads as more reliable, not less. Diaspora keeps a version history for exactly this reason.',
      },
    ],
  },
  {
    lessonId: 'lesson-craft-5',
    courseId: 'course-guide-craft',
    title: 'Check what you have learned',
    kind: 'quiz',
    estimatedMinutes: 8,
    sortOrder: 50,
    isComplete: false,
    blocks: [
      {
        kind: 'paragraph',
        text: 'Four questions. You need three right. You can retake it as many times as you like.',
      },
    ],
    quiz: {
      quizId: 'quiz-guide-craft',
      passMark: 3,
      questions: [
        {
          questionId: 'q1',
          prompt: 'What should the first paragraph of a guide do?',
          options: [
            { optionId: 'a', label: 'Introduce the topic and explain the background' },
            { optionId: 'b', label: 'Say what goes wrong and what to do about it' },
            { optionId: 'c', label: 'List the sections that follow' },
            { optionId: 'd', label: 'Explain who you are and why you are qualified' },
          ],
          explanation:
            'Somebody reading a guide already has the problem. The first paragraph should be useful on its own.',
        },
        {
          questionId: 'q2',
          prompt: 'A fee changed six months after you published. What should you do?',
          options: [
            { optionId: 'a', label: 'Leave it — readers will work it out' },
            { optionId: 'b', label: 'Quietly edit the number' },
            { optionId: 'c', label: 'Update it and say what changed' },
            { optionId: 'd', label: 'Unpublish the guide' },
          ],
          explanation: 'A visible correction is what makes the rest of the guide trustworthy.',
        },
        {
          questionId: 'q3',
          prompt: 'Somebody asks you to predict whether their visa will be approved.',
          options: [
            { optionId: 'a', label: 'Give your best guess based on experience' },
            { optionId: 'b', label: 'Describe the process and link the official source, without predicting the outcome' },
            { optionId: 'c', label: 'Tell them it will be fine' },
            { optionId: 'd', label: 'Refuse to answer at all' },
          ],
          explanation:
            'Describing the process helps. Predicting a decision you do not control does not, and can do real harm.',
        },
        {
          questionId: 'q4',
          prompt: 'What makes a good section heading?',
          options: [
            { optionId: 'a', label: 'It names the topic in one word' },
            { optionId: 'b', label: 'It is short enough to fit on one line' },
            { optionId: 'c', label: 'It answers a question the reader has' },
            { optionId: 'd', label: 'It matches the guide title' },
          ],
          explanation: 'People scan headings looking for their problem. A heading that answers one gets found.',
        },
      ],
    },
  },
  {
    lessonId: 'lesson-safety-1',
    courseId: 'course-safety',
    title: 'The scams that target newcomers',
    kind: 'reading',
    estimatedMinutes: 8,
    sortOrder: 10,
    isComplete: true,
    completedAt: isoDaysAgo(5),
    blocks: [
      { kind: 'heading', text: 'Three that come up again and again' },
      {
        kind: 'list',
        ordered: false,
        items: [
          'Rental deposits taken for a property the "landlord" does not own.',
          'Job offers that require a payment for a visa, a uniform or training.',
          'Immigration advice sold by somebody not registered to give it.',
        ],
      },
      {
        kind: 'paragraph',
        text: 'All three work for the same reason: they target somebody under time pressure who does not yet know what normal looks like. Your guide can be the thing that tells them what normal looks like.',
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Never handle it alone',
        text: 'If somebody tells you they are in danger or being exploited, report it through Diaspora rather than trying to resolve it yourself.',
      },
    ],
  },
  {
    lessonId: 'lesson-safety-2',
    courseId: 'course-safety',
    title: 'When somebody is at risk',
    kind: 'reading',
    estimatedMinutes: 7,
    sortOrder: 20,
    isComplete: false,
    blocks: [
      {
        kind: 'paragraph',
        text: 'You are not a caseworker and Diaspora does not expect you to be one. What you can do is recognise a situation that needs more than a guide, and route it to somebody who can help.',
      },
      {
        kind: 'action',
        label: 'Read the community guidelines',
        route: '/profile/community-guidelines',
        description: 'The escalation routes are set out there.',
      },
    ],
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// POINTS · REWARDS
// ═════════════════════════════════════════════════════════════════════════════

export const MOCK_POINT_RULES: CreatorPointRule[] = [
  {
    ruleKey: 'guide_published',
    label: 'Publish a guide',
    description: 'A guide that stays useful. Awarded once it is live.',
    points: 100,
    actionRoute: '/guide/create',
    category: 'Writing',
    isActive: true,
  },
  {
    ruleKey: 'guide_helpful_vote',
    label: 'Someone marks your guide helpful',
    description: 'The strongest signal that a guide is doing its job.',
    points: 15,
    limitLabel: 'Up to 40 a month per guide',
    category: 'Writing',
    isActive: true,
  },
  {
    ruleKey: 'guide_updated',
    label: 'Keep a guide current',
    description: 'A substantive update to a guide older than three months.',
    points: 40,
    limitLabel: 'Once per guide per quarter',
    category: 'Writing',
    isActive: true,
  },
  {
    ruleKey: 'update_published',
    label: 'Post a community update',
    description: 'Timely news about what is changing where you live.',
    points: 30,
    actionRoute: '/update/create',
    limitLabel: 'Up to 10 a month',
    category: 'Community',
    isActive: true,
  },
  {
    ruleKey: 'newcomer_answered',
    label: 'Answer a newcomer’s question',
    description: 'Awarded when the person who asked marks it useful.',
    points: 25,
    category: 'Community',
    isActive: true,
  },
  {
    ruleKey: 'event_hosted',
    label: 'Host an event',
    description: 'Awarded after the event runs with at least five attendees.',
    points: 300,
    actionRoute: '/community-life/event/create',
    category: 'Community',
    isActive: true,
  },
  {
    ruleKey: 'referral_qualified',
    label: 'Someone you invited joins and stays',
    description: 'Awarded once they complete their first week.',
    points: 200,
    actionRoute: '/creator/referrals',
    category: 'Growth',
    isActive: true,
  },
  {
    ruleKey: 'verification_completed',
    label: 'Complete a verification',
    description: 'Identity, country or creator verification.',
    points: 150,
    actionRoute: '/profile/trust-center',
    limitLabel: 'Once per verification type',
    category: 'Standing',
    isActive: true,
  },
  {
    ruleKey: 'course_completed',
    label: 'Finish an Academy course',
    description: 'Courses that award a certificate pay more.',
    points: 75,
    actionRoute: '/creator/academy',
    category: 'Learning',
    isActive: true,
  },
  {
    ruleKey: 'challenge_completed',
    label: 'Complete a challenge',
    description: 'The reward varies by challenge and is shown on each one.',
    points: 0,
    actionRoute: '/creator/challenges',
    limitLabel: 'Varies — see the challenge',
    category: 'Challenges',
    isActive: true,
  },
];

export const MOCK_REWARD_CATALOGUE: CreatorReward[] = [
  {
    rewardId: 'reward-guide-boost',
    title: 'Feature a guide for 7 days',
    description: 'One of your guides appears in the featured slot for your country.',
    pointsCost: 1_500,
    state: 'Available',
    category: 'Reach',
    icon: '🚀',
    grantKind: 'placement',
  },
  {
    rewardId: 'reward-advanced-analytics',
    title: 'Advanced analytics for a month',
    description: 'Audience breakdowns, comparison periods and export.',
    pointsCost: 2_500,
    state: 'Available',
    category: 'Tools',
    icon: '📊',
    grantKind: 'entitlement',
  },
  {
    rewardId: 'reward-profile-badge',
    title: 'Supporter badge for a year',
    description: 'A badge on your profile showing you have earned it rather than bought it.',
    pointsCost: 800,
    state: 'Available',
    category: 'Standing',
    icon: '🎖️',
    grantKind: 'badge',
  },
  {
    rewardId: 'reward-event-credit',
    title: '£25 toward an event',
    description: 'Wallet credit ring-fenced for event costs.',
    pointsCost: 5_000,
    state: 'Locked',
    lockedReason: 'Available to established creators.',
    category: 'Money',
    icon: '🎪',
    grantKind: 'credit',
  },
  {
    rewardId: 'reward-mentoring',
    title: 'A mentoring session',
    description: 'Forty-five minutes with an established creator in your country.',
    pointsCost: 3_000,
    state: 'Available',
    category: 'Learning',
    icon: '🧑‍🏫',
    grantKind: 'service',
  },
  {
    rewardId: 'reward-winter-pack',
    title: 'Winter campaign pack',
    description: 'Templates and a featured slot during the winter arrivals period.',
    pointsCost: 1_200,
    state: 'Expired',
    category: 'Seasonal',
    icon: '❄️',
    expiresAt: isoDaysAgo(30),
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// REFERRALS · SIGN-UP BONUS
// ═════════════════════════════════════════════════════════════════════════════

export const MOCK_REFERRAL_PROGRAMME: CreatorReferralProgramme = {
  code: 'AMARA-LDN',
  shareUrl: 'https://diaspora.app/join?ref=AMARA-LDN',
  rewardDescription: 'You earn 200 points for each person who joins and completes their first week.',
  qualificationDescription:
    'A referral qualifies once the person you invited has verified their phone, chosen a country and been active for seven days. Referrals from the same device or household do not qualify.',
  terms: [
    'Points are awarded after the seven-day period, not at signup.',
    'Diaspora may withhold a reward where it has reason to think an invitation was not genuine.',
    'Referrals do not qualify between accounts that share a device.',
    'The reward can change; the amount shown when you shared is the amount you get.',
  ],
  invited: 14,
  signedUp: 6,
  // Deliberately not equal to `signedUp`. §18: not every signup qualifies, and
  // a fixture where they matched would let a screen conflate them undetected.
  qualified: 3,
  pendingRewards: 1,
  confirmedRewards: 3,
  totalEarned: null,
  totalPointsEarned: 600,
  isEligible: true,
  updatedAt: isoHoursAgo(2),
};

export const MOCK_REFERRALS: CreatorReferral[] = [
  {
    referralId: 'referral-1',
    inviteeLabel: 'Kofi A.',
    state: 'Rewarded',
    invitedAt: isoDaysAgo(64),
    signedUpAt: isoDaysAgo(62),
    qualifiedAt: isoDaysAgo(55),
    rewardPoints: 200,
  },
  {
    referralId: 'referral-2',
    inviteeLabel: 'Fatou D.',
    state: 'Rewarded',
    invitedAt: isoDaysAgo(48),
    signedUpAt: isoDaysAgo(47),
    qualifiedAt: isoDaysAgo(40),
    rewardPoints: 200,
  },
  {
    referralId: 'referral-3',
    inviteeLabel: 'Yao K.',
    state: 'Rewarded',
    invitedAt: isoDaysAgo(35),
    signedUpAt: isoDaysAgo(34),
    qualifiedAt: isoDaysAgo(27),
    rewardPoints: 200,
  },
  {
    referralId: 'referral-4',
    inviteeLabel: 'Aminata S.',
    state: 'Pending',
    stateReason: 'Joined 4 days ago. Qualifies after seven days of activity.',
    invitedAt: isoDaysAgo(6),
    signedUpAt: isoDaysAgo(4),
  },
  {
    referralId: 'referral-5',
    inviteeLabel: 'Ibrahim T.',
    state: 'Signed Up',
    stateReason: 'Has not chosen a country yet.',
    invitedAt: isoDaysAgo(11),
    signedUpAt: isoDaysAgo(10),
  },
  {
    referralId: 'referral-6',
    inviteeLabel: 'Nadia B.',
    state: 'Rejected',
    stateReason: 'This invitation did not meet the programme terms.',
    invitedAt: isoDaysAgo(20),
    signedUpAt: isoDaysAgo(19),
  },
  {
    referralId: 'referral-7',
    inviteeLabel: 'Sekou M.',
    state: 'Expired',
    stateReason: 'The invitation was not used within 30 days.',
    invitedAt: isoDaysAgo(70),
  },
  {
    referralId: 'referral-8',
    inviteeLabel: 'Mariam C.',
    state: 'Invited',
    invitedAt: isoDaysAgo(2),
  },
];

export const MOCK_SIGNUP_BONUS: SignupBonus = {
  state: 'Pending',
  points: 250,
  requirements: [
    { key: 'phone_verified', label: 'Verify your phone number', isMet: true, actionRoute: '/verification/phone', actionLabel: 'Verify' },
    { key: 'country_chosen', label: 'Choose your country', isMet: true },
    { key: 'profile_photo', label: 'Add a profile photo', isMet: false, actionRoute: '/creator/profile', actionLabel: 'Add one' },
    { key: 'first_action', label: 'Save or read your first guide', isMet: true },
  ],
  expiresAt: isoDaysAhead(21),
};

// ═════════════════════════════════════════════════════════════════════════════
// REVENUE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The revenue headline.
 *
 * **Two sources, because two is what the platform can produce.** This carried
 * four, including `Grant` and `RewardConversion` — neither of which is a
 * `CreatorEarningSource` at all — so a development build drew a "Community
 * grants" bar that no real deployment could ever fill. `Subscription` and
 * `Referral` are real enum members but have no consumer publishing them yet, so
 * they are absent rather than shown as a zero row: honestly empty means missing,
 * not a bar of length nothing.
 *
 * `lifetimeEarned` is pending + available + processing + paid, and deliberately
 * excludes `reversed` — the same arithmetic the server does, so a fixture cannot
 * make a screen look right against totals the server would never send.
 */
export const MOCK_REVENUE_SUMMARY: CreatorRevenueSummary = {
  currency: 'GBP',
  lifetimeEarned: money(148_650),
  available: money(4_200),
  // Deliberately non-zero and deliberately separate. §17: a screen must never
  // add these together, and a fixture with a zero pending balance would hide a
  // screen that did.
  pending: money(2_750),
  processing: money(0),
  paidOut: money(141_700),
  // Reversed and refunded, carried rather than netted away.
  reversed: money(2_700),
  currentPeriod: money(6_950),
  currentPeriodLabel: 'This month',
  clearingDays: 30,
  hasOtherCurrencies: false,
  breakdown: [
    { source: 'SponsoredContent', label: 'Sponsored content', amount: money(118_400), sharePercentage: 79.7, transactionCount: 7 },
    { source: 'Donation', label: 'Donations', amount: money(30_250), sharePercentage: 20.3, transactionCount: 27 },
  ],
  generatedAt: isoHoursAgo(1),
};

export const MOCK_EARNINGS: CreatorEarning[] = [
  {
    earningId: 'earning-1',
    source: 'SponsoredContent',
    state: 'Pending',
    amount: money(3_000),
    fee: money(450),
    netAmount: money(2_550),
    description: 'Sponsored placement — “Opening a UK bank account”',
    // The ledger's own word for a subject, lower case, as `LedgerSubjectFor`
    // maps it. `Guide` is the integration event's spelling and never reaches a
    // response.
    subjectType: 'guide',
    subjectId: 'guide-bank-account',
    availableAt: isoDaysAhead(9),
    occurredAt: isoDaysAgo(5),
  },
  {
    earningId: 'earning-2',
    source: 'Donation',
    state: 'Available',
    amount: money(500),
    fee: money(0),
    netAmount: money(500),
    description: 'Reader donation',
    // A subject the client has a route for, so the row is tappable in a
    // development build and the navigation is exercised rather than only
    // compiled. The pending rows above deliberately carry none.
    subjectType: 'campaign',
    subjectId: 'd41d8cd9-0000-4000-8000-000000000001',
    occurredAt: isoDaysAgo(8),
    settledAt: isoDaysAgo(8),
  },
  {
    earningId: 'earning-3',
    source: 'Donation',
    state: 'Available',
    amount: money(1_250),
    fee: money(0),
    netAmount: money(1_250),
    description: 'Reader donation',
    occurredAt: isoDaysAgo(16),
    settledAt: isoDaysAgo(16),
  },
  {
    earningId: 'earning-4',
    source: 'SponsoredContent',
    state: 'Paid',
    amount: money(4_000),
    fee: money(600),
    netAmount: money(3_400),
    description: 'Sponsored placement — “Right to Rent explained”',
    subjectType: 'guide',
    subjectId: 'guide-right-to-rent',
    occurredAt: isoDaysAgo(40),
    settledAt: isoDaysAgo(33),
  },
  {
    earningId: 'earning-5',
    source: 'SponsoredContent',
    state: 'Paid',
    amount: money(120_000),
    fee: money(0),
    netAmount: money(120_000),
    description: 'Sponsored placement — “The newcomer handbook”',
    subjectType: 'guide',
    subjectId: 'guide-newcomer-handbook',
    occurredAt: isoDaysAgo(95),
    settledAt: isoDaysAgo(90),
  },
  {
    earningId: 'earning-6',
    source: 'SponsoredContent',
    state: 'Reversed',
    amount: money(2_000),
    fee: money(300),
    netAmount: money(1_700),
    description: 'Sponsored placement reversed — sponsor payment failed',
    subjectType: 'guide',
    subjectId: 'guide-council-tax',
    occurredAt: isoDaysAgo(52),
    settledAt: isoDaysAgo(50),
  },
  {
    earningId: 'earning-7',
    source: 'Donation',
    state: 'Refunded',
    amount: money(1_000),
    fee: money(0),
    netAmount: money(1_000),
    description: 'Donation refunded at the donor’s request',
    occurredAt: isoDaysAgo(70),
    settledAt: isoDaysAgo(68),
  },
  {
    earningId: 'earning-8',
    // Was a `Referral` of zero. Two things were wrong with it: no consumer
    // publishes a referral earning, and the recorder refuses a gross of zero
    // outright — so the row was a shape the platform cannot produce, sitting in
    // the fixture a development build renders.
    source: 'Donation',
    state: 'Available',
    amount: money(800),
    fee: money(0),
    netAmount: money(800),
    description: 'Reader donation',
    occurredAt: isoDaysAgo(27),
    settledAt: isoDaysAgo(27),
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═════════════════════════════════════════════════════════════════════════════

/** Metric definitions the platform would own. Rendered, never authored in a screen. */
const METRIC_DEFINITIONS: Record<string, string> = {
  profile_views: 'People who opened your creator profile. One person counted once a day.',
  content_views: 'People who opened something you published. One person counted once per item per day.',
  reach: 'Distinct people who saw your work in a feed or a search result, whether or not they opened it.',
  saves: 'Times somebody saved one of your items to come back to.',
  shares: 'Times somebody shared one of your items outside Diaspora.',
  helpful_votes: 'Times somebody marked your advice helpful.',
  comments: 'Comments left on your content, excluding your own replies.',
  followers: 'People following you at the end of the period.',
  follower_growth: 'Net change in followers over the period.',
  engagement_rate: 'Engagements divided by reach, as a percentage.',
  conversion: 'People who took the action a guide suggested, where the action is measurable.',
  revenue: 'Money attributed to your work in the period, before any fee.',
};

/**
 * Metrics for a period.
 *
 * Scaled deterministically from the period so switching period visibly changes
 * the figures — a fixture that returned the same numbers for 7 days and 90 days
 * would let a broken period selector pass review.
 */
export function mockMetricsForPeriod(period: string): CreatorMetric[] {
  const scale =
    period === 'today' ? 0.03
      : period === '7d' ? 0.2
        : period === '30d' ? 1
          : period === '90d' ? 2.6
            : period === 'year' ? 9.4
              : 1.4;

  const scaled = (base: number) => Math.round(base * scale);

  return [
    {
      key: 'content_views',
      label: 'Views',
      value: scaled(3_180),
      format: 'count',
      changePercentage: 12.4,
      higherIsBetter: true,
      definition: METRIC_DEFINITIONS.content_views,
    },
    {
      key: 'reach',
      label: 'Reach',
      value: scaled(8_940),
      format: 'count',
      changePercentage: 8.1,
      higherIsBetter: true,
      definition: METRIC_DEFINITIONS.reach,
    },
    {
      key: 'saves',
      label: 'Saves',
      value: scaled(214),
      format: 'count',
      changePercentage: 22.7,
      higherIsBetter: true,
      definition: METRIC_DEFINITIONS.saves,
    },
    {
      key: 'helpful_votes',
      label: 'Helpful votes',
      value: scaled(96),
      format: 'count',
      changePercentage: -4.2,
      higherIsBetter: true,
      definition: METRIC_DEFINITIONS.helpful_votes,
    },
    {
      key: 'followers',
      label: 'Followers',
      value: 342,
      format: 'count',
      changePercentage: 5.9,
      higherIsBetter: true,
      definition: METRIC_DEFINITIONS.followers,
    },
    {
      key: 'engagement_rate',
      label: 'Engagement',
      value: 6.8,
      format: 'percentage',
      changePercentage: 1.1,
      higherIsBetter: true,
      definition: METRIC_DEFINITIONS.engagement_rate,
    },
    {
      key: 'profile_views',
      label: 'Profile views',
      value: scaled(487),
      format: 'count',
      changePercentage: 15.3,
      higherIsBetter: true,
      definition: METRIC_DEFINITIONS.profile_views,
    },
    {
      key: 'revenue',
      label: 'Revenue',
      value: scaled(6_950) / 100,
      format: 'currency',
      amount: money(scaled(6_950)),
      changePercentage: 31.2,
      higherIsBetter: true,
      definition: METRIC_DEFINITIONS.revenue,
    },
  ];
}

/** A deterministic series, so a chart is stable between renders. */
export function mockSeries(key: string, buckets: number, base: number) {
  const points = [];
  for (let index = 0; index < buckets; index += 1) {
    // A fixed wobble rather than randomness: a chart that changed shape on every
    // re-render makes a layout bug impossible to see.
    const wobble = Math.sin(index * 0.9) * 0.18 + Math.cos(index * 0.4) * 0.1;
    const trend = 1 + (index / Math.max(1, buckets - 1)) * 0.35;
    points.push({
      at: isoDaysAgo(buckets - index - 1),
      value: Math.max(0, Math.round(base * trend * (1 + wobble))),
    });
  }
  return { key, label: key, points };
}

export const MOCK_CONTENT_PERFORMANCE: CreatorContentPerformance[] = [
  {
    contentId: 'guide-bank-account',
    contentType: 'Guide',
    title: 'Opening a UK bank account without a UK address',
    publishedAt: isoDaysAgo(140),
    status: 'Published',
    isSponsored: true,
    revenue: money(3_000),
    metrics: [
      { key: 'content_views', label: 'Views', value: 4_128, format: 'count', changePercentage: 18.2, higherIsBetter: true, definition: METRIC_DEFINITIONS.content_views },
      { key: 'saves', label: 'Saves', value: 412, format: 'count', changePercentage: 24.1, higherIsBetter: true, definition: METRIC_DEFINITIONS.saves },
      { key: 'helpful_votes', label: 'Helpful', value: 88, format: 'count', changePercentage: 9.0, higherIsBetter: true, definition: METRIC_DEFINITIONS.helpful_votes },
    ],
  },
  {
    contentId: 'guide-right-to-rent',
    contentType: 'Guide',
    title: 'Right to Rent: what a landlord can and cannot ask for',
    publishedAt: isoDaysAgo(96),
    status: 'Published',
    isSponsored: false,
    metrics: [
      { key: 'content_views', label: 'Views', value: 3_640, format: 'count', changePercentage: 6.4, higherIsBetter: true, definition: METRIC_DEFINITIONS.content_views },
      { key: 'saves', label: 'Saves', value: 388, format: 'count', changePercentage: 11.9, higherIsBetter: true, definition: METRIC_DEFINITIONS.saves },
      { key: 'helpful_votes', label: 'Helpful', value: 71, format: 'count', changePercentage: 3.2, higherIsBetter: true, definition: METRIC_DEFINITIONS.helpful_votes },
    ],
  },
  {
    contentId: 'guide-nhs',
    contentType: 'Guide',
    title: 'Registering with a GP when you have no proof of address',
    publishedAt: isoDaysAgo(210),
    status: 'Published',
    isSponsored: false,
    metrics: [
      { key: 'content_views', label: 'Views', value: 2_910, format: 'count', changePercentage: -2.8, higherIsBetter: true, definition: METRIC_DEFINITIONS.content_views },
      { key: 'saves', label: 'Saves', value: 301, format: 'count', changePercentage: 1.4, higherIsBetter: true, definition: METRIC_DEFINITIONS.saves },
      { key: 'helpful_votes', label: 'Helpful', value: 64, format: 'count', changePercentage: 0, higherIsBetter: true, definition: METRIC_DEFINITIONS.helpful_votes },
    ],
  },
  {
    contentId: 'update-council-tax',
    contentType: 'Update',
    title: 'Council tax single-person discount deadline this month',
    publishedAt: isoDaysAgo(18),
    status: 'Published',
    isSponsored: false,
    metrics: [
      { key: 'content_views', label: 'Views', value: 1_204, format: 'count', changePercentage: 88.0, higherIsBetter: true, definition: METRIC_DEFINITIONS.content_views },
      { key: 'shares', label: 'Shares', value: 63, format: 'count', changePercentage: 120.0, higherIsBetter: true, definition: METRIC_DEFINITIONS.shares },
    ],
  },
  {
    contentId: 'guide-winter',
    contentType: 'Guide',
    title: 'Your first British winter: heating, damp and bills',
    publishedAt: isoDaysAgo(62),
    status: 'Published',
    isSponsored: false,
    metrics: [
      { key: 'content_views', label: 'Views', value: 986, format: 'count', changePercentage: -34.0, higherIsBetter: true, definition: METRIC_DEFINITIONS.content_views },
      { key: 'saves', label: 'Saves', value: 142, format: 'count', changePercentage: -12.0, higherIsBetter: true, definition: METRIC_DEFINITIONS.saves },
    ],
  },
  {
    contentId: 'event-welcome-evening',
    contentType: 'Event',
    title: 'Newcomer welcome evening — Peckham',
    publishedAt: isoDaysAgo(30),
    status: 'Completed',
    isSponsored: false,
    metrics: [
      { key: 'content_views', label: 'Views', value: 540, format: 'count', changePercentage: 0, higherIsBetter: true, definition: METRIC_DEFINITIONS.content_views },
      { key: 'conversion', label: 'Registrations', value: 38, format: 'count', changePercentage: 0, higherIsBetter: true, definition: METRIC_DEFINITIONS.conversion },
    ],
  },
  {
    contentId: 'guide-ni-number',
    contentType: 'Guide',
    title: 'Applying for a National Insurance number',
    publishedAt: isoDaysAgo(300),
    status: 'Published',
    isSponsored: false,
    metrics: [
      { key: 'content_views', label: 'Views', value: 2_240, format: 'count', changePercentage: 4.1, higherIsBetter: true, definition: METRIC_DEFINITIONS.content_views },
      { key: 'saves', label: 'Saves', value: 260, format: 'count', changePercentage: 2.0, higherIsBetter: true, definition: METRIC_DEFINITIONS.saves },
    ],
  },
  {
    contentId: 'guide-phone-contract',
    contentType: 'Guide',
    title: 'Getting a phone contract with no credit history',
    publishedAt: isoDaysAgo(75),
    status: 'Draft',
    isSponsored: false,
    metrics: [
      { key: 'content_views', label: 'Views', value: 0, format: 'count', higherIsBetter: true, definition: METRIC_DEFINITIONS.content_views },
    ],
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// SPONSORED CONTENT
// ═════════════════════════════════════════════════════════════════════════════

export const MOCK_SPONSORED_CONTENT: SponsoredContentItem[] = [
  {
    placementId: 'placement-1',
    contentId: 'guide-bank-account',
    contentType: 'Guide',
    contentTitle: 'Opening a UK bank account without a UK address',
    productCode: 'guide.feature.7d',
    packageLabel: 'Featured guide · 7 days',
    state: 'Active',
    amountPaid: money(1_200),
    startsAt: isoDaysAgo(3),
    endsAt: isoDaysAhead(4),
    isRenewable: true,
    performance: [
      { key: 'impressions', label: 'Impressions', value: 8_420, format: 'count', higherIsBetter: true, definition: 'Times the featured slot was shown.' },
      { key: 'clicks', label: 'Opens', value: 612, format: 'count', higherIsBetter: true, definition: 'Times somebody opened the guide from the featured slot.' },
      { key: 'ctr', label: 'Open rate', value: 7.3, format: 'percentage', higherIsBetter: true, definition: 'Opens divided by impressions.' },
    ],
  },
  {
    placementId: null,
    contentId: 'guide-nhs',
    contentType: 'Guide',
    contentTitle: 'Registering with a GP when you have no proof of address',
    productCode: 'guide.feature.30d',
    packageLabel: 'Featured guide · 30 days',
    state: 'PendingApproval',
    amountPaid: money(3_600),
    isRenewable: false,
  },
  {
    placementId: 'placement-3',
    contentId: 'guide-right-to-rent',
    contentType: 'Guide',
    contentTitle: 'Right to Rent: what a landlord can and cannot ask for',
    productCode: 'guide.feature.7d',
    packageLabel: 'Featured guide · 7 days',
    state: 'Expired',
    amountPaid: money(1_200),
    startsAt: isoDaysAgo(40),
    endsAt: isoDaysAgo(33),
    isRenewable: true,
    performance: [
      { key: 'impressions', label: 'Impressions', value: 11_240, format: 'count', higherIsBetter: true, definition: 'Times the featured slot was shown.' },
      { key: 'clicks', label: 'Opens', value: 704, format: 'count', higherIsBetter: true, definition: 'Times somebody opened the guide from the featured slot.' },
    ],
  },
  {
    placementId: null,
    contentId: 'guide-council-tax',
    contentType: 'Guide',
    contentTitle: 'Council tax: who pays, who does not',
    productCode: 'guide.feature.7d',
    packageLabel: 'Featured guide · 7 days',
    state: 'Rejected',
    rejectionReason:
      'The guide links to a third-party service that pays a commission, which is not disclosed in the text. Add a disclosure and resubmit.',
    isRenewable: false,
  },
  {
    placementId: null,
    contentId: 'update-council-tax',
    contentType: 'Update',
    contentTitle: 'Council tax single-person discount deadline this month',
    state: 'Draft',
    isRenewable: false,
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// LEADERBOARDS · DIRECTORY · RECOMMENDATIONS
// ═════════════════════════════════════════════════════════════════════════════

const LEADERBOARD_NAMES = [
  'Chidi Okonkwo', 'Priya Raman', 'Amara Kone', 'Tomás Silva', 'Leila Haddad',
  'Jun-ho Park', 'Grace Mwangi', 'Andrei Popescu', 'Zainab Ali', 'Mateo Rossi',
  'Nour El-Sayed', 'Kwame Boateng', 'Ana Kovač', 'Hassan Farah', 'Mei Lin',
];

export function mockLeaderboard(scope: string, period = '30d') {
  const titles: Record<string, string> = {
    'top-creators': 'Top creators',
    'top-contributors': 'Top contributors',
    community: 'Your community',
    country: 'United Kingdom',
    challenge: 'Challenge standings',
  };

  const scoreLabels: Record<string, string> = {
    'top-creators': 'Impact score',
    'top-contributors': 'Contribution points',
    community: 'Community score',
    country: 'Impact score',
    challenge: 'Tasks completed',
  };

  const entries = LEADERBOARD_NAMES.map((displayName, index) => ({
    rank: index + 1,
    creatorId: `creator-${index + 1}`,
    displayName,
    avatarUrl: null,
    score: Math.round(2_400 / (index * 0.55 + 1)),
    isVerifiedCreator: index < 9,
    countryCode: index % 3 === 0 ? 'GB' : index % 3 === 1 ? 'FR' : 'DE',
    rankDelta: [2, -1, 3, 0, -2, 1, 0, 4, -3, 1, 0, 2, -1, 0, 1][index] ?? 0,
  }));

  return {
    scope,
    title: titles[scope] ?? 'Leaderboard',
    periodLabel: period === '30d' ? 'Last 30 days' : period === '7d' ? 'Last 7 days' : 'All time',
    scoreLabel: scoreLabels[scope] ?? 'Score',
    entries,
    // Amara sits third in this fixture, so the "your position" row and the
    // in-list highlight are both exercised.
    viewerEntry: entries[2],
    updatedAt: isoHoursAgo(3),
  };
}

export const MOCK_PUBLIC_CREATORS: PublicCreator[] = LEADERBOARD_NAMES.map((displayName, index) => ({
  creatorId: `creator-${index + 1}`,
  displayName,
  handle: displayName.toLowerCase().replace(/[^a-z]+/g, ''),
  avatarUrl: null,
  bio: [
    'Writing about the administrative maze so nobody else has to learn it twice.',
    'Housing, tenancy rights and how to spot a rental scam.',
    'Banking, credit and the paperwork nobody explains.',
    'Healthcare access for people who have just arrived.',
    'Work, contracts and what your rights actually are.',
  ][index % 5],
  status: index < 3 ? 'TopCreator' : index < 9 ? 'VerifiedCreator' : 'EmergingCreator',
  isVerifiedCreator: index < 9,
  countryCode: index % 3 === 0 ? 'GB' : index % 3 === 1 ? 'FR' : 'DE',
  categories: [
    ['settling-in', 'housing'],
    ['money-and-banking'],
    ['healthcare'],
    ['work'],
    ['community'],
  ][index % 5],
  expertise: [
    ['Right to Rent', 'Deposits'],
    ['Bank accounts', 'Credit history'],
    ['NHS registration', 'GP access'],
    ['Employment contracts', 'Payslips'],
    ['Community organising'],
  ][index % 5],
  languages: index % 2 === 0 ? ['English', 'French'] : ['English'],
  followers: Math.round(1_800 / (index * 0.5 + 1)),
  contentPublished: Math.round(60 / (index * 0.4 + 1)),
  reputationScore: Math.round(2_400 / (index * 0.55 + 1)),
  badges: MOCK_CREATOR_BADGES.filter((badge) => badge.isEarned).slice(0, index < 3 ? 4 : 2),
}));

export const MOCK_RECOMMENDATIONS: CreatorRecommendation[] = [
  {
    recommendationId: 'rec-claim-milestone',
    kind: 'improvement',
    title: 'You have a milestone waiting',
    body: '“Ten guides” is complete and unclaimed. It pays 500 points.',
    reason: 'You completed this 12 days ago and have not claimed it.',
    icon: '🎁',
    actionLabel: 'Claim it',
    actionRoute: '/creator/milestones',
    confidence: 1,
  },
  {
    recommendationId: 'rec-finish-challenge',
    kind: 'challenge',
    title: 'One guide from finishing a challenge',
    body: '“Three genuinely helpful guides” needs one more guide and four more helpful votes.',
    reason: 'You are 55% through and the challenge ends in 18 days.',
    icon: '🏁',
    actionLabel: 'See the challenge',
    actionRoute: '/creator/challenges/challenge-helpful-guides',
    confidence: 0.9,
  },
  {
    recommendationId: 'rec-course-craft',
    kind: 'course',
    title: 'Continue “The craft of a good guide”',
    body: 'Three lessons left, about 22 minutes.',
    reason: 'You started this two weeks ago and stopped at lesson 2.',
    icon: '✍️',
    actionLabel: 'Continue',
    actionRoute: '/creator/academy/course/course-guide-craft',
    confidence: 0.8,
  },
  {
    recommendationId: 'rec-grant-handbook',
    kind: 'grant',
    title: 'You are eligible for the handbook grant',
    body: 'Up to £1,500 to write an arrival handbook for London. Closes in 23 days.',
    reason: 'You meet every requirement and write about London already.',
    icon: '💷',
    actionLabel: 'Read the grant',
    actionRoute: '/creator/grants/grant-newcomer-handbook',
    confidence: 0.75,
  },
  {
    recommendationId: 'rec-cover-image',
    kind: 'improvement',
    title: 'Add a cover image',
    body: 'Your profile is 82% complete. A cover image is the biggest thing missing.',
    reason: 'Profiles with a cover image are followed noticeably more often.',
    icon: '🖼️',
    actionLabel: 'Add one',
    actionRoute: '/creator/profile',
    confidence: 0.6,
  },
  {
    recommendationId: 'rec-sponsor-nhs',
    kind: 'sponsored',
    title: 'Your GP guide is doing well without promotion',
    body: 'Featuring it for a week would put it in front of new arrivals in London.',
    reason: 'It has a high save rate and no active placement.',
    icon: '📣',
    actionLabel: 'See packages',
    actionRoute: '/creator/sponsored',
    confidence: 0.55,
  },
];
