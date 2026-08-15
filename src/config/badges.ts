// ─────────────────────────────────────────────────────────────────────────────
// The badge catalogue — one list, for both surfaces that show badges
//
// ── Why this file exists ─────────────────────────────────────────────────────
//
// There were two badge systems and they disagreed.
//
//   * The **creator profile** read `reputation.badges` and rendered
//     "4 earned, 2 to go" — six, from the reputation adapter.
//   * **Creator Studio → Overview** rendered `ALL_CREATOR_BADGES`, twelve, held
//     as a literal inside `components/creator/AchievementsModal.tsx`.
//
// A member who earned something saw one number on one screen and a different
// number on the next. Worse, the two lists were not subsets of each other: the
// twelve were about using the *whole app* — housing, marketplace, jobs,
// moderation — while the six were creator-reputation tiers.
//
// This is the twelve, extended. It lives in `config/` rather than beside a
// modal because a catalogue that two screens read is not a component's private
// data, and burying it in one of them is how the split happened.
//
// ── Why they are grouped ─────────────────────────────────────────────────────
//
// Twelve was already a long undifferentiated shelf; the additions below would
// have made it thirty. `BadgeGroup` is what lets a surface show "your community
// badges" rather than everything at once, and lets the member see there is a
// whole category they have not started.
//
// ── What was added, and on what basis ────────────────────────────────────────
//
// Only things the app can actually observe. Every badge below corresponds to a
// capability that exists in the product today — a guide published, a campaign
// donated to, a poll voted in, a volunteer shift taken, a listing sold, an
// automation created, a wallet reward converted, a verification approved.
//
// Nothing here rewards something Diaspora cannot see. A badge for an event that
// is never recorded is a promise the app breaks quietly, every time.
// ─────────────────────────────────────────────────────────────────────────────

export type BadgeStatus = 'unlocked' | 'verified' | 'level' | 'in_progress' | 'locked';

/**
 * The area of the product a badge belongs to.
 *
 * Ordered as the member meets them: arrive and be verified, then contribute,
 * then take part, then trade, then help run the place.
 */
export type BadgeGroup =
  | 'trust'
  | 'creating'
  | 'community'
  | 'living'
  | 'money'
  | 'stewardship';

export const BADGE_GROUP_ORDER: readonly BadgeGroup[] = [
  'trust',
  'creating',
  'community',
  'living',
  'money',
  'stewardship',
] as const;

export const BADGE_GROUP_LABELS: Record<BadgeGroup, string> = {
  trust: 'Trust & verification',
  creating: 'Writing & guides',
  community: 'Community life',
  living: 'Housing, jobs & marketplace',
  money: 'Wallet & giving',
  stewardship: 'Looking after the place',
};

export interface BadgeItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  status: BadgeStatus;
  statusText: string;
  progress?: string;
  group: BadgeGroup;
}

export const ALL_CREATOR_BADGES: BadgeItem[] = [
  // ── Trust & verification ───────────────────────────────────────────────────
  {
    id: 'b-3',
    icon: '🌍',
    title: 'UK Residency Verified',
    description: 'Identity and proof of UK residency verified by Diaspora compliance.',
    status: 'verified',
    statusText: 'VERIFIED',
    group: 'trust',
  },
  {
    id: 'b-13',
    icon: '📱',
    title: 'Phone Verified',
    description: 'Confirmed your number, which is what keeps your account yours.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'trust',
  },
  {
    id: 'b-14',
    icon: '🪪',
    title: 'Identity Confirmed',
    description: 'Completed the biometric identity check.',
    status: 'in_progress',
    statusText: 'IN PROGRESS',
    group: 'trust',
  },
  {
    id: 'b-11',
    icon: '🚀',
    title: 'Early Expat Pioneer',
    description: 'Joined Diaspora during early beta launch phase.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'trust',
  },

  // ── Writing & guides ───────────────────────────────────────────────────────
  {
    id: 'b-1',
    icon: '🏆',
    title: 'First Guide Created',
    description: 'Published your first verified community relocation guide.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'creating',
  },
  {
    id: 'b-2',
    icon: '❤️',
    title: '100 Helpful Votes',
    description: 'Received 100+ helpful votes from London diaspora members.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'creating',
  },
  {
    id: 'b-4',
    icon: '🌟',
    title: 'Expert Contributor',
    description: 'Maintained a 90%+ community satisfaction score across 20+ posts.',
    status: 'level',
    statusText: 'LEVEL 3',
    group: 'creating',
  },
  {
    id: 'b-9',
    icon: '🔥',
    title: '5-Day Creator Streak',
    description: 'Active on Creator Studio for 5 consecutive days.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'creating',
  },
  {
    id: 'b-15',
    icon: '📚',
    title: 'Evergreen Author',
    description: 'A guide of yours has stayed accurate and useful for a year.',
    status: 'locked',
    statusText: 'LOCKED',
    progress: '4 / 12 months',
    group: 'creating',
  },
  {
    id: 'b-16',
    icon: '🎓',
    title: 'Academy Graduate',
    description: 'Finished a Creator Academy course.',
    status: 'in_progress',
    statusText: 'IN PROGRESS',
    progress: '2 / 5 lessons',
    group: 'creating',
  },
  {
    id: 'b-17',
    icon: '🗺️',
    title: 'Local Cartographer',
    description: 'Added ten places to the map that other members went on to use.',
    status: 'locked',
    statusText: 'LOCKED',
    progress: '3 / 10 places',
    group: 'creating',
  },

  // ── Community life ─────────────────────────────────────────────────────────
  {
    id: 'b-18',
    icon: '🎉',
    title: 'First Event',
    description: 'Attended a community event you found on Diaspora.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'community',
  },
  {
    id: 'b-19',
    icon: '📣',
    title: 'Host',
    description: 'Ran an event of your own that other members came to.',
    status: 'locked',
    statusText: 'LOCKED',
    group: 'community',
  },
  {
    id: 'b-20',
    icon: '🗳️',
    title: 'Had Your Say',
    description: 'Voted in a community poll.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'community',
  },
  {
    id: 'b-21',
    icon: '🙌',
    title: 'Volunteer',
    description: 'Took a volunteering shift and turned up for it.',
    status: 'in_progress',
    statusText: 'IN PROGRESS',
    progress: '1 / 3 shifts',
    group: 'community',
  },
  {
    id: 'b-22',
    icon: '🏛️',
    title: 'Member',
    description: 'Joined a community organisation as a paying member.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'community',
  },
  {
    id: 'b-12',
    icon: '🤝',
    title: 'Community Mentor',
    description: 'Directly mentored 10 newcomers through GP & BRP setup.',
    status: 'locked',
    statusText: 'LOCKED',
    progress: '3 / 10 mentees',
    group: 'community',
  },

  // ── Housing, jobs & marketplace ────────────────────────────────────────────
  {
    id: 'b-6',
    icon: '🏠',
    title: 'Housing Host',
    description: 'Listed verified diaspora housing accommodation.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'living',
  },
  {
    id: 'b-7',
    icon: '💼',
    title: 'Career Pioneer',
    description: 'Posted job openings with visa sponsorship for diaspora members.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'living',
  },
  {
    id: 'b-8',
    icon: '🛒',
    title: 'Trusted Seller',
    description: 'Completed 10+ verified marketplace transactions with 5-star ratings.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'living',
  },
  {
    id: 'b-23',
    icon: '🔑',
    title: 'Settled In',
    description: 'Found a home through Diaspora and confirmed you moved in.',
    status: 'locked',
    statusText: 'LOCKED',
    group: 'living',
  },
  {
    id: 'b-24',
    icon: '♻️',
    title: 'Passed It On',
    description: 'Gave something away free, or swapped rather than sold.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'living',
  },
  {
    id: 'b-25',
    icon: '📄',
    title: 'First Application',
    description: 'Applied for a role through Diaspora with your verified profile.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'living',
  },

  // ── Wallet & giving ────────────────────────────────────────────────────────
  {
    id: 'b-26',
    icon: '👛',
    title: 'Wallet Opened',
    description: 'Set up your Diaspora wallet.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'money',
  },
  {
    id: 'b-27',
    icon: '🎁',
    title: 'Gave Back',
    description: 'Donated to a community fundraiser.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'money',
  },
  {
    id: 'b-28',
    icon: '✨',
    title: 'Points Converted',
    description: 'Turned contribution points into wallet balance for the first time.',
    status: 'in_progress',
    statusText: 'IN PROGRESS',
    progress: '150 / 300 pts',
    group: 'money',
  },
  {
    id: 'b-29',
    icon: '📈',
    title: 'Promoted',
    description: 'Ran a promotion to put your listing in front of more people.',
    status: 'locked',
    statusText: 'LOCKED',
    group: 'money',
  },

  // ── Looking after the place ────────────────────────────────────────────────
  {
    id: 'b-5',
    icon: '💬',
    title: 'Active Moderator',
    description: 'Participated in community moderation reviews to protect trust.',
    status: 'in_progress',
    statusText: 'IN PROGRESS',
    progress: '14 / 20 reviews',
    group: 'stewardship',
  },
  {
    id: 'b-10',
    icon: '🛡️',
    title: 'Community Guardian',
    description: 'Flagged 5 inaccurate or duplicate listings to protect community.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'stewardship',
  },
  {
    id: 'b-30',
    icon: '🔔',
    title: 'Early Warning',
    description: 'Posted a community alert that members confirmed as accurate.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'stewardship',
  },
  {
    id: 'b-31',
    icon: '🤖',
    title: 'Set It And Forgot It',
    description: 'Created an automation to watch for something on your behalf.',
    status: 'locked',
    statusText: 'LOCKED',
    group: 'stewardship',
  },
  {
    id: 'b-32',
    icon: '🧭',
    title: 'Showed Someone Round',
    description: 'Answered a newcomer question that they marked as helpful.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
    group: 'stewardship',
  },
];

/** Badges the member has. `verified` and `level` count — both are earned. */
export const isBadgeEarned = (badge: BadgeItem): boolean =>
  badge.status === 'unlocked' || badge.status === 'verified' || badge.status === 'level';

export const earnedBadges = (badges: BadgeItem[] = ALL_CREATOR_BADGES) =>
  badges.filter(isBadgeEarned);

export const badgesInGroup = (group: BadgeGroup, badges: BadgeItem[] = ALL_CREATOR_BADGES) =>
  badges.filter((badge) => badge.group === group);
